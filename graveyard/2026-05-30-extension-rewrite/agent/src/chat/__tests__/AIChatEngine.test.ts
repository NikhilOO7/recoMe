import { AIChatEngine } from '../AIChatEngine';

// ── Mock chrome APIs ────────────────────────────────────────────────────────────

(globalThis as any).chrome = {
  storage: {
    local: { get: jest.fn().mockResolvedValue({}), set: jest.fn().mockResolvedValue(undefined) },
    session: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    },
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
    count: jest.fn().mockResolvedValue(0),
  }),
}));

// ── Mock LLMClient ──────────────────────────────────────────────────────────────

const mockIsConfigured = jest.fn();
const mockLLMCall = jest.fn();
const mockGetProviderName = jest.fn();

jest.mock('@agent/llm/LLMClient', () => ({
  getLLMClient: jest.fn(() => ({
    isConfigured: mockIsConfigured,
    call: mockLLMCall,
    getProviderName: mockGetProviderName,
  })),
}));

// ── Mock RetrievalService ───────────────────────────────────────────────────────

const mockGetUserContext = jest.fn();
const mockGetCrossPlatformContext = jest.fn();

jest.mock('@agent/retrieval', () => ({
  RetrievalService: jest.fn().mockImplementation(() => ({
    getUserContext: mockGetUserContext,
    getCrossPlatformContext: mockGetCrossPlatformContext,
  })),
}));

// ── Mock PromptBuilder ──────────────────────────────────────────────────────────

const mockBuildChatPrompt = jest.fn();

jest.mock('@agent/llm/PromptBuilder', () => ({
  PromptBuilder: jest.fn().mockImplementation(() => ({
    buildChatPrompt: mockBuildChatPrompt,
    buildExplainPrompt: jest.fn().mockReturnValue({ system: 'sys', prompt: 'explain prompt' }),
    buildComparePrompt: jest.fn().mockReturnValue({ system: 'sys', prompt: 'compare prompt' }),
  })),
}));

// ── Mock ConversationMemory ─────────────────────────────────────────────────────

const mockGetHistory = jest.fn();
const mockAddUserMessage = jest.fn();
const mockAddAssistantMessage = jest.fn();

jest.mock('@agent/chat/ConversationMemory', () => ({
  ConversationMemory: jest.fn().mockImplementation(() => ({
    getHistory: mockGetHistory,
    addUserMessage: mockAddUserMessage,
    addAssistantMessage: mockAddAssistantMessage,
    clear: jest.fn().mockResolvedValue(undefined),
  })),
}));

// ── Mock AIExplainer ────────────────────────────────────────────────────────────

jest.mock('@brain/recommendation/AIExplainer', () => ({
  AIExplainer: jest.fn().mockImplementation(() => ({
    explain: jest.fn().mockResolvedValue('AI explanation'),
    compareNarrative: jest.fn().mockResolvedValue(null),
  })),
}));

// ── Mock BrainFacade ────────────────────────────────────────────────────────────

jest.mock('@brain/BrainFacade', () => ({
  getBrain: jest.fn(() => ({
    scoreEntities: jest.fn().mockResolvedValue({ items: [], computedAt: new Date().toISOString() }),
  })),
}));

// ── Default user context ────────────────────────────────────────────────────────

