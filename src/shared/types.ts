// ─────────────────────────────────────────────────────────────────────────────
// Core domain types for RecoMe
// ─────────────────────────────────────────────────────────────────────────────

// ── Contexts ──────────────────────────────────────────────────────────────────

export type ContextBucket =
  | 'work'          // 9-5 weekdays, productivity focus
  | 'learning'      // Tutorials, courses, documentation
  | 'shopping'      // E-commerce platforms
  | 'entertainment' // Evenings, weekends, relaxed browsing
  | 'social'        // Social media interaction
  | 'general';      // Always-included overlay (blocked_forever lives here)

export type Platform =
  | 'youtube'
  | 'amazon'
  | 'twitter'
  | 'facebook'
  | 'instagram'
  | 'ebay'
  | 'walmart'
  | 'unknown';

// ── Memory ────────────────────────────────────────────────────────────────────

export type MemoryType =
  | 'short_term'   // Session ring buffer (recent 20)
  | 'mid_term'     // Pattern cards with decay
  | 'working_set'  // Current research / active goals
  | 'facts_prefs'  // Permanent explicit preferences (never auto-deleted)
  | 'long_term';   // Historical timeline

export type MemoryStatus = 'core' | 'dream' | 'forgotten' | 'archived' | 'deleted';

export type FeedbackType = 'interested' | 'not_interested' | 'one_time' | 'block_forever';

export interface MemoryEntry {
  entry_id: string;
  user_id: string;
  context_bucket: ContextBucket;
  memory_type: MemoryType;
  topic_key: string;             // e.g. "blocked:crypto", "interested:apple"
  value: MemoryValue;
  confidence: number;            // 0–1
  status: MemoryStatus;
  valid_from: number;            // Unix ms
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
  strength?: number;             // 0–1
  entity_type?: EntityType;
  entity_name?: string;
  related_entities?: string[];
  source_type?: 'explicit' | 'inferred' | 'search';
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

export interface ContextState {
  current: ContextBucket;
  detected_at: number;
  detection_method: 'time' | 'platform' | 'content' | 'manual';
  confidence: number;
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

// ── Knowledge Graph ──────────────────────────────────────────────────────────

export type EntityType =
  | 'user'
  | 'creator'
  | 'brand'
  | 'product'
  | 'topic'
  | 'category'
  | 'content_type'
  | 'sentiment'
  | 'audience'
  | 'format'
  | 'content';

export type RelationType =
  // User → entity preferences
  | 'interested_in'
  | 'not_interested_in'
  | 'one_time_interest'
  | 'follows'
  | 'blocked'
  // Content relations
  | 'created_by'
  | 'about'
  | 'features'
  | 'belongs_to'
  | 'has_type'
  | 'targets'
  | 'has_format'
  // Entity–entity semantic
  | 'is_a'
  | 'part_of'
  | 'owned_by'
  | 'similar_to'
  | 'opposite_of'
  | 'related_to'
  | 'competes_with';

export interface GraphEntity {
  id: string;
  type: EntityType;
  name: string;
  aliases: string[];
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface GraphRelation {
  id: string;
  source_id: string;
  target_id: string;
  type: RelationType;
  weight: number;               // 0–1 strength of relation
  bidirectional: boolean;
  created_at: number;
  updated_at: number;
}

export interface AffinityResult {
  entity_id: string;
  score: number;                // –1 to +1
  paths: AffinityPath[];
}

export interface AffinityPath {
  nodes: string[];
  score: number;
  depth: number;
}

// ── Content / Recommendations ─────────────────────────────────────────────────

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
  score: number;                // –1 to +1
  weight: number;
  explanation: string;
}

export interface RecommendationResult {
  content_id: string;
  action: ContentAction;
  score: number;                // –1 to +1
  confidence: number;           // 0–1
  factors: ScoringFactor[];
  explanation: string;
  hide_reason?: string;
  boost_reason?: string;
}

// ── Statistics ────────────────────────────────────────────────────────────────

export interface RecoMeStats {
  total_hidden: number;
  hidden_today: number;
  total_boosted: number;
  active_patterns: number;
  memory_entries: number;
  graph_entities: number;
  top_blocked_topics: Array<{ topic: string; count: number }>;
  platform_breakdown: Partial<Record<Platform, number>>;
}
