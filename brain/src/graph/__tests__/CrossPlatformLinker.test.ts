import { CrossPlatformLinker } from '../CrossPlatformLinker';
import { KnowledgeGraph } from '../KnowledgeGraph';

// ── Mock IndexedDB ──────────────────────────────────────────────────────────────

const entitiesStore = new Map<string, any>();
const relationsStore = new Map<string, any>();

jest.mock('@data/db', () => ({
  getDB: jest.fn().mockResolvedValue({
    count: jest.fn().mockImplementation((store: string) => {
      if (store === 'entities') return Promise.resolve(entitiesStore.size);
      return Promise.resolve(0);
    }),
    get: jest.fn().mockImplementation((store: string, key: string) => {
      if (store === 'entities') return Promise.resolve(entitiesStore.get(key));
      if (store === 'relations') return Promise.resolve(relationsStore.get(key));
      return Promise.resolve(undefined);
    }),
    put: jest.fn().mockImplementation((store: string, value: { id: string }) => {
      if (store === 'entities') entitiesStore.set(value.id, value);
      if (store === 'relations') relationsStore.set(value.id, value);
      return Promise.resolve();
    }),
    getAll: jest.fn().mockImplementation((store: string) => {
      if (store === 'entities') return Promise.resolve([...entitiesStore.values()]);
      if (store === 'relations') return Promise.resolve([...relationsStore.values()]);
      return Promise.resolve([]);
    }),
    getAllFromIndex: jest
      .fn()
      .mockImplementation((store: string, index: string, query: unknown) => {
        if (store === 'entities') {
          if (index === 'by_name') {
            const vals = [...entitiesStore.values()] as Array<{ name: string }>;
            return Promise.resolve(vals.filter((e) => e.name === query));
          }
          if (index === 'by_type') {
            const vals = [...entitiesStore.values()] as Array<{ type: string }>;
            return Promise.resolve(vals.filter((e) => e.type === query));
          }
        }
        if (store === 'relations') {
          if (index === 'by_source') {
            const vals = [...relationsStore.values()] as Array<{ source_id: string }>;
            return Promise.resolve(vals.filter((r) => r.source_id === query));
          }
          if (index === 'by_target') {
            const vals = [...relationsStore.values()] as Array<{
              target_id: string;
              bidirectional?: boolean;
            }>;
            return Promise.resolve(vals.filter((r) => r.target_id === query && r.bidirectional));
          }
        }
        return Promise.resolve([]);
      }),
    delete: jest.fn().mockResolvedValue(undefined),
    transaction: jest.fn().mockReturnValue({
      objectStore: jest.fn().mockImplementation((name: string) => ({
        put: jest.fn().mockImplementation((value: { id: string }) => {
          if (name === 'entities') entitiesStore.set(value.id, value);
          if (name === 'relations') relationsStore.set(value.id, value);
          return Promise.resolve();
        }),
      })),
      done: Promise.resolve(),
    }),
  }),
}));

jest.mock('@data/LRUCache', () => ({
  LRUCache: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn(),
    invalidate: jest.fn(),
  })),
}));

// Mock LLMClient — not configured by default
jest.mock('@agent/llm/LLMClient', () => ({
  getLLMClient: jest.fn().mockReturnValue({
    isConfigured: jest.fn().mockResolvedValue(false),
    call: jest.fn().mockResolvedValue(null),
  }),
}));

// ── Mock MemoryStore ────────────────────────────────────────────────────────────

let mockEvents: Array<{ topic_key: string; platform: string }> = [];

const mockMemoryStore = {
  getEventsAfter: jest.fn().mockImplementation(() => Promise.resolve(mockEvents)),
} as any;

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('CrossPlatformLinker', () => {
  let graph: KnowledgeGraph;
  let linker: CrossPlatformLinker;

  beforeEach(() => {
    entitiesStore.clear();
    relationsStore.clear();
    mockEvents = [];
    graph = new KnowledgeGraph();
    linker = new CrossPlatformLinker(mockMemoryStore, graph);
  });

  describe('run()', () => {
    it('returns 0 when no events exist', async () => {
      mockEvents = [];
      const count = await linker.run();
      expect(count).toBe(0);
    });

    it('returns 0 when events are on a single platform (need 2+)', async () => {
      mockEvents = [
        { topic_key: 'machine_learning', platform: 'twitter' },
        { topic_key: 'machine_learning', platform: 'twitter' },
        { topic_key: 'deep_learning', platform: 'twitter' },
      ];
      const count = await linker.run();
      expect(count).toBe(0);
    });

    it('creates relations when same topic appears on 2+ platforms', async () => {
      mockEvents = [
        { topic_key: 'machine_learning', platform: 'twitter' },
        { topic_key: 'machine_learning', platform: 'youtube' },
        { topic_key: 'deep_learning', platform: 'twitter' },
        { topic_key: 'deep_learning', platform: 'reddit' },
      ];

      const count = await linker.run();
      // Two cross-platform topics found, one relation between them (shared no platforms
      // but the linker creates entities for both, then checks shared platforms).
      // The exact count depends on whether they share platforms.
      // machine_learning is on twitter, deep_learning is on twitter — shared platform = twitter
      expect(count).toBeGreaterThanOrEqual(1);
      // Verify entities were created
      expect(entitiesStore.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getCrossPlatformTopics()', () => {
    it('returns detected cross-platform topics', async () => {
      mockEvents = [
        { topic_key: 'react', platform: 'twitter' },
        { topic_key: 'react', platform: 'youtube' },
        { topic_key: 'react', platform: 'reddit' },
        { topic_key: 'python', platform: 'twitter' },
        { topic_key: 'python', platform: 'reddit' },
      ];

      const topics = await linker.getCrossPlatformTopics();
      expect(topics).toHaveLength(2);
      expect(topics.map((t) => t.topicKey)).toContain('react');
      expect(topics.map((t) => t.topicKey)).toContain('python');
    });

    it('returns topics sorted by event count descending', async () => {
      mockEvents = [
        { topic_key: 'python', platform: 'twitter' },
        { topic_key: 'python', platform: 'youtube' },
        { topic_key: 'react', platform: 'twitter' },
        { topic_key: 'react', platform: 'youtube' },
        { topic_key: 'react', platform: 'reddit' },
        { topic_key: 'react', platform: 'hackernews' },
      ];

      const topics = await linker.getCrossPlatformTopics();
      expect(topics).toHaveLength(2);
      // react has 4 events, python has 2 => react should be first
      expect(topics[0]!.topicKey).toBe('react');
      expect(topics[0]!.eventCount).toBe(4);
      expect(topics[1]!.topicKey).toBe('python');
      expect(topics[1]!.eventCount).toBe(2);
    });

    it('excludes topics on only one platform', async () => {
      mockEvents = [
        { topic_key: 'react', platform: 'twitter' },
        { topic_key: 'react', platform: 'youtube' },
        { topic_key: 'golang', platform: 'twitter' },
        { topic_key: 'golang', platform: 'twitter' },
      ];

      const topics = await linker.getCrossPlatformTopics();
      expect(topics).toHaveLength(1);
      expect(topics[0]!.topicKey).toBe('react');
    });
  });
});
