// ── Tenant userId composition ────────────────────────────────────────────────
// Multi-tenant isolation in the graph/vector store is enforced by composing
// userIds rather than by adding a tenantId property to every node. Decision
// recorded in ADR-0003 §2.3.
//
// Rationale: zero schema-migration cost, strict isolation by construction
// (cross-tenant queries are impossible without explicit code that reverses
// the composition), and works on Neo4j Community Edition.
//
// Format: `tenant_<tenantId>__<externalUserId>`
//   - The double-underscore separator is unlikely to occur in CUIDs or
//     opaque IDs that customers will pass us.
//   - The `tenant_` prefix is reserved — first-party (consumer) Recome
//     userIds (raw Prisma user.id, which is a CUID) cannot collide.
//
// THIS HELPER IS THE ONLY PLACE TENANT IDS COMPOSE/DECOMPOSE. A single
// bug here would leak data across tenants; a test asserts the round-trip
// is invertible and that composed IDs always start with the reserved prefix.

const PREFIX = 'tenant_';
const SEP = '__';
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function composeTenantUserId(tenantId: string, externalUserId: string): string {
  if (!ID_PATTERN.test(tenantId)) {
    throw new Error(`invalid tenantId: must match ${ID_PATTERN.source}`);
  }
  if (!ID_PATTERN.test(externalUserId)) {
    throw new Error(`invalid externalUserId: must match ${ID_PATTERN.source}`);
  }
  // The input regex allows `_`, so a literal `__` is technically valid but
  // would collide with our separator and let decompose() split at the wrong
  // place — a cross-tenant leak risk. Reject explicitly.
  if (tenantId.includes(SEP) || externalUserId.includes(SEP)) {
    throw new Error('tenantId / externalUserId must not contain "__" (reserved separator)');
  }
  return `${PREFIX}${tenantId}${SEP}${externalUserId}`;
}

export interface DecomposedUserId {
  tenantId: string;
  externalUserId: string;
}

export function decomposeTenantUserId(composed: string): DecomposedUserId | null {
  if (!composed.startsWith(PREFIX)) return null;
  const rest = composed.slice(PREFIX.length);
  const sepIdx = rest.indexOf(SEP);
  if (sepIdx < 0) return null;
  return {
    tenantId: rest.slice(0, sepIdx),
    externalUserId: rest.slice(sepIdx + SEP.length),
  };
}

export function isTenantScopedUserId(userId: string): boolean {
  return userId.startsWith(PREFIX);
}
