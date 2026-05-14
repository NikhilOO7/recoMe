import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignalIngestion, normalizeTopic } from '../SignalIngestion.js';
import type { GraphRepository } from '../../graph/GraphRepository.js';
import type { VectorClient } from '../../vector/VectorClient.js';
import type { EmbeddingClient } from '../../vector/EmbeddingClient.js';

function makeMocks() {
  const graph: Partial<GraphRepository> = {
    upsertPage: vi.fn().mockResolvedValue(undefined),
    upsertTopics: vi.fn().mockResolvedValue(undefined),
    upsertEntities: vi.fn().mockResolvedValue(undefined),
    recordSignal: vi.fn().mockResolvedValue(undefined),
  };
  const vectors: VectorClient = {
    ready: vi.fn().mockResolvedValue(undefined),
    health: vi.fn().mockResolvedValue({ ok: true, latencyMs: 1 }),
    upsert: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    deleteUserNamespace: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    dim: 1536,
  };
  const embedder: EmbeddingClient = {
    dim: 1536,
    model: 'test',
    embed: vi.fn(async ({ inputs }) => ({
      vectors: inputs.map(() => new Array(1536).fill(0.01)),
      model: 'test',
      promptTokens: inputs.length * 4,
    })),
  };
  return { graph: graph as GraphRepository, vectors, embedder };
}

describe('SignalIngestion', () => {
  let mocks: ReturnType<typeof makeMocks>;
  let svc: SignalIngestion;

  beforeEach(() => {
    mocks = makeMocks();
    svc = new SignalIngestion(mocks.graph, mocks.vectors, mocks.embedder);
  });

  it('ingests a full signal end-to-end', async () => {
    const res = await svc.ingest({
      userId: 'u-1',
      kind: 'dwell',
      pageUrl: 'https://youtube.com/watch?v=abc',
      pageTitle: 'Eames Lounge Chair Review',
      platform: 'youtube',
      topics: [{ name: 'Eames Lounge Chair' }],
      entities: [{ name: 'Eames Lounge Chair', kind: 'product' }],
    });
    expect(res.signalId).toBeTruthy();
    expect(res.topicsCreated).toBe(1);
    expect(res.entitiesCreated).toBe(1);
    expect(res.embeddingsGenerated).toBe(2);
    expect(mocks.graph.upsertPage).toHaveBeenCalledOnce();
    expect(mocks.graph.upsertTopics).toHaveBeenCalledOnce();
    expect(mocks.graph.recordSignal).toHaveBeenCalledOnce();
    expect(mocks.vectors.upsert).toHaveBeenCalledOnce();
  });

  it('is idempotent on signal id (caller supplies)', async () => {
    const opts = {
      id: 'sig-fixed-1',
      userId: 'u-1',
      kind: 'view' as const,
      pageUrl: 'https://reddit.com/r/foo/comments/1',
      platform: 'reddit' as const,
      topics: [{ name: 'minimalist desk setup' }],
    };
    const r1 = await svc.ingest(opts);
    const r2 = await svc.ingest(opts);
    expect(r1.signalId).toBe('sig-fixed-1');
    expect(r2.signalId).toBe('sig-fixed-1');
  });

  it('deduplicates topics within a single request by normalized name', async () => {
    await svc.ingest({
      userId: 'u-1',
      kind: 'view',
      pageUrl: 'https://x.com/post/1',
      platform: 'twitter',
      topics: [{ name: 'Coffee' }, { name: 'COFFEE' }, { name: 'coffee  ' }],
    });
    const callArg = (mocks.graph.upsertTopics as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg).toHaveLength(1);
    expect(callArg[0].normalizedName).toBe('coffee');
  });

  it('continues even when embedding fails (graph is source of truth)', async () => {
    mocks.embedder.embed = vi.fn().mockRejectedValue(new Error('openai down'));
    const res = await svc.ingest({
      userId: 'u-1',
      kind: 'view',
      pageUrl: 'https://amazon.com/dp/B0/',
      platform: 'amazon',
      topics: [{ name: 'standing desk' }],
    });
    expect(res.embeddingsGenerated).toBe(0);
    expect(mocks.graph.recordSignal).toHaveBeenCalledOnce();
  });

  it('uses default weights per kind', async () => {
    await svc.ingest({
      userId: 'u-1',
      kind: 'purchase',
      pageUrl: 'https://amazon.com/dp/B0/',
      platform: 'amazon',
    });
    const recorded = (mocks.graph.recordSignal as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(recorded.weight).toBe(10);

    await svc.ingest({
      userId: 'u-1',
      kind: 'view',
      pageUrl: 'https://amazon.com/dp/B1/',
      platform: 'amazon',
    });
    const recorded2 = (mocks.graph.recordSignal as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(recorded2.weight).toBe(1);
  });
});

describe('normalizeTopic', () => {
  it.each([
    ['Eames Lounge Chair', 'eames-lounge-chair'],
    ['  coffee   beans  ', 'coffee-beans'],
    ['résumé tips!', 'resume-tips'],
    ['---', ''],
    ['ASUS ROG Strix G15', 'asus-rog-strix-g15'],
  ])('normalizes %j → %j', (input, expected) => {
    expect(normalizeTopic(input)).toBe(expected);
  });
});
