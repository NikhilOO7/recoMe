import { BaseAdapter } from './BaseAdapter';
import { extractTextContent } from '@shared/utils';
import { heuristicTitle, heuristicCreator, heuristicUrl } from './MetadataHeuristics';
import type { ContentMetadata } from '@shared/types';

export class EdxAdapter extends BaseAdapter {
  constructor() {
    super({
      platform: 'edx',
      cardSelector: [
        // Course discovery cards
        'div[data-testid="product-card"]',
        'div.discovery-card',
        'div[class*="pgn__card"]',
        // Search result items
        'div[class*="search-result-card"]',
        'div.course-card',
        // Catalog items
        'div[class*="CatalogCourseCard"]',
        'div[data-testid="course-card"]',
        // Program / certificate cards
        'div[data-testid="program-card"]',
        'div[class*="ProgramCard"]',
        // Recommendation carousel items
        'div[class*="recommendation-card"]',
      ].join(', '),
      feedSelector: [
        'div[data-testid="search-results"]',
        'div[class*="search-results"]',
        'div[class*="course-list"]',
        'main',
        '#root',
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
        element.querySelector('a[class*="course-card-title"]') ??
        element.querySelector('h3') ??
        element.querySelector('.discovery-card-title') ??
        element.querySelector('a[href*="/course/"] span');
      let title = titleEl ? extractTextContent(titleEl).trim() : '';
      if (!title) title = heuristicTitle(element) ?? '';
      if (!title) return null;

      // Institution / partner name
      const partnerEl =
        element.querySelector('p[class*="CardPartner"]') ??
        element.querySelector('span[class*="partner"]') ??
        element.querySelector('.discovery-card-organization') ??
        element.querySelector('p[class*="org-name"]');
      let creator = partnerEl ? extractTextContent(partnerEl).trim() || undefined : undefined;
      if (!creator) creator = heuristicCreator(element) ?? undefined;

      // Course link and ID
      const linkEl = element.querySelector(
        'a[href*="/course/"], a[href*="/learn/"], a[href*="/xseries/"], a[href*="/programs/"], a[href*="/executive-education/"]',
      ) as HTMLAnchorElement | null;
      let href = linkEl?.href ?? '';
      if (!href) href = heuristicUrl(element) ?? location.href;
      const slugMatch = href.match(
        /\/(course|learn|xseries|programs|executive-education)\/([^/?#]+)/,
      );
      const id = slugMatch?.[2] ?? this.computeContentHash(element);

      // Price / availability
      const priceEl =
        element.querySelector('[class*="CardPrice"]') ??
        element.querySelector('span[class*="price"]');
      const price = priceEl?.textContent?.trim() ?? '';

      // Course type badge (Course, Program, XSeries, etc.)
      const typeBadgeEl =
        element.querySelector('[class*="CardType"]') ??
        element.querySelector('span[class*="badge"]');
      const courseType = typeBadgeEl?.textContent?.trim() ?? '';

      return {
        id,
        platform: 'edx',
        type: 'course',
        title,
        creator,
        topics: ['courses'],
        entities: creator ? [creator] : [],
        url: href,
        raw_metadata: {
          ...(price ? { price } : {}),
          ...(courseType ? { courseType } : {}),
        },
      };
    } catch {
      return null;
    }
  }
}
