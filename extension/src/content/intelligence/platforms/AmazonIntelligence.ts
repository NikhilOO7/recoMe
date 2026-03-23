import type { PlatformIntelligenceModule, PlatformProfile, RawOpportunity } from '../types';
import { safeText, safeTextAll, safeAttr } from '../ProfileExtractor';

/**
 * AmazonIntelligence — shopping intelligence.
 *
 * Extracts: product title, price, category, brand, rating.
 * Generates insights: best-value picks, price analysis, accessories, decision helpers.
 */
export class AmazonIntelligence implements PlatformIntelligenceModule {
  readonly platform = 'amazon' as const;

  extractProfile(doc: Document): PlatformProfile | null {
    const pageType = this.detectPageType();

    const productTitle = safeText(doc, '#productTitle');
    const price = safeText(doc, '.a-price .a-offscreen, #priceblock_ourprice, .a-price-whole');
    const brand = safeText(doc, '#bylineInfo, .product-by-line a, a#bylineInfo');
    const rating =
      safeAttr(doc, '#acrPopover', 'title') || safeText(doc, '#acrPopover .a-icon-alt');
    const reviewCount = safeText(doc, '#acrCustomerReviewText');
    const category = safeText(doc, '#wayfinding-breadcrumbs_container li:last-child a');
    const breadcrumbs = safeTextAll(doc, '#wayfinding-breadcrumbs_container a');

    // Detect comparison shopping behavior
    const isSearchPage = pageType === 'search';
    const searchQuery = isSearchPage ? (new URLSearchParams(location.search).get('k') ?? '') : '';

    return {
      platform: 'amazon',
      pageType,
      extractedAt: Date.now(),
      fields: {
        productTitle,
        price,
        brand,
        rating,
        reviewCount,
        category,
        breadcrumbs,
        searchQuery,
        pageType,
      },
    };
  }

  discoverOpportunities(profile: PlatformProfile, userInterests: string[]): RawOpportunity[] {
    const opportunities: RawOpportunity[] = [];
    const fields = profile.fields as {
      productTitle: string;
      price: string;
      brand: string;
      rating: string;
      reviewCount: string;
      category: string;
      breadcrumbs: string[];
      searchQuery: string;
      pageType: string;
    };

    // Product page insights
    if (fields.pageType === 'product' && fields.productTitle) {
      // Price analysis
      if (fields.price) {
        opportunities.push({
          title: `Price analysis for ${this.truncate(fields.productTitle, 50)}`,
          body: `Current price: ${fields.price}. Want to know if this is a good deal or if you should wait?`,
          benefit: 'Make an informed purchase decision',
          type: 'deal',
          actionLabel: 'Analyze price',
          timeliness: 0.6,
          sourceSignals: [fields.category, fields.brand].filter(Boolean),
          platformContext: {
            product: fields.productTitle,
            price: fields.price,
            brand: fields.brand,
          },
        });
      }

      // Review summary
      if (fields.reviewCount) {
        opportunities.push({
          title: `Review highlights for ${this.truncate(fields.productTitle, 40)}`,
          body: `${fields.rating ?? 'Rated'} with ${fields.reviewCount}. Key themes from reviews can help you decide.`,
          benefit: 'Understand what buyers love and hate',
          type: 'content',
          actionLabel: 'See highlights',
          timeliness: 0.4,
          sourceSignals: [fields.brand, fields.category].filter(Boolean),
          platformContext: { rating: fields.rating, reviews: fields.reviewCount },
        });
      }

      // Alternatives suggestion
      if (fields.category) {
        opportunities.push({
          title: `Alternatives in ${fields.category}`,
          body: `See how this compares to similar products. There might be better value options.`,
          benefit: 'Find the best product for your budget',
          type: 'deal',
          actionLabel: 'Compare alternatives',
          timeliness: 0.3,
          sourceSignals: [fields.category, ...userInterests.slice(0, 3)],
          platformContext: { category: fields.category, currentBrand: fields.brand },
        });
      }
    }

    // Search page insights
    if (fields.pageType === 'search' && fields.searchQuery) {
      opportunities.push({
        title: `Smart comparison for "${this.truncate(fields.searchQuery, 40)}"`,
        body: `You're researching ${fields.searchQuery}. Want me to compare the top options side by side?`,
        benefit: 'Save time with a structured comparison',
        type: 'deal',
        actionLabel: 'Compare top picks',
        timeliness: 0.5,
        sourceSignals: [fields.searchQuery, ...userInterests.slice(0, 2)],
        platformContext: { query: fields.searchQuery },
      });
    }

    // Cross-platform interest connection
    if (userInterests.length > 0 && fields.category) {
      const relatedInterest = userInterests.find(
        (i) =>
          fields.category.toLowerCase().includes(i.toLowerCase()) ||
          fields.breadcrumbs.some((b) => b.toLowerCase().includes(i.toLowerCase())),
      );

      if (relatedInterest) {
        opportunities.push({
          title: `Based on your interest in ${relatedInterest}`,
          body: `Your browsing history shows interest in ${relatedInterest}. Here are curated picks you might have missed.`,
          benefit: 'Discover products aligned with your interests',
          type: 'content',
          actionLabel: 'See picks',
          timeliness: 0.3,
          sourceSignals: [relatedInterest, fields.category],
          platformContext: { interest: relatedInterest, category: fields.category },
        });
      }
    }

    return opportunities;
  }

  private detectPageType(): string {
    const path = location.pathname;
    if (path.startsWith('/dp/') || path.startsWith('/gp/product/')) return 'product';
    if (path.startsWith('/s')) return 'search';
    if (path.startsWith('/gp/yourstore') || path.startsWith('/gp/history')) return 'history';
    if (path.startsWith('/hz/wishlist')) return 'wishlist';
    return 'browse';
  }

  private truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen - 3) + '...';
  }
}
