import { Hono } from 'hono';
import { z } from 'zod';
import { TasteTwinService } from './TasteTwinService.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const updateVectorSchema = z.object({
  vector: z.array(z.string().max(128)).min(1).max(500),
});

const recommendationActionSchema = z.object({
  recommendationId: z.string().min(1),
});

const matchActionSchema = z.object({
  matchId: z.string().min(1),
});

const discoverableSchema = z.object({
  isDiscoverable: z.boolean(),
});

export function createTasteTwinRoutes(): Hono {
  const app = new Hono();
  const service = new TasteTwinService();

  // All routes require authentication
  app.use('*', authMiddleware);

  // ── Consent & Status ────────────────────────────────────────────────────

  /** Get Taste Twin status for the current user */
  app.get('/status', async (c) => {
    const userId = c.get('userId') as string;
    const status = await service.getStatus(userId);
    return c.json(status);
  });

  /** Opt in to the Taste Twin network */
  app.post('/opt-in', async (c) => {
    const userId = c.get('userId') as string;
    await service.optIn(userId);
    return c.json({ ok: true });
  });

  /** Opt out — deletes all taste data */
  app.post('/opt-out', async (c) => {
    const userId = c.get('userId') as string;
    await service.optOut(userId);
    return c.json({ ok: true });
  });

  /** Toggle discoverability */
  app.patch('/discoverable', async (c) => {
    const userId = c.get('userId') as string;
    const body = discoverableSchema.parse(await c.req.json());
    await service.setDiscoverable(userId, body.isDiscoverable);
    return c.json({ ok: true });
  });

  // ── Taste Vector ────────────────────────────────────────────────────────

  /** Upload anonymized taste vector */
  app.post('/vector', async (c) => {
    const userId = c.get('userId') as string;
    const body = updateVectorSchema.parse(await c.req.json());
    try {
      await service.updateTasteVector(userId, body.vector);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // ── Matching ────────────────────────────────────────────────────────────

  /** Trigger match computation */
  app.post('/compute-matches', async (c) => {
    const userId = c.get('userId') as string;
    const matchesCreated = await service.computeMatches(userId);
    return c.json({ matchesCreated });
  });

  /** Get current twins */
  app.get('/twins', async (c) => {
    const userId = c.get('userId') as string;
    const twins = await service.getTwins(userId);
    return c.json(twins);
  });

  /** Accept a twin match */
  app.post('/accept', async (c) => {
    const userId = c.get('userId') as string;
    const body = matchActionSchema.parse(await c.req.json());
    try {
      await service.acceptMatch(userId, body.matchId);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  /** Block/report a twin match */
  app.post('/block', async (c) => {
    const userId = c.get('userId') as string;
    const body = matchActionSchema.parse(await c.req.json());
    try {
      await service.blockMatch(userId, body.matchId);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // ── Recommendations ─────────────────────────────────────────────────────

  /** Get twin recommendations */
  app.get('/recommendations', async (c) => {
    const userId = c.get('userId') as string;
    const recommendations = await service.getRecommendations(userId);
    return c.json(recommendations);
  });

  /** Dismiss a recommendation */
  app.post('/dismiss', async (c) => {
    const userId = c.get('userId') as string;
    const body = recommendationActionSchema.parse(await c.req.json());
    await service.dismissRecommendation(userId, body.recommendationId);
    return c.json({ ok: true });
  });

  /** Act on a recommendation */
  app.post('/act', async (c) => {
    const userId = c.get('userId') as string;
    const body = recommendationActionSchema.parse(await c.req.json());
    await service.actOnRecommendation(userId, body.recommendationId);
    return c.json({ ok: true });
  });

  return app;
}
