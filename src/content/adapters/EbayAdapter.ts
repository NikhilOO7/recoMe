import { BaseAdapter } from './BaseAdapter';
import { extractTextContent } from '@shared/utils';
import type { ContentMetadata } from '@shared/types';

export class EbayAdapter extends BaseAdapter {
  constructor() {
    super({
      platform: 'ebay',
      cardSelector: [
        '.s-item:not(.s-item--placeholder)',
        '.s-item--sponsored',
        '.watchlist-item',
      ].join(', '),
      feedSelector: [
        '.srp-results',
        '#ResultSetItems',
        '.b-list__items_nofooter',
        '#mainContent',
        '.srp-river-main',
      ].join(', '),
    });
  }

  extractMetadata(element: Element): ContentMetadata | null {
    try {
      const titleEl =
        element.querySelector('.s-item__title') ??
        element.querySelector('h3.s-item__title') ??
        element.querySelector('[class*="item__title"]');
      const title = titleEl ? extractTextContent(titleEl) : '';
      if (!title || title === 'Shop on eBay' || title === 'New Listing') return null;

      const linkEl = (
        element.querySelector('a.s-item__link') ??
        element.querySelector('a[href*="/itm/"]')
      ) as HTMLAnchorElement | null;
      const href = linkEl?.href ?? '';
      const itemMatch = href.match(/\/itm\/(\d+)/);
      const id = itemMatch?.[1] ?? this.computeContentHash(element);

      const seller =
        element.querySelector('.s-item__seller-info-text')?.textContent?.trim() ??
        element.querySelector('[class*="seller"]')?.textContent?.trim();

      const isSponsored =
        element.classList.contains('s-item--sponsored') ||
        !!element.querySelector('[aria-label*="Sponsored"]');

      return {
        id,
        platform: 'ebay',
        type: isSponsored ? 'ad' : 'product',
        title,
        creator: seller,
        topics: [],
        entities: [],
        url: href,
      };
    } catch {
      return null;
    }
  }
}