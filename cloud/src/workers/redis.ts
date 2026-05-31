import { logger } from '../observability/logger.js';

/**
 * Connection options for the BullMQ worker layer.
 *
 * BullMQ bundles its own copy of ioredis, so we hand it options (not an
 * instance) and let it manage the underlying client. Sharing instance types
 * across the boundary fails because the two copies of ioredis disagree on
 * their internal connector types — opaque options sidestep the whole class.
 *
 * Returns null when REDIS_URL is unset so callers can no-op the worker boot.
 */

export interface WorkerRedisOptions {
  url: string;
}

export function getWorkerRedisOptions(): WorkerRedisOptions | null {
  const url = process.env.REDIS_URL;
  if (!url) {
    logger.info('worker layer: REDIS_URL not set, skipping');
    return null;
  }
  return { url };
}

/**
 * Translate our options into BullMQ's ConnectionOptions. Adds the BullMQ-
 * required `maxRetriesPerRequest: null` and `enableReadyCheck: true`. Kept
 * loosely typed (`unknown`) to avoid pulling BullMQ's nested-ioredis types
 * into the rest of the codebase — the only consumer is BullMQ itself.
 */
export function toBullConnection(opts: WorkerRedisOptions): unknown {
  return {
    url: opts.url,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  };
}
