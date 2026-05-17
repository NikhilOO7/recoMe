import { NextResponse } from 'next/server';

// ── /api/extract — server-side URL metadata extraction ──────────────────────
// Browser-side fetching of arbitrary URLs hits CORS for nearly every site,
// so the paste flow needs a server-side helper. Pure HTML scrape; no
// JS-rendered SPAs (those need a headless browser — out of scope for v1).
//
// Returns: { url, title, description, image, platform, topics }
//   - topics is a best-effort guess from <meta name="keywords">, og:tags,
//     and the URL path. Server LLM enrichment (claude/openai) is the
//     real fix and is documented as next step.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ExtractResult {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  platform: Platform;
  topics: string[];
}

type Platform =
  | 'youtube'
  | 'reddit'
  | 'amazon'
  | 'walmart'
  | 'ebay'
  | 'twitter'
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'linkedin'
  | 'generic';

function detectPlatform(host: string): Platform {
  const h = host.toLowerCase();
  if (h.includes('youtube.') || h === 'youtu.be') return 'youtube';
  if (h.includes('reddit.')) return 'reddit';
  if (h.includes('amazon.')) return 'amazon';
  if (h.includes('walmart.')) return 'walmart';
  if (h.includes('ebay.')) return 'ebay';
  if (h.includes('twitter.') || h.includes('x.com')) return 'twitter';
  if (h.includes('facebook.')) return 'facebook';
  if (h.includes('instagram.')) return 'instagram';
  if (h.includes('tiktok.')) return 'tiktok';
  if (h.includes('linkedin.')) return 'linkedin';
  return 'generic';
}

function pickMeta(html: string, names: string[]): string | null {
  for (const n of names) {
    // Match <meta name="..." content="..."> or <meta property="..." content="...">
    const re = new RegExp(
      `<meta[^>]+(?:name|property)=["']${n}["'][^>]+content=["']([^"']+)["']`,
      'i',
    );
    const m = html.match(re);
    if (m) return decodeEntities(m[1]);
    // Reversed attribute order.
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${n}["']`,
      'i',
    );
    const m2 = html.match(re2);
    if (m2) return decodeEntities(m2[1]);
  }
  return null;
}

function pickTitle(html: string): string | null {
  const og = pickMeta(html, ['og:title', 'twitter:title']);
  if (og) return og;
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? decodeEntities(m[1]) : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

function deriveTopics(input: {
  title: string | null;
  description: string | null;
  keywords: string | null;
  urlPath: string;
}): string[] {
  const out = new Set<string>();
  if (input.keywords) {
    for (const k of input.keywords.split(/[,;]/)) {
      const t = k.trim().toLowerCase();
      if (t.length >= 3 && t.length <= 60) out.add(t);
    }
  }
  // URL slug words as a weak signal — useful for product pages where
  // the path encodes the product name.
  for (const seg of input.urlPath.split(/[/-]/)) {
    const t = seg
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .trim();
    if (t.length >= 3 && t.length <= 40 && !/^\d+$/.test(t)) out.add(t);
  }
  return Array.from(out).slice(0, 10);
}

export async function POST(req: Request): Promise<Response> {
  let body: { url?: string };
  try {
    body = (await req.json()) as { url?: string };
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const raw = (body.url ?? '').trim();
  if (!raw) return NextResponse.json({ error: 'missing_url' }, { status: 400 });

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return NextResponse.json({ error: 'invalid_url' }, { status: 400 });
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return NextResponse.json({ error: 'unsupported_protocol' }, { status: 400 });
  }

  // SSRF guard — block obvious local/private network targets. Not a full
  // defense (DNS rebinding etc) but cheap and covers casual misuse.
  if (
    /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/i.test(u.hostname) ||
    u.hostname === '0.0.0.0'
  ) {
    return NextResponse.json({ error: 'blocked_host' }, { status: 400 });
  }

  let html: string;
  try {
    const res = await fetch(u.toString(), {
      headers: {
        // Polite UA — most sites serve the og: tags this way.
        'User-Agent': 'Mozilla/5.0 (compatible; RecomeBot/1.0; +https://recome.app/extractor)',
        Accept: 'text/html,application/xhtml+xml',
      },
      // Defensive timeout — abort if a remote hangs.
      signal: AbortSignal.timeout(8_000),
      redirect: 'follow',
    });
    if (!res.ok) {
      return NextResponse.json({ error: 'remote_error', status: res.status }, { status: 502 });
    }
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('text/html') && !ct.includes('application/xhtml')) {
      return NextResponse.json({ error: 'not_html', contentType: ct }, { status: 415 });
    }
    // Cap body to ~1 MB; og: tags are always in the <head> anyway.
    const buf = await res.arrayBuffer();
    html = new TextDecoder('utf-8', { fatal: false }).decode(buf.slice(0, 1_000_000));
  } catch (err) {
    return NextResponse.json(
      { error: 'fetch_failed', message: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  const title = pickTitle(html);
  const description = pickMeta(html, ['og:description', 'twitter:description', 'description']);
  const image = pickMeta(html, ['og:image', 'twitter:image']);
  const keywords = pickMeta(html, ['keywords']);

  const result: ExtractResult = {
    url: u.toString(),
    title,
    description,
    image,
    platform: detectPlatform(u.hostname),
    topics: deriveTopics({ title, description, keywords, urlPath: u.pathname }),
  };
  return NextResponse.json(result);
}
