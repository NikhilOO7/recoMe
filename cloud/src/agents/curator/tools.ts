import { getContentSource, type ContentSource, type FreshItem } from './ContentSource.js';

/**
 * Curator tools (ADR-0012 §2.2).
 *
 * v1 keeps three tools, all built on the ContentSource interface:
 *   - rssFetch                — single RSS/Atom-shaped fetch
 *   - youtubeUploadsCheck     — uploads-since for a channel handle
 *   - findFreshForTopic       — the agent's primary entry point: items
 *                               published since a cutoff, ranked for one topic
 *
 * The first two are passthroughs to the source today (the stub doesn't
 * distinguish publishers internally); they exist as named tools because
 * real backends will be different code paths (RSS parser vs YouTube API).
 */

export interface FindFreshOpts {
  /** Cap on items returned. Default 5. */
  limit?: number;
  /** How long an item can have existed before we no longer call it "fresh". */
  maxAgeMs?: number;
  /**
   * Wall-clock for the freshness cutoff. Agents must pass ctx.now.getTime()
   * (types.ts convention: no Date.now() inside agent code paths — it makes
   * behavior untestable and time-dependent). Defaults to Date.now() only for
   * non-agent callers.
   */
  nowMs?: number;
}

export async function findFreshForTopic(
  topicNormalizedName: string,
  sinceMs: number,
  opts: FindFreshOpts = {},
  source: ContentSource = getContentSource(),
): Promise<FreshItem[]> {
  const limit = opts.limit ?? 5;
  const items = await source.fetchFreshFor(topicNormalizedName, sinceMs, limit);
  const maxAge = opts.maxAgeMs ?? 30 * 24 * 60 * 60 * 1000; // 30d
  const cutoff = (opts.nowMs ?? Date.now()) - maxAge;
  return items
    .filter((i) => i.publishedAt > cutoff && i.publishedAt > sinceMs)
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, limit);
}

// ── Passthroughs (real impls will diverge per backend) ─────────────────────

export async function rssFetch(
  topicNormalizedName: string,
  sinceMs: number,
  limit = 5,
  source: ContentSource = getContentSource(),
): Promise<FreshItem[]> {
  const all = await source.fetchFreshFor(topicNormalizedName, sinceMs, limit);
  return all.filter(
    (i) => i.publisher === 'rss' || i.publisher === 'substack' || i.publisher === 'arxiv',
  );
}

export async function youtubeUploadsCheck(
  topicNormalizedName: string,
  sinceMs: number,
  limit = 5,
  source: ContentSource = getContentSource(),
): Promise<FreshItem[]> {
  const all = await source.fetchFreshFor(topicNormalizedName, sinceMs, limit);
  return all.filter((i) => i.publisher === 'youtube');
}
