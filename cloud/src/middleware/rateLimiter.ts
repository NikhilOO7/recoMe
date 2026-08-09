import type { Context, Next } from 'hono';

// Layered rate limiting (docs/PRODUCT.md D2):
//
//   1. ipRateLimiter     — global, PRE-auth. Coarse per-IP ceiling against
//                          drive-by abuse; also the brute-force guard on /auth
//                          (stricter instance mounted there). Running before
//                          auth is deliberate for this layer only.
//   2. userRateLimiter   — POST-authMiddleware. Tier-keyed per user.
//   3. tenantRateLimiter — POST-apiKeyMiddleware. Plan-keyed per tenant, so
//                          one tenant's burst can't starve another's traffic.
//
// In-memory windowed counters — suitable for the current single-instance
// deployment (fly.toml scale=1). For multi-instance, swap the store to Redis;
// the middleware contracts stay identical.

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Periodic cleanup of expired windows. unref() so the timer never keeps the
// process (or a test runner) alive.
const cleanup = setInterval(
  () => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key);
    }
  },
  5 * 60 * 1000,
);
cleanup.unref?.();

/** Test hook — clears all counters. */
export function resetRateLimitStore(): void {
  store.clear();
}

function consume(key: string, windowMs: number, maxRequests: number, c: Context): boolean {
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

  return entry.count <= maxRequests;
}

function tooMany(c: Context) {
  return c.json({ error: 'Rate limit exceeded' }, 429);
}

/**
 * Best-effort client IP. Behind Fly, Fly-Client-IP is set by the edge and
 * not client-forgeable. X-Forwarded-For's rightmost hop is the one appended
 * by the nearest proxy. Bare local runs fall into a single 'local' bucket —
 * acceptable for dev, which is the only place it occurs.
 */
function clientIp(c: Context): string {
  const fly = c.req.header('fly-client-ip');
  if (fly) return fly;
  const xff = c.req.header('x-forwarded-for');
  if (xff) {
    const hops = xff
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean);
    const nearest = hops[hops.length - 1];
    if (nearest) return nearest;
  }
  return 'local';
}

const TIER_LIMITS: Record<string, number> = {
  FREE: 60,
  PRO: 300,
  PREMIUM: 600,
};

// Requests/min by IaaS plan — burst control, independent of monthly quotas
// (usageTracker.ts governs those).
const PLAN_LIMITS: Record<string, number> = {
  FREE: 60,
  STARTER: 300,
  PRO: 1200,
  ENTERPRISE: 3000,
};

export interface IpRateLimitConfig {
  windowMs?: number;
  maxRequests?: number;
  /** Distinct bucket namespace, e.g. 'auth' for the stricter /auth guard. */
  scope?: string;
}

/** Layer 1 — coarse per-IP ceiling. Mount pre-auth. */
export function ipRateLimiter(config?: IpRateLimitConfig) {
  const windowMs = config?.windowMs ?? 60_000;
  const maxRequests = config?.maxRequests ?? 300;
  const scope = config?.scope ?? 'global';

  return async (c: Context, next: Next): Promise<Response | void> => {
    if (!consume(`${scope}:ip:${clientIp(c)}`, windowMs, maxRequests, c)) return tooMany(c);
    await next();
  };
}

/** Layer 2 — per-user, tier-keyed. Mount AFTER authMiddleware. */
export function userRateLimiter(config?: { windowMs?: number }) {
  const windowMs = config?.windowMs ?? 60_000;

  return async (c: Context, next: Next): Promise<Response | void> => {
    const userId = c.get('userId') as string | undefined;
    if (!userId) {
      // Auth must run first; refusing open is the fail-safe direction.
      return c.json({ error: 'unauthenticated' }, 401);
    }
    const tier = (c.get('tier') as string) ?? 'FREE';
    const max = TIER_LIMITS[tier] ?? 60;
    if (!consume(`user:${userId}`, windowMs, max, c)) return tooMany(c);
    await next();
  };
}

/** Layer 3 — per-tenant, plan-keyed. Mount AFTER apiKeyMiddleware. */
export function tenantRateLimiter(config?: { windowMs?: number }) {
  const windowMs = config?.windowMs ?? 60_000;

  return async (c: Context, next: Next): Promise<Response | void> => {
    const tenantId = c.get('tenantId') as string | undefined;
    if (!tenantId) {
      return c.json({ error: 'unauthenticated' }, 401);
    }
    const plan = (c.get('plan') as string) ?? 'FREE';
    const max = PLAN_LIMITS[plan] ?? 60;
    if (!consume(`tenant:${tenantId}`, windowMs, max, c)) return tooMany(c);
    await next();
  };
}
