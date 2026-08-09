// MUST be the first import: loads .env then .env.local (override) before
// any module reads process.env. See src/env.ts for the load-order rationale.
import './env.js';

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { getConfig } from './config.js';
import { createAuthRoutes } from './auth/AuthController.js';
import { createSyncRoutes } from './sync/SyncController.js';
import { createBillingRoutes } from './billing/BillingController.js';
import { createUserRoutes } from './storage/UserController.js';
import { createPackRoutes } from './social/PackController.js';
import { createTasteTwinRoutes } from './tastetwin/TasteTwinController.js';
import { createAdminRoutes } from './admin/AdminController.js';
import { createIntelligenceRoutes } from './intelligence/IntelligenceController.js';
import { createV1Routes } from './iaas/V1Controller.js';
import { createDeveloperRoutes } from './iaas/DeveloperController.js';
import { createNotificationRoutes } from './notifications/NotificationController.js';
import { ipRateLimiter } from './middleware/rateLimiter.js';
import { logger } from './observability/logger.js';
import { installSignalHandlers } from './observability/lifecycle.js';
import { bootIntelligence } from './bootstrap.js';
import { maybeIntelligence } from './intelligence/IntelligenceService.js';

const app = new Hono();

// ── Global middleware ────────────────────────────────────────────────────────

app.use('*', honoLogger());

app.use(
  '*',
  cors({
    origin: (origin) => {
      const config = getConfig();
      const allowed = config.CORS_ORIGINS.split(',').map((o) => o.trim());
      if (origin.startsWith('chrome-extension://')) return origin;
      for (const pattern of allowed) {
        if (pattern.includes('*')) {
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
          if (regex.test(origin)) return origin;
        }
        if (origin === pattern) return origin;
      }
      return '';
    },
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    credentials: true,
  }),
);

// Layer-1 abuse guard: coarse per-IP ceiling, pre-auth by design. Identity-
// keyed limits (per-user tier, per-tenant plan) are mounted inside the route
// groups AFTER their auth middleware — see rateLimiter.ts for the layering.
app.use('*', ipRateLimiter({ maxRequests: 300 }));

// ── Health checks ────────────────────────────────────────────────────────────
// /live  — process is up (cheap, used by orchestrator liveness probes)
// /ready — dependencies are reachable (used for traffic routing readiness)
// /health — legacy alias; kept for backwards compat with existing monitors.

app.get('/live', (c) => c.json({ status: 'ok' }));
app.get('/health', (c) => c.json({ status: 'ok', version: '1.0.0' }));
app.get('/ready', async (c) => {
  const intel = maybeIntelligence();
  if (!intel) return c.json({ ready: true, intelligence: 'disabled' });
  const h = await intel.health();
  return c.json({ ready: h.ok, ...h }, h.ok ? 200 : 503);
});

// ── Routes ───────────────────────────────────────────────────────────────────

app.route('/auth', createAuthRoutes());
app.route('/sync', createSyncRoutes());
app.route('/billing', createBillingRoutes());
app.route('/user', createUserRoutes());
app.route('/packs', createPackRoutes());
app.route('/twins', createTasteTwinRoutes());
// Legacy /agent (singular) chat stub archived to graveyard 2026-05-30.
// All real agent surfaces live under /intelligence/agents/* — see
// docs/architecture/0016-lld.md §1 and dev-plan WS-3 P2.5.
app.route('/admin', createAdminRoutes());

if (getConfig().INTELLIGENCE_ENABLED) {
  app.route('/intelligence', createIntelligenceRoutes());
  // Public IaaS surface — same backend, API-key auth + tenant scoping.
  // See ADR-0003 §2.3 and cloud/src/iaas/V1Controller.ts for the contract.
  app.route('/v1', createV1Routes());
  // Developer dashboard surface — JWT-authed, lets users manage the
  // tenants + keys they own. Backs the web /developer page (P4.2).
  app.route('/developer', createDeveloperRoutes());
  // PWA push subscription lifecycle (P4.3). VAPID-gated; no-op without keys.
  app.route('/notifications', createNotificationRoutes());
}

// ── 404 / Error ──────────────────────────────────────────────────────────────

app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError((err, c) => {
  logger.error({ err, path: c.req.path }, 'unhandled error');
  return c.json({ error: 'Internal server error' }, 500);
});

// ── Boot ─────────────────────────────────────────────────────────────────────

const config = getConfig();
installSignalHandlers();

void bootIntelligence(config).catch((err) => {
  logger.error({ err }, 'intelligence bootstrap failed');
  if (config.INTELLIGENCE_ENABLED) {
    // Hard fail in prod if the user explicitly opted in but we can't connect.
    process.exit(1);
  }
});

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  logger.info({ port: info.port }, 'cloud listening');
});

export default app;
