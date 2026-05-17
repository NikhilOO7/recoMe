import { Hono } from 'hono';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { getIntelligence } from './IntelligenceService.js';
import { signalBatchSchema } from './schemas.js';
import { createAgentRoutes } from '../agents/AgentController.js';
import { logger } from '../observability/logger.js';

type AuthVars = { Variables: { userId: string; tier?: string; deviceId?: string } };

export function createIntelligenceRoutes(): Hono<AuthVars> {
  const app = new Hono<AuthVars>();
  app.use('*', authMiddleware);

  /** POST /intelligence/signals — batched signal ingestion. */
  app.post('/signals', async (c) => {
    const parsed = signalBatchSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'invalid_signals', details: parsed.error.flatten() }, 400);
    }
    const userId = c.get('userId');
    const tier = c.get('tier') ?? 'FREE';
    const svc = getIntelligence();

    await svc.graph.upsertUser({
      id: userId,
      tier: (tier === 'PRO' || tier === 'PREMIUM' ? tier : 'FREE') as 'FREE' | 'PRO' | 'PREMIUM',
      createdAt: Date.now(),
    });

    const results: Array<{ signalId: string; topicsCreated: number; entitiesCreated: number }> = [];
    for (const sig of parsed.data.signals) {
      try {
        const r = await svc.ingestion.ingest({ ...sig, userId });
        results.push({
          signalId: r.signalId,
          topicsCreated: r.topicsCreated,
          entitiesCreated: r.entitiesCreated,
        });
      } catch (err) {
        logger.error({ err, userId, kind: sig.kind }, 'signal ingest failed');
        return c.json({ error: 'ingest_failed', signalId: sig.id ?? null }, 500);
      }
    }
    return c.json({ ok: true, count: results.length, results });
  });

  /** GET /intelligence/trails — cross-platform research trails for the user. */
  app.get('/trails', async (c) => {
    const userId = c.get('userId');
    const limit = Math.min(parseInt(c.req.query('limit') ?? '10', 10) || 10, 50);
    const minPlatforms = Math.max(parseInt(c.req.query('minPlatforms') ?? '2', 10) || 2, 1);
    const trails = await getIntelligence().trails.listTrails(userId, { minPlatforms, limit });
    return c.json({ trails });
  });

  /** GET /intelligence/trails/:topic — single trail with related-topic suggestions. */
  app.get('/trails/:topic', async (c) => {
    const userId = c.get('userId');
    const topic = decodeURIComponent(c.req.param('topic'));
    const svc = getIntelligence();
    const trail = await svc.trails.getTrail(userId, topic);
    if (!trail) return c.json({ error: 'trail_not_found' }, 404);
    const related = await svc.trails
      .relatedTopics(userId, trail.topicNormalizedName, 5)
      .catch(() => []);
    return c.json({ trail, related, explain: svc.trails.explainStrength(trail) });
  });

  /** GET /intelligence/intents — top intents (used for personalization). */
  app.get('/intents', async (c) => {
    const userId = c.get('userId');
    const limit = Math.min(parseInt(c.req.query('limit') ?? '10', 10) || 10, 50);
    const intents = await getIntelligence().graph.getTopIntents(userId, limit);
    return c.json({ intents });
  });

  /** DELETE /intelligence/me — GDPR delete for this user. */
  app.delete('/me', async (c) => {
    const userId = c.get('userId');
    const result = await getIntelligence().forgetUser(userId);
    logger.info({ userId, result }, 'intelligence: forgetUser executed');
    return c.json({ ok: true, ...result });
  });

  // Active agents (ADR-0012) — same auth, mounted here so the consumer
  // surface is one URL prefix to remember. /v1/agents/* (tenant-scoped)
  // is a separate route group on the IaaS controller.
  app.route('/', createAgentRoutes());

  return app;
}
