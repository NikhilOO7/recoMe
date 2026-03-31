// ── Context & Platform types ─────────────────────────────────────────────────

export type ContextBucket =
  | 'work'
  | 'learning'
  | 'shopping'
  | 'entertainment'
  | 'social'
  | 'general';

export type Platform =
  | 'youtube'
  | 'amazon'
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
  | 'unknown';

/** Browsing context state (auto-detected or manual override). */
export interface BrowsingContextState {
  current: ContextBucket;
  detected_at: number;
  detection_method: 'time' | 'platform' | 'content' | 'manual';
  confidence: number;
}

/**
 * @deprecated Use BrowsingContextState instead.
 * Kept for backward compatibility during migration.
 */
export type ContextState = BrowsingContextState;

/** Shopping/research context mode (from domain model). */
export interface ShoppingContext {
  contextId: string;
  type: 'budget' | 'quality' | 'research' | 'gift' | 'seasonal';
  label: string;
  isActive: boolean;
  source: 'user' | 'policy' | 'agent';
  createdAt: string;
  expiresAt?: string;
}
