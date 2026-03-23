import type { RawImportData, RawImportItem } from '../types';

/**
 * DataTakeoutParser — parses Google Takeout, Meta, and Twitter data export files.
 *
 * Accepts JSON or ZIP files (extracts JSON from ZIP).
 * Auto-detects format based on file structure.
 */

export type TakeoutFormat = 'google' | 'meta' | 'twitter' | 'spotify' | 'reddit' | 'unknown';

export function detectTakeoutFormat(data: unknown): TakeoutFormat {
  if (!data || typeof data !== 'object') return 'unknown';

  // Google Takeout — array of objects with titleUrl
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0] as Record<string, unknown>;
    if ('titleUrl' in first || ('title' in first && 'time' in first)) return 'google';
    if ('endTime' in first && 'artistName' in first) return 'spotify';
    if ('subreddit' in first || 'permalink' in first) return 'reddit';
  }

  const obj = data as Record<string, unknown>;

  // Meta export — has specific top-level keys
  if ('likes_media_likes' in obj || 'saved_saved_media' in obj || 'your_topics' in obj)
    return 'meta';

  // Twitter — has window.YTD format (already stripped to array by importer)
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0] as Record<string, unknown>;
    if ('like' in first || 'bookmark' in first || 'tweet' in first) return 'twitter';
  }

  return 'unknown';
}

/**
 * Parse a generic Google Takeout JSON file.
 * Works for YouTube watch history, search history, etc.
 */
export function parseGoogleTakeout(data: GoogleTakeoutEntry[]): RawImportItem[] {
  const items: RawImportItem[] = [];

  for (const entry of data) {
    if (!entry.title) continue;

    const title = entry.title.replace(/^(Watched|Searched for|Visited)\s+/, '');
    const url = entry.titleUrl ?? '';
    const timestamp = entry.time ? new Date(entry.time).getTime() : undefined;

    // Determine interaction type from title prefix
    let interactionType: RawImportItem['interactionType'] = 'watched';
    if (entry.title.startsWith('Searched for')) interactionType = 'watched'; // Treat as engagement
    if (entry.title.startsWith('Visited')) interactionType = 'watched';

    items.push({
      externalId: url || `takeout_${timestamp ?? items.length}`,
      title,
      url: url || undefined,
      timestamp: timestamp && !isNaN(timestamp) ? timestamp : undefined,
      interactionType,
      metadata: {
        channel: entry.subtitles?.[0]?.name ?? '',
        products: entry.products ?? [],
      },
    });
  }

  return items;
}

/**
 * Parse a Meta (Instagram/Facebook) data export.
 */
export function parseMetaExport(data: MetaExportData): RawImportItem[] {
  const items: RawImportItem[] = [];

  const entries =
    data.likes_media_likes ?? data.saved_saved_media ?? data.your_topics?.topics ?? [];

  for (const entry of entries) {
    const media = entry.string_list_data?.[0];
    const title = entry.title ?? media?.value ?? 'Meta content';
    const url = media?.href ?? '';
    const timestamp = media?.timestamp ? media.timestamp * 1000 : undefined;

    items.push({
      externalId: `meta_${url || title.slice(0, 40)}`,
      title,
      url: url || undefined,
      timestamp,
      interactionType: data.likes_media_likes ? 'liked' : 'saved',
      metadata: {},
    });
  }

  return items;
}

/**
 * Parse a raw JSON file and return items based on detected format.
 */
export function parseGenericTakeout(jsonData: unknown, platform: string): RawImportData {
  const format = detectTakeoutFormat(jsonData);

  let items: RawImportItem[] = [];

  switch (format) {
    case 'google':
      items = parseGoogleTakeout(jsonData as GoogleTakeoutEntry[]);
      break;
    case 'meta':
      items = parseMetaExport(jsonData as MetaExportData);
      break;
    default:
      // Try to extract from generic array of objects
      if (Array.isArray(jsonData)) {
        items = (jsonData as Record<string, unknown>[])
          .filter((e) => typeof e.title === 'string' || typeof e.name === 'string')
          .map((e, i) => ({
            externalId: `generic_${i}`,
            title: (e.title ?? e.name ?? 'Unknown') as string,
            url: (e.url ?? e.link ?? e.href) as string | undefined,
            interactionType: 'watched' as const,
            metadata: e,
          }));
      }
  }

  return {
    platform,
    source: 'file_upload',
    items,
    scrapedAt: Date.now(),
  };
}

// ── Types ────────────────────────────────────────────────────────────────────

interface GoogleTakeoutEntry {
  title?: string;
  titleUrl?: string;
  time?: string;
  subtitles?: Array<{ name?: string; url?: string }>;
  products?: string[];
}

interface MetaExportData {
  likes_media_likes?: MetaEntry[];
  saved_saved_media?: MetaEntry[];
  your_topics?: { topics?: MetaEntry[] };
}

interface MetaEntry {
  title?: string;
  string_list_data?: Array<{
    value?: string;
    href?: string;
    timestamp?: number;
  }>;
}
