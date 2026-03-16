import { KnowledgeGraph } from '../KnowledgeGraph';
import { AffinityCalculator } from '../AffinityCalculator';

// ── Mock IndexedDB ──────────────────────────────────────────────────────────────

const entitiesStore = new Map();
const relationsStore = new Map();

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
    getAllFromIndex: jest.fn().mockImplementation((store: string, index: string, query: unknown) => {
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
          const vals = [...relationsStore.values()] as Array<{ source_id: string; bidirectional?: boolean }>;
          return Promise.resolve(vals.filter((r) => r.source_id === query));
        }
        if (index === 'by_target') {
          const vals = [...relationsStore.values()] as Array<{ target_id: string; bidirectional?: boolean }>;
          return Promise.resolve(vals.filter((r) => r.target_id === query && r.bidirectional));
        }
      }
      return Promise.resolve([]);
    }),
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

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('KnowledgeGraph', () => {
  let graph: KnowledgeGraph;

  beforeEach(() => {
    entitiesStore.clear();
    relationsStore.clear();
    graph = new KnowledgeGraph();
  });

  describe('seedDefaults', () => {
    it('should seed entities and relations', async () => {
      await graph.seedDefaults();
      expect(entitiesStore.size).toBeGreaterThan(0);
      expect(relationsStore.size).toBeGreaterThan(0);
    });

    it('should not re-seed if entities already exist', async () => {
      entitiesStore.set('existing', { id: 'existing' });
      await graph.seedDefaults();
      // Should not add more from seed since count > 0
      expect(entitiesStore.size).toBe(1);
    });
  });

  describe('addRelation', () => {
    it('should persist a relation', async () => {
      const rel = await graph.addRelation('user', 'crypto', 'blocked', 1.0);
      expect(rel.source_id).toBe('user');
      expect(rel.target_id).toBe('crypto');
      expect(rel.type).toBe('blocked');
      expect(relationsStore.size).toBe(1);
    });

    it('should clamp weight to [0, 1]', async () => {
      const rel = await graph.addRelation('user', 'crypto', 'blocked', 5.0);
      expect(rel.weight).toBe(1.0);

      const rel2 = await graph.addRelation('user', 'crypto2', 'blocked', -2.0);
      expect(rel2.weight).toBe(0);
    });
  });

  describe('findSimilar', () => {
    it('should return entities connected by similar_to', async () => {
      // Manually seed minimal crypto cluster
      entitiesStore.set('crypto', { id: 'crypto', name: 'Crypto', type: 'topic', aliases: [] });
      entitiesStore.set('bitcoin', { id: 'bitcoin', name: 'Bitcoin', type: 'topic', aliases: [] });
      relationsStore.set('rel1', {
        id: 'rel1',
        source_id: 'bitcoin',
        target_id: 'crypto',
        type: 'similar_to',
        weight: 0.95,
        bidirectional: true,
      });

      const similar = await graph.findSimilar('crypto', 5);
      expect(similar.map((s) => s.entity.id)).toContain('bitcoin');
    });
  });
});

describe('AffinityCalculator', () => {
  let graph: KnowledgeGraph;
  let calc: AffinityCalculator;

  beforeEach(() => {
    entitiesStore.clear();
    relationsStore.clear();
    graph = new KnowledgeGraph();
    calc = new AffinityCalculator(graph);
  });

  it('should return 0 for unknown entities', async () => {
    const score = await calc.calculateEntityAffinity('user', 'unknown_entity');
    expect(score).toBe(0);
  });

  it('should return negative affinity when user blocks a similar entity', async () => {
    // Setup: user blocks crypto, bitcoin is similar_to crypto
    relationsStore.set('r1', {
      id: 'r1', source_id: 'user', target_id: 'crypto',
      type: 'blocked', weight: 1.0, bidirectional: false,
    });
    relationsStore.set('r2', {
      id: 'r2', source_id: 'bitcoin', target_id: 'crypto',
      type: 'similar_to', weight: 0.95, bidirectional: true,
    });

    const score = await calc.calculateEntityAffinity('user', 'bitcoin');
    expect(score).toBeLessThan(0);
  });

  it('should return positive affinity for interested entities', async () => {
    relationsStore.set('r1', {
      id: 'r1', source_id: 'user', target_id: 'react',
      type: 'interested_in', weight: 1.0, bidirectional: false,
    });

    const score = await calc.calculateEntityAffinity('user', 'react');
    expect(score).toBeGreaterThan(0);
  });
});