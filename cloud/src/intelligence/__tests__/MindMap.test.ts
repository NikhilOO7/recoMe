import { describe, it, expect } from 'vitest';
import { buildMindMap, parseWindowParam } from '../MindMap.js';
import type { MindMapGraphRows } from '../../graph/GraphRepository.js';

const NOW = Date.UTC(2026, 4, 18, 12);

/** Two well-separated clusters of 3 nodes each, no inter-cluster edges. */
function twoClusterFixture(): MindMapGraphRows {
  return {
    nodes: [
      n('a1', 'Distributed systems', 10),
      n('a2', 'Raft', 6),
      n('a3', 'Kleppmann', 5),
      n('b1', 'Standing desks', 8),
      n('b2', 'Uplift V2', 4),
      n('b3', 'Monitors', 3),
    ],
    edges: [
      e('a1', 'a2', 4),
      e('a2', 'a3', 3),
      e('a1', 'a3', 2),
      e('b1', 'b2', 5),
      e('b2', 'b3', 2),
      e('b1', 'b3', 2),
    ],
  };
}

function n(id: string, name: string, pageCount: number): MindMapGraphRows['nodes'][number] {
  return {
    id,
    name,
    pageCount,
    totalDwell: pageCount * 1000,
    lastSeen: NOW - 60_000,
    platforms: ['youtube'],
  };
}
function e(source: string, target: string, weight: number): MindMapGraphRows['edges'][number] {
  return { source, target, weight };
}

describe('buildMindMap', () => {
  it('returns empty result for no nodes', () => {
    const result = buildMindMap({ nodes: [], edges: [] }, 90 * 86_400_000, NOW);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.clusters).toEqual([]);
    expect(result.generatedAt).toBe(NOW);
  });

  it('assigns cluster ids and orders them by size desc', () => {
    const fixture = twoClusterFixture();
    const result = buildMindMap(fixture, 90 * 86_400_000, NOW);
    expect(result.nodes).toHaveLength(6);
    expect(result.edges).toHaveLength(6);
    // 2 communities expected, each size 3.
    expect(result.clusters).toHaveLength(2);
    expect(result.clusters[0]!.size).toBe(3);
    expect(result.clusters[1]!.size).toBe(3);
    // Cluster 0 is the larger; tie broken arbitrarily but both members + topicName populated.
    expect(result.clusters[0]!.members.length).toBe(3);
    expect(typeof result.clusters[0]!.topicName).toBe('string');
  });

  it('keeps the two A-cluster nodes together and the two B-cluster nodes together', () => {
    const fixture = twoClusterFixture();
    const result = buildMindMap(fixture, 90 * 86_400_000, NOW);
    const clusterOf = (id: string) => result.nodes.find((n) => n.id === id)!.cluster;
    expect(clusterOf('a1')).toBe(clusterOf('a2'));
    expect(clusterOf('a2')).toBe(clusterOf('a3'));
    expect(clusterOf('b1')).toBe(clusterOf('b2'));
    expect(clusterOf('b2')).toBe(clusterOf('b3'));
    expect(clusterOf('a1')).not.toBe(clusterOf('b1'));
  });

  it('orders cluster members by weight desc — top member names the cluster', () => {
    const fixture = twoClusterFixture();
    const result = buildMindMap(fixture, 90 * 86_400_000, NOW);
    const aCluster = result.clusters.find((c) => c.members.includes('a1'))!;
    // a1 has pageCount 10 (highest in its cluster).
    expect(aCluster.members[0]).toBe('a1');
    expect(aCluster.topicName).toBe('Distributed systems');
  });

  it('treats a single isolated node as one cluster (no edges)', () => {
    const result = buildMindMap(
      { nodes: [n('only', 'Espresso', 4)], edges: [] },
      90 * 86_400_000,
      NOW,
    );
    expect(result.nodes).toHaveLength(1);
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0]!.size).toBe(1);
  });

  it('drops edges pointing at unknown nodes (defensive)', () => {
    const result = buildMindMap(
      {
        nodes: [n('a', 'A', 3), n('b', 'B', 3)],
        edges: [e('a', 'b', 1), e('a', 'ghost', 1)],
      },
      90 * 86_400_000,
      NOW,
    );
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]!.source).toBe('a');
    expect(result.edges[0]!.target).toBe('b');
  });

  it('node weight defaults to ≥1 even when pageCount is 0', () => {
    const result = buildMindMap(
      { nodes: [{ ...n('a', 'A', 0), pageCount: 0 }], edges: [] },
      90 * 86_400_000,
      NOW,
    );
    expect(result.nodes[0]!.weight).toBe(1);
  });
});

describe('parseWindowParam', () => {
  it('defaults to 90 days when undefined or empty', () => {
    expect(parseWindowParam(undefined)).toBe(90 * 86_400_000);
    expect(parseWindowParam('')).toBe(90 * 86_400_000);
  });

  it('parses day / week / month / year units', () => {
    expect(parseWindowParam('7d')).toBe(7 * 86_400_000);
    expect(parseWindowParam('2w')).toBe(14 * 86_400_000);
    expect(parseWindowParam('3mo')).toBe(90 * 86_400_000);
    expect(parseWindowParam('1y')).toBe(365 * 86_400_000);
  });

  it('clamps below 1 day up and above 365 days down', () => {
    expect(parseWindowParam('1000y')).toBe(365 * 86_400_000);
    // 100ms → clamped to 1 day minimum
    expect(parseWindowParam('100')).toBe(86_400_000);
  });

  it('accepts raw ms numbers', () => {
    expect(parseWindowParam(`${30 * 86_400_000}`)).toBe(30 * 86_400_000);
  });

  it('falls back to default on garbage input', () => {
    expect(parseWindowParam('garbage')).toBe(90 * 86_400_000);
  });
});
