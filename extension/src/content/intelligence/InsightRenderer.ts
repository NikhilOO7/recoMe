import type { ProactiveInsight } from './types';
import { showToast } from '../ui/Toast';
import { createLogger } from '@shared/Logger';

const log = createLogger('InsightRenderer');

/**
 * InsightRenderer — shows proactive insights via multiple channels:
 * - Contextual toast (time-sensitive, high relevance)
 * - Overlay badge count update
 * - Agent proactive message (via overlay chat)
 */
export class InsightRenderer {
  private rendered = new Set<string>();
  private overlayBadgeCallback: ((count: number) => void) | null = null;
  private pendingInsights: ProactiveInsight[] = [];

  /** Set callback to update the overlay pill badge */
  onBadgeUpdate(cb: (count: number) => void): void {
    this.overlayBadgeCallback = cb;
  }

  /**
   * Render a batch of insights. Shows top insight as toast,
   * queues the rest for overlay viewing.
   */
  render(insights: ProactiveInsight[]): void {
    const fresh = insights.filter((i) => !this.rendered.has(i.id));
    if (fresh.length === 0) return;

    for (const insight of fresh) {
      this.rendered.add(insight.id);
      this.pendingInsights.push(insight);
    }

    // Show the top insight as a toast
    const top = fresh[0]!;
    this.showInsightToast(top);

    // Update badge count
    this.overlayBadgeCallback?.(this.pendingInsights.length);

    log.debug(`Rendered ${fresh.length} insights, ${this.pendingInsights.length} pending`);
  }

  /** Get all pending insights (for overlay display) */
  getPending(): ProactiveInsight[] {
    return [...this.pendingInsights];
  }

  /** Mark an insight as acted upon */
  markActed(insightId: string): void {
    this.pendingInsights = this.pendingInsights.filter((i) => i.id !== insightId);
    this.overlayBadgeCallback?.(this.pendingInsights.length);

    // Send feedback to background
    chrome.runtime
      .sendMessage({
        type: 'BRAIN_FEEDBACK',
        payload: { taskId: insightId, action: 'acted' },
      })
      .catch(() => undefined);
  }

  /** Dismiss an insight */
  dismiss(insightId: string): void {
    this.pendingInsights = this.pendingInsights.filter((i) => i.id !== insightId);
    this.overlayBadgeCallback?.(this.pendingInsights.length);

    chrome.runtime
      .sendMessage({
        type: 'BRAIN_FEEDBACK',
        payload: { taskId: insightId, action: 'dismissed' },
      })
      .catch(() => undefined);
  }

  private showInsightToast(insight: ProactiveInsight): void {
    // Build message with top factor explanation for transparency
    const topFactor = insight.factors
      ?.filter((f) => f.weightedScore > 0)
      .sort((a, b) => b.weightedScore - a.weightedScore)[0];
    const why = topFactor ? ` (${topFactor.explanation.toLowerCase()})` : '';
    const message = `${insight.title} — ${insight.benefit}${why}`;

    showToast(message, 'info', {
      onUndo: () => this.dismiss(insight.id),
    });

    // If there's an action URL, also show in overlay
    if (insight.actionUrl) {
      log.debug(`Insight has action URL: ${insight.actionUrl}`);
    }
  }
}
