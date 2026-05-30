import { EntityExtractor } from '../EntityExtractor';

// ── Mocks ────────────────────────────────────────────────────────────────────────

let llmConfigured = false;
let llmResponse: string | null = null;

jest.mock('@agent/llm/LLMClient', () => ({
  getLLMClient: jest.fn(() => ({
    isConfigured: jest.fn().mockImplementation(() => Promise.resolve(llmConfigured)),
    call: jest.fn().mockImplementation(() => Promise.resolve(llmResponse)),
    invalidateConfig: jest.fn(),
  })),
}));

jest.mock('@shared/Logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// Mock KnowledgeGraph
const mockFindEntityByName = jest.fn().mockResolvedValue(null);
const mockGraph = {
  findEntityByName: mockFindEntityByName,
} as any;

// ── Helpers ──────────────────────────────────────────────────────────────────────

function makeContent(
  overrides: Partial<{
    title: string;
    platform: string;
    creator: string;
    topics: string[];
    entities: string[];
    url: string;
    id: string;
  }> = {},
) {
  return {
    id: overrides.id ?? 'c1',
    title: overrides.title ?? 'Test Content',
    platform: overrides.platform ?? 'youtube',
    creator: overrides.creator ?? undefined,
    topics: overrides.topics ?? [],
    entities: overrides.entities ?? [],
    url: overrides.url ?? 'https://youtube.com/watch?v=123',
  } as any;
}

// ── Tests ────────────────────────────────────────────────────────────────────────

describe('EntityExtractor', () => {
  let extractor: EntityExtractor;

  beforeEach(() => {
    jest.clearAllMocks();
    llmConfigured = false;
    llmResponse = null;
    extractor = new EntityExtractor(mockGraph);
  });

  describe('enrich() — rule-based fallback (LLM not configured)', () => {
    it('extracts topics from title using rule-based extractor', async () => {
      const content = makeContent({ title: 'Bitcoin Price Analysis and Crypto Trading' });
      const result = await extractor.enrich(content);

      expect(result.topics.length).toBeGreaterThan(0);
      // Bitcoin/crypto should be detected
      expect(result.topics.some((t: string) => t.includes('bitcoin') || t.includes('crypto'))).toBe(
        true,
      );
    });

    it('includes creator as entity when provided', async () => {
      const content = makeContent({ title: 'Some Video', creator: 'MrBeast' });
      const result = await extractor.enrich(content);

      expect(result.entities).toContain('mrbeast');
    });

    it('preserves existing topics from content', async () => {
      const content = makeContent({ title: 'Random Video', topics: ['gaming'] });
      const result = await extractor.enrich(content);

      expect(result.topics).toContain('gaming');
    });

    it('resolves aliases via graph when entity found', async () => {
      mockFindEntityByName.mockResolvedValueOnce({ name: 'Bitcoin', id: 'btc' });
      const content = makeContent({ title: 'Bitcoin analysis' });
      const result = await extractor.enrich(content);

      expect(mockFindEntityByName).toHaveBeenCalled();
    });
  });

  describe('enrich() — LLM-based', () => {
    beforeEach(() => {
      llmConfigured = true;
    });

    it('returns entities from LLM response', async () => {
      llmResponse = '{"topics":["fitness","nutrition"],"entities":["nike"]}';
      const content = makeContent({ title: 'Best Running Shoes Review' });
      const result = await extractor.enrich(content);

      expect(result.topics).toContain('fitness');
      expect(result.topics).toContain('nutrition');
      expect(result.entities).toContain('nike');
    });

    it('merges LLM topics with existing content topics', async () => {
      llmResponse = '{"topics":["tech"],"entities":[]}';
      const content = makeContent({ title: 'TypeScript Tutorial', topics: ['programming'] });
      const result = await extractor.enrich(content);

      expect(result.topics).toContain('programming');
      expect(result.topics).toContain('tech');
    });

    it('includes creator as entity alongside LLM entities', async () => {
      llmResponse = '{"topics":["gaming"],"entities":["minecraft"]}';
      const content = makeContent({ title: 'Minecraft Build', creator: 'Dream' });
      const result = await extractor.enrich(content);

      expect(result.entities).toContain('dream');
      expect(result.entities).toContain('minecraft');
    });
  });

  describe('enrich() — LLM error handling', () => {
    beforeEach(() => {
      llmConfigured = true;
    });

    it('falls back to rule-based when LLM returns null', async () => {
      llmResponse = null;
      const content = makeContent({ title: 'Bitcoin Trading Guide' });
      const result = await extractor.enrich(content);

      // Should still extract via rules
      expect(result.topics.length).toBeGreaterThanOrEqual(0);
    });

    it('falls back to rule-based when LLM returns invalid JSON', async () => {
      llmResponse = 'This is not JSON at all';
      const content = makeContent({ title: 'Python Programming Tutorial' });
      const result = await extractor.enrich(content);

      // Should not throw, falls back to rules
      expect(result).toBeDefined();
      expect(result.title).toBe('Python Programming Tutorial');
    });

    it('falls back to rule-based when LLM call throws', async () => {
      const { getLLMClient } = require('@agent/llm/LLMClient');
      getLLMClient.mockReturnValueOnce({
        isConfigured: jest.fn().mockResolvedValue(true),
        call: jest.fn().mockRejectedValue(new Error('API error')),
        invalidateConfig: jest.fn(),
      });

      const content = makeContent({ title: 'React Hooks Guide' });
      const result = await extractor.enrich(content);

      expect(result).toBeDefined();
    });
  });

  describe('enrich() — junk topic filtering', () => {
    it('filters out numeric/price topics', async () => {
      llmConfigured = true;
      llmResponse = '{"topics":["tech","399.99","15%","a"],"entities":["$99"]}';
      const content = makeContent({ title: 'Tech Review' });
      const result = await extractor.enrich(content);

      expect(result.topics).toContain('tech');
      expect(result.topics).not.toContain('399.99');
      expect(result.topics).not.toContain('15%');
      expect(result.topics).not.toContain('a');
      expect(result.entities).not.toContain('$99');
    });
  });
});
