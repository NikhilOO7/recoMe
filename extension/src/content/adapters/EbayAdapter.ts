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
        // Stable fallback: any item link on deals pages
        'a[href*="/itm/"]:has(img)',

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
        // Stable: b-tile is the current primary tile class
        '.b-tile a[href*="/itm/"]',

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

  protected override get isCommerceAdapter(): boolean {
    return true;
  }

  protected override isUserInitiatedSearch(): boolean {
    return window.location.pathname.startsWith('/sch/');
  }

  override buildPageContext(): PageContext {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    let pageType: 'search' | 'product' | 'feed' | 'home' = 'home';
    if (path.startsWith('/sch/')) pageType = 'search';
    else if (path.startsWith('/itm/')) pageType = 'product';
    else if (path.includes('/deals') || path.includes('/e/')) pageType = 'feed';
    return {
      site: 'ebay',
      pageType,
      url: window.location.href,
      query: params.get('_nkw') ?? undefined,
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
      sellerId: metadata.creator
        ? `seller:${metadata.creator.toLowerCase().replace(/\s+/g, '_')}`
        : undefined,
      metadata: {
        seller: metadata.creator,
        ...(metadata.raw_metadata ?? {}),
      },
    };
  }

  /**
   * Build a collision-resistant hash for eBay items without an /itm/ ID.
   * Includes title, href, and price to distinguish similar listings.
   */
  private computeEbayHash(title: string, href: string, element: Element): string {
    const priceText =
      element.querySelector('.s-item__price, [class*="item__price"]')?.textContent?.trim() ?? '';
    const combined = `ebay:${title}|${href}|${priceText}`;
    let hash = 5381;
    for (let i = 0; i < combined.length; i++) {
      hash = ((hash << 5) + hash + combined.charCodeAt(i)) | 0;
    }
    return `ebay-${(hash >>> 0).toString(36)}`;
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
      // Use eBay item number when available; otherwise build a collision-resistant
      // hash from title + href + price to avoid false dedup across similar listings
      const id = itemMatch?.[1] ?? this.computeEbayHash(title, href, element);

      const sellerCandidates = [
        element.querySelector('.s-item__seller-info-text'),
        element.querySelector('[class*="seller"]'),
      ];
      let seller: string | undefined;
      for (const el of sellerCandidates) {
        const text = el?.textContent?.trim();
        if (text && text.length > 1 && text.length < 80 && !looksLikePrice(text)) {
          seller = text;
          break;
        }
      }
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

      // Auction vs. Buy It Now detection
      const biddingEl = element.querySelector('.s-item__bids, .s-item__bidCount, [class*="bid"]');
      const isAuction = !!biddingEl;
      const bidText = biddingEl?.textContent?.trim() ?? '';

      // Item condition (New, Used, Refurbished, etc.)
      const conditionEl = element.querySelector(
        '.s-item__subtitle .SECONDARY_INFO, .s-item__condition, [class*="condition"]',
      );
      const condition = conditionEl?.textContent?.trim() ?? '';

      // Shipping info
      const shippingEl = element.querySelector(
        '.s-item__shipping, .s-item__freeXDays, [class*="shipping"]',
      );
      const shipping = shippingEl?.textContent?.trim() ?? '';

      // Time left for auctions
      const timeLeftEl = element.querySelector('.s-item__time-left, .s-item__time-end');
      const timeLeft = timeLeftEl?.textContent?.trim() ?? '';

      return {
        id,
        platform: 'ebay',
        type: isSponsored ? 'ad' : 'product',
        title,
        creator: seller,
        topics: [],
        entities: [],
        url: href,
        raw_metadata: {
          ...(priceText ? { price: priceText } : {}),
          ...(isAuction ? { is_auction: true } : {}),
          ...(bidText ? { bids: bidText } : {}),
          ...(condition ? { condition } : {}),
          ...(shipping ? { shipping } : {}),
          ...(timeLeft ? { time_left: timeLeft } : {}),
        },
      };
    } catch {
      return null;
    }
  }
}
