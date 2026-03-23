import { Hono } from 'hono';
import { z } from 'zod';
import { SyncEngine } from './SyncEngine.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const pullSchema = z.object({
  dataType: z.enum([
    'PREFERENCES',
    'INTEREST_GRAPH',
    'FILTER_RULES',
    'DECISION_HISTORY',
    'PLATFORM_SETTINGS',
  ]),
  clientVersion: z.number().int().min(0),
});

const pushSchema = z.object({
  dataType: z.enum([
    'PREFERENCES',
    'INTEREST_GRAPH',
    'FILTER_RULES',
    'DECISION_HISTORY',
    'PLATFORM_SETTINGS',
  ]),
  clientVersion: z.number().int().min(0),
  encryptedData: z.string(), // base64
  iv: z.string(), // base64
  authTag: z.string(), // base64
  checksum: z.string(),
});

export function createSyncRoutes(): Hono {
  const app = new Hono();
  const engine = new SyncEngine();

  app.use('*', authMiddleware);

  // POST /sync/pull — get latest server state
  app.post('/pull', async (c) => {
    const userId = c.get('userId') as string;
    const body = pullSchema.safeParse(await c.req.json());
    if (!body.success) {
      return c.json({ error: 'Invalid input', details: body.error.flatten() }, 400);
    }

    const result = await engine.pull(userId, body.data.dataType, body.data.clientVersion);
    return c.json(result);
  });

  // POST /sync/push — push client changes to server
  app.post('/push', async (c) => {
    const userId = c.get('userId') as string;
    const tier = c.get('tier') as string;

    // Check sync limits by tier
    if (!engine.canSync(tier)) {
      return c.json({ error: 'Sync not available on your plan' }, 403);
    }

    const body = pushSchema.safeParse(await c.req.json());
    if (!body.success) {
      return c.json({ error: 'Invalid input', details: body.error.flatten() }, 400);
    }

    const result = await engine.push(userId, {
      dataType: body.data.dataType,
      clientVersion: body.data.clientVersion,
      encryptedData: Buffer.from(body.data.encryptedData, 'base64'),
      iv: Buffer.from(body.data.iv, 'base64'),
      authTag: Buffer.from(body.data.authTag, 'base64'),
      checksum: body.data.checksum,
    });

    if (result.conflict) {
      return c.json(
        { conflict: true, serverVersion: result.serverVersion, serverData: result.serverData },
        409,
      );
    }

    return c.json({ ok: true, version: result.version });
  });

  // GET /sync/status — get sync versions for all data types
  app.get('/status', async (c) => {
    const userId = c.get('userId') as string;
    const status = await engine.getStatus(userId);
    return c.json(status);
  });

  return app;
}
