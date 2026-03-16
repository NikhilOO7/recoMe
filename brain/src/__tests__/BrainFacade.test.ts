import { BrainFacade, getBrain } from '../BrainFacade';

// ── In-memory stores for CommerceRepo ────────────────────────────────────────────

const stores: Record<string, Map<string, any>> = {
  products: new Map(),
  brands: new Map(),
  sellers: new Map(),
  offers: new Map(),
  intents: new Map(),
  watchlists: new Map(),
};

jest.mock('@data/db', () => ({
  getDB: jest.fn().mockResolvedValue({
    get: jest
      .fn()
      .mockImplementation((store: string, key: string) => Promise.resolve(stores[store]?.get(key))),
    put: jest.fn().mockImplementation((store: string, value: any) => {
      stores[store]?.set(value.id, value);
      return Promise.resolve();
    }),
    getAll: jest
      .fn()
      .mockImplementation((store: string) => Promise.resolve([...(stores[store]?.values() ?? [])])),
    getAllFromIndex: jest
      .fn()
      .mockImplementation((store: string, index: string, query: unknown) => {
        const all = [...(stores[store]?.values() ?? [])];
        if (store === 'intents' && index === 'by_entity') {
          return Promise.resolve(all.filter((i) => i.entityId === query));
        }
        if (store === 'intents' && index === 'by_type') {
          return Promise.resolve(all.filter((i) => i.intentType === query));
        }
        if (store === 'products' && index === 'by_brand') {
          return Promise.resolve(all.filter((p) => p.brandId === query));
        }
        if (store === 'brands' && index === 'by_name') {
          return Promise.resolve(all.filter((b) => b.displayName === query));
        }
        if (store === 'offers' && index === 'by_product') {
          return Promise.resolve(all.filter((o) => o.productId === query));
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

// Mock IntentService
const mockRecordIntent = jest.fn().mockResolvedValue({ intentId: 'int-1', action: 'recorded' });
const mockRevokeIntent = jest.fn().mockResolvedValue(undefined);
const mockGetActiveIntentsForEntity = jest.fn().mockResolvedValue([]);
const mockGetRecentIntents = jest.fn().mockResolvedValue([]);

jest.mock('../intent/IntentService', () => ({
  IntentService: jest.fn().mockImplementation(() => ({
    recordIntent: mockRecordIntent,
    revokeIntent: mockRevokeIntent,
    getActiveIntentsForEntity: mockGetActiveIntentsForEntity,
    getRecentIntents: mockGetRecentIntents,
  })),
}));

// Mock CommerceScorer
const mockScore = jest.fn().mockResolvedValue({
  items: [{ entityId: 'p1', score: 0.8, action: 'boost' }],
});

jest.mock('../scoring/CommerceScorer', () => ({
  CommerceScorer: jest.fn().mockImplementation(() => ({
    score: mockScore,
  })),
}));

// Mock PolicyEngine
jest.mock('../policy/PolicyEngine', () => ({
  PolicyEngine: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@utils/Logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// ── Tests ────────────────────────────────────────────────────────────────────────

describe('BrainFacade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const store of Object.values(stores)) {
      store.clear();
    }
  });

  describe('getBrain() singleton', () => {
    it('returns a BrainFacade instance', () => {
      const brain = getBrain();
      expect(brain).toBeInstanceOf(BrainFacade);
    });

    it('returns the same instance on subsequent calls', () => {
      const brain1 = getBrain();
      const brain2 = getBrain();
      expect(brain1).toBe(brain2);
    });
  });

  describe('scoreEntities()', () => {
    it('delegates to CommerceScorer.score()', async () => {
      const facade = new BrainFacade();
      const candidates = [{ id: 'p1', title: 'Widget' }] as any;
      const pageContext = { site: 'amazon', pageType: 'search' } as any;

      const result = await facade.scoreEntities(candidates, pageContext);

      expect(mockScore).toHaveBeenCalledWith(candidates, pageContext, undefined);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.score).toBe(0.8);
    });

    it('passes activeContexts to scorer', async () => {
      const facade = new BrainFacade();
      const candidates = [{ id: 'p1' }] as any;
      const pageContext = { site: 'amazon' } as any;
      const contexts = [{ id: 'ctx1' }] as any;

      await facade.scoreEntities(candidates, pageContext, contexts);

      expect(mockScore).toHaveBeenCalledWith(candidates, pageContext, contexts);
    });
  });

  describe('recordIntent()', () => {
    it('delegates to IntentService.recordIntent()', async () => {
      const facade = new BrainFacade();
      const result = await facade.recordIntent('overlay', 'product', 'p1', 'want' as any, {
        note: 'test',
      });

      expect(mockRecordIntent).toHaveBeenCalledWith('overlay', 'product', 'p1', 'want', {
        note: 'test',
      });
      expect(result).toEqual({ intentId: 'int-1', action: 'recorded' });
    });
  });

  describe('revokeIntent()', () => {
    it('delegates to IntentService.revokeIntent()', async () => {
      const facade = new BrainFacade();
      await facade.revokeIntent('int-1');

      expect(mockRevokeIntent).toHaveBeenCalledWith('int-1');
    });
  });

  describe('getIntentsForEntity()', () => {
    it('delegates to IntentService.getActiveIntentsForEntity()', async () => {
      const facade = new BrainFacade();
      await facade.getIntentsForEntity('p1');

      expect(mockGetActiveIntentsForEntity).toHaveBeenCalledWith('p1');
    });
  });

  describe('getRecentIntents()', () => {
    it('delegates to IntentService.getRecentIntents()', async () => {
      const facade = new BrainFacade();
      await facade.getRecentIntents(10);

      expect(mockGetRecentIntents).toHaveBeenCalledWith(10);
    });

    it('defaults to limit of 20', async () => {
      const facade = new BrainFacade();
      await facade.getRecentIntents();

      expect(mockGetRecentIntents).toHaveBeenCalledWith(20);
    });
  });

  describe('entity management', () => {
    it('putProduct and getProduct', async () => {
      const facade = new BrainFacade();
      const product = { id: 'p1', title: 'Widget' } as any;

      await facade.putProduct(product);
      const result = await facade.getProduct('p1');
      expect(result).toEqual(product);
    });

    it('putBrand and getBrand', async () => {
      const facade = new BrainFacade();
      const brand = { id: 'b1', displayName: 'Acme' } as any;

      await facade.putBrand(brand);
      const result = await facade.getBrand('b1');
      expect(result).toEqual(brand);
    });

    it('findBrandByName', async () => {
      const facade = new BrainFacade();
      await facade.putBrand({ id: 'b1', displayName: 'Acme' } as any);
      await facade.putBrand({ id: 'b2', displayName: 'Beta' } as any);

      const results = await facade.findBrandByName('Acme');
      expect(results).toHaveLength(1);
      expect((results[0] as any).id).toBe('b1');
    });

    it('putSeller and getSeller', async () => {
      const facade = new BrainFacade();
      const seller = { id: 's1', displayName: 'ShopCo' } as any;

      await facade.putSeller(seller);
      const result = await facade.getSeller('s1');
      expect(result).toEqual(seller);
    });

    it('putOffer and getOffersForProduct', async () => {
      const facade = new BrainFacade();
      await facade.putOffer({ id: 'o1', productId: 'p1', price: 9.99 } as any);
      await facade.putOffer({ id: 'o2', productId: 'p1', price: 8.99 } as any);
      await facade.putOffer({ id: 'o3', productId: 'p2', price: 19.99 } as any);

      const results = await facade.getOffersForProduct('p1');
      expect(results).toHaveLength(2);
    });
  });

  describe('watchlist management', () => {
    it('addToWatchlist and getWatchlist', async () => {
      const facade = new BrainFacade();
      await facade.addToWatchlist({ id: 'w1', entityId: 'p1' } as any);
      await facade.addToWatchlist({ id: 'w2', entityId: 'p2' } as any);

      const items = await facade.getWatchlist();
      expect(items).toHaveLength(2);
    });

    it('removeFromWatchlist', async () => {
      const facade = new BrainFacade();
      await facade.addToWatchlist({ id: 'w1', entityId: 'p1' } as any);
      await facade.removeFromWatchlist('w1');

      const items = await facade.getWatchlist();
      expect(items).toHaveLength(0);
    });
  });
});
