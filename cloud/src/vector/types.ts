export interface VectorPoint {
  id: string;
  vector: number[];
  payload: VectorPayload;
}

export interface VectorPayload {
  userId: string;
  kind: 'topic' | 'entity' | 'page';
  refId: string;
  text: string;
  platform?: string;
  ts: number;
}

export interface SearchHit {
  id: string;
  score: number;
  payload: VectorPayload;
}

export interface SearchFilter {
  userId?: string;
  kind?: VectorPayload['kind'];
  platform?: string;
}

export interface EmbedRequest {
  inputs: string[];
  model?: string;
}

export interface EmbedResponse {
  vectors: number[][];
  model: string;
  promptTokens: number;
}
