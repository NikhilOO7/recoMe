// Types used across background, content, and popup.
// Cloud-side shapes mirror cloud/src/intelligence/schemas.ts and
// cloud/src/agents/types.ts — keep in sync when those change.

export type Platform =
  | 'youtube'
  | 'amazon'
  | 'reddit'
  | 'twitter'
  | 'facebook'
  | 'instagram'
  | 'ebay'
  | 'walmart'
  | 'linkedin'
  | 'tiktok'
  | 'indeed'
  | 'glassdoor'
  | 'udemy'
  | 'coursera'
  | 'edx'
  | 'generic'
  | 'unknown';

export type SignalKind =
  | 'view'
  | 'dwell'
  | 'like'
  | 'block'
  | 'boost'
  | 'purchase'
  | 'comparison'
  | 'search';

// Mirrors entityKindEnum in cloud/src/intelligence/schemas.ts.
export type EntityKind =
  | 'product'
  | 'brand'
  | 'creator'
  | 'category'
  | 'media'
  | 'place'
  | 'person';

export interface SignalTopic {
  name: string;
}

export interface SignalEntity {
  name: string;
  kind: EntityKind;
  platform?: Platform;
}

/** Mirrors SignalInput in cloud/src/intelligence/SignalIngestion.ts. */
export interface Signal {
  id: string;
  kind: SignalKind;
  ts: number;
  weight?: number;
  pageUrl?: string;
  pageTitle?: string;
  platform?: Platform;
  topics?: SignalTopic[];
  entities?: SignalEntity[];
  sessionId?: string;
  metadata?: Record<string, string | number | boolean>;
}

export type AgentEventKind =
  | 'recall'
  | 'deal_drop'
  | 'new_alternative'
  | 'fresh_content'
  | 'decision_nudge'
  | 'weekly_summary';

export interface AgentEventSource {
  kind: 'signal' | 'topic' | 'page' | 'entity';
  id: string;
  label?: string;
  url?: string;
}

export interface AgentEvent {
  id: string;
  agent: string;
  kind: AgentEventKind;
  title: string;
  body?: string;
  actionUrl?: string;
  sources: AgentEventSource[];
  createdAt: number;
  seenAt?: number;
}
