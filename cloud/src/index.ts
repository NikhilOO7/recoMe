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
import { createAgentRoutes } from './agent/AgentController.js';
import { createTasteTwinRoutes } from './tastetwin/TasteTwinController.js';
import { createAdminRoutes } from './admin/AdminController.js';
import { createIntelligenceRoutes } from './intelligence/IntelligenceController.js';
import { rateLimiter } from './middleware/rateLimiter.js';
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

app.use('*', rateLimiter());

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
app.route('/agent', createAgentRoutes());
app.route('/twins', createTasteTwinRoutes());
app.route('/admin', createAdminRoutes());

if (getConfig().INTELLIGENCE_ENABLED) {
  app.route('/intelligence', createIntelligenceRoutes());
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
