import { IntentService } from '../IntentService';

// ── In-memory stores for CommerceRepo ────────────────────────────────────────

const intentsStore = new Map<string, any>();
const productsStore = new Map<string, any>();
const brandsStore = new Map<string, any>();
const sellersStore = new Map<string, any>();

// Mock the DB layer used by CommerceRepo
jest.mock('@data/db', () => ({
  getDB: jest.fn().mockResolvedValue({
    get: jest.fn().mockImplementation((store: string, key: string) => {
      if (store === 'intents') return Promise.resolve(intentsStore.get(key));
      if (store === 'products') return Promise.resolve(productsStore.get(key));
      if (store === 'brands') return Promise.resolve(brandsStore.get(key));
      if (store === 'sellers') return Promise.resolve(sellersStore.get(key));
      return Promise.resolve(undefined);
    }),
    put: jest.fn().mockImplementation((store: string, value: { id: string }) => {
      if (store === 'intents') intentsStore.set(value.id, value);
      if (store === 'products') productsStore.set(value.id, value);
      if (store === 'brands') brandsStore.set(value.id, value);
      if (store === 'sellers') sellersStore.set(value.id, value);
      return Promise.resolve();
    }),
    getAll: jest.fn().mockImplementation((store: string) => {
      if (store === 'intents') return Promise.resolve([...intentsStore.values()]);
      return Promise.resolve([]);
    }),
    getAllFromIndex: jest
      .fn()
      .mockImplementation((store: string, index: string, query: unknown) => {
        if (store === 'intents') {
          if (index === 'by_entity') {
            return Promise.resolve(
              [...intentsStore.values()].filter((i: any) => i.entityId === query),
            );
          }
          if (index === 'by_type') {
            return Promise.resolve(
              [...intentsStore.values()].filter((i: any) => i.intentType === query),
            );
          }
        }
        if (store === 'products' && index === 'by_brand') {
          return Promise.resolve(
            [...productsStore.values()].filter((p: any) => p.brandId === query),
          );
        }
        if (store === 'brands' && index === 'by_name') {
          return Promise.resolve(
            [...brandsStore.values()].filter((b: any) => b.displayName === query),
          );
        }
        if (store === 'sellers' && index === 'by_name') {
          return Promise.resolve(
            [...sellersStore.values()].filter((s: any) => s.displayName === query),
          );
        }
        return Promise.resolve([]);
      }),
    delete: jest.fn().mockImplementation((store: string, key: string) => {
      if (store === 'intents') intentsStore.delete(key);
      if (store === 'products') productsStore.delete(key);
      if (store === 'brands') brandsStore.delete(key);
      if (store === 'sellers') sellersStore.delete(key);
      return Promise.resolve();
    }),
  }),
}));

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('IntentService', () => {
  let service: IntentService;

  beforeEach(() => {
    intentsStore.clear();
    productsStore.clear();
    brandsStore.clear();
    sellersStore.clear();
    service = new IntentService();
  });

  describe('recordIntent', () => {
    it('prefer_brand resolves to brand scope', async () => {
      const result = await service.recordIntent('overlay', 'brand', 'nike', 'prefer_brand');
      expect(result.appliedScope).toBe('brand');
      expect(result.canonicalEntityId).toBe('nike');
    });

    it('avoid_seller resolves to entity scope', async () => {
      const result = await service.recordIntent('popup', 'seller', 'seller123', 'avoid_seller');
      expect(result.appliedScope).toBe('entity');
    });

    it('budget_sensitive resolves to session scope with 7-day expiry', async () => {
      const before = new Date();
      const result = await service.recordIntent(
        'agent',
        'category',
        'electronics',
        'budget_sensitive',
      );
      const after = new Date();

      expect(result.appliedScope).toBe('session');
      expect(result.expiresAt).toBeDefined();

      const expiresAt = new Date(result.expiresAt!);
      // Expiry should be ~7 days from now
      const diffDays = (expiresAt.getTime() - before.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThanOrEqual(6.9);
      expect(diffDays).toBeLessThanOrEqual(7.1);
    });

    it('one_time_need has 30-day expiry', async () => {
      const before = new Date();
      const result = await service.recordIntent('overlay', 'product', 'prod1', 'one_time_need');

      expect(result.expiresAt).toBeDefined();
      const expiresAt = new Date(result.expiresAt!);
      const diffDays = (expiresAt.getTime() - before.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThanOrEqual(29.9);
      expect(diffDays).toBeLessThanOrEqual(30.1);
    });

    it('intents without expiration config have no expiresAt', async () => {
      const result = await service.recordIntent('overlay', 'brand', 'nike', 'prefer_brand');
      expect(result.expiresAt).toBeUndefined();
    });
  });

  describe('getActiveIntentsForEntity', () => {
    it('returns matching intents for an entity', async () => {
      await service.recordIntent('overlay', 'product', 'prod1', 'interested');
      await service.recordIntent('overlay', 'product', 'prod1', 'researching');
      await service.recordIntent('overlay', 'product', 'prod2', 'interested');

      const intents = await service.getActiveIntentsForEntity('prod1');
      expect(intents).toHaveLength(2);
      expect(intents.every((i) => i.entityId === 'prod1')).toBe(true);
    });
  });

  describe('getActiveIntentsByType', () => {
    it('filters by type', async () => {
      await service.recordIntent('overlay', 'product', 'prod1', 'interested');
      await service.recordIntent('popup', 'brand', 'nike', 'prefer_brand');
      await service.recordIntent('agent', 'product', 'prod2', 'interested');

      const intents = await service.getActiveIntentsByType('interested');
      expect(intents).toHaveLength(2);
      expect(intents.every((i) => i.intentType === 'interested')).toBe(true);
    });
  });

  describe('revokeIntent', () => {
    it('removes intent so it is no longer returned', async () => {
      const result = await service.recordIntent('overlay', 'product', 'prod1', 'interested');

      // Verify intent is there
      let intents = await service.getActiveIntentsForEntity('prod1');
      expect(intents).toHaveLength(1);

      // Revoke
      await service.revokeIntent(result.intentId);

      // Verify it is gone
      intents = await service.getActiveIntentsForEntity('prod1');
      expect(intents).toHaveLength(0);
    });
  });

  describe('expired intents', () => {
    it('are not returned by getActiveIntentsForEntity', async () => {
      // Manually insert an intent with past expiresAt
      const expiredIntent = {
        id: 'expired-1',
        createdAt: new Date('2020-01-01').toISOString(),
        source: 'overlay' as const,
        entityType: 'product' as const,
        entityId: 'prod1',
        intentType: 'budget_sensitive' as const,
        scope: 'session' as const,
        confidence: 1.0,
        expiresAt: new Date('2020-01-08').toISOString(), // long expired
      };
      intentsStore.set(expiredIntent.id, expiredIntent);

      const intents = await service.getActiveIntentsForEntity('prod1');
      expect(intents).toHaveLength(0);
    });

    it('are not returned by getActiveIntentsByType', async () => {
      const expiredIntent = {
        id: 'expired-2',
        createdAt: new Date('2020-01-01').toISOString(),
        source: 'overlay' as const,
        entityType: 'product' as const,
        entityId: 'prod2',
        intentType: 'one_time_need' as const,
        scope: 'entity' as const,
        confidence: 1.0,
        expiresAt: new Date('2020-02-01').toISOString(),
      };
      intentsStore.set(expiredIntent.id, expiredIntent);

      const intents = await service.getActiveIntentsByType('one_time_need');
      expect(intents).toHaveLength(0);
    });
  });
});
