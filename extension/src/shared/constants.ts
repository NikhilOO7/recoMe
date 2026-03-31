import type { ContextBucket, Platform } from './types';

// ── Database ──────────────────────────────────────────────────────────────────

export const DB_NAME = 'recome_db';
export const DB_VERSION = 2;

// ── Users ─────────────────────────────────────────────────────────────────────

export const DEFAULT_USER_ID = 'local_user';

// ── Memory Decay Timings (milliseconds) ───────────────────────────────────────

export const DECAY_MS = {
  mid_term: {
    core_to_dream: 30 * 24 * 60 * 60 * 1000, // 30 days
    dream_to_forgotten: 90 * 24 * 60 * 60 * 1000, // 90 days
    forgotten_to_deleted: 180 * 24 * 60 * 60 * 1000, // 180 days
  },
  working_set: {
    core_to_dream: 7 * 24 * 60 * 60 * 1000, // 7 days
    dream_to_forgotten: 30 * 24 * 60 * 60 * 1000, // 30 days
    forgotten_to_deleted: 90 * 24 * 60 * 60 * 1000, // 90 days
  },
  // facts_prefs: NEVER auto-decays — only manual deletion
} as const;

// Decay strength multipliers per status
export const STATUS_STRENGTH: Record<string, number> = {
  core: 1.0,
  dream: 0.5,
  forgotten: 0.0,
  archived: 0.0,
  deleted: 0.0,
};

// ── Pattern Detection ─────────────────────────────────────────────────────────

export const PATTERN_THRESHOLD = 3; // events needed to form a mid-term card
export const SHORT_TERM_MAX = 20; // max items in the ring buffer

// ── Recommendation Thresholds ─────────────────────────────────────────────────

export const SCORE_THRESHOLDS = {
  hide: -0.5, // score < -0.5 → HIDE
  suppress: -0.2, // score < -0.2 → dim/suppress
  boost: 0.45, // score > 0.45 → BOOST
  prompt: 0.3, // confidence < 0.3 → ask user intent
} as const;

// Factor weights (higher = more influence)
export const FACTOR_WEIGHTS = {
  direct_block: 10,
  pattern_match: 7,
  working_set: 6,
  interest_match: 5,
  graph_affinity: 4,
  context_fit: 3,
  similarity: 2,
  recency: 1,
} as const;

// ── Implicit Signal Weights ───────────────────────────────────────────────
// Maps signal types to { strength, confidence, sentiment } for implicit learning.
// Strength (0–1): how strong the preference signal is.
// Confidence (0–1): how sure we are this reflects true preference.

export const IMPLICIT_SIGNAL_WEIGHTS = {
  dwell_short: { strength: 0.3, confidence: 0.4, sentiment: 'positive' as const },
  dwell_extended: { strength: 0.6, confidence: 0.7, sentiment: 'positive' as const },
  click_through: { strength: 0.4, confidence: 0.5, sentiment: 'positive' as const },
  scroll_past: { strength: 0.2, confidence: 0.3, sentiment: 'negative' as const },
  revisit: { strength: 0.7, confidence: 0.75, sentiment: 'positive' as const },
} as const;

// ── Implicit Decay (faster than explicit) ────────────────────────────────

export const IMPLICIT_DECAY_MS = {
  core_to_dream: 14 * 24 * 60 * 60 * 1000, // 14 days
  dream_to_forgotten: 45 * 24 * 60 * 60 * 1000, // 45 days
  forgotten_to_deleted: 90 * 24 * 60 * 60 * 1000, // 90 days
} as const;

// ── Knowledge Graph ───────────────────────────────────────────────────────────

export const GRAPH_AFFINITY_DECAY = 0.7; // per-hop decay factor
export const GRAPH_MAX_DEPTH = 3; // max traversal depth

// ── Context Detection ─────────────────────────────────────────────────────────

// Work hours: Mon–Fri, 9 AM – 6 PM local time
export const WORK_HOURS = { start: 9, end: 18 };
export const WORK_DAYS = [1, 2, 3, 4, 5]; // Mon=1 … Fri=5 (getDay() offset)

export const PLATFORM_CONTEXT_MAP: Record<Platform, ContextBucket> = {
  youtube: 'entertainment',
  amazon: 'shopping',
  twitter: 'social',
  facebook: 'social',
  instagram: 'social',
  ebay: 'shopping',
  walmart: 'shopping',
  linkedin: 'work',
  tiktok: 'entertainment',
  indeed: 'work',
  glassdoor: 'work',
  udemy: 'learning',
  coursera: 'learning',
  edx: 'learning',
  unknown: 'general',
};

// Domains that signal learning context
export const LEARNING_DOMAINS = [
  'github.com',
  'stackoverflow.com',
  'developer.mozilla.org',
  'docs.',
  'learn.',
  'tutorial',
  'udemy.com',
  'coursera.org',
  'medium.com',
  'dev.to',
];

// ── Alarms ────────────────────────────────────────────────────────────────────

export const ALARM_NAMES = {
  decay: 'recome_decay_run',
  stats: 'recome_stats_aggregate',
  preference_synthesis: 'recome_preference_synthesis',
  insight_check: 'recome_insight_check',
  selector_health: 'recome_selector_health',
  price_check: 'recome_price_check',
  import_check: 'recome_import_check',
} as const;

export const ALARM_INTERVALS = {
  decay_minutes: 15,
  stats_minutes: 60,
  preference_synthesis_minutes: 24 * 60, // once per day
  insight_check_minutes: 30,
  selector_health_minutes: 60,
  price_check_minutes: 6 * 60, // every 6 hours
  import_check_minutes: 60, // check import schedules hourly
} as const;

// ── UI ────────────────────────────────────────────────────────────────────────

export const TOAST_DURATION_MS = 3000;
export const HIDE_ANIMATION_MS = 400;
export const FEEDBACK_ICON_SIZE = 20;

// ── Chrome Storage Keys ───────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  settings: 'recome_settings',
  context_state: 'recome_context_state',
  stats_cache: 'recome_stats_cache',
} as const;

// ── Selector Discovery ────────────────────────────────────────────────────────

export const SELECTOR_CACHE_PREFIX = 'recome_selectors_';
export const SELECTOR_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Selector Health (V2) ─────────────────────────────────────────────────────

export const SELECTOR_CACHE_V2_PREFIX = 'recome_sel_v2_';
export const SELECTOR_HEALTH_CHECK_INTERVAL_MS = 30_000; // 30 seconds
export const SELECTOR_HEALTH_THRESHOLD = 0.3; // below this = unhealthy
export const SELECTOR_HEALTH_MAX_FAILURES = 3; // consecutive zeros → re-discover
export const SELECTOR_HEALTH_PRUNE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
export const SELECTOR_HEALTH_HISTORY_MAX = 20; // max match history entries
