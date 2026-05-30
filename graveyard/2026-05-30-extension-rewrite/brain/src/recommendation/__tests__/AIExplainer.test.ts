import { AIExplainer } from '../AIExplainer';
import type { CandidateEntity } from '@schema/entities';
import type { UserContext } from '@agent/retrieval';
import type { ScoringFactor } from '@schema/content';

// ── Mock chrome APIs ────────────────────────────────────────────────────────────

(globalThis as any).chrome = {
  storage: {
    local: { get: jest.fn().mockResolvedValue({}), set: jest.fn().mockResolvedValue(undefined) },
    session: { get: jest.fn().mockResolvedValue({}), set: jest.fn().mockResolvedValue(undefined) },
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

// ── Mock PromptBuilder ──────────────────────────────────────────────────────────

jest.mock('@agent/llm/PromptBuilder', () => ({
  PromptBuilder: jest.fn().mockImplementation(() => ({
    buildExplainPrompt: jest
      .fn()
      .mockReturnValue({ system: 'explain system', prompt: 'explain prompt' }),
    buildComparePrompt: jest
      .fn()
      .mockReturnValue({ system: 'compare system', prompt: 'compare prompt' }),
  })),
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

function makeUserContext(): UserContext {
  return {
    recentIntents: [],
    brandPreferences: [],
    sellerPreferences: [],
    activeIntentTypes: [],
    watchlist: [],
    recentDecisions: [],
    knownProducts: [],
  };
}

function makeFactors(): ScoringFactor[] {
  return [
    { name: 'brand_match', score: 0.8, weight: 1.5, explanation: 'Preferred brand' },
    { name: 'price_range', score: 0.5, weight: 1.0, explanation: 'Within budget' },
  ];
}

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('AIExplainer', () => {
  let explainer: AIExplainer;

  beforeEach(() => {
    jest.clearAllMocks();
    explainer = new AIExplainer();
  });

  describe('explain', () => {
    it('should return template explanation when LLM is not configured', async () => {
      mockIsConfigured.mockResolvedValue(false);

      const result = await explainer.explain(
        makeCandidate('c1', { brand: 'Sony' }),
        makeFactors(),
        makeUserContext(),
      );

      expect(result).toContain('Sony');
      expect(result).toContain('boosted');
      expect(result).toContain('Preferred brand');
      expect(mockLLMCall).not.toHaveBeenCalled();
    });

    it('should return LLM response when configured', async () => {
      mockIsConfigured.mockResolvedValue(true);
      mockLLMCall.mockResolvedValue(
        'This product was recommended because you love Sony headphones.',
      );

      const result = await explainer.explain(
        makeCandidate('c1', { brand: 'Sony' }),
        makeFactors(),
        makeUserContext(),
      );

      expect(result).toBe('This product was recommended because you love Sony headphones.');
      expect(mockLLMCall).toHaveBeenCalled();
    });

    it('should fall back to template when LLM returns null', async () => {
      mockIsConfigured.mockResolvedValue(true);
      mockLLMCall.mockResolvedValue(null);

      const result = await explainer.explain(
        makeCandidate('c1', { brand: 'Sony' }),
        makeFactors(),
        makeUserContext(),
      );

      expect(result).toContain('Sony');
      expect(result).toContain('boosted');
    });

    it('should fall back to template when LLM throws', async () => {
      mockIsConfigured.mockResolvedValue(true);
      mockLLMCall.mockRejectedValue(new Error('API error'));

      const result = await explainer.explain(
        makeCandidate('c1', { brand: 'Sony' }),
        makeFactors(),
        makeUserContext(),
      );

      expect(result).toContain('Sony');
      expect(result).toContain('boosted');
    });
  });

  describe('compareNarrative', () => {
    it('should return null when LLM is not configured', async () => {
      mockIsConfigured.mockResolvedValue(false);

      const result = await explainer.compareNarrative(
        [makeCandidate('c1'), makeCandidate('c2')],
        makeUserContext(),
      );

      expect(result).toBeNull();
      expect(mockLLMCall).not.toHaveBeenCalled();
    });

    it('should return narrative text when LLM is configured', async () => {
      mockIsConfigured.mockResolvedValue(true);
      mockLLMCall.mockResolvedValue(
        'Product A is better because it has a higher rating and lower price.',
      );

      const result = await explainer.compareNarrative(
        [makeCandidate('c1'), makeCandidate('c2')],
        makeUserContext(),
        [
          { candidateId: 'c1', score: 0.9, decision: 'show', explanation: 'Best match' },
          { candidateId: 'c2', score: 0.6, decision: 'show', explanation: 'Decent option' },
        ],
      );

      expect(result).toBe('Product A is better because it has a higher rating and lower price.');
      expect(mockLLMCall).toHaveBeenCalled();
    });

    it('should return null when LLM throws', async () => {
      mockIsConfigured.mockResolvedValue(true);
      mockLLMCall.mockRejectedValue(new Error('API error'));

      const result = await explainer.compareNarrative(
        [makeCandidate('c1'), makeCandidate('c2')],
        makeUserContext(),
      );

      expect(result).toBeNull();
    });
  });
});
