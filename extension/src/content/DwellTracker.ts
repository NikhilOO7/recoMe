import type { ContentMetadata, Platform } from '@shared/types';
import type { ImplicitSignalType } from '@shared/messages';
import { showToast } from './ui/Toast';
import { SmartPromptEngine } from './prompts/SmartPromptEngine';

/**
 * DwellTracker — monitors how long content cards remain visible in the viewport.
 *
 * When a card is >=50% visible for longer than `dwellMs` milliseconds,
 * it fires `onDwell` with the element. The adapter uses this to ask
 * the user if they want to see more content like this.
 */
export class DwellTracker {
  private readonly observer: IntersectionObserver;
  // Map from element -> setTimeout handle
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

// ── Scroll-Back Tracker ─────────────────────────────────────────────────────

/**
 * ScrollBackTracker — detects when a user scrolls back to a previously viewed card.
 * Emits 'scroll_back' triggers to the SmartPromptEngine.
 */
export class ScrollBackTracker {
  /** Cards that have left the viewport after being viewed */
  private viewedCards = new Map<Element, { scrollY: number; meta: ContentMetadata }>();
  /** Cards we've already triggered a scroll-back prompt for */
  private scrollBackFired = new Set<Element>();
  private observer: IntersectionObserver;
  private lastScrollY = window.scrollY;
  private scrollHandler: (() => void) | null = null;

  constructor(
    private readonly promptEngine: SmartPromptEngine,
    private readonly extractMeta: (el: Element) => ContentMetadata | null,
  ) {
    // Track when cards enter/leave viewport
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target;
          if (entry.isIntersecting) {
            // Card entered viewport — check if it was previously viewed (scroll-back)
            if (this.viewedCards.has(el) && !this.scrollBackFired.has(el)) {
              // Only trigger if user scrolled UP to get here
              if (window.scrollY < this.viewedCards.get(el)!.scrollY) {
                this.scrollBackFired.add(el);
                const meta = this.viewedCards.get(el)!.meta;
                this.promptEngine.evaluate({
                  type: 'scroll_back',
                  element: el,
                  metadata: meta,
                });
              }
            }
          } else {
            // Card left viewport — record as "viewed"
            const meta = this.extractMeta(el);
            if (meta) {
              this.viewedCards.set(el, { scrollY: window.scrollY, meta });
            }
          }
        }
      },
      { threshold: 0.3 },
    );

    // Track scroll position
    this.scrollHandler = () => {
      this.lastScrollY = window.scrollY;
    };
    window.addEventListener('scroll', this.scrollHandler, { passive: true });
  }

  observe(element: Element): void {
    this.observer.observe(element);
  }

  destroy(): void {
    this.observer.disconnect();
    if (this.scrollHandler) {
      window.removeEventListener('scroll', this.scrollHandler);
    }
    this.viewedCards.clear();
    this.scrollBackFired.clear();
  }
}

// ── Comparison Behavior Detector ────────────────────────────────────────────

/**
 * ComparisonDetector — detects when a user views 3+ similar items within a window.
 * "Similar" = same top-level topic/category.
 */
export class ComparisonDetector {
  /** Recent views: topic -> timestamps */
  private recentViews = new Map<string, number[]>();
  private readonly windowMs: number;
  private readonly minCount: number;
  private firedTopics = new Set<string>();

  constructor(
    private readonly promptEngine: SmartPromptEngine,
    windowMs = 5 * 60 * 1000, // 5 minutes
    minCount = 3,
  ) {
    this.windowMs = windowMs;
    this.minCount = minCount;
  }

  /** Record that the user viewed a card. Call from DwellTracker or on card visibility. */
  recordView(element: Element, meta: ContentMetadata): void {
    const topic = meta.topics[0];
    if (!topic) return;

    const now = Date.now();
    const views = this.recentViews.get(topic) ?? [];

    // Prune old entries
    const recent = views.filter((t) => now - t < this.windowMs);
    recent.push(now);
    this.recentViews.set(topic, recent);

    // Check threshold
    if (recent.length >= this.minCount && !this.firedTopics.has(topic)) {
      this.firedTopics.add(topic);
      this.promptEngine.evaluate({
        type: 'comparison',
        element,
        metadata: meta,
        context: {
          comparisonCount: recent.length,
          categoryName: topic.replace(/_/g, ' '),
        },
      });
    }
  }

  destroy(): void {
    this.recentViews.clear();
    this.firedTopics.clear();
  }
}

// ── Cart Hover Detector ─────────────────────────────────────────────────────

/**
 * CartHoverDetector — detects when a user hovers over add-to-cart buttons for >3s.
 */
export class CartHoverDetector {
  private timers = new Map<Element, ReturnType<typeof setTimeout>>();
  private firedElements = new Set<Element>();

