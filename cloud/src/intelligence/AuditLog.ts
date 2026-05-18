import { prisma } from '../db.js';
import type { GraphRepository, CaptureHistoryRow } from '../graph/GraphRepository.js';
import { logger } from '../observability/logger.js';

/**
 * AuditLogService — F-408 "The Audit Log of You" (ADR-0014 §8).
 *
 * Most competitors hide what they store. We make the audit the loud feature.
 * This service merges every kind of artifact attached to the user into one
 * cursor-paginated timeline:
 *
 *   - capture      : a page the user's extension/PWA/paste surface ingested
 *   - agent_run    : every invocation of an agent against the user's graph,
 *                    including 'skipped' and 'capped' runs (Guardian audit)
 *   - agent_event  : a thing an agent surfaced to the user
 *   - state_change : opt-in / disable / wipe of Personality Mirror
 *
 * Cursor is a millisecond timestamp; each call returns rows older than the
 * cursor, ordered DESC. The `types` filter is opt-in — empty means "all".
 *
 * Export: `exportAll(userId)` returns the full assembled JSON for download.
 * No streaming yet — the size envelope is bounded by signal volume which is
 * tractable for v1. When users hit 100k+ events we'll switch to a job-and-
 * signed-URL pattern (parallel to the Takeout uploads in R2 per [0015 HLD]).
 */

export type AuditLogEntryType = 'capture' | 'agent_run' | 'agent_event' | 'state_change';

export interface AuditLogEntry {
  type: AuditLogEntryType;
  /** ms epoch — primary sort key (DESC). */
  ts: number;
  /** Short label for the UI row. */
  title: string;
  /** Optional descriptive body. May contain user data; never PII outside what the user themselves captured. */
  body?: string;
  /** Internal id (page url / runId / eventId / state-change marker). */
  ref: string;
  /** Optional URL the user can click to "go to the source." */
  url?: string;
  /** Tags rendered as chips in the UI. */
  tags: string[];
  /** Full row payload — exposed in export, used for the "Why this?" affordance. */
  meta: Record<string, unknown>;
}

export interface AuditLogPage {
  entries: AuditLogEntry[];
  /** ms timestamp to pass as `?before=<this>` for the next page. Null = done. */
  nextCursor: number | null;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export class AuditLogService {
  constructor(private readonly graph: GraphRepository) {}

  /** One page of the merged timeline. */
  async getPage(
    userId: string,
    opts: { before?: number; limit?: number; types?: AuditLogEntryType[] } = {},
  ): Promise<AuditLogPage> {
    const before = opts.before ?? Date.now() + 1;
    const limit = Math.min(MAX_LIMIT, Math.max(1, opts.limit ?? DEFAULT_LIMIT));
    const types = (opts.types && opts.types.length > 0 ? opts.types : null) as
      | AuditLogEntryType[]
      | null;
    const want = (t: AuditLogEntryType) => !types || types.includes(t);

    // Fan out — each source pulls up to `limit` rows older than `before`.
    // We then merge-sort and trim to `limit`. Worst-case 4x the row scan;
    // fine at v1 volume (Postgres indexes + Neo4j relationship limit).
    const [captures, runs, events, stateChanges] = await Promise.all([
      want('capture')
        ? this.graph.getCaptureHistory(userId, { beforeMs: before, limit }).catch((err) => {
            logger.warn({ err, userId }, 'audit: getCaptureHistory failed');
            return [] as CaptureHistoryRow[];
          })
        : Promise.resolve<CaptureHistoryRow[]>([]),
      want('agent_run')
        ? prisma.agentRun.findMany({
            where: { userId, startedAt: { lt: new Date(before) } },
            orderBy: { startedAt: 'desc' },
            take: limit,
          })
        : Promise.resolve([]),
      want('agent_event')
        ? prisma.agentEvent.findMany({
            where: { userId, createdAt: { lt: new Date(before) } },
            orderBy: { createdAt: 'desc' },
            take: limit,
          })
        : Promise.resolve([]),
      want('state_change')
        ? this.collectStateChanges(userId, before)
        : Promise.resolve<AuditLogEntry[]>([]),
    ]);

    const merged: AuditLogEntry[] = [
      ...captures.map(captureToEntry),
      ...runs.map(agentRunToEntry),
      ...events.map(agentEventToEntry),
      ...stateChanges,
    ]
      .filter((e) => e.ts < before)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, limit);

    const nextCursor = merged.length < limit ? null : (merged[merged.length - 1]?.ts ?? null);
    return { entries: merged, nextCursor };
  }

  /**
   * Full export — every audit entry across every type, no pagination, sorted
   * newest-first. The caller streams the JSON to the user. Capped at
   * `maxRows` for safety; if we hit the cap the response includes
   * `truncatedAt` so the user knows there's more.
   */
  async exportAll(
    userId: string,
    opts: { maxRows?: number } = {},
  ): Promise<{
    exportedAt: number;
    entries: AuditLogEntry[];
    truncatedAt: number | null;
    counts: Record<AuditLogEntryType, number>;
  }> {
    const cap = Math.min(opts.maxRows ?? 5000, 10000);
    const collected: AuditLogEntry[] = [];
    let before = Date.now() + 1;
    let pageNumber = 0;
    const maxPages = 200; // hard cap on the loop

    while (collected.length < cap && pageNumber < maxPages) {
      const page = await this.getPage(userId, {
        before,
        limit: Math.min(200, cap - collected.length),
      });
      collected.push(...page.entries);
      if (page.nextCursor === null) break;
      // Strictly less-than to avoid infinite loop on ties.
      before = page.nextCursor;
      pageNumber++;
    }

    const counts = {
      capture: 0,
      agent_run: 0,
      agent_event: 0,
      state_change: 0,
    } as Record<AuditLogEntryType, number>;
    for (const e of collected) counts[e.type]++;

    const truncatedAt =
      collected.length >= cap && collected[collected.length - 1]
        ? collected[collected.length - 1]!.ts
        : null;

    return {
      exportedAt: Date.now(),
      entries: collected,
      truncatedAt,
      counts,
    };
  }

