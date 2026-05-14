import { logger } from './logger.js';

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  isRetryable?: (err: unknown) => boolean;
  label?: string;
}

const defaultRetryable = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; name?: string; message?: string };
  if (e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT' || e.code === 'ECONNREFUSED') return true;
  if (
    e.name === 'Neo4jError' &&
    /Transient|ServiceUnavailable|SessionExpired/.test(e.message ?? '')
  )
    return true;
  if (typeof e.message === 'string' && /5\d\d|timeout/i.test(e.message)) return true;
  return false;
};

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const baseDelay = opts.baseDelayMs ?? 100;
  const maxDelay = opts.maxDelayMs ?? 2000;
  const isRetryable = opts.isRetryable ?? defaultRetryable;
  const label = opts.label ?? 'op';

  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const retryable = isRetryable(err);
      if (attempt === attempts || !retryable) {
        logger.warn({ err, attempt, label, retryable }, 'retry exhausted or non-retryable');
        throw err;
      }
      const delay = Math.min(baseDelay * 2 ** (attempt - 1), maxDelay);
      const jitter = Math.random() * delay * 0.2;
      logger.debug({ attempt, label, delayMs: delay + jitter }, 'retrying after transient error');
      await sleep(delay + jitter);
    }
  }
  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
