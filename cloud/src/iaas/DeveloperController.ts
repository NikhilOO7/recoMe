import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { prisma } from '../db.js';
import { getApiKeyService } from './ApiKeyService.js';
import { getUsage, planQuota } from './usageTracker.js';
import type { AuthEnv } from '../types.js';
import { logger } from '../observability/logger.js';

/**
 * /developer/* — user-facing IaaS dashboard surface (P4.2).
 *
 * JWT-authed (the user's own account), NOT API-key auth. This is the
 * surface the web dashboard at /developer hits to create + manage tenants
 * the user owns. The /v1/* surface stays API-key auth — different audience,
 * different auth boundary.
 *
 * Ownership: a Tenant.ownerUserId field already exists on the model. Every
 * route below enforces `tenant.ownerUserId === c.get('userId')` so a forged
 * tenant ID from another account can't read or mutate someone else's keys.
 *
 * Surface (all JSON):
 *   GET    /developer/tenants                    list tenants this user owns
 *   POST   /developer/tenants                    create a tenant (this user becomes owner)
 *   GET    /developer/tenants/:id                tenant detail + plan + usage
 *   GET    /developer/tenants/:id/keys           list API keys (prefix-only)
 *   POST   /developer/tenants/:id/keys           issue a key (raw returned ONCE)
 *   DELETE /developer/keys/:keyId                revoke a key (must own its tenant)
 */

const createTenantSchema = z.object({
  name: z.string().min(1).max(120),
  billingEmail: z.string().email().optional(),
});

const issueKeySchema = z.object({
  label: z.string().min(1).max(120),
  environment: z.enum(['LIVE', 'TEST']).default('LIVE'),
});

export function createDeveloperRoutes(): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  app.use('*', authMiddleware);

  // ── GET /developer/tenants ────────────────────────────────────────────────
  app.get('/tenants', async (c) => {
    const userId = c.get('userId');
    const tenants = await prisma.tenant.findMany({
      where: { ownerUserId: userId },
      select: {
        id: true,
        name: true,
        plan: true,
        status: true,
        billingEmail: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return c.json({ tenants });
  });

  // ── POST /developer/tenants ───────────────────────────────────────────────
  app.post('/tenants', async (c) => {
    const userId = c.get('userId');
    const body = createTenantSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: 'invalid_tenant', details: body.error.flatten() }, 400);
    }
    const { tenantId } = await getApiKeyService().createTenant({
      name: body.data.name,
      ...(body.data.billingEmail ? { billingEmail: body.data.billingEmail } : {}),
      ownerUserId: userId,
    });
    logger.info({ tenantId, userId }, 'tenant created via /developer');
    return c.json({ tenantId }, 201);
  });

  // ── GET /developer/tenants/:id — detail + usage + quota ──────────────────
  app.get('/tenants/:id', async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant || tenant.ownerUserId !== userId) {
      return c.json({ error: 'tenant_not_found' }, 404);
    }
    const usage = await getUsage(tenant.id);
    const quota = planQuota(tenant.plan);
    return c.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        plan: tenant.plan,
        status: tenant.status,
        billingEmail: tenant.billingEmail,
        createdAt: tenant.createdAt,
      },
      usage,
      quota,
    });
  });

  // ── GET /developer/tenants/:id/keys ──────────────────────────────────────
  app.get('/tenants/:id/keys', async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: { id: true, ownerUserId: true },
    });
    if (!tenant || tenant.ownerUserId !== userId) {
      return c.json({ error: 'tenant_not_found' }, 404);
    }
    const keys = await prisma.apiKey.findMany({
      where: { tenantId: id },
      // Never return keyHash — the prefix is the only thing the UI needs.
      select: {
        id: true,
        label: true,
        keyPrefix: true,
        environment: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return c.json({ keys });
  });

  // ── POST /developer/tenants/:id/keys — issue (raw returned once) ─────────
  app.post('/tenants/:id/keys', async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: { id: true, ownerUserId: true, status: true },
    });
    if (!tenant || tenant.ownerUserId !== userId) {
      return c.json({ error: 'tenant_not_found' }, 404);
    }
    if (tenant.status !== 'ACTIVE') {
      return c.json({ error: 'tenant_not_active' }, 409);
    }
    const body = issueKeySchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: 'invalid_key_request', details: body.error.flatten() }, 400);
    }
    const issued = await getApiKeyService().issueKey(id, {
      label: body.data.label,
      environment: body.data.environment,
    });
    logger.info(
      { tenantId: id, userId, apiKeyId: issued.id, env: issued.environment },
      'api key issued via /developer',
    );
    // The raw key is the only time it's ever sent over the wire. The web
    // dashboard surfaces a "copy now, this won't be shown again" prompt.
    return c.json(issued, 201);
  });

  // ── DELETE /developer/keys/:keyId — revoke ───────────────────────────────
  app.delete('/keys/:keyId', async (c) => {
    const userId = c.get('userId');
    const keyId = c.req.param('keyId');
    const key = await prisma.apiKey.findUnique({
      where: { id: keyId },
      select: { id: true, tenantId: true, tenant: { select: { ownerUserId: true } } },
    });
    if (!key || key.tenant.ownerUserId !== userId) {
      return c.json({ error: 'key_not_found' }, 404);
    }
    await getApiKeyService().revokeKey(keyId);
    return c.json({ ok: true });
  });

  return app;
}
