import { prisma } from '../db.js';
import type { AgentContext, GuardianDecision } from './types.js';
import { logger } from '../observability/logger.js';

/**
 * GuardianAgent — enforces the hard constraints from ADR-0012 §5.
 *
 * This is the file the 2026-05-14 audit called out as a no-op. It now
 * has real teeth:
 *
 *   1. Per-user, per-day total LLM cost ceiling (hard cap).
 *   2. Per-agent emission throttle (e.g. Recall ≤ 2/week).
 *   3. Opt-in / pause state (AgentSubscription).
 *   4. Quiet-hours filter — emissions during 22:00–08:00 user-local are
 *      held and surfaced in the morning digest (timezone is best-effort
 *      via subscription config; defaults to UTC if unset).
 *
 * Decisions are returned as data, not exceptions, so the runner can
 * record a structured AgentRun with status='capped'.
 */

// ── Defaults (overridable per subscription.config) ──────────────────────────

const DEFAULT_DAILY_COST_CAP_MICROS = 100_000; // $0.10 per user per day
const DEFAULT_RECALL_MIN_GAP_HOURS = 84; // ~2/wk = at most one every 3.5 days

// Per-agent throttle in hours. Absent → no throttle (Guardian only enforces
// the daily cost cap for unlisted agents). Keep in lockstep with ADR-0012.
const AGENT_MIN_GAP_HOURS: Readonly<Record<string, number>> = {
  recall: DEFAULT_RECALL_MIN_GAP_HOURS,
  // concierge / curator / synthesist get their own values when shipped
};

interface GuardianConfig {
  dailyCostCapMicros?: number;
  quietHoursStart?: number; // 0–23, user-local
  quietHoursEnd?: number;
  timezone?: string;
}

export class GuardianAgent {
  /**
   * Run-time pre-check. Called BEFORE the agent's run().
   * Returns `{ allow: true }` to proceed, `{ allow: false, ... }` to block.
   */
  async check(
    agentName: string,
    ctx: AgentContext,
    config: GuardianConfig = {},
  ): Promise<GuardianDecision> {
    const { userId, now, trigger } = ctx;

    // 1) Subscription / pause check.
    const sub = await prisma.agentSubscription.findUnique({
      where: { userId_agent: { userId, agent: agentName } },
    });
    if (sub && sub.enabled === false) {
      return { allow: false, status: 'capped', reason: 'agent disabled for user' };
    }
    if (sub?.pausedAt && trigger !== 'on_demand') {
      // On-demand bypasses pause — the user explicitly asked.
      return { allow: false, status: 'capped', reason: `paused: ${sub.pausedReason ?? 'user'}` };
    }

    // 2) Per-agent throttle (e.g. Recall ≤ 2/wk).
    const minGapHours = AGENT_MIN_GAP_HOURS[agentName];
    if (minGapHours && sub?.lastEmittedAt && trigger !== 'on_demand') {
      const sinceLastH = (now.getTime() - sub.lastEmittedAt.getTime()) / 36e5;
      if (sinceLastH < minGapHours) {
        return {
          allow: false,
          status: 'capped',
          reason: `throttle: ${sinceLastH.toFixed(1)}h since last emit, need ${minGapHours}h`,
        };
      }
    }

    // 3) Daily cost ceiling — sum costMicros from AgentRun in the last 24h.
    const dailyCap = config.dailyCostCapMicros ?? DEFAULT_DAILY_COST_CAP_MICROS;
    if (dailyCap > 0) {
      const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const agg = await prisma.agentRun.aggregate({
        where: { userId, startedAt: { gte: since } },
        _sum: { costMicros: true },
      });
      const spent = agg._sum.costMicros ?? 0;
      if (spent >= dailyCap) {
        return {
          allow: false,
          status: 'capped',
          reason: `daily cost cap hit: ${spent}/${dailyCap} micros`,
        };
      }
    }

    // 4) Quiet hours — only suppresses background emissions, not on_demand.
    if (trigger !== 'on_demand' && this.isInQuietHours(now, config)) {
      return {
        allow: false,
        status: 'capped',
        reason: 'quiet hours — will hold for morning digest',
      };
    }

    return { allow: true };
  }

  /**
   * Record that an agent just emitted, so future throttle checks see it.
   * Called by AgentRunner after a successful emission.
   */
  async recordEmission(userId: string, agentName: string, at: Date = new Date()): Promise<void> {
    await prisma.agentSubscription.upsert({
      where: { userId_agent: { userId, agent: agentName } },
      update: { lastEmittedAt: at, lastRunAt: at },
      create: { userId, agent: agentName, enabled: true, lastEmittedAt: at, lastRunAt: at },
    });
  }

  async pause(userId: string, agentName: string, reason: string): Promise<void> {
    await prisma.agentSubscription.upsert({
      where: { userId_agent: { userId, agent: agentName } },
      update: { pausedAt: new Date(), pausedReason: reason },
      create: {
        userId,
        agent: agentName,
        enabled: true,
        pausedAt: new Date(),
        pausedReason: reason,
      },
    });
    logger.info({ userId, agent: agentName, reason }, 'guardian paused agent');
  }

  async resume(userId: string, agentName: string): Promise<void> {
    await prisma.agentSubscription.updateMany({
      where: { userId, agent: agentName },
      data: { pausedAt: null, pausedReason: null },
    });
  }

  /**
   * `now` is wall-clock; if a `timezone` is configured we'd convert with
   * Intl.DateTimeFormat — kept simple for v1 (UTC). Documented gap.
   */
  private isInQuietHours(now: Date, cfg: GuardianConfig): boolean {
    const start = cfg.quietHoursStart ?? 22;
    const end = cfg.quietHoursEnd ?? 8;
    if (start === end) return false; // disabled
    const h = now.getUTCHours();
    return start < end ? h >= start && h < end : h >= start || h < end;
  }
}

let svc: GuardianAgent | null = null;
export function getGuardian(): GuardianAgent {
  if (!svc) svc = new GuardianAgent();
  return svc;
}
