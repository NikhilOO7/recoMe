import { nanoid } from 'nanoid';
import type { GraphRepository } from '../graph/GraphRepository.js';
import type { EntityNode, Platform, SignalKind, SignalRecord, TopicNode } from '../graph/types.js';
import type { EmbeddingClient } from '../vector/EmbeddingClient.js';
import type { VectorClient } from '../vector/VectorClient.js';
import type { VectorPoint } from '../vector/types.js';
import { logger } from '../observability/logger.js';
import { fireSignalIngestTriggerSync } from '../agents/triggers/signalIngestTrigger.js';
import { maybeIntelligence } from './IntelligenceService.js';

export interface SignalInput {
  /** Client-generated; used for idempotency. */
  id?: string;
  userId: string;
  kind: SignalKind;
  ts?: number;
  weight?: number;
  pageUrl?: string;
  pageTitle?: string;
  platform?: Platform;
  topics?: { name: string }[];
  entities?: { name: string; kind: EntityNode['kind']; platform?: Platform }[];
  sessionId?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface IngestResult {
  signalId: string;
  topicsCreated: number;
  entitiesCreated: number;
  embeddingsGenerated: number;
}

/**
 * SignalIngestion is the single entry point for "something happened in the
 * user's browser". It:
 *
 *   1. Normalizes raw input (topic names, entity names).
 *   2. Upserts the page, topics, and entities in Neo4j.
 *   3. Generates embeddings for any newly-seen topics/entities and writes
 *      them to Qdrant in the user's namespace.
 *   4. Records the signal + implied relationships through GraphRepository.
 *
 * The whole flow is idempotent on `signalId` — re-posting the same signal
 * is a no-op (MERGE semantics in the repository).
 */
export class SignalIngestion {
  constructor(
    private readonly graph: GraphRepository,
    private readonly vectors: VectorClient,
    private readonly embedder: EmbeddingClient,
  ) {}

  async ingest(input: SignalInput): Promise<IngestResult> {
    const signalId = input.id ?? nanoid();
    const ts = input.ts ?? Date.now();
    const weight = input.weight ?? defaultWeight(input.kind);

    // 1) normalize
    const topics: TopicNode[] = (input.topics ?? []).map((t) => ({
      id: nanoid(),
      name: t.name,
      normalizedName: normalizeTopic(t.name),
      createdAt: ts,
    }));
    const entities: EntityNode[] = (input.entities ?? []).map((e) => ({
      id: nanoid(),
      name: e.name,
      kind: e.kind,
      platform: e.platform,
      createdAt: ts,
    }));

    // dedupe topics within the request by normalizedName
    const dedupedTopics = Array.from(new Map(topics.map((t) => [t.normalizedName, t])).values());

    // 2) upsert page + topics + entities
    if (input.pageUrl && input.platform) {
      await this.graph.upsertPage({
        url: input.pageUrl,
        title: input.pageTitle ?? input.pageUrl,
        platform: input.platform,
        firstSeenAt: ts,
        lastSeenAt: ts,
      });
    }
    await this.graph.upsertTopics(dedupedTopics);
    await this.graph.upsertEntities(entities);

    // 3) embeddings (best-effort — graph signal is the source of truth, vectors are accelerators)
    let embeddingsGenerated = 0;
    try {
      const toEmbed = [
        ...dedupedTopics.map((t) => ({
          id: `topic:${t.normalizedName}`,
          kind: 'topic' as const,
          refId: t.normalizedName,
          text: t.name,
        })),
        ...entities.map((e) => ({
          id: `entity:${e.id}`,
          kind: 'entity' as const,
          refId: e.id,
          text: `${e.name} (${e.kind})`,
        })),
      ];
      if (toEmbed.length > 0) {
        const { vectors } = await this.embedder.embed({ inputs: toEmbed.map((x) => x.text) });
        const points: VectorPoint[] = [];
        for (let i = 0; i < toEmbed.length; i++) {
          const x = toEmbed[i]!;
          const vec = vectors[i];
          if (!vec) continue;
          points.push({
            id: x.id,
            vector: vec,
            payload: {
              userId: input.userId,
              kind: x.kind,
              refId: x.refId,
              text: x.text,
              platform: input.platform,
              ts,
            },
          });
        }
        await this.vectors.upsert(points);
        embeddingsGenerated = points.length;
      }
    } catch (err) {
      logger.warn(
        { err, userId: input.userId, signalId },
        'embedding step failed; continuing without vectors',
      );
    }

    // 4) record the signal + relationships
    const signal: SignalRecord = {
      id: signalId,
      userId: input.userId,
      kind: input.kind,
      weight,
      ts,
      topicNormalizedNames: dedupedTopics.map((t) => t.normalizedName),
      entityIds: entities.map((e) => e.id),
      pageUrl: input.pageUrl,
      sessionId: input.sessionId,
      metadata: input.metadata,
    };
    await this.graph.recordSignal(signal);

    // 5) Fire event-triggered agents (Recall today, more later). Fire-and-forget
    // — the ingest response should not block on agent work. AgentRegistry not
    // being booted is a normal state in tests and dev; the trigger no-ops.
    // One trigger per topic — Recall scopes by topic. Skipped silently if no
    // topics were extracted.
    const entityNames = entities.map((e) => e.name);
    for (const t of dedupedTopics) {
      fireSignalIngestTriggerSync({
        userId: input.userId,
        signalId,
        topicNormalizedName: t.normalizedName,
        topicName: t.name,
        ts,
        platform: input.platform,
        entityNames,
        pageUrl: input.pageUrl,
      });
    }

    // Invalidate the user's mind-map cache so the next /intelligence/mindmap
    // call reflects this signal. Cheap — process-local map deletion.
    // Wrapped in a try so a missing mind-map service (tests) can't break ingest.
    try {
      maybeIntelligence()?.mindMap.invalidate(input.userId);
    } catch {
      /* noop */
    }

    return {
      signalId,
      topicsCreated: dedupedTopics.length,
      entitiesCreated: entities.length,
      embeddingsGenerated,
    };
  }
}

export function normalizeTopic(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function defaultWeight(kind: SignalKind): number {
  switch (kind) {
    case 'view':
      return 1;
    case 'dwell':
      return 3;
    case 'like':
    case 'boost':
      return 5;
    case 'purchase':
      return 10;
    case 'comparison':
      return 4;
    case 'search':
      return 2;
    case 'block':
      return 5;
    default:
      return 1;
  }
}
