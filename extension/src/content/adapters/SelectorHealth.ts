import { createLogger } from '@shared/Logger';
import {
  SELECTOR_HEALTH_THRESHOLD,
  SELECTOR_HEALTH_MAX_FAILURES,
  SELECTOR_HEALTH_HISTORY_MAX,
} from '@shared/constants';

const log = createLogger('SelectorHealth');

// ── Types ────────────────────────────────────────────────────────────────────

export interface SelectorHealthRecord {
  cardSelector: string;
  feedSelector: string | null;
  discoveredAt: number;
  pathPattern: string;
  matchHistory: Array<{ timestamp: number; count: number }>;
  healthScore: number;
  baselineMatchCount: number;
  consecutiveFailures: number;
  lastChecked: number;
  version: 2;
}

// ── Health Monitor ───────────────────────────────────────────────────────────

/** EMA alpha — higher values weight recent checks more heavily. */
const EMA_ALPHA = 0.3;

/**
 * Monitors selector health using an exponential moving average of match counts.
 * Tracks per-pathPattern health records in memory, persisted externally via PathPatternCache.
 */
export class SelectorHealthMonitor {
  private records = new Map<string, SelectorHealthRecord>();

  /**
   * Initialize the monitor with a previously cached record.
   * Call this before the first `recordCheck` so we have a baseline.
   */
  loadRecord(record: SelectorHealthRecord): void {
    this.records.set(record.pathPattern, record);
  }

  /**
   * Record a health check observation.
   * Updates match history, health score, and consecutive failure count.
   */
  recordCheck(pathPattern: string, selector: string, matchCount: number): SelectorHealthRecord {
    let record = this.records.get(pathPattern);

    if (!record) {
      // First check — establish baseline
      record = createHealthRecord(selector, null, pathPattern, matchCount);
      this.records.set(pathPattern, record);
      return record;
    }

    // Update match history (ring buffer)
    record.matchHistory.push({ timestamp: Date.now(), count: matchCount });
    if (record.matchHistory.length > SELECTOR_HEALTH_HISTORY_MAX) {
      record.matchHistory.shift();
    }

    // Update consecutive failures
    if (matchCount === 0) {
      record.consecutiveFailures++;
    } else {
      record.consecutiveFailures = 0;
    }

    // Update health score via EMA
    const ratio =
      record.baselineMatchCount > 0
        ? Math.min(matchCount / record.baselineMatchCount, 1.5) // cap at 1.5 to avoid inflation
        : matchCount > 0
          ? 1.0
          : 0.0;
    record.healthScore = EMA_ALPHA * ratio + (1 - EMA_ALPHA) * record.healthScore;

    // Clamp to [0, 1]
    record.healthScore = Math.max(0, Math.min(1, record.healthScore));

    record.lastChecked = Date.now();
    record.cardSelector = selector;

    return record;
  }

  /**
   * Get the health record for a specific path pattern.
   */
  getHealth(pathPattern: string): SelectorHealthRecord | null {
    return this.records.get(pathPattern) ?? null;
  }

  /**
   * Check if the selector for a path pattern is healthy.
   * Returns false when health score drops below threshold or too many consecutive failures.
   */
  isHealthy(pathPattern: string): boolean {
    const record = this.records.get(pathPattern);
    if (!record) return true; // no data = assume healthy

    if (record.consecutiveFailures >= SELECTOR_HEALTH_MAX_FAILURES) {
      log.debug(`Unhealthy: ${pathPattern} — ${record.consecutiveFailures} consecutive failures`);
      return false;
    }

    if (record.healthScore < SELECTOR_HEALTH_THRESHOLD) {
      log.debug(`Unhealthy: ${pathPattern} — health score ${record.healthScore.toFixed(2)}`);
      return false;
    }

    return true;
  }

  /**
   * Get all tracked health records (for DevTools display).
   */
  getAllHealthRecords(): SelectorHealthRecord[] {
    return Array.from(this.records.values());
  }

  /**
   * Reset tracking for a path pattern (e.g., after re-discovery).
   * Preserves history but resets health score and failures.
   */
  resetHealth(
    pathPattern: string,
    newSelector: string,
    newMatchCount: number,
  ): SelectorHealthRecord {
    const existing = this.records.get(pathPattern);
    const record = createHealthRecord(
      newSelector,
      existing?.feedSelector ?? null,
      pathPattern,
      newMatchCount,
    );
    // Carry over some history for context
    if (existing) {
      record.matchHistory = [
        ...existing.matchHistory.slice(-5),
        { timestamp: Date.now(), count: newMatchCount },
      ];
    }
    this.records.set(pathPattern, record);
    return record;
  }

  /**
   * Update the feed selector for a path pattern.
   */
  setFeedSelector(pathPattern: string, feedSelector: string | null): void {
    const record = this.records.get(pathPattern);
    if (record) record.feedSelector = feedSelector;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function createHealthRecord(
  cardSelector: string,
  feedSelector: string | null,
  pathPattern: string,
  initialMatchCount: number,
): SelectorHealthRecord {
  const now = Date.now();
  return {
    cardSelector,
    feedSelector,
    discoveredAt: now,
    pathPattern,
    matchHistory: [{ timestamp: now, count: initialMatchCount }],
    healthScore: initialMatchCount > 0 ? 1.0 : 0.0,
    baselineMatchCount: initialMatchCount,
    consecutiveFailures: initialMatchCount === 0 ? 1 : 0,
    lastChecked: now,
    version: 2,
  };
}
