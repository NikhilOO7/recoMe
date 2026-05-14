import type { EmbedRequest, EmbedResponse } from './types.js';

export interface EmbeddingClient {
  /** Dimension of embeddings produced by this client. */
  readonly dim: number;

  /** Model identifier (e.g. 'text-embedding-3-small'). */
  readonly model: string;

  embed(req: EmbedRequest): Promise<EmbedResponse>;
}
