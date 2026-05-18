import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { logger } from '../observability/logger.js';
import type { GraphRepository } from '../graph/GraphRepository.js';
import type { MindMapService } from './MindMap.js';

/**
 * PersonalityMirrorService — F-407 (ADR-0012 §2.4, ADR-0014 §8).
 *
 * Surfaces a descriptive view of the user's attention composition over time.
 * Hard constraints from ADR-0012 §2.4 enforced here:
 *
 *   1. Opt-in only. `getMirror()` returns `enabled=false` and no derived data
 *      until the user calls `enable()`.
 *   2. Framed as mirror, not judgement. We do not classify topics into
 *      psychometric buckets (Big Five, MBTI). Instead, "dimensions" are the
 *      user's own Louvain clusters from the Mind Map — entirely derived from
 *      their own co-occurrence graph.
 *   3. User-deletable. `wipe()` removes derived inferences (the PersonalityMirrorState
 *      row); the underlying graph is untouched.
 *   4. Never shown to others. The endpoints are JWT-scoped per-user only.
 *      No admin / support / IaaS surface for this model.
 *   5. No psychometric labels — cluster labels come from the user's top
 *      topic in each cluster.
 *
 * Composition uses the existing Mind Map clusters. Trajectory rolls up
 * signals per (week, cluster) over the past 8 weeks against the *current*
 * cluster assignment — cluster identities don't flicker week-over-week.
 *
 * "Underrepresented" surfacing: a cluster the user touched in the 4–12 week
 * range but not in the last 4 weeks. That's the "you haven't touched X in
 * 6 weeks" copy from ADR-0012 §2.4.
 */

export interface PersonalityMirrorComposition {
  /** Cluster id → fraction of total weight (0..1). */
  byCluster: Array<{ clusterId: number; topicName: string; weight: number; share: number }>;
  totalWeight: number;
}

export interface PersonalityMirrorTrajectory {
  /** Week-end timestamps, oldest → newest (8 entries). */
  weekEnds: number[];
  /** clusterId → 8-length weight array aligned to weekEnds. */
  byCluster: Array<{ clusterId: number; topicName: string; weeks: number[] }>;
}

export interface PersonalityMirrorUnderrep {
  clusterId: number;
  topicName: string;
  /** Days since the last signal in this cluster. */
  daysDormant: number;
  /** Total weight in the 4–12 week range — used as a sanity check the cluster used to matter. */
  pastWeight: number;
}

export interface PersonalityMirrorPayload {
  enabled: boolean;
  optedInAt: string | null;
  lastWipedAt: string | null;
  aspirations: Record<string, number>;
  /** Only populated when enabled. */
  composition: PersonalityMirrorComposition | null;
  trajectory: PersonalityMirrorTrajectory | null;
  underrepresented: PersonalityMirrorUnderrep[] | null;
  generatedAt: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const COMPOSITION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const TRAJECTORY_WEEKS = 8;
const UNDERREP_DORMANT_WEEKS = 4;
const UNDERREP_LOOKBACK_WEEKS = 12;

export class PersonalityMirrorService {
  constructor(
    private readonly graph: GraphRepository,
    private readonly mindMap: MindMapService,
  ) {}

  // ── Opt-in lifecycle ───────────────────────────────────────────────────

  async getSettings(userId: string): Promise<{
    enabled: boolean;
    optedInAt: Date | null;
    lastWipedAt: Date | null;
    aspirations: Record<string, number>;
  }> {
    const row = await prisma.personalityMirrorState.findUnique({ where: { userId } });
    return {
      enabled: !!row?.optedInAt,
      optedInAt: row?.optedInAt ?? null,
      lastWipedAt: row?.lastWipedAt ?? null,
      aspirations: parseAspirations(row?.aspirations),
    };
  }

  async enable(userId: string): Promise<void> {
    const now = new Date();
    await prisma.personalityMirrorState.upsert({
      where: { userId },
      update: { optedInAt: now },
      create: { userId, optedInAt: now },
    });
    logger.info({ userId }, 'personality mirror enabled');
  }

  async disable(userId: string): Promise<void> {
    await prisma.personalityMirrorState.updateMany({
      where: { userId },
      data: { optedInAt: null },
    });
    logger.info({ userId }, 'personality mirror disabled (history preserved)');
  }

