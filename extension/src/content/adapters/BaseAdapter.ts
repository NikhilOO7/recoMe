import type { ContentMetadata, FeedbackType, Platform } from '@shared/types';
import type { CandidateEntity } from '@schema/entities';
import type { PageContext, DecisionType } from '@schema/decisions';
import type { IntentType } from '@schema/intent';
import type { ScoreResponseItem } from '@brain/scoring/CommerceScorer';
import { showToast } from '../ui/Toast';
import type { IntentResolution } from '@brain/intent/IntentService';
import { getContentSignature } from './ContentSignatures';
import { discoverCardSelector, discoverFeedSelector } from './SelectorDiscovery';
import { SelectorHealthMonitor, type SelectorHealthRecord } from './SelectorHealth';
import { buildPathPattern, loadPathAwareCache, savePathAwareCache } from './PathPatternCache';
import { SELECTOR_HEALTH_CHECK_INTERVAL_MS } from '@shared/constants';
import { triggerPlatformDismiss } from './PlatformFeedback';
import { createLogger } from '@shared/Logger';
import { escapeHtml } from '@shared/utils';

export interface AdapterConfig {
  platform: Platform;
  /** CSS selector that matches individual content card elements */
  cardSelector: string;
  /** CSS selector for the feed container to observe */
  feedSelector: string;
  /** MutationObserver options for the feed */
  observerOptions?: MutationObserverInit;
}

/** Commerce score result stored on elements for explanation popovers */
interface CommerceDecision {
  candidateId: string;
  score: number;
  decision: DecisionType;
  explanation: string;
  confidence: number;
  factors: string[];
}

// Shared portal element used by all adapters for the floating menu
let sharedMenuPortal: HTMLDivElement | null = null;
function getMenuPortal(): HTMLDivElement {
  if (
    !sharedMenuPortal ||
    !document.contains(sharedMenuPortal) ||
    !document.body.contains(sharedMenuPortal)
  ) {
    // Clean up stale reference
    if (sharedMenuPortal) {
      try {
        sharedMenuPortal.remove();
      } catch {
        /* already detached */
      }
    }
    const portal = document.createElement('div');
    portal.id = 'recome-menu-portal';
    portal.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:2147483640;';
    document.body.appendChild(portal);
    sharedMenuPortal = portal;
  }
  return sharedMenuPortal;
}

// Badge labels per decision type
const DECISION_BADGE: Record<DecisionType, { label: string; className: string }> = {
  boost: { label: 'Good fit', className: 'recome-badge-boost' },
  neutral: { label: '', className: '' },
  caution: { label: 'Consider with caution', className: 'recome-badge-caution' },
  suppress: { label: 'Lower priority', className: 'recome-badge-suppress' },
};

/**
 * BaseAdapter — abstract class all platform adapters extend.
 * Handles MutationObserver lifecycle, common overlay UI, and feedback.
 * Subclasses only need to implement extractMetadata().
 * Commerce-aware adapters can also implement extractCandidate() and buildPageContext().
 */
const log = createLogger('BaseAdapter');

