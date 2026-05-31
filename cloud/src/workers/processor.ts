import { Worker, type Job, type ConnectionOptions } from 'bullmq';
import { prisma } from '../db.js';
import { logger } from '../observability/logger.js';
import { onShutdown } from '../observability/lifecycle.js';
import { maybeAgentRegistry } from '../agents/AgentRegistry.js';
import { getAgentRunner } from '../agents/AgentRunner.js';
import type { AgentContext } from '../agents/types.js';
import { AGENTS_QUEUE, type AgentJobName, type TickPayload } from './queues.js';

/**
 * BullMQ Worker that drains the agents-scheduled queue.
 *
 * Per tick:
 *   1. Resolve the eligible user set for the agent (cheap Postgres query).
 *   2. For each user, build an AgentContext with trigger='scheduled' and call
 *      AgentRunner.runOne(). Guardian enforces pause / cap / quiet-hours, so
 *      the worker stays a dumb fan-out: it iterates, the runner decides.
 *   3. Bounded concurrency (USERS_PER_TICK_CONCURRENCY) so one tick does not
 *      flood the DB pool or burn the LLM budget for a whole region in
 *      parallel. Sequential within each user (one agent at a time).
 *
 * Errors per user are logged + recorded as AgentRun.failed by the runner —
 * never re-thrown, so one bad user can't kill the tick. The job itself only
 * fails on an outer infrastructure error (DB down, registry missing).
 */

const USERS_PER_TICK_CONCURRENCY = 5;
/** Safety ceiling — don't enumerate more than this many users per tick. */
const MAX_USERS_PER_TICK = 1000;

let worker: Worker<TickPayload, void, string> | null = null;

export function bootProcessor(connection: ConnectionOptions): Worker<TickPayload, void, string> {
  if (worker) return worker;

  const w = new Worker<TickPayload, void, string>(
    AGENTS_QUEUE,
    async (job) => {
      const name = job.name as AgentJobName;
      switch (name) {
        case 'curator-tick':
          await runCuratorTick(job);
          return;
        case 'concierge-sweep-tick':
          await runConciergeSweepTick(job);
          return;
        default:
          // Exhaustive — TS will flag if a new AgentJobName is added.
          throw new Error(`unknown tick job: ${String(job.name)}`);
      }
    },
    { connection, concurrency: 2 },
  );
  worker = w;

  w.on('completed', (job) => {
    logger.info({ jobId: job.id, name: job.name }, 'tick completed');
  });
  w.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, name: job?.name, err: err.message }, 'tick failed');
  });

  onShutdown(async () => {
    if (worker) {
      await worker.close().catch(() => {});
      worker = null;
    }
  });

  logger.info('agent tick processor started');
  return w;
}

// ── Tick handlers ──────────────────────────────────────────────────────────

async function runCuratorTick(job: Job<TickPayload, void, string>): Promise<void> {
  const agent = maybeAgentRegistry()?.byName('curator');
  if (!agent) {
    logger.warn('curator tick: agent registry not booted, skipping');
    return;
  }
  const userIds = await eligibleUsersForCurator();
  await fanOut(userIds, async (userId) => {
    const ctx: AgentContext = {
      userId,
      trigger: 'scheduled',
      now: new Date(),
    };
    const status = await getAgentRunner().runOne(agent, ctx);
    logger.debug({ userId, agent: 'curator', status }, 'curator tick processed user');
  });
  logger.info({ jobId: job.id, users: userIds.length }, 'curator tick fan-out done');
}

async function runConciergeSweepTick(job: Job<TickPayload, void, string>): Promise<void> {
  const agent = maybeAgentRegistry()?.byName('concierge');
  if (!agent) {
    logger.warn('concierge tick: agent registry not booted, skipping');
    return;
  }
  const userIds = await eligibleUsersForConcierge();
  await fanOut(userIds, async (userId) => {
    const ctx: AgentContext = {
      userId,
      trigger: 'scheduled',
      now: new Date(),
    };
    const status = await getAgentRunner().runOne(agent, ctx);
    logger.debug({ userId, agent: 'concierge', status }, 'concierge sweep processed user');
  });
  logger.info({ jobId: job.id, users: userIds.length }, 'concierge sweep fan-out done');
}

// ── Eligibility queries ────────────────────────────────────────────────────

/**
 * Curator targets every user that's either explicitly subscribed or has had
 * any agent activity in the last 60 days (proxy for "active user"). The
 * agent's run() returns 'skipped' for users with no trails — we don't try to
 * pre-filter on the graph here because that requires a Neo4j hop per user
 * and the daily cadence makes a Postgres-only enumeration cheap enough.
 */
async function eligibleUsersForCurator(): Promise<string[]> {
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const [activeSubs, recentRuns] = await Promise.all([
    prisma.agentSubscription.findMany({
      where: { agent: 'curator', enabled: true, pausedAt: null },
      select: { userId: true },
      take: MAX_USERS_PER_TICK,
    }),
    prisma.agentRun.findMany({
      where: { startedAt: { gte: since } },
      distinct: ['userId'],
      select: { userId: true },
      take: MAX_USERS_PER_TICK,
    }),
  ]);
  const ids = new Set<string>();
  for (const r of activeSubs) ids.add(r.userId);
  for (const r of recentRuns) ids.add(r.userId);
  return Array.from(ids).slice(0, MAX_USERS_PER_TICK);
}

/**
 * Concierge only sweeps users with at least one WatchlistItem — the agent's
 * `canRun` short-circuits otherwise, so enumerating other users just burns
 * DB queries. Bounded by MAX_USERS_PER_TICK as a safety ceiling.
 */
async function eligibleUsersForConcierge(): Promise<string[]> {
  const rows = await prisma.watchlistItem.findMany({
    distinct: ['userId'],
    select: { userId: true },
    take: MAX_USERS_PER_TICK,
  });
  return rows.map((r) => r.userId);
}

// ── Bounded-concurrency fan-out ────────────────────────────────────────────

async function fanOut<T>(items: T[], handler: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(USERS_PER_TICK_CONCURRENCY, items.length) }, () =>
    (async () => {
      while (cursor < items.length) {
        const idx = cursor++;
        const item = items[idx]!;
        try {
          await handler(item);
        } catch (err) {
          // AgentRunner already records failed runs; this catch is a belt
          // for any thrown error outside the runner (e.g. registry hiccup).
          logger.error({ err }, 'fanOut handler threw');
        }
      }
    })(),
  );
  await Promise.all(workers);
}
