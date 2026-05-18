import { describe, it, expect } from 'vitest';
import {
  buildComposition,
  buildTrajectory,
  findUnderrepresented,
  type TopicSignal,
} from '../PersonalityMirror.js';

/**
 * Unit tests for the pure helpers — no DB, no Neo4j. The service-level
 * lifecycle (enable / disable / wipe) is exercised by the integration suite
 * since it talks to Prisma.
 */

const NOW = new Date('2026-05-18T12:00:00Z');
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function clusterMap(entries: Array<[string, number]>): Map<string, number> {
  return new Map(entries);
}
function nameMap(entries: Array<[number, string]>): Map<number, string> {
  return new Map(entries);
}

describe('buildComposition', () => {
  it('rolls topic weights up to clusters and returns shares summing to 1', () => {
    const nodes = [
      { id: 't-distsys', weight: 8 },
      { id: 't-raft', weight: 4 },
      { id: 't-desks', weight: 3 },
      { id: 't-monitors', weight: 2 },
      { id: 't-orphan', weight: 5 }, // not in clusterByTopic — should be ignored
    ];
    const composition = buildComposition(
      nodes,
      clusterMap([
        ['t-distsys', 0],
        ['t-raft', 0],
        ['t-desks', 1],
        ['t-monitors', 1],
      ]),
      nameMap([
        [0, 'Distributed systems'],
        [1, 'Standing desks'],
      ]),
    );
    expect(composition.totalWeight).toBe(8 + 4 + 3 + 2);
    expect(composition.byCluster).toHaveLength(2);
    const total = composition.byCluster.reduce((s, c) => s + c.share, 0);
    expect(total).toBeCloseTo(1, 5);
    // Sorted by share desc, so distsys (12/17) comes first.
    expect(composition.byCluster[0]!.clusterId).toBe(0);
    expect(composition.byCluster[0]!.topicName).toBe('Distributed systems');
    expect(composition.byCluster[0]!.share).toBeCloseTo(12 / 17, 5);
  });

  it('returns empty result when there are no clusterable nodes', () => {
    const composition = buildComposition([], new Map(), new Map());
    expect(composition.totalWeight).toBe(0);
    expect(composition.byCluster).toEqual([]);
  });

  it('treats zero pageCount as weight=1 (floor)', () => {
    const composition = buildComposition(
      [{ id: 'a', weight: 0 }],
      clusterMap([['a', 0]]),
      nameMap([[0, 'A']]),
    );
    expect(composition.totalWeight).toBe(1);
    expect(composition.byCluster[0]!.share).toBe(1);
  });
});

describe('buildTrajectory', () => {
  it('buckets signals into 8 weeks aligned to now', () => {
    const signals: TopicSignal[] = [
      // Cluster 0 — Distributed systems — strong recently, fading earlier
      { topicId: 't-distsys', ts: NOW.getTime() - 1 * DAY_MS, weight: 3 },
      { topicId: 't-distsys', ts: NOW.getTime() - 9 * DAY_MS, weight: 2 },
      { topicId: 't-raft', ts: NOW.getTime() - 30 * DAY_MS, weight: 1 },
      // Cluster 1 — Home setup — steady
      { topicId: 't-desks', ts: NOW.getTime() - 5 * DAY_MS, weight: 2 },
      { topicId: 't-desks', ts: NOW.getTime() - 20 * DAY_MS, weight: 1 },
      // outside window — should be ignored
      { topicId: 't-desks', ts: NOW.getTime() - 100 * DAY_MS, weight: 5 },
    ];
    const traj = buildTrajectory(
      signals,
      clusterMap([
        ['t-distsys', 0],
        ['t-raft', 0],
        ['t-desks', 1],
      ]),
      nameMap([
        [0, 'Distributed systems'],
        [1, 'Standing desks'],
      ]),
      NOW,
      8,
    );
    expect(traj.weekEnds).toHaveLength(8);
    // weekEnds are ordered oldest → newest
    expect(traj.weekEnds[0]).toBeLessThan(traj.weekEnds[7]!);
    expect(traj.byCluster).toHaveLength(2);

    const distsys = traj.byCluster.find((r) => r.clusterId === 0)!;
    expect(distsys.weeks).toHaveLength(8);
    const distSum = distsys.weeks.reduce((s, w) => s + w, 0);
    // 3+2 from distsys + 1 from raft = 6 (the 100d-old signal is out of window)
    expect(distSum).toBe(6);

    // Most recent week should hold the 1-day-old signal (3 weight).
    expect(distsys.weeks[7]).toBe(3);
  });

  it('orders rows by total weight desc', () => {
    const signals: TopicSignal[] = [
      { topicId: 't1', ts: NOW.getTime() - 1 * DAY_MS, weight: 10 },
      { topicId: 't2', ts: NOW.getTime() - 1 * DAY_MS, weight: 2 },
    ];
    const traj = buildTrajectory(
      signals,
      clusterMap([
        ['t1', 1],
        ['t2', 0],
      ]),
      nameMap([
        [0, 'B'],
        [1, 'A'],
      ]),
      NOW,
      8,
    );
    expect(traj.byCluster[0]!.clusterId).toBe(1);
    expect(traj.byCluster[1]!.clusterId).toBe(0);
  });
});

