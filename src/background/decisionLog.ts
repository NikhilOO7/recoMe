// ── Decision Log ──────────────────────────────────────────────────────────────
// In-memory ring buffer (service-worker lifetime) of recent content decisions.
// Cleared on SW restart. Used only by the developer devtools page.

import type { ContentMetadata, RecommendationResult } from '@shared/types';

export interface DecisionLogEntry {
  id: string;
  timestamp: number;
  content: ContentMetadata;
  result: RecommendationResult;
}

const MAX_ENTRIES = 150;
const entries: DecisionLogEntry[] = [];

export function appendDecision(content: ContentMetadata, result: RecommendationResult): void {
  entries.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    content,
    result,
  });
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
}

export function getDecisionLog(): DecisionLogEntry[] {
  return entries.slice();
}

export function clearDecisionLog(): void {
  entries.length = 0;
}