import { describe, expect, it, vi } from 'vitest';
import { ingestBatch } from '../ingestBatch.js';
import type { SignalIngestion } from '../SignalIngestion.js';

function makeIngestion(impl?: (input: { id?: string }) => unknown): SignalIngestion {
  return {
    ingest: vi.fn(async (input: { id?: string }) => {
      if (impl) impl(input);
      return {
        signalId: input.id ?? 'generated',
        topicsCreated: 1,
        entitiesCreated: 0,
        embeddingsGenerated: 0,
      };
    }),
  } as unknown as SignalIngestion;
}

const valid = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  kind: 'view',
  platform: 'youtube',
  topics: [{ name: 'standing desks' }],
  ...over,
});

describe('ingestBatch', () => {
  it('ingests a fully valid batch', async () => {
    const ingestion = makeIngestion();
    const out = await ingestBatch(ingestion, 'u1', [valid('a'), valid('b')]);
    expect(out.accepted).toBe(2);
    expect(out.results.map((r) => r.signalId)).toEqual(['a', 'b']);
    expect(out.rejected).toEqual([]);
    expect(out.retryable).toEqual([]);
  });

  it('D1 regression: learning/jobs platforms validate (enum is a client superset)', async () => {
    const ingestion = makeIngestion();
    const platforms = ['udemy', 'coursera', 'edx', 'indeed', 'glassdoor', 'unknown'];
    const out = await ingestBatch(
      ingestion,
      'u1',
      platforms.map((p, i) => valid(`s${i}`, { platform: p })),
    );
    expect(out.accepted).toBe(platforms.length);
    expect(out.rejected).toEqual([]);
  });

  it('one invalid signal never drops its valid neighbors', async () => {
    const ingestion = makeIngestion();
    const out = await ingestBatch(ingestion, 'u1', [
      valid('good1'),
      valid('bad', { platform: 'myspace' }),
      valid('good2'),
    ]);
    expect(out.accepted).toBe(2);
    expect(out.results.map((r) => r.signalId)).toEqual(['good1', 'good2']);
    expect(out.rejected).toHaveLength(1);
    expect(out.rejected[0]).toMatchObject({ index: 1, id: 'bad', code: 'invalid_signal' });
    expect(out.rejected[0].issues.join(' ')).toContain('platform');
  });

  it('non-object garbage is rejected with a null id, neighbors still land', async () => {
    const ingestion = makeIngestion();
    const out = await ingestBatch(ingestion, 'u1', ['nonsense', valid('ok')]);
    expect(out.accepted).toBe(1);
    expect(out.rejected[0]).toMatchObject({ index: 0, id: null });
  });

  it('a transient ingest failure is retryable, not rejected, and does not abort the batch', async () => {
    const ingestion = makeIngestion((input) => {
      if (input.id === 'flaky') throw new Error('neo4j unavailable');
    });
    const out = await ingestBatch(ingestion, 'u1', [valid('a'), valid('flaky'), valid('b')]);
    expect(out.accepted).toBe(2);
    expect(out.retryable).toEqual([{ index: 1, id: 'flaky' }]);
    expect(out.rejected).toEqual([]);
    expect(out.results.map((r) => r.signalId)).toEqual(['a', 'b']);
  });
});
