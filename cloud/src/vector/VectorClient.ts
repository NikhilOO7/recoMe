import type { VectorPoint, SearchHit, SearchFilter } from './types.js';

/**
 * Abstraction over a vector database. Implementations live alongside
 * (QdrantClient.ts, future PineconeClient.ts). The interface is intentionally
 * narrow: anything richer (sparse vectors, reranking, hybrid) goes behind
 * impl-specific methods so swap-in stays cheap.
 */
export interface VectorClient {
  /** Lazy connectivity check; safe to call multiple times. */
  ready(): Promise<void>;

  /** Health probe — short timeout, no retry. */
  health(): Promise<{ ok: boolean; latencyMs: number; error?: string }>;

  /** Upsert N points. Implementations must batch internally if needed. */
  upsert(points: VectorPoint[]): Promise<void>;

  /** Nearest-neighbor search. `vector.length` must equal collection dim. */
  search(vector: number[], k: number, filter?: SearchFilter): Promise<SearchHit[]>;

  /** Drop everything for a user. Used for GDPR delete. */
  deleteUserNamespace(userId: string): Promise<void>;

  /** Vector dimension this client was initialized for. */
  readonly dim: number;

  close(): Promise<void>;
}
