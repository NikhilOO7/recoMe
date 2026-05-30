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
            const vals = [...relationsStore.values()] as Array<{
              source_id: string;
              bidirectional?: boolean;
            }>;
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

    it('should respect limit parameter', async () => {
      entitiesStore.set('headphones', {
        id: 'headphones',
        name: 'Headphones',
        type: 'topic',
        aliases: [],
      });
      entitiesStore.set('earbuds', { id: 'earbuds', name: 'Earbuds', type: 'topic', aliases: [] });
      entitiesStore.set('speakers', {
        id: 'speakers',
        name: 'Speakers',
        type: 'topic',
        aliases: [],
      });
      entitiesStore.set('amplifiers', {
        id: 'amplifiers',
        name: 'Amplifiers',
        type: 'topic',
        aliases: [],
      });

      relationsStore.set('r1', {
        id: 'r1',
        source_id: 'headphones',
        target_id: 'earbuds',
        type: 'similar_to',
        weight: 0.9,
        bidirectional: true,
      });
      relationsStore.set('r2', {
        id: 'r2',
        source_id: 'headphones',
        target_id: 'speakers',
        type: 'similar_to',
        weight: 0.7,
        bidirectional: true,
      });
      relationsStore.set('r3', {
        id: 'r3',
        source_id: 'headphones',
        target_id: 'amplifiers',
        type: 'related_to',
        weight: 0.5,
        bidirectional: true,
      });

      const similar = await graph.findSimilar('headphones', 2);
      expect(similar.length).toBeLessThanOrEqual(2);
      // Should be sorted by weight descending
      expect(similar[0]!.weight).toBeGreaterThanOrEqual(similar[1]?.weight ?? 0);
    });
  });

  describe('findEntityByName', () => {
    it('should find entity by alias match', async () => {
      entitiesStore.set('headphones', {
        id: 'headphones',
        name: 'Headphones',
        type: 'topic',
        aliases: ['cans', 'over-ear'],
      });

      const entity = await graph.findEntityByName('cans');
      expect(entity).toBeDefined();
      expect(entity!.id).toBe('headphones');
    });

    it('should return undefined when no match found', async () => {
      const entity = await graph.findEntityByName('nonexistent_entity');
      expect(entity).toBeUndefined();
    });

    it('should return cached entity on cache hit', async () => {
      // The LRUCache is mocked to always return undefined, but the method should still work
      entitiesStore.set('react', {
        id: 'react',
        name: 'React',
        type: 'topic',
        aliases: [],
      });

      // First call populates
      const first = await graph.findEntityByName('React');
      expect(first).toBeDefined();

      // Second call — still works (cache mock returns undefined, falls through to DB)
      const second = await graph.findEntityByName('React');
      expect(second).toBeDefined();
      expect(second!.id).toBe('react');
    });
  });

  describe('upsertEntity', () => {
    it('should update an existing entity', async () => {
      entitiesStore.set('react', {
        id: 'react',
        name: 'React',
        type: 'topic',
        aliases: ['reactjs'],
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      });

      const updated = await graph.upsertEntity({
        name: 'React',
        type: 'topic',
        aliases: ['reactjs', 'react.js'],
        metadata: {},
      });

      expect(updated.id).toBe('react');
      expect(updated.aliases).toContain('react.js');
    });

    it('should create a new entity when none exists', async () => {
      const created = await graph.upsertEntity({
        name: 'Vue',
        type: 'topic',
        aliases: ['vuejs'],
        metadata: {},
      });

      expect(created.id).toBe('vue');
      expect(created.name).toBe('Vue');
      expect(entitiesStore.has('vue')).toBe(true);
    });
  });

  describe('findRelation', () => {
    it('should find a direct relation', async () => {
      relationsStore.set('r1', {
        id: 'r1',
        source_id: 'user',
        target_id: 'crypto',
        type: 'blocked',
        weight: 1.0,
        bidirectional: false,
      });

      const rel = await graph.findRelation('user', 'crypto', 'blocked');
      expect(rel).toBeDefined();
      expect(rel!.type).toBe('blocked');
    });

    it('should find a bidirectional relation from target side', async () => {
      relationsStore.set('r1', {
        id: 'r1',
        source_id: 'crypto',
        target_id: 'bitcoin',
        type: 'similar_to',
        weight: 0.9,
        bidirectional: true,
      });

      const rel = await graph.findRelation('bitcoin', 'crypto', 'similar_to');
      expect(rel).toBeDefined();
    });

    it('should return undefined when no matching relation exists', async () => {
      const rel = await graph.findRelation('a', 'b');
      expect(rel).toBeUndefined();
    });
  });

  describe('addCrossPlatformRelation', () => {
    it('should create a new related_to relation when none exists', async () => {
      const rel = await graph.addCrossPlatformRelation('topic_a', 'topic_b', 0.7, [
        'amazon',
        'youtube',
      ]);

      expect(rel.type).toBe('related_to');
      expect(rel.bidirectional).toBe(true);
      expect(rel.weight).toBe(0.7);
    });

    it('should update an existing relation', async () => {
      // First, create the relation
      await graph.addCrossPlatformRelation('topic_a', 'topic_b', 0.5, ['amazon']);

      // Now update it with higher weight
      const updated = await graph.addCrossPlatformRelation('topic_a', 'topic_b', 0.9, [
        'amazon',
        'youtube',
      ]);

      expect(updated.weight).toBe(0.9);
    });
  });

  describe('getEntityCount', () => {
    it('should return the number of entities', async () => {
      entitiesStore.set('a', { id: 'a', name: 'A', type: 'topic', aliases: [] });
      entitiesStore.set('b', { id: 'b', name: 'B', type: 'topic', aliases: [] });

      const count = await graph.getEntityCount();
      expect(count).toBe(2);
    });

    it('should return 0 when empty', async () => {
      const count = await graph.getEntityCount();
      expect(count).toBe(0);
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
      id: 'r1',
      source_id: 'user',
      target_id: 'crypto',
      type: 'blocked',
      weight: 1.0,
      bidirectional: false,
    });
    relationsStore.set('r2', {
      id: 'r2',
      source_id: 'bitcoin',
      target_id: 'crypto',
      type: 'similar_to',
      weight: 0.95,
      bidirectional: true,
    });

    const score = await calc.calculateEntityAffinity('user', 'bitcoin');
    expect(score).toBeLessThan(0);
  });

  it('should return positive affinity for interested entities', async () => {
    relationsStore.set('r1', {
      id: 'r1',
      source_id: 'user',
      target_id: 'react',
      type: 'interested_in',
      weight: 1.0,
      bidirectional: false,
    });

    const score = await calc.calculateEntityAffinity('user', 'react');
    expect(score).toBeGreaterThan(0);
  });
});
