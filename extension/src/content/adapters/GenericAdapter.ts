import { BaseAdapter } from './BaseAdapter';
import { extractTextContent } from '@shared/utils';
import { findRepeatedSiblings } from './SelectorDiscovery';
import type { ContentMetadata, Platform } from '@shared/types';

// ── Zones where RecoMe should never inject ──────────────────────────────────
// These selectors identify profile headers, navbars, sidebars, footers,
// stats/counters, and other structural UI chrome — NOT content.
const EXCLUDED_ANCESTOR_SELECTORS = [
  // Semantic / ARIA structural zones
  'header',
  'nav',
  'footer',
  'aside',
  '[role="banner"]',
  '[role="navigation"]',
  '[role="complementary"]',
  '[role="contentinfo"]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="toolbar"]',
  '[role="tablist"]',
  // Profile / user info sections
  '[class*="profile-header"]',
  '[class*="user-header"]',
  '[class*="account-header"]',
  '[class*="profile-info"]',
  '[class*="user-info"]',
  '[class*="bio"]',
  '[class*="avatar"]',
  // Stats / counters
  '[class*="stats"]',
  '[class*="follower"]',
  '[class*="following"]',
  '[class*="count"]',
  '[class*="metric"]',
  // Toolbars / action bars / pagination
  '[class*="toolbar"]',
  '[class*="action-bar"]',
  '[class*="menu-bar"]',
  '[class*="tab-bar"]',
  '[class*="breadcrumb"]',
  '[class*="pagination"]',
  '[class*="pager"]',
  '[class*="page-nav"]',
  // Sidebar / related links
  '[class*="sidebar"]',
  '[class*="side-bar"]',
  '[class*="related-links"]',
  '[class*="trending"]',
  // Auth / forms
  '[class*="login"]',
  '[class*="signin"]',
  '[class*="signup"]',
  '[class*="register"]',
  '[class*="auth-"]',
  // Cookie banners, toasts, modals, popups
  '[class*="cookie"]',
  '[class*="consent"]',
  '[class*="toast"]',
  '[class*="snackbar"]',
  '[class*="notification-bar"]',
  '[class*="popup"]',
  '[class*="modal"]',
  '[class*="overlay"]',
  // Footer links
  '[class*="footer-"]',
  '[class*="site-footer"]',
  '[class*="bottom-nav"]',
  // Ads / sponsored
  '[class*="ad-slot"]',
  '[class*="ad-container"]',
  '[class*="sponsored"]',
  '[data-ad]',
  '[id*="google_ads"]',
  // Social proof / engagement counters
  '[class*="share-count"]',
  '[class*="like-count"]',
  '[class*="comment-count"]',
  '[class*="reaction"]',
  '[class*="endorsement"]',
  // Search / filter controls
  '[class*="search-bar"]',
  '[class*="filter-bar"]',
  '[class*="sort-bar"]',
  '[class*="search-form"]',
  '[class*="facet"]',
  '[class*="refinement"]',
  // Newsletter / subscription prompts
  '[class*="newsletter"]',
  '[class*="subscribe"]',
  '[class*="email-signup"]',
  '[class*="cta-banner"]',
  // Wishlists / cart widgets
  '[class*="mini-cart"]',
  '[class*="cart-widget"]',
  '[class*="wishlist-widget"]',
  // Table of contents / anchors
  '[class*="toc"]',
  '[class*="table-of-contents"]',
  '[class*="anchor-nav"]',
  // Social sharing bars
  '[class*="share-bar"]',
  '[class*="social-share"]',
  '[class*="share-buttons"]',
].join(', ');

/**
 * GenericAdapter — a broad-spectrum adapter that works on any page.
 *
 * Two detection strategies:
 * 1. **Selector-based** — matches semantic HTML, ARIA roles, and common class
 *    naming patterns for content cards (not UI chrome).
 * 2. **Repeated-sibling discovery** — scans the DOM for groups of 4+
 *    similarly-structured sibling elements that look like a content grid.
 */
export class GenericAdapter extends BaseAdapter {
  private readonly platformOverride: Platform;
  private discoveryTimer: ReturnType<typeof setInterval> | null = null;
  private readonly discoveredContainers = new WeakSet<Element>();

