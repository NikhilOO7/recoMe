import type { Neo4jClient } from './Neo4jClient.js';
import type {
  EntityNode,
  PageNode,
  Platform,
  ResearchTrail,
  SignalRecord,
  TopicNode,
  TrailHop,
  UserNode,
} from './types.js';

/**
 * Typed, intent-revealing access layer over Neo4j.
 *
 * Design rules:
 *   - All mutations are MERGE-based (idempotent re-ingest is safe).
 *   - Reads return plain objects (no neo4j-driver types leak through).
 *   - Multi-statement writes go through a single transaction.
 *   - No string concatenation into Cypher; everything is parameterized.
 */
export class GraphRepository {
  constructor(private readonly neo4j: Neo4jClient) {}

  // ── Upserts ───────────────────────────────────────────────────────────────

  async upsertUser(user: UserNode): Promise<void> {
    await this.neo4j.write(async (tx) => {
      await tx.run(
        `
        MERGE (u:User { id: $id })
        ON CREATE SET u.createdAt = $createdAt
        SET u.tier = $tier, u.region = $region
        `,
        { id: user.id, tier: user.tier, region: user.region ?? null, createdAt: user.createdAt },
      );
    }, 'upsertUser');
  }

  async upsertTopics(topics: TopicNode[]): Promise<void> {
    if (topics.length === 0) return;
    await this.neo4j.write(async (tx) => {
      await tx.run(
        `
        UNWIND $topics AS t
        MERGE (n:Topic { normalizedName: t.normalizedName })
        ON CREATE SET n.id = t.id, n.createdAt = t.createdAt
        SET n.name = t.name,
            n.embeddingId = coalesce(t.embeddingId, n.embeddingId)
        `,
        { topics },
      );
    }, 'upsertTopics');
  }

  async upsertEntities(entities: EntityNode[]): Promise<void> {
    if (entities.length === 0) return;
    await this.neo4j.write(async (tx) => {
      await tx.run(
        `
        UNWIND $entities AS e
        MERGE (n:Entity { id: e.id })
        ON CREATE SET n.createdAt = e.createdAt
        SET n.name = e.name, n.kind = e.kind, n.platform = e.platform,
            n.embeddingId = coalesce(e.embeddingId, n.embeddingId)
        `,
        { entities },
      );
    }, 'upsertEntities');
  }

  async upsertPage(page: PageNode): Promise<void> {
    await this.neo4j.write(async (tx) => {
      await tx.run(
        `
        MERGE (p:Page { url: $url })
        ON CREATE SET p.firstSeenAt = $firstSeenAt
        SET p.title = $title, p.platform = $platform, p.lastSeenAt = $lastSeenAt
        `,
        page,
      );
    }, 'upsertPage');
  }

  // ── Signal ingestion ──────────────────────────────────────────────────────

