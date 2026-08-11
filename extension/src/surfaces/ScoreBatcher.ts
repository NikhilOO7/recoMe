/**
 * ScoreBatcher — discovers cards on a page, debounces, and asks the cloud to
 * score them. Renders a badge + reasoning callout per card.
 *
 * Strategy:
 *   - Initial pass: query surface.cardSelector(), extract, send.
 *   - MutationObserver watches body subtree for added cards (infinite scroll
 *     on Amazon/YouTube/Reddit/eBay). Newly seen cards are debounced 800ms
 *     then batch-scored.
 *   - Per-card dedupe: a card whose id has been scored is skipped on
 *     subsequent passes (the DOM element may move/re-render; the id is
 *     stable per surface).
 *   - Pool cap: max 50 cards per request (mirrors cloud schema cap).
 *
 * Lifecycle: stop() disconnects the observer and clears all rendered badges.
 */

import { sendMessage, type ScoreCardsPayload } from '@shared/messages';
import type { CardScore } from '@shared/CloudClient';
import type { PlatformSurface, CardCandidate } from './PlatformSurface';
import { renderBadge, clearAllBadges } from './renderers/CardBadge';
import { createLogger } from '@shared/Logger';

const log = createLogger('ScoreBatcher');
const DEBOUNCE_MS = 800;
const MAX_BATCH = 50;

export class ScoreBatcher {
  private observer: MutationObserver | null = null;
  private pending = new Map<string, CardCandidate>();
  private scored = new Set<string>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(private surface: PlatformSurface) {}

  start(): void {
    if (!this.surface.isScoreablePage()) return;

    this.discover();

    this.observer = new MutationObserver(() => this.discover());
    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  stop(): void {
    this.stopped = true;
    this.observer?.disconnect();
    this.observer = null;
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.pending.clear();
    this.scored.clear();
    clearAllBadges();
  }

  private discover(): void {
    if (this.stopped) return;
    const cards = document.querySelectorAll<HTMLElement>(this.surface.cardSelector());
    for (const el of cards) {
      const candidate = this.surface.extract(el);
      if (!candidate) continue;
      if (this.scored.has(candidate.id)) continue;
      if (this.pending.has(candidate.id)) continue;
      this.pending.set(candidate.id, candidate);
    }
    if (this.pending.size > 0) this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, DEBOUNCE_MS);
  }

  private async flush(): Promise<void> {
    if (this.pending.size === 0 || this.stopped) return;

    const batch: CardCandidate[] = [];
    for (const c of this.pending.values()) {
      batch.push(c);
      if (batch.length >= MAX_BATCH) break;
    }
    for (const c of batch) {
      this.pending.delete(c.id);
      this.scored.add(c.id);
    }

    const res = await sendMessage<ScoreCardsPayload, { scores: CardScore[] }>('SCORE_CARDS', {
      pageUrl: location.href,
      platform: this.surface.platform,
      cards: batch.map((c) => ({
        id: c.id,
        title: c.title,
        ...(c.brand ? { brand: c.brand } : {}),
        ...(c.url ? { url: c.url } : {}),
      })),
    });
    if (!res.success) {
      log.warn('score failed', res.error);
      // Allow these cards to be retried on a future discover() pass.
      for (const c of batch) this.scored.delete(c.id);
      return;
    }

    const byId = new Map(res.data!.scores.map((s) => [s.id, s]));
    for (const c of batch) {
      const score = byId.get(c.id);
      if (!score) {
        // Server didn't score this card (e.g. transient degrade returning an
        // empty list). Un-mark it so a future discover() pass retries —
        // previously these cards were badge-less forever on this page.
        this.scored.delete(c.id);
        continue;
      }
      // Card may have been removed from DOM in the interim (infinite scroll
      // recycle). Re-resolve via the data-recome-id attribute.
      const el = document.querySelector<HTMLElement>(`[data-recome-id="${CSS.escape(c.id)}"]`);
      if (!el) continue;
      const topics = score.matchedTopics ?? [];
      renderBadge({
        el,
        verdict: score.verdict,
        score: score.score,
        reason: score.reason,
        matchedTopics: topics,
        onFeedback: topics.length > 0 ? (kind) => this.sendFeedback(kind, topics) : undefined,
      });
    }

    // If more cards accumulated during the round-trip, keep going.
    if (this.pending.size > 0) this.scheduleFlush();
  }

  /**
   * Explicit feedback from a badge action (PRODUCT.md P1 "explicit signals"):
   * boost = "more like this", block = "not for me". These become ordinary
   * signals through the same queue as capture — the graph learns; nothing is
   * filtered client-side. FLUSH_NOW so the sidebar reflects it within seconds.
   */
  private sendFeedback(kind: 'boost' | 'block', topics: string[]): void {
    void sendMessage('CAPTURE_SIGNAL', {
      signal: {
        kind,
        pageUrl: location.href,
        platform: this.surface.platform,
        topics: topics.map((name) => ({ name })),
      },
    }).then(() => sendMessage('FLUSH_NOW', undefined));
  }
}
