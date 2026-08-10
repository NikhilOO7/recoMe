import { describe, it, expect, beforeEach } from 'vitest';
import {
  CuratorAgent,
  pickByTopic,
  pickHeadline,
  dormancyToLabel,
  type ScoredItem,
} from '../curator/CuratorAgent.js';
import {
  StubContentSource,
  setContentSource,
  type ContentSource,
  type FreshItem,
} from '../curator/ContentSource.js';
import { findFreshForTopic, rssFetch, youtubeUploadsCheck } from '../curator/tools.js';
import type { AgentContext } from '../types.js';

const NOW_MS = Date.UTC(2026, 4, 18, 12); // 2026-05-18T12:00:00Z
const NOW = new Date(NOW_MS);

/** Controllable source: per-topic items, no real fetching. */
class FixtureContentSource implements ContentSource {
  readonly name = 'fixture';
  constructor(private readonly byTopic: Record<string, FreshItem[]>) {}
  async fetchFreshFor(topic: string, sinceMs: number, limit: number): Promise<FreshItem[]> {
    const list = this.byTopic[topic] ?? [];
    return list.filter((i) => i.publishedAt > sinceMs).slice(0, limit);
  }
}

function freshItem(over: Partial<FreshItem>): FreshItem {
  return {
    title: 'Stub item',
    url: 'https://example.com/x',
    publisher: 'rss',
    source: 'Example',
    publishedAt: NOW_MS - 60 * 60 * 1000,
    ...over,
  };
}

function scored(over: Partial<ScoredItem>): ScoredItem {
  return {
    item: freshItem({}),
    topicNormalizedName: 'distributed-systems',
    topicDisplayName: 'Distributed systems',
    dormancyMs: 0,
    score: 1,
    ...over,
  };
}

describe('CuratorAgent helpers', () => {
  it('dormancyToLabel formats correctly across ranges', () => {
    expect(dormancyToLabel(0)).toBe('');
    expect(dormancyToLabel(3 * 86_400_000)).toBe('');
    expect(dormancyToLabel(9 * 86_400_000)).toBe(' (dormant 9d)');
    expect(dormancyToLabel(21 * 86_400_000)).toBe(' (dormant 3w)');
    expect(dormancyToLabel(40 * 86_400_000)).toBe(' (dormant 1mo+)');
  });

  it('pickByTopic caps one per topic', () => {
    const xs: ScoredItem[] = [
      scored({ topicNormalizedName: 'A', score: 5 }),
      scored({ topicNormalizedName: 'A', score: 4 }),
      scored({ topicNormalizedName: 'B', score: 3 }),
      scored({ topicNormalizedName: 'C', score: 2 }),
    ];
    const picks = pickByTopic(xs, 3);
    expect(picks.map((p) => p.topicNormalizedName)).toEqual(['A', 'B', 'C']);
  });

  it('pickByTopic respects the limit', () => {
    const xs: ScoredItem[] = [
      scored({ topicNormalizedName: 'A' }),
      scored({ topicNormalizedName: 'B' }),
      scored({ topicNormalizedName: 'C' }),
      scored({ topicNormalizedName: 'D' }),
    ];
    expect(pickByTopic(xs, 2)).toHaveLength(2);
  });

  it('pickHeadline calls out dormant topics by name', () => {
    const headline = pickHeadline([
      scored({
        topicNormalizedName: 'climate-policy',
        topicDisplayName: 'Climate policy',
        dormancyMs: 21 * 86_400_000,
      }),
      scored({ topicNormalizedName: 'other', topicDisplayName: 'Other' }),
    ]);
    expect(headline).toContain('Climate policy');
    expect(headline).toContain('dormant 3w');
  });

  it('pickHeadline avoids dormancy phrasing for fresh topics', () => {
    const headline = pickHeadline([scored({ topicDisplayName: 'Standing desks', dormancyMs: 0 })]);
    expect(headline).toContain('fresh');
    expect(headline).not.toContain('dormant');
  });
});

describe('Curator tools — fixture source', () => {
  beforeEach(() => setContentSource(new StubContentSource()));

  it('findFreshForTopic filters by publishedAt > sinceMs and sorts by recency', async () => {
    const items: FreshItem[] = [
      freshItem({ title: 'A', publishedAt: NOW_MS - 1 * 86_400_000 }),
      freshItem({ title: 'B', publishedAt: NOW_MS - 5 * 86_400_000 }),
      freshItem({ title: 'C', publishedAt: NOW_MS - 12 * 86_400_000 }), // older than sinceMs
    ];
    const source = new FixtureContentSource({ 'distributed-systems': items });
    const fresh = await findFreshForTopic(
      'distributed-systems',
      NOW_MS - 10 * 86_400_000,
      { nowMs: NOW_MS },
      source,
    );
    expect(fresh.map((i) => i.title)).toEqual(['A', 'B']);
  });

  it('rssFetch only returns rss / substack / arxiv items', async () => {
    const items: FreshItem[] = [
      freshItem({ title: 'rss', publisher: 'rss' }),
      freshItem({ title: 'yt', publisher: 'youtube' }),
      freshItem({ title: 'substack', publisher: 'substack' }),
    ];
    const source = new FixtureContentSource({ t: items });
    const rss = await rssFetch('t', 0, 5, source);
    expect(rss.map((i) => i.publisher).sort()).toEqual(['rss', 'substack']);
  });

  it('youtubeUploadsCheck only returns youtube items', async () => {
    const items: FreshItem[] = [
      freshItem({ title: 'rss', publisher: 'rss' }),
      freshItem({ title: 'yt', publisher: 'youtube' }),
    ];
    const source = new FixtureContentSource({ t: items });
    const yt = await youtubeUploadsCheck('t', 0, 5, source);
    expect(yt).toHaveLength(1);
    expect(yt[0]!.publisher).toBe('youtube');
  });
});

describe('StubContentSource', () => {
  it('returns fixture items for known topics, fresh-windowed by publishedAt', async () => {
    const s = new StubContentSource();
    const items = await s.fetchFreshFor('distributed-systems', NOW_MS - 30 * 86_400_000, 5);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]!.publisher).toBe('rss');
    expect(items[0]!.publishedAt).toBeGreaterThan(NOW_MS - 30 * 86_400_000);
  });

  it('synthesizes one entry for topics with no fixture', async () => {
    const s = new StubContentSource();
    const items = await s.fetchFreshFor('made-up-topic', 0, 5);
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toContain('made up topic');
  });
});

describe('CuratorAgent.canRun', () => {
  const agent = new CuratorAgent();

  it('runs on scheduled trigger', async () => {
    const ctx: AgentContext = { userId: 'u', trigger: 'scheduled', now: NOW };
    expect(await agent.canRun(ctx)).toBe(true);
  });

  it('skips event triggers (those are for Recall / Concierge)', async () => {
    const ctx: AgentContext = { userId: 'u', trigger: 'event', now: NOW };
    expect(await agent.canRun(ctx)).toBe(false);
  });

  it('skips on_demand triggers (Decision agent territory)', async () => {
    const ctx: AgentContext = { userId: 'u', trigger: 'on_demand', now: NOW };
    expect(await agent.canRun(ctx)).toBe(false);
  });
});
