// ── Memory types ─────────────────────────────────────────────────────────────

import type { ContextBucket, Platform } from './context';

export type MemoryType = 'short_term' | 'mid_term' | 'working_set' | 'facts_prefs' | 'long_term';

export type MemoryStatus = 'core' | 'dream' | 'forgotten' | 'archived' | 'deleted';

export type FeedbackType = 'interested' | 'not_interested' | 'one_time' | 'block_forever';

export interface MemoryEntry {
  entry_id: string;
  user_id: string;
  context_bucket: ContextBucket;
  memory_type: MemoryType;
  topic_key: string;
  value: MemoryValue;
  confidence: number;
  status: MemoryStatus;
  valid_from: number;
  valid_to: number | null;
  last_confirmed_at: number;
  last_accessed_at: number;
  access_count: number;
  version: number;
  is_deleted: boolean;
  created_at: number;
  updated_at: number;
}

export interface MemoryValue {
  sentiment?: 'positive' | 'negative' | 'neutral';
  strength?: number;
  entity_type?: import('./graph').ContentEntityType;
  entity_name?: string;
  related_entities?: string[];
  source_type?: 'explicit' | 'inferred' | 'search' | 'implicit';
  feedback_type?: FeedbackType;
  [key: string]: unknown;
}

export interface MemoryEvent {
  event_id: string;
  user_id: string;
  occurred_at: number;
  platform: Platform;
  context_bucket: ContextBucket;
  topic_key: string;
  action: FeedbackType;
  content_id: string;
  content_title?: string;
  metadata?: Record<string, unknown>;
}

export interface MidTermCard {
  card_id: string;
  user_id: string;
  context_bucket: ContextBucket;
  pattern_type: 'block_pattern' | 'interest_pattern' | 'research_pattern' | 'time_pattern';
  topic_key: string;
  occurrence_count: number;
  last_seen_at: number;
  first_seen_at: number;
  confidence: number;
  platforms: Platform[];
  status: MemoryStatus;
  created_at: number;
  updated_at: number;
}

export interface MemoryPack {
  context: ContextBucket;
  entries: MemoryEntry[];
  cards: MidTermCard[];
  general_overlay: {
    entries: MemoryEntry[];
    cards: MidTermCard[];
  };
  retrieved_at: number;
}