const defaultUserContext = {
  recentIntents: [],
  brandPreferences: [],
  sellerPreferences: [],
  activeIntentTypes: [],
  watchlist: [],
  recentDecisions: [],
  knownProducts: [],
};

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('AIChatEngine', () => {
  let engine: AIChatEngine;

  beforeEach(() => {
    jest.clearAllMocks();

    mockGetUserContext.mockResolvedValue(defaultUserContext);
    mockGetCrossPlatformContext.mockResolvedValue([]);
    mockGetHistory.mockResolvedValue([]);
    mockAddUserMessage.mockResolvedValue(undefined);
    mockAddAssistantMessage.mockResolvedValue(undefined);
    mockBuildChatPrompt.mockReturnValue({
      system: 'You are RecoMe',
      messages: [],
      prompt: 'user message',
    });

    engine = new AIChatEngine();
  });

  describe('isAvailable', () => {
    it('should return false when LLM is not configured', async () => {
      mockIsConfigured.mockResolvedValue(false);
      const available = await engine.isAvailable();
      expect(available).toBe(false);
    });

    it('should return true when LLM is configured', async () => {
      mockIsConfigured.mockResolvedValue(true);
      const available = await engine.isAvailable();
      expect(available).toBe(true);
    });
  });

  describe('processMessage', () => {
    it('should return an AgentMessage', async () => {
      mockLLMCall.mockResolvedValue(
        JSON.stringify({
          message: 'Hello! How can I help?',
          actions: [],
          suggestedFollowups: ['Compare products'],
        }),
      );

      const result = await engine.processMessage('Hi there');

      expect(result.role).toBe('agent');
      expect(result.content).toBe('Hello! How can I help?');
      expect(result.timestamp).toBeDefined();
    });

    it('should build prompt from user context', async () => {
      mockLLMCall.mockResolvedValue('{"message":"response","actions":[],"suggestedFollowups":[]}');

      await engine.processMessage('Tell me about my preferences');

      expect(mockGetUserContext).toHaveBeenCalled();
      expect(mockBuildChatPrompt).toHaveBeenCalled();
      const call = mockBuildChatPrompt.mock.calls[0]!;
      expect(call[0]).toBe('Tell me about my preferences');
      expect(call[1]).toEqual(defaultUserContext);
    });

    it('should parse JSON response from LLM', async () => {
      mockLLMCall.mockResolvedValue(
        JSON.stringify({
          message: 'I found a great deal for you.',
          actions: [{ action: 'open_product', label: 'View product', candidateIds: ['p1'] }],
          suggestedFollowups: ['Add to watchlist', 'Compare with others'],
        }),
      );

      const result = await engine.processMessage('Find deals');

      expect(result.content).toBe('I found a great deal for you.');
      expect(result.actions).toHaveLength(1);
      expect(result.actions![0]!.action).toBe('open_product');
      expect(result.suggestedFollowups).toHaveLength(2);
    });

    it('should fall back to plain text when LLM response is not valid JSON', async () => {
      mockLLMCall.mockResolvedValue('Just a plain text response from the LLM.');

      const result = await engine.processMessage('Hi');

      expect(result.content).toBe('Just a plain text response from the LLM.');
      expect(result.role).toBe('agent');
    });

    it('should save messages to conversation memory', async () => {
      mockLLMCall.mockResolvedValue('{"message":"Noted!","actions":[],"suggestedFollowups":[]}');

      await engine.processMessage('Remember this');

      expect(mockAddUserMessage).toHaveBeenCalledWith('Remember this');
      expect(mockAddAssistantMessage).toHaveBeenCalledWith('Noted!');
    });

    it('should handle null LLM response gracefully', async () => {
      mockLLMCall.mockResolvedValue(null);

      const result = await engine.processMessage('Hello');

      expect(result.role).toBe('agent');
      expect(result.content).toContain('trouble connecting');
    });

    it('should pass candidates to buildChatPrompt when provided', async () => {
      mockLLMCall.mockResolvedValue('{"message":"Got it","actions":[],"suggestedFollowups":[]}');
      const candidates = [{ candidateId: 'p1', title: 'Widget', metadata: {} }] as any[];

      await engine.processMessage('Tell me about this', candidates);

      const call = mockBuildChatPrompt.mock.calls[0]!;
      expect(call[3]).toEqual(candidates);
    });

    it('should pass pageContext to buildChatPrompt when provided', async () => {
      mockLLMCall.mockResolvedValue('{"message":"Ok","actions":[],"suggestedFollowups":[]}');
      const pageContext = {
        site: 'amazon',
        pageType: 'product',
        url: 'https://amazon.com/dp/123',
      } as any;

      await engine.processMessage('What is this?', undefined, pageContext);

      const call = mockBuildChatPrompt.mock.calls[0]!;
      expect(call[4]).toEqual(pageContext);
    });

    it('should parse JSON response with actions array', async () => {
      mockLLMCall.mockResolvedValue(
        JSON.stringify({
          message: 'Here are some options.',
          actions: [
            {
              action: 'open_product',
              label: 'Open A',
              targetUrl: 'https://a.com',
              candidateIds: ['c1'],
            },
            { action: 'add_watchlist', label: 'Watch B', candidateIds: ['c2'] },
          ],
          suggestedFollowups: [],
        }),
      );

      const result = await engine.processMessage('Show me options');

      expect(result.actions).toHaveLength(2);
      expect(result.actions![0]!.targetUrl).toBe('https://a.com');
      expect(result.actions![1]!.action).toBe('add_watchlist');
    });

    it('should parse JSON response with suggestedFollowups', async () => {
      mockLLMCall.mockResolvedValue(
        JSON.stringify({
          message: 'Done.',
          suggestedFollowups: ['Tell me more', 'Compare items', 42],
        }),
      );

      const result = await engine.processMessage('Do something');

      // Non-string followups should be filtered out
      expect(result.suggestedFollowups).toEqual(['Tell me more', 'Compare items']);
    });

    it('should handle malformed JSON gracefully (falls back to plain text)', async () => {
      mockLLMCall.mockResolvedValue('Here is some text with { broken json }');

      const result = await engine.processMessage('Hi');

      expect(result.role).toBe('agent');
      // Falls back to raw text since JSON parsing fails
      expect(result.content).toContain('broken json');
    });

    it('should handle JSON without message field as plain text', async () => {
      mockLLMCall.mockResolvedValue(JSON.stringify({ reply: 'hello', actions: [] }));

      const result = await engine.processMessage('Hi');

      // No .message field, so parseResponse treats it as plain text
      expect(result.role).toBe('agent');
      expect(result.content).toContain('reply');
    });
  });

  describe('getProviderName', () => {
    it('should delegate to llm.getProviderName', async () => {
      mockGetProviderName.mockResolvedValue('OpenAI');

      const name = await engine.getProviderName();

      expect(name).toBe('OpenAI');
      expect(mockGetProviderName).toHaveBeenCalled();
    });

    it('should return null when no provider configured', async () => {
      mockGetProviderName.mockResolvedValue(null);

      const name = await engine.getProviderName();

      expect(name).toBeNull();
    });
  });

  describe('processMessage — explain path', () => {
    it('should trigger explain handler when message matches EXPLAIN_RE and candidates exist', async () => {
      const { getBrain } = require('@brain/BrainFacade');
      const mockScoreEntities = jest.fn().mockResolvedValue({
        items: [
          {
            candidateId: 'p1',
            score: 0.8,
            decision: 'show',
            explanation: 'good match',
            factors: ['brand_match'],
          },
        ],
      });
      getBrain.mockReturnValue({ scoreEntities: mockScoreEntities });

      const candidates = [{ candidateId: 'p1', title: 'Widget', metadata: {} }] as any[];

      const result = await engine.processMessage('Why is this recommended?', candidates);

      expect(result.role).toBe('agent');
      expect(result.content).toBe('AI explanation');
    });
  });

  describe('processMessage — compare path', () => {
    it('should trigger compare handler when message matches COMPARE_RE and 2+ candidates', async () => {
      const { getBrain } = require('@brain/BrainFacade');
      const mockScoreEntities = jest.fn().mockResolvedValue({
        items: [
          { candidateId: 'p1', score: 0.8, decision: 'show', explanation: 'good', factors: [] },
          { candidateId: 'p2', score: 0.6, decision: 'show', explanation: 'ok', factors: [] },
        ],
      });
      getBrain.mockReturnValue({ scoreEntities: mockScoreEntities });

      // Override compareNarrative to return a result
      const { AIExplainer } = require('@brain/recommendation/AIExplainer');
      AIExplainer.mockImplementation(() => ({
        explain: jest.fn().mockResolvedValue('AI explanation'),
        compareNarrative: jest.fn().mockResolvedValue('Product A is better because...'),
      }));

      const freshEngine = new AIChatEngine();
      const candidates = [
        { candidateId: 'p1', title: 'Widget A', metadata: {} },
        { candidateId: 'p2', title: 'Widget B', metadata: {} },
      ] as any[];

      const result = await freshEngine.processMessage('Compare these two', candidates);

      expect(result.role).toBe('agent');
      expect(result.content).toBe('Product A is better because...');
      expect(result.actions).toBeDefined();
    });
  });

  describe('clearConversation', () => {
    it('should clear conversation memory', async () => {
      await engine.clearConversation();
      // clear is mocked — just verify it doesn't throw
    });
  });
});
