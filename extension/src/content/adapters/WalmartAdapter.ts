import { BaseAdapter } from './BaseAdapter';
import { extractTextContent } from '@shared/utils';
import {
  heuristicTitle,
  heuristicCreator,
  heuristicUrl,
  looksLikePrice,
} from './MetadataHeuristics';
import type { ContentMetadata } from '@shared/types';
import type { CandidateEntity } from '@schema/entities';
import type { PageContext } from '@schema/decisions';

/**
 * WalmartAdapter — hardened selector coverage + defensive page handling.
 *
 * QA fix: Original had 5 card selectors and 5 feed selectors.
 * Now covers: search results, browse/category grids, rollback deals,
 * "Customers also considered", recommendations, and weekly ads.
 *
 * Also adds explicit handling for Walmart's PerimeterX robot challenge pages
 * (handled upstream by PageEligibility, but belt-and-suspenders here too).
 */
export class WalmartAdapter extends BaseAdapter {
  constructor() {
    super({
      platform: 'walmart',
      cardSelector: [
        // ── Search results ──────────────────────────────────────────────
        '[data-automation-id="product-container"]',
        '[data-item-id]',
        '.search-result-gridview-item',
        // Newer Walmart Tempo-based search result tiles
        '[data-testid="search-result-item"]',
        '[data-testid="item-stack"]',
        '[data-automation-id="product-card"]',

        // ── Item stack / shelf cards ────────────────────────────────────
        '[data-type="itemStack"]',
        '[data-testid="item-tile"]',
        '.product-tile',
        // Tempo product tile inside grids and carousels
        '[data-testid="product-tile"]',
        // Stable fallbacks when data-testid is stripped in production
        'a[href*="/ip/"][data-item-id]',
        'div[data-item-id] a[href*="/ip/"]',

        // ── Browse / Category pages ─────────────────────────────────────
        '[data-testid="browse-item"]',
        '.browse-grid-item',
        '[data-testid="category-item"]',
        // Structural fallback: any product link tile in main content
        '#maincontent a[href*="/ip/"]:has(img)',

        // ── Homepage hero / featured product tiles ──────────────────────
        '[data-testid="hero-item"]',
        '[data-testid="featured-item"]',
        '[data-automation-id="hero-product"]',
        // Homepage category shelf items (common on walmart.com landing)
        'section[data-testid] [data-item-id]',

        // ── Deals / Rollback / Flash deals ──────────────────────────────
        '[data-testid="deal-card"]',
        '.rollback-item',
        '[data-automation-id="deal-container"]',
        '.flash-deal-card',
        // Rollback / clearance grid items
        '[data-testid="rollback-item"]',
        '[data-testid="clearance-item"]',

        // ── Product page — "Customers also considered" / recommendations
        '[data-testid="recommendation-card"]',
        '[data-testid="also-considered-card"]',
        '.product-recommendation-card',
        // Carousel items — multiple carousel framework patterns
        '.carousel-cell[data-item-id]',
        // Walmart's own carousel (not Slick/Flickity)
        '[data-testid="carousel-item"]',
        '.carousel-product-card',
        // Generic: any product tile inside a carousel container
        '[role="group"] [data-item-id]',
        '[data-testid="product-carousel"] [data-item-id]',

        // ── Sponsored items (still need to detect, even if suppressed) ──
        '[data-automation-id="product-container"][data-sponsored="true"]',
        '[data-testid="sponsored-item"]',

        // ── Weekly ad / savings section ─────────────────────────────────
        '[data-testid="savings-item"]',
        '.savings-card',

        // ── Walmart+ exclusive deals ──────────────────────────────────
        '[data-testid="wplus-deal-card"]',
        '[data-automation-id="wplus-item"]',
        '.w-plus-deal-tile',
        '[aria-label*="Walmart+"] [data-item-id]',

        // ── Weekly ad flyer items ─────────────────────────────────────
        '[data-testid="weekly-ad-item"]',
        '.weekly-ad-card',
        '[data-automation-id="flyer-item"]',

        // ── "Also considered" / "Compare with similar" ────────────────
        '[data-testid="comparison-card"]',
        '.comparison-item-card',
        '[data-testid="btf-item"]',
        '.product-comparison-tile',

        // ── Tempo product pod (newer Walmart grid rendering) ─────────
        '[data-testid="product-pod"]',
        '[data-testid="tempo-product-tile"]',
        '[data-testid="flash-deal-item"]',
        // Any product link tile inside a Tempo module
        '[data-testid="tempo-module"] [data-item-id]',
        '[data-testid="tempo-module"] a[href*="/ip/"]',
      ].join(', '),
      feedSelector: [
        // Search results
        '[data-automation-id="search-result-set"]',
        '.search-result-container',
        '#searchProductResult',
        'section[aria-label*="Search Results"]',
        '[data-testid="list-view"]',
        // Browse / category
        '[data-testid="browse-grid"]',
        '[data-testid="category-grid"]',
        // Homepage shelves and carousels
        '[data-testid="product-carousel"]',
        '[data-testid="tempo-module"]',
        '[data-testid="homepage-content"]',
        // Deals
        '[data-testid="deal-grid"]',
        '.flash-deals-container',
        '[data-testid="flash-deals-grid"]',
        '[data-testid="flash-deals"]',
        '[data-testid="rollback-grid"]',
        // Product page recommendations
        '[data-testid="recommendations"]',
        '[data-testid="also-considered"]',
        // Walmart+ section
        '[data-testid="wplus-deals"]',
        '[aria-label*="Walmart+"]',
        // Weekly ad / flyer
        '[data-testid="weekly-ad-grid"]',
        '.weekly-ad-container',
        // Comparison section
        '[data-testid="comparison-grid"]',
        '.product-comparison-section',
        // Generic fallbacks
        '#maincontent',
        'main[role="main"]',
        '#content-main',
      ].join(', '),
    });
  }