  /**
   * Idempotent signal ingestion. Materializes the signal as an immutable
   * (:Signal) node plus the implied relationships:
   *   - (User)-[:VIEWED]->(Page)
   *   - (Page)-[:MENTIONS]->(Topic)
   *   - (User)-[:HAS_INTENT]->(Topic) — strength is an EWMA of weight.
   *   - (User)-[:BLOCKS/BOOSTS]->(Topic) for the explicit kinds.
   *
   * Pages/topics/entities must already exist (call upsert* first, or use
   * SignalIngestion which handles the orchestration).
   */
  async recordSignal(signal: SignalRecord): Promise<void> {
    await this.neo4j.write(async (tx) => {
      // 1) immutable signal event
      await tx.run(
        `
        MATCH (u:User { id: $userId })
        MERGE (sg:Signal { id: $id })
        ON CREATE SET sg.userId = $userId, sg.kind = $kind, sg.weight = $weight, sg.ts = $ts
        MERGE (u)-[:EMITTED]->(sg)
        `,
        signal,
      );

      // 2) page view edge
      if (signal.pageUrl) {
        await tx.run(
          `
          MATCH (u:User { id: $userId }), (p:Page { url: $pageUrl })
          MERGE (u)-[r:VIEWED]->(p)
          ON CREATE SET r.firstAt = $ts
          SET r.lastAt = $ts, r.kind = $kind, r.weight = coalesce(r.weight, 0) + $weight
          `,
          signal,
        );
      }

      // 3) page → topic mention edges
      if (signal.topicNormalizedNames && signal.topicNormalizedNames.length > 0 && signal.pageUrl) {
        await tx.run(
          `
          MATCH (p:Page { url: $pageUrl })
          UNWIND $topics AS topic
          MATCH (t:Topic { normalizedName: topic })
          MERGE (p)-[r:MENTIONS]->(t)
          ON CREATE SET r.firstAt = $ts, r.confidence = 0.5
          SET r.lastAt = $ts
          `,
          { pageUrl: signal.pageUrl, topics: signal.topicNormalizedNames, ts: signal.ts },
        );
      }

      // 4) user → topic intent (EWMA strength) for view/dwell/like/purchase/comparison
      if (
        signal.topicNormalizedNames &&
        signal.topicNormalizedNames.length > 0 &&
        isIntentSignal(signal.kind)
      ) {
        await tx.run(
          `
          MATCH (u:User { id: $userId })
          UNWIND $topics AS topic
          MATCH (t:Topic { normalizedName: topic })
          MERGE (u)-[r:HAS_INTENT]->(t)
          ON CREATE SET r.strength = $weight, r.firstSeen = $ts
          SET r.strength = (coalesce(r.strength, 0) * 0.7) + ($weight * 0.3),
              r.lastSeen = $ts
          `,
          {
            userId: signal.userId,
            topics: signal.topicNormalizedNames,
            weight: signal.weight,
            ts: signal.ts,
          },
        );
      }

      // 5) explicit block/boost
      if (signal.kind === 'block' && signal.topicNormalizedNames) {
        await tx.run(
          `
          MATCH (u:User { id: $userId })
          UNWIND $topics AS topic
          MATCH (t:Topic { normalizedName: topic })
          MERGE (u)-[r:BLOCKS]->(t)
          SET r.at = $ts
          `,
          { userId: signal.userId, topics: signal.topicNormalizedNames, ts: signal.ts },
        );
      }
      if (signal.kind === 'boost' && signal.topicNormalizedNames) {
        await tx.run(
          `
          MATCH (u:User { id: $userId })
          UNWIND $topics AS topic
          MATCH (t:Topic { normalizedName: topic })
          MERGE (u)-[r:BOOSTS]->(t)
          SET r.at = $ts
          `,
          { userId: signal.userId, topics: signal.topicNormalizedNames, ts: signal.ts },
        );
      }

      // 6) entity edges
      if (signal.entityIds && signal.entityIds.length > 0 && signal.pageUrl) {
        await tx.run(
          `
          MATCH (p:Page { url: $pageUrl })
          UNWIND $entityIds AS eid
          MATCH (e:Entity { id: eid })
          MERGE (p)-[r:CONTAINS_ENTITY]->(e)
          ON CREATE SET r.firstAt = $ts, r.confidence = 0.5
          SET r.lastAt = $ts
          `,
          { pageUrl: signal.pageUrl, entityIds: signal.entityIds, ts: signal.ts },
        );
      }
    }, 'recordSignal');
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  /**
   * Cross-platform research trail for one topic:
   * every page the user viewed that mentions the topic, ordered by time,
   * grouped into the platform sequence (the audit's P0 thesis flow).
   */
  async getResearchTrail(
    userId: string,
    topicNormalizedName: string,
  ): Promise<ResearchTrail | null> {
    return this.neo4j.read(async (tx) => {
      const result = await tx.run(
        `
        MATCH (u:User { id: $userId })-[v:VIEWED]->(p:Page)-[m:MENTIONS]->(t:Topic { normalizedName: $topic })
        WITH u, t, p, v, m
        ORDER BY v.firstAt ASC
        RETURN
          t.normalizedName AS topicNormalizedName,
          t.name           AS topicDisplayName,
          collect({
            platform: p.platform,
            pageUrl:  p.url,
            pageTitle: p.title,
            topicName: t.name,
            dwellMs: coalesce(v.weight, 0),
            ts: v.firstAt
          })                AS hops
        `,
        { userId, topic: topicNormalizedName },
      );
      const rec = result.records[0];
      if (!rec) return null;
      const hops = (rec.get('hops') as TrailHop[]) ?? [];
      if (hops.length === 0) return null;
      const platformsTouched = Array.from(new Set(hops.map((h) => h.platform))) as Platform[];
      const firstHop = hops[0]!;
      const lastHop = hops[hops.length - 1]!;
      return {
        userId,
        topicNormalizedName: rec.get('topicNormalizedName') as string,
        topicDisplayName: rec.get('topicDisplayName') as string,
        hops,
        firstSeenAt: firstHop.ts,
        lastSeenAt: lastHop.ts,
        platformsTouched,
        strength: scoreTrail(hops, platformsTouched.length),
      };
    }, 'getResearchTrail');
  }

  /**
   * Topics the user has touched on multiple platforms — the P0 the audit
   * flagged as missing. Sorted by platform-spread × recency.
   */
  async getCrossPlatformTopics(
    userId: string,
    minPlatforms = 2,
    limit = 20,
  ): Promise<
    Array<{
      topicNormalizedName: string;
      topicName: string;
      platforms: Platform[];
      lastSeenAt: number;
      strength: number;
    }>
  > {
    return this.neo4j.read(async (tx) => {
      const result = await tx.run(
        `
        MATCH (u:User { id: $userId })-[v:VIEWED]->(p:Page)-[:MENTIONS]->(t:Topic)
        WITH t, collect(DISTINCT p.platform) AS platforms, max(v.lastAt) AS lastSeen, sum(coalesce(v.weight, 0)) AS totalDwell
        WHERE size(platforms) >= $minPlatforms
        RETURN
          t.normalizedName AS topicNormalizedName,
          t.name           AS topicName,
          platforms,
          lastSeen,
          totalDwell
        ORDER BY size(platforms) DESC, lastSeen DESC
        LIMIT $limit
        `,
        { userId, minPlatforms, limit },
      );
      return result.records.map((rec) => {
        const platforms = (rec.get('platforms') as Platform[]).filter(Boolean);
        const lastSeen = Number(rec.get('lastSeen') ?? 0);
        const totalDwell = Number(rec.get('totalDwell') ?? 0);
        return {
          topicNormalizedName: rec.get('topicNormalizedName') as string,
          topicName: rec.get('topicName') as string,
          platforms,
          lastSeenAt: lastSeen,
          strength: platforms.length * 1.0 + Math.log1p(totalDwell) * 0.3,
        };
      });
    }, 'getCrossPlatformTopics');
  }

  async getTopIntents(
    userId: string,
    limit = 10,
  ): Promise<Array<{ topicName: string; strength: number; lastSeen: number }>> {
    return this.neo4j.read(async (tx) => {
      const result = await tx.run(
        `
        MATCH (u:User { id: $userId })-[r:HAS_INTENT]->(t:Topic)
        WHERE NOT EXISTS { (u)-[:BLOCKS]->(t) }
        RETURN t.name AS topicName, r.strength AS strength, r.lastSeen AS lastSeen
        ORDER BY r.strength DESC, r.lastSeen DESC
        LIMIT $limit
        `,
        { userId, limit },
      );
      return result.records.map((rec) => ({
        topicName: rec.get('topicName') as string,
        strength: Number(rec.get('strength') ?? 0),
        lastSeen: Number(rec.get('lastSeen') ?? 0),
      }));
    }, 'getTopIntents');
  }

  // ── Deletion ──────────────────────────────────────────────────────────────

  /**
   * GDPR delete: drops all user-scoped nodes and their relationships.
   * Pages and Topics are kept (they're shared infrastructure); only the
   * user's VIEWED / HAS_INTENT / BLOCKS / BOOSTS edges + Signal/Session
   * nodes are removed.
   */
  async deleteUserData(userId: string): Promise<{ nodesDeleted: number; relsDeleted: number }> {
    return this.neo4j.write(async (tx) => {
      const r = await tx.run(
        `
        MATCH (u:User { id: $userId })
        OPTIONAL MATCH (u)-[r1]-()
        OPTIONAL MATCH (u)-[:EMITTED]->(sg:Signal)
        OPTIONAL MATCH (s:Session { userId: $userId })
        WITH u, collect(DISTINCT sg) AS signals, collect(DISTINCT s) AS sessions, count(DISTINCT r1) AS relCount
        FOREACH (sig IN signals | DETACH DELETE sig)
        FOREACH (ses IN sessions | DETACH DELETE ses)
        DETACH DELETE u
        RETURN relCount AS relsDeleted, (1 + size(signals) + size(sessions)) AS nodesDeleted
        `,
        { userId },
      );
      const rec = r.records[0];
      return {
        nodesDeleted: Number(rec?.get('nodesDeleted') ?? 0),
        relsDeleted: Number(rec?.get('relsDeleted') ?? 0),
      };
    }, 'deleteUserData');
  }
}

function isIntentSignal(kind: SignalRecord['kind']): boolean {
  return (
    kind === 'view' ||
    kind === 'dwell' ||
    kind === 'like' ||
    kind === 'purchase' ||
    kind === 'comparison'
  );
}

function scoreTrail(hops: TrailHop[], platformCount: number): number {
  const totalDwell = hops.reduce((s, h) => s + h.dwellMs, 0);
  return platformCount * 1.5 + Math.log1p(totalDwell) * 0.4 + Math.log1p(hops.length) * 0.2;
}
