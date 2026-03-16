// ── Statistics types ─────────────────────────────────────────────────────────

import type { Platform } from './context';

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