  /**
   * Collect PersonalityMirrorState change events from the single Prisma row.
   * v1: we don't keep a history table — only the three timestamps on the row.
   * Each produces an entry if present + older than `before`.
   */
  private async collectStateChanges(userId: string, before: number): Promise<AuditLogEntry[]> {
    const row = await prisma.personalityMirrorState
      .findUnique({ where: { userId } })
      .catch(() => null);
    if (!row) return [];
    const out: AuditLogEntry[] = [];

    if (row.optedInAt && row.optedInAt.getTime() < before) {
      out.push({
        type: 'state_change',
        ts: row.optedInAt.getTime(),
        title: 'Opted in to Personality Mirror',
        ref: `personality:opt-in:${row.optedInAt.getTime()}`,
        tags: ['personality', 'opt-in'],
        meta: { surface: 'personality-mirror', action: 'enable' },
      });
    }
    if (row.lastWipedAt && row.lastWipedAt.getTime() < before) {
      out.push({
        type: 'state_change',
        ts: row.lastWipedAt.getTime(),
        title: 'Wiped Personality Mirror derived inferences',
        body: 'Removed opt-in + aspirations. Underlying graph untouched.',
        ref: `personality:wipe:${row.lastWipedAt.getTime()}`,
        tags: ['personality', 'wipe', 'privacy'],
        meta: { surface: 'personality-mirror', action: 'wipe' },
      });
    }
    return out;
  }
}

// ── Adapters: domain rows → AuditLogEntry ──────────────────────────────────

function captureToEntry(row: CaptureHistoryRow): AuditLogEntry {
  const ts = row.lastAt || row.firstAt;
  return {
    type: 'capture',
    ts,
    title: row.pageTitle ?? row.pageUrl,
    ref: row.pageUrl,
    url: row.pageUrl,
    tags: [row.platform ?? 'web', row.kind, ...row.topics.slice(0, 3)].filter(Boolean),
    meta: {
      pageUrl: row.pageUrl,
      pageTitle: row.pageTitle,
      platform: row.platform,
      kind: row.kind,
      firstAt: row.firstAt,
      lastAt: row.lastAt,
      weight: row.weight,
      topics: row.topics,
    },
  };
}

interface AgentRunRow {
  id: string;
  agent: string;
  trigger: string;
  status: string;
  llmTokens: number;
  costMicros: number;
  meta: unknown;
  startedAt: Date;
  finishedAt: Date | null;
}

function agentRunToEntry(row: AgentRunRow): AuditLogEntry {
  const ts = row.startedAt.getTime();
  const status = row.status;
  const verb =
    status === 'succeeded'
      ? 'ran'
      : status === 'skipped'
        ? 'considered (skipped)'
        : status === 'capped'
          ? 'considered (capped by Guardian)'
          : status === 'failed'
            ? 'failed'
            : 'ran';
  return {
    type: 'agent_run',
    ts,
    title: `${capitalize(row.agent)} ${verb}`,
    ref: `agent_run:${row.id}`,
    tags: [
      row.agent,
      row.trigger,
      status,
      ...(row.costMicros > 0 ? [`cost ${row.costMicros}µ`] : []),
    ],
    body:
      row.status === 'capped' || row.status === 'skipped'
        ? (metaReason(row.meta) ?? undefined)
        : undefined,
    meta: {
      agent: row.agent,
      trigger: row.trigger,
      status: row.status,
      llmTokens: row.llmTokens,
      costMicros: row.costMicros,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      ...(row.meta && typeof row.meta === 'object' ? (row.meta as Record<string, unknown>) : {}),
    },
  };
}

interface AgentEventRow {
  id: string;
  agent: string;
  kind: string;
  title: string;
  body: string | null;
  actionUrl: string | null;
  sources: unknown;
  dedupeKey: string;
  seenAt: Date | null;
  feedback: string | null;
  createdAt: Date;
}

function agentEventToEntry(row: AgentEventRow): AuditLogEntry {
  return {
    type: 'agent_event',
    ts: row.createdAt.getTime(),
    title: row.title,
    body: row.body ?? undefined,
    ref: `agent_event:${row.id}`,
    url: row.actionUrl ?? undefined,
    tags: [
      row.agent,
      row.kind,
      ...(row.seenAt ? ['seen'] : ['unseen']),
      ...(row.feedback ? [`feedback:${row.feedback}`] : []),
    ],
    meta: {
      eventId: row.id,
      agent: row.agent,
      kind: row.kind,
      sources: row.sources,
      dedupeKey: row.dedupeKey,
      seenAt: row.seenAt?.toISOString() ?? null,
      feedback: row.feedback,
      createdAt: row.createdAt.toISOString(),
    },
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function metaReason(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const r = (meta as Record<string, unknown>).reason;
  return typeof r === 'string' ? r : null;
}
