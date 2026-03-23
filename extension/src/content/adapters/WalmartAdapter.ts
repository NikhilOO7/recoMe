import { BaseAdapter } from './BaseAdapter';
import { extractTextContent } from '@shared/utils';
import { heuristicTitle, heuristicCreator, heuristicUrl } from './MetadataHeuristics';
import type { ContentMetadata } from '@shared/types';

export class WalmartAdapter extends BaseAdapter {
  constructor() {
    super({
      platform: 'walmart',
      cardSelector: [
        '[data-automation-id="product-container"]',
        '[data-item-id]',
        '.search-result-gridview-item',
        // Walmart item stack cards
        '[data-type="itemStack"]',
        // Sponsored items
        '[data-automation-id="product-container"][data-sponsored="true"]',
      ].join(', '),
      feedSelector: [
        '[data-automation-id="search-result-set"]',
        '.search-result-container',
        '#searchProductResult',
        'section[aria-label*="Search Results"]',
        '[data-testid="list-view"]',
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
        element.querySelector('.product-title');
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

      let brand = element.querySelector('[data-automation-id="brand-name"]')?.textContent?.trim();
      if (!brand) brand = heuristicCreator(element) ?? undefined;

      return {
        id: itemId,
        platform: 'walmart',
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
}
