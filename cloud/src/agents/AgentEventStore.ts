import { prisma } from '../db.js';
import type { AgentEmission } from './types.js';
import { logger } from '../observability/logger.js';
import { getPushService } from '../notifications/PushService.js';

/**
 * Persists AgentEvents with dedupe. The (userId, dedupeKey) window
 * suppresses repeats within 24h — this is what stops Recall from
 * surfacing the same forgotten signal every time the user captures
 * anything related to its topic.
 */
export class AgentEventStore {
  /** TTL the dedupe window. Configurable per-call for future per-agent tuning. */
  private readonly defaultDedupeWindowMs = 24 * 60 * 60 * 1000;

  /**
   * Insert an event unless an event with the same (userId, dedupeKey)
   * was created within `dedupeWindowMs`. Returns the created event id
   * on success, null if suppressed.
   */
  async insert(
    userId: string,
    agent: string,
    emit: AgentEmission,
    dedupeWindowMs: number = this.defaultDedupeWindowMs,
  ): Promise<string | null> {
    const cutoff = new Date(Date.now() - dedupeWindowMs);
    const dup = await prisma.agentEvent.findFirst({
      where: { userId, dedupeKey: emit.dedupeKey, createdAt: { gte: cutoff } },
      select: { id: true },
    });
    if (dup) {
      logger.debug(
        { userId, agent, dedupeKey: emit.dedupeKey },
        'agent event suppressed by dedupe',
      );
      return null;
    }
    const row = await prisma.agentEvent.create({
      data: {
        userId,
        agent,
        kind: emit.kind,
        title: emit.title,
        body: emit.body,
        actionUrl: emit.actionUrl,
        // Prisma JSON columns accept arrays directly; cast keeps tsc happy
        // under the strict generated client typings.
        sources: emit.sources as unknown as object,
        dedupeKey: emit.dedupeKey,
      },
      select: { id: true },
    });

    // Best-effort push delivery (D6 — this call site was documented in
    // PushService but never existed, so subscriptions accumulated and
    // nothing was ever sent). Fire-and-forget: a push failure must never
    // affect the emission path.
    void getPushService()
      .notifyUser(userId, {
        title: emit.title,
        ...(emit.body ? { body: emit.body.slice(0, 300) } : {}),
        ...(emit.actionUrl ? { url: emit.actionUrl } : {}),
        eventId: row.id,
      })
      .catch((err) => logger.warn({ err, userId, agent }, 'push delivery failed'));

    return row.id;
  }

  async listForUser(
    userId: string,
    opts: { limit?: number; since?: Date; onlyUnseen?: boolean } = {},
  ) {
    const limit = Math.min(opts.limit ?? 30, 100);
    return prisma.agentEvent.findMany({
      where: {
        userId,
        ...(opts.since ? { createdAt: { gte: opts.since } } : {}),
        ...(opts.onlyUnseen ? { seenAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async markSeen(userId: string, eventId: string): Promise<void> {
    // Tenant-safe: scope by userId so a forged eventId from another user can't be flipped.
    await prisma.agentEvent.updateMany({
      where: { id: eventId, userId, seenAt: null },
      data: { seenAt: new Date() },
    });
  }

  async recordFeedback(
    userId: string,
    eventId: string,
    feedback: 'useful' | 'not_useful',
  ): Promise<void> {
    await prisma.agentEvent.updateMany({
      where: { id: eventId, userId },
      data: { feedback, feedbackAt: new Date() },
    });
  }
}

let svc: AgentEventStore | null = null;
export function getAgentEventStore(): AgentEventStore {
  if (!svc) svc = new AgentEventStore();
  return svc;
}
