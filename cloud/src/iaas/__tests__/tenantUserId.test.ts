import { describe, it, expect } from 'vitest';
import {
  composeTenantUserId,
  decomposeTenantUserId,
  isTenantScopedUserId,
} from '../tenantUserId.js';

// Single point of tenant isolation in the graph/vector store. A bug here
// is the difference between strict isolation and a cross-tenant leak.
// Test invariants, not implementation.

describe('tenantUserId', () => {
  it('round-trips arbitrary valid ids', () => {
    const cases = [
      ['t1', 'u1'],
      ['acme', 'user-42'],
      ['cuid_abc123', 'ext_xyz789'],
      ['T', 'U'],
      ['t'.repeat(64), 'u'.repeat(64)],
    ];
    for (const [t, u] of cases) {
      const composed = composeTenantUserId(t, u);
      const dec = decomposeTenantUserId(composed);
      expect(dec).toEqual({ tenantId: t, externalUserId: u });
      expect(isTenantScopedUserId(composed)).toBe(true);
    }
  });

  it('all composed ids share the reserved prefix', () => {
    // First-party consumer userIds (Prisma cuid, e.g. "cm123abc...") must
    // not collide with tenant-scoped IDs. Asserting the prefix is the
    // only contract that protects this.
    const composed = composeTenantUserId('a', 'b');
    expect(composed.startsWith('tenant_')).toBe(true);
    expect(isTenantScopedUserId('cm123randomprismacuid')).toBe(false);
  });

  it('rejects ids with disallowed characters', () => {
    expect(() => composeTenantUserId('has space', 'u')).toThrow(/invalid tenantId/);
    expect(() => composeTenantUserId('t', 'has space')).toThrow(/invalid externalUserId/);
    expect(() => composeTenantUserId('a/b', 'u')).toThrow();
    expect(() => composeTenantUserId('t', 'a:b')).toThrow();
  });

  it('rejects ids that contain the separator sequence', () => {
    // The separator is __ — disallowed in the input regex, but we
    // pin the test in case the regex is ever loosened.
    expect(() => composeTenantUserId('a__b', 'u')).toThrow();
  });

  it('decompose returns null for non-tenant-scoped strings', () => {
    expect(decomposeTenantUserId('cm123raw')).toBeNull();
    expect(decomposeTenantUserId('tenant_only')).toBeNull(); // missing separator
    expect(decomposeTenantUserId('')).toBeNull();
  });

  it('two different tenants with the same external id produce different composed ids', () => {
    const a = composeTenantUserId('tenantA', 'user42');
    const b = composeTenantUserId('tenantB', 'user42');
    expect(a).not.toBe(b);
  });
});
