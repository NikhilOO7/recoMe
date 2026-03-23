import type { Context, Next } from 'hono';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key);
    }
  },
  5 * 60 * 1000,
);

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyFn?: (c: Context) => string;
}

const TIER_LIMITS: Record<string, number> = {
  FREE: 60,
  PRO: 300,
  PREMIUM: 600,
};

/**
 * Rate limiter middleware.
 * Uses in-memory store — suitable for single-instance deployment.
 * For multi-instance, swap to Redis.
 */
export function rateLimiter(config?: Partial<RateLimitConfig>) {
  const windowMs = config?.windowMs ?? 60_000;
  const defaultMax = config?.maxRequests ?? 60;

  return async (c: Context, next: Next): Promise<Response | void> => {
    const tier = (c.get('tier') as string) ?? 'FREE';
    const maxRequests = TIER_LIMITS[tier] ?? defaultMax;

    const key =
      config?.keyFn?.(c) ??
      (c.get('userId') as string) ??
      c.req.header('x-forwarded-for') ??
      'anonymous';

    const now = Date.now();
    let entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(Math.max(0, maxRequests - entry.count)));
    c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > maxRequests) {
      return c.json({ error: 'Rate limit exceeded' }, 429);
    }

    await next();
  };
}
