// ── Preference Pack ──────────────────────────────────────────────────────────

export interface PreferencePack {
  id: string;
  name: string;
  description: string;
  author: string;
  authorId?: string;
  category: PackCategory;
  preferences: PackPreference[];
  tags: string[];
  version: number;
  downloads: number;
  rating: number;
  ratingCount: number;
  createdAt: number;
  updatedAt: number;
  isPublic: boolean;
}

export interface PackPreference {
  topic: string;
  sentiment: 'positive' | 'negative';
  strength: number; // 0-1
  explanation: string;
}

export type PackCategory =
  | 'technology'
  | 'gaming'
  | 'music'
  | 'cooking'
  | 'fitness'
  | 'travel'
  | 'finance'
  | 'fashion'
  | 'entertainment'
  | 'education'
  | 'science'
  | 'sports'
  | 'photography'
  | 'diy'
  | 'other';

// ── Pack Preview ─────────────────────────────────────────────────────────────

export interface PackPreview {
  /** Preferences that would be added (not in user's current profile) */
  additions: PackPreference[];
  /** Preferences that would strengthen existing ones */
  reinforcements: Array<{
    preference: PackPreference;
    currentStrength: number;
    newStrength: number;
  }>;
  /** Preferences that conflict with user's current profile */
  conflicts: Array<{
    preference: PackPreference;
    currentSentiment: 'positive' | 'negative';
    currentStrength: number;
  }>;
}

// ── Pack Application Mode ────────────────────────────────────────────────────

export type PackApplyMode =
  | 'merge' // Combine with existing preferences (doesn't overwrite)
  | 'replace' // Replace matching preferences
  | 'preview'; // Dry run — just compute the preview

// ── Pack Search/Browse ───────────────────────────────────────────────────────

export interface PackSearchParams {
  query?: string;
  category?: PackCategory;
  sortBy?: 'downloads' | 'rating' | 'newest';
  page?: number;
  limit?: number;
}

export interface PackSearchResult {
  packs: PreferencePack[];
  total: number;
  page: number;
  hasMore: boolean;
}

// ── Pack Share ────────────────────────────────────────────────────────────────

export interface PackShareLink {
  packId: string;
  url: string;
  expiresAt?: number;
}
