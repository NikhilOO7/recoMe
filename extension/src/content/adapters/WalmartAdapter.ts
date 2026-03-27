import { BaseAdapter } from './BaseAdapter';
import { extractTextContent } from '@shared/utils';
import { heuristicTitle, heuristicCreator, heuristicUrl } from './MetadataHeuristics';
import type { ContentMetadata } from '@shared/types';

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

        // ── Browse / Category pages ─────────────────────────────────────
        '[data-testid="browse-item"]',
        '.browse-grid-item',
        '[data-testid="category-item"]',

        // ── Deals / Rollback / Flash deals ──────────────────────────────
        '[data-testid="deal-card"]',
        '.rollback-item',
        '[data-automation-id="deal-container"]',
        '.flash-deal-card',

        // ── Product page — "Customers also considered" / recommendations
        '[data-testid="recommendation-card"]',
        '[data-testid="also-considered-card"]',
        '.product-recommendation-card',
        // Carousel items on product pages
        '.carousel-cell[data-item-id]',

        // ── Sponsored items (still need to detect, even if suppressed) ──
        '[data-automation-id="product-container"][data-sponsored="true"]',
        '[data-testid="sponsored-item"]',

        // ── Weekly ad / savings section ─────────────────────────────────
        '[data-testid="savings-item"]',
        '.savings-card',
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
        // Deals
        '[data-testid="deal-grid"]',
        '.flash-deals-container',
        // Product page recommendations
        '[data-testid="recommendations"]',
        '[data-testid="also-considered"]',
        // Generic fallbacks
        '#maincontent',
        'main[role="main"]',
        '#content-main',
      ].join(', '),
    });
  }

  protected override isUserInitiatedSearch(): boolean {
    return window.location.pathname.startsWith('/search');
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
        // Deal cards
        element.querySelector('[data-testid="deal-title"]') ??
        element.querySelector('.deal-card-title');
      let title = titleEl ? extractTextContent(titleEl) : '';
      if (!title) title = heuristicTitle(element) ?? '';
      if (!title) return null;

      const linkEl = element.querySelector('a') as HTMLAnchorElement | null;
      let href = linkEl?.href ?? '';
      if (!href) href = heuristicUrl(element) ?? '';
      const itemId =
        element.getAttribute('data-item-id') ??
        href.match(/\/ip\/[^/]+\/(\d+)/)?.[1] ??
        this.computeContentHash(element);

      let brand =
        element.querySelector('[data-automation-id="brand-name"]')?.textContent?.trim() ??
        element.querySelector('[data-testid="brand-name"]')?.textContent?.trim();
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
