import { Queue, QueueEvents, type ConnectionOptions } from 'bullmq';
import { logger } from '../observability/logger.js';
import { onShutdown } from '../observability/lifecycle.js';

/**
 * BullMQ queue layer for scheduled agent ticks.
 *
 * One queue with two job names keeps the operational surface small: a single
 * Worker process can drain both `curator-tick` and `concierge-sweep-tick`
 * without coordinating across queues. Per-user fan-out happens inside the
 * processor (see processor.ts), not via additional jobs, because at v1 scale
 * (<1k active users) the overhead of one-job-per-user is not worth the
 * complexity of two-stage queues.
 */

export const AGENTS_QUEUE = 'agents-scheduled';

export type AgentJobName =
  | 'curator-tick'
  | 'concierge-sweep-tick'
  | 'synthesist-weekly-tick'
  | 'tenant-usage-rollup-tick'
  | 'email-weekly-digest-tick';

export interface TickPayload {
  /** ISO timestamp the tick was scheduled for — propagates into AgentContext.now. */
  scheduledAt: string;
}

let queue: Queue<TickPayload, void, string> | null = null;
let events: QueueEvents | null = null;

export function getAgentsQueue(connection: ConnectionOptions): Queue<TickPayload, void, string> {
  if (queue) return queue;

  const q = new Queue<TickPayload, void, string>(AGENTS_QUEUE, {
    connection,
    defaultJobOptions: {
      // Tick jobs are idempotent (Guardian + dedupeKey handle duplicates); a
      // single retry covers transient Redis/DB hiccups without spamming.
      attempts: 2,
      backoff: { type: 'exponential', delay: 30_000 },
      // Keep tick history bounded so the queue doesn't grow unbounded.
      removeOnComplete: { age: 7 * 24 * 60 * 60, count: 200 },
      removeOnFail: { age: 30 * 24 * 60 * 60, count: 200 },
    },
  });
  queue = q;

  events = new QueueEvents(AGENTS_QUEUE, { connection });
  events.on('failed', ({ jobId, failedReason }) => {
    logger.warn({ jobId, failedReason }, 'agents-scheduled job failed');
  });

  onShutdown(async () => {
    if (events) await events.close().catch(() => {});
    if (queue) await queue.close().catch(() => {});
    queue = null;
    events = null;
  });

  return q;
}
