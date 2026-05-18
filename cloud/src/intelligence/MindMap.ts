import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';
import type { GraphRepository, MindMapGraphRows } from '../graph/GraphRepository.js';
import { logger } from '../observability/logger.js';

/**
 * MindMapService (ADR-0014 F-401).
 *
 * Builds the user-facing mind-map view: their own topics + co-occurrence
 * edges + Louvain community assignments. The shape is what the /mind UI
 * renders directly — no client-side post-processing required.
 *
 * Design choices:
 *
 *   - Clustering runs in TypeScript (graphology-communities-louvain) rather
 *     than Cypher, because Neo4j Community Edition does not ship the GDS
 *     plugin and a user-scoped subgraph is ≤200 nodes — well within the
 *     range Louvain in-process handles instantly.
 *
 *   - Cache is process-local for v1 (5min LRU). Per-user, per-window key.
 *     Hot-reload via "soft-invalidate on signal write" is a v1.1 add when
 *     we have user traffic to inform the staleness budget.
 *
 *   - Output coordinates are NOT computed here — force-directed layout
 *     runs in the browser (react-force-graph) so the user can drag.
 */

export interface MindMapNode {
  id: string;
  name: string;
  /** UI sizing — pageCount, kept here as the canonical "weight". */
  weight: number;
  /** Louvain cluster id (small integer). */
  cluster: number;
  /** ms since the user last touched this topic. UI marks dormant. */
  lastSeen: number;
  platforms: string[];
}

export interface MindMapEdge {
  source: string;
  target: string;
  weight: number;
}

export interface MindMapCluster {
  id: number;
  /** Topic ids that belong to this cluster, ordered by weight desc. */
  members: string[];
  /** Top member's display name — used as the default cluster label in the UI. */
  topicName: string;
  size: number;
}

export interface MindMap {
  windowMs: number;
  generatedAt: number;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  clusters: MindMapCluster[];
}

interface CacheEntry {
  result: MindMap;
  expiresAt: number;
}

const DEFAULT_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;
const MIN_WINDOW_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;

export class MindMapService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly graph: GraphRepository) {}

  async getMindMap(
    userId: string,
    opts: { windowMs?: number; nodeLimit?: number; edgeLimit?: number; cache?: boolean } = {},
  ): Promise<MindMap> {
    const windowMs = clampWindow(opts.windowMs ?? DEFAULT_WINDOW_MS);
    const cacheKey = `${userId}::${windowMs}`;
    const now = Date.now();
    if (opts.cache !== false) {
      const hit = this.cache.get(cacheKey);
      if (hit && hit.expiresAt > now) return hit.result;
    }

    const since = now - windowMs;
    const rows = await this.graph.getMindMapGraph(userId, since, {
      nodeLimit: opts.nodeLimit,
      edgeLimit: opts.edgeLimit,
    });
    const result = buildMindMap(rows, windowMs, now);

    if (opts.cache !== false) {
      this.cache.set(cacheKey, { result, expiresAt: now + CACHE_TTL_MS });
    }
    return result;
  }

  /** Invalidate this user's cached mind-maps. Called when a new signal lands. */
  invalidate(userId: string): void {
    for (const k of this.cache.keys()) {
      if (k.startsWith(`${userId}::`)) this.cache.delete(k);
    }
  }
}

// ── Pure builder (testable without DB) ─────────────────────────────────────

/**
 * Build the MindMap from raw rows. Exported for unit tests.
 *
 * Steps:
 *   1. Build a graphology UndirectedGraph from nodes + edges.
 *   2. Run Louvain on the weighted graph to get a partition.
 *   3. Re-map cluster ids to dense integers, ordered by cluster size.
 *   4. Sort cluster members by weight, set the top member's display name.
 *   5. Return the assembled MindMap.
 */
