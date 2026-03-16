import { BaseAdapter } from './BaseAdapter';
import { extractTextContent } from '@shared/utils';
import type { ContentMetadata } from '@shared/types';

export class AmazonAdapter extends BaseAdapter {
  constructor() {
    super({
      platform: 'amazon',
      cardSelector: [
        // Search results page
        '[data-component-type="s-search-result"]',
        '.s-result-item[data-asin]:not(.AdHolder)',
        // Best Sellers / zg lists (bestsellers, movers & shakers, new releases)
        'li.zg-item-immersion',
        'div.p13n-sc-uncoverable-faceout',
        '[class*="zg-item"]',
        // Product page — "Customers also bought" / carousels
        'li[data-asin]:not([data-asin=""])',
        '.a-carousel-card[data-asin]',
        // Homepage recommendation tiles
        '.a-cardui-content[data-asin]',
        // Related products widgets
        '[data-csa-c-item-id]',
        '[data-csa-c-type="item"]',
      ].join(', '),
      feedSelector: [
        // Search
        '[data-component-type="s-search-results"]',
        '.s-main-slot',
        '#search',
        // Best Sellers page
        '#zg-ordered-list',
        '.p13n-desktop-grid',
        // Product page widgets
        '#similarities_feature_div',
        '#sp-cc',
        '#rhf',
        // Fallback
        '#dp',
        '#centerCol',
      ].join(', '),
    });
  }

  extractMetadata(element: Element): ContentMetadata | null {
    try {
      // ASIN: try element attribute first, then extract from any child product link
      let asin =
        element.getAttribute('data-asin') ??
        element.getAttribute('data-csa-c-item-id') ??
        '';

      // Best Sellers (zg-item) don't put data-asin on the li — extract from the /dp/ href
      if (!asin) {
        const dpLink = element.querySelector('a[href*="/dp/"]') as HTMLAnchorElement | null;
        const match = dpLink?.href.match(/\/dp\/([A-Z0-9]{10})/);
        asin = match?.[1] ?? '';
      }

      if (!asin) return null;

      const titleEl =
        element.querySelector('h2 .a-link-normal') ??
        element.querySelector('h2 a') ??
        // Best Sellers title truncated text
        element.querySelector('.p13n-sc-truncate-desktop-type2') ??
        element.querySelector('.p13n-sc-truncate') ??
        element.querySelector('._cDEzb_p13n-sc-css-line-clamp-3_g3dy1') ??
        element.querySelector('.a-size-medium.a-color-base.a-text-normal') ??
        element.querySelector('.a-size-base-plus.a-color-base.a-text-normal') ??
        element.querySelector('a[title]');
      const title = titleEl
        ? extractTextContent(titleEl) || titleEl.getAttribute('title') || ''
        : '';
      if (!title) return null;

      const href =
        (element.querySelector('a[href*="/dp/"]') as HTMLAnchorElement | null)?.href ??
        (element.querySelector('h2 a') as HTMLAnchorElement | null)?.href ??
        (element.querySelector('a.a-link-normal') as HTMLAnchorElement | null)?.href ??
        '';

      const brand =
        element.querySelector('.a-size-base-plus.a-color-secondary')?.textContent?.trim() ??
        element.querySelector('[data-a-color="secondary"] span')?.textContent?.trim() ??
        // Best Sellers brand text
        element.querySelector('.p13n-sc-brand')?.textContent?.trim();

      return {
        id: asin,
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
}