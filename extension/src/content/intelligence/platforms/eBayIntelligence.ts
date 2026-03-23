import type { PlatformIntelligenceModule, PlatformProfile, RawOpportunity } from '../types';
import { safeText, safeTextAll, safeTextAny, safeAttr } from '../ProfileExtractor';

/**
 * eBayIntelligence — deal & collector intelligence.
 *
 * Extracts: item details, pricing, auction status, category.
 * Generates insights: rare find alerts, bidding strategy, price trends, complementary deals.
 */
export class EbayIntelligence implements PlatformIntelligenceModule {
  readonly platform = 'ebay' as const;

  extractProfile(doc: Document): PlatformProfile | null {
    const pageType = this.detectPageType();

    const itemTitle = safeTextAny(doc, [
      'h1.x-item-title__mainTitle span',
      'h1#itemTitle',
      'h3.s-item__title',
    ]);

    const price = safeTextAny(doc, ['.x-price-primary span', '#prcIsum', '.s-item__price']);

    const condition = safeTextAny(doc, ['.x-item-condition-value span', '#vi-itm-cond']);

    const seller = safeTextAny(doc, [
      '.x-sellercard-atf__info__about-seller a',
      'a[data-testid="ux-seller-section__item--link"]',
    ]);

    const sellerRating = safeText(doc, '.x-sellercard-atf__data-item span');

    const bidsCount = safeText(doc, '#vi-abf-cnt, .x-bid-count a');
    const timeLeft = safeText(doc, '.x-timer__remaining, #vi-cdown_timeLeft');

    const breadcrumbs = safeTextAll(doc, '.seo-breadcrumb-text span, nav.breadcrumbs a');
    const category = breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 1] : '';

    const searchQuery =
      safeAttr(doc, 'input[name="_nkw"]', 'value') ||
      safeText(doc, '.srp-controls__count-heading span');

    return {
      platform: 'ebay',
      pageType,
      extractedAt: Date.now(),
      fields: {
        itemTitle,
        price,
        condition,
        seller,
        sellerRating,
        bidsCount,
        timeLeft,
        category,
        breadcrumbs,
        searchQuery,
        isAuction: !!bidsCount || !!timeLeft,
        pageType,
      },
    };
  }

  discoverOpportunities(profile: PlatformProfile, userInterests: string[]): RawOpportunity[] {
    const opportunities: RawOpportunity[] = [];
    const fields = profile.fields as {
      itemTitle: string;
      price: string;
      condition: string;
      seller: string;
      sellerRating: string;
      bidsCount: string;
      timeLeft: string;
      category: string;
      breadcrumbs: string[];
      searchQuery: string;
      isAuction: boolean;
      pageType: string;
    };

    // Auction bidding strategy
    if (fields.isAuction && fields.timeLeft) {
      const isEndingSoon = fields.timeLeft.includes('h') || fields.timeLeft.includes('m');
      if (isEndingSoon) {
        opportunities.push({
          title: 'Auction ending soon',
          body: `"${fields.itemTitle || 'This item'}" has ${fields.bidsCount || 'bids'} and ends in ${fields.timeLeft}. Similar items have sold recently — check completed listings for price guidance.`,
          benefit: 'Make informed bidding decisions',
          type: 'alert',
          actionLabel: 'View completed listings',
          timeliness: 0.9,
          sourceSignals: [fields.itemTitle, fields.category].filter(Boolean),
          platformContext: { timeLeft: fields.timeLeft, bids: fields.bidsCount, isAuction: true },
        });
      }
    }

    // Category price trend insight
    if (fields.category && fields.pageType === 'search') {
      opportunities.push({
        title: `Price trends for ${fields.category}`,
        body: `Track price trends in ${fields.category} to know when to buy. Completed listings show recent sale prices.`,
        benefit: 'Buy at the right time',
        type: 'trend',
        actionLabel: 'Check trends',
        timeliness: 0.5,
        sourceSignals: [fields.category, fields.searchQuery].filter(Boolean),
        platformContext: { category: fields.category },
      });
    }

    // Interest-matched rare find
    if (fields.itemTitle && fields.pageType === 'item') {
      const titleLower = fields.itemTitle.toLowerCase();
      const matchedInterests = userInterests.filter((i) => titleLower.includes(i.toLowerCase()));
      if (matchedInterests.length > 0) {
        opportunities.push({
          title: `This matches your interest in ${matchedInterests[0]}`,
          body: `"${fields.itemTitle}" aligns with topics in your interest graph. ${fields.condition ? `Condition: ${fields.condition}.` : ''}`,
          benefit: 'Find items that match your interests',
          type: 'deal',
          actionLabel: 'Track this item',
          timeliness: 0.6,
          sourceSignals: matchedInterests,
          platformContext: {
            itemTitle: fields.itemTitle,
            condition: fields.condition,
            price: fields.price,
          },
        });
      }
    }

    // Seller trust signal
    if (fields.seller && fields.sellerRating) {
      opportunities.push({
        title: `Seller info: ${fields.seller}`,
        body: `This seller has a ${fields.sellerRating} rating. Check their other listings for bundle deals.`,
        benefit: 'Make informed purchase decisions',
        type: 'content',
        actionLabel: 'View seller',
        timeliness: 0.2,
        sourceSignals: [fields.seller],
        platformContext: { seller: fields.seller, rating: fields.sellerRating },
      });
    }

    // Complementary deals from browsing patterns
    if (userInterests.length > 3 && fields.category) {
      const relatedInterests = userInterests
        .filter((i) => !fields.category.toLowerCase().includes(i.toLowerCase()))
        .slice(0, 3);
      if (relatedInterests.length > 0) {
        opportunities.push({
          title: 'Complementary items for your interests',
          body: `Based on your interest in ${relatedInterests.slice(0, 2).join(' and ')}, there may be related items in this category.`,
          benefit: 'Discover items you might not have searched for',
          type: 'deal',
          actionLabel: 'Browse related',
          timeliness: 0.3,
          sourceSignals: relatedInterests,
          platformContext: { category: fields.category, relatedInterests },
        });
      }
    }

    return opportunities;
  }

  private detectPageType(): string {
    const path = location.pathname;
    if (path.startsWith('/sch/')) return 'search';
    if (path.startsWith('/itm/')) return 'item';
    if (path.startsWith('/b/')) return 'browse';
    if (path.startsWith('/deals')) return 'deals';
    if (path.startsWith('/myebay')) return 'myebay';
    if (path === '/' || path === '') return 'home';
    return 'other';
  }
}
