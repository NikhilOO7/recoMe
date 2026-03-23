import type { PlatformIntelligenceModule, PlatformProfile, RawOpportunity } from '../types';
import { safeText, safeTextAll, safeTextAny, safeAttr } from '../ProfileExtractor';

/**
 * WalmartIntelligence — value & household intelligence.
 *
 * Extracts: product details, pricing, rollback status, category.
 * Generates insights: weekly deals, seasonal suggestions, store comparison, new arrivals.
 */
export class WalmartIntelligence implements PlatformIntelligenceModule {
  readonly platform = 'walmart' as const;

  extractProfile(doc: Document): PlatformProfile | null {
    const pageType = this.detectPageType();

    const productTitle = safeTextAny(doc, [
      'h1[itemprop="name"]',
      'h1.prod-ProductTitle',
      'h1[data-automation-id="productTitle"]',
    ]);

    const price = safeTextAny(doc, [
      '[itemprop="price"]',
      'span[data-automation-id="product-price"] span',
      '.price-main .visuallyhidden',
    ]);

    const wasPrice = safeText(doc, '.price-old span, [data-automation-id="strikethrough-price"]');
    const savings = safeText(doc, '.price-savings, [data-automation-id="savings"]');

    const brand =
      safeAttr(doc, 'a[data-automation-id="product-brand-link"]', 'textContent') ||
      safeText(doc, '.prod-brandName a, [itemprop="brand"]');

    const rating =
      safeAttr(doc, '[itemprop="ratingValue"]', 'content') ||
      safeText(doc, '.stars-reviews-count span');

    const reviewCount =
      safeAttr(doc, '[itemprop="reviewCount"]', 'content') ||
      safeText(doc, '.stars-reviews-count-node');

    const breadcrumbs = safeTextAll(doc, 'nav[aria-label="breadcrumb"] a, .breadcrumb-list a');
    const category = breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 1] : '';

    const searchQuery = safeAttr(doc, 'input[name="q"]', 'value');

    const isRollback = !!doc.querySelector('[data-automation-id="rollback-badge"], .rollback-flag');

    return {
      platform: 'walmart',
      pageType,
      extractedAt: Date.now(),
      fields: {
        productTitle,
        price,
        wasPrice,
        savings,
        brand,
        rating,
        reviewCount,
        category,
        breadcrumbs,
        searchQuery,
        isRollback,
        pageType,
      },
    };
  }

  discoverOpportunities(profile: PlatformProfile, userInterests: string[]): RawOpportunity[] {
    const opportunities: RawOpportunity[] = [];
    const fields = profile.fields as {
      productTitle: string;
      price: string;
      wasPrice: string;
      savings: string;
      brand: string;
      rating: string;
      reviewCount: string;
      category: string;
      searchQuery: string;
      isRollback: boolean;
      pageType: string;
    };

    // Rollback deal alert
    if (fields.isRollback && fields.productTitle) {
      opportunities.push({
        title: `Rollback: ${fields.productTitle.slice(0, 50)}`,
        body: `This item is on rollback${fields.savings ? ` (save ${fields.savings})` : ''}. Rollback prices are temporary.`,
        benefit: 'Save on a temporary price reduction',
        type: 'deal',
        actionLabel: 'View deal',
        timeliness: 0.8,
        sourceSignals: [fields.productTitle, fields.category].filter(Boolean),
        platformContext: { isRollback: true, savings: fields.savings, price: fields.price },
      });
    }

    // Price comparison hint
    if (fields.price && fields.productTitle && fields.pageType === 'product') {
      opportunities.push({
        title: 'Compare this price across stores',
        body: `"${fields.productTitle.slice(0, 60)}" is ${fields.price}. Check if this is the best price across retailers.`,
        benefit: 'Ensure you get the best deal',
        type: 'deal',
        actionLabel: 'Compare prices',
        timeliness: 0.5,
        sourceSignals: [fields.productTitle, fields.brand].filter(Boolean),
        platformContext: { price: fields.price, wasPrice: fields.wasPrice },
      });
    }

    // Brand-based new arrivals
    if (
      fields.brand &&
      userInterests.some((i) => i.toLowerCase().includes(fields.brand.toLowerCase()))
    ) {
      opportunities.push({
        title: `New from ${fields.brand}`,
        body: `You're interested in ${fields.brand}. Check their latest arrivals and deals at Walmart.`,
        benefit: 'Stay updated on brands you like',
        type: 'content',
        actionLabel: 'View new arrivals',
        timeliness: 0.4,
        sourceSignals: [fields.brand],
        platformContext: { brand: fields.brand },
      });
    }

    // Seasonal suggestion based on category
    if (fields.category) {
      const seasonalCategories = [
        'garden',
        'patio',
        'outdoor',
        'grill',
        'pool',
        'holiday',
        'back to school',
        'spring',
      ];
      const isSeasonal = seasonalCategories.some((sc) =>
        fields.category.toLowerCase().includes(sc),
      );
      if (isSeasonal) {
        opportunities.push({
          title: `Seasonal deals in ${fields.category}`,
          body: `Seasonal items in ${fields.category} often see significant markdowns. Check the deals section.`,
          benefit: 'Save on seasonal purchases',
          type: 'deal',
          actionLabel: 'View seasonal deals',
          timeliness: 0.6,
          sourceSignals: [fields.category],
          platformContext: { category: fields.category, seasonal: true },
        });
      }
    }

    // Interest-matched product on search pages
    if (fields.pageType === 'search' && fields.searchQuery) {
      const matchedInterests = userInterests.filter((i) =>
        fields.searchQuery.toLowerCase().includes(i.toLowerCase()),
      );
      if (matchedInterests.length > 0) {
        opportunities.push({
          title: `Searching for something you care about`,
          body: `Your search for "${fields.searchQuery}" aligns with your interests. Filter by highest rated for best results.`,
          benefit: 'Find the best options quickly',
          type: 'content',
          actionLabel: 'Sort by rating',
          timeliness: 0.3,
          sourceSignals: [fields.searchQuery, ...matchedInterests],
          platformContext: { searchQuery: fields.searchQuery },
        });
      }
    }

    return opportunities;
  }

  private detectPageType(): string {
    const path = location.pathname;
    if (path.startsWith('/search')) return 'search';
    if (path.startsWith('/ip/')) return 'product';
    if (path.startsWith('/browse/')) return 'browse';
    if (path.startsWith('/cp/')) return 'category';
    if (path === '/' || path === '') return 'home';
    return 'other';
  }
}
