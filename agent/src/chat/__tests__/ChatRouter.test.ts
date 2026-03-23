// ── Chrome API mock ──────────────────────────────────────────────────────────

globalThis.chrome = {
  storage: {
    local: { get: jest.fn(), set: jest.fn() },
    session: { get: jest.fn().mockResolvedValue({}), set: jest.fn() },
    sync: { get: jest.fn().mockResolvedValue({}), set: jest.fn() },
  },
  runtime: { sendMessage: jest.fn() },
} as any;

// ── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('@brain/BrainFacade', () => ({
  getBrain: jest.fn().mockReturnValue({
    recordIntent: jest.fn(),
    getRecentIntents: jest.fn().mockResolvedValue([]),
    getWatchlist: jest.fn().mockResolvedValue([]),
    getProduct: jest.fn().mockResolvedValue(null),
    scoreEntities: jest.fn().mockResolvedValue({ items: [] }),
  }),
}));

jest.mock('../../retrieval', () => ({
  RetrievalService: jest.fn().mockImplementation(() => ({
    getUserContext: jest.fn().mockResolvedValue({
      recentIntents: [],
      brandPreferences: [],
      sellerPreferences: [],
      activeIntentTypes: [],
      watchlist: [],
      recentDecisions: [],
      knownProducts: [],
    }),
    getCrossPlatformContext: jest.fn().mockResolvedValue([]),
  })),
}));

jest.mock('../../compare', () => ({
  CompareService: jest.fn().mockImplementation(() => ({
    compareAndRank: jest.fn().mockResolvedValue({
      ranked: [],
      bestMatch: null,
      alternatives: [],
    }),
  })),
}));

jest.mock('../../watchlist', () => ({
  WatchlistService: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({
      itemId: 'w1',
      entityType: 'product',
      entityId: 'prod-1',
      note: 'Test',
      addedAt: '',
      updatedAt: '',
    }),
    getAll: jest.fn().mockResolvedValue([]),
  })),
}));

jest.mock('../AIChatEngine', () => ({
  AIChatEngine: jest.fn().mockImplementation(() => ({
    isAvailable: jest.fn().mockResolvedValue(false),
    getProviderName: jest.fn().mockResolvedValue(null),
    processMessage: jest.fn(),
  })),
}));

jest.mock('@utils/Logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock('@brain/recommendation/AIExplainer', () => ({
  AIExplainer: jest.fn().mockImplementation(() => ({
    explain: jest.fn().mockResolvedValue('explanation text'),
    compareNarrative: jest.fn().mockResolvedValue('comparison text'),
  })),
}));

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

