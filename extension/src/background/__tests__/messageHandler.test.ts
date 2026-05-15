import { handleMessage } from '../messageHandler';

// ── Mock chrome APIs ────────────────────────────────────────────────────────────

let syncStorage: Record<string, any> = {};
let localStorage: Record<string, any> = {};

globalThis.chrome = {
  storage: {
    sync: {
      get: jest
        .fn()
        .mockImplementation((key: string) => Promise.resolve({ [key]: syncStorage[key] })),
      set: jest.fn().mockImplementation((obj: Record<string, any>) => {
        Object.assign(syncStorage, obj);
        return Promise.resolve();
      }),
    },
    local: {
      get: jest.fn().mockImplementation((key: string | null) => {
        if (key === null) return Promise.resolve({ ...localStorage });
        return Promise.resolve({ [key]: localStorage[key] });
      }),
      set: jest.fn().mockImplementation((obj: Record<string, any>) => {
        Object.assign(localStorage, obj);
        return Promise.resolve();
      }),
      remove: jest.fn().mockImplementation((key: string) => {
        delete localStorage[key];
        return Promise.resolve();
      }),
    },
  },
  runtime: { sendMessage: jest.fn() },
  tabs: { query: jest.fn().mockResolvedValue([]), sendMessage: jest.fn() },
} as any;

// ── Mock dependencies ────────────────────────────────────────────────────────────

const mockProcessContent = jest.fn().mockResolvedValue({ action: 'keep', score: 0.2, reasons: [] });
const mockLearnFeedback = jest.fn().mockResolvedValue(undefined);
const mockGetMemoryCount = jest.fn().mockResolvedValue(42);
const mockGetEntityCount = jest.fn().mockResolvedValue(10);
const mockGetMidTermCards = jest.fn().mockResolvedValue([{ id: '1' }, { id: '2' }]);
const mockRetrieve = jest.fn().mockResolvedValue({ entries: [] });
const mockGetAllEntities = jest.fn().mockResolvedValue([]);
const mockGetAllRelations = jest.fn().mockResolvedValue([]);
const mockBlockForever = jest.fn().mockResolvedValue(undefined);
const mockUnblockTopic = jest.fn().mockResolvedValue(undefined);
const mockLikeForever = jest.fn().mockResolvedValue(undefined);
const mockUnlikeTopic = jest.fn().mockResolvedValue(undefined);
const mockSwitchContext = jest.fn().mockResolvedValue(undefined);
const mockClearAll = jest.fn().mockResolvedValue(undefined);
const mockRecordSearch = jest.fn().mockResolvedValue(undefined);
const mockRecordImplicitSignal = jest.fn().mockResolvedValue(undefined);
const mockInvalidateSettingsCache = jest.fn();

const mockMemoryService = {
  getMemoryCount: mockGetMemoryCount,
  getMidTermCards: mockGetMidTermCards,
  retrieve: mockRetrieve,
  blockForever: mockBlockForever,
  unblockTopic: mockUnblockTopic,
  likeForever: mockLikeForever,
  unlikeTopic: mockUnlikeTopic,
  switchContext: mockSwitchContext,
  clearAll: mockClearAll,
  recordSearch: mockRecordSearch,
  recordImplicitSignal: mockRecordImplicitSignal,
};

const mockGraph = {
  getEntityCount: mockGetEntityCount,
  getAllEntities: mockGetAllEntities,
  getAllRelations: mockGetAllRelations,
};

jest.mock('@intelligence/index', () => ({
  getIntelligenceService: jest.fn(() => ({
    processContent: mockProcessContent,
    learnFeedback: mockLearnFeedback,
    getMemoryService: () => mockMemoryService,
    getGraph: () => mockGraph,
    invalidateSettingsCache: mockInvalidateSettingsCache,
    // IMPLICIT_SIGNAL handler calls this directly on IntelligenceService
    // (not on MemoryService). Forwarding to mockRecordImplicitSignal keeps
    // assertions consistent across the existing and new platform-attribution
    // tests.
    recordImplicitSignalWithGraphBridge: (...args: unknown[]) => mockRecordImplicitSignal(...args),
  })),
}));