  constructor(platform: Platform = 'unknown') {
    super({
      platform,
      cardSelector: [
        // ── Semantic / ARIA (high confidence) ────────────────────────────────
        'article:not([data-recome-id])',
        '[role="article"]:not([data-recome-id])',

        // ── Compound class patterns only (single-word patterns like "card" are too noisy)
        '[class*="feed-item"]:not([data-recome-id])',
        '[class*="result-item"]:not([data-recome-id])',
        '[class*="content-item"]:not([data-recome-id])',
        '[class*="media-item"]:not([data-recome-id])',
        '[class*="grid-item"]:not([data-recome-id])',
        '[class*="list-item"]:not([data-recome-id])',
        '[class*="product-card"]:not([data-recome-id])',
        '[class*="post-card"]:not([data-recome-id])',
        '[class*="video-card"]:not([data-recome-id])',
        '[class*="article-card"]:not([data-recome-id])',
        '[class*="news-card"]:not([data-recome-id])',
        '[class*="story-card"]:not([data-recome-id])',

        // ── Data attribute patterns ──────────────────────────────────────────
        '[data-testid*="post"]:not([data-recome-id])',
        '[data-testid*="tweet"]:not([data-recome-id])',
      ].join(', '),
      feedSelector: [
        '[role="feed"]',
        '[role="main"]',
        'main',
        '#main',
        '#content',
        '.feed',
        '.timeline',
        '.results',
        '#results',
        'body',
      ].join(', '),
    });
    this.platformOverride = platform;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  override init(): void {
    super.init();
    // Run repeated-sibling discovery every 4 seconds to catch lazy-loaded content
    this.discoveryTimer = setInterval(() => this.discoverRepeatedSiblings(), 4000);
    // First run after a short delay
    setTimeout(() => this.discoverRepeatedSiblings(), 2000);
  }

  override destroy(): void {
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = null;
    }
    super.destroy();
  }

  // ── Card filter heuristic ─────────────────────────────────────────────────

  protected override onCardFound(element: Element): void {
    if (element.hasAttribute('data-recome-id')) return;

    // ── Tag-level exclusion ──────────────────────────────────────────────────
    const tag = element.tagName.toLowerCase();
    if (
      [
        'nav',
        'header',
        'footer',
        'aside',
        'form',
        'button',
        'input',
        'select',
        'label',
        'script',
        'style',
        'noscript',
        'svg',
        'img',
        'table',
        'thead',
        'tbody',
        'tr',
        'td',
        'th',
        'dl',
        'dt',
        'dd',
      ].includes(tag)
    )
      return;

    // ── Ancestor exclusion — skip anything inside excluded zones ─────────────
    if (element.closest(EXCLUDED_ANCESTOR_SELECTORS)) return;

    // ── Size gate ────────────────────────────────────────────────────────────
    const rect = element.getBoundingClientRect();
    // Too small = UI button/icon/badge
    if (rect.width < 150 || rect.height < 100) return;
    // Off-screen elements (not visible to user)
    if (rect.bottom < 0 || rect.top > window.innerHeight * 3) return;
    // Too large = page section wrapper (unless it's an article)
    if (
      tag !== 'article' &&
      rect.width > window.innerWidth * 0.95 &&
      rect.height > window.innerHeight * 1.5
    )
      return;

    // ── Content signals ──────────────────────────────────────────────────────
    const text = (element.textContent ?? '').trim();
    // Need meaningful text (not just "685 followers" or "Sign up")
    if (text.length < 40) return;

    const hasImage = !!element.querySelector('img[src], video, picture, [role="img"]');
    const hasHeading = !!element.querySelector('h1, h2, h3, h4, h5, h6');
    const links = element.querySelectorAll('a[href]');
    const hasSubstantialLink = Array.from(links).some(
      (l) => (l.textContent ?? '').trim().length > 15,
    );

    // Must have at least TWO content signals, or be a semantic article
    const signals = [hasImage, hasHeading, hasSubstantialLink].filter(Boolean).length;
    if (signals < 2 && tag !== 'article' && !element.matches('[role="article"]')) return;

    // ── Dedup: prefer the outermost card boundary ────────────────────────────
    if (element.parentElement?.hasAttribute('data-recome-id')) return;

    super.onCardFound(element);
  }

