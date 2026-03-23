import type { PlatformImporter, RawImportData, RawImportItem } from '../types';

/**
 * YouTubeImporter — imports watch history, liked videos, and subscriptions.
 *
 * DOM scrape targets:
 * - youtube.com/feed/history — watch history
 * - youtube.com/playlist?list=LL — liked videos
 * - youtube.com/feed/channels — subscriptions
 *
 * File upload: Google Takeout JSON (watch-history.json, liked-videos.json)
 */
export class YouTubeImporter implements PlatformImporter {
  readonly platform = 'youtube';
  readonly supportsDOMScrape = true;
  readonly supportsFileUpload = true;
  readonly supportsAPI = false;

  getScrapeUrl(): string {
    return 'https://www.youtube.com/feed/history';
  }

  canScrapeCurrentPage(url: string): boolean {
    return (
      url.includes('youtube.com/feed/history') ||
      url.includes('youtube.com/playlist?list=LL') ||
      url.includes('youtube.com/feed/channels')
    );
  }

  async importFromDOM(doc: Document): Promise<RawImportData> {
    const items: RawImportItem[] = [];
    const url = location.href;

    if (url.includes('/feed/history')) {
      items.push(...this.scrapeWatchHistory(doc));
    } else if (url.includes('/playlist?list=LL')) {
      items.push(...this.scrapeLikedVideos(doc));
    } else if (url.includes('/feed/channels')) {
      items.push(...this.scrapeSubscriptions(doc));
    }

    return {
      platform: 'youtube',
      source: 'dom_scrape',
      items,
      scrapedAt: Date.now(),
    };
  }

  async importFromFile(file: File): Promise<RawImportData> {
    const text = await file.text();
    const data = JSON.parse(text) as TakeoutEntry[];
    const items: RawImportItem[] = [];

    for (const entry of data) {
      if (!entry.title || entry.title === 'Watched a video that has been removed') continue;

      const videoUrl = entry.titleUrl ?? '';
      const videoId = this.extractVideoId(videoUrl);

      items.push({
        externalId: videoId || `yt_${entry.time}`,
        title: entry.title.replace(/^Watched\s+/, ''),
        url: videoUrl || undefined,
        timestamp: entry.time ? new Date(entry.time).getTime() : undefined,
        interactionType: 'watched',
        metadata: {
          channel: entry.subtitles?.[0]?.name ?? '',
          channelUrl: entry.subtitles?.[0]?.url ?? '',
        },
      });
    }

    return {
      platform: 'youtube',
      source: 'file_upload',
      items,
      scrapedAt: Date.now(),
    };
  }

  private scrapeWatchHistory(doc: Document): RawImportItem[] {
    const items: RawImportItem[] = [];
    const videoRenderers = doc.querySelectorAll('ytd-video-renderer, ytd-compact-video-renderer');

    for (const el of videoRenderers) {
      const titleEl = el.querySelector('#video-title');
      const title = titleEl?.textContent?.trim() ?? '';
      const href = titleEl?.getAttribute('href') ?? '';
      const channelEl = el.querySelector('#channel-name a, .ytd-channel-name a');
      const channel = channelEl?.textContent?.trim() ?? '';
      const videoId = this.extractVideoId(href);

      if (!title || !videoId) continue;

      items.push({
        externalId: videoId,
        title,
        url: `https://www.youtube.com${href}`,
        interactionType: 'watched',
        metadata: { channel },
      });
    }

    return items;
  }

  private scrapeLikedVideos(doc: Document): RawImportItem[] {
    const items: RawImportItem[] = [];
    const renderers = doc.querySelectorAll('ytd-playlist-video-renderer');

    for (const el of renderers) {
      const titleEl = el.querySelector('#video-title');
      const title = titleEl?.textContent?.trim() ?? '';
      const href = titleEl?.getAttribute('href') ?? '';
      const channelEl = el.querySelector('#channel-name a, .ytd-channel-name a');
      const channel = channelEl?.textContent?.trim() ?? '';
      const videoId = this.extractVideoId(href);

      if (!title || !videoId) continue;

      items.push({
        externalId: videoId,
        title,
        url: `https://www.youtube.com${href}`,
        interactionType: 'liked',
        metadata: { channel },
      });
    }

    return items;
  }

  private scrapeSubscriptions(doc: Document): RawImportItem[] {
    const items: RawImportItem[] = [];
    const channelRenderers = doc.querySelectorAll(
      'ytd-channel-renderer, ytd-grid-channel-renderer',
    );

    for (const el of channelRenderers) {
      const nameEl = el.querySelector('#channel-title, #text');
      const name = nameEl?.textContent?.trim() ?? '';
      const href = el.querySelector('a#main-link, a')?.getAttribute('href') ?? '';

      if (!name) continue;

      items.push({
        externalId: `sub_${href.replace(/\//g, '_')}`,
        title: name,
        url: href ? `https://www.youtube.com${href}` : undefined,
        interactionType: 'subscribed',
        metadata: {},
      });
    }

    return items;
  }

  private extractVideoId(url: string): string {
    const match = url.match(/[?&]v=([^&]+)/) ?? url.match(/\/watch\/([^/?]+)/);
    return match?.[1] ?? '';
  }
}

interface TakeoutEntry {
  title?: string;
  titleUrl?: string;
  time?: string;
  subtitles?: Array<{ name?: string; url?: string }>;
}
