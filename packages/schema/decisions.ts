// ── Decision types (from domain model) ───────────────────────────────────────

import type { CommerceEntityType } from './entities';

export type DecisionType = 'boost' | 'neutral' | 'caution' | 'suppress';

export interface PageContext {
  site: 'amazon' | 'walmart' | 'ebay' | 'youtube' | 'unknown';
  pageType: 'search' | 'product' | 'feed' | 'home' | 'unknown';
  url: string;
  query?: string;
  categoryPath?: string[];
  timestamp: string;
}

export interface DecisionRecord {
  decisionId: string;
  candidateId: string;
  candidateType: CommerceEntityType;
  score: number;
  confidence: number;
  decision: DecisionType;
  explanation: string;
  factors: string[];
  pageContext: PageContext;
  createdAt: string;
}