describe('findUnderrepresented', () => {
  it('flags clusters dormant in the last 4 weeks but active in the 4–12 week range', () => {
    const signals: TopicSignal[] = [
      // Fitness — touched 6w ago, nothing since (dormant)
      { topicId: 't-fitness', ts: NOW.getTime() - 6 * WEEK_MS, weight: 3 },
      { topicId: 't-fitness', ts: NOW.getTime() - 7 * WEEK_MS, weight: 2 },
      // Distsys — touched 1w ago (active)
      { topicId: 't-distsys', ts: NOW.getTime() - 1 * WEEK_MS, weight: 5 },
      // Reading — touched only outside lookback (excluded)
      { topicId: 't-reading', ts: NOW.getTime() - 20 * WEEK_MS, weight: 4 },
    ];
    const result = findUnderrepresented(
      signals,
      clusterMap([
        ['t-fitness', 2],
        ['t-distsys', 0],
        ['t-reading', 3],
      ]),
      nameMap([
        [0, 'Distributed systems'],
        [2, 'Fitness'],
        [3, 'Reading'],
      ]),
      NOW,
      4,
      12,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.clusterId).toBe(2);
    expect(result[0]!.topicName).toBe('Fitness');
    expect(result[0]!.pastWeight).toBe(5);
    // ~6 weeks dormant → 42 days; tolerate ±1 from timestamp arithmetic.
    expect(result[0]!.daysDormant).toBeGreaterThanOrEqual(41);
    expect(result[0]!.daysDormant).toBeLessThanOrEqual(43);
  });

  it('does not flag clusters that have any signal in the dormant window', () => {
    const signals: TopicSignal[] = [
      { topicId: 't', ts: NOW.getTime() - 8 * WEEK_MS, weight: 3 },
      { topicId: 't', ts: NOW.getTime() - 2 * WEEK_MS, weight: 1 }, // recent enough to disqualify
    ];
    const result = findUnderrepresented(
      signals,
      clusterMap([['t', 0]]),
      nameMap([[0, 'T']]),
      NOW,
      4,
      12,
    );
    expect(result).toEqual([]);
  });

  it('orders results by pastWeight desc', () => {
    const signals: TopicSignal[] = [
      { topicId: 'a', ts: NOW.getTime() - 8 * WEEK_MS, weight: 3 },
      { topicId: 'b', ts: NOW.getTime() - 8 * WEEK_MS, weight: 10 },
    ];
    const result = findUnderrepresented(
      signals,
      clusterMap([
        ['a', 0],
        ['b', 1],
      ]),
      nameMap([
        [0, 'A'],
        [1, 'B'],
      ]),
      NOW,
      4,
      12,
    );
    expect(result.map((r) => r.clusterId)).toEqual([1, 0]);
  });
});