  /** Wipe = remove derived state entirely. Does NOT touch the user's graph. */
  async wipe(userId: string): Promise<void> {
    const now = new Date();
    // Delete the row so no derived inference (aspirations, opt-in history)
    // survives. Audit by recreating with lastWipedAt + no opt-in.
    await prisma.personalityMirrorState.upsert({
      where: { userId },
      update: { optedInAt: null, aspirations: Prisma.JsonNull, lastWipedAt: now },
      create: { userId, lastWipedAt: now },
    });
    logger.info({ userId }, 'personality mirror wiped');
  }

  async setAspirations(userId: string, aspirations: Record<string, number>): Promise<void> {
    // Coerce to safe values: each weight must be a finite number in [0.1, 5].
    const safe: Record<string, number> = {};
    for (const [k, v] of Object.entries(aspirations)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
        safe[k] = Math.max(0.1, Math.min(5, v));
      }
    }
    await prisma.personalityMirrorState.upsert({
      where: { userId },
      update: { aspirations: safe },
      create: { userId, aspirations: safe },
    });
  }

  // ── The mirror itself ──────────────────────────────────────────────────

  async getMirror(userId: string, now: Date = new Date()): Promise<PersonalityMirrorPayload> {
    const settings = await this.getSettings(userId);
    const base: PersonalityMirrorPayload = {
      enabled: settings.enabled,
      optedInAt: settings.optedInAt?.toISOString() ?? null,
      lastWipedAt: settings.lastWipedAt?.toISOString() ?? null,
      aspirations: settings.aspirations,
      composition: null,
      trajectory: null,
      underrepresented: null,
      generatedAt: now.getTime(),
    };
    if (!settings.enabled) return base;

    // 1) Current clusters from the 12-week window (broad enough that dormant
    //    clusters are included).
    const lookbackMs = UNDERREP_LOOKBACK_WEEKS * WEEK_MS;
    const mindMap = await this.mindMap.getMindMap(userId, {
      windowMs: lookbackMs,
      cache: true,
    });

    if (mindMap.nodes.length === 0) {
      return {
        ...base,
        composition: emptyComposition(),
        trajectory: emptyTrajectory(now),
        underrepresented: [],
      };
    }

    // topicId → clusterId (current) + topicId → display name
    const clusterByTopic = new Map<string, number>();
    const nameByTopic = new Map<string, string>();
    const nameByCluster = new Map<number, string>();
    for (const c of mindMap.clusters) nameByCluster.set(c.id, c.topicName);
    for (const n of mindMap.nodes) {
      clusterByTopic.set(n.id, n.cluster);
      nameByTopic.set(n.id, n.name);
    }

    // 2) Composition over the last 30 days — use the nodes' own pageCount
    //    weighted by recency-within-window. Cheap + already cached server-side.
    const compositionWindowStart = now.getTime() - COMPOSITION_WINDOW_MS;
    const recentMindMap = await this.mindMap.getMindMap(userId, {
      windowMs: COMPOSITION_WINDOW_MS,
      cache: true,
    });
    const composition = buildComposition(recentMindMap.nodes, clusterByTopic, nameByCluster);

    // 3) Trajectory — pull signal rows once over the 8-week window and bucket
    //    by (weekIndex, currentClusterId).
    const trajectoryStart = now.getTime() - TRAJECTORY_WEEKS * WEEK_MS;
    const signals = await this.graph.getTopicSignalCounts(userId, trajectoryStart, now.getTime());
    const trajectory = buildTrajectory(
      signals,
      clusterByTopic,
      nameByCluster,
      now,
      TRAJECTORY_WEEKS,
    );

    // 4) Underrepresented — clusters with weight in the older half but
    //    not the recent (≤4w) half.
    const underrepresented = findUnderrepresented(
      signals,
      clusterByTopic,
      nameByCluster,
      now,
      UNDERREP_DORMANT_WEEKS,
      UNDERREP_LOOKBACK_WEEKS,
    );

    return { ...base, composition, trajectory, underrepresented };
  }
}

// ── Pure helpers (exported for unit tests) ─────────────────────────────────

export interface TopicSignal {
  topicId: string;
  ts: number;
  weight: number;
}

