import type { PlatformImporter, RawImportData, RawImportItem } from '../types';

/**
 * TwitterImporter — imports likes, bookmarks, and followed topics.
 *
 * DOM scrape targets:
 * - x.com/i/bookmarks — bookmarks
 * - x.com/{username}/likes — liked tweets
 *
 * File upload: Twitter/X data export (like.js, bookmark.js)
 */
export class TwitterImporter implements PlatformImporter {
  readonly platform = 'twitter';
  readonly supportsDOMScrape = true;
  readonly supportsFileUpload = true;
  readonly supportsAPI = false;

  getScrapeUrl(): string {
    return 'https://x.com/i/bookmarks';
  }

  canScrapeCurrentPage(url: string): boolean {
    return url.includes('/i/bookmarks') || url.includes('/likes');
  }

  async importFromDOM(doc: Document): Promise<RawImportData> {
    const items = this.scrapeTweets(doc);

    const url = location.href;
    const interactionType = url.includes('/bookmarks')
      ? ('bookmarked' as const)
      : ('liked' as const);

    // Override interaction type based on page
    for (const item of items) {
      item.interactionType = interactionType;
    }

    return {
      platform: 'twitter',
      source: 'dom_scrape',
      items,
      scrapedAt: Date.now(),
    };
  }

  async importFromFile(file: File): Promise<RawImportData> {
    const text = await file.text();

    // Twitter exports are JS files: window.YTD.like.part0 = [...]
    const jsonStr = text.replace(/^window\.YTD\.\w+\.part\d+\s*=\s*/, '');
    const data = JSON.parse(jsonStr) as TwitterExportEntry[];
    const items: RawImportItem[] = [];

    for (const entry of data) {
      const tweet = entry.like ?? entry.bookmark;
      if (!tweet) continue;

      items.push({
        externalId: tweet.tweetId ?? `tw_${items.length}`,
        title: tweet.fullText?.slice(0, 200) ?? `Tweet ${tweet.tweetId}`,
        url: tweet.tweetId ? `https://x.com/i/status/${tweet.tweetId}` : undefined,
        timestamp: tweet.tweetId ? undefined : undefined,
        interactionType: entry.like ? 'liked' : 'bookmarked',
        metadata: {
          fullText: tweet.fullText,
          expandedUrl: tweet.expandedUrl,
        },
      });
    }

    return {
      platform: 'twitter',
      source: 'file_upload',
      items,
      scrapedAt: Date.now(),
    };
  }

  private scrapeTweets(doc: Document): RawImportItem[] {
    const items: RawImportItem[] = [];
    const tweetArticles = doc.querySelectorAll('article[data-testid="tweet"]');

    for (const article of tweetArticles) {
      const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
      const tweetText = tweetTextEl?.textContent?.trim() ?? '';

      const userNameEl = article.querySelector('[data-testid="User-Name"] a');
      const userName = userNameEl?.textContent?.trim() ?? '';
      const userHref = userNameEl?.getAttribute('href') ?? '';

      // Extract tweet link for ID
      const timeEl = article.querySelector('time');
      const tweetLinkEl = timeEl?.closest('a');
      const tweetHref = tweetLinkEl?.getAttribute('href') ?? '';
      const tweetIdMatch = tweetHref.match(/\/status\/(\d+)/);
      const tweetId = tweetIdMatch?.[1] ?? '';

      const timestamp = timeEl?.getAttribute('datetime')
        ? new Date(timeEl.getAttribute('datetime')!).getTime()
        : undefined;

      if (!tweetText && !tweetId) continue;

      items.push({
        externalId: tweetId || `tw_${tweetText.slice(0, 30)}`,
        title: tweetText.slice(0, 200) || `Tweet by ${userName}`,
        url: tweetId ? `https://x.com${tweetHref}` : undefined,
        timestamp,
        interactionType: 'liked',
        metadata: { userName, userHref },
      });
    }

    return items;
  }
}

interface TwitterExportEntry {
  like?: { tweetId?: string; fullText?: string; expandedUrl?: string };
  bookmark?: { tweetId?: string; fullText?: string; expandedUrl?: string };
}
