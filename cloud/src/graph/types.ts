export type NodeLabel = 'User' | 'Topic' | 'Entity' | 'Page' | 'Session' | 'Signal';

export type EntityKind =
  | 'product'
  | 'brand'
  | 'creator'
  | 'category'
  | 'media'
  | 'place'
  | 'person';

export type Platform =
  | 'youtube'
  | 'reddit'
  | 'amazon'
  | 'walmart'
  | 'ebay'
  | 'twitter'
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'linkedin'
  | 'generic';

export type SignalKind =
  | 'view'
  | 'dwell'
  | 'like'
  | 'block'
  | 'boost'
  | 'purchase'
  | 'comparison'
  | 'search';

export type RelationKind =
  | 'VIEWED'
  | 'HAS_INTENT'
  | 'BLOCKS'
  | 'BOOSTS'
  | 'MENTIONS'
  | 'CONTAINS_ENTITY'
  | 'RELATED_TO'
  | 'SIMILAR_TO'
  | 'CONTAINS';

export interface UserNode {
  id: string;
  tier: 'FREE' | 'PRO' | 'PREMIUM';
  region?: string;
  createdAt: number;
}

export interface TopicNode {
  id: string;
  name: string;
  normalizedName: string;
  embeddingId?: string;
  createdAt: number;
}

export interface EntityNode {
  id: string;
  name: string;
  kind: EntityKind;
  platform?: Platform;
  embeddingId?: string;
  createdAt: number;
}

export interface PageNode {
  url: string;
  title: string;
  platform: Platform;
  firstSeenAt: number;
  lastSeenAt: number;
}

export interface SessionNode {
  id: string;
  userId: string;
  startedAt: number;
  endedAt?: number;
}

export interface SignalRecord {
  id: string;
  userId: string;
  kind: SignalKind;
  weight: number;
  ts: number;
  topicNormalizedNames?: string[];
  entityIds?: string[];
  pageUrl?: string;
  sessionId?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface TrailHop {
  platform: Platform;
  pageUrl: string;
  pageTitle: string;
  topicName: string;
  dwellMs: number;
  ts: number;
}

export interface ResearchTrail {
  userId: string;
  topicNormalizedName: string;
  topicDisplayName: string;
  hops: TrailHop[];
  firstSeenAt: number;
  lastSeenAt: number;
  platformsTouched: Platform[];
  strength: number;
}
