import type { Context, Next } from 'hono';
import { getApiKeyService } from './ApiKeyService.js';
import type { ApiKeyEnv, TenantPlan } from '@prisma/client';
import { logger } from '../observability/logger.js';

// ── Tenant-scoped Hono variable bag ──────────────────────────────────────────
// Routes mounted under /v1 share this shape so handlers can read
// `c.get('tenantId')` etc. Separate from AuthVars used by /intelligence,
// because the IaaS surface authenticates with an API key, not a user JWT.
export interface TenantVars {
  Variables: {
    tenantId: string;
    apiKeyId: string;
    apiKeyEnv: ApiKeyEnv;
    plan: TenantPlan;
    /** The IaaS customer's own user identifier, from `X-User-Id` header. */
    externalUserId: string;
  };
}

// X-User-Id allowed character set — keep aligned with tenantUserId.ID_PATTERN.
const EXTERNAL_USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Authenticates `/v1/*` requests via API key.
 * Required headers:
 *   - Authorization: Bearer rk_(live|test)_<token>
 *   - X-User-Id: <external user identifier in the caller's system>
 *
 * The X-User-Id design choice: every IaaS write/query is on behalf of one
 * of the caller's end-users. We never persist their PII; the ID is just an
 * opaque handle the caller uses to look up their own user's graph later.
 */
export function apiKeyMiddleware() {
  const svc = getApiKeyService();
  return async (c: Context, next: Next): Promise<Response | void> => {
    const auth = c.req.header('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) {
      return c.json(
        { error: 'missing_bearer', message: 'Authorization: Bearer <api_key> required' },
        401,
      );
    }
    const raw = auth.slice('Bearer '.length).trim();
    const resolved = await svc.resolveBearer(raw);
    if (!resolved) {
      // Constant-time-ish — do not leak which clause failed.
      return c.json(
        { error: 'invalid_key', message: 'API key is invalid, revoked, or expired' },
        401,
      );
    }

    const externalUserId = c.req.header('X-User-Id') ?? '';
    if (!EXTERNAL_USER_ID_PATTERN.test(externalUserId) || externalUserId.includes('__')) {
      // The "__" check mirrors tenantUserId.composeTenantUserId — the
      // separator must not appear in raw inputs or namespace decomposition
      // becomes ambiguous (cross-tenant leak risk).
      return c.json(
        {
          error: 'missing_user',
          message:
            'X-User-Id header is required, must match [A-Za-z0-9_-]{1,128}, and must not contain "__"',
        },
        400,
      );
    }

    c.set('tenantId', resolved.tenantId);
    c.set('apiKeyId', resolved.apiKeyId);
    c.set('apiKeyEnv', resolved.environment);
    c.set('plan', resolved.plan);
    c.set('externalUserId', externalUserId);

    // Lightweight breadcrumb on every authenticated call. Sampled in
    // production via logger config; full audit lives in TenantUsage.
    logger.debug(
      {
        tenantId: resolved.tenantId,
        apiKeyId: resolved.apiKeyId,
        externalUserId,
        path: c.req.path,
      },
      'iaas auth',
    );

    await next();
  };
}
