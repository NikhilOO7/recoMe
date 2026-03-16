// ── Chrome API mock ──────────────────────────────────────────────────────────

globalThis.chrome = {
  storage: {
    local: { get: jest.fn().mockResolvedValue({}), set: jest.fn() },
    session: { get: jest.fn().mockResolvedValue({}), set: jest.fn() },
    sync: { get: jest.fn().mockResolvedValue({}), set: jest.fn() },
  },
  runtime: { sendMessage: jest.fn() },
} as any;

// ── Module mocks ─────────────────────────────────────────────────────────────

const mockGetEventsAfter = jest.fn().mockResolvedValue([]);

jest.mock('@intelligence/memory/storage/MemoryStore', () => ({
  MemoryStore: jest.fn().mockImplementation(() => ({
    getEventsAfter: mockGetEventsAfter,
  })),
}));

const mockLLMIsConfigured = jest.fn().mockResolvedValue(false);
const mockLLMCall = jest.fn().mockResolvedValue(null);

jest.mock('../../llm/LLMClient', () => ({
  getLLMClient: jest.fn().mockReturnValue({
    isConfigured: mockLLMIsConfigured,
    call: mockLLMCall,
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

jest.mock('@shared/constants', () => ({
  DEFAULT_USER_ID: 'test-user',
}));

jest.mock('@brain/graph/KnowledgeGraph', () => ({
  KnowledgeGraph: jest.fn().mockImplementation(() => ({})),
}));

import { InsightDetector } from '../InsightDetector';
import type { MemoryEvent } from '@schema/memory';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<MemoryEvent> = {}): MemoryEvent {
  return {
    event_id: `evt_${Math.random().toString(36).slice(2, 8)}`,
    user_id: 'test-user',
    occurred_at: Date.now(),
    platform: 'amazon' as any,
    context_bucket: 'shopping' as any,
    topic_key: 'topic:headphones',
    action: 'interested',
    content_id: 'content-1',
    content_title: 'Sony WH-1000XM5',
    ...overrides,
  };
}

// ── Insight storage mock ─────────────────────────────────────────────────────

let storedInsights: any[] = [];

beforeEach(() => {
  storedInsights = [];
  (chrome.storage.local.get as jest.Mock).mockImplementation(async () => {
    return { recome_insights: storedInsights };
  });
  (chrome.storage.local.set as jest.Mock).mockImplementation(async (data: any) => {
    if (data.recome_insights) storedInsights = data.recome_insights;
  });
  mockGetEventsAfter.mockResolvedValue([]);
  mockLLMIsConfigured.mockResolvedValue(false);
  mockLLMCall.mockResolvedValue(null);
  jest.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('InsightDetector', () => {
  describe('detect()', () => {
    it('returns 0 with no events', async () => {
      mockGetEventsAfter.mockResolvedValue([]);
      const detector = new InsightDetector();
      const count = await detector.detect();
      expect(count).toBe(0);
    });

    it('creates extended_research insight with 3+ events for same topic in 3 days', async () => {
      const now = Date.now();
      const events = [
        makeEvent({
          topic_key: 'topic:headphones',
          occurred_at: now - 1000,
          content_title: 'Sony XM5',
        }),
        makeEvent({
          topic_key: 'topic:headphones',
          occurred_at: now - 2000,
          content_title: 'Bose QC45',
        }),
        makeEvent({
          topic_key: 'topic:headphones',
          occurred_at: now - 3000,
          content_title: 'AirPods Max',
        }),
      ];
      mockGetEventsAfter.mockResolvedValue(events);

      const detector = new InsightDetector();
      const count = await detector.detect();

      expect(count).toBeGreaterThanOrEqual(1);
      expect(storedInsights.length).toBeGreaterThanOrEqual(1);

      const researchInsight = storedInsights.find((i: any) => i.type === 'extended_research');
      expect(researchInsight).toBeDefined();
      expect(researchInsight.topicKey).toBe('topic:headphones');
    });

    it('does not create extended_research with only 2 events', async () => {
      const events = [
        makeEvent({ topic_key: 'topic:headphones' }),
        makeEvent({ topic_key: 'topic:headphones' }),
      ];
      mockGetEventsAfter.mockResolvedValue(events);

      const detector = new InsightDetector();
      const count = await detector.detect();

      const researchInsight = storedInsights.find((i: any) => i.type === 'extended_research');
      expect(researchInsight).toBeUndefined();
    });

    it('creates decision_fatigue insight with 10+ products in same category without action', async () => {
      const events: MemoryEvent[] = [];
      for (let i = 0; i < 11; i++) {
        events.push(
          makeEvent({
            topic_key: 'topic:laptops',
            action: undefined as any, // no action taken — browsing only (interested/block_forever count as acted)
            content_id: `laptop-${i}`,
          }),
        );
      }
      mockGetEventsAfter.mockResolvedValue(events);

      const detector = new InsightDetector();
      const count = await detector.detect();

      const fatigueInsight = storedInsights.find((i: any) => i.type === 'decision_fatigue');
      expect(fatigueInsight).toBeDefined();
      expect(fatigueInsight.topicKey).toBe('topic:laptops');
    });

    it('does not create decision_fatigue when user has taken action (block_forever)', async () => {
      const events: MemoryEvent[] = [];
      for (let i = 0; i < 11; i++) {
        events.push(makeEvent({ topic_key: 'topic:laptops', content_id: `laptop-${i}` }));
      }
      // User took action on this topic
      events.push(makeEvent({ topic_key: 'topic:laptops', action: 'block_forever' }));
      mockGetEventsAfter.mockResolvedValue(events);

      const detector = new InsightDetector();
      await detector.detect();

      const fatigueInsight = storedInsights.find((i: any) => i.type === 'decision_fatigue');
      expect(fatigueInsight).toBeUndefined();
    });

    it('creates cross_platform insight with same topic on 2+ platforms', async () => {
      const events = [
        makeEvent({ topic_key: 'topic:headphones', platform: 'amazon' as any }),
        makeEvent({ topic_key: 'topic:headphones', platform: 'youtube' as any }),
      ];
      mockGetEventsAfter.mockResolvedValue(events);

      const detector = new InsightDetector();
      const count = await detector.detect();

      const crossPlatform = storedInsights.find((i: any) => i.type === 'cross_platform');
      expect(crossPlatform).toBeDefined();
      expect(crossPlatform.topicKey).toBe('topic:headphones');
    });

    it('does not create cross_platform with only 1 platform', async () => {
      const events = [
        makeEvent({ topic_key: 'topic:headphones', platform: 'amazon' as any }),
        makeEvent({ topic_key: 'topic:headphones', platform: 'amazon' as any }),
      ];
      mockGetEventsAfter.mockResolvedValue(events);

      const detector = new InsightDetector();
      await detector.detect();

      const crossPlatform = storedInsights.find((i: any) => i.type === 'cross_platform');
      expect(crossPlatform).toBeUndefined();
    });

    it('returns count of new insights created', async () => {
      // Set up 3+ events for extended_research AND 2+ platforms for cross_platform
      const events = [
        makeEvent({ topic_key: 'topic:headphones', platform: 'amazon' as any }),
        makeEvent({ topic_key: 'topic:headphones', platform: 'youtube' as any }),
        makeEvent({ topic_key: 'topic:headphones', platform: 'amazon' as any }),
      ];
      mockGetEventsAfter.mockResolvedValue(events);

      const detector = new InsightDetector();
      const count = await detector.detect();

      // Should have at least extended_research (3 events) + cross_platform (2 platforms)
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('LLM phrasing', () => {
    it('uses template phrasing when LLM is not configured', async () => {
      mockLLMIsConfigured.mockResolvedValue(false);
      const events = [
        makeEvent({ topic_key: 'topic:headphones' }),
        makeEvent({ topic_key: 'topic:headphones' }),
        makeEvent({ topic_key: 'topic:headphones' }),
      ];
      mockGetEventsAfter.mockResolvedValue(events);

      const detector = new InsightDetector();
      await detector.detect();

      const insight = storedInsights.find((i: any) => i.type === 'extended_research');
      expect(insight).toBeDefined();
      // Template phrasing
      expect(insight.message).toContain('researching');
    });

    it('uses LLM phrasing when available', async () => {
      mockLLMIsConfigured.mockResolvedValue(true);
      mockLLMCall.mockResolvedValue("You've been eyeing headphones - want me to help?");

      const events = [
        makeEvent({ topic_key: 'topic:headphones' }),
        makeEvent({ topic_key: 'topic:headphones' }),
        makeEvent({ topic_key: 'topic:headphones' }),
      ];
      mockGetEventsAfter.mockResolvedValue(events);

      const detector = new InsightDetector();
      await detector.detect();

      const insight = storedInsights.find((i: any) => i.type === 'extended_research');
      expect(insight).toBeDefined();
      expect(insight.message).toContain('eyeing headphones');
    });
  });

  describe('cleanup is called during detect', () => {
    it('removes old insights during detect cycle', async () => {
      // Pre-populate with an old insight
      storedInsights = [
        {
          id: 'old_insight',
          type: 'extended_research',
          title: 'Old',
          message: 'old msg',
          topicKey: 'topic:old',
          createdAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
          shown: false,
          dismissed: false,
        },
      ];

      mockGetEventsAfter.mockResolvedValue([]);

      const detector = new InsightDetector();
      await detector.detect();

      // The old insight should have been cleaned up
      expect(storedInsights).toHaveLength(0);
    });
  });
});