  constructor(
    private readonly promptEngine: SmartPromptEngine,
    private readonly extractMeta: (el: Element) => ContentMetadata | null,
  ) {}

  /** Start watching a card element for cart button hovers */
  watch(cardElement: Element): void {
    const cartBtns = cardElement.querySelectorAll(
      'button[data-action="add-to-cart"], [class*="add-to-cart"], [class*="addToCart"], ' +
        '[class*="add_to_cart"], [id*="add-to-cart"], [aria-label*="Add to cart"], ' +
        '[aria-label*="Add to Cart"], [data-testid*="add-to-cart"]',
    );

    for (const btn of cartBtns) {
      btn.addEventListener('mouseenter', () => this.onHoverStart(btn, cardElement));
      btn.addEventListener('mouseleave', () => this.onHoverEnd(btn));
    }
  }

  private onHoverStart(btn: Element, card: Element): void {
    if (this.firedElements.has(btn) || this.timers.has(btn)) return;

    const timer = setTimeout(() => {
      this.timers.delete(btn);
      this.firedElements.add(btn);
      const meta = this.extractMeta(card);
      if (meta) {
        this.promptEngine.evaluate({
          type: 'cart_hover',
          element: card,
          metadata: meta,
        });
      }
    }, 3000);

    this.timers.set(btn, timer);
  }

  private onHoverEnd(btn: Element): void {
    const timer = this.timers.get(btn);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(btn);
    }
  }

  destroy(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.firedElements.clear();
  }
}

// ── Factory ─────────────────────────────────────────────────────────────────

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

/**
 * Create the full smart prompt tracking system.
 * Returns all trackers that need to be wired up.
 */
export function createSmartPromptTrackers(
  platform: Platform,
  extractMeta: (el: Element) => ContentMetadata | null,
): {
  promptEngine: SmartPromptEngine;
  scrollBackTracker: ScrollBackTracker;
  comparisonDetector: ComparisonDetector;
  cartHoverDetector: CartHoverDetector;
} {
  const promptEngine = new SmartPromptEngine(platform);
  const scrollBackTracker = new ScrollBackTracker(promptEngine, extractMeta);
  const comparisonDetector = new ComparisonDetector(promptEngine);
  const cartHoverDetector = new CartHoverDetector(promptEngine, extractMeta);

  return { promptEngine, scrollBackTracker, comparisonDetector, cartHoverDetector };
}

function showProactiveNudge(topic: string, meta: ContentMetadata): void {
  // Build a small inline toast with Yes/No actions — use DOM creation to prevent XSS
  const container = document.createElement('div');
  container.className = 'recome-nudge';

  const textSpan = document.createElement('span');
  textSpan.className = 'recome-nudge-text';
  textSpan.appendChild(document.createTextNode('Enjoying '));
  const strong = document.createElement('strong');
  strong.textContent = topic;
  textSpan.appendChild(strong);
  textSpan.appendChild(document.createTextNode(' content?'));
  container.appendChild(textSpan);

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'recome-nudge-actions';

  const yesBtn = document.createElement('button');
  yesBtn.className = 'recome-nudge-btn yes';
  yesBtn.type = 'button';
  yesBtn.textContent = '\uD83D\uDC4D Yes, more!';
  actionsDiv.appendChild(yesBtn);

  const noBtn = document.createElement('button');
  noBtn.className = 'recome-nudge-btn no';
  noBtn.type = 'button';
  noBtn.textContent = '\uD83D\uDC4E Less of this';
  actionsDiv.appendChild(noBtn);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'recome-nudge-close';
  closeBtn.type = 'button';
  closeBtn.textContent = '\u2715';
  actionsDiv.appendChild(closeBtn);

  container.appendChild(actionsDiv);
  document.body.appendChild(container);

  // Auto-dismiss after 8 seconds if no interaction
  const autoDismiss = setTimeout(() => container.remove(), 8000);

  closeBtn.addEventListener('click', () => {
    clearTimeout(autoDismiss);
    container.remove();
  });

  yesBtn.addEventListener('click', () => {
    clearTimeout(autoDismiss);
    container.remove();
    chrome.runtime.sendMessage({ type: 'LIKE_TOPIC', payload: { topic } }).catch(() => undefined);
    showToast(`Got it — boosting ${topic} content!`, 'success');
  });

  noBtn.addEventListener('click', () => {
    clearTimeout(autoDismiss);
    container.remove();
    chrome.runtime
      .sendMessage({
        type: 'LEARN_FEEDBACK',
        payload: { content: meta, feedback: 'not_interested' },
      })
      .catch(() => undefined);
    showToast('Taking out the trash', 'info');
  });
}
