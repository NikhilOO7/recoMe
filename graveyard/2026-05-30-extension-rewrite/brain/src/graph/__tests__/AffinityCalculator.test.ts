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

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('AffinityCalculator', () => {
  let graph: KnowledgeGraph;
  let calc: AffinityCalculator;

  beforeEach(() => {
    entitiesStore.clear();
    relationsStore.clear();
    graph = new KnowledgeGraph();
    calc = new AffinityCalculator(graph);
  });

  it('returns 0 for unknown entity with no relations', async () => {
    const score = await calc.calculateEntityAffinity('user1', 'unknown_entity');
    expect(score).toBe(0);
  });

  it('returns positive score for entity with interested_in relation', async () => {
    relationsStore.set('r1', {
      id: 'r1',
      source_id: 'user1',
      target_id: 'react',
      type: 'interested_in',
      weight: 1.0,
      bidirectional: false,
    });

    const score = await calc.calculateEntityAffinity('user1', 'react');
    expect(score).toBeGreaterThan(0);
  });

  it('returns negative score for entity with blocked relation', async () => {
    relationsStore.set('r1', {
      id: 'r1',
      source_id: 'user1',
      target_id: 'crypto',
      type: 'blocked',
      weight: 1.0,
      bidirectional: false,
    });

    const score = await calc.calculateEntityAffinity('user1', 'crypto');
    expect(score).toBeLessThan(0);
  });

  it('multi-hop: score decays with each hop (0.7 decay factor)', async () => {
    // Direct: user1 --interested_in--> nodeA
    relationsStore.set('r1', {
      id: 'r1',
      source_id: 'user1',
      target_id: 'nodeA',
      type: 'interested_in',
      weight: 1.0,
      bidirectional: false,
    });
    // 2nd hop: nodeA --related_to--> nodeB
    relationsStore.set('r2', {
      id: 'r2',
      source_id: 'nodeA',
      target_id: 'nodeB',
      type: 'interested_in',
      weight: 1.0,
      bidirectional: false,
    });

    const directScore = await calc.calculateEntityAffinity('user1', 'nodeA');
    const twoHopScore = await calc.calculateEntityAffinity('user1', 'nodeB');

    // The two-hop score should be smaller due to 0.7 decay per hop
    expect(directScore).toBeGreaterThan(0);
    expect(twoHopScore).toBeGreaterThan(0);
    expect(twoHopScore).toBeLessThan(directScore);

    // Two hops applies decay twice: score ≈ directScore * 0.7 * weight * 0.7
    // The ratio between two-hop and one-hop should reflect decay
    const ratio = twoHopScore / directScore;
    // Each additional hop applies decay (0.7) * relScore (1.0 for interested_in)
    expect(ratio).toBeCloseTo(0.7, 1);
  });

  it('batchCalculate returns scores for multiple entities', async () => {
    relationsStore.set('r1', {
      id: 'r1',
      source_id: 'user1',
      target_id: 'react',
      type: 'interested_in',
      weight: 1.0,
      bidirectional: false,
    });
    relationsStore.set('r2', {
      id: 'r2',
      source_id: 'user1',
      target_id: 'crypto',
      type: 'blocked',
      weight: 1.0,
      bidirectional: false,
    });

    const results = await calc.batchCalculate('user1', ['react', 'crypto', 'unknown']);

    expect(results).toBeInstanceOf(Map);
    expect(results.size).toBe(3);
    expect(results.get('react')).toBeGreaterThan(0);
    expect(results.get('crypto')).toBeLessThan(0);
    expect(results.get('unknown')).toBe(0);
  });
});
