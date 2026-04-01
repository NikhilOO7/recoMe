import type { Platform } from '@schema/context';

// ── Proactive Insight ───────────────────────────────────────────────────────

export type InsightCategory =
  | 'event'
  | 'course'
  | 'deal'
  | 'connection'
  | 'content'
  | 'trend'
  | 'alert';

/** Factor contribution for explainable scoring */
export interface InsightFactor {
  name: string;
  rawScore: number;
  weight: number;
  weightedScore: number;
  explanation: string;
}

export interface ProactiveInsight {
  id: string;
  platform: Platform;
  type: InsightCategory;
  title: string;
  body: string;
  benefit: string;
  relevanceScore: number;
  sourceSignals: string[];
  actionUrl?: string;
  actionLabel?: string;
  expiresAt?: number;
  platformContext: Record<string, unknown>;
  createdAt: number;
  /** Factor breakdown explaining why this insight was surfaced */
  factors?: InsightFactor[];
}

// ── Platform Profile ────────────────────────────────────────────────────────

export interface PlatformProfile {
  platform: Platform;
  pageType: string;
  extractedAt: number;
  /** Generic profile fields — platform modules add specifics */
  fields: Record<string, unknown>;
}

// ── Ranking ─────────────────────────────────────────────────────────────────

export interface RankingWeights {
  interestMatch: number;
  benefitClarity: number;
  timeliness: number;
  novelty: number;
}

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  interestMatch: 0.35,
  benefitClarity: 0.25,
  timeliness: 0.2,
  novelty: 0.2,
};

// ── Frequency Controls ──────────────────────────────────────────────────────

export interface InsightFrequencyConfig {
  maxPerVisit: number;
  maxPerDay: number;
  minRelevanceScore: number;
}

export const DEFAULT_FREQUENCY_CONFIG: InsightFrequencyConfig = {
  maxPerVisit: 3,
  maxPerDay: 8,
  minRelevanceScore: 0.6,
};

// ── Raw opportunity from platform intelligence ──────────────────────────────

export interface RawOpportunity {
  title: string;
  body: string;
  benefit: string;
  type: InsightCategory;
  url?: string;
  actionLabel?: string;
  timeliness: number;
  expiresAt?: number;
  sourceSignals: string[];
  platformContext: Record<string, unknown>;
}

// ── Platform Intelligence Module Interface ──────────────────────────────────

export interface PlatformIntelligenceModule {
  platform: Platform;
  extractProfile(doc: Document): PlatformProfile | null;
  discoverOpportunities(profile: PlatformProfile, userInterests: string[]): RawOpportunity[];
}
