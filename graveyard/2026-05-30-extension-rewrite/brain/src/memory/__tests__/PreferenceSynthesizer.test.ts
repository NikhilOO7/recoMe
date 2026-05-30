import { PreferenceSynthesizer } from '../PreferenceSynthesizer';

// ── Mock chrome APIs ────────────────────────────────────────────────────────────

const chromeStorage = new Map<string, unknown>();

(globalThis as any).chrome = {
  storage: {
    local: {
      get: jest.fn().mockImplementation((key: string) => {
        return Promise.resolve({ [key]: chromeStorage.get(key) });
      }),
      set: jest.fn().mockImplementation((obj: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(obj)) chromeStorage.set(k, v);
        return Promise.resolve();
      }),
    },
    session: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
    },
  },
};

// ── Mock Logger ─────────────────────────────────────────────────────────────────

jest.mock('@shared/Logger', () => ({
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
    count: jest.fn().mockResolvedValue(0),
  }),
}));

// ── Mock LLMClient ──────────────────────────────────────────────────────────────

const mockIsConfigured = jest.fn();
const mockLLMCall = jest.fn();

jest.mock('@agent/llm/LLMClient', () => ({
  getLLMClient: jest.fn(() => ({
    isConfigured: mockIsConfigured,
    call: mockLLMCall,
    getProviderName: jest.fn().mockResolvedValue('OpenAI'),
  })),
}));

// ── Mock shared utils ───────────────────────────────────────────────────────────

jest.mock('@shared/utils', () => ({
  buildTopicKey: jest.fn((prefix: string, key: string) => `${prefix}:${key}`),
  normalizeTopicKey: jest.fn((key: string) => key.toLowerCase().replace(/\s+/g, '_')),
  now: jest.fn(() => Date.now()),
}));

// ── Mock MemoryStore ────────────────────────────────────────────────────────────

const mockGetEventsAfter = jest.fn();
const mockGetEntryByTopic = jest.fn();
const mockTouchEntry = jest.fn();
const mockCreateBaseEntry = jest.fn();

function makeMockStore() {
  return {
    getEventsAfter: mockGetEventsAfter,
    getEntryByTopic: mockGetEntryByTopic,
    touchEntry: mockTouchEntry,
    createBaseEntry: mockCreateBaseEntry,
  } as any;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function makeEvent(topicKey: string, action: string, platform = 'amazon') {
  return {
    event_id: `evt-${Math.random().toString(36).slice(2)}`,
    user_id: 'user-1',
    occurred_at: Date.now(),
    platform,
    context_bucket: 'general',
    topic_key: topicKey,
    action,
    content_id: `c-${Math.random().toString(36).slice(2)}`,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('PreferenceSynthesizer', () => {
  let synthesizer: PreferenceSynthesizer;

  beforeEach(() => {
    jest.clearAllMocks();
    chromeStorage.clear();
    mockGetEventsAfter.mockResolvedValue([]);
    mockGetEntryByTopic.mockResolvedValue(null);
    mockTouchEntry.mockResolvedValue(undefined);
    mockCreateBaseEntry.mockResolvedValue(undefined);
    synthesizer = new PreferenceSynthesizer(makeMockStore());
  });

  describe('run', () => {
    it('should return false with no recent events (fewer than 3)', async () => {
      mockIsConfigured.mockResolvedValue(true);
      mockGetEventsAfter.mockResolvedValue([makeEvent('topic:headphones', 'interested')]);

      const result = await synthesizer.run('user-1');

      expect(result).toBe(false);
    });

    it('should return false when LLM is not configured', async () => {
      mockIsConfigured.mockResolvedValue(false);
      mockGetEventsAfter.mockResolvedValue([
        makeEvent('topic:headphones', 'interested'),
        makeEvent('topic:keyboards', 'interested'),
        makeEvent('topic:monitors', 'interested'),
      ]);

      const result = await synthesizer.run('user-1');

      expect(result).toBe(false);
      expect(mockLLMCall).not.toHaveBeenCalled();
    });

    it('should return true and write preferences when LLM returns valid synthesis', async () => {
      mockIsConfigured.mockResolvedValue(true);
      mockGetEventsAfter.mockResolvedValue([
        makeEvent('topic:headphones', 'interested'),
        makeEvent('topic:keyboards', 'interested'),
        makeEvent('topic:monitors', 'interested'),
        makeEvent('topic:gaming', 'interested'),
      ]);

      mockLLMCall.mockResolvedValue(
        JSON.stringify({
          newInterests: ['mechanical_keyboards', 'gaming_peripherals'],
          fadingInterests: [],
          suggestedRelations: [],
        }),
      );

      const result = await synthesizer.run('user-1');

      expect(result).toBe(true);
      expect(mockCreateBaseEntry).toHaveBeenCalledTimes(2);
    });

    it('should return false when LLM returns null', async () => {
      mockIsConfigured.mockResolvedValue(true);
      mockGetEventsAfter.mockResolvedValue([
        makeEvent('topic:a', 'interested'),
        makeEvent('topic:b', 'interested'),
        makeEvent('topic:c', 'interested'),
      ]);

      mockLLMCall.mockResolvedValue(null);

      const result = await synthesizer.run('user-1');

      expect(result).toBe(false);
    });

    it('should return false when LLM returns unparseable response', async () => {
      mockIsConfigured.mockResolvedValue(true);
      mockGetEventsAfter.mockResolvedValue([
        makeEvent('topic:a', 'interested'),
        makeEvent('topic:b', 'interested'),
        makeEvent('topic:c', 'interested'),
      ]);

      mockLLMCall.mockResolvedValue('not valid json at all');

      const result = await synthesizer.run('user-1');

      expect(result).toBe(false);
    });

    it('should skip if already ran today', async () => {
      // Simulate having run today
      chromeStorage.set('recome_last_synthesis', Date.now());

      const result = await synthesizer.run('user-1');

      expect(result).toBe(false);
      expect(mockGetEventsAfter).not.toHaveBeenCalled();
    });

    it('should touch existing entry instead of creating new one', async () => {
      mockIsConfigured.mockResolvedValue(true);
      mockGetEventsAfter.mockResolvedValue([
        makeEvent('topic:a', 'interested'),
        makeEvent('topic:b', 'interested'),
        makeEvent('topic:c', 'interested'),
      ]);

      mockLLMCall.mockResolvedValue(
        JSON.stringify({
          newInterests: ['existing_topic'],
          fadingInterests: [],
          suggestedRelations: [],
        }),
      );

      mockGetEntryByTopic.mockResolvedValue({ entry_id: 'existing-entry-1' });

      const result = await synthesizer.run('user-1');

      expect(result).toBe(true);
      expect(mockTouchEntry).toHaveBeenCalledWith('existing-entry-1');
      expect(mockCreateBaseEntry).not.toHaveBeenCalled();
    });
  });
});
