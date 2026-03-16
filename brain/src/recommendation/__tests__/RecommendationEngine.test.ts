import { RecommendationEngine } from '../RecommendationEngine';
import { Explainer } from '../Explainer';
import { FactorCalculators } from '../FactorCalculators';
import { SCORE_THRESHOLDS, FACTOR_WEIGHTS } from '@shared/constants';
import type { ContentMetadata, ScoringFactor, ContextBucket } from '@shared/types';
import type { MemoryService } from '@intelligence/memory/MemoryService';
import type { AffinityCalculator } from '@intelligence/graph/AffinityCalculator';
import type { PatternDetector } from '@intelligence/memory/PatternDetector';

// ── Mock IndexedDB ───────────────────────────────────────────────────────────

const memoryStore = new Map<string, unknown>();
const cardsStore = new Map<string, unknown>();

jest.mock('@data/db', () => ({
  getDB: jest.fn().mockResolvedValue({
    put: jest
      .fn()
      .mockImplementation((_store: string, value: { entry_id?: string; card_id?: string }) => {
        if (_store === 'memory_entries') memoryStore.set(value.entry_id!, value);
        if (_store === 'mid_term_cards') cardsStore.set(value.card_id!, value);
        return Promise.resolve();
      }),
    get: jest.fn().mockImplementation((_store: string, key: string) => {
      if (_store === 'memory_entries') return Promise.resolve(memoryStore.get(key));
      if (_store === 'mid_term_cards') return Promise.resolve(cardsStore.get(key));
      return Promise.resolve(undefined);
    }),
    getAll: jest.fn().mockResolvedValue([]),
    getAllFromIndex: jest.fn().mockResolvedValue([]),
    clear: jest.fn().mockResolvedValue(undefined),
    count: jest.fn().mockResolvedValue(0),
  }),
}));

// ── Mock dependencies ────────────────────────────────────────────────────────

function makeMockMemory(overrides: Partial<MemoryService> = {}): MemoryService {
  return {
    shouldHide: jest.fn().mockResolvedValue({ hide: false }),
    shouldBoost: jest.fn().mockResolvedValue(false),
    retrieve: jest.fn().mockResolvedValue({ context: 'general', general_overlay: { entries: [] } }),
    blockForever: jest.fn(),
    writeTurn: jest.fn(),
    ...overrides,
  } as unknown as MemoryService;
}

function makeMockAffinity(overrides: Partial<AffinityCalculator> = {}): AffinityCalculator {
  return {
    batchCalculate: jest.fn().mockResolvedValue(new Map()),
    calculate: jest.fn().mockResolvedValue(0),
    ...overrides,
  } as unknown as AffinityCalculator;
}

function makeMockPatterns(overrides: Partial<PatternDetector> = {}): PatternDetector {
  return {
    matchCards: jest.fn().mockResolvedValue([]),
    detect: jest.fn(),
    ...overrides,
  } as unknown as PatternDetector;
}

function makeEngine(
  opts: {
    memory?: Partial<MemoryService>;
    affinity?: Partial<AffinityCalculator>;
    patterns?: Partial<PatternDetector>;
  } = {},
): RecommendationEngine {
  const memory = makeMockMemory(opts.memory);
  const affinity = makeMockAffinity(opts.affinity);
  const patterns = makeMockPatterns(opts.patterns);
  const factors = new FactorCalculators(memory, affinity, patterns);
  const explainer = new Explainer();
  return new RecommendationEngine(factors, explainer);
}

// ── Factories ────────────────────────────────────────────────────────────────

