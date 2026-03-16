import { PromptBuilder } from '../PromptBuilder';
import type { UserContext } from '../../retrieval';
import type { CandidateEntity } from '@schema/entities';
import type { PageContext } from '@schema/decisions';
import type { CrossPlatformTopic } from '@brain/graph/CrossPlatformLinker';
import type { LLMMessage } from '../LLMClient';

// ── Test fixtures ────────────────────────────────────────────────────────────

function makeUserContext(overrides: Partial<UserContext> = {}): UserContext {
  return {
    recentIntents: [],
    brandPreferences: [],
    sellerPreferences: [],
    activeIntentTypes: [],
    watchlist: [],
    recentDecisions: [],
    knownProducts: [],
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<CandidateEntity> = {}): CandidateEntity {
  return {
    candidateId: 'prod-1',
    entityType: 'product',
    rawText: 'Sony WH-1000XM5 Headphones',
    normalizedText: 'sony wh-1000xm5 headphones',
    metadata: { brand: 'Sony', price: 349.99, rating: 4.7 },
    ...overrides,
  };
}

function makePageContext(overrides: Partial<PageContext> = {}): PageContext {
  return {
    site: 'amazon',
    pageType: 'search',
    url: 'https://amazon.com/s?q=headphones',
    query: 'wireless headphones',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeCrossPlatformTopic(overrides: Partial<CrossPlatformTopic> = {}): CrossPlatformTopic {
  return {
    topicKey: 'topic:wireless_headphones',
    platforms: ['amazon', 'youtube'] as any,
    eventCount: 8,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PromptBuilder', () => {
  const builder = new PromptBuilder();

  describe('buildChatPrompt', () => {
    it('returns system, messages, and prompt', () => {
      const ctx = makeUserContext();
      const history: LLMMessage[] = [];

      const result = builder.buildChatPrompt('Hello', ctx, history);

      expect(result).toHaveProperty('system');
      expect(result).toHaveProperty('messages');
      expect(result).toHaveProperty('prompt');
      expect(result.prompt).toBe('Hello');
      expect(result.messages).toBe(history);
      expect(typeof result.system).toBe('string');
    });

    it('system prompt includes user context with brand preferences', () => {
      const ctx = makeUserContext({
        brandPreferences: [
          { brandId: 'brand:sony', displayName: 'Sony', sentiment: 'positive' },
          { brandId: 'brand:bose', displayName: 'Bose', sentiment: 'negative' },
        ],
      });
      const history: LLMMessage[] = [];

      const result = builder.buildChatPrompt('recommend', ctx, history);

      expect(result.system).toContain('Sony');
      expect(result.system).toContain('Bose');
      expect(result.system).toContain('Preferred brands');
      expect(result.system).toContain('Avoided brands');
    });

    it('system prompt includes cross-platform topics when provided', () => {
      const ctx = makeUserContext();
      const topics = [makeCrossPlatformTopic()];

      const result = builder.buildChatPrompt('hi', ctx, [], undefined, undefined, topics);

      expect(result.system).toContain('CROSS-PLATFORM INTERESTS');
      expect(result.system).toContain('wireless headphones');
      expect(result.system).toContain('amazon');
      expect(result.system).toContain('youtube');
    });

    it('system prompt does not include cross-platform section when no topics', () => {
      const ctx = makeUserContext();

      const result = builder.buildChatPrompt('hi', ctx, []);

      expect(result.system).not.toContain('CROSS-PLATFORM INTERESTS');
    });

    it('system prompt includes page context when provided', () => {
      const ctx = makeUserContext();
      const page = makePageContext();

      const result = builder.buildChatPrompt('hi', ctx, [], undefined, page);

      expect(result.system).toContain('CURRENT PAGE');
      expect(result.system).toContain('amazon');
      expect(result.system).toContain('wireless headphones');
    });

    it('system prompt includes candidates when provided', () => {
      const ctx = makeUserContext();
      const candidates = [
        makeCandidate({ candidateId: 'p1', rawText: 'Sony XM5' }),
        makeCandidate({ candidateId: 'p2', rawText: 'Bose QC45' }),
      ];

      const result = builder.buildChatPrompt('compare', ctx, [], candidates);

      expect(result.system).toContain('PRODUCTS ON PAGE');
      expect(result.system).toContain('Sony XM5');
      expect(result.system).toContain('Bose QC45');
    });

    it('passes conversation history as messages', () => {
      const ctx = makeUserContext();
      const history: LLMMessage[] = [
        { role: 'user', content: 'What headphones do you recommend?' },
        { role: 'assistant', content: 'I recommend Sony XM5.' },
      ];

      const result = builder.buildChatPrompt('Why?', ctx, history);

      expect(result.messages).toEqual(history);
      expect(result.prompt).toBe('Why?');
    });
  });

  describe('buildExplainPrompt', () => {
    it('returns system and prompt', () => {
      const candidate = makeCandidate();
      const factors = [{ name: 'brandAffinity', score: 0.8, explanation: 'User prefers Sony' }];
      const ctx = makeUserContext();

      const result = builder.buildExplainPrompt(candidate, factors, ctx);

      expect(result).toHaveProperty('system');
      expect(result).toHaveProperty('prompt');
      expect(result.system).toContain('explaining recommendation decisions');
    });

    it('includes product info and factors in prompt', () => {
      const candidate = makeCandidate();
      const factors = [
        { name: 'brandAffinity', score: 0.8, explanation: 'User prefers Sony' },
        { name: 'priceMatch', score: 0.5, explanation: 'Mid-range price' },
      ];
      const ctx = makeUserContext();

      const result = builder.buildExplainPrompt(candidate, factors, ctx);

      expect(result.prompt).toContain('Sony WH-1000XM5 Headphones');
      expect(result.prompt).toContain('brandAffinity');
      expect(result.prompt).toContain('0.80');
      expect(result.prompt).toContain('User prefers Sony');
      expect(result.prompt).toContain('priceMatch');
    });

    it('includes brand and price from metadata', () => {
      const candidate = makeCandidate();
      const factors: Array<{ name: string; score: number; explanation: string }> = [];
      const ctx = makeUserContext();

      const result = builder.buildExplainPrompt(candidate, factors, ctx);

      expect(result.prompt).toContain('Brand: Sony');
      expect(result.prompt).toContain('$349.99');
    });
  });

  describe('buildComparePrompt', () => {
    it('returns system and prompt with candidates', () => {
      const candidates = [
        makeCandidate({ candidateId: 'p1', rawText: 'Sony XM5' }),
        makeCandidate({ candidateId: 'p2', rawText: 'Bose QC45' }),
      ];
      const ctx = makeUserContext();

      const result = builder.buildComparePrompt(candidates, ctx);

      expect(result).toHaveProperty('system');
      expect(result).toHaveProperty('prompt');
      expect(result.system).toContain('compare products');
      expect(result.prompt).toContain('Sony XM5');
      expect(result.prompt).toContain('Bose QC45');
    });

    it('includes scoring data when provided', () => {
      const candidates = [makeCandidate()];
      const ctx = makeUserContext();
      const scores = [
        {
          candidateId: 'prod-1',
          score: 0.85,
          decision: 'boost',
          explanation: 'Strong brand match',
        },
      ];

      const result = builder.buildComparePrompt(candidates, ctx, scores);

      expect(result.prompt).toContain('RecoMe scoring results');
      expect(result.prompt).toContain('prod-1');
      expect(result.prompt).toContain('0.85');
      expect(result.prompt).toContain('boost');
      expect(result.prompt).toContain('Strong brand match');
    });

    it('omits scoring section when scores not provided', () => {
      const candidates = [makeCandidate()];
      const ctx = makeUserContext();

      const result = builder.buildComparePrompt(candidates, ctx);

      expect(result.prompt).not.toContain('RecoMe scoring results');
    });

    it('omits scoring section when scores array is empty', () => {
      const candidates = [makeCandidate()];
      const ctx = makeUserContext();

      const result = builder.buildComparePrompt(candidates, ctx, []);

      expect(result.prompt).not.toContain('RecoMe scoring results');
    });
  });

  describe('compressUserContext (via buildChatPrompt)', () => {
    it('returns "No preference data yet." with empty context', () => {
      const ctx = makeUserContext();

      const result = builder.buildChatPrompt('hi', ctx, []);

      expect(result.system).toContain('No preference data yet.');
    });

    it('includes brand names for preferred brands', () => {
      const ctx = makeUserContext({
        brandPreferences: [
          { brandId: 'brand:apple', displayName: 'Apple', sentiment: 'positive' },
          { brandId: 'brand:samsung', displayName: 'Samsung', sentiment: 'positive' },
        ],
      });

      const result = builder.buildChatPrompt('hi', ctx, []);

      expect(result.system).toContain('Apple');
      expect(result.system).toContain('Samsung');
      expect(result.system).toContain('Preferred brands');
    });

    it('includes avoided brands', () => {
      const ctx = makeUserContext({
        brandPreferences: [
          { brandId: 'brand:generic', displayName: 'Generic Co', sentiment: 'negative' },
        ],
      });

      const result = builder.buildChatPrompt('hi', ctx, []);

      expect(result.system).toContain('Generic Co');
      expect(result.system).toContain('Avoided brands');
    });

    it('includes seller preferences', () => {
      const ctx = makeUserContext({
        sellerPreferences: [
          { sellerId: 'seller:sketchy', displayName: 'Sketchy Store', sentiment: 'negative' },
        ],
      });

      const result = builder.buildChatPrompt('hi', ctx, []);

      expect(result.system).toContain('Avoided sellers');
      expect(result.system).toContain('Sketchy Store');
    });

    it('includes active intent modes', () => {
      const ctx = makeUserContext({
        activeIntentTypes: ['budget_sensitive', 'quality_first'],
      });

      const result = builder.buildChatPrompt('hi', ctx, []);

      expect(result.system).toContain('Active modes');
      expect(result.system).toContain('budget sensitive');
      expect(result.system).toContain('quality first');
    });

    it('includes watchlist summary', () => {
      const ctx = makeUserContext({
        watchlist: [
          {
            itemId: 'w1',
            entityType: 'product',
            entityId: 'prod-1',
            note: 'Sony XM5',
            addedAt: '',
            updatedAt: '',
          },
          {
            itemId: 'w2',
            entityType: 'product',
            entityId: 'prod-2',
            note: 'Bose QC45',
            addedAt: '',
            updatedAt: '',
          },
        ] as any,
      });

      const result = builder.buildChatPrompt('hi', ctx, []);

      expect(result.system).toContain('Watchlist (2)');
      expect(result.system).toContain('Sony XM5');
    });

    it('includes recent intents count', () => {
      const ctx = makeUserContext({
        recentIntents: [
          {
            intentId: 'i1',
            userId: 'u1',
            source: 'agent',
            entityType: 'product',
            scope: 'product',
            entityId: 'p1',
            intentType: 'interested',
            createdAt: '',
          },
        ] as any,
      });

      const result = builder.buildChatPrompt('hi', ctx, []);

      expect(result.system).toContain('Recent signals: 1 preference events');
    });
  });
});
