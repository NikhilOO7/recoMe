import { prisma } from '../db.js';
import { logger } from '../observability/logger.js';
import { getAgentEventStore } from './AgentEventStore.js';
import { getGuardian } from './GuardianAgent.js';
import type { BaseAgent } from './BaseAgent.js';
import type { AgentContext, AgentRunStatus } from './types.js';

/**
 * The lifecycle wrapper around every agent invocation.
 *
 *   1. `canRun()` — cheap pre-check; skip silently if false.
 *   2. Guardian check — opt-in, throttle, daily cost cap, quiet hours.
 *      Capping records an AgentRun with status='capped' for audit.
 *   3. Run agent → on success, dedupe-insert AgentEvent.
 *   4. Record AgentRun (always, even on failure) for the audit log.
 *
 * Errors thrown by the agent bubble into a 'failed' AgentRun with the
 * error string in `meta` — they are never re-thrown to the caller, so
 * one broken agent cannot poison a request that triggered N agents.
 */
export class AgentRunner {
  async runOne(agent: BaseAgent, ctx: AgentContext): Promise<AgentRunStatus> {
    // 1) canRun
    let canRun = true;
    try {
      canRun = await agent.canRun(ctx);
    } catch (err) {
      logger.warn({ err, agent: agent.name, userId: ctx.userId }, 'agent canRun threw');
      canRun = false;
    }
    if (!canRun) return 'skipped';

    // 2) Guardian
    const guardian = getGuardian();
    const decision = await guardian.check(agent.name, ctx);
    if (!decision.allow) {
      await this.persistRun(agent.name, ctx, {
        status: decision.status,
        meta: { reason: decision.reason },
      });
      return decision.status;
    }

    // 3) Run + emit
    const startedAt = new Date();
    try {
      const result = await agent.run(ctx);
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();

      if (result.status === 'failed') {
        await this.persistRun(agent.name, ctx, {
          status: 'failed',
          startedAt,
          finishedAt,
          meta: { error: result.error, durationMs },
        });
        return 'failed';
      }

      if (result.status === 'skipped') {
        await this.persistRun(agent.name, ctx, {
          status: 'skipped',
          startedAt,
          finishedAt,
          llmTokens: result.llmTokens,
          costMicros: result.costMicros,
          meta: { reason: result.reason, durationMs },
        });
        return 'skipped';
      }

      // Succeeded → try to emit (dedupe may suppress)
      const eventId = await getAgentEventStore().insert(ctx.userId, agent.name, result.emit);
      if (eventId) {
        await guardian.recordEmission(ctx.userId, agent.name, finishedAt);
      }
      await this.persistRun(agent.name, ctx, {
        status: 'succeeded',
        startedAt,
        finishedAt,
        llmTokens: result.llmTokens,
        costMicros: result.costMicros,
        meta: {
          eventId,
          dedupeKey: result.emit.dedupeKey,
          suppressed: eventId === null,
          durationMs,
        },
      });
      return 'succeeded';
    } catch (err) {
      const finishedAt = new Date();
      logger.error({ err, agent: agent.name, userId: ctx.userId }, 'agent run threw');
      await this.persistRun(agent.name, ctx, {
        status: 'failed',
        startedAt,
        finishedAt,
        meta: { error: err instanceof Error ? err.message : String(err) },
      });
      return 'failed';
    }
  }

  private async persistRun(
    agentName: string,
    ctx: AgentContext,
    opts: {
      status: AgentRunStatus;
      startedAt?: Date;
      finishedAt?: Date;
      llmTokens?: number;
      costMicros?: number;
      meta?: Record<string, unknown>;
    },
  ): Promise<void> {
    try {
      await prisma.agentRun.create({
        data: {
          userId: ctx.userId,
          agent: agentName,
          trigger: ctx.trigger,
          status: opts.status,
          llmTokens: opts.llmTokens ?? 0,
          costMicros: opts.costMicros ?? 0,
          startedAt: opts.startedAt ?? new Date(),
          finishedAt: opts.finishedAt,
          meta: opts.meta as unknown as object,
        },
      });
    } catch (err) {
      // Audit-log persistence failures should never break the agent
      // surface — they imply a DB problem worth investigating but the
      // event itself (if any) was already inserted.
      logger.error({ err, agent: agentName, userId: ctx.userId }, 'AgentRun persist failed');
    }
  }
}

let svc: AgentRunner | null = null;
export function getAgentRunner(): AgentRunner {
  if (!svc) svc = new AgentRunner();
  return svc;
}