export function buildComposition(
  nodes: Array<{ id: string; weight: number }>,
  clusterByTopic: Map<string, number>,
  nameByCluster: Map<number, string>,
): PersonalityMirrorComposition {
  const sumByCluster = new Map<number, number>();
  let total = 0;
  for (const n of nodes) {
    const c = clusterByTopic.get(n.id);
    if (c === undefined) continue;
    const w = Math.max(1, n.weight);
    sumByCluster.set(c, (sumByCluster.get(c) ?? 0) + w);
    total += w;
  }
  const byCluster = [...sumByCluster.entries()]
    .map(([clusterId, weight]) => ({
      clusterId,
      topicName: nameByCluster.get(clusterId) ?? '—',
      weight,
      share: total > 0 ? weight / total : 0,
    }))
    .sort((a, b) => b.share - a.share);
  return { byCluster, totalWeight: total };
}

export function buildTrajectory(
  signals: TopicSignal[],
  clusterByTopic: Map<string, number>,
  nameByCluster: Map<number, string>,
  now: Date,
  numWeeks: number,
): PersonalityMirrorTrajectory {
  const nowMs = now.getTime();
  const weekEnds: number[] = [];
  for (let i = numWeeks - 1; i >= 0; i--) {
    weekEnds.push(nowMs - i * WEEK_MS);
  }
  const startMs = nowMs - numWeeks * WEEK_MS;

  // clusterId → number[] of length numWeeks
  const byCluster = new Map<number, number[]>();
  for (const s of signals) {
    const cluster = clusterByTopic.get(s.topicId);
    if (cluster === undefined) continue;
    if (s.ts < startMs || s.ts > nowMs) continue;
    const weekIndex = Math.min(numWeeks - 1, Math.floor((s.ts - startMs) / WEEK_MS));
    const row = byCluster.get(cluster) ?? new Array<number>(numWeeks).fill(0);
    row[weekIndex] = (row[weekIndex] ?? 0) + Math.max(1, s.weight);
    byCluster.set(cluster, row);
  }
  const rows = [...byCluster.entries()]
    .map(([clusterId, weeks]) => ({
      clusterId,
      topicName: nameByCluster.get(clusterId) ?? '—',
      weeks,
    }))
    .sort((a, b) => sum(b.weeks) - sum(a.weeks));
  return { weekEnds, byCluster: rows };
}

export function findUnderrepresented(
  signals: TopicSignal[],
  clusterByTopic: Map<string, number>,
  nameByCluster: Map<number, string>,
  now: Date,
  dormantWeeks: number,
  lookbackWeeks: number,
): PersonalityMirrorUnderrep[] {
  const nowMs = now.getTime();
  const dormantStart = nowMs - dormantWeeks * WEEK_MS;
  const lookbackStart = nowMs - lookbackWeeks * WEEK_MS;

  type ClusterStats = { lastSeen: number; recentWeight: number; pastWeight: number };
  const stats = new Map<number, ClusterStats>();
  for (const s of signals) {
    const cluster = clusterByTopic.get(s.topicId);
    if (cluster === undefined) continue;
    if (s.ts < lookbackStart) continue;
    const cur = stats.get(cluster) ?? { lastSeen: 0, recentWeight: 0, pastWeight: 0 };
    cur.lastSeen = Math.max(cur.lastSeen, s.ts);
    if (s.ts >= dormantStart) cur.recentWeight += Math.max(1, s.weight);
    else cur.pastWeight += Math.max(1, s.weight);
    stats.set(cluster, cur);
  }

  const underrep: PersonalityMirrorUnderrep[] = [];
  for (const [clusterId, s] of stats) {
    // Dormant + non-trivial historical engagement.
    if (s.recentWeight === 0 && s.pastWeight >= 2 && s.lastSeen > 0) {
      underrep.push({
        clusterId,
        topicName: nameByCluster.get(clusterId) ?? '—',
        daysDormant: Math.floor((nowMs - s.lastSeen) / (24 * 60 * 60 * 1000)),
        pastWeight: s.pastWeight,
      });
    }
  }
  // Highest pastWeight first — the once-most-engaged dormant cluster leads.
  underrep.sort((a, b) => b.pastWeight - a.pastWeight);
  return underrep;
}

function sum(arr: number[]): number {
  return arr.reduce((s, x) => s + x, 0);
}

function emptyComposition(): PersonalityMirrorComposition {
  return { byCluster: [], totalWeight: 0 };
}
function emptyTrajectory(now: Date): PersonalityMirrorTrajectory {
  const nowMs = now.getTime();
  return {
    weekEnds: Array.from(
      { length: TRAJECTORY_WEEKS },
      (_, i) => nowMs - (TRAJECTORY_WEEKS - 1 - i) * WEEK_MS,
    ),
    byCluster: [],
  };
}

function parseAspirations(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
}
