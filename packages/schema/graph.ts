// ── Knowledge Graph types ────────────────────────────────────────────────────

/** Entity types used in content/recommendation graph (existing). */
export type ContentEntityType =
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

/**
 * @deprecated Use ContentEntityType instead.
 * Kept as alias for backward compatibility.
 */
export type EntityType = ContentEntityType;

export type RelationType =
  | 'interested_in'
  | 'not_interested_in'
  | 'one_time_interest'
  | 'follows'
  | 'blocked'
  | 'created_by'
  | 'about'
  | 'features'
  | 'belongs_to'
  | 'has_type'
  | 'targets'
  | 'has_format'
  | 'is_a'
  | 'part_of'
  | 'owned_by'
  | 'similar_to'
  | 'opposite_of'
  | 'related_to'
  | 'competes_with';

export interface GraphEntity {
  id: string;
  type: ContentEntityType;
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
  weight: number;
  bidirectional: boolean;
  created_at: number;
  updated_at: number;
}

export interface AffinityResult {
  entity_id: string;
  score: number;
  paths: AffinityPath[];
}

export interface AffinityPath {
  nodes: string[];
  score: number;
  depth: number;
}

/** Preference edge in the commerce graph (from domain model). */
export interface PreferenceEdge {
  edgeId: string;
  fromType: 'user' | 'intent' | 'context' | 'product' | 'brand' | 'seller' | 'offer';
  fromId: string;
  toType: 'intent' | 'context' | 'product' | 'brand' | 'seller' | 'offer' | 'decision';
  toId: string;
  relation: string;
  weight: number;
  confidence: number;
  source: 'explicit' | 'derived' | 'policy';
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}
