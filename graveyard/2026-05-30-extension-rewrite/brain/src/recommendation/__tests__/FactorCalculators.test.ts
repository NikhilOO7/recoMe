import { FactorCalculators } from '../FactorCalculators';
import { FACTOR_WEIGHTS } from '@shared/constants';
import type { ContentMetadata, ContextBucket, ScoringFactor } from '@shared/types';
import type { MemoryService } from '@intelligence/memory/MemoryService';
import type { AffinityCalculator } from '@intelligence/graph/AffinityCalculator';
import type { PatternDetector } from '@intelligence/memory/PatternDetector';

// ── Mock IndexedDB (same pattern as MemoryService tests) ─────────────────────

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
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('FactorCalculators', () => {
  beforeEach(() => {
    memoryStore.clear();
    cardsStore.clear();
  });

  // ── directBlock ──────────────────────────────────────────────────────────

  describe('directBlock', () => {
    it('returns -1 when topic is blocked in facts_prefs', async () => {
      const memory = makeMockMemory({
        shouldHide: jest.fn().mockResolvedValue({ hide: true, reason: 'Blocked: crypto' }),
      });
      const calc = new FactorCalculators(memory, makeMockAffinity(), makeMockPatterns());

      const content = makeContent({ topics: ['crypto', 'blockchain'] });
      const factor = await calc.directBlock(content, 'entertainment');

      expect(factor.name).toBe('direct_block');
      expect(factor.score).toBe(-1);
      expect(factor.weight).toBe(FACTOR_WEIGHTS.direct_block);
      expect(factor.explanation).toContain('Blocked');
    });

    it('returns 0 when no block exists', async () => {
      const memory = makeMockMemory({
        shouldHide: jest.fn().mockResolvedValue({ hide: false }),
      });
      const calc = new FactorCalculators(memory, makeMockAffinity(), makeMockPatterns());

      const content = makeContent({ topics: ['react', 'hooks'] });
      const factor = await calc.directBlock(content, 'learning');

      expect(factor.score).toBe(0);
      expect(factor.explanation).toBe('No direct block');
    });

    it('passes topics and entities (not title) to shouldHide', async () => {
      const shouldHide = jest.fn().mockResolvedValue({ hide: false });
      const memory = makeMockMemory({ shouldHide });
      const calc = new FactorCalculators(memory, makeMockAffinity(), makeMockPatterns());

      const content = makeContent({
        title: 'Amazing crypto tutorial',
        topics: ['crypto'],
        entities: ['bitcoin'],
      });
      await calc.directBlock(content, 'general');

      expect(shouldHide).toHaveBeenCalledWith(['crypto', 'bitcoin'], 'general');
    });
  });

  // ── patternMatch ─────────────────────────────────────────────────────────

  describe('patternMatch', () => {
    it('returns positive score for interest cards', async () => {
      const patterns = makeMockPatterns({
        matchCards: jest.fn().mockResolvedValue([
          {
            card_id: 'card-1',
            user_id: 'local_user',
            topic_key: 'interest:react',
            pattern_type: 'interest_pattern',
            confidence: 0.8,
            occurrence_count: 5,
            context_bucket: 'learning',
          },
        ]),
      });
      const calc = new FactorCalculators(makeMockMemory(), makeMockAffinity(), patterns);

      const content = makeContent({ topics: ['react'] });
      const factor = await calc.patternMatch(content, 'learning');

      expect(factor.name).toBe('pattern_match');
      expect(factor.score).toBe(0.8); // confidence of the interest card
      expect(factor.weight).toBe(FACTOR_WEIGHTS.pattern_match);
      expect(factor.explanation).toContain('Interest pattern');
    });

    it('returns negative score for block cards', async () => {
      const patterns = makeMockPatterns({
        matchCards: jest.fn().mockResolvedValue([
          {
            card_id: 'card-2',
            user_id: 'local_user',
            topic_key: 'block:spam',
            pattern_type: 'block_pattern',
            confidence: 0.9,
            occurrence_count: 8,
            context_bucket: 'general',
          },
        ]),
      });
      const calc = new FactorCalculators(makeMockMemory(), makeMockAffinity(), patterns);

      const content = makeContent({ topics: ['spam'] });
      const factor = await calc.patternMatch(content, 'general');

      expect(factor.score).toBe(-0.9); // -confidence of block card
      expect(factor.explanation).toContain('Block pattern');
      expect(factor.explanation).toContain('8 times');
    });

    it('returns 0 when no matching cards', async () => {
      const patterns = makeMockPatterns({
        matchCards: jest.fn().mockResolvedValue([]),
      });
      const calc = new FactorCalculators(makeMockMemory(), makeMockAffinity(), patterns);

      const content = makeContent({ topics: ['unknown-topic'] });
      const factor = await calc.patternMatch(content, 'general');

      expect(factor.score).toBe(0);
      expect(factor.explanation).toBe('No pattern match');
    });

    it('prioritises block cards over interest cards', async () => {
      const patterns = makeMockPatterns({
        matchCards: jest.fn().mockResolvedValue([
          {
            card_id: 'card-block',
            user_id: 'local_user',
            topic_key: 'block:crypto',
            pattern_type: 'block_pattern',
            confidence: 0.7,
            occurrence_count: 4,
            context_bucket: 'general',
          },
          {
            card_id: 'card-interest',
            user_id: 'local_user',
            topic_key: 'interest:blockchain',
            pattern_type: 'interest_pattern',
            confidence: 0.6,
            occurrence_count: 3,
            context_bucket: 'general',
          },
        ]),
      });
      const calc = new FactorCalculators(makeMockMemory(), makeMockAffinity(), patterns);

      const content = makeContent({ topics: ['crypto', 'blockchain'] });
      const factor = await calc.patternMatch(content, 'general');

      // Block cards are checked first, so we expect negative score
      expect(factor.score).toBeLessThan(0);
    });
  });

  // ── contextFit ───────────────────────────────────────────────────────────

  describe('contextFit', () => {
    it('returns positive score when YouTube content is in entertainment context', () => {
      const calc = new FactorCalculators(makeMockMemory(), makeMockAffinity(), makeMockPatterns());
      const content = makeContent({ platform: 'youtube' });
      const factor = calc.contextFit(content, 'entertainment');

      expect(factor.name).toBe('context_fit');
      expect(factor.score).toBe(0.3);
      expect(factor.weight).toBe(FACTOR_WEIGHTS.context_fit);
      expect(factor.explanation).toContain('youtube');
      expect(factor.explanation).toContain('fits');
      expect(factor.explanation).toContain('entertainment');
    });

    it('returns positive score when YouTube content is in learning context', () => {
      const calc = new FactorCalculators(makeMockMemory(), makeMockAffinity(), makeMockPatterns());
      const content = makeContent({ platform: 'youtube' });
      const factor = calc.contextFit(content, 'learning');

      expect(factor.score).toBe(0.3); // youtube fits learning
    });

    it('returns negative score for mismatched context', () => {
      const calc = new FactorCalculators(makeMockMemory(), makeMockAffinity(), makeMockPatterns());
      const content = makeContent({ platform: 'youtube' });
      const factor = calc.contextFit(content, 'shopping');

      expect(factor.score).toBe(-0.1);
      expect(factor.explanation).toContain('not typical');
    });

    it('returns positive score for amazon in shopping context', () => {
      const calc = new FactorCalculators(makeMockMemory(), makeMockAffinity(), makeMockPatterns());
      const content = makeContent({ platform: 'amazon' });
      const factor = calc.contextFit(content, 'shopping');

      expect(factor.score).toBe(0.3);
    });

    it('returns negative score for amazon in entertainment context', () => {
      const calc = new FactorCalculators(makeMockMemory(), makeMockAffinity(), makeMockPatterns());
      const content = makeContent({ platform: 'amazon' });
      const factor = calc.contextFit(content, 'entertainment');

      expect(factor.score).toBe(-0.1);
    });
  });

  // ── recency ──────────────────────────────────────────────────────────────

  describe('recency', () => {
    it('returns high score (~0.5) for content published today', () => {
      const calc = new FactorCalculators(makeMockMemory(), makeMockAffinity(), makeMockPatterns());
      const content = makeContent({ published_at: Date.now() });
      const factor = calc.recency(content);

      expect(factor.name).toBe('recency');
      expect(factor.score).toBeCloseTo(0.5, 1);
      expect(factor.weight).toBe(FACTOR_WEIGHTS.recency);
    });

    it('returns low score (~0) for content published 30 days ago', () => {
      const calc = new FactorCalculators(makeMockMemory(), makeMockAffinity(), makeMockPatterns());
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const content = makeContent({ published_at: thirtyDaysAgo });
      const factor = calc.recency(content);

      // 0.5 - 30/60 = 0.0
      expect(factor.score).toBeCloseTo(0, 1);
    });

    it('returns 0 for very old content (clamped)', () => {
      const calc = new FactorCalculators(makeMockMemory(), makeMockAffinity(), makeMockPatterns());
      const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
      const content = makeContent({ published_at: sixtyDaysAgo });
      const factor = calc.recency(content);

      // 0.5 - 60/60 = -0.5, clamped to 0
      expect(factor.score).toBe(0);
    });

    it('returns 0 with explanation when no publish date', () => {
      const calc = new FactorCalculators(makeMockMemory(), makeMockAffinity(), makeMockPatterns());
      const content = makeContent({ published_at: undefined });
      const factor = calc.recency(content);

      expect(factor.score).toBe(0);
      expect(factor.explanation).toBe('No publish date');
    });

    it('returns moderate score for week-old content', () => {
      const calc = new FactorCalculators(makeMockMemory(), makeMockAffinity(), makeMockPatterns());
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const content = makeContent({ published_at: sevenDaysAgo });
      const factor = calc.recency(content);

      // 0.5 - 7/60 ≈ 0.383
      expect(factor.score).toBeGreaterThan(0.3);
      expect(factor.score).toBeLessThan(0.5);
    });
  });

  // ── graphAffinity ────────────────────────────────────────────────────────

  describe('graphAffinity', () => {
    it('returns 0 when no entities to score', async () => {
      const calc = new FactorCalculators(makeMockMemory(), makeMockAffinity(), makeMockPatterns());
      const content = makeContent({ topics: [], entities: [] });
      const factor = await calc.graphAffinity(content, 'general');

      expect(factor.score).toBe(0);
      expect(factor.explanation).toBe('No entities to score');
    });

    it('returns 0 when no graph relations found', async () => {
      const affinity = makeMockAffinity({
        batchCalculate: jest.fn().mockResolvedValue(
          new Map([
            ['typescript', 0],
            ['programming', 0],
          ]),
        ),
      });
      const calc = new FactorCalculators(makeMockMemory(), affinity, makeMockPatterns());
      const content = makeContent({ topics: ['typescript', 'programming'] });
      const factor = await calc.graphAffinity(content, 'general');

      expect(factor.score).toBe(0);
      expect(factor.explanation).toBe('No graph relations found');
    });

    it('returns average affinity score for matched entities', async () => {
      const affinity = makeMockAffinity({
        batchCalculate: jest.fn().mockResolvedValue(
          new Map([
            ['react', 0.6],
            ['hooks', 0.4],
          ]),
        ),
      });
      const calc = new FactorCalculators(makeMockMemory(), affinity, makeMockPatterns());
      const content = makeContent({ topics: ['react', 'hooks'] });
      const factor = await calc.graphAffinity(content, 'learning');

      expect(factor.name).toBe('graph_affinity');
      expect(factor.score).toBeCloseTo(0.5, 1); // (0.6 + 0.4) / 2
      expect(factor.weight).toBe(FACTOR_WEIGHTS.graph_affinity);
    });
  });
});
