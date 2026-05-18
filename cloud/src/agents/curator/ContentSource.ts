import { logger } from '../../observability/logger.js';

/**
 * ContentSource — the interface Curator content-discovery tools compose
 * against. Same shape as PriceFetcher (ADR-0017): one contract for the
 * agent, swappable backends for real RSS / YouTube / Reddit / Substack / arXiv.
 *
 * v1 ships with a stub. The real implementations land per source:
 *   - RSS / Atom        → tiny fetch + parse (free)
 *   - YouTube uploads   → YouTube Data API v3 (free up to 10k units/day)
 *   - Reddit            → Reddit JSON endpoints (free, rate-limited)
 *   - Substack / arXiv  → RSS surfaces both
 *
 * No agent calls the source directly — they go through the
 * `findFreshForTopic` tool which adds the user-side scoring + dedupe.
 */

export type ContentPublisher = 'rss' | 'youtube' | 'reddit' | 'substack' | 'arxiv';

export interface FreshItem {
  title: string;
  url: string;
  publisher: ContentPublisher;
  /** Feed / channel / subreddit name shown to the user. */
  source: string;
  /** ISO ms epoch when the item was originally published. */
  publishedAt: number;
  /** Short excerpt — used only when present + concise enough for a card body. */
  summary?: string;
  /** Author / creator when known. */
  author?: string;
}

export interface ContentSource {
  readonly name: string;
  /**
   * Items published *strictly after* `sinceMs` that are likely relevant to
   * `topicNormalizedName`. Implementations decide their own freshness window
   * (e.g. RSS only stores recent items anyway). Returns at most `limit`.
   */
  fetchFreshFor(topicNormalizedName: string, sinceMs: number, limit: number): Promise<FreshItem[]>;
}

// ── StubContentSource ──────────────────────────────────────────────────────
// Deterministic items per topic, bucketed by day so repeated calls in a single
// pass return identical results. Topics not in the fixture map fall through to
// a generated entry so the agent loop is exercised even on fresh users.

const FIXTURES: Record<string, ReadonlyArray<Omit<FreshItem, 'publishedAt'>>> = {
  'distributed-systems': [
    {
      title: 'Strong consistency in a partitioned cache layer',
      url: 'https://martin.kleppmann.com/2026/05/strong-consistency-cache.html',
      publisher: 'rss',
      source: 'Martin Kleppmann',
      author: 'Martin Kleppmann',
      summary:
        'A treatment of cache invalidation under partition that does not punt on the hard cases.',
    },
    {
      title: 'Jepsen tests etcd 3.6 under network partitions',
      url: 'https://www.youtube.com/watch?v=stub-jepsen-etcd',
      publisher: 'youtube',
      source: 'Jepsen',
      summary: 'A 47-minute deep dive on linearizability regressions in the 3.6 release.',
    },
  ],
  'standing-desks': [
    {
      title: 'Branch Duo vs Uplift V2 after 6 months — wobble, motors, regret',
      url: 'https://www.reddit.com/r/standing_desks/comments/stub-branch',
      publisher: 'reddit',
      source: 'r/standing_desks',
      summary: 'Two-machine comparison from a heavy user. Talks bearings and warranty experience.',
    },
  ],
  'climate-adaptation': [
    {
      title: 'Adaptation policy after the Bonn talks',
      url: 'https://substack.example/climate-adaptation/post-2026-05',
      publisher: 'substack',
      source: 'Climate Policy Notes',
      author: 'Tyler Cowen-style aggregator',
      summary: 'Where Bonn left us on adaptation finance, what to read next.',
    },
  ],
  'espresso-setup': [
    {
      title: 'Lance Hedrick on Lelit Mara X — long-term review',
      url: 'https://www.youtube.com/watch?v=stub-lance-mara-x',
      publisher: 'youtube',
      source: 'Lance Hedrick',
      summary:
        '23-minute review covering boiler stability and pre-infusion. Mentions the $1,449 sale.',
    },
  ],
  'llm-ops': [
    {
      title: 'Memory architectures for long-running agents (paper)',
      url: 'https://arxiv.org/abs/2026.05-stub-memory-agents',
      publisher: 'arxiv',
      source: 'arXiv cs.AI',
      summary: 'Anthropic team formalises the per-job vs per-user memory split.',
    },
  ],
};

const DAY_MS = 24 * 60 * 60 * 1000;

export class StubContentSource implements ContentSource {
  readonly name = 'stub';

  async fetchFreshFor(
    topicNormalized: string,
    sinceMs: number,
    limit: number,
  ): Promise<FreshItem[]> {
    const fixtures = FIXTURES[topicNormalized];
    const items: FreshItem[] = [];
    const now = Date.now();
    // Anchor publishedAt within the past 0–3 days so they're always "fresh".
    let offset = 4 * 60 * 60 * 1000; // 4h ago for the first
    for (const f of fixtures ?? []) {
      const publishedAt = now - offset;
      if (publishedAt > sinceMs) items.push({ ...f, publishedAt });
      offset += DAY_MS;
      if (items.length >= limit) break;
    }
    // Topic-without-fixture fallback: synthesize one entry so the loop
    // still has something to show. Generated so it's stable per (topic, day).
    if (items.length === 0 && limit > 0) {
      const bucket = Math.floor(now / DAY_MS);
      const slug = topicNormalized.replace(/-/g, ' ');
      items.push({
        title: `Reading list update: ${slug}`,
        url: `https://recome.app/reads/${topicNormalized}?bucket=${bucket}`,
        publisher: 'rss',
        source: 'Curated feed',
        publishedAt: now - 6 * 60 * 60 * 1000,
        summary: `Fresh material on ${slug} surfaced by Curator (stub source).`,
      });
    }
    logger.debug({ topicNormalized, sinceMs, count: items.length }, 'stub content source');
    return items;
  }
}

// ── Selection (same pattern as PriceFetcher) ────────────────────────────────

let svc: ContentSource | null = null;

export function getContentSource(): ContentSource {
  if (svc) return svc;
  const vendor = process.env.INTELLIGENCE_AGENTS_CONTENT_SOURCE ?? 'stub';
  switch (vendor) {
    case 'stub':
      svc = new StubContentSource();
      break;
    // case 'rss-multi': svc = new RssMultiContentSource(...); break;       // v1.1
    // case 'youtube':   svc = new YoutubeContentSource(...); break;
    default:
      logger.warn({ vendor }, 'unknown content source, falling back to stub');
      svc = new StubContentSource();
  }
  return svc;
}

/** Test seam. */
export function setContentSource(source: ContentSource): void {
  svc = source;
}
