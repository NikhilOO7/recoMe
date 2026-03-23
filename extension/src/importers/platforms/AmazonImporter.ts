import type { PlatformImporter, RawImportData, RawImportItem } from '../types';

/**
 * AmazonImporter — imports order history, wishlists, and reviews.
 *
 * DOM scrape targets:
 * - amazon.com/gp/your-account/order-history — purchase history
 * - amazon.com/hz/wishlist/ls — wishlists
 */
export class AmazonImporter implements PlatformImporter {
  readonly platform = 'amazon';
  readonly supportsDOMScrape = true;
  readonly supportsFileUpload = false;
  readonly supportsAPI = false;

  getScrapeUrl(): string {
    return 'https://www.amazon.com/gp/your-account/order-history';
  }

  canScrapeCurrentPage(url: string): boolean {
    return (
      url.includes('amazon.com/gp/your-account/order-history') ||
      url.includes('amazon.com/hz/wishlist') ||
      url.includes('amazon.com/gp/css/order-history')
    );
  }

  async importFromDOM(doc: Document): Promise<RawImportData> {
    const items: RawImportItem[] = [];
    const url = location.href;

    if (url.includes('order-history')) {
      items.push(...this.scrapeOrders(doc));
    } else if (url.includes('wishlist')) {
      items.push(...this.scrapeWishlist(doc));
    }

    return {
      platform: 'amazon',
      source: 'dom_scrape',
      items,
      scrapedAt: Date.now(),
    };
  }

  private scrapeOrders(doc: Document): RawImportItem[] {
    const items: RawImportItem[] = [];
    const orderCards = doc.querySelectorAll('.order-card, .a-box-group.order');

    for (const card of orderCards) {
      const dateEl = card.querySelector('.order-info .value, [data-testid="order-date"] span');
      const dateText = dateEl?.textContent?.trim() ?? '';
      const timestamp = dateText ? new Date(dateText).getTime() : undefined;

      // Each order can have multiple items
      const productEls = card.querySelectorAll(
        '.yohtmlc-product-title a, .a-link-normal[href*="/dp/"], .a-link-normal[href*="/gp/product/"]',
      );

      for (const productEl of productEls) {
        const title = productEl.textContent?.trim() ?? '';
        const href = productEl.getAttribute('href') ?? '';
        const asin = this.extractASIN(href);

        if (!title) continue;

        // Try to get price
        const priceEl = card.querySelector('.a-color-price, .yohtmlc-order-total span');
        const price = priceEl?.textContent?.trim() ?? '';

        items.push({
          externalId: asin || `amz_${title.slice(0, 40)}`,
          title,
          url: href ? `https://www.amazon.com${href}` : undefined,
          timestamp: timestamp && !isNaN(timestamp) ? timestamp : undefined,
          interactionType: 'purchased',
          metadata: { price, asin },
        });
      }
    }

    return items;
  }

  private scrapeWishlist(doc: Document): RawImportItem[] {
    const items: RawImportItem[] = [];
    const listItems = doc.querySelectorAll('[id^="itemMain_"], li[data-id]');

    for (const el of listItems) {
      const titleEl = el.querySelector(
        'a[id^="itemName_"], .a-link-normal h2, [data-testid="list-item-title"] a',
      );
      const title = titleEl?.textContent?.trim() ?? '';
      const href = titleEl?.getAttribute('href') ?? '';
      const asin = this.extractASIN(href) || el.getAttribute('data-itemid') || '';

      const priceEl = el.querySelector('.a-price .a-offscreen, [data-testid="item-price"]');
      const price = priceEl?.textContent?.trim() ?? '';

      if (!title) continue;

      items.push({
        externalId: asin || `amz_wish_${title.slice(0, 40)}`,
        title,
        url: href ? `https://www.amazon.com${href}` : undefined,
        interactionType: 'wishlisted',
        metadata: { price, asin },
      });
    }

    return items;
  }

  private extractASIN(url: string): string {
    const match = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/);
    return match?.[1] ?? '';
  }
}
