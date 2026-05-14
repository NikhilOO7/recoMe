import OpenAI from 'openai';
import type { EmbeddingClient } from './EmbeddingClient.js';
import type { EmbedRequest, EmbedResponse } from './types.js';
import { withRetry } from '../observability/retry.js';
import { logger } from '../observability/logger.js';

const MODEL_DIM: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
};

export interface OpenAIEmbeddingsConfig {
  apiKey: string;
  model?: string;
  /** Max inputs per request. OpenAI hard limit is 2048; we default lower. */
  batchSize?: number;
}

export class OpenAIEmbeddings implements EmbeddingClient {
  readonly model: string;
  readonly dim: number;
  private readonly client: OpenAI;
  private readonly batchSize: number;

  constructor(config: OpenAIEmbeddingsConfig) {
    this.model = config.model ?? 'text-embedding-3-small';
    this.dim = MODEL_DIM[this.model] ?? 1536;
    this.batchSize = config.batchSize ?? 256;
    this.client = new OpenAI({ apiKey: config.apiKey });
  }

  async embed(req: EmbedRequest): Promise<EmbedResponse> {
    const inputs = req.inputs.map(normalize).filter((s) => s.length > 0);
    if (inputs.length === 0) {
      return { vectors: [], model: this.model, promptTokens: 0 };
    }
    const vectors: number[][] = [];
    let promptTokens = 0;

    for (let i = 0; i < inputs.length; i += this.batchSize) {
      const batch = inputs.slice(i, i + this.batchSize);
      const res = await withRetry(
        () =>
          this.client.embeddings.create({
            model: req.model ?? this.model,
            input: batch,
          }),
        { label: 'openai.embeddings.create' },
      );
      for (const item of res.data) vectors.push(item.embedding);
      promptTokens += res.usage?.prompt_tokens ?? 0;
    }

    logger.debug({ count: inputs.length, promptTokens, model: this.model }, 'embedded inputs');
    return { vectors, model: this.model, promptTokens };
  }
}

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, 8000);
}