const mockScoreEntities = jest.fn().mockResolvedValue({ items: [{ id: '1', score: 0.8 }] });
const mockRecordIntent = jest.fn().mockResolvedValue({ intentId: 'int-1', action: 'recorded' });
const mockRevokeIntent = jest.fn().mockResolvedValue(undefined);

jest.mock('@brain/BrainFacade', () => ({
  getBrain: jest.fn(() => ({
    scoreEntities: mockScoreEntities,
    recordIntent: mockRecordIntent,
    revokeIntent: mockRevokeIntent,
  })),
}));

const mockChatMessage = jest.fn().mockResolvedValue({ text: 'response' });
const mockGetAIProviderName = jest.fn().mockResolvedValue('openai');
const mockCompareProducts = jest.fn().mockResolvedValue({ comparison: 'result' });
const mockWatchlistAdd = jest.fn().mockResolvedValue({ id: 'w1' });
const mockWatchlistGetAll = jest.fn().mockResolvedValue([]);
const mockWatchlistRemove = jest.fn().mockResolvedValue(undefined);
const mockGetContext = jest.fn().mockResolvedValue({ intents: [] });

jest.mock('@agent/index', () => ({
  getAgent: jest.fn(() => ({
    chat_message: mockChatMessage,
    chat: { getAIProviderName: mockGetAIProviderName },
    compareProducts: mockCompareProducts,
    watchlist: {
      add: mockWatchlistAdd,
      getAll: mockWatchlistGetAll,
      remove: mockWatchlistRemove,
    },
    getContext: mockGetContext,
  })),
}));

const mockGetPending = jest.fn().mockResolvedValue([{ id: 'ins-1', type: 'trend' }]);
const mockDismiss = jest.fn().mockResolvedValue(undefined);
const mockMarkShown = jest.fn().mockResolvedValue(undefined);

jest.mock('@agent/insights', () => ({
  InsightStore: jest.fn().mockImplementation(() => ({
    getPending: mockGetPending,
    dismiss: mockDismiss,
    markShown: mockMarkShown,
  })),
}));

jest.mock('@shared/EventBus', () => ({
  eventBus: { emit: jest.fn(), on: jest.fn(), off: jest.fn() },
}));

jest.mock('@shared/Logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock('../stats', () => ({
  readStats: jest.fn().mockResolvedValue({
    total_hidden: 5,
    hidden_today: 2,
    total_boosted: 3,
    blocked_topics: { crypto: 4, politics: 2 },
  }),
}));

jest.mock('../decisionLog', () => ({
  appendDecision: jest.fn(),
  getDecisionLog: jest.fn().mockReturnValue([]),
  clearDecisionLog: jest.fn(),
}));

jest.mock('../achievements', () => ({
  trackProductsScored: jest.fn().mockResolvedValue(undefined),
  trackWatchlistAdd: jest.fn().mockResolvedValue(undefined),
}));

