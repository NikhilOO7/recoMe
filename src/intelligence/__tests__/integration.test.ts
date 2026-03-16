/**
 * Integration tests — verify end-to-end flows through MemoryService + RecommendationEngine.
 */
import { createMemoryService } from '../memory/MemoryService';
import { KnowledgeGraph } from '../graph/KnowledgeGraph';
import { AffinityCalculator } from '../graph/AffinityCalculator';
import { EntityExtractor } from '../extraction/EntityExtractor';
import { FactorCalculators } from '../recommendation/FactorCalculators';
import { RecommendationEngine } from '../recommendation/RecommendationEngine';
import { Explainer } from '../recommendation/Explainer';
import { PatternDetector } from '../memory/PatternDetector';
import { MemoryStore } from '../memory/storage/MemoryStore';
import type { ContentMetadata } from '@shared/types';

// ── Mock IndexedDB ─────────────────────────────────────────────────────────────

const memoryStore = new Map<string, unknown>();
const eventsStore: unknown[] = [];
const cardsStore = new Map<string, unknown>();
const entityStore = new Map<string, unknown>();
const relationStore = new Map<string, unknown>();

jest.mock('@data/db', () => ({
  getDB: jest.fn().mockResolvedValue({
    put: jest.fn().mockImplementation((_store: string, value: { entry_id?: string; card_id?: string; id?: string }) => {
      if (_store === 'memory_entries') memoryStore.set(value.entry_id!, value);
      if (_store === 'mid_term_cards') cardsStore.set(value.card_id!, value);
      if (_store === 'entities') entityStore.set(value.id!, value);
      if (_store === 'relations') relationStore.set(value.id!, value);
      return Promise.resolve();
    }),
    add: jest.fn().mockImplementation((_store: string, value: unknown) => {
      eventsStore.push(value);
      return Promise.resolve();
    }),
    get: jest.fn().mockImplementation((_store: string, key: string) => {
      if (_store === 'memory_entries') return Promise.resolve(memoryStore.get(key));
      if (_store === 'mid_term_cards') return Promise.resolve(cardsStore.get(key));
      if (_store === 'entities') return Promise.resolve(entityStore.get(key));
      return Promise.resolve(undefined);
    }),
    getAll: jest.fn().mockImplementation((_store: string) => {
      if (_store === 'entities') return Promise.resolve([...entityStore.values()]);
      if (_store === 'relations') return Promise.resolve([...relationStore.values()]);
      return Promise.resolve([]);
    }),
    getAllFromIndex: jest.fn().mockImplementation((_store: string, index: string, query: unknown) => {
      if (_store === 'memory_entries') {
        const entries = [...memoryStore.values()] as Array<{ user_id: string; context_bucket: string; status: string; topic_key: string; is_deleted: boolean }>;
        if (index === 'by_user_context') {
          const [uid, ctx] = query as [string, string];
          return Promise.resolve(entries.filter((e) => e.user_id === uid && e.context_bucket === ctx));
        }
        if (index === 'by_status') {
          const [uid, status] = query as [string, string];
          return Promise.resolve(entries.filter((e) => e.user_id === uid && e.status === status));
        }
        if (index === 'by_topic') {
          const [uid, topicKey] = query as [string, string];
          return Promise.resolve(entries.filter((e) => e.user_id === uid && e.topic_key === topicKey));
        }
      }
      if (_store === 'memory_events') {
        const events = [...eventsStore] as Array<{ topic_key: string }>;
        if (index === 'by_topic') return Promise.resolve(events.filter((e) => e.topic_key === query));
      }
      if (_store === 'mid_term_cards') {
        const cards = [...cardsStore.values()] as Array<{ user_id: string; context_bucket: string }>;
        if (index === 'by_user_context') {
          const [uid, ctx] = query as [string, string];
          return Promise.resolve(cards.filter((c) => c.user_id === uid && c.context_bucket === ctx));
        }
      }
      if (_store === 'entities') {
        if (index === 'by_name') return Promise.resolve(
          [...entityStore.values()].filter((e: unknown) => (e as { name: string }).name === query)
        );
      }
      if (_store === 'relations') {
        if (index === 'by_source') return Promise.resolve(
          [...relationStore.values()].filter((r: unknown) => (r as { source_id: string }).source_id === query)
        );
        if (index === 'by_source_type') {
          const [src, type] = query as [string, string];
          return Promise.resolve(
            [...relationStore.values()].filter((r: unknown) => (r as { source_id: string; type: string }).source_id === src && (r as { type: string }).type === type)
          );
        }
      }
      return Promise.resolve([]);
    }),
    clear: jest.fn().mockResolvedValue(undefined),
    count: jest.fn().mockResolvedValue(0),
    transaction: jest.fn().mockReturnValue({ store: { clear: jest.fn() }, done: Promise.resolve() }),
  }),
}));

// Mock chrome.storage for settings
const storageData: Record<string, unknown> = {};
(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    sync: {
      get: jest.fn().mockImplementation((key: string) => Promise.resolve({ [key]: storageData[key] })),
      set: jest.fn().mockImplementation((data: Record<string, unknown>) => { Object.assign(storageData, data); return Promise.resolve(); }),
    },
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    },
  },
};

function makeContent(title: string, topics: string[] = [], platform = 'youtube' as const): ContentMetadata {
  return {
    id: `test-${Date.now()}-${Math.random()}`,
    platform,
    type: 'post',
    title,
    topics,
    entities: [],
    url: 'https://example.com',
  };
}

describe('Integration: block → hide flow', () => {
  let memory: ReturnType<typeof createMemoryService>;
  let engine: RecommendationEngine;

  beforeEach(() => {
    memoryStore.clear();
    eventsStore.length = 0;
    cardsStore.clear();
    entityStore.clear();
    relationStore.clear();

    memory = createMemoryService();
    const graph = new KnowledgeGraph();
    const affinity = new AffinityCalculator(graph);
    const store = new MemoryStore();
    const patterns = new PatternDetector(store);
    const factors = new FactorCalculators(memory, affinity, patterns);
    const explainer = new Explainer();
    engine = new RecommendationEngine(factors, explainer);
  });

  it('should hide content matching a blocked topic', async () => {
    // Block "crypto"
    await memory.blockForever('crypto');

    // Process content about crypto
    const content = makeContent('Bitcoin price surges to new high', ['crypto', 'bitcoin']);
    const result = await engine.recommend(content, 'general', 0.5);

    expect(result.action).toBe('hide');
    expect(result.score).toBeLessThan(0);
  });

  it('should show content that does not match blocks', async () => {
    await memory.blockForever('crypto');

    const content = makeContent('Best hiking trails in Colorado', ['travel', 'hiking']);
    const result = await engine.recommend(content, 'general', 0.5);

    expect(result.action).not.toBe('hide');
  });

  it('should boost content matching liked topics', async () => {
    await memory.likeForever('cooking');

    const content = makeContent('Amazing pasta recipe from Italy', ['cooking', 'food']);
    const result = await engine.recommend(content, 'general', 0.5);

    // Should not be hidden — the liked topic match prevents hiding
    expect(result.action).not.toBe('hide');
  });

  it('should record search and not crash', async () => {
    // Just verify it doesn't throw
    await memory.recordSearch('best laptops 2026', 'amazon');
    // The search should create a memory entry
    expect(memoryStore.size).toBeGreaterThan(0);
  });
});