export function buildMindMap(rows: MindMapGraphRows, windowMs: number, now = Date.now()): MindMap {
  const generatedAt = now;
  if (rows.nodes.length === 0) {
    return { windowMs, generatedAt, nodes: [], edges: [], clusters: [] };
  }

  // 1) Build graphology graph. We mark edge weights so Louvain uses them.
  const g = new Graph({ type: 'undirected', multi: false, allowSelfLoops: false });
  rows.nodes.forEach((n) => {
    g.addNode(n.id, { weight: n.pageCount });
  });
  rows.edges.forEach((e) => {
    if (!g.hasNode(e.source) || !g.hasNode(e.target)) return;
    if (g.hasEdge(e.source, e.target)) return;
    g.addEdge(e.source, e.target, { weight: e.weight });
  });

  // 2) Louvain. The lib returns a record of node→partitionId.
  // For graphs with ≥1 edge it runs the real algorithm; an edgeless graph
  // gets each node in its own cluster, which is what we want anyway.
  let partition: Record<string, number>;
  try {
    if (g.size > 0) {
      partition = louvain(g, { getEdgeWeight: 'weight' });
    } else {
      partition = {};
      g.forEachNode((id) => {
        partition[id] = 0;
      });
    }
  } catch (err) {
    // If Louvain fails (corrupt input), degrade gracefully: every node in its
    // own cluster. The UI still renders; the graph just looks under-clustered.
    logger.warn({ err }, 'mindmap: louvain failed, falling back to singleton clusters');
    partition = {};
    let i = 0;
    g.forEachNode((id) => {
      partition[id] = i++;
    });
  }

  // 3) Re-map cluster ids to dense integers ordered by cluster size (biggest = 0).
  const sizeByOriginal = new Map<number, number>();
  for (const id of Object.values(partition)) {
    sizeByOriginal.set(id, (sizeByOriginal.get(id) ?? 0) + 1);
  }
  const ordered = [...sizeByOriginal.entries()].sort((a, b) => b[1] - a[1]);
  const remap = new Map<number, number>();
  ordered.forEach(([orig], idx) => remap.set(orig, idx));

  // 4) Assemble nodes + cluster summaries.
  const nodeById = new Map(rows.nodes.map((n) => [n.id, n]));
  const nodes: MindMapNode[] = rows.nodes.map((n) => ({
    id: n.id,
    name: n.name,
    weight: Math.max(1, n.pageCount),
    cluster: remap.get(partition[n.id] ?? 0) ?? 0,
    lastSeen: n.lastSeen,
    platforms: n.platforms.slice(),
  }));

  const clusters: MindMapCluster[] = [];
  for (let i = 0; i < remap.size; i++) {
    const members = nodes.filter((n) => n.cluster === i).sort((a, b) => b.weight - a.weight);
    if (members.length === 0) continue;
    const top = members[0]!;
    clusters.push({
      id: i,
      members: members.map((m) => m.id),
      topicName: nodeById.get(top.id)?.name ?? top.name,
      size: members.length,
    });
  }

  const edges: MindMapEdge[] = rows.edges
    .filter((e) => nodeById.has(e.source) && nodeById.has(e.target))
    .map((e) => ({ source: e.source, target: e.target, weight: e.weight }));

  return { windowMs, generatedAt, nodes, edges, clusters };
}

function clampWindow(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return DEFAULT_WINDOW_MS;
  return Math.min(MAX_WINDOW_MS, Math.max(MIN_WINDOW_MS, Math.floor(ms)));
}

// ── Convenience: parse the ?window=... query parameter. ────────────────────
// Accepts `90d` / `7d` / `12w` / `3mo` / `1y` (unit suffix required) — or a
// bare integer treated as raw ms (clamped to MIN..MAX). Garbage → default.
export function parseWindowParam(raw: string | undefined): number {
  if (!raw) return DEFAULT_WINDOW_MS;
  const trimmed = raw.trim().toLowerCase();
  // Unit-suffixed form. Unit is required — otherwise bare numbers fall through
  // to the ms branch so callers can pass either "7d" or a literal millisecond
  // value without ambiguity.
  const m = /^(\d+)(d|w|mo|y)$/.exec(trimmed);
  if (m) {
    const n = parseInt(m[1]!, 10);
    const unit = m[2]!;
    const mult =
      unit === 'd'
        ? 86_400_000
        : unit === 'w'
          ? 7 * 86_400_000
          : unit === 'mo'
            ? 30 * 86_400_000
            : 365 * 86_400_000;
    return clampWindow(n * mult);
  }
  // Bare-number → raw ms.
  if (/^\d+$/.test(trimmed)) return clampWindow(Number(trimmed));
  return DEFAULT_WINDOW_MS;
}
