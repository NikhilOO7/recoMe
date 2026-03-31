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

export type AmazonPageType = 'search' | 'product' | 'feed' | 'home' | 'deals' | 'unknown';

// ── Page-type-specific selectors ──────────────────────────────────────────────
// QA fix: Two-step detection — classify page type FIRST, then use only relevant
// selectors. Reduces false positives and improves hit rate on each surface.

const SEARCH_CARD_SELECTORS = [
  // Data-attribute selectors (most resilient to DOM class-name churn)
  '[data-component-type="s-search-result"]',
  '[data-component-type="s-impression-counter"]',
  '[data-cel-widget^="search_result_"]',
  '[cel_widget_id^="MAIN-SEARCH_RESULTS-"]',
  // ASIN-based fallback — Amazon's ASIN data attribute is extremely stable
  'div[data-asin]:not([data-asin=""]):not(.AdHolder)',
  '.s-result-item[data-asin]:not(.AdHolder)',
];

const PRODUCT_PAGE_CARD_SELECTORS = [
  // ASIN-based selectors (most resilient — Amazon's ASIN system is permanent)
  'li[data-asin]:not([data-asin=""])',
  '.a-carousel-card[data-asin]',
  // Data-attribute selectors (stable across redesigns)
  '[data-csa-c-item-id]',
  '[data-csa-c-type="item"]',
  '[data-comparison-table-row]',
  // ID-based selectors (Amazon keeps widget IDs stable for analytics)
  '#anonCarousel1 .a-carousel-card',
  '#anonCarousel2 .a-carousel-card',
  '#sp-cc .a-carousel-card',
  '#rhf .a-carousel-card',
  '#similarities_feature_div .a-carousel-card',
  '#day0-btf-recommendations .a-carousel-card',
  // Class-based (least resilient — keep as last resort)
  'div.comparison_table_image_row div.a-section',
];

const BESTSELLER_CARD_SELECTORS = [
  'li.zg-item-immersion',
  'div.p13n-sc-uncoverable-faceout',
  '[class*="zg-item"]',
  '.zg-grid-general-faceout',
  // New releases / movers & shakers share the same structure
  '#gridItemRoot',
];

const HOMEPAGE_CARD_SELECTORS = [
  // Homepage recommendation tiles & cards
  '.a-cardui-content[data-asin]',
  '.a-cardui[data-asin]',
  '.feed-carousel-card',
  '.rhf-card',
  '.feed-card',
  '.octopus-pc-category-card-v2',
  // Homepage grid items (deals, browsing history)
  '[data-component-type="s-personalize-widget"] .a-carousel-card',
  // "Keep shopping for" / "Inspired by your browsing history"
  'div[data-a-carousel-options] .a-carousel-card',
  // Hero deal cards
  '.deals-shoveler .a-section[data-deal-id]',
  'div.DealContent-module_dealContainer__mask',
];

const DEALS_CARD_SELECTORS = [
  // Deal cards on /deals and /gp/goldbox
  '[data-deal-id]',
  '.dealTile',
  '.octopus-dlp-asin-section',
  '.DealCard-module_card__container',
  // Lightning deals grid
  '.a-section.octopus-dlp-asin-section',
  '.inlineBlock-module_wrapper',
];

const SEARCH_FEED_SELECTORS = [
  '[data-component-type="s-search-results"]',
  '.s-main-slot',
  '#search',
];

const PRODUCT_FEED_SELECTORS = [
  '#similarities_feature_div',
  '#sp-cc',
  '#rhf',
  '#dp-container',
  '#dp',
  '#centerCol',
];

const BESTSELLER_FEED_SELECTORS = ['#zg-ordered-list', '.p13n-desktop-grid', '#zg-right-col'];

const HOMEPAGE_FEED_SELECTORS = [
  '#desktop-grid-1',
  '#desktop-grid-2',
  '#desktop-grid-3',
  '[data-component-type="s-personalize-widget"]',
  '#rhf-container',
  '#shoveler-container',
  '.feed-carousel',
  '#main-content',
];

