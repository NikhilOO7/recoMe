import { Hono } from 'hono';
import type { AuthEnv } from '../types.js';
import { z } from 'zod';
import { UserDataStore } from './UserDataStore.js';
import { UsageTracker } from '../billing/UsageTracker.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import type { Tier } from '@prisma/client';

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().optional(),
  digestEnabled: z.boolean().optional(),
});

const registerDeviceSchema = z.object({
  name: z.string().min(1).max(100),
  fingerprint: z.string().min(8).max(256),
});

export function createUserRoutes(): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  const store = new UserDataStore();
  const usage = new UsageTracker();

  app.use('*', authMiddleware);

  // GET /user/profile
  app.get('/profile', async (c) => {
    const userId = c.get('userId') as string;
    const profile = await store.getProfile(userId);
    if (!profile) return c.json({ error: 'User not found' }, 404);
    return c.json(profile);
  });

  // PATCH /user/profile
  app.patch('/profile', async (c) => {
    const userId = c.get('userId') as string;
    const body = updateProfileSchema.safeParse(await c.req.json());
    if (!body.success) return c.json({ error: 'Invalid input' }, 400);

    const profile = await store.updateProfile(userId, body.data);
    return c.json(profile);
  });

  // DELETE /user/account
  app.delete('/account', async (c) => {
    const userId = c.get('userId') as string;
    await store.deleteAccount(userId);
    return c.json({ ok: true });
  });

  // GET /user/devices
  app.get('/devices', async (c) => {
    const userId = c.get('userId') as string;
    const devices = await store.getDevices(userId);
    return c.json(devices);
  });

  // POST /user/devices
  app.post('/devices', async (c) => {
    const userId = c.get('userId') as string;
    const body = registerDeviceSchema.safeParse(await c.req.json());
    if (!body.success) return c.json({ error: 'Invalid input' }, 400);

    const device = await store.registerDevice(userId, body.data.name, body.data.fingerprint);
    return c.json(device);
  });

  // DELETE /user/devices/:id
  app.delete('/devices/:id', async (c) => {
    const userId = c.get('userId') as string;
    await store.removeDevice(userId, c.req.param('id'));
    return c.json({ ok: true });
  });

  // GET /user/usage
  app.get('/usage', async (c) => {
    const userId = c.get('userId') as string;
    const tier = c.get('tier') as Tier;
    const usageData = await usage.getUsage(userId, tier);
    return c.json(usageData);
  });

  // GET /user/stats — mobile dashboard stats
  app.get('/stats', async (c) => {
    const userId = c.get('userId') as string;
    const stats = await store.getDashboardStats(userId);
    return c.json(stats);
  });

  // GET /user/insights — mobile insights feed
  app.get('/insights', async (c) => {
    const userId = c.get('userId') as string;
    const insights = await store.getInsights(userId);
    return c.json(insights);
  });

  return app;
}
