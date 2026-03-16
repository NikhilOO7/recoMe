import { ProductRepo, BrandRepo, IntentRepo, DecisionRepo, WatchlistRepo } from '../CommerceRepo';

// ── In-memory stores ─────────────────────────────────────────────────────────────

const stores: Record<string, Map<string, any>> = {
  products: new Map(),
  brands: new Map(),
  intents: new Map(),
  decisions: new Map(),
  watchlists: new Map(),
};

function getKeyField(storeName: string): string {
  const keyMap: Record<string, string> = {
    products: 'id',
    brands: 'id',
    intents: 'id',
    decisions: 'id',
    watchlists: 'id',
  };
  return keyMap[storeName] ?? 'id';
}

jest.mock('../db', () => ({
  getDB: jest.fn().mockResolvedValue({
    get: jest
      .fn()
      .mockImplementation((store: string, key: string) => Promise.resolve(stores[store]?.get(key))),
    put: jest.fn().mockImplementation((store: string, value: any) => {
      const keyField = getKeyField(store);
      stores[store]?.set(value[keyField], value);
      return Promise.resolve();
    }),
    getAll: jest
      .fn()
      .mockImplementation((store: string) => Promise.resolve([...(stores[store]?.values() ?? [])])),
    getAllFromIndex: jest
      .fn()
      .mockImplementation((store: string, index: string, query: unknown) => {
        const all = [...(stores[store]?.values() ?? [])];
        if (store === 'products' && index === 'by_brand') {
          return Promise.resolve(all.filter((p) => p.brandId === query));
        }
        if (store === 'products' && index === 'by_title') {
          return Promise.resolve(all.filter((p) => p.normalizedTitle === query));
        }
        if (store === 'brands' && index === 'by_name') {
          return Promise.resolve(all.filter((b) => b.displayName === query));
        }
        if (store === 'intents' && index === 'by_entity') {
          return Promise.resolve(all.filter((i) => i.entityId === query));
        }
        if (store === 'intents' && index === 'by_type') {
          return Promise.resolve(all.filter((i) => i.intentType === query));
        }
        if (store === 'decisions' && index === 'by_candidate') {
          return Promise.resolve(all.filter((d) => d.candidateId === query));
        }
        if (store === 'watchlists' && index === 'by_entity') {
          return Promise.resolve(all.filter((w) => w.entityId === query));
        }
        return Promise.resolve([]);
      }),
    delete: jest.fn().mockImplementation((store: string, key: string) => {
      stores[store]?.delete(key);
      return Promise.resolve();
    }),
  }),
}));

// ── Tests ────────────────────────────────────────────────────────────────────────

