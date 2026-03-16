import type { ContentMetadata, Platform } from '@shared/types';
import type { ImplicitSignalType } from '@shared/messages';
import { showToast } from './ui/Toast';

/**
 * DwellTracker — monitors how long content cards remain visible in the viewport.
 *
 * When a card is ≥50% visible for longer than `dwellMs` milliseconds,
 * it fires `onDwell` with the element. The adapter uses this to ask
 * the user if they want to see more content like this.
 */
export class DwellTracker {
  private readonly observer: IntersectionObserver;
  // Map from element → setTimeout handle
  private readonly timers = new Map<Element, ReturnType<typeof setTimeout>>();
  // Extended dwell timers (30s) — separate from the nudge timer
  private readonly extendedTimers = new Map<Element, ReturnType<typeof setTimeout>>();
  // Track elements we've already prompted for (don't prompt twice per element)
  private readonly prompted = new Set<Element>();
  // Track elements that already fired an extended dwell signal
  private readonly extendedFired = new Set<Element>();

  constructor(
    private readonly dwellMs: number,
    private readonly onDwell: (element: Element) => void,
    private readonly onImplicitSignal?: (element: Element, signalType: ImplicitSignalType) => void,
  ) {
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            this.startTimer(entry.target);
          } else {
            this.clearTimer(entry.target);
          }
        }
      },
      { threshold: 0.5 },
    );
  }

  observe(element: Element): void {
    this.observer.observe(element);
  }

  unobserve(element: Element): void {
    this.observer.unobserve(element);
    this.clearTimer(element);
  }

  destroy(): void {
    this.observer.disconnect();
    for (const t of this.timers.values()) clearTimeout(t);
    for (const t of this.extendedTimers.values()) clearTimeout(t);
    this.timers.clear();
    this.extendedTimers.clear();
    this.prompted.clear();
    this.extendedFired.clear();
  }

  private startTimer(element: Element): void {
    if (this.timers.has(element) || this.prompted.has(element)) return;

    // Primary timer: fires nudge at dwellMs (7s default)
    const handle = setTimeout(() => {
      this.timers.delete(element);
      this.prompted.add(element);
      // Fire silent implicit signal (dwell_short) before showing nudge
      this.onImplicitSignal?.(element, 'dwell_short');
      this.onDwell(element);
    }, this.dwellMs);
    this.timers.set(element, handle);

    // Extended timer: fires strong implicit signal at 30s (no UI)
    if (!this.extendedTimers.has(element) && !this.extendedFired.has(element)) {
      const extHandle = setTimeout(() => {
        this.extendedTimers.delete(element);
        this.extendedFired.add(element);
        this.onImplicitSignal?.(element, 'dwell_extended');
      }, 30_000);
      this.extendedTimers.set(element, extHandle);
    }
  }

  private clearTimer(element: Element): void {
    const handle = this.timers.get(element);
    if (handle !== undefined) {
      clearTimeout(handle);
      this.timers.delete(element);
    }
    const extHandle = this.extendedTimers.get(element);
    if (extHandle !== undefined) {
      clearTimeout(extHandle);
      this.extendedTimers.delete(element);
    }
  }
}

/**
 * Create a DwellTracker that shows a proactive nudge when the user
 * lingers on a piece of content.
 */
export function createProactiveDwellTracker(
  platform: Platform,
  extractMeta: (el: Element) => ContentMetadata | null,
): DwellTracker {
  // Session-level dedup so we don't spam nudges
  const nudgedTopics = new Set<string>();
  // Dedup implicit signals per element to avoid duplicate sends
  const implicitFired = new Set<string>();

  return new DwellTracker(
    7000,
    // onDwell — shows the proactive nudge
    (element) => {
      const meta = extractMeta(element);
      if (!meta) return;

      const topic = meta.topics[0] ?? meta.creator ?? null;
      if (!topic) return;

      const cleaned = topic.replace(/[^a-zA-Z]/g, '').trim();
      if (cleaned.length < 3) return;

      if (nudgedTopics.has(topic)) return;
      nudgedTopics.add(topic);

      const displayTopic = topic.replace(/_/g, ' ');
      showProactiveNudge(displayTopic, meta);
    },
    // onImplicitSignal — silently sends implicit signal to background
    (element, signalType) => {
      const meta = extractMeta(element);
      if (!meta) return;
      if (meta.topics.length === 0 && meta.entities.length === 0) return;

      const key = `${meta.id}:${signalType}`;
      if (implicitFired.has(key)) return;
      implicitFired.add(key);

      chrome.runtime
        .sendMessage({
          type: 'IMPLICIT_SIGNAL',
          payload: {
            topics: meta.topics,
            entities: meta.entities,
            platform,
            signalType,
            contentId: meta.id,
            contentTitle: meta.title,
          },
        })
        .catch(() => undefined);
    },
  );
}

function showProactiveNudge(topic: string, meta: ContentMetadata): void {
  // Build a small inline toast with Yes/No actions
  const container = document.createElement('div');
  container.className = 'recome-nudge';
  container.innerHTML = `
    <span class="recome-nudge-text">Enjoying <strong>${topic}</strong> content?</span>
    <div class="recome-nudge-actions">
      <button class="recome-nudge-btn yes" type="button">👍 Yes, more!</button>
      <button class="recome-nudge-btn no"  type="button">👎 Less of this</button>
      <button class="recome-nudge-close"   type="button">✕</button>
    </div>
  `;

  document.body.appendChild(container);

  // Auto-dismiss after 8 seconds if no interaction
  const autoDismiss = setTimeout(() => container.remove(), 8000);

  container.querySelector('.recome-nudge-close')?.addEventListener('click', () => {
    clearTimeout(autoDismiss);
    container.remove();
  });

  container.querySelector('.recome-nudge-btn.yes')?.addEventListener('click', () => {
    clearTimeout(autoDismiss);
    container.remove();
    chrome.runtime.sendMessage({ type: 'LIKE_TOPIC', payload: { topic } }).catch(() => undefined);
    showToast(`✦ Got it — boosting ${topic} content!`, 'success');
  });

  container.querySelector('.recome-nudge-btn.no')?.addEventListener('click', () => {
    clearTimeout(autoDismiss);
    container.remove();
    chrome.runtime
      .sendMessage({
        type: 'LEARN_FEEDBACK',
        payload: { content: meta, feedback: 'not_interested' },
      })
      .catch(() => undefined);
    showToast(`Taking out the trash 🗑️`, 'info');
  });
}
