import { CompareService } from '../index';
import type { CandidateEntity } from '@schema/entities';
import type { PageContext } from '@schema/decisions';
import type { UserContext } from '../../retrieval';

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
    count: jest.fn().mockResolvedValue(0),
  }),
}));

// ── Mock AIExplainer ────────────────────────────────────────────────────────────

const mockCompareNarrative = jest.fn();
jest.mock('@brain/recommendation/AIExplainer', () => ({
  AIExplainer: jest.fn().mockImplementation(() => ({
    explain: jest.fn().mockResolvedValue('AI explanation'),
    compareNarrative: mockCompareNarrative,
  })),
}));

// ── Mock BrainFacade ────────────────────────────────────────────────────────────

const mockScoreEntities = jest.fn();
jest.mock('@brain/BrainFacade', () => ({
  getBrain: jest.fn(() => ({
    scoreEntities: mockScoreEntities,
  })),
}));

// ── Mock CommerceScorer ─────────────────────────────────────────────────────────

jest.mock('@brain/scoring/CommerceScorer', () => ({
  CommerceScorer: jest.fn(),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────────

function makeCandidate(id: string, metadata: Record<string, unknown> = {}): CandidateEntity {
  return {
    candidateId: id,
    entityType: 'product',
    rawText: `Product ${id}`,
    normalizedText: `product_${id}`,
    metadata,
  };
}

function makePageContext(): PageContext {
  return {
    site: 'amazon',
    pageType: 'search',
    url: 'https://amazon.com/s?q=headphones',
    timestamp: new Date().toISOString(),
  };
}

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

function makeScoreResponse(
  items: Array<{
    candidateId: string;
    score: number;
    decision?: string;
    explanation?: string;
    confidence?: number;
    factors?: string[];
  }>,
) {
  return {
    items: items.map((i) => ({
      candidateId: i.candidateId,
      score: i.score,
      decision: i.decision ?? 'show',
      explanation: i.explanation ?? 'Matches preferences',
      confidence: i.confidence ?? 0.8,
      factors: i.factors ?? ['brand_match'],
    })),
    computedAt: new Date().toISOString(),
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('CompareService', () => {
  let service: CompareService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCompareNarrative.mockResolvedValue(null);
    service = new CompareService();
  });

  describe('compareAndRank', () => {
    it('should return empty ranked array for empty candidates', async () => {
      const result = await service.compareAndRank([], makePageContext(), makeUserContext());

      expect(result.ranked).toEqual([]);
      expect(result.bestMatch).toBeNull();
      expect(result.alternatives).toEqual([]);
      expect(result.summary).toBe('No candidates to compare.');
    });

    it('should return a single candidate as bestMatch', async () => {
      const candidate = makeCandidate('c1', { brand: 'Sony', price: 100 });
      mockScoreEntities.mockResolvedValue(makeScoreResponse([{ candidateId: 'c1', score: 0.9 }]));

      const result = await service.compareAndRank(
        [candidate],
        makePageContext(),
        makeUserContext(),
      );

      expect(result.ranked).toHaveLength(1);
      expect(result.bestMatch).toBeDefined();
      expect(result.bestMatch!.candidateId).toBe('c1');
      expect(result.alternatives).toHaveLength(0);
    });

    it('should rank multiple candidates by score (highest first)', async () => {
      const c1 = makeCandidate('c1', { brand: 'Sony', price: 150 });
      const c2 = makeCandidate('c2', { brand: 'Bose', price: 200 });
      const c3 = makeCandidate('c3', { brand: 'JBL', price: 50 });

      mockScoreEntities.mockResolvedValue(
        makeScoreResponse([
          { candidateId: 'c1', score: 0.7 },
          { candidateId: 'c2', score: 0.95 },
          { candidateId: 'c3', score: 0.5 },
        ]),
      );

      const result = await service.compareAndRank(
        [c1, c2, c3],
        makePageContext(),
        makeUserContext(),
      );

      expect(result.ranked).toHaveLength(3);
      expect(result.ranked[0]!.candidateId).toBe('c2');
      expect(result.ranked[0]!.rank).toBe(1);
      expect(result.ranked[1]!.candidateId).toBe('c1');
      expect(result.ranked[1]!.rank).toBe(2);
      expect(result.ranked[2]!.candidateId).toBe('c3');
      expect(result.ranked[2]!.rank).toBe(3);
      expect(result.bestMatch!.candidateId).toBe('c2');
      expect(result.alternatives).toHaveLength(2);
    });

    it('should include explanation text in ranked candidates', async () => {
      const c1 = makeCandidate('c1');
      mockScoreEntities.mockResolvedValue(
        makeScoreResponse([
          { candidateId: 'c1', score: 0.8, explanation: 'Strong brand preference' },
        ]),
      );

      const result = await service.compareAndRank([c1], makePageContext(), makeUserContext());

      expect(result.ranked[0]!.explanation).toBe('Strong brand preference');
    });

    it('should populate tradeoffs array based on candidate metadata', async () => {
      const candidate = makeCandidate('c1', { price: 30, rating: 4.7, isPrime: true });
      mockScoreEntities.mockResolvedValue(
        makeScoreResponse([{ candidateId: 'c1', score: 0.8, confidence: 0.9 }]),
      );

      const result = await service.compareAndRank(
        [candidate],
        makePageContext(),
        makeUserContext(),
      );

      const tradeoffs = result.ranked[0]!.tradeoffs;
      expect(tradeoffs.length).toBeGreaterThan(0);
      expect(tradeoffs.some((t) => t.includes('Budget-friendly'))).toBe(true);
      expect(tradeoffs.some((t) => t.includes('Highly rated'))).toBe(true);
      expect(tradeoffs.some((t) => t.includes('Prime'))).toBe(true);
    });

    it('should use AI narrative when available', async () => {
      const c1 = makeCandidate('c1');
      mockScoreEntities.mockResolvedValue(makeScoreResponse([{ candidateId: 'c1', score: 0.8 }]));
      mockCompareNarrative.mockResolvedValue('AI-generated comparison narrative');

      const result = await service.compareAndRank([c1], makePageContext(), makeUserContext());

      expect(result.summary).toBe('AI-generated comparison narrative');
    });

    it('should return a CompareResult structure', async () => {
      const c1 = makeCandidate('c1');
      mockScoreEntities.mockResolvedValue(makeScoreResponse([{ candidateId: 'c1', score: 0.8 }]));

      const result = await service.compareAndRank([c1], makePageContext(), makeUserContext());

      expect(result).toHaveProperty('ranked');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('bestMatch');
      expect(result).toHaveProperty('alternatives');
      expect(Array.isArray(result.ranked)).toBe(true);
      expect(Array.isArray(result.alternatives)).toBe(true);
    });

    it('should generate tradeoffs for premium price', async () => {
      const candidate = makeCandidate('c1', { price: 350, brand: 'Sony' });
      mockScoreEntities.mockResolvedValue(
        makeScoreResponse([{ candidateId: 'c1', score: 0.8, confidence: 0.9 }]),
      );

      const result = await service.compareAndRank(
        [candidate],
        makePageContext(),
        makeUserContext(),
      );

      const tradeoffs = result.ranked[0]!.tradeoffs;
      expect(tradeoffs.some((t) => t.includes('Premium price'))).toBe(true);
    });

    it('should generate tradeoff for below-average rating', async () => {
      const candidate = makeCandidate('c1', { rating: 3.0 });
      mockScoreEntities.mockResolvedValue(
        makeScoreResponse([{ candidateId: 'c1', score: 0.5, confidence: 0.8 }]),
      );

      const result = await service.compareAndRank(
        [candidate],
        makePageContext(),
        makeUserContext(),
      );

      const tradeoffs = result.ranked[0]!.tradeoffs;
      expect(tradeoffs.some((t) => t.includes('Below-average rating'))).toBe(true);
    });

    it('should generate tradeoff for brand preference alignment (positive)', async () => {
      const candidate = makeCandidate('c1', { brand: 'Sony' });
      mockScoreEntities.mockResolvedValue(
        makeScoreResponse([{ candidateId: 'c1', score: 0.9, confidence: 0.8 }]),
      );

      const ctx = makeUserContext({
        brandPreferences: [{ brandId: 'brand:sony', displayName: 'Sony', sentiment: 'positive' }],
      });

      const result = await service.compareAndRank([candidate], makePageContext(), ctx);

      const tradeoffs = result.ranked[0]!.tradeoffs;
      expect(tradeoffs.some((t) => t.includes('preferred brand'))).toBe(true);
    });

    it('should generate tradeoff for brand preference alignment (negative)', async () => {
      const candidate = makeCandidate('c1', { brand: 'BadBrand' });
      mockScoreEntities.mockResolvedValue(
        makeScoreResponse([{ candidateId: 'c1', score: 0.3, confidence: 0.8 }]),
      );

      const ctx = makeUserContext({
        brandPreferences: [
          { brandId: 'brand:badbrand', displayName: 'BadBrand', sentiment: 'negative' },
        ],
      });

      const result = await service.compareAndRank([candidate], makePageContext(), ctx);

      const tradeoffs = result.ranked[0]!.tradeoffs;
      expect(tradeoffs.some((t) => t.includes('marked negatively'))).toBe(true);
    });

    it('should generate tradeoff for avoided seller', async () => {
      const candidate = makeCandidate('c1', { seller: 'SketchySeller' });
      mockScoreEntities.mockResolvedValue(
        makeScoreResponse([{ candidateId: 'c1', score: 0.4, confidence: 0.8 }]),
      );

      const ctx = makeUserContext({
        sellerPreferences: [
          {
            sellerId: 'seller:sketchyseller',
            displayName: 'SketchySeller',
            sentiment: 'negative' as const,
          },
        ],
      });

      const result = await service.compareAndRank([candidate], makePageContext(), ctx);

      const tradeoffs = result.ranked[0]!.tradeoffs;
      expect(tradeoffs.some((t) => t.includes('avoided this seller'))).toBe(true);
    });

    it('should generate low confidence tradeoff', async () => {
      const candidate = makeCandidate('c1');
      mockScoreEntities.mockResolvedValue(
        makeScoreResponse([{ candidateId: 'c1', score: 0.5, confidence: 0.3 }]),
      );

      const result = await service.compareAndRank(
        [candidate],
        makePageContext(),
        makeUserContext(),
      );

      const tradeoffs = result.ranked[0]!.tradeoffs;
      expect(tradeoffs.some((t) => t.includes('Low confidence'))).toBe(true);
    });

    it('should use AI narrative when compareNarrative returns a string', async () => {
      const c1 = makeCandidate('c1');
      const c2 = makeCandidate('c2');
      mockScoreEntities.mockResolvedValue(
        makeScoreResponse([
          { candidateId: 'c1', score: 0.9 },
          { candidateId: 'c2', score: 0.7 },
        ]),
      );
      mockCompareNarrative.mockResolvedValue('AI says c1 is better because of brand preference');

      const result = await service.compareAndRank([c1, c2], makePageContext(), makeUserContext());

      expect(result.summary).toBe('AI says c1 is better because of brand preference');
    });

    it('should fall back to template summary when AI narrative fails', async () => {
      const c1 = makeCandidate('c1', { brand: 'Sony' });
      mockScoreEntities.mockResolvedValue(
        makeScoreResponse([
          { candidateId: 'c1', score: 0.9, explanation: 'Matches your preferences' },
        ]),
      );
      mockCompareNarrative.mockRejectedValue(new Error('AI unavailable'));

      const result = await service.compareAndRank([c1], makePageContext(), makeUserContext());

      expect(result.summary).toContain('Best match');
      expect(result.summary).toContain('Sony');
    });

    it('should handle all candidates with same score', async () => {
      const c1 = makeCandidate('c1', { brand: 'Sony', price: 100 });
      const c2 = makeCandidate('c2', { brand: 'Bose', price: 100 });
      const c3 = makeCandidate('c3', { brand: 'JBL', price: 100 });
      mockScoreEntities.mockResolvedValue(
        makeScoreResponse([
          { candidateId: 'c1', score: 0.75 },
          { candidateId: 'c2', score: 0.75 },
          { candidateId: 'c3', score: 0.75 },
        ]),
      );

      const result = await service.compareAndRank(
        [c1, c2, c3],
        makePageContext(),
        makeUserContext(),
      );

      expect(result.ranked).toHaveLength(3);
      expect(result.bestMatch).toBeDefined();
      expect(result.alternatives).toHaveLength(2);
      // All should have same score
      expect(result.ranked.every((r) => r.score === 0.75)).toBe(true);
    });

    it('should build summary with brand preferences', async () => {
      const c1 = makeCandidate('c1', { brand: 'Sony' });
      const c2 = makeCandidate('c2', { brand: 'Bose' });
      mockScoreEntities.mockResolvedValue(
        makeScoreResponse([
          { candidateId: 'c1', score: 0.9, explanation: 'Great match' },
          { candidateId: 'c2', score: 0.7, explanation: 'Good option' },
        ]),
      );
      mockCompareNarrative.mockResolvedValue(null);

      const ctx = makeUserContext({
        brandPreferences: [{ brandId: 'brand:sony', displayName: 'Sony', sentiment: 'positive' }],
      });

      const result = await service.compareAndRank([c1, c2], makePageContext(), ctx);

      expect(result.summary).toContain('Best match');
      expect(result.summary).toContain('Sony');
      expect(result.summary).toContain('preference for');
      expect(result.summary).toContain('1 alternative');
    });
  });

  describe('comparePair', () => {
    it('should compare two candidates and return winner, loser, and differences', async () => {
      const a = makeCandidate('a', { brand: 'Sony', price: 150, rating: 4.8, isPrime: true });
      const b = makeCandidate('b', { brand: 'Bose', price: 250, rating: 4.2, isPrime: false });

      mockScoreEntities.mockResolvedValue(
        makeScoreResponse([
          { candidateId: 'a', score: 0.9 },
          { candidateId: 'b', score: 0.7 },
        ]),
      );

      const result = await service.comparePair(a, b, makePageContext(), makeUserContext());

      expect(result.winner.candidateId).toBe('a');
      expect(result.loser.candidateId).toBe('b');
      expect(result.differences.length).toBeGreaterThan(0);
      expect(result.differences.some((d) => d.includes('cheaper'))).toBe(true);
      expect(result.differences.some((d) => d.includes('higher rating'))).toBe(true);
      expect(result.differences.some((d) => d.includes('Different brands'))).toBe(true);
      expect(result.differences.some((d) => d.includes('Prime'))).toBe(true);
    });
  });
});
