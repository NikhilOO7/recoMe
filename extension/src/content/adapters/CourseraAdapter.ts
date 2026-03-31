import { BaseAdapter } from './BaseAdapter';
import { extractTextContent } from '@shared/utils';
import { heuristicTitle, heuristicCreator, heuristicUrl } from './MetadataHeuristics';
import type { ContentMetadata } from '@shared/types';

export class CourseraAdapter extends BaseAdapter {
  constructor() {
    super({
      platform: 'coursera',
      cardSelector: [
        // Course / specialization cards
        'li.cds-9',
        'div[data-testid="product-card"]',
        'div[class*="ProductCard"]',
        // Search result items
        'li[class*="ais-InfiniteHits-item"]',
        'div[data-click-key*="search"]',
        // Browse category cards
        'div[class*="BrowseProductCard"]',
        // Recommendation items
        'div[data-testid="recommendation-card"]',
        'div[class*="recommendation"]',
        // Collection items (e.g., "Popular courses" carousel)
        'div[class*="CollectionProductCard"]',
        // Degree / certificate cards
        'div[data-testid="degree-card"]',
      ].join(', '),
      feedSelector: [
        'div[data-testid="search-results"]',
        'ul[class*="ProductCardGrid"]',
        'div[class*="Discovery"]',
        'main',
        '#rendered-content',
      ].join(', '),
    });
  }

  protected override isUserInitiatedSearch(): boolean {
    return location.pathname.startsWith('/search') || location.pathname.startsWith('/courses');
  }

  extractMetadata(element: Element): ContentMetadata | null {
    try {
      // Course title
      const titleEl =
        element.querySelector('h3[class*="CardTitle"]') ??
        element.querySelector('h3[data-testid="product-card-title"]') ??
        element.querySelector('a[data-click-key] h3') ??
        element.querySelector('h3') ??
        element.querySelector('a[class*="CardTitle"]');
      let title = titleEl ? extractTextContent(titleEl).trim() : '';
      if (!title) title = heuristicTitle(element) ?? '';
      if (!title) return null;

      // Institution / partner name
      const partnerEl =
        element.querySelector('p[data-testid="product-card-partner-name"]') ??
        element.querySelector('span[class*="PartnerName"]') ??
        element.querySelector('[class*="partner-name"]') ??
        element.querySelector('p[class*="CardPartner"]');
      let creator = partnerEl ? extractTextContent(partnerEl).trim() || undefined : undefined;
      if (!creator) creator = heuristicCreator(element) ?? undefined;

      // Course link and ID
      const linkEl = element.querySelector(
        'a[href*="/learn/"], a[href*="/specializations/"], a[href*="/professional-certificates/"], a[href*="/degrees/"]',
      ) as HTMLAnchorElement | null;
      let href = linkEl?.href ?? '';
      if (!href) href = heuristicUrl(element) ?? location.href;
      const slugMatch = href.match(
        /\/(learn|specializations|professional-certificates|degrees)\/([^/?#]+)/,
      );
      const id = slugMatch?.[2] ?? this.computeContentHash(element);

      // Rating
      const ratingEl =
        element.querySelector('[data-testid="product-card-rating"]') ??
        element.querySelector('span[class*="RatingText"]');
      const rating = ratingEl?.textContent?.trim() ?? '';

      // Course type (course, specialization, certificate, degree)
      const typeEl =
        element.querySelector('[data-testid="product-card-type"]') ??
        element.querySelector('span[class*="ProductType"]');
      const courseType = typeEl?.textContent?.trim() ?? '';

      // Difficulty level
      const levelEl =
        element.querySelector('[data-testid="product-card-difficulty"]') ??
        element.querySelector('span[class*="DifficultyLevel"]');
      const level = levelEl?.textContent?.trim() ?? '';

      return {
        id,
        platform: 'coursera',
        type: 'course',
        title,
        creator,
        topics: ['courses'],
        entities: creator ? [creator] : [],
        url: href,
        raw_metadata: {
          ...(rating ? { rating } : {}),
          ...(courseType ? { courseType } : {}),
          ...(level ? { level } : {}),
        },
      };
    } catch {
      return null;
    }
  }
}
