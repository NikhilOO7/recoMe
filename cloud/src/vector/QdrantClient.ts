import { QdrantClient as QdrantRest } from '@qdrant/js-client-rest';
import type { VectorClient } from './VectorClient.js';
import type { VectorPoint, SearchHit, SearchFilter } from './types.js';
import { logger } from '../observability/logger.js';
import { onShutdown } from '../observability/lifecycle.js';
import { withRetry } from '../observability/retry.js';

export interface QdrantConfig {
  url: string;
  apiKey?: string;
  collection: string;
  dim: number;
  batchSize?: number;
}

export class QdrantVectorClient implements VectorClient {
  readonly dim: number;
  private readonly client: QdrantRest;
  private readonly collection: string;
  private readonly batchSize: number;
  private readyPromise: Promise<void> | null = null;

  constructor(private readonly config: QdrantConfig) {
    this.dim = config.dim;
    this.collection = config.collection;
    this.batchSize = config.batchSize ?? 100;
    this.client = new QdrantRest({ url: config.url, apiKey: config.apiKey });
    onShutdown(() => this.close());
  }

  async ready(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = this.ensureCollection();
    }
    return this.readyPromise;
  }

  private async ensureCollection(): Promise<void> {
    await withRetry(
      async () => {
        const collections = await this.client.getCollections();
        const exists = collections.collections.some((c) => c.name === this.collection);
        if (!exists) {
          logger.info({ collection: this.collection, dim: this.dim }, 'creating qdrant collection');
          await this.client.createCollection(this.collection, {
            vectors: { size: this.dim, distance: 'Cosine' },
            optimizers_config: { default_segment_number: 2 },
          });
          // Payload indexes for filtered search.
          await this.client.createPayloadIndex(this.collection, {
            field_name: 'userId',
            field_schema: 'keyword',
          });
          await this.client.createPayloadIndex(this.collection, {
            field_name: 'kind',
            field_schema: 'keyword',
          });
          await this.client.createPayloadIndex(this.collection, {
            field_name: 'platform',
            field_schema: 'keyword',
          });
        }
      },
      { attempts: 5, baseDelayMs: 500, label: 'qdrant.ensureCollection' },
    );
    logger.info({ collection: this.collection }, 'qdrant ready');
  }

  async health(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      await this.client.getCollections();
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, error: String(err) };
    }
  }

  async upsert(points: VectorPoint[]): Promise<void> {
    if (points.length === 0) return;
    for (let i = 0; i < points.length; i += this.batchSize) {
      const batch = points.slice(i, i + this.batchSize);
      await withRetry(
        () =>
          this.client.upsert(this.collection, {
            wait: true,
            points: batch.map((p) => ({
              id: p.id,
              vector: p.vector,
              payload: p.payload as unknown as Record<string, unknown>,
            })),
          }),
        { label: 'qdrant.upsert' },
      );
    }
  }

  async search(vector: number[], k: number, filter?: SearchFilter): Promise<SearchHit[]> {
    if (vector.length !== this.dim) {
      throw new Error(`vector dim ${vector.length} does not match collection dim ${this.dim}`);
    }
    const must: Array<{ key: string; match: { value: string } }> = [];
    if (filter?.userId) must.push({ key: 'userId', match: { value: filter.userId } });
    if (filter?.kind) must.push({ key: 'kind', match: { value: filter.kind } });
    if (filter?.platform) must.push({ key: 'platform', match: { value: filter.platform } });

    const res = await withRetry(
      () =>
        this.client.search(this.collection, {
          vector,
          limit: k,
          filter: must.length > 0 ? { must } : undefined,
          with_payload: true,
        }),
      { label: 'qdrant.search' },
    );

    return res.map((hit) => ({
      id: String(hit.id),
      score: hit.score,
      payload: hit.payload as unknown as SearchHit['payload'],
    }));
  }

  async deleteUserNamespace(userId: string): Promise<void> {
    await withRetry(
      () =>
        this.client.delete(this.collection, {
          wait: true,
          filter: { must: [{ key: 'userId', match: { value: userId } }] },
        }),
      { label: 'qdrant.deleteUserNamespace' },
    );
    logger.info({ userId }, 'qdrant user namespace deleted');
  }

  async close(): Promise<void> {
    // qdrant-js client has no explicit close; intentional no-op.
  }
}

let instance: VectorClient | null = null;
export function initQdrant(config: QdrantConfig): VectorClient {
  if (!instance) instance = new QdrantVectorClient(config);
  return instance;
}
export function getVectorClient(): VectorClient {
  if (!instance) throw new Error('VectorClient not initialized');
  return instance;
}
