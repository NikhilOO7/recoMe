import type { ContentMetadata, FeedbackType, Platform } from '@shared/types';
import { showToast } from '../ui/Toast';

export interface AdapterConfig {
  platform: Platform;
  /** CSS selector that matches individual content card elements */
  cardSelector: string;
  /** CSS selector for the feed container to observe */
  feedSelector: string;
  /** MutationObserver options for the feed */
  observerOptions?: MutationObserverInit;
}

// Shared portal element used by all adapters for the floating menu
let sharedMenuPortal: HTMLDivElement | null = null;
function getMenuPortal(): HTMLDivElement {
  if (!sharedMenuPortal || !document.contains(sharedMenuPortal)) {
    const portal = document.createElement('div');
    portal.id = 'recome-menu-portal';
    portal.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:2147483640;';
    document.body.appendChild(portal);
    sharedMenuPortal = portal;
  }
  return sharedMenuPortal;
}

/**
 * BaseAdapter — abstract class all platform adapters extend.
 * Handles MutationObserver lifecycle, common overlay UI, and feedback.
 * Subclasses only need to implement extractMetadata().
 */
export abstract class BaseAdapter {
  protected readonly config: AdapterConfig;
  /** Narrowed observer — watches the feed container once found */
  private observer: MutationObserver | null = null;
  /** Permanent body-level observer — always running; catches modals, overlays, lazy sections */
  private bodyObserver: MutationObserver | null = null;
  private readonly processedIds = new Set<string>();
  private retryTimers: ReturnType<typeof setTimeout>[] = [];
  // Tracks how many retry attempts we've made per card id (key = id)
  private readonly cardRetryAttempts = new Map<string, number>();
  // Request coalescing — batch cards found within 50ms into fewer score requests
  private scoreBatch: Array<{ element: Element; metadata: ContentMetadata }> = [];
  private scoreBatchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: AdapterConfig) {
    this.config = config;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  init(): void {
    this.observeExistingCards();
    this.startObserver();
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.bodyObserver?.disconnect();
    this.bodyObserver = null;
    this.processedIds.clear();
    this.cardRetryAttempts.clear();
    for (const t of this.retryTimers) clearTimeout(t);
    this.retryTimers = [];
    if (this.scoreBatchTimer) { clearTimeout(this.scoreBatchTimer); this.scoreBatchTimer = null; }
    this.scoreBatch = [];
  }

  // ── Abstract ───────────────────────────────────────────────────────────────

  /** Extract structured metadata from a DOM card element */
  abstract extractMetadata(element: Element): ContentMetadata | null;

  // ── Overlay (default — subclasses may override) ────────────────────────────

  injectOverlay(
    element: Element,
    result: { action: string; score: number; explanation?: string },
  ): void {
    const el = element as HTMLElement;
    if (result.action === 'hide') {
      this.applyHide(el, result.explanation);
    } else if (result.action === 'boost') {
      this.applyBoost(el);
      this.injectFeedbackButtons(el);
    } else if (result.action === 'suppress') {
      this.applySuppress(el);
      this.injectFeedbackButtons(el);
    } else {
      this.injectFeedbackButtons(el);
    }
  }

  // ── Common overlay helpers ─────────────────────────────────────────────────

  protected applyHide(element: HTMLElement, reason?: string): void {
    if (element.classList.contains('recome-hiding')) return;
    element.style.pointerEvents = 'none';
    element.querySelector('.recome-intent')?.remove();
    element.classList.add('recome-hiding');

    setTimeout(() => {
      const parent = element.parentElement;
      if (!parent || parent.querySelector('.recome-hidden-badge')) return;
      if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';

      const badge = document.createElement('div');
      badge.className = 'recome-hidden-badge';
      badge.innerHTML = `
        <span class="recome-icon">👁️‍🗨️</span>
        <span class="recome-hidden-text">Hidden${reason ? ` · ${reason}` : ''}</span>
        <button class="recome-reveal-btn" type="button" aria-label="Show hidden content">Show anyway</button>
      `;
      badge.style.cssText = 'position:absolute;top:4px;right:4px;z-index:9999;pointer-events:auto;';
      parent.appendChild(badge);
      badge.querySelector('.recome-reveal-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.reveal(element, badge);
      });
    }, 420);
  }

  protected applySuppress(element: HTMLElement): void {
    element.setAttribute('data-recome-suppress', 'true');
  }

  protected applyBoost(element: HTMLElement): void {
    element.setAttribute('data-recome-boost', 'true');

    const badge = document.createElement('div');
    badge.className = 'recome-boost-badge';
    badge.textContent = '✦ Recommended';

    if (getComputedStyle(element).position === 'static') element.style.position = 'relative';
    element.appendChild(badge);
  }

  protected reveal(element: HTMLElement, badge: HTMLElement): void {
    element.classList.remove('recome-hiding');
    element.style.opacity = '';
    element.style.transform = '';
    element.style.pointerEvents = '';
    badge.remove();
    this.injectFeedbackButtons(element);
  }

  // ── Intent Menu ────────────────────────────────────────────────────────────

  protected injectFeedbackButtons(element: HTMLElement): void {
    if (element.querySelector('.recome-intent')) return;

    const metadata = this.extractMetadata(element);
    if (!metadata) return;

    if (getComputedStyle(element).position === 'static') element.style.position = 'relative';

    const wrapper = document.createElement('div');
    wrapper.className = 'recome-intent';

    const trigger = document.createElement('button');
    trigger.className = 'recome-trigger';
    trigger.type = 'button';
    trigger.title = 'RecoMe — feedback options';
    trigger.setAttribute('aria-label', 'RecoMe feedback options');
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.textContent = '🎯 RecoMe';

    // The menu lives in the portal to escape overflow:hidden clipping
    const menu = document.createElement('div');
    menu.className = 'recome-menu';
    menu.setAttribute('hidden', '');
    menu.style.pointerEvents = 'auto';

    // Build menu items
    const header = document.createElement('div');
    header.className = 'recome-menu-header';
    header.textContent = 'What do you think?';
    menu.appendChild(header);

    const itemDefs: Array<{ action: string; icon: string; label: string; variant?: string; value?: string }> = [
      { action: 'interested', icon: '👍', label: 'More like this' },
      { action: 'not_interested', icon: '👎', label: 'Less like this' },
    ];

    const topTopic = metadata.topics[0];
    if (topTopic) {
      const display = topTopic.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      itemDefs.push({ action: 'block_topic', icon: '🚫', label: `Block "${display}"`, variant: 'block', value: topTopic });
    } else {
      itemDefs.push({ action: 'block_topic', icon: '🚫', label: 'Block this content', variant: 'block', value: metadata.title });
    }

    if (metadata.creator) {
      const shortCreator = metadata.creator.length > 24 ? metadata.creator.slice(0, 24) + '…' : metadata.creator;
      itemDefs.push({ action: 'block_creator', icon: '🚫', label: `Block "${shortCreator}"`, variant: 'block', value: metadata.creator });
    }

    const divider = document.createElement('div');
    divider.className = 'recome-menu-divider';
    menu.appendChild(divider);

    itemDefs.push({ action: 'one_time', icon: '⏰', label: 'Not right now', variant: 'dim' });

    for (const def of itemDefs) {
      const btn = document.createElement('button');
      btn.className = 'recome-menu-item';
      btn.type = 'button';
      if (def.variant) btn.dataset.variant = def.variant;
      if (def.value) btn.dataset.value = def.value;
      btn.dataset.action = def.action;
      btn.innerHTML = `
        <span class="recome-menu-icon">${def.icon}</span>
        <span class="recome-menu-label">${def.label}</span>
      `;
      menu.appendChild(btn);
    }

    // Show topic hint in menu footer if we know topics
    if (metadata.topics.length > 0) {
      const hint = document.createElement('div');
      hint.className = 'recome-menu-topics';
      hint.textContent = `Topics: ${metadata.topics.slice(0, 3).join(', ')}`;
      menu.appendChild(hint);
    }

    wrapper.appendChild(trigger);
    element.appendChild(wrapper);

    // ── Portal-based menu open/close ─────────────────────────────────────────

    let menuOpen = false;
    let outsideClickHandler: ((e: Event) => void) | null = null;

    const openMenu = () => {
      if (menuOpen) return;
      menuOpen = true;
      wrapper.classList.add('recome-open');
      trigger.setAttribute('aria-expanded', 'true');

      // Position the menu relative to the trigger using fixed coordinates
      // so it escapes any overflow:hidden ancestors
      const portal = getMenuPortal();
      portal.appendChild(menu);
      menu.removeAttribute('hidden');

      const rect = trigger.getBoundingClientRect();
      const menuBottom = window.innerHeight - rect.top + 6;
      const menuRight = window.innerWidth - rect.right;
      menu.style.cssText = `
        position: fixed;
        bottom: ${menuBottom}px;
        right: ${menuRight}px;
        pointer-events: auto;
      `;

      // Close on outside click
      outsideClickHandler = (e: Event) => {
        if (!menu.contains(e.target as Node) && e.target !== trigger) {
          closeMenu();
        }
      };
      setTimeout(() => document.addEventListener('click', outsideClickHandler!, { capture: true }), 0);
    };

    const closeMenu = () => {
      if (!menuOpen) return;
      menuOpen = false;
      wrapper.classList.remove('recome-open');
      trigger.setAttribute('aria-expanded', 'false');
      menu.setAttribute('hidden', '');
      menu.style.cssText = 'pointer-events: auto;';
      wrapper.appendChild(menu); // Return to wrapper
      if (outsideClickHandler) {
        document.removeEventListener('click', outsideClickHandler, { capture: true });
        outsideClickHandler = null;
      }
    };

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menuOpen) closeMenu(); else openMenu();
    });

    menu.addEventListener('click', (e) => {
      const btn = (e.target as Element).closest('[data-action]') as HTMLElement | null;
      if (!btn) return;
      e.stopPropagation();

      const action = btn.dataset.action!;
      const value = btn.dataset.value ?? '';

      closeMenu();
      this.handleIntentAction(element, metadata, action, value);
    });
  }

  private handleIntentAction(
    element: HTMLElement,
    metadata: ContentMetadata,
    action: string,
    value: string,
  ): void {
    if (this.contextInvalidated) return;

    switch (action) {
      case 'interested':
        chrome.runtime.sendMessage({ type: 'LEARN_FEEDBACK', payload: { content: metadata, feedback: 'interested' as FeedbackType } });
        showToast('✨ RecoMe learned something!', 'success');
        element.querySelector('.recome-intent')?.remove();
        element.style.transition = 'box-shadow 300ms ease';
        element.style.boxShadow = '0 0 0 2px rgba(16,185,129,0.6)';
        setTimeout(() => { element.style.boxShadow = ''; }, 1200);
        break;

      case 'not_interested':
        chrome.runtime.sendMessage({ type: 'LEARN_FEEDBACK', payload: { content: metadata, feedback: 'not_interested' as FeedbackType } });
        showToast('Taking out the trash 🗑️', 'info');
        element.querySelector('.recome-intent')?.remove();
        element.style.transition = 'opacity 400ms ease';
        element.style.opacity = '0.35';
        break;

      case 'block_topic': {
        const topic = value || metadata.title;
        chrome.runtime.sendMessage({ type: 'BLOCK_TOPIC', payload: { topic } });
        const display = topic.replace(/_/g, ' ');
        showToast(`Gone forever ✨ "${display}" blocked`, 'info');
        this.applyHide(element, `Blocked: "${display}"`);
        break;
      }

      case 'block_creator': {
        const creator = value || metadata.creator || metadata.title;
        chrome.runtime.sendMessage({ type: 'BLOCK_TOPIC', payload: { topic: creator } });
        const short = creator.length > 30 ? creator.slice(0, 30) + '…' : creator;
        showToast(`Gone forever ✨ "${short}" blocked`, 'info');
        this.applyHide(element, `Blocked creator: "${short}"`);
        break;
      }

      case 'one_time':
        chrome.runtime.sendMessage({ type: 'LEARN_FEEDBACK', payload: { content: metadata, feedback: 'one_time' as FeedbackType } });
        showToast('⏰ Just this once — hiding it now', 'info');
        this.applyHide(element, 'Skipped for now');
        break;
    }
  }

  // ── Card ID helpers ────────────────────────────────────────────────────────

  protected getCardId(element: Element): string {
    const id =
      element.getAttribute('data-video-id') ??
      element.getAttribute('data-asin') ??
      element.getAttribute('data-item-id') ??
      element.getAttribute('data-id') ??
      element.getAttribute('id') ??
      this.computeContentHash(element);
    return `${this.config.platform}:${id}`;
  }

  protected computeContentHash(element: Element): string {
    const text = (element.textContent ?? '').slice(0, 100);
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Returns true if an element looks like a chat message, DM, comment thread,
   * or embedded chat widget — these should never be processed by RecoMe.
   */
  private isChatElement(element: Element): boolean {
    // Check the element and its ancestors for chat-related signals
    const chatSelectors = [
      '[class*="chat"]',
      '[class*="message-list"]',
      '[class*="messenger"]',
      '[class*="dm-"]',
      '[class*="direct-message"]',
      '[class*="conversation"]',
      '[class*="inbox"]',
      '[data-testid*="conversation"]',
      '[data-testid*="message"]',
      '[data-testid*="chat"]',
      '[role="log"]',               // ARIA chat log
      '[aria-label*="chat" i]',
      '[aria-label*="message" i]',
      '[aria-label*="conversation" i]',
    ];
    const chatSelector = chatSelectors.join(', ');

    // Is this element itself a chat container?
    if (element.matches(chatSelector)) return true;

    // Is it nested inside a chat container?
    if (element.closest(chatSelector)) return true;

    // Check for chat widget iframes / third-party widgets (Intercom, Drift, etc.)
    if (element.closest('#intercom-container, [class*="intercom"], [class*="drift-"], [id*="hubspot-messages"], [class*="crisp-"], [class*="zendesk"], [class*="tawk-"]')) return true;

    return false;
  }

  protected isAlreadyProcessed(id: string): boolean {
    return this.processedIds.has(id);
  }

  protected markProcessed(id: string): void {
    this.processedIds.add(id);
  }

  protected onCardFound(element: Element): void {
    // Skip nested matches (e.g. CSA widget inside search result)
    if (element.parentElement?.closest(this.config.cardSelector)) return;

    // Cross-adapter dedup: skip if another adapter already processed this element
    if (element.hasAttribute('data-recome-id')) return;

    // Skip chat/messaging elements — DM panels, comment sections, chat widgets
    if (this.isChatElement(element)) return;

    const id = this.getCardId(element);
    if (this.isAlreadyProcessed(id)) return;

    const metadata = this.extractMetadata(element);
    if (!metadata) {
      // DOM not ready yet (e.g. YouTube custom elements upgrading asynchronously).
      // Schedule a retry without marking the card as processed so we try again later.
      this.scheduleCardRetry(element, id, 0);
      return;
    }

    // Mark processed only AFTER successful extraction
    this.markProcessed(id);
    element.setAttribute('data-recome-id', id);

    this.enqueueScore(element, metadata);
  }

  /** Retry extracting metadata for a card whose inner content wasn't ready yet */
  private scheduleCardRetry(element: Element, id: string, attempt: number): void {
    const delays = [600, 1200, 2500, 5000];
    if (attempt >= delays.length) return;

    const timer = setTimeout(() => {
      // If the element was removed from the DOM, give up
      if (!document.contains(element)) return;
      // If another retry already succeeded (e.g. from the MutationObserver)
      if (this.isAlreadyProcessed(id) || element.hasAttribute('data-recome-id')) return;

      const metadata = this.extractMetadata(element);
      if (!metadata) {
        this.scheduleCardRetry(element, id, attempt + 1);
        return;
      }

      this.markProcessed(id);
      element.setAttribute('data-recome-id', id);
      this.enqueueScore(element, metadata);
    }, delays[attempt]!);
    this.retryTimers.push(timer);
  }

  // ── Request coalescing ─────────────────────────────────────────────────────

  /**
   * Enqueue a card for scoring. Cards found within 50ms are batched together
   * and scored concurrently, reducing per-card IDB read overhead.
   */
  private enqueueScore(element: Element, metadata: ContentMetadata): void {
    this.scoreBatch.push({ element, metadata });
    if (!this.scoreBatchTimer) {
      this.scoreBatchTimer = setTimeout(() => this.flushScoreBatch(), 50);
    }
  }

  private flushScoreBatch(): void {
    this.scoreBatchTimer = null;
    const batch = this.scoreBatch.splice(0);
    if (batch.length === 0) return;

    // Fire all score requests concurrently
    for (const { element, metadata } of batch) {
      this.requestScore(metadata).then((result) => {
        if (result) this.injectOverlay(element, result);
      });
    }
  }

  // ── Messaging ──────────────────────────────────────────────────────────────

  private contextInvalidated = false;

  protected async requestScore(
    content: ContentMetadata,
  ): Promise<{ action: string; score: number; explanation?: string } | null> {
    if (this.contextInvalidated) return null;
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'PROCESS_CONTENT',
        payload: content,
      });
      if (response?.success && response.data) {
        return response.data as { action: string; score: number; explanation?: string };
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('Extension context invalidated')) {
        this.contextInvalidated = true;
        this.destroy();
      }
    }
    return null;
  }

  // ── Observer ───────────────────────────────────────────────────────────────

  private observeExistingCards(): void {
    document.querySelectorAll(this.config.cardSelector).forEach((card) => this.onCardFound(card));
  }

  /** Build a MutationObserver callback that calls onCardFound for matching nodes */
  private makeMutationCallback(): MutationCallback {
    return (mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches(this.config.cardSelector)) this.onCardFound(node);
          node.querySelectorAll(this.config.cardSelector).forEach((card) => this.onCardFound(card));
        }
      }
    };
  }

  private attachObserver(element: Element): void {
    this.observer?.disconnect();
    this.observer = new MutationObserver(this.makeMutationCallback());
    this.observer.observe(element, this.config.observerOptions ?? { childList: true, subtree: true });
  }

  private startObserver(): void {
    // Permanent body-level observer — catches modals, overlays, lazy-injected sections
    // (e.g. Instagram post modal opens as a child of <body>, not inside main).
    // This observer is NEVER replaced — it runs for the entire lifetime of the adapter.
    this.bodyObserver = new MutationObserver(this.makeMutationCallback());
    this.bodyObserver.observe(document.body, { childList: true, subtree: true });

    // Narrow observer on the feed container once available (more efficient for
    // re-checking already-visible cards when new items virtualise in).
    const feedEl = document.querySelector(this.config.feedSelector);
    if (feedEl) {
      this.attachObserver(feedEl);
    } else {
      this.retryFeedSelector(0);
    }
  }

  private retryFeedSelector(attempt: number): void {
    const delays = [1000, 2000, 4000, 8000];
    if (attempt >= delays.length) return;

    const timer = setTimeout(() => {
      const feedEl = document.querySelector(this.config.feedSelector);
      if (feedEl) {
        this.attachObserver(feedEl);
        this.observeExistingCards();
      } else {
        this.retryFeedSelector(attempt + 1);
      }
    }, delays[attempt]!);
    this.retryTimers.push(timer);
  }
}