import { BaseAdapter } from './BaseAdapter';
import { extractTextContent } from '@shared/utils';
import { heuristicTitle, heuristicCreator, heuristicUrl } from './MetadataHeuristics';
import { looksLikePrice } from './MetadataHeuristics';
import type { ContentMetadata } from '@shared/types';

export class UdemyAdapter extends BaseAdapter {
  constructor() {
    super({
      platform: 'udemy',
      cardSelector: [
        // Course cards in browse / search
        'div[data-purpose="course-card-container"]',
        'div[class*="course-card--container"]',
        // Course list items
        'div[data-purpose="course-card-title"]',
        'div[class*="course-list--container"] > div',
        // Search result cards
        'div[data-purpose="search-course-card"]',
        // Category browse cards
        'div[class*="browse-course-card"]',
        // Recommendation carousel items
        'div[data-purpose="discovery-unit"] div[class*="course-card"]',
        // "Students also bought" and similar sections
        'div[class*="unit--container"] div[class*="course-card"]',
      ].join(', '),
      feedSelector: [
        'div[data-purpose="discovery-unit"]',
        'div[class*="course-list"]',
        'div[data-purpose="search-results"]',
        'main',
        '#udemy',
      ].join(', '),
    });
  }

  protected override isUserInitiatedSearch(): boolean {
    return location.pathname.startsWith('/courses/search');
  }

  extractMetadata(element: Element): ContentMetadata | null {
    try {
      // Course title
      const titleEl =
        element.querySelector('[data-purpose="course-title-url"] a') ??
        element.querySelector('[data-purpose="course-title-url"]') ??
        element.querySelector('h3[class*="course-card--course-title"]') ??
        element.querySelector('a[class*="course-card--link"]');
      let title = titleEl ? extractTextContent(titleEl).trim() : '';
      if (!title) title = heuristicTitle(element) ?? '';
      if (!title) return null;

      // Instructor name
      const instructorEl =
        element.querySelector(
          '[data-purpose="safely-set-inner-html:course-card:visible-instructors"]',
        ) ??
        element.querySelector('span[class*="course-card--instructor-list"]') ??
        element.querySelector('[class*="instructor"]');
      let creator = instructorEl ? extractTextContent(instructorEl).trim() || undefined : undefined;
      if (creator && looksLikePrice(creator)) creator = undefined;
      if (!creator) creator = heuristicCreator(element) ?? undefined;

      // Course link and ID
      const linkEl = element.querySelector('a[href*="/course/"]') as HTMLAnchorElement | null;
      let href = linkEl?.href ?? '';
      if (!href) href = heuristicUrl(element) ?? location.href;
      const courseSlugMatch = href.match(/\/course\/([^/?#]+)/);
      const id = courseSlugMatch?.[1] ?? this.computeContentHash(element);

      // Rating
      const ratingEl =
        element.querySelector('[data-purpose="rating-number"]') ??
        element.querySelector('span[class*="star-rating"]');
      const rating = ratingEl?.textContent?.trim() ?? '';

      // Number of students / reviews
      const studentsEl = element.querySelector('[data-purpose="enrollment-number"]');
      const students = studentsEl?.textContent?.trim() ?? '';

      // Price
      const priceEl =
        element.querySelector('[data-purpose="course-card-price"] span') ??
        element.querySelector('span[class*="price-text"]');
      const price = priceEl?.textContent?.trim() ?? '';

      // Detect promoted/sponsored courses
      const isAd =
        !!element.querySelector('[data-purpose*="sponsored"]') ||
        Array.from(element.querySelectorAll('span')).some(
          (s) => s.textContent?.trim() === 'Sponsored' || s.textContent?.trim() === 'Ad',
        );

      return {
        id,
        platform: 'udemy',
        type: isAd ? 'ad' : 'course',
        title,
        creator,
        topics: ['courses'],
        entities: creator ? [creator] : [],
        url: href,
        raw_metadata: {
          ...(rating ? { rating } : {}),
          ...(students ? { students } : {}),
          ...(price ? { price } : {}),
        },
      };
    } catch {
      return null;
    }
  }
}
