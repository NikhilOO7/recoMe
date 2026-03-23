import type { PlatformImporter, RawImportData, RawImportItem } from '../types';

/**
 * RedditImporter — imports upvoted posts, saved posts, and subscribed subreddits.
 *
 * DOM scrape targets:
 * - reddit.com/user/{username}/upvoted — upvoted posts
 * - reddit.com/user/{username}/saved — saved posts
 * - reddit.com/subreddits/ — subscribed subreddits
 *
 * File upload: Reddit data request (upvoted/saved CSV or JSON)
 */
export class RedditImporter implements PlatformImporter {
  readonly platform = 'reddit';
  readonly supportsDOMScrape = true;
  readonly supportsFileUpload = true;
  readonly supportsAPI = false;

  getScrapeUrl(): string {
    return 'https://www.reddit.com/'; // User navigates to their profile
  }

  canScrapeCurrentPage(url: string): boolean {
    return url.includes('reddit.com/user/') && (url.includes('/upvoted') || url.includes('/saved'));
  }

  async importFromDOM(doc: Document): Promise<RawImportData> {
    const items: RawImportItem[] = [];
    const url = location.href;
    const interactionType = url.includes('/saved') ? ('saved' as const) : ('upvoted' as const);

    // New Reddit (shreddit)
    const posts = doc.querySelectorAll('shreddit-post, [data-testid="post-container"], .Post');

    for (const post of posts) {
      const titleEl = post.querySelector('a[slot="title"], [data-testid="post-title"] a, a.title');
      const title = post.getAttribute('post-title') ?? titleEl?.textContent?.trim() ?? '';
      const href = post.getAttribute('permalink') ?? titleEl?.getAttribute('href') ?? '';
      const subreddit =
        post.getAttribute('subreddit-prefixed-name') ??
        post.querySelector('[data-testid="subreddit-name"]')?.textContent?.trim() ??
        '';

      const postId = post.getAttribute('id') ?? href.match(/comments\/([a-z0-9]+)/)?.[1] ?? '';

      if (!title) continue;

      items.push({
        externalId: postId || `reddit_${title.slice(0, 40)}`,
        title,
        url: href.startsWith('http') ? href : `https://www.reddit.com${href}`,
        interactionType,
        metadata: { subreddit },
      });
    }

    return {
      platform: 'reddit',
      source: 'dom_scrape',
      items,
      scrapedAt: Date.now(),
    };
  }

  async importFromFile(file: File): Promise<RawImportData> {
    const text = await file.text();
    const items: RawImportItem[] = [];

    // Try JSON first
    try {
      const data = JSON.parse(text) as RedditExportEntry[];
      for (const entry of data) {
        items.push({
          externalId: entry.id ?? `reddit_${items.length}`,
          title: entry.title ?? entry.body?.slice(0, 200) ?? 'Reddit post',
          url: entry.permalink ? `https://www.reddit.com${entry.permalink}` : undefined,
          timestamp: entry.created_utc ? entry.created_utc * 1000 : undefined,
          interactionType: 'upvoted',
          metadata: { subreddit: entry.subreddit ?? '' },
        });
      }
    } catch {
      // Try CSV format
      const lines = text.split('\n');
      const headers = lines[0]?.split(',') ?? [];
      const titleIdx = headers.indexOf('title');
      const linkIdx = headers.indexOf('permalink');
      const subIdx = headers.indexOf('subreddit');

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i]!.split(',');
        const title = cols[titleIdx]?.trim() ?? '';
        if (!title) continue;

        items.push({
          externalId: `reddit_csv_${i}`,
          title,
          url: cols[linkIdx] ? `https://www.reddit.com${cols[linkIdx]}` : undefined,
          interactionType: 'upvoted',
          metadata: { subreddit: cols[subIdx] ?? '' },
        });
      }
    }

    return {
      platform: 'reddit',
      source: 'file_upload',
      items,
      scrapedAt: Date.now(),
    };
  }
}

interface RedditExportEntry {
  id?: string;
  title?: string;
  body?: string;
  permalink?: string;
  subreddit?: string;
  created_utc?: number;
}