const DEALS_FEED_SELECTORS = [
  '#dealsGrid',
  '#octopus-dlp-content-grid',
  '.deals-shoveler',
  '#slot-15',
  '#main-content',
];

export class AmazonAdapter extends BaseAdapter {
  constructor() {
    // Start with all selectors combined — page-type narrowing happens in init override
    super({
      platform: 'amazon',
      cardSelector: [
        ...SEARCH_CARD_SELECTORS,
        ...PRODUCT_PAGE_CARD_SELECTORS,
        ...BESTSELLER_CARD_SELECTORS,
        ...HOMEPAGE_CARD_SELECTORS,
        ...DEALS_CARD_SELECTORS,
      ]
        .filter((s, i, arr) => arr.indexOf(s) === i) // dedupe
        .join(', '),
      feedSelector: [
        ...SEARCH_FEED_SELECTORS,
        ...PRODUCT_FEED_SELECTORS,
        ...BESTSELLER_FEED_SELECTORS,
        ...HOMEPAGE_FEED_SELECTORS,
        ...DEALS_FEED_SELECTORS,
      ]
        .filter((s, i, arr) => arr.indexOf(s) === i)
        .join(', '),
    });
  }

  /**
   * Two-step detection override: narrow selectors to page type before init.
   * QA fix: prevents wasted selector queries and reduces false positives.
   */
  override init(): void {
    const pageType = this.detectPageType();
    const { cards, feeds } = this.getPageTypeSelectors(pageType);

    // Narrow the active selectors to this page type (with fallback to all)
    if (cards.length > 0) {
      this.narrowSelectors(cards.join(', '), feeds.join(', '));
    }

    super.init();
  }

  protected override get isCommerceAdapter(): boolean {
    return true;
  }

  protected override isUserInitiatedSearch(): boolean {
    return this.detectPageType() === 'search';
  }

  // ── Page Type Detection ─────────────────────────────────────────────────

  detectPageType(): AmazonPageType {
    const path = window.location.pathname;
    if (path === '/' || path === '/ref=nav_logo' || path.startsWith('/ref=')) return 'home';
    if (path.startsWith('/s') || path.includes('/s?')) return 'search';
    if (path.includes('/dp/') || path.includes('/gp/product/')) return 'product';
    if (path.includes('/deals') || path.includes('/gp/goldbox') || path.includes('/gp/anytime'))
      return 'deals';
    if (
      path.includes('/bestsellers') ||
      path.includes('/zgbs') ||
      path.includes('/gp/new-releases') ||
      path.includes('/gp/movers-and-shakers')
    )
      return 'feed';
    return 'unknown';
  }

  private getPageTypeSelectors(pageType: AmazonPageType): { cards: string[]; feeds: string[] } {
    switch (pageType) {
      case 'search':
        return { cards: SEARCH_CARD_SELECTORS, feeds: SEARCH_FEED_SELECTORS };
      case 'product':
        return { cards: PRODUCT_PAGE_CARD_SELECTORS, feeds: PRODUCT_FEED_SELECTORS };
      case 'feed':
        return { cards: BESTSELLER_CARD_SELECTORS, feeds: BESTSELLER_FEED_SELECTORS };
      case 'deals':
        return { cards: DEALS_CARD_SELECTORS, feeds: DEALS_FEED_SELECTORS };
      case 'home':
        return { cards: HOMEPAGE_CARD_SELECTORS, feeds: HOMEPAGE_FEED_SELECTORS };
      default:
        // Unknown — use all selectors
        return { cards: [], feeds: [] };
    }
  }

  /** Narrow active selectors to a page-type-specific subset */
  private narrowSelectors(cardSelector: string, feedSelector: string): void {
    this.activeCardSelector = cardSelector;
    this.activeFeedSelector = feedSelector;
  }

  override buildPageContext(): PageContext {
    const pageType = this.detectPageType();
    const params = new URLSearchParams(window.location.search);
    // Map Amazon-specific page types to the PageContext union
    const contextPageType = pageType === 'deals' ? 'feed' : pageType;
    return {
      site: 'amazon',
      pageType: contextPageType,
      url: window.location.href,
      query: params.get('k') ?? params.get('field-keywords') ?? undefined,
      categoryPath: this.extractCategoryPath(),
      timestamp: new Date().toISOString(),
    };
  }