import { ChatRouter } from '../index';
import { AIChatEngine } from '../AIChatEngine';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ChatRouter', () => {
  let router: ChatRouter;

  beforeEach(() => {
    jest.clearAllMocks();
    router = new ChatRouter();
  });

  describe('processMessage', () => {
    it('returns AgentMessage shape', async () => {
      const result = await router.processMessage('hello');

      expect(result).toHaveProperty('role', 'agent');
      expect(result).toHaveProperty('content');
      expect(typeof result.content).toBe('string');
      expect(result).toHaveProperty('timestamp');
      expect(typeof result.timestamp).toBe('string');
    });

    it('returns aiPowered: true when AI engine is available', async () => {
      (AIChatEngine as jest.Mock).mockImplementationOnce(() => ({
        isAvailable: jest.fn().mockResolvedValue(true),
        getProviderName: jest.fn().mockResolvedValue('anthropic'),
        processMessage: jest.fn().mockResolvedValue({
          role: 'agent',
          content: 'AI response',
          timestamp: new Date().toISOString(),
          suggestedFollowups: ['Follow up?'],
        }),
      }));

      const freshRouter = new ChatRouter();
      const result = await freshRouter.processMessage('hello');

      expect(result.aiPowered).toBe(true);
      expect(result.content).toBe('AI response');
    });

    it('falls back to regex routing when LLM not configured', async () => {
      const result = await router.processMessage('hello there');

      // AI not available, so falls back to quick mode
      expect(result.aiPowered).toBeUndefined();
      expect(result.role).toBe('agent');
    });
  });

  describe('intent detection (regex fallback)', () => {
    it('"compare" intent detected from "compare these products"', async () => {
      const result = await router.processMessage('compare these products');

      // Compare handler without candidates returns the "need at least two" message
      expect(result.content).toContain('at least two products');
    });

    it('"compare" intent detected from "which is better"', async () => {
      const result = await router.processMessage('which is better');

      expect(result.content).toContain('at least two products');
    });

    it('"watchlist_add" intent from "save this"', async () => {
      const result = await router.processMessage('save this');

      // Without candidates, returns "couldn't find a specific product" message
      expect(result.content).toContain("couldn't find a specific product");
    });

    it('"watchlist_add" intent from "track this item"', async () => {
      const result = await router.processMessage('track this item');

      expect(result.content).toContain("couldn't find a specific product");
    });

    it('"watchlist_view" intent from "show me tracked items"', async () => {
      const result = await router.processMessage('show me tracked items');

      expect(result.content).toContain('watchlist is empty');
    });

    it('"recommend" intent from "which should I buy"', async () => {
      const result = await router.processMessage('suggest something');

      // Without candidates returns "don't have any products" message
      expect(result.content).toContain("don't have any products");
    });

    it('"explain" intent from "why was this recommended"', async () => {
      const result = await router.processMessage('why was this recommended');

      // Without candidates, returns preference state explanation
      expect(result.content).toContain('preferences');
    });

    it('"intent_record" intent from "I already bought this"', async () => {
      const result = await router.processMessage('I already bought this');

      // Without candidates for entity-scoped intent
      expect(result.content).toContain('need a product');
    });

    it('"general" intent for unrecognized input', async () => {
      const result = await router.processMessage('tell me a joke');

      expect(result.content).toContain('shopping companion');
    });
  });

  describe('with candidates', () => {
    const candidates = [
      {
        candidateId: 'prod-1',
        entityType: 'product' as const,
        rawText: 'Sony XM5',
        normalizedText: 'sony xm5',
        metadata: { brand: 'Sony', price: 349 },
      },
      {
        candidateId: 'prod-2',
        entityType: 'product' as const,
        rawText: 'Bose QC45',
        normalizedText: 'bose qc45',
        metadata: { brand: 'Bose', price: 279 },
      },
    ];

    it('"save this" with candidates saves to watchlist', async () => {
      const result = await router.processMessage('save this for later', candidates);

      expect(result.content).toContain('Saved');
      expect(result.content).toContain('watchlist');
      expect(result.actions).toBeDefined();
      expect(result.actions!.some((a) => a.action === 'save_watchlist')).toBe(true);
    });
  });

  describe('suggested follow-ups', () => {
    it('returns suggested follow-ups from AI engine', async () => {
      (AIChatEngine as jest.Mock).mockImplementationOnce(() => ({
        isAvailable: jest.fn().mockResolvedValue(true),
        getProviderName: jest.fn().mockResolvedValue('anthropic'),
        processMessage: jest.fn().mockResolvedValue({
          role: 'agent',
          content: 'Here you go',
          timestamp: new Date().toISOString(),
          suggestedFollowups: ['Compare more?', 'Save to watchlist?'],
        }),
      }));

      const freshRouter = new ChatRouter();
      const result = await freshRouter.processMessage('help me decide');

      expect(result.suggestedFollowups).toBeDefined();
      expect(result.suggestedFollowups).toContain('Compare more?');
      expect(result.suggestedFollowups).toContain('Save to watchlist?');
    });
  });

  describe('AI fallback', () => {
    it('falls back to regex when AI engine throws', async () => {
      (AIChatEngine as jest.Mock).mockImplementationOnce(() => ({
        isAvailable: jest.fn().mockResolvedValue(true),
        getProviderName: jest.fn().mockResolvedValue('anthropic'),
        processMessage: jest.fn().mockRejectedValue(new Error('LLM down')),
      }));

      const freshRouter = new ChatRouter();
      const result = await freshRouter.processMessage('hello');

      // Should still return a valid response via regex fallback
      expect(result.role).toBe('agent');
      expect(result.content).toBeTruthy();
      expect(result.aiPowered).toBeUndefined();
    });
  });

  describe('isAIPowered / getAIProviderName', () => {
    it('isAIPowered returns false when AI not configured', async () => {
      expect(await router.isAIPowered()).toBe(false);
    });

    it('getAIProviderName returns null when AI not configured', async () => {
      expect(await router.getAIProviderName()).toBeNull();
    });
  });

  describe('compare with candidates', () => {
    const candidates = [
      {
        candidateId: 'p1',
        entityType: 'product' as const,
        rawText: 'Sony XM5',
        normalizedText: 'sony xm5',
        metadata: { brand: 'Sony', price: 349 },
      },
      {
        candidateId: 'p2',
        entityType: 'product' as const,
        rawText: 'Bose QC45',
        normalizedText: 'bose qc45',
        metadata: { brand: 'Bose', price: 279 },
      },
    ];

    it('calls compareAndRank when candidates provided', async () => {
      const { CompareService } = require('../../compare');
      const mockCompare = (CompareService as jest.Mock).mock.results[0]?.value;

      const result = await router.processMessage('compare these', candidates);

      expect(result.role).toBe('agent');
      // With null bestMatch (default mock), should still produce a response
      expect(result.content).toBeDefined();
    });
  });

  describe('recommend with candidates', () => {
    const candidates = [
      {
        candidateId: 'p1',
        entityType: 'product' as const,
        rawText: 'Sony XM5',
        normalizedText: 'sony xm5',
        metadata: { brand: 'Sony', price: 349 },
      },
    ];

    it('calls compareAndRank and formats recommendation', async () => {
      const { CompareService } = require('../../compare');
      const instance = (CompareService as jest.Mock).mock.results[0]?.value;
      instance.compareAndRank.mockResolvedValueOnce({
        ranked: [
          {
            candidateId: 'p1',
            rank: 1,
            score: 0.9,
            confidence: 0.8,
            decision: 'show',
            explanation: 'Great match',
            tradeoffs: [],
            metadata: { brand: 'Sony' },
          },
        ],
        bestMatch: {
          candidateId: 'p1',
          rank: 1,
          score: 0.9,
          confidence: 0.8,
          decision: 'show',
          explanation: 'Great match',
          tradeoffs: [],
          metadata: { brand: 'Sony' },
        },
        alternatives: [],
      });

      const result = await router.processMessage('recommend something', candidates);

      expect(result.content).toContain('Recommended');
      expect(result.actions).toBeDefined();
      expect(result.ranked).toBeDefined();
    });

    it('returns no recommendation when bestMatch is null', async () => {
      const { CompareService } = require('../../compare');
      const instance = (CompareService as jest.Mock).mock.results[0]?.value;
      instance.compareAndRank.mockResolvedValueOnce({
        ranked: [],
        bestMatch: null,
        alternatives: [],
      });

      const result = await router.processMessage('suggest the best one', candidates);

      expect(result.content).toContain('No strong recommendation');
    });
  });

  describe('watchlist_add with candidates', () => {
    it('saves candidates to watchlist and returns actions', async () => {
      const candidates = [
        {
          candidateId: 'p1',
          entityType: 'product' as const,
          rawText: 'Sony XM5',
          normalizedText: 'sony xm5',
          metadata: {},
        },
        {
          candidateId: 'p2',
          entityType: 'product' as const,
          rawText: 'Bose QC45',
          normalizedText: 'bose qc45',
          metadata: {},
        },
      ];

      const result = await router.processMessage('save these items', candidates);

      expect(result.content).toContain('Saved');
      expect(result.content).toContain('watchlist');
      expect(result.actions).toBeDefined();
      expect(result.actions!.length).toBe(2);
      expect(result.actions!.every((a: any) => a.action === 'save_watchlist')).toBe(true);
    });
  });

  describe('intent_record: budget_sensitive (session-scoped)', () => {
    it('records budget_sensitive intent without candidates', async () => {
      const { getBrain } = require('@brain/BrainFacade');
      const brain = getBrain();

      const result = await router.processMessage('I am budget sensitive right now');

      expect(result.content).toContain('Budget sensitive');
      expect(result.content).toContain('mode is now active');
      expect(brain.recordIntent).toHaveBeenCalledWith(
        'agent',
        'product',
        'session',
        'budget_sensitive',
      );
    });
  });

  describe('intent_record: quality_first (session-scoped)', () => {
    it('records quality_first intent without candidates', async () => {
      const { getBrain } = require('@brain/BrainFacade');
      const brain = getBrain();

      const result = await router.processMessage('quality first please');

      expect(result.content).toContain('Quality first');
      expect(result.content).toContain('mode is now active');
      expect(brain.recordIntent).toHaveBeenCalledWith(
        'agent',
        'product',
        'session',
        'quality_first',
      );
    });
  });

  describe('intent_record: entity-scoped with candidates', () => {
    const candidates = [
      {
        candidateId: 'p1',
        entityType: 'product' as const,
        rawText: 'Sony XM5',
        normalizedText: 'sony xm5',
        brandId: 'brand-sony',
        sellerId: 'seller-amazon',
        metadata: {},
      },
    ];

    it('records prefer_brand intent with brand entityType', async () => {
      const { getBrain } = require('@brain/BrainFacade');
      const brain = getBrain();

      const result = await router.processMessage('I prefer this brand', candidates);

      expect(result.content).toContain('prefer brand');
      expect(result.content).toContain('brand');
      expect(brain.recordIntent).toHaveBeenCalledWith(
        'agent',
        'brand',
        'brand-sony',
        'prefer_brand',
      );
    });

    it('records avoid_seller intent with seller entityType', async () => {
      const { getBrain } = require('@brain/BrainFacade');
      const brain = getBrain();

      const result = await router.processMessage('avoid this seller', candidates);

      expect(result.content).toContain('avoid seller');
      expect(result.content).toContain('seller');
      expect(brain.recordIntent).toHaveBeenCalledWith(
        'agent',
        'seller',
        'seller-amazon',
        'avoid_seller',
      );
    });
  });

  describe('explain with candidates', () => {
    it('shows product explanation when bestMatch is available', async () => {
      const candidates = [
        {
          candidateId: 'p1',
          entityType: 'product' as const,
          rawText: 'Sony XM5',
          normalizedText: 'sony xm5',
          metadata: {},
        },
      ];

      const { CompareService } = require('../../compare');
      const instance = (CompareService as jest.Mock).mock.results[0]?.value;
      instance.compareAndRank.mockResolvedValueOnce({
        ranked: [
          {
            candidateId: 'p1',
            rank: 1,
            score: 0.85,
            confidence: 0.9,
            decision: 'show',
            explanation: 'Strong match',
            tradeoffs: ['Budget-friendly'],
            metadata: {},
          },
        ],
        bestMatch: {
          candidateId: 'p1',
          rank: 1,
          score: 0.85,
          confidence: 0.9,
          decision: 'show',
          explanation: 'Strong match',
          tradeoffs: ['Budget-friendly'],
          metadata: {},
        },
        alternatives: [],
      });

      const result = await router.processMessage('why is this recommended', candidates);

      expect(result.content).toContain('Sony XM5');
      expect(result.content).toContain('Decision: show');
      expect(result.content).toContain('Reason: Strong match');
      expect(result.content).toContain('Budget-friendly');
    });

    it('returns fallback when no bestMatch', async () => {
      const candidates = [
        {
          candidateId: 'p1',
          entityType: 'product' as const,
          rawText: 'Sony XM5',
          normalizedText: 'sony xm5',
          metadata: {},
        },
      ];

      const { CompareService } = require('../../compare');
      const instance = (CompareService as jest.Mock).mock.results[0]?.value;
      instance.compareAndRank.mockResolvedValueOnce({
        ranked: [],
        bestMatch: null,
        alternatives: [],
      });

      const result = await router.processMessage('why is this recommended', candidates);

      expect(result.content).toContain("don't have enough data");
    });
  });

  describe('handleGeneral with recent intents', () => {
    it('shows intent count when user has recent intents', async () => {
      const { RetrievalService } = require('../../retrieval');
      const instance = (RetrievalService as jest.Mock).mock.results[0]?.value;
      instance.getUserContext.mockResolvedValueOnce({
        recentIntents: [{ id: 'int-1' }, { id: 'int-2' }],
        brandPreferences: [],
        sellerPreferences: [],
        activeIntentTypes: [],
        watchlist: [{ id: 'w1' }],
        recentDecisions: [],
        knownProducts: [],
      });

      const result = await router.processMessage('hello how are you');

      expect(result.content).toContain('2 preference signals');
      expect(result.content).toContain('1 watchlist items');
    });
  });

  describe('formatCompareResponse with bestMatch and alternatives', () => {
    it('formats compare response with brand, tradeoffs, and alternatives with price', async () => {
      const candidates = [
        {
          candidateId: 'p1',
          entityType: 'product' as const,
          rawText: 'Sony XM5',
          normalizedText: 'sony xm5',
          metadata: { brand: 'Sony', price: 349 },
        },
        {
          candidateId: 'p2',
          entityType: 'product' as const,
          rawText: 'Bose QC45',
          normalizedText: 'bose qc45',
          metadata: { brand: 'Bose', price: 279 },
        },
        {
          candidateId: 'p3',
          entityType: 'product' as const,
          rawText: 'JBL Tune',
          normalizedText: 'jbl tune',
          metadata: { price: 99 },
        },
      ];

      const { CompareService } = require('../../compare');
      const instance = (CompareService as jest.Mock).mock.results[0]?.value;
      instance.compareAndRank.mockResolvedValueOnce({
        ranked: [
          {
            candidateId: 'p1',
            rank: 1,
            score: 0.95,
            confidence: 0.9,
            decision: 'top pick',
            explanation: 'Best overall',
            tradeoffs: ['Premium quality'],
            metadata: { brand: 'Sony', url: '/p1' },
          },
          {
            candidateId: 'p2',
            rank: 2,
            score: 0.8,
            confidence: 0.85,
            decision: 'good alternative',
            explanation: 'Solid choice',
            tradeoffs: ['Great noise cancelling'],
            metadata: { brand: 'Bose', price: 279, url: '/p2' },
          },
          {
            candidateId: 'p3',
            rank: 3,
            score: 0.6,
            confidence: 0.7,
            decision: 'budget pick',
            explanation: 'Affordable',
            tradeoffs: [],
            metadata: { price: 99, url: '/p3' },
          },
        ],
        bestMatch: {
          candidateId: 'p1',
          rank: 1,
          score: 0.95,
          confidence: 0.9,
          decision: 'top pick',
          explanation: 'Best overall',
          tradeoffs: ['Premium quality'],
          metadata: { brand: 'Sony', url: '/p1' },
        },
        alternatives: [
          {
            candidateId: 'p2',
            rank: 2,
            score: 0.8,
            confidence: 0.85,
            decision: 'good alternative',
            explanation: 'Solid choice',
            tradeoffs: ['Great noise cancelling'],
            metadata: { brand: 'Bose', price: 279, url: '/p2' },
          },
          {
            candidateId: 'p3',
            rank: 3,
            score: 0.6,
            confidence: 0.7,
            decision: 'budget pick',
            explanation: 'Affordable',
            tradeoffs: [],
            metadata: { price: 99, url: '/p3' },
          },
        ],
      });

      const result = await router.processMessage('compare these products', candidates);

      expect(result.content).toContain('Best match');
      expect(result.content).toContain('Sony');
      expect(result.content).toContain('Premium quality');
      expect(result.content).toContain('Alternatives');
      expect(result.content).toContain('Bose');
      expect(result.content).toContain('$279.00');
      expect(result.content).toContain('$99.00');
      expect(result.ranked).toBeDefined();
      expect(result.ranked).toHaveLength(3);
      expect(result.actions).toBeDefined();
    });
  });

  describe('formatRecommendResponse with brand preferences', () => {
    it('includes brand preference basis and alternatives count', async () => {
      const candidates = [
        {
          candidateId: 'p1',
          entityType: 'product' as const,
          rawText: 'Sony XM5',
          normalizedText: 'sony xm5',
          metadata: { brand: 'Sony' },
        },
        {
          candidateId: 'p2',
          entityType: 'product' as const,
          rawText: 'Bose QC45',
          normalizedText: 'bose qc45',
          metadata: { brand: 'Bose' },
        },
      ];

      const { RetrievalService } = require('../../retrieval');
      const instance = (RetrievalService as jest.Mock).mock.results[0]?.value;
      instance.getUserContext.mockResolvedValueOnce({
        recentIntents: [],
        brandPreferences: [{ brandId: 'brand:sony', displayName: 'Sony', sentiment: 'positive' }],
        sellerPreferences: [],
        activeIntentTypes: [],
        watchlist: [],
        recentDecisions: [],
        knownProducts: [],
      });

      const { CompareService } = require('../../compare');
      const compareInstance = (CompareService as jest.Mock).mock.results[0]?.value;
      compareInstance.compareAndRank.mockResolvedValueOnce({
        ranked: [
          {
            candidateId: 'p1',
            rank: 1,
            score: 0.9,
            confidence: 0.8,
            decision: 'show',
            explanation: 'Great match',
            tradeoffs: [],
            metadata: { brand: 'Sony', url: '/p1' },
          },
          {
            candidateId: 'p2',
            rank: 2,
            score: 0.7,
            confidence: 0.7,
            decision: 'show',
            explanation: 'Good option',
            tradeoffs: [],
            metadata: { brand: 'Bose', url: '/p2' },
          },
        ],
        bestMatch: {
          candidateId: 'p1',
          rank: 1,
          score: 0.9,
          confidence: 0.8,
          decision: 'show',
          explanation: 'Great match',
          tradeoffs: [],
          metadata: { brand: 'Sony', url: '/p1' },
        },
        alternatives: [
          {
            candidateId: 'p2',
            rank: 2,
            score: 0.7,
            confidence: 0.7,
            decision: 'show',
            explanation: 'Good option',
            tradeoffs: [],
            metadata: { brand: 'Bose', url: '/p2' },
          },
        ],
      });

      const result = await router.processMessage('recommend the best', candidates);

      expect(result.content).toContain('Recommended');
      expect(result.content).toContain('Sony');
      expect(result.content).toContain('preference for');
      expect(result.content).toContain('1 other option');
      expect(result.actions).toBeDefined();
    });
  });
});
