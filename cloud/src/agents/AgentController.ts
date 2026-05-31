import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { prisma } from '../db.js';
import { getAgentEventStore } from './AgentEventStore.js';
import { getGuardian } from './GuardianAgent.js';
import { maybeAgentRegistry } from './AgentRegistry.js';
import { getAgentRunner } from './AgentRunner.js';
import type { AgentContext, AgentTrigger } from './types.js';
import { logger } from '../observability/logger.js';
import { listWatchlist, addWatchlistItem, removeWatchlistItem } from './concierge/Watchlist.js';

// ── Consumer surface for active agents ──────────────────────────────────────
// Mounted under /intelligence/agents + /intelligence/inbox by the
// IntelligenceController. Always JWT-authed; tenant-scoped views for IaaS
// callers go under /v1/agents/* in a later milestone (ADR-0012 §7).

type AuthVars = { Variables: { userId: string; tier?: string; deviceId?: string } };

const feedbackSchema = z.object({ feedback: z.enum(['useful', 'not_useful']) });
const pauseSchema = z.object({ reason: z.string().max(120).optional() });

export function createAgentRoutes(): Hono<AuthVars> {
  const app = new Hono<AuthVars>();
  app.use('*', authMiddleware);

  // ── GET /agents — list all registered agents + this user's subscription state.
  app.get('/agents', async (c) => {
    const userId = c.get('userId');
    const registry = maybeAgentRegistry();
    if (!registry) {
      return c.json({ enabled: false, agents: [] });
    }

    const subs = await prisma.agentSubscription.findMany({
      where: { userId },
      select: {
        agent: true,
        enabled: true,
        pausedAt: true,
        pausedReason: true,
        lastRunAt: true,
        lastEmittedAt: true,
      },
    });
    const subByName = new Map(subs.map((s) => [s.agent, s]));

    const agents = registry.all().map((a) => {
      const sub = subByName.get(a.name);
      return {
        name: a.name,
        displayName: a.displayName,
        triggers: a.triggers,
        enabled: sub?.enabled ?? true, // default-on
        paused: !!sub?.pausedAt,
        pausedReason: sub?.pausedReason ?? null,
        lastRunAt: sub?.lastRunAt ?? null,
        lastEmittedAt: sub?.lastEmittedAt ?? null,
      };
    });

    return c.json({ enabled: true, agents });
  });

  // ── POST /agents/:name/pause — soft-pause an agent for this user.
  app.post('/agents/:name/pause', async (c) => {
    const userId = c.get('userId');
    const name = c.req.param('name');
    const registry = maybeAgentRegistry();
    if (!registry?.byName(name)) return c.json({ error: 'unknown_agent' }, 404);

    const body = pauseSchema.safeParse(await c.req.json().catch(() => ({})));
    const reason = body.success ? (body.data.reason ?? 'user_paused') : 'user_paused';
    await getGuardian().pause(userId, name, reason);
    return c.json({ ok: true, agent: name, paused: true, reason });
  });

  // ── POST /agents/:name/resume — resume after a pause.
  app.post('/agents/:name/resume', async (c) => {
    const userId = c.get('userId');
    const name = c.req.param('name');
    const registry = maybeAgentRegistry();
    if (!registry?.byName(name)) return c.json({ error: 'unknown_agent' }, 404);

    await getGuardian().resume(userId, name);
    return c.json({ ok: true, agent: name, paused: false });
  });

  // ── POST /agents/:name/run — fire one pass for this user, on-demand.
  // This is the surface that:
  //   • a Fly scheduled command can hit on a cron (1×/day Curator)
  //   • the Wave-3 Agents UI uses for the "run now" button
  //   • the Decision agent uses by default (its native trigger mode)
  // The agent's canRun() decides whether the trigger is valid for it.
  app.post('/agents/:name/run', async (c) => {
    const userId = c.get('userId');
    const name = c.req.param('name');
    const registry = maybeAgentRegistry();
    const agent = registry?.byName(name);
    if (!agent) return c.json({ error: 'unknown_agent' }, 404);

    // Default trigger = the first one the agent declares it supports.
    // Callers can override via ?trigger=… for flexibility (an external cron
    // calls ?trigger=scheduled; a UI button calls ?trigger=on_demand).
    const validTriggers: ReadonlyArray<AgentTrigger> = ['scheduled', 'event', 'on_demand'];
    const requested = c.req.query('trigger') as AgentTrigger | undefined;
    const trigger: AgentTrigger =
      requested && validTriggers.includes(requested)
        ? requested
        : (agent.triggers[0] ?? 'on_demand');

    // Extension-driven workflows (Phase 3) pass an event payload as the JSON
    // body so server-side agents can match the same shape as the synthetic
    // signalIngestTrigger payload. canRun() validates the shape.
    const body = (await c.req.json().catch(() => null)) as {
      event?: Record<string, unknown>;
    } | null;

    const ctx: AgentContext = {
      userId,
      trigger,
      now: new Date(),
      ...(body?.event ? { event: body.event } : {}),
    };
    const status = await getAgentRunner().runOne(agent, ctx);
    logger.info({ userId, agent: name, trigger, status }, 'agent run on demand');
    return c.json({ ok: true, agent: name, trigger, status });
  });

  // ── POST /agents/decision/stream — SSE stream of a Decision run.
  //
  // Streams the body in word-ish chunks so the extension OverlayChat + web
  // /ask AdvisorPanel render token-by-token. v1 is deterministic (cost:
  // 0 LLM tokens, matches Guardian's daily cap on the route as `/run`).
  // Real LLM streaming swaps DecisionAgent.runStream() inner loop without
  // touching the client protocol.
  //
  // Protocol per message:
  //   data: <text-chunk>\n\n              ← appended to the assistant turn
  //   data: __meta__:{"sources":…}\n\n    ← final envelope (citations etc)
  //   data: [DONE]\n\n                    ← close marker
  app.post('/agents/decision/stream', async (c) => {
    const userId = c.get('userId');
    const registry = maybeAgentRegistry();
    const agent = registry?.byName('decision');
    if (!agent) return c.json({ error: 'unknown_agent' }, 404);

    const body = (await c.req.json().catch(() => null)) as {
      event?: Record<string, unknown>;
    } | null;
    const ctx: AgentContext = {
      userId,
      trigger: 'on_demand',
      now: new Date(),
      ...(body?.event ? { event: body.event } : {}),
    };

    // Type-narrow to the concrete DecisionAgent so we can call runStream.
    // Falls back to a single non-streamed chunk if the agent doesn't expose it.
    const streamable = agent as unknown as {
      runStream?: (ctx: AgentContext) => AsyncIterable<string>;
    };
    if (!streamable.runStream) {
      return c.json({ error: 'agent_not_streamable' }, 501);
    }

    return streamSSE(c, async (stream) => {
      try {
        for await (const chunk of streamable.runStream!(ctx)) {
          await stream.writeSSE({ data: chunk });
        }
      } catch (err) {
        logger.error({ err, userId, agent: 'decision' }, 'decision stream failed');
        await stream.writeSSE({ data: '__meta__:{"error":"stream_failed"}' });
      } finally {
        await stream.writeSSE({ data: '[DONE]' });
      }
    });
  });

  // ── GET /agents/:name/runs — recent AgentRun records (audit + UI).
  app.get('/agents/:name/runs', async (c) => {
    const userId = c.get('userId');
    const name = c.req.param('name');
    const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10) || 20, 100);
    const registry = maybeAgentRegistry();
    if (!registry?.byName(name)) return c.json({ error: 'unknown_agent' }, 404);

    const runs = await prisma.agentRun.findMany({
      where: { userId, agent: name },
      orderBy: { startedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        agent: true,
        trigger: true,
        status: true,
        llmTokens: true,
        costMicros: true,
        startedAt: true,
        finishedAt: true,
        meta: true,
      },
    });
    return c.json({ runs });
  });

  // ── GET /agents/budget — daily spend + per-agent breakdown for the UI.
  // The Wave-3 management page calls this to render budget meters per ADR-0012 §4.
  app.get('/agents/budget', async (c) => {
    const userId = c.get('userId');
    const now = Date.now();
    const since = new Date(now - 24 * 60 * 60 * 1000);

    const grouped = await prisma.agentRun.groupBy({
      by: ['agent'],
      where: { userId, startedAt: { gte: since } },
      _sum: { costMicros: true, llmTokens: true },
      _count: { _all: true },
    });

    // Default cap mirrors GuardianAgent.DEFAULT_DAILY_COST_CAP_MICROS — we
    // expose it so the UI can render the meter at the same threshold the
    // backend enforces. Keep these in lockstep with GuardianAgent constants.
    const dailyCapMicros = 100_000; // $0.10

    const perAgent = grouped.map((g) => ({
      agent: g.agent,
      runsLast24h: g._count._all,
      spendMicrosLast24h: g._sum.costMicros ?? 0,
      llmTokensLast24h: g._sum.llmTokens ?? 0,
    }));
    const totalSpendMicros = perAgent.reduce((s, g) => s + g.spendMicrosLast24h, 0);

    return c.json({
      since: since.toISOString(),
      dailyCapMicros,
      totalSpendMicros,
      perAgent,
    });
  });

  // ── Concierge Watchlist (Phase-4 surface for the agents page).
  // Persistence is in-memory until ADR-0017 lands. Endpoints are stable.

  const watchlistInputSchema = z.object({
    label: z.string().min(1).max(200),
    targetPriceUsd: z.number().positive().max(1_000_000).optional(),
    retailers: z.array(z.string().min(1).max(60)).max(8).optional(),
    pageUrl: z.string().url().optional(),
  });

  app.get('/agents/concierge/watchlist', async (c) => {
    const userId = c.get('userId');
    return c.json({ items: await listWatchlist(userId) });
  });

  app.post('/agents/concierge/watchlist', async (c) => {
    const userId = c.get('userId');
    const body = watchlistInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: 'invalid_watchlist_item', details: body.error.flatten() }, 400);
    }
    const item = await addWatchlistItem(userId, body.data);
    return c.json({ item }, 201);
  });

  app.delete('/agents/concierge/watchlist/:id', async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');
    const removed = await removeWatchlistItem(userId, id);
    return removed ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404);
  });

  // ── GET /inbox — surfaced agent events for this user.
  app.get('/inbox', async (c) => {
    const userId = c.get('userId');
    const limit = Math.min(parseInt(c.req.query('limit') ?? '30', 10) || 30, 100);
    const onlyUnseen = c.req.query('unseen') === '1';
    const since = c.req.query('since') ? new Date(c.req.query('since')!) : undefined;
    const events = await getAgentEventStore().listForUser(userId, { limit, since, onlyUnseen });
    return c.json({ events });
  });

  // ── POST /inbox/:id/seen — mark an event seen (idempotent).
  app.post('/inbox/:id/seen', async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');
    await getAgentEventStore().markSeen(userId, id);
    return c.json({ ok: true });
  });

  // ── POST /inbox/:id/feedback — useful / not_useful rating.
  app.post('/inbox/:id/feedback', async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');
    const body = feedbackSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: 'invalid_feedback', details: body.error.flatten() }, 400);
    }
    await getAgentEventStore().recordFeedback(userId, id, body.data.feedback);
    logger.info({ userId, id, feedback: body.data.feedback }, 'agent event feedback');
    return c.json({ ok: true });
  });

  return app;
}