  // ── Rich Commerce Extraction ────────────────────────────────────────────

  extractMetadata(element: Element): ContentMetadata | null {
    try {
      const asin = this.extractAsin(element);
      let title = this.extractTitle(element) || this.extractHomepageCardTitle(element);
      if (!title) title = heuristicTitle(element) ?? '';
      if (!title) return null;

      const id = asin || `amz-${title.slice(0, 40).replace(/\W+/g, '_').toLowerCase()}`;
      let href = this.extractHref(element);
      if (!href) href = heuristicUrl(element) ?? '';
      let brand = this.extractBrand(element);
      if (!brand) brand = heuristicCreator(element) ?? undefined;

      return {
        id,
        platform: 'amazon',
        type: 'product',
        title,
        creator: brand,
        topics: [],
        entities: brand ? [brand] : [],
        url: href,
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract rich commerce data as a CandidateEntity for brain scoring.
   * Extracts price, rating, seller, categories beyond what extractMetadata provides.
   */
  override extractCandidate(element: Element): CandidateEntity | null {
    try {
      const asin = this.extractAsin(element);
      if (!asin) return null;

      const title = this.extractTitle(element);
      if (!title) return null;

      const brand = this.extractBrand(element);
      const price = this.extractPrice(element);
      const rating = this.extractRating(element);
      const reviewCount = this.extractReviewCount(element);
      const seller = this.extractSeller(element);

      return {
        candidateId: asin,
        entityType: 'product',
        rawText: title,
        normalizedText: title.toLowerCase().trim(),
        productId: asin,
        brandId: brand ? `brand:${brand.toLowerCase().replace(/\s+/g, '_')}` : undefined,
        sellerId: seller ? `seller:${seller.toLowerCase().replace(/\s+/g, '_')}` : undefined,
        metadata: {
          price,
          rating,
          reviewCount,
          brand,
          seller,
          asin,
          url: this.extractHref(element),
          isPrime: this.hasPrimeBadge(element),
          availability: this.extractAvailability(element),
        },
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract full PDP (Product Detail Page) candidate from the main product content.
   */
  extractPdpCandidate(): CandidateEntity | null {
    try {
      const asin = this.extractPdpAsin();
      if (!asin) return null;

      const title = document.querySelector('#productTitle')?.textContent?.trim() ?? '';
      if (!title) return null;

      const brand =
        document
          .querySelector('#bylineInfo')
          ?.textContent?.trim()
          ?.replace(/^(Visit the |Brand: )/, '') ??
        document.querySelector('#brand')?.textContent?.trim() ??
        undefined;

      const priceWhole =
        document.querySelector('.a-price .a-price-whole')?.textContent?.replace(/[^0-9]/g, '') ??
        '';
      const priceFraction =
        document.querySelector('.a-price .a-price-fraction')?.textContent?.replace(/[^0-9]/g, '') ??
        '00';
      const price = priceWhole ? parseFloat(`${priceWhole}.${priceFraction}`) : undefined;

      const ratingText =
        document.querySelector('#acrPopover .a-icon-alt')?.textContent?.trim() ?? '';
      const rating = ratingText ? parseFloat(ratingText) : undefined;

      const reviewText =
        document.querySelector('#acrCustomerReviewText')?.textContent?.trim() ?? '';
      const reviewCount = reviewText ? parseInt(reviewText.replace(/[^0-9]/g, ''), 10) : undefined;

      const seller =
        document.querySelector('#sellerProfileTriggerId')?.textContent?.trim() ??
        document.querySelector('#merchant-info')?.textContent?.trim() ??
        undefined;

      const categoryEls = document.querySelectorAll('#wayfinding-breadcrumbs_feature_div a');
      const categoryIds = Array.from(categoryEls)
        .map((el) => el.textContent?.trim() ?? '')
        .filter(Boolean);

      const availability =
        document.querySelector('#availability span')?.textContent?.trim() ?? undefined;

      return {
        candidateId: asin,
        entityType: 'product',
        rawText: title,
        normalizedText: title.toLowerCase().trim(),
        productId: asin,
        brandId: brand ? `brand:${brand.toLowerCase().replace(/\s+/g, '_')}` : undefined,
        sellerId: seller ? `seller:${seller.toLowerCase().replace(/\s+/g, '_')}` : undefined,
        metadata: {
          price,
          rating,
          reviewCount,
          brand,
          seller,
          asin,
          url: window.location.href,
          isPrime: !!document.querySelector(
            '#priceBadging_feature_div .a-icon-prime, #price .a-icon-prime',
          ),
          availability,
          categoryIds,
          isPdp: true,
        },
      };
    } catch {
      return null;
    }
  }

  // ── Private Extraction Helpers ──────────────────────────────────────────

  private extractAsin(element: Element): string {
    let asin =
      element.getAttribute('data-asin') ?? element.getAttribute('data-csa-c-item-id') ?? '';

    if (!asin) {
      const dpLink = element.querySelector('a[href*="/dp/"]') as HTMLAnchorElement | null;
      const match = dpLink?.href.match(/\/dp\/([A-Z0-9]{10})/);
      asin = match?.[1] ?? '';
    }

    // Also try cel_widget_id which contains ASIN in newer layouts
    if (!asin) {
      const widgetId = element.getAttribute('cel_widget_id') ?? '';
      const celMatch = widgetId.match(/([A-Z0-9]{10})/);
      asin = celMatch?.[1] ?? '';
    }

    return asin;
  }

  private extractPdpAsin(): string {
    // From URL
    const urlMatch = window.location.pathname.match(/\/dp\/([A-Z0-9]{10})/);
    if (urlMatch?.[1]) return urlMatch[1];
    // From hidden input
    const input = document.querySelector('input[name="ASIN"]') as HTMLInputElement | null;
    return input?.value ?? '';
  }

  private extractTitle(element: Element): string {
    const titleEl =
      element.querySelector('h2 .a-link-normal') ??
      element.querySelector('h2 a') ??
      element.querySelector('.p13n-sc-truncate-desktop-type2') ??
      element.querySelector('.p13n-sc-truncate') ??
      element.querySelector('._cDEzb_p13n-sc-css-line-clamp-3_g3dy1') ??
      element.querySelector('.a-size-medium.a-color-base.a-text-normal') ??
      element.querySelector('.a-size-base-plus.a-color-base.a-text-normal') ??
      // Deal cards and comparison table
      element.querySelector('.a-size-medium.a-text-normal') ??
      element.querySelector('[data-deal-id] .a-size-base') ??
      element.querySelector('a[title]');
    return titleEl ? extractTextContent(titleEl) || titleEl.getAttribute('title') || '' : '';
  }

  private extractHref(element: Element): string {
    return (
      (element.querySelector('a[href*="/dp/"]') as HTMLAnchorElement | null)?.href ??
      (element.querySelector('h2 a') as HTMLAnchorElement | null)?.href ??
      (element.querySelector('a.a-link-normal') as HTMLAnchorElement | null)?.href ??
      ''
    );
  }

  private extractBrand(element: Element): string | undefined {
    const candidates = [
      element.querySelector('.a-size-base-plus.a-color-secondary'),
      element.querySelector('[data-a-color="secondary"] span'),
      element.querySelector('.p13n-sc-brand'),
      element.querySelector('.a-row.a-size-small span:nth-child(2)'),
    ];

    for (const el of candidates) {
      const text = el?.textContent?.trim();
      if (text && text.length > 1 && text.length < 80 && !looksLikePrice(text)) {
        return text;
      }
    }
    return undefined;
  }

  private extractPrice(element: Element): number | undefined {
    // Whole price + fraction (structured elements — locale-independent)
    const wholeEl = element.querySelector('.a-price .a-price-whole');
    const fracEl = element.querySelector('.a-price .a-price-fraction');
    if (wholeEl) {
      const whole = wholeEl.textContent?.replace(/[^0-9]/g, '') ?? '';
      const frac = fracEl?.textContent?.replace(/[^0-9]/g, '') ?? '00';
      return parseFloat(`${whole}.${frac}`);
    }
    // Offscreen or text price — handle US ($1,299.99) and EU (€1.299,99 / €278,50)
    const priceText =
      element.querySelector('.a-price .a-offscreen')?.textContent?.trim() ??
      element.querySelector('.a-color-price')?.textContent?.trim();
    if (priceText) {
      return this.parseLocalizedPrice(priceText);
    }
    return undefined;
  }

  /** Parse a price string in any common locale format to a float. */
  private parseLocalizedPrice(text: string): number | undefined {
    // Strip currency symbols and whitespace, keep digits and separators
    const cleaned = text.replace(/[^\d.,]/g, '').trim();
    if (!cleaned) return undefined;

    // Detect format by last separator position
    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');

    let result: number;
    if (lastComma > lastDot) {
      // EU format: 1.299,99 or 278,50 — comma is decimal separator
      result = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
    } else {
      // US format: 1,299.99 — dot is decimal separator (or no decimal)
      result = parseFloat(cleaned.replace(/,/g, ''));
    }
    return isNaN(result) ? undefined : result;
  }

  private extractRating(element: Element): number | undefined {
    const ratingEl = element.querySelector(
      '.a-icon-star-small .a-icon-alt, .a-icon-star .a-icon-alt',
    );
    const text = ratingEl?.textContent?.trim() ?? '';
    const match = text.match(/([\d.]+)\s+out\s+of/);
    if (match) return parseFloat(match[1]!);

    // Best sellers star format
    const starEl = element.querySelector('[class*="a-star-"]');
    if (starEl) {
      const cls = starEl.className;
      const starMatch = cls.match(/a-star-(?:small-)?(\d)-?(\d)?/);
      if (starMatch) {
        return parseFloat(`${starMatch[1]}.${starMatch[2] ?? '0'}`);
      }
    }
    return undefined;
  }

  private extractReviewCount(element: Element): number | undefined {
    const countEl =
      element.querySelector('.a-size-small .a-link-normal .a-size-base') ??
      element.querySelector('[data-csa-c-slot-id="alf-reviews"] .a-size-base') ??
      element.querySelector('.a-size-small .a-size-base');
    const text = countEl?.textContent?.trim() ?? '';
    if (text) {
      const num = parseInt(text.replace(/[^0-9]/g, ''), 10);
      return isNaN(num) ? undefined : num;
    }
    return undefined;
  }

  private extractSeller(element: Element): string | undefined {
    // Search results sometimes show "by SELLER" below price
    const soldBy = element
      .querySelector('.a-size-small.a-color-secondary .a-size-small')
      ?.textContent?.trim();
    if (soldBy && soldBy.length > 1 && soldBy.length < 60) return soldBy;
    return undefined;
  }

  private hasPrimeBadge(element: Element): boolean {
    return !!element.querySelector('.a-icon-prime, [data-component-type="s-prime-badge"]');
  }

  private extractAvailability(element: Element): string | undefined {
    const text = element
      .querySelector('.a-color-availability, .s-align-children-center .a-color-price')
      ?.textContent?.trim();
    return text || undefined;
  }

  private extractHomepageCardTitle(element: Element): string {
    // Homepage promo/category cards use headings or bold text
    const heading = element.querySelector(
      'h2, h3, .a-size-medium-plus, .a-text-bold, [class*="headline"]',
    );
    return heading?.textContent?.trim() ?? '';
  }

  private extractCategoryPath(): string[] | undefined {
    const breadcrumbs = document.querySelectorAll(
      '#wayfinding-breadcrumbs_feature_div a, .a-breadcrumb a',
    );
    if (breadcrumbs.length === 0) return undefined;
    return Array.from(breadcrumbs)
      .map((el) => el.textContent?.trim() ?? '')
      .filter(Boolean);
  }
}
