import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { getPushService } from './PushService.js';
import type { AuthEnv } from '../types.js';

/**
 * /notifications/* — JWT-authed surface for the PWA push subscription
 * lifecycle (P4.3).
 *
 * Routes:
 *   GET    /notifications/push/vapid-public-key
 *     Returns the VAPID public key the browser needs to call
 *     `registration.pushManager.subscribe({ applicationServerKey })`.
 *     Public-by-design (it's a public key) but still gated by auth so
 *     unauthenticated polling doesn't show up in our access logs.
 *
 *   POST   /notifications/push/subscribe
 *     Body: { endpoint, keys: { p256dh, auth } }
 *     Upserts on endpoint so a browser that resubscribes (e.g. after
 *     clearing site data) replaces the old row, not adds a second one
 *     for the same physical device.
 *
 *   DELETE /notifications/push/subscribe
 *     Body: { endpoint }
 *     Scoped by userId server-side; can't drop another user's row.
 *
 *   GET    /notifications/push/subscriptions
 *     List of this user's subscriptions for the settings UI.
 */

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().max(500).optional(),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export function createNotificationRoutes(): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  app.use('*', authMiddleware);

  app.get('/push/vapid-public-key', (c) => {
    const key = getPushService().getVapidPublicKey();
    if (!key) return c.json({ error: 'push_not_configured' }, 503);
    return c.json({ publicKey: key });
  });

  app.post('/push/subscribe', async (c) => {
    const userId = c.get('userId');
    const body = subscribeSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: 'invalid_subscription', details: body.error.flatten() }, 400);
    }
    const result = await getPushService().subscribe(userId, {
      endpoint: body.data.endpoint,
      p256dh: body.data.keys.p256dh,
      auth: body.data.keys.auth,
      ...(body.data.userAgent ? { userAgent: body.data.userAgent } : {}),
    });
    return c.json({ ok: true, id: result.id });
  });

  app.delete('/push/subscribe', async (c) => {
    const userId = c.get('userId');
    const body = unsubscribeSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: 'invalid_unsubscribe', details: body.error.flatten() }, 400);
    }
    const removed = await getPushService().unsubscribe(userId, body.data.endpoint);
    return c.json({ ok: removed });
  });

  app.get('/push/subscriptions', async (c) => {
    const userId = c.get('userId');
    const subscriptions = await getPushService().listForUser(userId);
    return c.json({ subscriptions });
  });

  return app;
}
