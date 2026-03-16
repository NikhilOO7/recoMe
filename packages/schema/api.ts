// ── API contracts (from domain model) ────────────────────────────────────────

import type { CandidateEntity } from './entities';
import type { DecisionType, PageContext } from './decisions';
import type { ShoppingContext } from './context';
import type { IntentEvent } from './intent';

// ── Get Recommendations ──────────────────────────────────────────────────────

export interface GetRecommendationsRequest {
  pageContext: PageContext;
  candidates: CandidateEntity[];
}

export interface GetRecommendationsResponse {
  items: Array<{
    candidateId: string;
    decision: DecisionType;
    score: number;
    confidence: number;
    explanation: string;
  }>;
}

// ── Record Intent ────────────────────────────────────────────────────────────

export interface RecordIntentRequest {
  event: IntentEvent;
  pageContext?: PageContext;
}

export interface RecordIntentResponse {
  success: boolean;
  normalizedEntityId: string;
  affectedScopes: string[];
}

// ── Compare Candidates ───────────────────────────────────────────────────────

export interface CompareCandidatesRequest {
  candidateIds: string[];
  activeContexts: ShoppingContext[];
}

export interface CompareCandidatesResponse {
  ranked: Array<{
    candidateId: string;
    rank: number;
    explanation: string;
    tradeoffs: string[];
  }>;
}
