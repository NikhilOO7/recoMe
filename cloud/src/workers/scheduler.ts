import type { Queue } from 'bullmq';
import { logger } from '../observability/logger.js';
import type { TickPayload } from './queues.js';

/**
 * Registers the two repeating tick jobs on the queue.
 *
 * BullMQ uses Redis cron-style scheduling — the same job key is upserted on
 * every boot so a redeploy does not pile up duplicate schedules. Job IDs
 * include the cron pattern so an interval change ships a fresh schedule
 * instead of silently coexisting with the old one.
 *
 * Cron patterns (UTC):
 *   curator-tick          → 0 12 * * *   (12:00 UTC = 04:00 PT, 07:00 ET)
 *                           Single daily digest per ADR-0012 §2.2.
 *   concierge-sweep-tick  → 0 *​/6 * * *  (every 6h)
 *                           4×/day price sweep matches the ADR-0012 §2.2 budget.
 *
 * Quiet-hours suppression and per-user throttles are enforced by
 * GuardianAgent.check() inside the processor — the scheduler stays dumb.
 */

const CURATOR_CRON = '0 12 * * *';
const CONCIERGE_CRON = '0 */6 * * *';
/**
 * Tenant-usage rollup runs at 01:05 UTC daily — late enough that yesterday's
 * write-burst has settled, early enough that the daily Stripe invoice cron
 * sees the delta. Per P4.1 / ADR-0003 §2.3.
 */
const TENANT_ROLLUP_CRON = '5 1 * * *';
/**
 * Weekly email digest runs Sundays 14:00 UTC (~09:00 ET, ~07:00 MT). Single
 * timezone for v1 — per-user local-time send is a v1.1 polish that needs the
 * user's tz column populated. EmailService skips users whose lastDigestAt
 * is inside the current week-bucket, so a same-day re-run is a no-op.
 */
const WEEKLY_DIGEST_CRON = '0 14 * * 0';
/**
 * Synthesist runs Sundays 13:00 UTC — one hour BEFORE the digest tick so the
 * weekly_summary event exists when the digest email is assembled. Guardian's
 * 144h synthesist throttle makes a re-fired cron a no-op.
 */
const SYNTHESIST_CRON = '0 13 * * 0';

export async function registerSchedules(queue: Queue<TickPayload, void, string>): Promise<void> {
  await Promise.all([
    queue.upsertJobScheduler(
      `curator:${CURATOR_CRON}`,
      { pattern: CURATOR_CRON, tz: 'UTC' },
      {
        name: 'curator-tick',
        data: { scheduledAt: new Date().toISOString() },
      },
    ),
    queue.upsertJobScheduler(
      `concierge-sweep:${CONCIERGE_CRON}`,
      { pattern: CONCIERGE_CRON, tz: 'UTC' },
      {
        name: 'concierge-sweep-tick',
        data: { scheduledAt: new Date().toISOString() },
      },
    ),
    queue.upsertJobScheduler(
      `tenant-usage-rollup:${TENANT_ROLLUP_CRON}`,
      { pattern: TENANT_ROLLUP_CRON, tz: 'UTC' },
      {
        name: 'tenant-usage-rollup-tick',
        data: { scheduledAt: new Date().toISOString() },
      },
    ),
    queue.upsertJobScheduler(
      `synthesist-weekly:${SYNTHESIST_CRON}`,
      { pattern: SYNTHESIST_CRON, tz: 'UTC' },
      {
        name: 'synthesist-weekly-tick',
        data: { scheduledAt: new Date().toISOString() },
      },
    ),
    queue.upsertJobScheduler(
      `weekly-digest:${WEEKLY_DIGEST_CRON}`,
      { pattern: WEEKLY_DIGEST_CRON, tz: 'UTC' },
      {
        name: 'email-weekly-digest-tick',
        data: { scheduledAt: new Date().toISOString() },
      },
    ),
  ]);
  logger.info(
    {
      curator: CURATOR_CRON,
      concierge: CONCIERGE_CRON,
      synthesist: SYNTHESIST_CRON,
      tenantRollup: TENANT_ROLLUP_CRON,
      weeklyDigest: WEEKLY_DIGEST_CRON,
    },
    'agent schedules registered',
  );
}