export abstract class BaseAdapter {
  protected readonly config: AdapterConfig;
  /** Mutable selectors — updated by discovery when hardcoded ones fail */
  protected activeCardSelector: string;
  protected activeFeedSelector: string;
  /** Narrowed observer — watches the feed container once found */
  private observer: MutationObserver | null = null;
  /** Permanent body-level observer — always running; catches modals, overlays, lazy sections */
  private bodyObserver: MutationObserver | null = null;
  // P3.2: Capped collections to prevent unbounded memory growth on long sessions
  private static readonly MAX_PROCESSED_IDS = 2000;
  private static readonly MAX_COMMERCE_DECISIONS = 500;
  private readonly processedIds = new Set<string>();
  private retryTimers: ReturnType<typeof setTimeout>[] = [];
  // Tracks how many retry attempts we've made per card id (key = id)
  private readonly cardRetryAttempts = new Map<string, number>();
  // Request coalescing — batch cards found within 50ms into fewer score requests
  private scoreBatch: Array<{ element: Element; metadata: ContentMetadata }> = [];
  private scoreBatchTimer: ReturnType<typeof setTimeout> | null = null;
  // Commerce batch — for brain scoring
  private commerceBatch: Array<{ element: Element; candidate: CandidateEntity }> = [];
  private commerceBatchTimer: ReturnType<typeof setTimeout> | null = null;
  // Commerce decisions stored per candidateId for explanation popovers
  private readonly commerceDecisions = new Map<string, CommerceDecision>();
  // V2: Selector health monitoring
  private readonly healthMonitor = new SelectorHealthMonitor();
  private pathPattern = 'home';
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: AdapterConfig) {
    this.config = config;
    this.activeCardSelector = config.cardSelector;
    this.activeFeedSelector = config.feedSelector;
    this.pathPattern = buildPathPattern(new URL(location.href));
  }

  /** Get the current card selector for querying visible cards */
  getCardSelector(): string {
    return this.activeCardSelector;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  init(): void {
    this.pathPattern = buildPathPattern(new URL(location.href));
    const count = this.observeExistingCards();
    this.healthMonitor.recordCheck(this.pathPattern, this.activeCardSelector, count);
    if (count === 0) {
      this.scheduleDiscovery();
    } else {
      this.startHealthCheck();
    }
    this.startObserver();
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.bodyObserver?.disconnect();
    this.bodyObserver = null;
    this.observedFeedEl = null;
    this.processedIds.clear();
    this.cardRetryAttempts.clear();
    for (const t of this.retryTimers) clearTimeout(t);
    this.retryTimers = [];
    if (this.scoreBatchTimer) {
      clearTimeout(this.scoreBatchTimer);
      this.scoreBatchTimer = null;
    }
    if (this.commerceBatchTimer) {
      clearTimeout(this.commerceBatchTimer);
      this.commerceBatchTimer = null;
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    this.scoreBatch = [];
    this.commerceBatch = [];
    this.commerceDecisions.clear();
    // Cancel pending mutation batch
    if (this.mutationRafId !== null) {
      cancelAnimationFrame(this.mutationRafId);
      this.mutationRafId = null;
    }
    this.pendingMutationNodes = [];
  }

  // ── Abstract ───────────────────────────────────────────────────────────────

  /** Extract structured metadata from a DOM card element */
  abstract extractMetadata(element: Element): ContentMetadata | null;

  // ── Commerce hooks (optional — override in commerce adapters) ──────────────

  /** Extract a CandidateEntity from a DOM card for brain scoring. */
  extractCandidate(_element: Element): CandidateEntity | null {
    return null;
  }

  /** Build the page context for brain scoring. */
  buildPageContext(): PageContext | null {
    return null;
  }

  /** Whether this adapter supports commerce scoring. */
  protected get isCommerceAdapter(): boolean {
    return false;
  }

  /**
   * Returns true when the current page shows user-initiated search results.
   * On search pages, RecoMe should only boost — never hide — because the user
   * intentionally searched for this content.
   * Override in platform adapters that can detect search vs. recommendation pages.
   */
  protected isUserInitiatedSearch(): boolean {
    return false;
  }

  // ── Overlay (default — subclasses may override) ────────────────────────────

  injectOverlay(
    element: Element,
    result: { action: string; score: number; explanation?: string },
  ): void {
    const el = element as HTMLElement;

    // On user-initiated search pages, never hide/suppress — user searched for this
    const isSearch = this.isUserInitiatedSearch();

    if (result.action === 'hide' && !isSearch) {
      this.applyHide(el, result.explanation);
    } else if (result.action === 'boost') {
      this.applyBoost(el);
      this.injectFeedbackButtons(el);
    } else if (result.action === 'suppress' && !isSearch) {
      this.applySuppress(el);
      this.injectFeedbackButtons(el);
    } else {
      this.injectFeedbackButtons(el);
    }
  }

  /** Inject commerce-aware overlay based on brain decision */
  injectCommerceOverlay(element: Element, decision: CommerceDecision): void {
    const el = element as HTMLElement;
    const isSearch = this.isUserInitiatedSearch();

    // Store decision for explanation popovers (P3.2: cap to prevent unbounded growth)
    if (this.commerceDecisions.size >= BaseAdapter.MAX_COMMERCE_DECISIONS) {
      const first = this.commerceDecisions.keys().next().value;
      if (first !== undefined) this.commerceDecisions.delete(first);
    }
    this.commerceDecisions.set(decision.candidateId, decision);

    // Apply visual treatment based on decision type
    // On search pages, skip suppress/caution since user actively searched for these
    switch (decision.decision) {
      case 'boost':
        this.applyBoost(el);
        break;
      case 'suppress':
        if (!isSearch) this.applySuppress(el);
        break;
      case 'caution':
        if (!isSearch) el.setAttribute('data-recome-caution', 'true');
        break;
    }

    // Inject decision badge (except neutral with no strong signal)
    if (decision.decision !== 'neutral' || Math.abs(decision.score) > 0.1) {
      this.injectDecisionBadge(el, decision);
    }

    // Always inject commerce action menu
    this.injectCommerceMenu(el, decision);
  }

  // ── Decision Badge ──────────────────────────────────────────────────────────

  private injectDecisionBadge(element: HTMLElement, decision: CommerceDecision): void {
    if (element.querySelector('.recome-decision-badge')) return;

    const badgeInfo = DECISION_BADGE[decision.decision];
    if (!badgeInfo.label) return;

    if (getComputedStyle(element).position === 'static') element.style.position = 'relative';

    const badge = document.createElement('div');
    badge.className = `recome-decision-badge ${badgeInfo.className}`;
    badge.setAttribute('role', 'status');
    badge.setAttribute('aria-label', `RecoMe: ${badgeInfo.label}`);

    badge.innerHTML = `
      <span class="recome-badge-label">${badgeInfo.label}</span>
      <button class="recome-badge-why" type="button" aria-label="Why this badge?" title="Why this badge?">?</button>
    `;

    element.appendChild(badge);

    // Explanation popover on "?" click
    badge.querySelector('.recome-badge-why')?.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.showExplanationPopover(badge, decision);
    });
  }

  // ── Explanation Popover ─────────────────────────────────────────────────────

  private showExplanationPopover(anchor: HTMLElement, decision: CommerceDecision): void {
    // Remove any existing popover
    document.querySelectorAll('.recome-explanation-popover').forEach((el) => el.remove());

    const popover = document.createElement('div');
    popover.className = 'recome-explanation-popover';
    popover.setAttribute('role', 'tooltip');

    // Build popover content safely (no innerHTML with user data)
    const textDiv = document.createElement('div');
    textDiv.className = 'recome-explanation-text';
    textDiv.textContent = decision.explanation;
    popover.appendChild(textDiv);

    if (decision.factors.length > 0) {
      const ul = document.createElement('ul');
      ul.className = 'recome-explanation-factors';
      for (const f of decision.factors) {
        const li = document.createElement('li');
        li.textContent = f;
        ul.appendChild(li);
      }
      popover.appendChild(ul);
    }

    const metaDiv = document.createElement('div');
    metaDiv.className = 'recome-explanation-meta';
    metaDiv.textContent = `Score: ${decision.score.toFixed(2)} · Confidence: ${(decision.confidence * 100).toFixed(0)}%`;
    popover.appendChild(metaDiv);

    const portal = getMenuPortal();
    portal.appendChild(popover);

    // Position relative to anchor
    const rect = anchor.getBoundingClientRect();
    popover.style.cssText = `
      position: fixed;
      top: ${rect.bottom + 6}px;
      left: ${Math.max(8, rect.left - 100)}px;
      pointer-events: auto;
    `;

    // Dismiss on outside click
    const dismiss = (e: Event) => {
      if (!popover.contains(e.target as Node)) {
        popover.remove();
        document.removeEventListener('click', dismiss, { capture: true });
      }
    };
    setTimeout(() => document.addEventListener('click', dismiss, { capture: true }), 0);
  }

  // ── Common overlay helpers ─────────────────────────────────────────────────

  protected applyHide(element: HTMLElement, reason?: string): void {
    if (element.classList.contains('recome-hiding')) return;
    element.style.pointerEvents = 'none';
    element.querySelector('.recome-intent')?.remove();
    element.classList.add('recome-hiding');

    // Train the platform's own algorithm by clicking native "Not interested"
    triggerPlatformDismiss(this.config.platform, element).catch(() => undefined);

    setTimeout(() => {
      // Collapse the card so it doesn't block scroll on virtualized feeds (Instagram, etc.)
      element.classList.add('recome-collapsed');

      const badge = document.createElement('div');
      badge.className = 'recome-hidden-badge';

      const iconSpan = document.createElement('span');
      iconSpan.className = 'recome-icon';
      iconSpan.textContent = '\u{1F441}\uFE0F\u200D\u{1F5E8}\uFE0F';
      badge.appendChild(iconSpan);

      const textSpan = document.createElement('span');
      textSpan.className = 'recome-hidden-text';
      textSpan.textContent = reason ? `Hidden \u00B7 ${reason}` : 'Hidden';
      badge.appendChild(textSpan);

      const revealBtn = document.createElement('button');
      revealBtn.className = 'recome-reveal-btn';
      revealBtn.type = 'button';
      revealBtn.setAttribute('aria-label', 'Show hidden content');
      revealBtn.textContent = 'Show anyway';
      badge.appendChild(revealBtn);
      badge.style.cssText =
        'position:relative;display:flex;align-items:center;z-index:9999;pointer-events:auto;padding:8px;';
      element.appendChild(badge);
      revealBtn.addEventListener('click', (e) => {
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

    // Only add the old-style badge if no commerce decision badge is being shown
    if (!element.querySelector('.recome-decision-badge')) {
      const badge = document.createElement('div');
      badge.className = 'recome-boost-badge';
      badge.textContent = 'Recommended';

      if (getComputedStyle(element).position === 'static') element.style.position = 'relative';
      element.appendChild(badge);
    }
  }

  protected reveal(element: HTMLElement, badge: HTMLElement): void {
    element.classList.remove('recome-hiding', 'recome-collapsed');
    element.style.opacity = '';
    element.style.transform = '';
    element.style.pointerEvents = '';
    element.style.maxHeight = '';
    element.style.minHeight = '';
    element.style.overflow = '';
    badge.remove();
    this.injectFeedbackButtons(element);
  }

  // ── Commerce Intent Menu (9 actions) ────────────────────────────────────────

  protected injectCommerceMenu(element: HTMLElement, _decision: CommerceDecision): void {
    if (element.querySelector('.recome-intent')) return;

    const candidate = this.extractCandidate(element);
    if (!candidate) return;

    if (getComputedStyle(element).position === 'static') element.style.position = 'relative';

    const wrapper = document.createElement('div');
    wrapper.className = 'recome-intent';

    const trigger = document.createElement('button');
    trigger.className = 'recome-trigger';
    trigger.type = 'button';
    trigger.title = 'RecoMe — tell us what you think';
    trigger.setAttribute('aria-label', 'RecoMe feedback options');
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.textContent = 'RecoMe';

    const menu = document.createElement('div');
    menu.className = 'recome-menu recome-menu-commerce';
    menu.setAttribute('hidden', '');
    menu.style.pointerEvents = 'auto';

    // Header
    const header = document.createElement('div');
    header.className = 'recome-menu-header';
    header.textContent = 'How do you feel about this?';
    menu.appendChild(header);

    // Commerce action items — full 9 intent types
    const brand = candidate.metadata['brand'] as string | undefined;
    const seller = candidate.metadata['seller'] as string | undefined;

    const intentActions: Array<{
      intentType: IntentType;
      icon: string;
      label: string;
      entityType: 'product' | 'brand' | 'seller' | 'category';
      entityId: string;
      variant?: string;
    }> = [
      {
        intentType: 'interested',
        icon: '+',
        label: 'Interested',
        entityType: 'product',
        entityId: candidate.candidateId,
      },
      {
        intentType: 'not_interested',
        icon: '-',
        label: 'Not interested',
        entityType: 'product',
        entityId: candidate.candidateId,
      },
      {
        intentType: 'already_bought',
        icon: 'C',
        label: 'Already bought',
        entityType: 'product',
        entityId: candidate.candidateId,
      },
      {
        intentType: 'one_time_need',
        icon: '1',
        label: 'One-time need',
        entityType: 'product',
        entityId: candidate.candidateId,
      },
      {
        intentType: 'researching',
        icon: 'R',
        label: 'Just researching',
        entityType: 'product',
        entityId: candidate.candidateId,
      },
    ];

    if (brand && candidate.brandId) {
      intentActions.push({
        intentType: 'prefer_brand',
        icon: 'B',
        label: `Prefer ${brand}`,
        entityType: 'brand',
        entityId: candidate.brandId,
      });
    }

    if (seller && candidate.sellerId) {
      intentActions.push({
        intentType: 'avoid_seller',
        icon: 'X',
        label: `Avoid ${seller}`,
        entityType: 'seller',
        entityId: candidate.sellerId,
        variant: 'block',
      });
    }

    // Divider before context modes
    const divider1 = document.createElement('div');
    divider1.className = 'recome-menu-divider';
    menu.appendChild(divider1);

    // Add primary actions
    for (const def of intentActions.slice(0, 5)) {
      menu.appendChild(this.buildCommerceMenuItem(def));
    }

    // Add brand/seller actions if present
    if (intentActions.length > 5) {
      const divider2 = document.createElement('div');
      divider2.className = 'recome-menu-divider';
      menu.appendChild(divider2);

      for (const def of intentActions.slice(5)) {
        menu.appendChild(this.buildCommerceMenuItem(def));
      }
    }

    // Context mode section
    const divider3 = document.createElement('div');
    divider3.className = 'recome-menu-divider';
    menu.appendChild(divider3);

    const contextHeader = document.createElement('div');
    contextHeader.className = 'recome-menu-header';
    contextHeader.textContent = 'Shopping mode';
    menu.appendChild(contextHeader);

    const contextModes: Array<{ intentType: IntentType; icon: string; label: string }> = [
      { intentType: 'quality_first', icon: 'Q', label: 'Quality first' },
      { intentType: 'budget_sensitive', icon: '$', label: 'Budget sensitive' },
    ];

    for (const mode of contextModes) {
      const btn = document.createElement('button');
      btn.className = 'recome-menu-item';
      btn.type = 'button';
      btn.dataset.action = 'context_mode';
      btn.dataset.intentType = mode.intentType;
      btn.dataset.variant = 'dim';
      btn.innerHTML = `
        <span class="recome-menu-icon recome-icon-text">${escapeHtml(mode.icon)}</span>
        <span class="recome-menu-label">${escapeHtml(mode.label)}</span>
      `;
      menu.appendChild(btn);
    }

    wrapper.appendChild(trigger);
    element.appendChild(wrapper);

    // Portal menu open/close
    let menuOpen = false;
    let outsideClickHandler: ((e: Event) => void) | null = null;

    const openMenu = () => {
      if (menuOpen) return;
      menuOpen = true;
      wrapper.classList.add('recome-open');
      trigger.setAttribute('aria-expanded', 'true');

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

      outsideClickHandler = (e: Event) => {
        if (!menu.contains(e.target as Node) && e.target !== trigger) {
          closeMenu();
        }
      };
      setTimeout(
        () => document.addEventListener('click', outsideClickHandler!, { capture: true }),
        0,
      );
    };

    const closeMenu = () => {
      if (!menuOpen) return;
      menuOpen = false;
      wrapper.classList.remove('recome-open');
      trigger.setAttribute('aria-expanded', 'false');
      menu.setAttribute('hidden', '');
      menu.style.cssText = 'pointer-events: auto;';
      wrapper.appendChild(menu);
      if (outsideClickHandler) {
        document.removeEventListener('click', outsideClickHandler, { capture: true });
        outsideClickHandler = null;
      }
    };

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menuOpen) closeMenu();
      else openMenu();
    });

    menu.addEventListener('click', (e) => {
      const btn = (e.target as Element).closest('[data-action]') as HTMLElement | null;
      if (!btn) return;
      e.stopPropagation();
      closeMenu();

      const action = btn.dataset.action!;
      if (action === 'record_intent') {
        const intentType = btn.dataset.intentType as IntentType;
        const entityType = btn.dataset.entityType as 'product' | 'brand' | 'seller' | 'category';
        const entityId = btn.dataset.entityId!;
        this.handleCommerceIntent(element, intentType, entityType, entityId);
      } else if (action === 'context_mode') {
        const intentType = btn.dataset.intentType as IntentType;
        this.handleCommerceIntent(element, intentType, 'product', candidate.candidateId);
      }
    });
  }

  private buildLegacyMenuItem(def: {
    action: string;
    icon: string;
    label: string;
    variant?: string;
    value?: string;
  }): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'recome-menu-item';
    btn.type = 'button';
    if (def.variant) btn.dataset.variant = def.variant;
    if (def.value) btn.dataset.value = def.value;
    btn.dataset.action = def.action;
    btn.innerHTML = `
      <span class="recome-menu-icon recome-icon-text">${escapeHtml(def.icon)}</span>
      <span class="recome-menu-label">${escapeHtml(def.label)}</span>
    `;
    return btn;
  }

  private buildCommerceMenuItem(def: {
    intentType: IntentType;
    icon: string;
    label: string;
    entityType: string;
    entityId: string;
    variant?: string;
  }): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'recome-menu-item';
    btn.type = 'button';
    btn.dataset.action = 'record_intent';
    btn.dataset.intentType = def.intentType;
    btn.dataset.entityType = def.entityType;
    btn.dataset.entityId = def.entityId;
    if (def.variant) btn.dataset.variant = def.variant;
    btn.innerHTML = `
      <span class="recome-menu-icon recome-icon-text">${escapeHtml(def.icon)}</span>
      <span class="recome-menu-label">${escapeHtml(def.label)}</span>
    `;
    return btn;
  }

  private handleCommerceIntent(
    element: HTMLElement,
    intentType: IntentType,
    entityType: 'product' | 'brand' | 'seller' | 'category',
    entityId: string,
  ): void {
    if (this.contextInvalidated) return;

    // Save original visual state for undo
    const origOpacity = element.style.opacity;
    const origBoxShadow = element.style.boxShadow;
    const origTransition = element.style.transition;

    // Record intent and capture response for undo
    chrome.runtime
      .sendMessage({
        type: 'RECORD_INTENT',
        payload: { source: 'overlay' as const, entityType, entityId, intentType },
      })
      .then((response: { success: boolean; data?: IntentResolution } | undefined) => {
        const intentId = response?.data?.intentId;

        const undoAction = intentId
          ? () => {
              chrome.runtime.sendMessage({ type: 'REVOKE_INTENT', payload: { intentId } });
              // Restore visual state
              element.style.opacity = origOpacity;
              element.style.boxShadow = origBoxShadow;
              element.style.transition = origTransition;
              // Re-inject the menu
              const candidate = this.extractCandidate(element);
              if (candidate) {
                const stored = this.commerceDecisions.get(candidate.candidateId);
                if (stored) this.injectCommerceMenu(element, stored);
              }
              showToast('Intent reverted', 'info');
            }
          : undefined;

        const opts = undoAction ? { onUndo: undoAction } : undefined;

        // Visual feedback
        switch (intentType) {
          case 'interested':
            showToast('Noted — more like this!', 'success', opts);
            element.style.transition = 'box-shadow 300ms ease';
            element.style.boxShadow = '0 0 0 2px rgba(16,185,129,0.6)';
            setTimeout(() => {
              element.style.boxShadow = origBoxShadow;
            }, 1200);
            break;
          case 'not_interested':
            showToast('Got it — less like this', 'info', opts);
            element.style.transition = 'opacity 400ms ease';
            element.style.opacity = '0.35';
            break;
          case 'already_bought':
            showToast('Marked as already bought', 'info', opts);
            element.style.transition = 'opacity 400ms ease';
            element.style.opacity = '0.4';
            break;
          case 'one_time_need':
            showToast('One-time need — will fade from recs', 'info', opts);
            break;
          case 'researching':
            showToast('Research mode — keeping options open', 'info', opts);
            break;
          case 'prefer_brand':
            showToast('Brand preference saved!', 'success', opts);
            break;
          case 'avoid_seller':
            showToast('Seller avoided — noted', 'info', opts);
            break;
          case 'quality_first':
            showToast('Quality first mode on', 'success', opts);
            break;
          case 'budget_sensitive':
            showToast('Budget mode on', 'success', opts);
            break;
        }
      })
      .catch(() => undefined);

    // Remove intent menu after action
    element.querySelector('.recome-intent')?.remove();
  }

  // ── Legacy Intent Menu (5 actions — for non-commerce adapters) ──────────────

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
    trigger.textContent = 'RecoMe';

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

    // Primary actions
    const interestedBtn = this.buildLegacyMenuItem({
      action: 'interested',
      icon: '+',
      label: 'More like this',
    });
    menu.appendChild(interestedBtn);

    // "Less like this" expander — reveals clarification sub-options
    const lessBtn = document.createElement('button');
    lessBtn.className = 'recome-menu-item';
    lessBtn.type = 'button';
    lessBtn.innerHTML = `
      <span class="recome-menu-icon recome-icon-text">-</span>
      <span class="recome-menu-label">Less like this</span>
      <span class="recome-menu-expand">›</span>
    `;

    const subPanel = document.createElement('div');
    subPanel.className = 'recome-menu-sub';
    subPanel.setAttribute('hidden', '');

    // Sub-option 1: Block topic forever
    const topTopic = metadata.topics[0];
    if (topTopic) {
      const display = topTopic.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      subPanel.appendChild(
        this.buildLegacyMenuItem({
          action: 'block_topic',
          icon: 'X',
          label: `Never show "${display}"`,
          variant: 'block',
          value: topTopic,
        }),
      );
    } else {
      subPanel.appendChild(
        this.buildLegacyMenuItem({
          action: 'block_topic',
          icon: 'X',
          label: 'Never show this topic',
          variant: 'block',
          value: metadata.title,
        }),
      );
    }

    // Sub-option 2: Block creator
    if (metadata.creator) {
      const shortCreator =
        metadata.creator.length > 24 ? metadata.creator.slice(0, 24) + '...' : metadata.creator;
      subPanel.appendChild(
        this.buildLegacyMenuItem({
          action: 'block_creator',
          icon: 'X',
          label: `Not this creator (${shortCreator})`,
          variant: 'block',
          value: metadata.creator,
        }),
      );
    }

    // Sub-option 3: Just not right now
    subPanel.appendChild(
      this.buildLegacyMenuItem({
        action: 'one_time',
        icon: 'T',
        label: 'Just not right now',
        variant: 'dim',
      }),
    );

    // Sub-option 4: Generic not_interested (soft signal)
    subPanel.appendChild(
      this.buildLegacyMenuItem({
        action: 'not_interested',
        icon: '-',
        label: 'Less of this kind',
        variant: 'dim',
      }),
    );

    menu.appendChild(lessBtn);
    menu.appendChild(subPanel);

    // Toggle sub-panel on "Less like this" click
    lessBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = subPanel.hasAttribute('hidden');
      if (isHidden) {
        subPanel.removeAttribute('hidden');
        lessBtn.classList.add('recome-menu-item-expanded');
      } else {
        subPanel.setAttribute('hidden', '');
        lessBtn.classList.remove('recome-menu-item-expanded');
      }
    });

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
      setTimeout(
        () => document.addEventListener('click', outsideClickHandler!, { capture: true }),
        0,
      );
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
      if (menuOpen) closeMenu();
      else openMenu();
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

    // Save original state for undo
    const origOpacity = element.style.opacity;
    const origBoxShadow = element.style.boxShadow;
    const origTransition = element.style.transition;

    const restoreElement = () => {
      element.style.opacity = origOpacity;
      element.style.boxShadow = origBoxShadow;
      element.style.transition = origTransition;
      element.classList.remove('recome-hiding');
      element.style.pointerEvents = '';
      // Remove the hidden badge if present
      element.parentElement?.querySelector('.recome-hidden-badge')?.remove();
      // Re-inject feedback buttons
      this.injectFeedbackButtons(element);
    };

    switch (action) {
      case 'interested':
        chrome.runtime.sendMessage({
          type: 'LEARN_FEEDBACK',
          payload: { content: metadata, feedback: 'interested' as FeedbackType },
        });
        showToast('RecoMe learned something!', 'success');
        element.querySelector('.recome-intent')?.remove();
        element.style.transition = 'box-shadow 300ms ease';
        element.style.boxShadow = '0 0 0 2px rgba(16,185,129,0.6)';
        setTimeout(() => {
          element.style.boxShadow = '';
        }, 1200);
        break;

      case 'not_interested':
        chrome.runtime.sendMessage({
          type: 'LEARN_FEEDBACK',
          payload: { content: metadata, feedback: 'not_interested' as FeedbackType },
        });
        showToast('Noted — less like this', 'info');
        element.querySelector('.recome-intent')?.remove();
        element.style.transition = 'opacity 400ms ease';
        element.style.opacity = '0.35';
        break;

      case 'block_topic': {
        const topic = value || metadata.title;
        chrome.runtime.sendMessage({ type: 'BLOCK_TOPIC', payload: { topic } });
        const display = topic.replace(/_/g, ' ');
        showToast(`"${display}" blocked`, 'info', {
          onUndo: () => {
            chrome.runtime.sendMessage({ type: 'UNBLOCK_TOPIC', payload: { topic } });
            restoreElement();
            showToast('Block reverted', 'info');
          },
        });
        this.applyHide(element, `Blocked: "${display}"`);
        break;
      }

      case 'block_creator': {
        const creator = value || metadata.creator || metadata.title;
        chrome.runtime.sendMessage({ type: 'BLOCK_TOPIC', payload: { topic: creator } });
        const short = creator.length > 30 ? creator.slice(0, 30) + '...' : creator;
        showToast(`"${short}" blocked`, 'info', {
          onUndo: () => {
            chrome.runtime.sendMessage({ type: 'UNBLOCK_TOPIC', payload: { topic: creator } });
            restoreElement();
            showToast('Block reverted', 'info');
          },
        });
        this.applyHide(element, `Blocked creator: "${short}"`);
        break;
      }

      case 'one_time':
        chrome.runtime.sendMessage({
          type: 'LEARN_FEEDBACK',
          payload: { content: metadata, feedback: 'one_time' as FeedbackType },
        });
        showToast('Hiding it for now', 'info');
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
      '[role="log"]', // ARIA chat log
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
    if (
      element.closest(
        '#intercom-container, [class*="intercom"], [class*="drift-"], [id*="hubspot-messages"], [class*="crisp-"], [class*="zendesk"], [class*="tawk-"]',
      )
    )
      return true;

    return false;
  }

  protected isAlreadyProcessed(id: string): boolean {
    return this.processedIds.has(id);
  }

  protected markProcessed(id: string): void {
    // P3.2: Evict oldest half when cap is reached to bound memory
    if (this.processedIds.size >= BaseAdapter.MAX_PROCESSED_IDS) {
      const half = Math.floor(BaseAdapter.MAX_PROCESSED_IDS / 2);
      let count = 0;
      for (const old of this.processedIds) {
        if (count++ >= half) break;
        this.processedIds.delete(old);
      }
    }
    this.processedIds.add(id);
  }

  protected onCardFound(element: Element): void {
    // Skip nested matches (e.g. CSA widget inside search result)
    if (element.parentElement?.closest(this.activeCardSelector)) return;

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

    // Commerce path: try extractCandidate for brain scoring
    if (this.isCommerceAdapter) {
      const candidate = this.extractCandidate(element);
      if (candidate) {
        this.enqueueCommerceScore(element, candidate);
        return;
      }
    }

    // Fallback: legacy content scoring
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

      if (this.isCommerceAdapter) {
        const candidate = this.extractCandidate(element);
        if (candidate) {
          this.enqueueCommerceScore(element, candidate);
          return;
        }
      }

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
        if (result && document.contains(element)) this.injectOverlay(element, result);
      });
    }
  }

  /** Enqueue a candidate for commerce (brain) scoring */
  private enqueueCommerceScore(element: Element, candidate: CandidateEntity): void {
    this.commerceBatch.push({ element, candidate });
    if (!this.commerceBatchTimer) {
      this.commerceBatchTimer = setTimeout(() => this.flushCommerceBatch(), 50);
    }
  }

  private flushCommerceBatch(): void {
    this.commerceBatchTimer = null;
    const batch = this.commerceBatch.splice(0);
    if (batch.length === 0) return;

    const pageContext = this.buildPageContext();
    if (!pageContext) {
      // Fallback to legacy scoring if no page context
      for (const { element } of batch) {
        const metadata = this.extractMetadata(element);
        if (metadata) this.enqueueScore(element, metadata);
      }
      return;
    }

    const candidates = batch.map((b) => b.candidate);
    const elementMap = new Map<string, Element>();
    for (const { element, candidate } of batch) {
      elementMap.set(candidate.candidateId, element);
    }

    this.requestCommerceScore(candidates, pageContext).then((items) => {
      if (!items) return;
      for (const item of items) {
        const element = elementMap.get(item.candidateId);
        if (element && document.contains(element)) {
          this.injectCommerceOverlay(element, item);
        }
      }
    });
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

  protected async requestCommerceScore(
    candidates: CandidateEntity[],
    pageContext: PageContext,
  ): Promise<ScoreResponseItem[] | null> {
    if (this.contextInvalidated) return null;
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SCORE_CANDIDATES',
        payload: { candidates, pageContext },
      });
      if (response?.success && response.data) {
        return (response.data as { items: ScoreResponseItem[] }).items;
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

  private observeExistingCards(): number {
    const cards = document.querySelectorAll(this.activeCardSelector);
    cards.forEach((card) => this.onCardFound(card));

    // Shadow DOM traversal — scan open shadow roots for cards
    const shadowCards = this.queryShadowRoots(document.body, this.activeCardSelector);
    shadowCards.forEach((card) => this.onCardFound(card));

    return cards.length + shadowCards.length;
  }

  /**
   * Recursively traverse open shadow roots to find elements matching a selector.
   * Handles custom elements used by platforms (e.g., YouTube's polymer components,
   * ad-blockers injecting shadow-rooted containers, dark-mode extensions).
   */
  private queryShadowRoots(root: Element | Document, selector: string, depth = 0): Element[] {
    if (depth > 3) return []; // Limit depth to prevent runaway recursion
    const results: Element[] = [];
    // P3.2: Only scan custom elements (tag names with hyphens) — standard elements
    // never have shadow roots. This avoids scanning every element in the document.
    const customElements = root.querySelectorAll('*');
    for (const host of customElements) {
      if (!host.tagName.includes('-')) continue; // Skip non-custom elements
      const shadow = host.shadowRoot;
      if (!shadow) continue; // Only open shadow roots are accessible
      const found = shadow.querySelectorAll(selector);
      for (const el of found) results.push(el);
      // Recurse into nested shadow roots
      results.push(...this.queryShadowRoots(shadow as unknown as Document, selector, depth + 1));
    }
    return results;
  }

  /** Pending elements from batched mutation observations */
  private pendingMutationNodes: Element[] = [];
  private mutationRafId: number | null = null;

  /** Build a MutationObserver callback that batches mutations via rAF */
  private makeMutationCallback(): MutationCallback {
    return (mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          this.pendingMutationNodes.push(node);
        }
      }
      // Batch processing — coalesce rapid DOM mutations into a single rAF pass
      if (this.mutationRafId === null) {
        this.mutationRafId = requestAnimationFrame(() => {
          this.mutationRafId = null;
          this.processPendingMutations();
        });
      }
    };
  }

  /** Process batched mutation nodes, capped to avoid long-running frames */
  private processPendingMutations(): void {
    const nodes = this.pendingMutationNodes;
    this.pendingMutationNodes = [];

    // Cap per-frame work to prevent jank (process remaining in next frame)
    const MAX_PER_FRAME = 50;
    const batch = nodes.length > MAX_PER_FRAME ? nodes.splice(0, MAX_PER_FRAME) : nodes;

    for (const node of batch) {
      if (node.matches(this.activeCardSelector)) this.onCardFound(node);
      node.querySelectorAll(this.activeCardSelector).forEach((card) => this.onCardFound(card));
      // Also check inside open shadow roots of newly added elements
      if (node.shadowRoot) {
        node.shadowRoot
          .querySelectorAll(this.activeCardSelector)
          .forEach((card) => this.onCardFound(card));
      }
      const shadowCards = this.queryShadowRoots(node, this.activeCardSelector);
      shadowCards.forEach((card) => this.onCardFound(card));
    }

    // If there are remaining nodes, schedule another frame
    if (nodes.length > 0) {
      this.pendingMutationNodes = nodes.concat(this.pendingMutationNodes);
      this.mutationRafId = requestAnimationFrame(() => {
        this.mutationRafId = null;
        this.processPendingMutations();
      });
    }
  }

  private attachObserver(element: Element): void {
    this.observer?.disconnect();
    this.observedFeedEl = element;
    this.observer = new MutationObserver(this.makeMutationCallback());
    this.observer.observe(
      element,
      this.config.observerOptions ?? { childList: true, subtree: true },
    );
  }

  /** The feed element being observed (used to dedup body observer events) */
  private observedFeedEl: Element | null = null;

  private startObserver(): void {
    // Permanent body-level observer — catches modals, overlays, lazy-injected sections
    // (e.g. Instagram post modal opens as a child of <body>, not inside main).
    // Filters out mutations already covered by the narrower feed observer to avoid
    // double-processing the same subtree.
    this.bodyObserver = new MutationObserver((mutations) => {
      const feedEl = this.observedFeedEl;
      const filtered = feedEl ? mutations.filter((m) => !feedEl.contains(m.target)) : mutations;
      if (filtered.length > 0) {
        this.makeMutationCallback()(filtered, this.bodyObserver!);
      }
    });
    this.bodyObserver.observe(document.body, { childList: true, subtree: true });

    // Narrow observer on the feed container once available (more efficient for
    // re-checking already-visible cards when new items virtualise in).
    const feedEl = document.querySelector(this.activeFeedSelector);
    if (feedEl) {
      this.attachObserver(feedEl);
    } else {
      this.retryFeedSelector(0);
    }
  }

  private retryFeedSelector(attempt: number): void {
    const delays = [1000, 2000, 4000, 8000];
    if (attempt >= delays.length) {
      // All retries exhausted — try discovering the feed container
      this.discoverFeedContainer();
      return;
    }

    const timer = setTimeout(() => {
      const feedEl = document.querySelector(this.activeFeedSelector);
      if (feedEl) {
        this.attachObserver(feedEl);
        this.observeExistingCards();
      } else {
        this.retryFeedSelector(attempt + 1);
      }
    }, delays[attempt]!);
    this.retryTimers.push(timer);
  }

  // ── Adaptive Selector Discovery (V2: Health + Path-Aware Cache) ─────────

  /**
   * Apply cached selectors before init() — called from content/index.ts
   * so cached discovery results are available immediately.
   */
  applyCachedSelectors(cached: SelectorHealthRecord): void {
    this.activeCardSelector = cached.cardSelector;
    if (cached.feedSelector) {
      this.activeFeedSelector = cached.feedSelector;
    }
    this.healthMonitor.loadRecord(cached);
    log.info(
      `Applied cached selectors: card="${cached.cardSelector}", path="${cached.pathPattern}"`,
    );
  }

  /**
   * Periodic health check — monitors whether active selectors still find cards.
   * If health degrades, triggers re-discovery.
   */
  private startHealthCheck(): void {
    if (this.healthCheckInterval) return;

    this.healthCheckInterval = setInterval(() => {
      // P3.2: Scope query to feed container when available to avoid full-document scan
      const scope =
        this.observedFeedEl && document.contains(this.observedFeedEl)
          ? this.observedFeedEl
          : document;
      const count = scope.querySelectorAll(this.activeCardSelector).length;
      const record = this.healthMonitor.recordCheck(
        this.pathPattern,
        this.activeCardSelector,
        count,
      );

      if (!this.healthMonitor.isHealthy(this.pathPattern)) {
        log.info(`Selector health degraded for ${this.pathPattern} — triggering re-discovery`);
        clearInterval(this.healthCheckInterval!);
        this.healthCheckInterval = null;
        this.scheduleDiscovery();
      } else {
        // Persist updated health data periodically
        const domain = location.hostname.replace(/^www\./, '');
        savePathAwareCache(domain, this.pathPattern, record).catch(() => {});
      }
    }, SELECTOR_HEALTH_CHECK_INTERVAL_MS);
  }

  /**
   * Schedule live DOM discovery after a short delay.
   * Runs when hardcoded selectors find 0 cards on init, or when health degrades.
   */
  private scheduleDiscovery(): void {
    const timer = setTimeout(async () => {
      const domain = location.hostname.replace(/^www\./, '');

      // First try path-aware V2 cache
      const cached = await loadPathAwareCache(domain, this.pathPattern);
      if (cached) {
        this.activeCardSelector = cached.cardSelector;
        if (cached.feedSelector) this.activeFeedSelector = cached.feedSelector;
        this.healthMonitor.loadRecord(cached);
        const count = this.observeExistingCards();
        if (count > 0) {
          log.info(`V2 cached selectors found ${count} cards for ${this.pathPattern}`);
          this.healthMonitor.recordCheck(this.pathPattern, this.activeCardSelector, count);
          this.startHealthCheck();
          return;
        }
      }

      // Live discovery
      const signature = getContentSignature(this.config.platform);
      if (!signature) {
        log.debug(
          `No content signature for platform "${this.config.platform}" — skipping discovery`,
        );
        return;
      }

      const result = discoverCardSelector(this.config.platform, signature);
      if (!result) {
        log.debug('Live discovery found no cards');
        return;
      }

      log.info(`Discovery found ${result.count} cards with selector "${result.selector}"`);
      this.activeCardSelector = result.selector;
      if (result.feedSelector) this.activeFeedSelector = result.feedSelector;

      // Re-scan with discovered selectors
      const count = this.observeExistingCards();

      // Attach observer to discovered feed
      if (result.feedSelector) {
        const feedEl = document.querySelector(result.feedSelector);
        if (feedEl) this.attachObserver(feedEl);
      }

      // Create health record and start monitoring
      const record = this.healthMonitor.resetHealth(this.pathPattern, result.selector, count);
      record.feedSelector = result.feedSelector;
      this.startHealthCheck();

      // Cache for next page load
      await savePathAwareCache(domain, this.pathPattern, record);
    }, 1500);
    this.retryTimers.push(timer);
  }

  /**
   * Discover the feed container from already-found card elements.
   * Called when retryFeedSelector exhausts all attempts.
   */
  private discoverFeedContainer(): void {
    const cards = Array.from(document.querySelectorAll(this.activeCardSelector));
    if (cards.length < 2) return;

    const feedSel = discoverFeedSelector(cards);
    if (!feedSel) return;

    this.activeFeedSelector = feedSel;
    this.healthMonitor.setFeedSelector(this.pathPattern, feedSel);
    const feedEl = document.querySelector(feedSel);
    if (feedEl) {
      this.attachObserver(feedEl);
      log.info(`Discovered feed container: "${feedSel}"`);
    }
  }
}
