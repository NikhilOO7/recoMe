import type { ConnectionOptions } from 'bullmq';
import { logger } from '../observability/logger.js';
import { getWorkerRedisOptions, toBullConnection } from './redis.js';
import { getAgentsQueue } from './queues.js';
import { registerSchedules } from './scheduler.js';
import { bootProcessor } from './processor.js';

/**
 * Boot the agent worker layer (scheduler + processor).
 *
 * v1 deployment: this runs in-process with the API. That's fine because the
 * total work per tick is bounded (MAX_USERS_PER_TICK) and Guardian/dedupe
 * make duplicate ticks (across machines) safe. v1.1 splits into a dedicated
 * worker machine via `fly scale` — same code path, just a separate entry
 * point that skips the HTTP server boot.
 *
 * Returns silently if REDIS_URL is unset (dev without Redis stays usable).
 */
export async function bootAgentWorkers(): Promise<void> {
  const opts = getWorkerRedisOptions();
  if (!opts) {
    logger.info('agent workers: REDIS_URL not set, skipping worker boot');
    return;
  }

  const connection = toBullConnection(opts) as ConnectionOptions;
  const queue = getAgentsQueue(connection);
  try {
    await registerSchedules(queue);
  } catch (err) {
    logger.error({ err }, 'agent workers: failed to register schedules');
    // Don't crash the API — processor still drains any pre-existing jobs.
  }
  bootProcessor(connection);
  logger.info('agent workers booted');
}
