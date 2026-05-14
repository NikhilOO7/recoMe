import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResearchTrailService } from '../ResearchTrail.js';
import type { GraphRepository } from '../../graph/GraphRepository.js';
import type { ResearchTrail } from '../../graph/types.js';

function makeTrail(overrides: Partial<ResearchTrail> = {}): ResearchTrail {
  return {
    userId: 'u-1',
    topicNormalizedName: 'eames-lounge-chair',
    topicDisplayName: 'Eames Lounge Chair',
    hops: [
      {
        platform: 'youtube',
        pageUrl: 'https://youtube.com/w/1',
        pageTitle: 'Review',
        topicName: 'Eames Lounge Chair',
        dwellMs: 120000,
        ts: 1_700_000_000_000,
      },
      {
        platform: 'reddit',
        pageUrl: 'https://reddit.com/r/x/1',
        pageTitle: 'Thread',
        topicName: 'Eames Lounge Chair',
        dwellMs: 60000,
        ts: 1_700_001_000_000,
      },
      {
        platform: 'amazon',
        pageUrl: 'https://amazon.com/dp/B0',
        pageTitle: 'PDP',
        topicName: 'Eames Lounge Chair',
        dwellMs: 30000,
        ts: 1_700_002_000_000,
      },
    ],
    firstSeenAt: 1_700_000_000_000,
    lastSeenAt: 1_700_002_000_000,
    platformsTouched: ['youtube', 'reddit', 'amazon'],
    strength: 5.2,
    ...overrides,
  };
}

describe('ResearchTrailService', () => {
  let graph: Partial<GraphRepository>;
  let vectors: { search: ReturnType<typeof vi.fn> };
  let embedder: { embed: ReturnType<typeof vi.fn>; dim: number; model: string };
  let svc: ResearchTrailService;

  beforeEach(() => {
    graph = {
      getResearchTrail: vi.fn(),
      getCrossPlatformTopics: vi.fn(),
    };
    vectors = { search: vi.fn().mockResolvedValue([]) };
    embedder = {
      dim: 1536,
      model: 'test',
      embed: vi
        .fn()
        .mockResolvedValue({
          vectors: [new Array(1536).fill(0.01)],
          model: 'test',
          promptTokens: 1,
        }),
    };
    // cast: we only call methods we mocked
    svc = new ResearchTrailService(graph as GraphRepository, vectors as never, embedder as never);
  });

  it('lists trails by combining cross-platform candidates with full trails', async () => {
    (graph.getCrossPlatformTopics as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        topicNormalizedName: 'eames-lounge-chair',
        topicName: 'Eames Lounge Chair',
        platforms: ['youtube', 'amazon'],
        lastSeenAt: 1,
        strength: 3,
      },
      {
        topicNormalizedName: 'standing-desk',
        topicName: 'Standing Desk',
        platforms: ['reddit', 'amazon'],
        lastSeenAt: 1,
        strength: 2,
      },
    ]);
    (graph.getResearchTrail as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makeTrail({ topicNormalizedName: 'eames-lounge-chair' }))
      .mockResolvedValueOnce(makeTrail({ topicNormalizedName: 'standing-desk' }));

    const trails = await svc.listTrails('u-1');
    expect(trails).toHaveLength(2);
    expect(trails[0].topicNormalizedName).toBe('eames-lounge-chair');
  });

  it('drops candidates whose detailed trail comes back null', async () => {
    (graph.getCrossPlatformTopics as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        topicNormalizedName: 'ghost-topic',
        topicName: 'Ghost',
        platforms: ['x', 'y'],
        lastSeenAt: 1,
        strength: 1,
      },
    ]);
    (graph.getResearchTrail as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const trails = await svc.listTrails('u-1');
    expect(trails).toHaveLength(0);
  });

  it('explainStrength surfaces hop count + dwell + platforms', () => {
    const t = makeTrail();
    const ex = svc.explainStrength(t);
    expect(ex.hops).toBe(3);
    expect(ex.totalDwellMs).toBe(210000);
    expect(ex.platforms).toEqual(['youtube', 'reddit', 'amazon']);
  });

  it('relatedTopics filters out the seed topic itself', async () => {
    vectors.search.mockResolvedValue([
      {
        id: 'topic:eames-lounge-chair',
        score: 1.0,
        payload: {
          userId: 'u-1',
          kind: 'topic',
          refId: 'eames-lounge-chair',
          text: 'Eames Lounge Chair',
          ts: 1,
        },
      },
      {
        id: 'topic:mid-century-sofa',
        score: 0.91,
        payload: {
          userId: 'u-1',
          kind: 'topic',
          refId: 'mid-century-sofa',
          text: 'Mid Century Sofa',
          ts: 1,
        },
      },
      {
        id: 'topic:lounge-chair-replica',
        score: 0.88,
        payload: {
          userId: 'u-1',
          kind: 'topic',
          refId: 'lounge-chair-replica',
          text: 'Lounge Chair Replica',
          ts: 1,
        },
      },
    ]);

    const related = await svc.relatedTopics('u-1', 'eames-lounge-chair', 5);
    expect(related).toHaveLength(2);
    expect(related.map((r) => r.normalizedName)).not.toContain('eames-lounge-chair');
    expect(related[0].similarity).toBeGreaterThan(related[1].similarity);
  });
});
