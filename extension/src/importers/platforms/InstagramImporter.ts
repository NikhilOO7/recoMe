import type { PlatformImporter, RawImportData, RawImportItem } from '../types';

/**
 * InstagramImporter — imports saved posts and liked posts.
 *
 * DOM scrape: instagram.com/{username}/saved/ — saved posts
 * File upload: Meta data export JSON (liked_posts.json, saved_posts.json)
 */
export class InstagramImporter implements PlatformImporter {
  readonly platform = 'instagram';
  readonly supportsDOMScrape = true;
  readonly supportsFileUpload = true;
  readonly supportsAPI = false;

  getScrapeUrl(): string {
    return 'https://www.instagram.com/'; // User navigates to saved
  }

  canScrapeCurrentPage(url: string): boolean {
    return url.includes('instagram.com') && url.includes('/saved');
  }

  async importFromDOM(doc: Document): Promise<RawImportData> {
    const items: RawImportItem[] = [];
    const postLinks = doc.querySelectorAll('a[href*="/p/"]');

    for (const link of postLinks) {
      const href = link.getAttribute('href') ?? '';
      const shortcode = href.match(/\/p\/([^/]+)/)?.[1] ?? '';
      const imgEl = link.querySelector('img');
      const alt = imgEl?.getAttribute('alt') ?? '';

      if (!shortcode) continue;

      items.push({
        externalId: `ig_${shortcode}`,
        title: alt || `Instagram post ${shortcode}`,
        url: `https://www.instagram.com${href}`,
        interactionType: 'saved',
        metadata: { shortcode, altText: alt },
      });
    }

    return {
      platform: 'instagram',
      source: 'dom_scrape',
      items,
      scrapedAt: Date.now(),
    };
  }

  async importFromFile(file: File): Promise<RawImportData> {
    const text = await file.text();
    const data = JSON.parse(text) as MetaExportData;
    const items: RawImportItem[] = [];

    const entries = data.likes_media_likes ?? data.saved_saved_media ?? [];

    for (const entry of entries) {
      const media = entry.string_list_data?.[0];
      if (!media) continue;

      const title = media.value ?? 'Instagram post';
      const url = media.href ?? '';
      const timestamp = media.timestamp ? media.timestamp * 1000 : undefined;

      items.push({
        externalId: `ig_${url || title.slice(0, 30)}`,
        title,
        url: url || undefined,
        timestamp,
        interactionType: data.likes_media_likes ? 'liked' : 'saved',
        metadata: {},
      });
    }

    return {
      platform: 'instagram',
      source: 'file_upload',
      items,
      scrapedAt: Date.now(),
    };
  }
}

interface MetaExportData {
  likes_media_likes?: MetaEntry[];
  saved_saved_media?: MetaEntry[];
}

interface MetaEntry {
  title?: string;
  string_list_data?: Array<{
    value?: string;
    href?: string;
    timestamp?: number;
  }>;
}