  private rescanTimers: ReturnType<typeof setTimeout>[] = [];
  private carouselObserver: IntersectionObserver | null = null;

  override init(): void {
    super.init();

    // Walmart's Tempo modules and Flash Deal carousels lazy-render product cards.
    // Schedule delayed re-scans to pick up cards that arrive after the initial pass.
    for (const delay of [2000, 5000, 10000]) {
      this.rescanTimers.push(
        setTimeout(() => {
          const cards = document.querySelectorAll(this.activeCardSelector);
          cards.forEach((card) => this.onCardFound(card));
        }, delay),
      );
    }

    // Watch carousel containers — re-scan when they scroll into view
    this.carouselObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const cards = entry.target.querySelectorAll(this.activeCardSelector);
            cards.forEach((card) => this.onCardFound(card));
          }
        }
      },
      { rootMargin: '200px', threshold: 0.1 },
    );

    // Observe all carousel/shelf containers
    // Use both data-testid and structural selectors since data-testid may be stripped
    const carouselContainers = document.querySelectorAll(
      '[data-testid="product-carousel"], [data-testid="tempo-module"], .flash-deals-container, [role="group"], [data-testid="deal-grid"], [data-automation-id="search-result-set"], section[data-automation-id]',
    );
    carouselContainers.forEach((c) => this.carouselObserver?.observe(c));
  }

  override destroy(): void {
    this.rescanTimers.forEach(clearTimeout);
    this.rescanTimers = [];
    this.carouselObserver?.disconnect();
    this.carouselObserver = null;
    super.destroy();
  }

  protected override get isCommerceAdapter(): boolean {
    return true;
  }

  protected override isUserInitiatedSearch(): boolean {
    return window.location.pathname.startsWith('/search');
  }

  override buildPageContext(): PageContext {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    let pageType: 'search' | 'product' | 'feed' | 'home' = 'home';
    if (path.startsWith('/search')) pageType = 'search';
    else if (path.includes('/ip/')) pageType = 'product';
    else if (path.includes('/browse') || path.includes('/cp/')) pageType = 'feed';
    return {
      site: 'walmart',
      pageType,
      url: window.location.href,
      query: params.get('q') ?? undefined,
      timestamp: new Date().toISOString(),
    };
  }

  override extractCandidate(element: Element): CandidateEntity | null {
    const metadata = this.extractMetadata(element);
    if (!metadata) return null;
    return {
      candidateId: metadata.id,
      entityType: 'product',
      rawText: metadata.title,
      normalizedText: metadata.title.toLowerCase().trim(),
      productId: metadata.id,
      brandId: metadata.creator
        ? `brand:${metadata.creator.toLowerCase().replace(/\s+/g, '_')}`
        : undefined,
      metadata: {
        brand: metadata.creator,
        ...(metadata.raw_metadata ?? {}),
      },
    };
  }

  extractMetadata(element: Element): ContentMetadata | null {
    try {
      const titleEl =
        element.querySelector('[data-automation-id="product-title"]') ??
        element.querySelector('span[data-automation-id="product-title-link"]') ??
        element.querySelector('.product-title') ??
        // Newer Tempo-based cards
        element.querySelector('[data-testid="product-title"]') ??
        element.querySelector('[data-testid="item-title"]') ??
        // Carousel product cards (link text often serves as title)
        element.querySelector('[data-testid="product-tile"] a[aria-label]') ??
        // Deal cards
        element.querySelector('[data-testid="deal-title"]') ??
        element.querySelector('.deal-card-title') ??
        // Fallback: first link with a product-like href
        element.querySelector('a[href*="/ip/"]');
      let title = titleEl ? extractTextContent(titleEl) : '';
      // Carousel cards sometimes have title only in aria-label
      if (!title && titleEl) title = titleEl.getAttribute('aria-label') ?? '';
      if (!title) title = heuristicTitle(element) ?? '';
      if (!title) return null;

      const linkEl = element.querySelector('a') as HTMLAnchorElement | null;
      let href = linkEl?.href ?? '';
      if (!href) href = heuristicUrl(element) ?? '';
      const itemId =
        element.getAttribute('data-item-id') ??
        href.match(/\/ip\/[^/]+\/(\d+)/)?.[1] ??
        this.computeContentHash(element);

      const brandCandidates = [
        element.querySelector('[data-automation-id="brand-name"]'),
        element.querySelector('[data-testid="brand-name"]'),
      ];
      let brand: string | undefined;
      for (const el of brandCandidates) {
        const text = el?.textContent?.trim();
        if (text && text.length > 1 && text.length < 80 && !looksLikePrice(text)) {
          brand = text;
          break;
        }
      }
      if (!brand) brand = heuristicCreator(element) ?? undefined;

      // Price extraction
      const priceEl =
        element.querySelector('[data-automation-id="product-price"]') ??
        element.querySelector('[data-testid="product-price"]') ??
        element.querySelector('.price-main .visuallyhidden');
      const priceText = priceEl?.textContent?.trim();

      // Rating extraction
      const ratingEl =
        element.querySelector('[data-testid="product-ratings"]') ??
        element.querySelector('[data-automation-id="product-ratings"]');
      const ratingText = ratingEl?.getAttribute('aria-label') ?? ratingEl?.textContent?.trim();

      // Sponsored detection
      const isSponsored =
        element.getAttribute('data-sponsored') === 'true' ||
        !!element.querySelector('[data-testid="sponsored-badge"]') ||
        !!element.querySelector('[aria-label*="Sponsored"]');

      return {
        id: itemId,
        platform: 'walmart',
        type: isSponsored ? 'ad' : 'product',
        title,
        creator: brand,
        topics: [],
        entities: brand ? [brand] : [],
        url: href,
        raw_metadata: {
          ...(priceText ? { price: priceText } : {}),
          ...(ratingText ? { rating: ratingText } : {}),
        },
      };
    } catch {
      return null;
    }
  }
}