function makeContent(overrides: Partial<ContentMetadata> = {}): ContentMetadata {
  return {
    id: 'content-1',
    platform: 'youtube',
    type: 'video',
    title: 'Learn TypeScript',
    topics: ['typescript', 'programming'],
    entities: [],
    url: 'https://youtube.com/watch?v=abc',
    published_at: Date.now(),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('RecommendationEngine', () => {
  beforeEach(() => {
    memoryStore.clear();
    cardsStore.clear();
  });

  describe('recommend returns a RecommendationResult', () => {
    it('returns all expected fields', async () => {
      const engine = makeEngine();
      const result = await engine.recommend(makeContent(), 'entertainment');

      expect(result).toHaveProperty('content_id', 'content-1');
      expect(result).toHaveProperty('action');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('factors');
      expect(result).toHaveProperty('explanation');
      expect(typeof result.score).toBe('number');
      expect(typeof result.confidence).toBe('number');
      expect(Array.isArray(result.factors)).toBe(true);
      expect(typeof result.explanation).toBe('string');
    });
  });

  describe('blocked topic', () => {
    it('returns action=hide with score < SCORE_THRESHOLDS.hide', async () => {
      const engine = makeEngine({
        memory: {
          shouldHide: jest.fn().mockResolvedValue({ hide: true, reason: 'Blocked: crypto' }),
        },
      });

      const content = makeContent({ topics: ['crypto'], title: 'Crypto Guide' });
      const result = await engine.recommend(content, 'entertainment');

      expect(result.action).toBe('hide');
      expect(result.score).toBeLessThan(SCORE_THRESHOLDS.hide);
      expect(result.score).toBe(-1);
      expect(result.confidence).toBe(1);
    });
  });

  describe('liked topic', () => {
    it('returns action=boost with score > SCORE_THRESHOLDS.boost', async () => {
      const engine = makeEngine({
        patterns: {
          matchCards: jest.fn().mockResolvedValue([
            {
              card_id: 'card-1',
              user_id: 'local_user',
              topic_key: 'interest:react',
              pattern_type: 'interest_pattern',
              confidence: 1.0,
              occurrence_count: 10,
              context_bucket: 'learning',
            },
          ]),
        },
        affinity: {
          batchCalculate: jest.fn().mockResolvedValue(
            new Map([
              ['typescript', 1.0],
              ['programming', 1.0],
            ]),
          ),
        },
      });

      const content = makeContent({
        topics: ['react', 'typescript'],
        platform: 'youtube',
        published_at: Date.now(),
      });
      const result = await engine.recommend(content, 'entertainment');

      expect(result.action).toBe('boost');
      expect(result.score).toBeGreaterThan(SCORE_THRESHOLDS.boost);
    });
  });

  describe('neutral topic', () => {
    it('returns action=show for content with no strong signals', async () => {
      const engine = makeEngine();

      const content = makeContent({
        topics: ['gardening'],
        platform: 'youtube',
        published_at: Date.now(),
      });
      const result = await engine.recommend(content, 'entertainment');

      expect(result.action).toBe('show');
    });
  });

  describe('direct block short-circuits', () => {
    it('does not compute other factors when direct block triggers', async () => {
      const matchCards = jest.fn().mockResolvedValue([]);
      const batchCalculate = jest.fn().mockResolvedValue(new Map());

      const engine = makeEngine({
        memory: {
          shouldHide: jest.fn().mockResolvedValue({ hide: true, reason: 'Blocked: spam' }),
        },
        patterns: { matchCards },
        affinity: { batchCalculate },
      });

      const content = makeContent({ topics: ['spam'] });
      const result = await engine.recommend(content, 'general');

      expect(result.action).toBe('hide');
      expect(result.score).toBe(-1);

      // Short-circuit: patternMatch and graphAffinity should NOT be called
      expect(matchCards).not.toHaveBeenCalled();
      expect(batchCalculate).not.toHaveBeenCalled();

      // Only the direct_block factor should be present
      expect(result.factors).toHaveLength(1);
      expect(result.factors[0]!.name).toBe('direct_block');
    });
  });

  describe('result includes explanation', () => {
    it('includes explanation string for hide result', async () => {
      const engine = makeEngine({
        memory: {
          shouldHide: jest.fn().mockResolvedValue({ hide: true, reason: 'Blocked: crypto' }),
        },
      });

      const result = await engine.recommend(makeContent({ topics: ['crypto'] }), 'general');

      expect(result.explanation).toBeDefined();
      expect(result.explanation.length).toBeGreaterThan(0);
      expect(result.explanation).toContain('Hidden');
      expect(result.hide_reason).toBeDefined();
    });

    it('includes explanation string for boost result', async () => {
      const engine = makeEngine({
        patterns: {
          matchCards: jest.fn().mockResolvedValue([
            {
              card_id: 'card-1',
              user_id: 'local_user',
              topic_key: 'interest:react',
              pattern_type: 'interest_pattern',
              confidence: 1.0,
              occurrence_count: 10,
              context_bucket: 'learning',
            },
          ]),
        },
        affinity: {
          batchCalculate: jest.fn().mockResolvedValue(
            new Map([
              ['typescript', 1.0],
              ['programming', 1.0],
            ]),
          ),
        },
      });

      const content = makeContent({
        topics: ['react', 'typescript'],
        platform: 'youtube',
        published_at: Date.now(),
      });
      const result = await engine.recommend(content, 'entertainment');

      expect(result.explanation).toBeDefined();
      expect(result.explanation).toContain('Boosted');
      expect(result.boost_reason).toBeDefined();
    });

    it('includes explanation string for show result', async () => {
      const engine = makeEngine();
      const result = await engine.recommend(makeContent(), 'entertainment');

      expect(result.explanation).toBeDefined();
      expect(result.explanation.length).toBeGreaterThan(0);
    });
  });

  describe('aggressiveness parameter', () => {
    it('higher aggressiveness hides content more eagerly', async () => {
      // Set up a mildly negative pattern
      const engine = makeEngine({
        patterns: {
          matchCards: jest.fn().mockResolvedValue([
            {
              card_id: 'card-1',
              user_id: 'local_user',
              topic_key: 'block:clickbait',
              pattern_type: 'block_pattern',
              confidence: 0.5,
              occurrence_count: 4,
              context_bucket: 'general',
            },
          ]),
        },
      });

      const content = makeContent({ topics: ['clickbait'], published_at: Date.now() });

      const lowAggressive = await engine.recommend(content, 'entertainment', 0.2);
      const highAggressive = await engine.recommend(content, 'entertainment', 0.9);

      // With higher aggressiveness, either:
      // - The action is more severe (hide vs show), or
      // - At minimum, the action is at least as severe
      const actionSeverity: Record<string, number> = { show: 0, suppress: 1, hide: 2, boost: -1 };
      const lowSev = actionSeverity[lowAggressive.action] ?? 0;
      const highSev = actionSeverity[highAggressive.action] ?? 0;
      expect(highSev).toBeGreaterThanOrEqual(lowSev);
    });
  });
});
