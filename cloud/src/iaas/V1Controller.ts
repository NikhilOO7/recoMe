import { Hono } from 'hono';
import { apiKeyMiddleware, type TenantVars } from './apiKeyMiddleware.js';
import { composeTenantUserId } from './tenantUserId.js';
import { getIntelligence } from '../intelligence/IntelligenceService.js';
import { signalBatchSchema } from '../intelligence/schemas.js';
import { bumpUsage, getUsage, planQuota, nextPeriodBoundaryIso } from './usageTracker.js';
import { logger } from '../observability/logger.js';

// ── Public IaaS API: /v1/* ───────────────────────────────────────────────────
// Tenant-scoped, API-key authenticated. Mirrors the semantics of
// /intelligence/* (consumer routes) but with three key differences:
//   1. Auth is by API key, not user JWT.
//   2. The user identifier is the caller's external_user_id, namespaced
//      into a tenant-scoped userId by composeTenantUserId() — see ADR-0003.
//   3. Every successful call bumps TenantUsage and is subject to plan quotas.
//
// Response envelopes are intentionally distinct from /intelligence/*. The
// consumer endpoints are an implementation detail of recome.app and are free
// to change; /v1/* is a public contract. We treat schema changes here as
// breaking and version accordingly.

export function createV1Routes(): Hono<TenantVars> {
  const app = new Hono<TenantVars>();
  app.use('*', apiKeyMiddleware());

  // ── POST /v1/signals — ingest a batch of signals for one external user ────
  app.post('/signals', async (c) => {
    const tenantId = c.get('tenantId');
    const externalUserId = c.get('externalUserId');
    const plan = c.get('plan');

    const parsed = signalBatchSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'invalid_signals', details: parsed.error.flatten() }, 400);
    }

    // Quota check — peek at the current period's usage and refuse if the
    // post-ingest count would exceed the plan ceiling.
    const usage = await getUsage(tenantId);
    const quota = planQuota(plan);
    const incoming = parsed.data.signals.length;
    if (usage.signalsIngested + incoming > quota.signalsPerMonth) {
      const retryAfter = nextPeriodBoundaryIso();
      return c.json(
        {
          error: 'quota_exceeded',
          metric: 'signals',
          used: usage.signalsIngested,
          limit: quota.signalsPerMonth,
          resetsAt: retryAfter,
        },
        429,
      );
    }

    const userId = composeTenantUserId(tenantId, externalUserId);
    const svc = getIntelligence();

    // Ensure the namespaced user node exists. Tier doesn't apply to IaaS
    // end-users (their tier is the tenant's plan); we tag as FREE for
    // schema completeness — Neo4j stores the property but never reads it
    // for IaaS users.
    await svc.graph.upsertUser({ id: userId, tier: 'FREE', createdAt: Date.now() });

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
        logger.error({ err, tenantId, externalUserId, kind: sig.kind }, 'v1 signal ingest failed');
        return c.json({ error: 'ingest_failed', signalId: sig.id ?? null }, 500);
      }
    }

    void bumpUsage(tenantId, 'signalsIngested', incoming);

    return c.json({
      ok: true,
      tenantId,
      externalUserId,
      count: results.length,
      results,
    });
  });

  // ── GET /v1/users/:externalUserId/trails — cross-platform research trails ─
  app.get('/users/:externalUserId/trails', async (c) => {
    const tenantId = c.get('tenantId');
    const externalUserId = c.req.param('externalUserId');
    const plan = c.get('plan');

    // The X-User-Id in the header MUST match the path param. Mismatch is a
    // sign of a buggy caller (or worse, an attempt to query another user's
    // data from the same tenant). Refuse loudly.
    if (c.get('externalUserId') !== externalUserId) {
      return c.json(
        {
          error: 'user_mismatch',
          message: 'X-User-Id header must match :externalUserId path param',
        },
        403,
      );
    }

    const usage = await getUsage(tenantId);
    const quota = planQuota(plan);
    if (usage.queriesServed >= quota.queriesPerMonth) {
      return c.json(
        {
          error: 'quota_exceeded',
          metric: 'queries',
          used: usage.queriesServed,
          limit: quota.queriesPerMonth,
          resetsAt: nextPeriodBoundaryIso(),
        },
        429,
      );
    }

    const limit = Math.min(parseInt(c.req.query('limit') ?? '10', 10) || 10, 50);
    const minPlatforms = Math.max(parseInt(c.req.query('minPlatforms') ?? '2', 10) || 2, 1);
    const userId = composeTenantUserId(tenantId, externalUserId);
    const trails = await getIntelligence().trails.listTrails(userId, { minPlatforms, limit });

    void bumpUsage(tenantId, 'queriesServed', 1);
    return c.json({ tenantId, externalUserId, trails });
  });

  // ── GET /v1/users/:externalUserId/trails/:topic — single trail ───────────
  app.get('/users/:externalUserId/trails/:topic', async (c) => {
    const tenantId = c.get('tenantId');
    const externalUserId = c.req.param('externalUserId');
    if (c.get('externalUserId') !== externalUserId) {
      return c.json({ error: 'user_mismatch' }, 403);
    }

    const userId = composeTenantUserId(tenantId, externalUserId);
    const topic = decodeURIComponent(c.req.param('topic'));
    const svc = getIntelligence();
    const trail = await svc.trails.getTrail(userId, topic);
    if (!trail) return c.json({ error: 'trail_not_found' }, 404);

    const related = await svc.trails
      .relatedTopics(userId, trail.topicNormalizedName, 5)
      .catch(() => []);

    void bumpUsage(tenantId, 'queriesServed', 1);
    return c.json({
      tenantId,
      externalUserId,
      trail,
      related,
      explain: svc.trails.explainStrength(trail),
    });
  });

  // ── GET /v1/users/:externalUserId/intents — top intents for the user ─────
  app.get('/users/:externalUserId/intents', async (c) => {
    const tenantId = c.get('tenantId');
    const externalUserId = c.req.param('externalUserId');
    if (c.get('externalUserId') !== externalUserId) {
      return c.json({ error: 'user_mismatch' }, 403);
    }

    const userId = composeTenantUserId(tenantId, externalUserId);
    const limit = Math.min(parseInt(c.req.query('limit') ?? '10', 10) || 10, 50);
    const intents = await getIntelligence().graph.getTopIntents(userId, limit);

    void bumpUsage(tenantId, 'queriesServed', 1);
    return c.json({ tenantId, externalUserId, intents });
  });

  // ── DELETE /v1/users/:externalUserId — GDPR delete for one end-user ──────
  app.delete('/users/:externalUserId', async (c) => {
    const tenantId = c.get('tenantId');
    const externalUserId = c.req.param('externalUserId');
    if (c.get('externalUserId') !== externalUserId) {
      return c.json({ error: 'user_mismatch' }, 403);
    }

    const userId = composeTenantUserId(tenantId, externalUserId);
    const result = await getIntelligence().forgetUser(userId);
    logger.info({ tenantId, externalUserId, result }, 'v1 forgetUser executed');
    return c.json({ ok: true, tenantId, externalUserId, ...result });
  });

  // ── GET /v1/usage — current period counters for this tenant ──────────────
  app.get('/usage', async (c) => {
    const tenantId = c.get('tenantId');
    const plan = c.get('plan');
    const usage = await getUsage(tenantId);
    const quota = planQuota(plan);
    return c.json({
      tenantId,
      plan,
      period: usage.period,
      usage: {
        signalsIngested: usage.signalsIngested,
        queriesServed: usage.queriesServed,
      },
      quota: {
        signalsPerMonth: quota.signalsPerMonth,
        queriesPerMonth: quota.queriesPerMonth,
      },
      resetsAt: nextPeriodBoundaryIso(),
    });
  });

  return app;
}
