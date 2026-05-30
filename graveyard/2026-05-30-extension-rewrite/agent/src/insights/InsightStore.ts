import { createLogger } from '@utils/Logger';

const log = createLogger('InsightStore');

/** Types of proactive insights the engine can surface */
export type InsightType =
  | 'extended_research' // Same category 3+ times in 3 days
  | 'cross_platform' // Same topic on 2+ platforms
  | 'decision_fatigue' // 10+ products in same category, no action
  | 'preference_drift'; // Implicit signals shifting from stated prefs

/** A proactive insight ready to be surfaced to the user */
export interface Insight {
  id: string;
  type: InsightType;
  title: string;
  message: string;
  /** Suggested chat prompt if user taps the insight */
  chatPrompt?: string;
  /** Related topic/category key */
  topicKey: string;
  createdAt: number;
  /** Whether it has been shown to the user */
  shown: boolean;
  /** Whether it was dismissed (won't show again) */
  dismissed: boolean;
}

const STORAGE_KEY = 'recome_insights';
const MAX_STORED = 20;
/** Don't re-surface the same insight type+topic within this window */
const DEDUP_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

/**
 * InsightStore — persists proactive insights in chrome.storage.local.
 * Handles dedup, show/dismiss, and cleanup of stale insights.
 */
export class InsightStore {
  async getAll(): Promise<Insight[]> {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return (result[STORAGE_KEY] as Insight[] | undefined) ?? [];
  }

  /** Get insights that haven't been shown or dismissed */
  async getPending(): Promise<Insight[]> {
    const all = await this.getAll();
    return all.filter((i) => !i.shown && !i.dismissed);
  }

  /** Get insights that have been shown but not dismissed (for chat banner) */
  async getActive(): Promise<Insight[]> {
    const all = await this.getAll();
    return all.filter((i) => i.shown && !i.dismissed);
  }

  /**
   * Add an insight if no duplicate exists within the dedup window.
   * Returns true if the insight was added, false if deduped.
   */
  async add(insight: Omit<Insight, 'id' | 'createdAt' | 'shown' | 'dismissed'>): Promise<boolean> {
    const all = await this.getAll();
    const now = Date.now();

    // Dedup: same type + topicKey within window
    const isDuplicate = all.some(
      (existing) =>
        existing.type === insight.type &&
        existing.topicKey === insight.topicKey &&
        now - existing.createdAt < DEDUP_WINDOW_MS,
    );

    if (isDuplicate) {
      log.debug(`Deduped insight: ${insight.type}/${insight.topicKey}`);
      return false;
    }

    const newInsight: Insight = {
      ...insight,
      id: `insight_${now}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: now,
      shown: false,
      dismissed: false,
    };

    // Add to front, trim to max
    const updated = [newInsight, ...all].slice(0, MAX_STORED);
    await this.save(updated);
    log.debug(`Insight added: ${newInsight.type} — ${newInsight.title}`);
    return true;
  }

  /** Mark an insight as shown */
  async markShown(insightId: string): Promise<void> {
    const all = await this.getAll();
    const insight = all.find((i) => i.id === insightId);
    if (insight) {
      insight.shown = true;
      await this.save(all);
    }
  }

  /** Mark an insight as dismissed */
  async dismiss(insightId: string): Promise<void> {
    const all = await this.getAll();
    const insight = all.find((i) => i.id === insightId);
    if (insight) {
      insight.dismissed = true;
      await this.save(all);
    }
  }

  /** Remove insights older than 7 days */
  async cleanup(): Promise<number> {
    const all = await this.getAll();
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const fresh = all.filter((i) => i.createdAt > cutoff);
    const removed = all.length - fresh.length;
    if (removed > 0) {
      await this.save(fresh);
      log.debug(`Cleaned up ${removed} stale insights`);
    }
    return removed;
  }

  private async save(insights: Insight[]): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY]: insights });
  }
}