// GraphSync forwards signals to the cloud intelligence stack.
// Unit tests mock it out — the cloud round-trip is exercised by the
// cloud/src/intelligence/__tests__/thesis-flow.integration.test.ts suite.
const mockEnqueueGraphSignal = jest.fn();
jest.mock('../cloudSync/GraphSyncService', () => ({
  enqueueGraphSignal: (...args: unknown[]) => mockEnqueueGraphSignal(...args),
  initGraphSync: jest.fn(),
  getGraphSync: jest.fn(() => null),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────────

function dispatch(message: any): Promise<any> {
  return new Promise((resolve) => {
    handleMessage(message, {} as any, resolve);
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────────

describe('messageHandler', () => {
  beforeEach(() => {
    syncStorage = {};
    localStorage = {};
    jest.clearAllMocks();
  });

  describe('PROCESS_CONTENT', () => {
    it('calls intelligence service processContent and returns ok result', async () => {
      const payload = {
        id: 'c1',
        title: 'Test',
        platform: 'youtube',
        topics: [],
        entities: [],
        url: '',
      };
      const res = await dispatch({ type: 'PROCESS_CONTENT', payload });

      expect(res.success).toBe(true);
      expect(mockProcessContent).toHaveBeenCalledWith(payload);
      expect(res.data).toEqual({ action: 'keep', score: 0.2, reasons: [] });
    });

    it('emits CONTENT_HIDDEN event when action is hide', async () => {
      mockProcessContent.mockResolvedValueOnce({ action: 'hide', score: -0.8, reasons: [] });
      const { eventBus } = require('@shared/EventBus');

      const payload = {
        id: 'c2',
        title: 'Test',
        platform: 'youtube',
        topics: ['crypto'],
        entities: [],
        url: '',
      };
      await dispatch({ type: 'PROCESS_CONTENT', payload });

      expect(eventBus.emit).toHaveBeenCalledWith('CONTENT_HIDDEN', {
        contentId: 'c2',
        topics: ['crypto'],
      });
    });

    it('emits CONTENT_BOOSTED event when action is boost', async () => {
      mockProcessContent.mockResolvedValueOnce({ action: 'boost', score: 0.9, reasons: [] });
      const { eventBus } = require('@shared/EventBus');

      const payload = {
        id: 'c3',
        title: 'Test',
        platform: 'youtube',
        topics: ['gaming'],
        entities: [],
        url: '',
      };
      await dispatch({ type: 'PROCESS_CONTENT', payload });

      expect(eventBus.emit).toHaveBeenCalledWith('CONTENT_BOOSTED', {
        contentId: 'c3',
        topics: ['gaming'],
      });
    });
  });

  describe('LEARN_FEEDBACK', () => {
    it('routes to intelligence service learnFeedback', async () => {
      const content = {
        id: 'c1',
        title: 'Test',
        platform: 'youtube',
        topics: [],
        entities: [],
        url: '',
      };
      const res = await dispatch({
        type: 'LEARN_FEEDBACK',
        payload: { content, feedback: 'not_interested' },
      });

      expect(res.success).toBe(true);
      expect(mockLearnFeedback).toHaveBeenCalledWith(content, 'not_interested');
    });
  });

  describe('GET_SETTINGS', () => {
    it('returns settings from chrome.storage.sync', async () => {
      syncStorage['recome_settings'] = { enabled: true, aggressiveness: 0.8 };
      const res = await dispatch({ type: 'GET_SETTINGS', payload: undefined });

      expect(res.success).toBe(true);
      expect(res.data).toEqual({ enabled: true, aggressiveness: 0.8 });
    });

    it('returns default settings when none are stored', async () => {
      const res = await dispatch({ type: 'GET_SETTINGS', payload: undefined });

      expect(res.success).toBe(true);
      expect(res.data).toEqual({
        enabled: true,
        aggressiveness: 0.5,
        platforms: {
          youtube: true,
          amazon: true,
          twitter: true,
          facebook: true,
          instagram: true,
          ebay: true,
          walmart: true,
          linkedin: true,
        },
      });
    });
  });

  describe('GET_STATS', () => {
    it('returns aggregated stats', async () => {
      const res = await dispatch({ type: 'GET_STATS', payload: undefined });

      expect(res.success).toBe(true);
      expect(res.data).toMatchObject({
        total_hidden: 5,
        hidden_today: 2,
        total_boosted: 3,
        active_patterns: 2,
        memory_entries: 42,
        graph_entities: 10,
      });
      expect(res.data.top_blocked_topics).toEqual([
        { topic: 'crypto', count: 4 },
        { topic: 'politics', count: 2 },
      ]);
    });
  });

  describe('GET_PENDING_INSIGHTS', () => {
    it('returns pending insights from InsightStore', async () => {
      const res = await dispatch({ type: 'GET_PENDING_INSIGHTS', payload: undefined });

      expect(res.success).toBe(true);
      expect(mockGetPending).toHaveBeenCalled();
      expect(res.data).toEqual([{ id: 'ins-1', type: 'trend' }]);
    });
  });

  describe('INSIGHT_DISMISSED', () => {
    it('calls InsightStore.dismiss()', async () => {
      const res = await dispatch({ type: 'INSIGHT_DISMISSED', payload: { insightId: 'ins-1' } });

      expect(res.success).toBe(true);
      expect(mockDismiss).toHaveBeenCalledWith('ins-1');
    });
  });

  describe('INSIGHT_SHOWN', () => {
    it('calls InsightStore.markShown()', async () => {
      const res = await dispatch({ type: 'INSIGHT_SHOWN', payload: { insightId: 'ins-1' } });

      expect(res.success).toBe(true);
      expect(mockMarkShown).toHaveBeenCalledWith('ins-1');
    });
  });

  describe('SCORE_CANDIDATES', () => {
    it('delegates to brain scoreEntities', async () => {
      const candidates = [{ id: 'p1', title: 'Product' }];
      const pageContext = { site: 'amazon', pageType: 'search' };
      const res = await dispatch({
        type: 'SCORE_CANDIDATES',
        payload: { candidates, pageContext },
      });

      expect(res.success).toBe(true);
      expect(mockScoreEntities).toHaveBeenCalledWith(candidates, pageContext);
      expect(res.data.items).toHaveLength(1);
    });
  });

  describe('RECORD_INTENT', () => {
    it('delegates to brain recordIntent and emits event', async () => {
      const { eventBus } = require('@shared/EventBus');
      const payload = {
        source: 'overlay',
        entityType: 'product',
        entityId: 'p1',
        intentType: 'want',
      };
      const res = await dispatch({ type: 'RECORD_INTENT', payload });

      expect(res.success).toBe(true);
      expect(mockRecordIntent).toHaveBeenCalledWith('overlay', 'product', 'p1', 'want', undefined);
      expect(eventBus.emit).toHaveBeenCalledWith('MEMORY_WRITTEN', {
        topicKey: 'intent:p1',
        type: 'want',
      });
    });
  });

  describe('SAVE_SETTINGS', () => {
    it('merges with existing settings and saves', async () => {
      syncStorage['recome_settings'] = { enabled: true, aggressiveness: 0.5 };
      const res = await dispatch({ type: 'SAVE_SETTINGS', payload: { aggressiveness: 0.9 } });

      expect(res.success).toBe(true);
      expect(res.data).toEqual({ enabled: true, aggressiveness: 0.9 });
      expect(mockInvalidateSettingsCache).toHaveBeenCalled();
    });
  });

  describe('BLOCK_TOPIC', () => {
    it('calls memory service blockForever and emits event', async () => {
      const { eventBus } = require('@shared/EventBus');
      const res = await dispatch({ type: 'BLOCK_TOPIC', payload: { topic: 'crypto' } });

      expect(res.success).toBe(true);
      expect(mockBlockForever).toHaveBeenCalledWith('crypto');
      expect(eventBus.emit).toHaveBeenCalledWith('TOPIC_BLOCKED', { topic: 'crypto' });
    });
  });

  describe('CLEAR_ALL_DATA', () => {
    it('clears memory and storage', async () => {
      const res = await dispatch({ type: 'CLEAR_ALL_DATA', payload: undefined });

      expect(res.success).toBe(true);
      expect(mockClearAll).toHaveBeenCalled();
      expect(chrome.storage.local.remove).toHaveBeenCalledWith([
        'recome_stats',
        'recome_api_keys',
        'recome_focus',
      ]);
    });
  });

  describe('TRACK_SEARCH', () => {
    it('records search in memory service and emits event', async () => {
      const { eventBus } = require('@shared/EventBus');
      const res = await dispatch({
        type: 'TRACK_SEARCH',
        payload: { query: 'headphones', platform: 'amazon' },
      });

      expect(res.success).toBe(true);
      expect(mockRecordSearch).toHaveBeenCalledWith('headphones', 'amazon');
      expect(eventBus.emit).toHaveBeenCalledWith('SEARCH_TRACKED', {
        query: 'headphones',
        platform: 'amazon',
      });
    });
  });

  describe('AGENT_CHAT', () => {
    it('delegates to agent chat_message', async () => {
      const payload = {
        message: 'hello',
        candidates: [],
        pageContext: { site: 'amazon', pageType: 'search' },
      };
      const res = await dispatch({ type: 'AGENT_CHAT', payload });

      expect(res.success).toBe(true);
      expect(mockChatMessage).toHaveBeenCalledWith('hello', [], {
        site: 'amazon',
        pageType: 'search',
      });
    });
  });

  describe('GET_DECISION_LOG', () => {
    it('returns decision log entries', async () => {
      const res = await dispatch({ type: 'GET_DECISION_LOG', payload: undefined });

      expect(res.success).toBe(true);
      expect(res.data).toEqual([]);
    });
  });

  describe('IMPLICIT_SIGNAL', () => {
    it('records implicit signal and emits MEMORY_WRITTEN event', async () => {
      const { eventBus } = require('@shared/EventBus');
      const payload = {
        topics: ['tech'],
        entities: ['product-1'],
        platform: 'amazon',
        signalType: 'view',
        contentId: 'c1',
        contentTitle: 'Test Product',
        confidence: 0.9,
      };
      const res = await dispatch({ type: 'IMPLICIT_SIGNAL', payload });

      expect(res.success).toBe(true);
      expect(mockRecordImplicitSignal).toHaveBeenCalledWith({
        topics: ['tech'],
        entities: ['product-1'],
        platform: 'amazon',
        signalType: 'view',
        contentId: 'c1',
        contentTitle: 'Test Product',
        confidenceOverride: 0.9,
      });
      expect(eventBus.emit).toHaveBeenCalledWith('MEMORY_WRITTEN', {
        topicKey: 'implicit:view',
        type: 'view',
      });
    });

    // Regression guard for the April 7 audit P0:
    //   "Reddit signals lose platform attribution"
    // Reddit must travel through the pipeline with platform preserved exactly
    // so cross-platform research trails can attribute the hop correctly.
    it.each(['reddit', 'youtube', 'amazon', 'twitter', 'instagram', 'tiktok', 'linkedin'] as const)(
      'preserves platform="%s" attribution through the IMPLICIT_SIGNAL path',
      async (platform) => {
        mockRecordImplicitSignal.mockClear();
        const res = await dispatch({
          type: 'IMPLICIT_SIGNAL',
          payload: {
            topics: ['eames-lounge-chair'],
            entities: ['eames-lounge-chair'],
            platform,
            signalType: 'dwell_extended',
            contentId: `c-${platform}`,
            contentTitle: `Eames discussion on ${platform}`,
          },
        });

        expect(res.success).toBe(true);
        expect(mockRecordImplicitSignal).toHaveBeenCalledTimes(1);
        const callArg = mockRecordImplicitSignal.mock.calls[0][0];
        expect(callArg.platform).toBe(platform);
        expect(callArg.topics).toEqual(['eames-lounge-chair']);
      },
    );
  });

  describe('GET_MEMORY_PACK', () => {
    it('retrieves memory pack for given context bucket', async () => {
      const res = await dispatch({
        type: 'GET_MEMORY_PACK',
        payload: { context_bucket: 'shopping' },
      });

      expect(res.success).toBe(true);
      expect(mockRetrieve).toHaveBeenCalledWith('shopping');
    });
  });

  describe('GET_GRAPH_DATA', () => {
    it('returns entities and relations from graph', async () => {
      mockGetAllEntities.mockResolvedValueOnce([{ id: 'e1' }]);
      mockGetAllRelations.mockResolvedValueOnce([{ id: 'r1' }]);
      const res = await dispatch({ type: 'GET_GRAPH_DATA', payload: undefined });

      expect(res.success).toBe(true);
      expect(res.data).toEqual({ entities: [{ id: 'e1' }], relations: [{ id: 'r1' }] });
    });
  });

  describe('UNBLOCK_TOPIC', () => {
    it('calls memory service unblockTopic', async () => {
      const res = await dispatch({ type: 'UNBLOCK_TOPIC', payload: { topic: 'crypto' } });

      expect(res.success).toBe(true);
      expect(mockUnblockTopic).toHaveBeenCalledWith('crypto');
    });
  });

  describe('LIKE_TOPIC', () => {
    it('calls memory service likeForever and emits event', async () => {
      const { eventBus } = require('@shared/EventBus');
      const res = await dispatch({ type: 'LIKE_TOPIC', payload: { topic: 'gaming' } });

      expect(res.success).toBe(true);
      expect(mockLikeForever).toHaveBeenCalledWith('gaming');
      expect(eventBus.emit).toHaveBeenCalledWith('TOPIC_LIKED', { topic: 'gaming' });
    });
  });

  describe('UNLIKE_TOPIC', () => {
    it('calls memory service unlikeTopic', async () => {
      const res = await dispatch({ type: 'UNLIKE_TOPIC', payload: { topic: 'gaming' } });

      expect(res.success).toBe(true);
      expect(mockUnlikeTopic).toHaveBeenCalledWith('gaming');
    });
  });

  describe('SWITCH_CONTEXT', () => {
    it('calls memory service switchContext and emits event', async () => {
      const { eventBus } = require('@shared/EventBus');
      const res = await dispatch({ type: 'SWITCH_CONTEXT', payload: { context: 'work' } });

      expect(res.success).toBe(true);
      expect(mockSwitchContext).toHaveBeenCalledWith('work');
      expect(eventBus.emit).toHaveBeenCalledWith('CONTEXT_SWITCHED', { context: 'work' });
      expect(res.data).toBe('work');
    });
  });

  describe('EXPORT_DATA', () => {
    it('exports memory, graph, and stats', async () => {
      mockRetrieve.mockResolvedValueOnce({ entries: [{ id: 'e1' }] });
      mockGetAllEntities.mockResolvedValueOnce([{ id: 'ent-1' }]);
      const res = await dispatch({ type: 'EXPORT_DATA', payload: undefined });

      expect(res.success).toBe(true);
      expect(res.data).toHaveProperty('memory');
      expect(res.data).toHaveProperty('graph');
      expect(res.data).toHaveProperty('stats');
      expect(res.data).toHaveProperty('exported_at');
      expect(res.data.graph.entities).toEqual([{ id: 'ent-1' }]);
    });
  });

  describe('CLEAR_DECISION_LOG', () => {
    it('clears the decision log', async () => {
      const { clearDecisionLog } = require('../decisionLog');
      const res = await dispatch({ type: 'CLEAR_DECISION_LOG', payload: undefined });

      expect(res.success).toBe(true);
      expect(clearDecisionLog).toHaveBeenCalled();
    });
  });

  describe('GET_RAW_STORAGE', () => {
    it('returns local and sync storage contents', async () => {
      localStorage['some_key'] = 'some_value';
      syncStorage['recome_settings'] = { enabled: true };
      const res = await dispatch({ type: 'GET_RAW_STORAGE', payload: undefined });

      expect(res.success).toBe(true);
      expect(res.data).toHaveProperty('local');
      expect(res.data).toHaveProperty('sync');
    });
  });

  describe('SET_FOCUS', () => {
    it('sets focus topic in storage and records search', async () => {
      const res = await dispatch({ type: 'SET_FOCUS', payload: { topic: 'headphones' } });

      expect(res.success).toBe(true);
      expect(res.data.topic).toBe('headphones');
      expect(res.data.set_at).toBeDefined();
      expect(chrome.storage.local.set).toHaveBeenCalled();
      expect(mockRecordSearch).toHaveBeenCalledWith('headphones', 'focus');
    });
  });

  describe('GET_FOCUS', () => {
    it('returns current focus when not expired', async () => {
      localStorage['recome_focus'] = { topic: 'headphones', set_at: Date.now() };
      const res = await dispatch({ type: 'GET_FOCUS', payload: undefined });

      expect(res.success).toBe(true);
      expect(res.data.topic).toBe('headphones');
    });

    it('returns null and clears expired focus', async () => {
      localStorage['recome_focus'] = {
        topic: 'headphones',
        set_at: Date.now() - 8 * 24 * 60 * 60 * 1000,
      };
      const res = await dispatch({ type: 'GET_FOCUS', payload: undefined });

      expect(res.success).toBe(true);
      expect(res.data).toBeNull();
      expect(chrome.storage.local.remove).toHaveBeenCalledWith('recome_focus');
    });

    it('returns null when no focus is set', async () => {
      const res = await dispatch({ type: 'GET_FOCUS', payload: undefined });

      expect(res.success).toBe(true);
      expect(res.data).toBeNull();
    });
  });

  describe('CLEAR_FOCUS', () => {
    it('removes focus from storage', async () => {
      const res = await dispatch({ type: 'CLEAR_FOCUS', payload: undefined });

      expect(res.success).toBe(true);
      expect(chrome.storage.local.remove).toHaveBeenCalledWith('recome_focus');
    });
  });

  describe('REVOKE_INTENT', () => {
    it('delegates to brain revokeIntent', async () => {
      const res = await dispatch({ type: 'REVOKE_INTENT', payload: { intentId: 'int-1' } });

      expect(res.success).toBe(true);
      expect(mockRevokeIntent).toHaveBeenCalledWith('int-1');
    });
  });

  describe('AGENT_AI_STATUS', () => {
    it('returns AI provider status', async () => {
      const res = await dispatch({ type: 'AGENT_AI_STATUS', payload: undefined });

      expect(res.success).toBe(true);
      expect(res.data).toEqual({ providerName: 'openai', aiPowered: true });
    });
  });

  describe('AGENT_COMPARE', () => {
    it('delegates to agent compareProducts', async () => {
      const payload = {
        candidates: [{ id: 'p1' }],
        pageContext: { site: 'amazon', pageType: 'search' },
      };
      const res = await dispatch({ type: 'AGENT_COMPARE', payload });

      expect(res.success).toBe(true);
      expect(mockCompareProducts).toHaveBeenCalledWith([{ id: 'p1' }], {
        site: 'amazon',
        pageType: 'search',
      });
    });
  });

  describe('AGENT_WATCHLIST_ADD', () => {
    it('delegates to agent watchlist.add and tracks achievement', async () => {
      const payload = { entityType: 'product', entityId: 'p1', note: 'test' };
      const res = await dispatch({ type: 'AGENT_WATCHLIST_ADD', payload });

      expect(res.success).toBe(true);
      expect(mockWatchlistAdd).toHaveBeenCalledWith(payload);
      expect(res.data).toEqual({ id: 'w1' });
    });
  });

  describe('AGENT_WATCHLIST_LIST', () => {
    it('returns watchlist items', async () => {
      const res = await dispatch({ type: 'AGENT_WATCHLIST_LIST', payload: undefined });

      expect(res.success).toBe(true);
      expect(mockWatchlistGetAll).toHaveBeenCalled();
      expect(res.data).toEqual([]);
    });
  });

  describe('AGENT_WATCHLIST_REMOVE', () => {
    it('removes item from watchlist', async () => {
      const res = await dispatch({
        type: 'AGENT_WATCHLIST_REMOVE',
        payload: { watchlistItemId: 'w1' },
      });

      expect(res.success).toBe(true);
      expect(mockWatchlistRemove).toHaveBeenCalledWith('w1');
    });
  });

  describe('AGENT_CONTEXT', () => {
    it('returns agent context', async () => {
      const res = await dispatch({ type: 'AGENT_CONTEXT', payload: undefined });

      expect(res.success).toBe(true);
      expect(mockGetContext).toHaveBeenCalled();
      expect(res.data).toEqual({ intents: [] });
    });
  });

  describe('error handling', () => {
    it('returns err() when dispatch throws an Error', async () => {
      mockProcessContent.mockRejectedValueOnce(new Error('processing failed'));
      const payload = {
        id: 'c1',
        title: 'Test',
        platform: 'youtube',
        topics: [],
        entities: [],
        url: '',
      };
      const res = await dispatch({ type: 'PROCESS_CONTENT', payload });

      expect(res.success).toBe(false);
      expect(res.error).toBe('processing failed');
    });

    it('returns "Unknown error" when dispatch throws a non-Error', async () => {
      mockProcessContent.mockRejectedValueOnce('string error');
      const payload = {
        id: 'c1',
        title: 'Test',
        platform: 'youtube',
        topics: [],
        entities: [],
        url: '',
      };
      const res = await dispatch({ type: 'PROCESS_CONTENT', payload });

      expect(res.success).toBe(false);
      expect(res.error).toBe('Unknown error');
    });
  });
});
