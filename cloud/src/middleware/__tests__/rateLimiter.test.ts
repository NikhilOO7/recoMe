import { beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import {
  ipRateLimiter,
  userRateLimiter,
  tenantRateLimiter,
  resetRateLimitStore,
} from '../rateLimiter.js';

beforeEach(() => resetRateLimitStore());

async function hammer(app: Hono, n: number, headers: Record<string, string> = {}) {
  let last = 0;
  for (let i = 0; i < n; i++) {
    const res = await app.request('/x', { headers });
    last = res.status;
  }
  return last;
}

describe('ipRateLimiter (layer 1, pre-auth)', () => {
  it('caps per IP and isolates IPs from each other', async () => {
    const app = new Hono();
    app.use('*', ipRateLimiter({ maxRequests: 3 }));
    app.get('/x', (c) => c.json({ ok: true }));

    expect(await hammer(app, 3, { 'fly-client-ip': '1.1.1.1' })).toBe(200);
    expect(await hammer(app, 1, { 'fly-client-ip': '1.1.1.1' })).toBe(429);
    // A different IP is unaffected by the first IP's exhausted bucket.
    expect(await hammer(app, 3, { 'fly-client-ip': '2.2.2.2' })).toBe(200);
  });

  it('uses the rightmost x-forwarded-for hop (proxy-appended, not client-forged)', async () => {
    const app = new Hono();
    app.use('*', ipRateLimiter({ maxRequests: 1 }));
    app.get('/x', (c) => c.json({ ok: true }));

    expect(await hammer(app, 1, { 'x-forwarded-for': 'spoofed, 9.9.9.9' })).toBe(200);
    // Same real hop, different spoofed prefix — must share the bucket.
    expect(await hammer(app, 1, { 'x-forwarded-for': 'other-spoof, 9.9.9.9' })).toBe(429);
  });

  it('scoped instances (e.g. auth brute-force guard) do not share buckets with the global layer', async () => {
    const app = new Hono();
    app.use('*', ipRateLimiter({ maxRequests: 5 }));
    app.use('/auth/*', ipRateLimiter({ scope: 'auth', maxRequests: 1 }));
    app.get('/auth/x', (c) => c.json({ ok: true }));
    app.get('/x', (c) => c.json({ ok: true }));

    const h = { 'fly-client-ip': '3.3.3.3' };
    expect((await app.request('/auth/x', { headers: h })).status).toBe(200);
    expect((await app.request('/auth/x', { headers: h })).status).toBe(429);
    // Global routes still fine — auth scope exhausted, global scope is not.
    expect((await app.request('/x', { headers: h })).status).toBe(200);
  });
});

describe('userRateLimiter (layer 2, post-auth)', () => {
  function appWithUser(userId: string | undefined, tier: string) {
    const app = new Hono();
    app.use('*', async (c, next) => {
      if (userId) c.set('userId' as never, userId as never);
      c.set('tier' as never, tier as never);
      await next();
    });
    app.use('*', userRateLimiter());
    app.get('/x', (c) => c.json({ ok: true }));
    return app;
  }

  it('fails closed (401) when mounted without auth context', async () => {
    const res = await appWithUser(undefined, 'FREE').request('/x');
    expect(res.status).toBe(401);
  });

  it('keys by user and applies tier ceilings (FREE=60)', async () => {
    const app = appWithUser('user-a', 'FREE');
    expect(await hammer(app, 60)).toBe(200);
    expect(await hammer(app, 1)).toBe(429);
    // Another user is unaffected.
    expect(
      await appWithUser('user-b', 'FREE')
        .request('/x')
        .then((r) => r.status),
    ).toBe(200);
  });

  it('PRO tier gets a higher ceiling than FREE', async () => {
    const app = appWithUser('user-pro', 'PRO');
    expect(await hammer(app, 61)).toBe(200);
  });
});

describe('tenantRateLimiter (layer 3, post-key-auth)', () => {
  function appWithTenant(tenantId: string | undefined, plan: string) {
    const app = new Hono();
    app.use('*', async (c, next) => {
      if (tenantId) c.set('tenantId' as never, tenantId as never);
      c.set('plan' as never, plan as never);
      await next();
    });
    app.use('*', tenantRateLimiter());
    app.get('/x', (c) => c.json({ ok: true }));
    return app;
  }

  it('fails closed (401) without tenant context', async () => {
    const res = await appWithTenant(undefined, 'FREE').request('/x');
    expect(res.status).toBe(401);
  });

  it('keys by tenant with plan ceilings, isolating tenants', async () => {
    const free = appWithTenant('t-free', 'FREE');
    expect(await hammer(free, 60)).toBe(200);
    expect(await hammer(free, 1)).toBe(429);
    expect(
      await appWithTenant('t-other', 'FREE')
        .request('/x')
        .then((r) => r.status),
    ).toBe(200);
  });

  it('STARTER plan exceeds the FREE ceiling', async () => {
    const app = appWithTenant('t-starter', 'STARTER');
    expect(await hammer(app, 61)).toBe(200);
  });
});
