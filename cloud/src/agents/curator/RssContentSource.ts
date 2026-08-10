import type { ContentSource, ContentPublisher, FreshItem } from './ContentSource.js';
import { logger } from '../../observability/logger.js';

// ── RssContentSource — the first real Curator vendor ────────────────────────
// Google News RSS search: keyless, universal topic coverage, real URLs.
// One GET per (topic, ~20min) thanks to the TTL cache, so a full curator
// fan-out tick stays polite.
//
// Failure posture (PRODUCT.md P6 / engineering mandate):
//   - hard request timeout (no hanging agent ticks)
//   - response size cap (a hostile/broken feed can't balloon memory)
//   - NEVER throws — any failure logs and returns [], and the agent's
//     "skip when nothing fresh" path handles the rest.

const FETCH_TIMEOUT_MS = 6_000;
const MAX_BODY_BYTES = 1_048_576; // 1 MiB — a search feed is ~50 KB
const CACHE_TTL_MS = 20 * 60 * 1000;
const USER_AGENT = 'RecoMeCurator/1.0 (+https://recome.app)';

interface CacheEntry {
  at: number;
  items: FreshItem[];
}

export class RssContentSource implements ContentSource {
  readonly name = 'rss';
  private cache = new Map<string, CacheEntry>();

  async fetchFreshFor(
    topicNormalizedName: string,
    sinceMs: number,
    limit: number,
  ): Promise<FreshItem[]> {
    const all = await this.fetchTopic(topicNormalizedName);
    return all
      .filter((i) => i.publishedAt > sinceMs)
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .slice(0, Math.max(0, limit));
  }

  private async fetchTopic(topicNormalizedName: string): Promise<FreshItem[]> {
    const cached = this.cache.get(topicNormalizedName);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.items;

    const query = topicNormalizedName.replace(/-/g, ' ');
    const url =
      'https://news.google.com/rss/search?q=' +
      encodeURIComponent(query) +
      '&hl=en-US&gl=US&ceid=US:en';

    let xml: string;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { 'user-agent': USER_AGENT, accept: 'application/rss+xml, application/xml' },
        });
        if (!res.ok) {
          logger.warn({ topicNormalizedName, status: res.status }, 'rss source: non-200');
          return this.remember(topicNormalizedName, []);
        }
        const text = await res.text();
        xml = text.length > MAX_BODY_BYTES ? text.slice(0, MAX_BODY_BYTES) : text;
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      logger.warn({ err, topicNormalizedName }, 'rss source: fetch failed');
      return this.remember(topicNormalizedName, []);
    }

    const items = parseRssItems(xml);
    logger.debug({ topicNormalizedName, count: items.length }, 'rss source: fetched');
    return this.remember(topicNormalizedName, items);
  }

  private remember(topic: string, items: FreshItem[]): FreshItem[] {
    // Failures are cached too — a dead feed shouldn't be re-hit on every
    // user in a fan-out tick.
    this.cache.set(topic, { at: Date.now(), items });
    return items;
  }

  /** Test seam. */
  clearCache(): void {
    this.cache.clear();
  }
}

// ── RSS 2.0 item parsing ────────────────────────────────────────────────────
// Tolerant, dependency-free parsing of the narrow shape Google News emits:
// <item><title>…</title><link>…</link><pubDate>…</pubDate><source>…</source>.
// CDATA and the five XML entities are handled; anything unparseable is
// skipped, never thrown.

export function parseRssItems(xml: string): FreshItem[] {
  const out: FreshItem[] = [];
  const itemBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/g) ?? [];
  for (const block of itemBlocks) {
    const title = textOf(block, 'title');
    const link = textOf(block, 'link');
    const pubDate = textOf(block, 'pubDate');
    if (!title || !link || !pubDate) continue;
    const publishedAt = Date.parse(pubDate);
    if (Number.isNaN(publishedAt)) continue;

    let urlHost = '';
    try {
      urlHost = new URL(link).hostname;
    } catch {
      continue; // not a real URL — skip rather than emit garbage
    }

    out.push({
      title,
      url: link,
      publisher: publisherFor(urlHost),
      source: textOf(block, 'source') || urlHost,
      publishedAt,
    });
  }
  return out;
}

function textOf(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!m?.[1]) return '';
  let text = m[1].trim();
  const cdata = text.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata?.[1] !== undefined) text = cdata[1].trim();
  return decodeEntities(text);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function publisherFor(host: string): ContentPublisher {
  const h = host.toLowerCase();
  if (h.includes('youtube.com') || h.includes('youtu.be')) return 'youtube';
  if (h.includes('reddit.com')) return 'reddit';
  if (h.includes('substack.com')) return 'substack';
  if (h.includes('arxiv.org')) return 'arxiv';
  return 'rss';
}
