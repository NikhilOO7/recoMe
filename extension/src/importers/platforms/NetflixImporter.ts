import type { PlatformImporter, RawImportData, RawImportItem } from '../types';

/**
 * NetflixImporter — imports watch history and ratings.
 *
 * DOM scrape: netflix.com/viewingactivity — viewing history
 * No file upload (Netflix data export is complex and slow).
 */
export class NetflixImporter implements PlatformImporter {
  readonly platform = 'netflix';
  readonly supportsDOMScrape = true;
  readonly supportsFileUpload = false;
  readonly supportsAPI = false;

  getScrapeUrl(): string {
    return 'https://www.netflix.com/viewingactivity';
  }

  canScrapeCurrentPage(url: string): boolean {
    return url.includes('netflix.com/viewingactivity');
  }

  async importFromDOM(doc: Document): Promise<RawImportData> {
    const items: RawImportItem[] = [];

    // Netflix viewing activity page
    const rows = doc.querySelectorAll('.retableRow, li.retableRow, .viewing-activity-footer-item');

    for (const row of rows) {
      const titleEl = row.querySelector('.title a, .col.title a');
      const title = titleEl?.textContent?.trim() ?? '';
      const href = titleEl?.getAttribute('href') ?? '';

      const dateEl = row.querySelector('.date, .col.date');
      const dateText = dateEl?.textContent?.trim() ?? '';
      const timestamp = dateText ? new Date(dateText).getTime() : undefined;

      if (!title) continue;

      // Extract show/episode info
      const parts = title.split(':');
      const showTitle = parts[0]?.trim() ?? title;
      const episodeTitle = parts.length > 1 ? parts.slice(1).join(':').trim() : '';

      items.push({
        externalId: `netflix_${href || title.slice(0, 40)}`,
        title,
        url: href ? `https://www.netflix.com${href}` : undefined,
        timestamp: timestamp && !isNaN(timestamp) ? timestamp : undefined,
        interactionType: 'watched',
        metadata: {
          showTitle,
          episodeTitle,
        },
      });
    }

    // Also try the newer viewing activity format
    if (items.length === 0) {
      const viewItems = doc.querySelectorAll(
        '[data-testid="viewing-activity-item"], .viewing-item',
      );

      for (const item of viewItems) {
        const titleEl = item.querySelector('a, .title');
        const title = titleEl?.textContent?.trim() ?? '';
        const href = titleEl?.getAttribute('href') ?? '';

        if (!title) continue;

        items.push({
          externalId: `netflix_${href || title.slice(0, 40)}`,
          title,
          url: href?.startsWith('/') ? `https://www.netflix.com${href}` : href || undefined,
          interactionType: 'watched',
          metadata: {},
        });
      }
    }

    return {
      platform: 'netflix',
      source: 'dom_scrape',
      items,
      scrapedAt: Date.now(),
    };
  }
}
