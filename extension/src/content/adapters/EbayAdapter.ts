import { BaseAdapter } from './BaseAdapter';
import { extractTextContent } from '@shared/utils';
import { heuristicTitle, heuristicCreator, heuristicUrl } from './MetadataHeuristics';
import type { ContentMetadata } from '@shared/types';

/**
 * EbayAdapter — hardened selector coverage.
 *
 * QA fix: Original had only 3 card selectors and 5 feed selectors.
 * Now covers: search results, daily deals, category browse, saved searches,
 * "More from seller", recommendations, and "Recently viewed".
 */
export class EbayAdapter extends BaseAdapter {
  constructor() {
    super({
      platform: 'ebay',
      cardSelector: [
        // ── Search results ──────────────────────────────────────────────
        '.s-item:not(.s-item--placeholder)',
        '.s-item--sponsored',
        // Newer search result cards (2024+ eBay redesign)
        '.s-item__wrapper',
        'li.s-item',
        // Gallery view items
        '.s-item[data-view="gallery"]',

        // ── Category browse & Hub pages ─────────────────────────────────
        '.b-tile',
        '.b-list__items_nofooter li',
        '.b-visualnav__item',
        '.carousel__snap-point',

        // ── Daily Deals ─────────────────────────────────────────────────
        '[data-testid="x-deal-card"]',
        '.dne-itemtile',
        '.dne-itemtile-detail',
        '.ebayui-dne-featured-card',
        '.deal-tile',

        // ── "More items from this seller" / shop page ───────────────────
        '.str-item-card',
        '[data-testid="item-card"]',
        '.smtTile',

        // ── Recommendations / "Recently viewed" / "Items you may like" ──
        '.vlp-merch-item-tile',
        '.recom-item',
        '.saved-search-item',
        '.merch-item',
        '[data-testid="merch-card"]',

        // ── Watchlist ───────────────────────────────────────────────────
        '.watchlist-item',
        '.m-item-card',

        // ── Product detail page — similar items sidebar ─────────────────
        '.vi-similar-items .s-item',
        '#vi-VR-list .s-item',
      ].join(', '),
      feedSelector: [
        // Search results containers
        '.srp-results',
        '#ResultSetItems',
        '.b-list__items_nofooter',
        '.srp-river-main',
        '.srp-river-results',
        // Daily deals
        '#DailyDealsContent',
        '.ebayui-dne-featured-with-padding',
        '[data-testid="deals-container"]',
        // Category pages
        '.b-tile-list',
        '.b-visualnav__tiles',
        // Recommendations
        '.vlp-merch__items',
        '.recom-collection',
        '[data-testid="merch-container"]',
        // Seller shop
        '.str-item-card-list',
        // Fallback
        '#mainContent',
        '#srp-river-results',
      ].join(', '),
    });
  }

  protected override isUserInitiatedSearch(): boolean {
    return window.location.pathname.startsWith('/sch/');
  }

  extractMetadata(element: Element): ContentMetadata | null {
    try {
      const titleEl =
        element.querySelector('.s-item__title') ??
        element.querySelector('h3.s-item__title') ??
        element.querySelector('[class*="item__title"]') ??
        // Daily deals / merch cards
        element.querySelector('.dne-itemtile-title') ??
        element.querySelector('[data-testid="item-title"]') ??
        element.querySelector('.vlp-merch-item-title') ??
        element.querySelector('.str-item-card__title');
      let title = titleEl ? extractTextContent(titleEl) : '';
      if (!title) title = heuristicTitle(element) ?? '';
      if (!title || title === 'Shop on eBay' || title === 'New Listing') return null;

      const linkEl = (element.querySelector('a.s-item__link') ??
        element.querySelector('a[href*="/itm/"]') ??
        element.querySelector('a[href*="ebay.com/itm"]')) as HTMLAnchorElement | null;
      let href = linkEl?.href ?? '';
      if (!href) href = heuristicUrl(element) ?? '';
      const itemMatch = href.match(/\/itm\/(\d+)/);
      const id = itemMatch?.[1] ?? this.computeContentHash(element);

      let seller =
        element.querySelector('.s-item__seller-info-text')?.textContent?.trim() ??
        element.querySelector('[class*="seller"]')?.textContent?.trim();
      if (!seller) seller = heuristicCreator(element) ?? undefined;

      // Price extraction for better metadata
      const priceEl =
        element.querySelector('.s-item__price') ??
        element.querySelector('.dne-itemtile-price') ??
        element.querySelector('[class*="item__price"]');
      const priceText = priceEl?.textContent?.trim();

      const isSponsored =
        element.classList.contains('s-item--sponsored') ||
        !!element.querySelector('[aria-label*="Sponsored"]') ||
        !!element.querySelector('.s-item__sep-sponsored');

      return {
        id,
        platform: 'ebay',
        type: isSponsored ? 'ad' : 'product',
        title,
        creator: seller,
        topics: [],
        entities: [],
        url: href,
        raw_metadata: priceText ? { price: priceText } : undefined,
      };
    } catch {
      return null;
    }
  }
}