describe('CommerceRepo', () => {
  beforeEach(() => {
    for (const store of Object.values(stores)) {
      store.clear();
    }
  });

  // ── ProductRepo ──────────────────────────────────────────────────────────────

  describe('ProductRepo', () => {
    const repo = new ProductRepo();

    it('put and get a product', async () => {
      const product = { id: 'p1', title: 'Widget', brandId: 'b1', normalizedTitle: 'widget' };
      await repo.put(product as any);
      const result = await repo.get('p1');
      expect(result).toEqual(product);
    });

    it('returns undefined for missing product', async () => {
      const result = await repo.get('nonexistent');
      expect(result).toBeUndefined();
    });

    it('getAll returns all products', async () => {
      await repo.put({ id: 'p1', title: 'A' } as any);
      await repo.put({ id: 'p2', title: 'B' } as any);
      const all = await repo.getAll();
      expect(all).toHaveLength(2);
    });

    it('delete removes a product', async () => {
      await repo.put({ id: 'p1', title: 'A' } as any);
      await repo.delete('p1');
      const result = await repo.get('p1');
      expect(result).toBeUndefined();
    });

    it('getByBrand filters by brandId', async () => {
      await repo.put({ id: 'p1', title: 'A', brandId: 'b1' } as any);
      await repo.put({ id: 'p2', title: 'B', brandId: 'b2' } as any);
      const results = await repo.getByBrand('b1');
      expect(results).toHaveLength(1);
      expect((results[0] as any).id).toBe('p1');
    });

    it('findByTitle filters by normalizedTitle', async () => {
      await repo.put({ id: 'p1', normalizedTitle: 'widget' } as any);
      await repo.put({ id: 'p2', normalizedTitle: 'gadget' } as any);
      const results = await repo.findByTitle('widget');
      expect(results).toHaveLength(1);
      expect((results[0] as any).id).toBe('p1');
    });
  });

  // ── BrandRepo ────────────────────────────────────────────────────────────────

  describe('BrandRepo', () => {
    const repo = new BrandRepo();

    it('put and get a brand', async () => {
      const brand = { id: 'b1', displayName: 'Acme' };
      await repo.put(brand as any);
      const result = await repo.get('b1');
      expect(result).toEqual(brand);
    });

    it('returns undefined for missing brand', async () => {
      const result = await repo.get('nonexistent');
      expect(result).toBeUndefined();
    });

    it('findByName filters by displayName', async () => {
      await repo.put({ id: 'b1', displayName: 'Acme' } as any);
      await repo.put({ id: 'b2', displayName: 'Beta' } as any);
      const results = await repo.findByName('Acme');
      expect(results).toHaveLength(1);
      expect((results[0] as any).id).toBe('b1');
    });

    it('getAll returns all brands', async () => {
      await repo.put({ id: 'b1', displayName: 'Acme' } as any);
      await repo.put({ id: 'b2', displayName: 'Beta' } as any);
      const all = await repo.getAll();
      expect(all).toHaveLength(2);
    });

    it('delete removes a brand', async () => {
      await repo.put({ id: 'b1', displayName: 'Acme' } as any);
      await repo.delete('b1');
      expect(await repo.get('b1')).toBeUndefined();
    });
  });

  // ── IntentRepo ───────────────────────────────────────────────────────────────

  describe('IntentRepo', () => {
    const repo = new IntentRepo();

    it('put and get an intent', async () => {
      const intent = { id: 'i1', entityId: 'p1', intentType: 'want', createdAt: '2024-01-01' };
      await repo.put(intent as any);
      const result = await repo.get('i1');
      expect(result).toEqual(intent);
    });

    it('getAll returns all intents', async () => {
      await repo.put({
        id: 'i1',
        entityId: 'p1',
        intentType: 'want',
        createdAt: '2024-01-01',
      } as any);
      await repo.put({
        id: 'i2',
        entityId: 'p2',
        intentType: 'own',
        createdAt: '2024-01-02',
      } as any);
      const all = await repo.getAll();
      expect(all).toHaveLength(2);
    });

    it('getByEntity filters by entityId', async () => {
      await repo.put({
        id: 'i1',
        entityId: 'p1',
        intentType: 'want',
        createdAt: '2024-01-01',
      } as any);
      await repo.put({
        id: 'i2',
        entityId: 'p2',
        intentType: 'own',
        createdAt: '2024-01-02',
      } as any);
      const results = await repo.getByEntity('p1');
      expect(results).toHaveLength(1);
      expect((results[0] as any).id).toBe('i1');
    });

    it('getByType filters by intentType', async () => {
      await repo.put({
        id: 'i1',
        entityId: 'p1',
        intentType: 'want',
        createdAt: '2024-01-01',
      } as any);
      await repo.put({
        id: 'i2',
        entityId: 'p2',
        intentType: 'own',
        createdAt: '2024-01-02',
      } as any);
      const results = await repo.getByType('want' as any);
      expect(results).toHaveLength(1);
      expect((results[0] as any).id).toBe('i1');
    });

    it('getRecent returns sorted and limited results', async () => {
      await repo.put({
        id: 'i1',
        entityId: 'p1',
        intentType: 'want',
        createdAt: '2024-01-01',
      } as any);
      await repo.put({
        id: 'i2',
        entityId: 'p2',
        intentType: 'own',
        createdAt: '2024-01-03',
      } as any);
      await repo.put({
        id: 'i3',
        entityId: 'p3',
        intentType: 'want',
        createdAt: '2024-01-02',
      } as any);
      const results = await repo.getRecent(2);
      expect(results).toHaveLength(2);
      expect((results[0] as any).id).toBe('i2'); // most recent first
      expect((results[1] as any).id).toBe('i3');
    });

    it('delete removes an intent', async () => {
      await repo.put({
        id: 'i1',
        entityId: 'p1',
        intentType: 'want',
        createdAt: '2024-01-01',
      } as any);
      await repo.delete('i1');
      expect(await repo.get('i1')).toBeUndefined();
    });
  });

  // ── DecisionRepo ─────────────────────────────────────────────────────────────

  describe('DecisionRepo', () => {
    const repo = new DecisionRepo();

    it('put and get a decision', async () => {
      const decision = { id: 'd1', candidateId: 'c1', createdAt: '2024-01-01' };
      await repo.put(decision as any);
      const result = await repo.get('d1');
      expect(result).toEqual(decision);
    });

    it('getByCandidate filters by candidateId', async () => {
      await repo.put({ id: 'd1', candidateId: 'c1', createdAt: '2024-01-01' } as any);
      await repo.put({ id: 'd2', candidateId: 'c2', createdAt: '2024-01-02' } as any);
      const results = await repo.getByCandidate('c1');
      expect(results).toHaveLength(1);
      expect((results[0] as any).id).toBe('d1');
    });

    it('getRecent returns sorted and limited results', async () => {
      await repo.put({ id: 'd1', candidateId: 'c1', createdAt: '2024-01-01' } as any);
      await repo.put({ id: 'd2', candidateId: 'c2', createdAt: '2024-01-03' } as any);
      const results = await repo.getRecent(1);
      expect(results).toHaveLength(1);
      expect((results[0] as any).id).toBe('d2');
    });

    it('delete removes a decision', async () => {
      await repo.put({ id: 'd1', candidateId: 'c1', createdAt: '2024-01-01' } as any);
      await repo.delete('d1');
      expect(await repo.get('d1')).toBeUndefined();
    });
  });

  // ── WatchlistRepo ────────────────────────────────────────────────────────────

  describe('WatchlistRepo', () => {
    const repo = new WatchlistRepo();

    it('put and get a watchlist item', async () => {
      const item = { id: 'w1', entityId: 'p1', title: 'Widget' };
      await repo.put(item as any);
      const result = await repo.get('w1');
      expect(result).toEqual(item);
    });

    it('getAll returns all watchlist items', async () => {
      await repo.put({ id: 'w1', entityId: 'p1' } as any);
      await repo.put({ id: 'w2', entityId: 'p2' } as any);
      const all = await repo.getAll();
      expect(all).toHaveLength(2);
    });

    it('getByEntity filters by entityId', async () => {
      await repo.put({ id: 'w1', entityId: 'p1' } as any);
      await repo.put({ id: 'w2', entityId: 'p2' } as any);
      const results = await repo.getByEntity('p1');
      expect(results).toHaveLength(1);
      expect((results[0] as any).id).toBe('w1');
    });

    it('delete removes a watchlist item', async () => {
      await repo.put({ id: 'w1', entityId: 'p1' } as any);
      await repo.delete('w1');
      expect(await repo.get('w1')).toBeUndefined();
    });

    it('returns undefined for missing watchlist item', async () => {
      const result = await repo.get('nonexistent');
      expect(result).toBeUndefined();
    });
  });
});
