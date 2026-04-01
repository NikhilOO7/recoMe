import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { getConfig } from './config.js';
import { createAuthRoutes } from './auth/AuthController.js';
import { createSyncRoutes } from './sync/SyncController.js';
import { createBillingRoutes } from './billing/BillingController.js';
import { createUserRoutes } from './storage/UserController.js';
import { createPackRoutes } from './social/PackController.js';
import { createAgentRoutes } from './agent/AgentController.js';
import { createTasteTwinRoutes } from './tastetwin/TasteTwinController.js';
import { rateLimiter } from './middleware/rateLimiter.js';

const app = new Hono();

// ── Global middleware ────────────────────────────────────────────────────────

app.use('*', logger());

app.use(
  '*',
  cors({
    origin: (origin) => {
      const config = getConfig();
      const allowed = config.CORS_ORIGINS.split(',').map((o) => o.trim());
      // Allow chrome-extension:// origins and configured origins
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

// ── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (c) => c.json({ status: 'ok', version: '1.0.0' }));

// ── Routes ───────────────────────────────────────────────────────────────────

app.route('/auth', createAuthRoutes());
app.route('/sync', createSyncRoutes());
app.route('/billing', createBillingRoutes());
app.route('/user', createUserRoutes());
app.route('/packs', createPackRoutes());
app.route('/agent', createAgentRoutes());
app.route('/twins', createTasteTwinRoutes());

// ── 404 ──────────────────────────────────────────────────────────────────────

app.notFound((c) => c.json({ error: 'Not found' }, 404));

// ── Error handler ────────────────────────────────────────────────────────────

app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

// ── Start server ─────────────────────────────────────────────────────────────

const config = getConfig();
serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`RecoMe Cloud running on http://localhost:${info.port}`);
});

export default app;
