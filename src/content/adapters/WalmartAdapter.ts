import { BaseAdapter } from './BaseAdapter';
import { extractTextContent } from '@shared/utils';
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

  extractMetadata(element: Element): ContentMetadata | null {
    try {
      const titleEl =
        element.querySelector('[data-automation-id="product-title"]') ??
        element.querySelector('span[data-automation-id="product-title-link"]') ??
        element.querySelector('.product-title');
      const title = titleEl ? extractTextContent(titleEl) : '';
      if (!title) return null;

      const linkEl = element.querySelector('a') as HTMLAnchorElement | null;
      const href = linkEl?.href ?? '';
      const itemId =
        element.getAttribute('data-item-id') ??
        href.match(/\/ip\/[^/]+\/(\d+)/)?.[1] ??
        this.computeContentHash(element);

      const brand = element
        .querySelector('[data-automation-id="brand-name"]')
        ?.textContent?.trim();

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