import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../db.js';
import type { ApiKeyEnv, TenantPlan, TenantStatus } from '@prisma/client';
import { logger } from '../observability/logger.js';

// ── Key format ───────────────────────────────────────────────────────────────
// rk_live_<28 url-safe base64 chars>   (live keys)
// rk_test_<28 url-safe base64 chars>   (test keys)
//
// The raw key is shown to the user EXACTLY ONCE at creation. We store the
// SHA-256 hash plus the first 12 chars (prefix + first 4 base64 chars) for
// the dashboard display ("rk_live_a3f8…").

const RAW_BYTES = 21; // 21 bytes -> 28 base64 chars (no padding)

function generateRawKey(env: ApiKeyEnv): { raw: string; prefix: string; hash: string } {
  const envSeg = env === 'LIVE' ? 'live' : 'test';
  const tail = randomBytes(RAW_BYTES).toString('base64url');
  const raw = `rk_${envSeg}_${tail}`;
  const prefix = raw.slice(0, 12); // e.g. "rk_live_a3f8"
  const hash = sha256(raw);
  return { raw, prefix, hash };
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface CreateTenantInput {
  name: string;
  billingEmail?: string;
  ownerUserId?: string;
  plan?: TenantPlan;
}

export interface IssuedKey {
  /** ONLY returned once at creation. Never retrievable afterwards. */
  raw: string;
  id: string;
  prefix: string;
  environment: ApiKeyEnv;
  createdAt: Date;
}

export class ApiKeyService {
  async createTenant(input: CreateTenantInput): Promise<{ tenantId: string }> {
    const tenant = await prisma.tenant.create({
      data: {
        name: input.name,
        billingEmail: input.billingEmail,
        ownerUserId: input.ownerUserId,
        plan: input.plan ?? 'FREE',
      },
      select: { id: true },
    });
    logger.info({ tenantId: tenant.id, name: input.name }, 'tenant created');
    return { tenantId: tenant.id };
  }

  async issueKey(
    tenantId: string,
    opts: { label: string; environment?: ApiKeyEnv; expiresAt?: Date } = { label: 'default' },
  ): Promise<IssuedKey> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, status: true },
    });
    if (!tenant) throw new Error(`tenant not found: ${tenantId}`);
    if (tenant.status !== 'ACTIVE') throw new Error(`tenant not active: ${tenantId}`);

    const env: ApiKeyEnv = opts.environment ?? 'LIVE';
    const { raw, prefix, hash } = generateRawKey(env);
    const row = await prisma.apiKey.create({
      data: {
        tenantId,
        label: opts.label,
        keyHash: hash,
        keyPrefix: prefix,
        environment: env,
        expiresAt: opts.expiresAt,
      },
      select: { id: true, createdAt: true },
    });
    logger.info({ tenantId, apiKeyId: row.id, prefix }, 'api key issued');
    return { raw, id: row.id, prefix, environment: env, createdAt: row.createdAt };
  }

  async revokeKey(apiKeyId: string): Promise<void> {
    await prisma.apiKey.update({
      where: { id: apiKeyId },
      data: { revokedAt: new Date() },
    });
    logger.info({ apiKeyId }, 'api key revoked');
  }

  /**
   * Resolve a raw bearer token to a tenant context.
   * Performs a hash lookup (constant cost regardless of how many keys exist).
   * Updates lastUsedAt asynchronously — caller should not await.
   */
  async resolveBearer(raw: string): Promise<ResolvedKey | null> {
    if (!raw || (!raw.startsWith('rk_live_') && !raw.startsWith('rk_test_'))) {
      return null;
    }
    const hash = sha256(raw);
    const row = await prisma.apiKey.findUnique({
      where: { keyHash: hash },
      select: {
        id: true,
        tenantId: true,
        environment: true,
        expiresAt: true,
        revokedAt: true,
        tenant: { select: { plan: true, status: true } },
      },
    });
    if (!row) return null;
    if (row.revokedAt) return null;
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;
    if (row.tenant.status !== 'ACTIVE') return null;

    // Fire-and-forget lastUsedAt update; do not block the request.
    void prisma.apiKey
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch((err: unknown) => logger.warn({ err, apiKeyId: row.id }, 'lastUsedAt update failed'));

    return {
      apiKeyId: row.id,
      tenantId: row.tenantId,
      environment: row.environment,
      plan: row.tenant.plan,
      status: row.tenant.status,
    };
  }
}

export interface ResolvedKey {
  apiKeyId: string;
  tenantId: string;
  environment: ApiKeyEnv;
  plan: TenantPlan;
  status: TenantStatus;
}

let svc: ApiKeyService | null = null;
export function getApiKeyService(): ApiKeyService {
  if (!svc) svc = new ApiKeyService();
  return svc;
}
