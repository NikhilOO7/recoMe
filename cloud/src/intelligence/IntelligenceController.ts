import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { getConfig } from '../config.js';
import { getIntelligence } from './IntelligenceService.js';
import { parseWindowParam } from './MindMap.js';
import { signalBatchSchema } from './schemas.js';
import { CardScorer } from './CardScorer.js';
import { createAgentRoutes } from '../agents/AgentController.js';
import { logger } from '../observability/logger.js';

const aspirationsSchema = z.object({
  aspirations: z.record(z.string(), z.number().finite().positive().max(5)),
});

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

  /**
   * GET /intelligence/mindmap — the user's interest graph for F-401.
   *
   * Query params:
   *   - window  : 90d (default) · accepts 7d / 12w / 3mo / 1y or raw ms
   *   - nodes   : optional cap on returned nodes (default 200, max 500)
   *   - edges   : optional cap on returned edges (default 800, max 2000)
   *   - cache   : 'no' to bypass the per-user 5-min cache (debug / refresh)
   */
  app.get('/mindmap', async (c) => {
    const userId = c.get('userId');
    const windowMs = parseWindowParam(c.req.query('window'));
    const nodeLimit = c.req.query('nodes')
      ? Math.min(500, Math.max(10, parseInt(c.req.query('nodes')!, 10) || 200))
      : undefined;
    const edgeLimit = c.req.query('edges')
      ? Math.min(2000, Math.max(0, parseInt(c.req.query('edges')!, 10) || 800))
      : undefined;
    const cache = c.req.query('cache') !== 'no';
    try {
      const result = await getIntelligence().mindMap.getMindMap(userId, {
        windowMs,
        nodeLimit,
        edgeLimit,
        cache,
      });
      return c.json(result);
    } catch (err) {
      logger.error({ err, userId, windowMs }, 'mindmap fetch failed');
      return c.json({ error: 'mindmap_failed' }, 500);
    }
  });

  // ── Personality Mirror (F-407, ADR-0012 §2.4) ────────────────────────────
  // Opt-in, user-scoped, never surfaced to admin / IaaS / support.
  // All routes return the current settings even when disabled so the UI can
  // render the opt-in CTA from a single fetch.

  /** GET /intelligence/personality — settings + (when enabled) the mirror. */
  app.get('/personality', async (c) => {
    const userId = c.get('userId');
    try {
      const payload = await getIntelligence().personality.getMirror(userId);
      return c.json(payload);
    } catch (err) {
      logger.error({ err, userId }, 'personality fetch failed');
      return c.json({ error: 'personality_failed' }, 500);
    }
  });

  /** POST /intelligence/personality/enable — opt in. Idempotent. */
  app.post('/personality/enable', async (c) => {
    const userId = c.get('userId');
    await getIntelligence().personality.enable(userId);
    logger.info({ userId }, 'personality mirror opted in');
    return c.json({ ok: true, enabled: true });
  });

  /** POST /intelligence/personality/disable — opt out (history preserved). */
  app.post('/personality/disable', async (c) => {
    const userId = c.get('userId');
    await getIntelligence().personality.disable(userId);
    return c.json({ ok: true, enabled: false });
  });

  /**
   * DELETE /intelligence/personality — wipe derived inferences.
   * Per ADR-0012 §2.4 constraint 3: the underlying graph is untouched.
   */
  app.delete('/personality', async (c) => {
    const userId = c.get('userId');
    await getIntelligence().personality.wipe(userId);
    logger.info({ userId }, 'personality mirror wiped');
    return c.json({ ok: true, wiped: true });
  });

  /** POST /intelligence/personality/aspirations — set/replace aspiration weights. */
  app.post('/personality/aspirations', async (c) => {
    const userId = c.get('userId');
    const body = aspirationsSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: 'invalid_aspirations', details: body.error.flatten() }, 400);
    }
    await getIntelligence().personality.setAspirations(userId, body.data.aspirations);
    return c.json({ ok: true });
  });

  /**
   * GET /intelligence/audit-log — F-408 "The Audit Log of You" (ADR-0014 §8).
   *
   * Cursor-paginated, newest-first. Merges captures + agent runs + agent
   * events + Personality Mirror state changes. Filters via `?types=...`
   * (comma-separated). Cursor via `?before=<msEpoch>`.
   */
  app.get('/audit-log', async (c) => {
    const userId = c.get('userId');
    const before = c.req.query('before') ? parseInt(c.req.query('before')!, 10) : undefined;
    const limit = c.req.query('limit')
      ? Math.min(200, Math.max(1, parseInt(c.req.query('limit')!, 10) || 50))
      : undefined;
    const typesParam = c.req.query('types');
    const allTypes = ['capture', 'agent_run', 'agent_event', 'state_change'] as const;
    const types = typesParam
      ? typesParam
          .split(',')
          .map((t) => t.trim())
          .filter((t): t is (typeof allTypes)[number] =>
            (allTypes as readonly string[]).includes(t),
          )
      : undefined;
    try {
      const page = await getIntelligence().auditLog.getPage(userId, { before, limit, types });
      return c.json(page);
    } catch (err) {
      logger.error({ err, userId }, 'audit-log fetch failed');
      return c.json({ error: 'audit_log_failed' }, 500);
    }
  });

  /**
   * GET /intelligence/audit-log/export — full JSON dump for this user.
   * Streams up to ~10k rows. Larger users get a `truncatedAt` cursor so the
   * UI can resume; v1.1 swaps to the same R2-signed-URL path as Takeout.
   */
  app.get('/audit-log/export', async (c) => {
    const userId = c.get('userId');
    try {
      const dump = await getIntelligence().auditLog.exportAll(userId);
      // Content-Disposition makes the browser save instead of render.
      c.header(
        'Content-Disposition',
        `attachment; filename="recome-audit-log-${new Date(dump.exportedAt)
          .toISOString()
          .slice(0, 10)}.json"`,
      );
      return c.json(dump);
    } catch (err) {
      logger.error({ err, userId }, 'audit-log export failed');
      return c.json({ error: 'audit_log_export_failed' }, 500);
    }
  });

  /**
   * POST /intelligence/score/cards — batch-score visible cards on a page.
   *
   * Two-stage pipeline (see cloud/src/intelligence/CardScorer.ts):
   *   1. Deterministic topic-overlap against the user's top intents — always
   *      runs, always cheap.
   *   2. Optional LLM polish of `reason` for the top-N cards. Gated on
   *      CARDSCORER_LLM_ENABLED. Verdict + score stay deterministic so a
   *      prompt-inject can't flip a "filtered" badge to "relevant."
   *
   * Client-visible shape unchanged: { scores: [{id, score, verdict, reason}] }.
   */
  app.post('/score/cards', async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      pageUrl?: string;
      platform?: string;
      cards?: Array<{ id: string; title: string; brand?: string; url?: string }>;
    } | null;
    if (!body || !Array.isArray(body.cards) || body.cards.length === 0) {
      return c.json({ error: 'invalid_cards' }, 400);
    }
    if (body.cards.length > 50) {
      return c.json({ error: 'too_many_cards', max: 50 }, 400);
    }

    const userId = c.get('userId');
    const config = getConfig();
    const intents = await getIntelligence()
      .graph.getTopIntents(userId, 30)
      .catch(() => [] as Array<{ topicName: string; strength: number }>);

    const scorer = new CardScorer({
      llmEnabled: config.CARDSCORER_LLM_ENABLED,
      openaiKey: config.OPENAI_API_KEY,
      model: config.CARDSCORER_LLM_MODEL,
    });
    const scores = await scorer.score({ intents, cards: body.cards });
    return c.json({ scores });
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