  // ── Repeated-sibling discovery ─────────────────────────────────────────────

  /**
   * Scans visible DOM for containers with 4+ similarly-structured children
   * that look like a content grid or feed list.
   */
  private discoverRepeatedSiblings(): void {
    const containers = document.querySelectorAll(
      'ul, ol, div[class], section, [role="list"], [role="feed"], main',
    );

    for (const container of containers) {
      if (this.discoveredContainers.has(container)) continue;

      // Skip containers inside excluded zones
      if (container.closest(EXCLUDED_ANCESTOR_SELECTORS)) continue;

      const bestGroup = findRepeatedSiblings(container, 4);
      if (bestGroup.length < 4) continue;

      // Validate: each sibling should have substantive content
      const validCount = bestGroup.filter((el) => {
        const hasMedia = !!el.querySelector('img[src], video, picture');
        const hasHeadingOrSubstantialLink =
          !!el.querySelector('h1, h2, h3, h4, h5, h6') ||
          Array.from(el.querySelectorAll('a[href]')).some(
            (l) => (l.textContent ?? '').trim().length > 15,
          );
        const textLen = (el.textContent ?? '').trim().length;
        const r = el.getBoundingClientRect();
        return (
          (hasMedia || hasHeadingOrSubstantialLink) &&
          textLen >= 30 &&
          r.width >= 120 &&
          r.height >= 80
        );
      }).length;

      // At least 70% of the group should look like content cards
      if (validCount < bestGroup.length * 0.7) continue;

      this.discoveredContainers.add(container);

      for (const child of bestGroup) {
        if (!child.hasAttribute('data-recome-id')) {
          super.onCardFound(child);
        }
      }
    }
  }

  // ── Metadata extraction ────────────────────────────────────────────────────

  extractMetadata(element: Element): ContentMetadata | null {
    try {
      let title = '';

      const headingEl = element.querySelector('h1, h2, h3, h4, h5, h6');
      if (headingEl) {
        title = extractTextContent(headingEl).trim();
      }

      if (!title) {
        const ariaEl = element.querySelector('[aria-label]:not([aria-label=""])');
        if (ariaEl) title = ariaEl.getAttribute('aria-label')!.trim();
      }

      if (!title) {
        const titleLink = element.querySelector('a[title]:not([title=""])');
        if (titleLink) title = titleLink.getAttribute('title')!.trim();
      }

      if (!title) {
        const links = element.querySelectorAll('a[href]');
        let best = '';
        links.forEach((l) => {
          const t = extractTextContent(l).trim();
          if (t.length > best.length && t.length < 200) best = t;
        });
        title = best;
      }

      if (!title) {
        const imgEl = element.querySelector('img[alt]:not([alt=""])') as HTMLImageElement | null;
        title = imgEl?.alt?.trim() ?? '';
      }

      if (!title || title.length < 5) return null;

      // Skip titles that are mostly numbers/stats (e.g. "154 following", "$29.99")
      const alphaChars = title.replace(/[^a-zA-Z]/g, '');
      if (alphaChars.length < 5) return null;

      const linkEl = element.querySelector('a[href]') as HTMLAnchorElement | null;
      const href = linkEl?.href ?? '';

      const creatorEl = element.querySelector(
        '[class*="author"], [class*="creator"], [class*="channel"], [class*="byline"], [class*="publisher"], [class*="source"], [rel="author"], cite',
      );
      const creator = creatorEl
        ? extractTextContent(creatorEl).trim().slice(0, 80) || undefined
        : undefined;

      const priceEl = element.querySelector(
        '[class*="price"], [data-price], [class*="cost"], .a-price',
      );
      const hasPrice = !!priceEl;
      const hasVideo = !!element.querySelector('video, [data-video], [class*="video-player"]');

      let type: ContentMetadata['type'] = 'post';
      if (hasPrice) type = 'product';
      else if (hasVideo) type = 'video';

      return {
        id: this.computeContentHash(element),
        platform: this.platformOverride,
        type,
        title: title.slice(0, 160),
        creator,
        topics: [],
        entities: creator ? [creator] : [],
        url: href || location.href,
      };
    } catch {
      return null;
    }
  }
}
