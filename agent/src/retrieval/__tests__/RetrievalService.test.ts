import { RetrievalService } from '../index';

// ── Mock chrome APIs ────────────────────────────────────────────────────────────

(globalThis as any).chrome = {
  storage: {
    local: { get: jest.fn().mockResolvedValue({}), set: jest.fn().mockResolvedValue(undefined) },
    session: { get: jest.fn().mockResolvedValue({}), set: jest.fn().mockResolvedValue(undefined) },
  },
};

// ── Mock Logger ─────────────────────────────────────────────────────────────────

jest.mock('@utils/Logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// ── Mock DB ─────────────────────────────────────────────────────────────────────

jest.mock('@data/db', () => ({
  getDB: jest.fn().mockResolvedValue({
    put: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(undefined),
    getAll: jest.fn().mockResolvedValue([]),
    getAllFromIndex: jest.fn().mockResolvedValue([]),
    getAllKeys: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  }),
}));

// ── Mock BrainFacade ────────────────────────────────────────────────────────────

const mockGetRecentIntents = jest.fn();
const mockGetWatchlist = jest.fn();
jest.mock('@brain/BrainFacade', () => ({
  getBrain: jest.fn(() => ({
    getRecentIntents: mockGetRecentIntents,
    getWatchlist: mockGetWatchlist,
    getProduct: jest.fn().mockResolvedValue(null),
  })),
}));

// ── Mock KnowledgeGraph & CrossPlatformLinker ───────────────────────────────────

const mockGetCrossPlatformTopics = jest.fn();
jest.mock('@brain/graph/KnowledgeGraph', () => ({
  KnowledgeGraph: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('@brain/graph/CrossPlatformLinker', () => ({
  CrossPlatformLinker: jest.fn().mockImplementation(() => ({
    getCrossPlatformTopics: mockGetCrossPlatformTopics,
  })),
}));

// ── Mock MemoryStore ────────────────────────────────────────────────────────────

jest.mock('@intelligence/memory/storage/MemoryStore', () => ({
  MemoryStore: jest.fn().mockImplementation(() => ({})),
}));

// ── Mock CommerceRepos ──────────────────────────────────────────────────────────

jest.mock('@brain/storage/CommerceRepo', () => ({
  DecisionRepo: jest.fn().mockImplementation(() => ({
    getRecent: jest.fn().mockResolvedValue([]),
    getByCandidate: jest.fn().mockResolvedValue([]),
  })),
  ProductRepo: jest.fn().mockImplementation(() => ({
    getAll: jest.fn().mockResolvedValue([]),
  })),
  BrandRepo: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
  })),
}));

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('RetrievalService', () => {
  let service: RetrievalService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRecentIntents.mockResolvedValue([]);
    mockGetWatchlist.mockResolvedValue([]);
    mockGetCrossPlatformTopics.mockResolvedValue([]);
    service = new RetrievalService();
  });

  describe('getUserContext', () => {
    it('should return UserContext shape with all expected fields', async () => {
      const ctx = await service.getUserContext();

      expect(ctx).toHaveProperty('recentIntents');
      expect(ctx).toHaveProperty('brandPreferences');
      expect(ctx).toHaveProperty('sellerPreferences');
      expect(ctx).toHaveProperty('activeIntentTypes');
      expect(ctx).toHaveProperty('watchlist');
      expect(ctx).toHaveProperty('recentDecisions');
      expect(ctx).toHaveProperty('knownProducts');
    });

    it('should return empty arrays when brain has no data', async () => {
      const ctx = await service.getUserContext();

      expect(ctx.recentIntents).toEqual([]);
      expect(ctx.brandPreferences).toEqual([]);
      expect(ctx.sellerPreferences).toEqual([]);
      expect(ctx.activeIntentTypes).toEqual([]);
      expect(ctx.watchlist).toEqual([]);
      expect(ctx.recentDecisions).toEqual([]);
      expect(ctx.knownProducts).toEqual([]);
    });

    it('should return brand preferences from intent history', async () => {
      mockGetRecentIntents.mockResolvedValue([
        {
          id: 'i1',
          createdAt: new Date().toISOString(),
          source: 'overlay',
          entityType: 'brand',
          entityId: 'brand:sony',
          intentType: 'prefer_brand',
          scope: 'brand',
        },
      ]);

      const ctx = await service.getUserContext();

      expect(ctx.brandPreferences).toHaveLength(1);
      expect(ctx.brandPreferences[0]!.brandId).toBe('brand:sony');
      expect(ctx.brandPreferences[0]!.sentiment).toBe('positive');
    });

    it('should return active intent types', async () => {
      mockGetRecentIntents.mockResolvedValue([
        {
          id: 'i1',
          createdAt: new Date().toISOString(),
          source: 'overlay',
          entityType: 'product',
          entityId: 'product:123',
          intentType: 'interested',
          scope: 'entity',
        },
        {
          id: 'i2',
          createdAt: new Date().toISOString(),
          source: 'overlay',
          entityType: 'product',
          entityId: 'product:456',
          intentType: 'researching',
          scope: 'entity',
        },
      ]);

      const ctx = await service.getUserContext();

      expect(ctx.activeIntentTypes).toContain('interested');
      expect(ctx.activeIntentTypes).toContain('researching');
    });
  });

  describe('getCrossPlatformContext', () => {
    it('should return cross-platform topics', async () => {
      mockGetCrossPlatformTopics.mockResolvedValue([
        { topicKey: 'topic:headphones', platforms: ['amazon', 'youtube'], eventCount: 5 },
        { topicKey: 'topic:gaming', platforms: ['amazon', 'ebay'], eventCount: 3 },
      ]);

      const topics = await service.getCrossPlatformContext();

      expect(topics).toHaveLength(2);
      expect(topics[0]!.topicKey).toBe('topic:headphones');
      expect(topics[0]!.platforms).toContain('amazon');
      expect(topics[0]!.eventCount).toBe(5);
    });

    it('should return empty array on error', async () => {
      mockGetCrossPlatformTopics.mockRejectedValue(new Error('DB error'));

      const topics = await service.getCrossPlatformContext();

      expect(topics).toEqual([]);
    });
  });

  describe('getUserContext — brand intents', () => {
    it('should extract negative brand sentiment from not_interested intents', async () => {
      mockGetRecentIntents.mockResolvedValue([
        {
          id: 'i1',
          createdAt: new Date().toISOString(),
          source: 'overlay',
          entityType: 'brand',
          entityId: 'brand:sketchy_co',
          intentType: 'not_interested',
          scope: 'brand',
        },
      ]);

      const ctx = await service.getUserContext();

      expect(ctx.brandPreferences).toHaveLength(1);
      expect(ctx.brandPreferences[0]!.brandId).toBe('brand:sketchy_co');
      expect(ctx.brandPreferences[0]!.sentiment).toBe('negative');
    });

    it('should extract both positive and negative brand preferences', async () => {
      mockGetRecentIntents.mockResolvedValue([
        {
          id: 'i1',
          createdAt: new Date().toISOString(),
          source: 'overlay',
          entityType: 'brand',
          entityId: 'brand:sony',
          intentType: 'prefer_brand',
          scope: 'brand',
        },
        {
          id: 'i2',
          createdAt: new Date().toISOString(),
          source: 'overlay',
          entityType: 'brand',
          entityId: 'brand:bad_co',
          intentType: 'not_interested',
          scope: 'brand',
        },
      ]);

      const ctx = await service.getUserContext();

      expect(ctx.brandPreferences).toHaveLength(2);
      const sony = ctx.brandPreferences.find((b) => b.brandId === 'brand:sony');
      const bad = ctx.brandPreferences.find((b) => b.brandId === 'brand:bad_co');
      expect(sony!.sentiment).toBe('positive');
      expect(bad!.sentiment).toBe('negative');
    });
  });

  describe('getUserContext — seller intents', () => {
    it('should extract seller avoidance from avoid_seller intents', async () => {
      mockGetRecentIntents.mockResolvedValue([
        {
          id: 'i1',
          createdAt: new Date().toISOString(),
          source: 'overlay',
          entityType: 'seller',
          entityId: 'seller:shady_store',
          intentType: 'avoid_seller',
          scope: 'entity',
        },
      ]);

      const ctx = await service.getUserContext();

      expect(ctx.sellerPreferences).toHaveLength(1);
      expect(ctx.sellerPreferences[0]!.sellerId).toBe('seller:shady_store');
      expect(ctx.sellerPreferences[0]!.sentiment).toBe('negative');
    });

    it('should deduplicate sellers', async () => {
      mockGetRecentIntents.mockResolvedValue([
        {
          id: 'i1',
          createdAt: new Date().toISOString(),
          source: 'overlay',
          entityType: 'seller',
          entityId: 'seller:shady_store',
          intentType: 'avoid_seller',
          scope: 'entity',
        },
        {
          id: 'i2',
          createdAt: new Date().toISOString(),
          source: 'overlay',
          entityType: 'seller',
          entityId: 'seller:shady_store',
          intentType: 'avoid_seller',
          scope: 'entity',
        },
      ]);

      const ctx = await service.getUserContext();

      expect(ctx.sellerPreferences).toHaveLength(1);
    });
  });

  describe('getUserContext — watchlist items', () => {
    it('should return watchlist items from brain', async () => {
      mockGetWatchlist.mockResolvedValue([
        { id: 'w1', productId: 'p1', title: 'Widget', addedAt: new Date().toISOString() },
        { id: 'w2', productId: 'p2', title: 'Gadget', addedAt: new Date().toISOString() },
      ]);

      const ctx = await service.getUserContext();

      expect(ctx.watchlist).toHaveLength(2);
      expect((ctx.watchlist[0] as any).productId).toBe('p1');
    });
  });

  describe('getUserContext — active intent types', () => {
    it('should deduplicate intent types', async () => {
      mockGetRecentIntents.mockResolvedValue([
        {
          id: 'i1',
          createdAt: new Date().toISOString(),
          source: 'overlay',
          entityType: 'product',
          entityId: 'p1',
          intentType: 'interested',
          scope: 'entity',
        },
        {
          id: 'i2',
          createdAt: new Date().toISOString(),
          source: 'overlay',
          entityType: 'product',
          entityId: 'p2',
          intentType: 'interested',
          scope: 'entity',
        },
        {
          id: 'i3',
          createdAt: new Date().toISOString(),
          source: 'overlay',
          entityType: 'product',
          entityId: 'p3',
          intentType: 'researching',
          scope: 'entity',
        },
      ]);

      const ctx = await service.getUserContext();

      // "interested" appears twice but should be deduplicated
      expect(ctx.activeIntentTypes).toHaveLength(2);
      expect(ctx.activeIntentTypes).toContain('interested');
      expect(ctx.activeIntentTypes).toContain('researching');
    });
  });

  describe('getUserContext — error handling', () => {
    it('should propagate error when brain throws', async () => {
      mockGetRecentIntents.mockRejectedValue(new Error('Brain offline'));

      await expect(service.getUserContext()).rejects.toThrow('Brain offline');
    });
  });
});
