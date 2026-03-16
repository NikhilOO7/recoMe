// ── Content & Recommendation types ──────────────────────────────────────────

import type { Platform } from './context';

export type ContentAction = 'hide' | 'suppress' | 'show' | 'boost' | 'prompt';

export interface ContentMetadata {
  id: string;
  platform: Platform;
  type: 'video' | 'product' | 'post' | 'ad' | 'article' | 'unknown';
  title: string;
  creator?: string;
  topics: string[];
  entities: string[];
  url: string;
  thumbnail_url?: string;
  duration_seconds?: number;
  published_at?: number;
  raw_metadata?: Record<string, unknown>;
}

export interface ScoringFactor {
  name: string;
  score: number;
  weight: number;
  explanation: string;
}

export interface RecommendationResult {
  content_id: string;
  action: ContentAction;
  score: number;
  confidence: number;
  factors: ScoringFactor[];
  explanation: string;
  hide_reason?: string;
  boost_reason?: string;
}
