import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RssContentSource, parseRssItems } from '../curator/RssContentSource.js';
import { CuratorAgent } from '../curator/CuratorAgent.js';

const NOW_MS = Date.UTC(2026, 7, 10, 12); // 2026-08-10T12:00:00Z

function rssXml(items: string): string {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>q</title>${items}</channel></rss>`;
}

function item(title: string, link: string, pubDate: string, source = 'Some Site'): string {
  return `<item><title>${title}</title><link>${link}</link><pubDate>${pubDate}</pubDate><source url="https://x">${source}</source></item>`;
}

// ── Parser ──────────────────────────────────────────────────────────────────

describe('parseRssItems', () => {
  it('parses title, link, pubDate, source and classifies publishers by host', () => {
    const xml = rssXml(
      item(
        'Desk review',
        'https://www.theverge.com/desk-review',
        'Sun, 09 Aug 2026 10:00:00 GMT',
        'The Verge',
      ) +
        item(
          'Video teardown',
          'https://www.youtube.com/watch?v=abc123',
          'Sun, 09 Aug 2026 09:00:00 GMT',
          'YouTube',
        ) +
        item(
          'Thread',
          'https://www.reddit.com/r/desks/comments/x',
          'Sat, 08 Aug 2026 09:00:00 GMT',
        ) +
        item('Preprint', 'https://arxiv.org/abs/2608.01234', 'Fri, 07 Aug 2026 09:00:00 GMT'),
    );
    const items = parseRssItems(xml);
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({
      title: 'Desk review',
      url: 'https://www.theverge.com/desk-review',
      publisher: 'rss',
      source: 'The Verge',
    });
    expect(items[1]!.publisher).toBe('youtube');
    expect(items[2]!.publisher).toBe('reddit');
    expect(items[3]!.publisher).toBe('arxiv');
    expect(items[0]!.publishedAt).toBe(Date.parse('Sun, 09 Aug 2026 10:00:00 GMT'));
  });

  it('handles CDATA and XML entities in titles', () => {
    const xml = rssXml(
      `<item><title><![CDATA[Jarvis <v2> & friends]]></title><link>https://a.com/x</link><pubDate>Sun, 09 Aug 2026 10:00:00 GMT</pubDate></item>` +
        item(
          'Cheap &amp; cheerful &quot;desks&quot;',
          'https://b.com/y',
          'Sun, 09 Aug 2026 09:00:00 GMT',
        ),
    );
    const items = parseRssItems(xml);
    expect(items[0]!.title).toBe('Jarvis <v2> & friends');
    expect(items[1]!.title).toBe('Cheap & cheerful "desks"');
    // No <source> tag → hostname fallback.
    expect(items[0]!.source).toBe('a.com');
  });

  it('skips malformed items (bad date, bad URL, missing fields) without throwing', () => {
    const xml = rssXml(
      item('No date', 'https://a.com/x', 'not-a-date') +
        item('Bad url', 'not a url', 'Sun, 09 Aug 2026 10:00:00 GMT') +
        `<item><link>https://a.com/only-link</link></item>` +
        item('Good', 'https://a.com/good', 'Sun, 09 Aug 2026 10:00:00 GMT'),
    );
    const items = parseRssItems(xml);
    expect(items.map((i) => i.title)).toEqual(['Good']);
  });

  it('returns [] for garbage input', () => {
    expect(parseRssItems('')).toEqual([]);
    expect(parseRssItems('<html>not rss</html>')).toEqual([]);
  });
});

// ── Source behavior (fetch mocked) ──────────────────────────────────────────

describe('RssContentSource', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => vi.useFakeTimers({ now: NOW_MS }));
  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = realFetch;
  });

  function mockFetchOnceWith(xml: string): ReturnType<typeof vi.fn> {
    const mock = vi.fn(async () => new Response(xml, { status: 200 }));
    globalThis.fetch = mock as unknown as typeof fetch;
    return mock;
  }

  it('filters by sinceMs, sorts newest first, respects limit', async () => {
    mockFetchOnceWith(
      rssXml(
        item('old', 'https://a.com/old', new Date(NOW_MS - 40 * 86_400_000).toUTCString()) +
          item('day2', 'https://a.com/day2', new Date(NOW_MS - 2 * 86_400_000).toUTCString()) +
          item('day1', 'https://a.com/day1', new Date(NOW_MS - 1 * 86_400_000).toUTCString()) +
          item('day3', 'https://a.com/day3', new Date(NOW_MS - 3 * 86_400_000).toUTCString()),
      ),
    );
    const src = new RssContentSource();
    const items = await src.fetchFreshFor('standing-desks', NOW_MS - 7 * 86_400_000, 2);
    expect(items.map((i) => i.title)).toEqual(['day1', 'day2']);
  });

  it('caches per topic — a fan-out tick fetches each topic once', async () => {
    const mock = mockFetchOnceWith(
      rssXml(item('x', 'https://a.com/x', new Date(NOW_MS - 3600_000).toUTCString())),
    );
    const src = new RssContentSource();
    await src.fetchFreshFor('standing-desks', 0, 5);
    await src.fetchFreshFor('standing-desks', 0, 5);
    await src.fetchFreshFor('standing-desks', 0, 3);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('never throws: HTTP failure and network failure both yield [] (and cache the miss)', async () => {
    const failing = vi.fn(async () => new Response('nope', { status: 503 }));
    globalThis.fetch = failing as unknown as typeof fetch;
    const src = new RssContentSource();
    expect(await src.fetchFreshFor('t1', 0, 5)).toEqual([]);
    expect(await src.fetchFreshFor('t1', 0, 5)).toEqual([]);
    expect(failing).toHaveBeenCalledTimes(1); // failure cached — no hammering

    const throwing = vi.fn(async () => {
      throw new Error('ECONNRESET');
    });
    globalThis.fetch = throwing as unknown as typeof fetch;
    expect(await src.fetchFreshFor('t2', 0, 5)).toEqual([]);
  });
});

// ── Prod guard ──────────────────────────────────────────────────────────────

describe('CuratorAgent prod guard', () => {
  const savedEnv = {
    node: process.env.NODE_ENV,
    vendor: process.env.INTELLIGENCE_AGENTS_CONTENT_SOURCE,
  };
  afterEach(() => {
    process.env.NODE_ENV = savedEnv.node;
    if (savedEnv.vendor === undefined) delete process.env.INTELLIGENCE_AGENTS_CONTENT_SOURCE;
    else process.env.INTELLIGENCE_AGENTS_CONTENT_SOURCE = savedEnv.vendor;
  });

  const ctx = { userId: 'u1', trigger: 'scheduled' as const, now: new Date(NOW_MS) };

  it('refuses to run in production on the stub source (fabricated URLs must never ship)', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.INTELLIGENCE_AGENTS_CONTENT_SOURCE; // defaults to stub
    expect(await new CuratorAgent().canRun(ctx)).toBe(false);
  });

  it('runs in production once the rss vendor is configured', async () => {
    process.env.NODE_ENV = 'production';
    process.env.INTELLIGENCE_AGENTS_CONTENT_SOURCE = 'rss';
    expect(await new CuratorAgent().canRun(ctx)).toBe(true);
  });

  it('still runs on the stub outside production (dev/test ergonomics)', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.INTELLIGENCE_AGENTS_CONTENT_SOURCE;
    expect(await new CuratorAgent().canRun(ctx)).toBe(true);
  });
});
