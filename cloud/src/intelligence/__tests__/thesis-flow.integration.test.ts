/**
 * Integration test for the cross-platform research trail thesis.
 *
 * What it proves:
 *   YouTube dwell → Reddit dwell → Amazon view, all on the same topic,
 *   results in a single trail with 3 hops in the right order, attributed
 *   to the right platforms.
 *
 * Requires real Neo4j + Qdrant. Skipped unless RUN_INTEGRATION=1 is set.
 *
 * To run:
 *   cd cloud
 *   docker compose up -d neo4j qdrant
 *   RUN_INTEGRATION=1 \
 *     NEO4J_URI=bolt://localhost:7687 \
 *     NEO4J_USERNAME=neo4j \
 *     NEO4J_PASSWORD=recomeneo4jdev \
 *     QDRANT_URL=http://localhost:6333 \
 *     QDRANT_COLLECTION=recome_test \
 *     OPENAI_API_KEY=sk-... \
 *     npm test -- thesis-flow
 *
 * Note: uses a real OpenAI key for embeddings. To run fully offline, swap
 * OpenAIEmbeddings for a stub via dependency injection (left as a deferred
 * refinement; the integration tier is meant to mirror prod as closely as
 * possible).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Neo4jClient } from '../../graph/Neo4jClient.js';
import { GraphRepository } from '../../graph/GraphRepository.js';
import { MigrationRunner } from '../../graph/migrations/runner.js';
import { QdrantVectorClient } from '../../vector/QdrantClient.js';
import { OpenAIEmbeddings } from '../../vector/OpenAIEmbeddings.js';
import { SignalIngestion, normalizeTopic } from '../SignalIngestion.js';
import { ResearchTrailService } from '../ResearchTrail.js';
import { nanoid } from 'nanoid';

const enabled = process.env.RUN_INTEGRATION === '1';
const requiredEnv = [
  'NEO4J_URI',
  'NEO4J_USERNAME',
  'NEO4J_PASSWORD',
  'QDRANT_URL',
  'OPENAI_API_KEY',
];
const missing = requiredEnv.filter((k) => !process.env[k]);

(enabled && missing.length === 0 ? describe : describe.skip)(
  'thesis flow integration — YouTube → Reddit → Amazon',
  () => {
    let neo4j: Neo4jClient;
    let qdrant: QdrantVectorClient;
    let ingestion: SignalIngestion;
    let trails: ResearchTrailService;
    let userId: string;
    let topic: string;

    beforeAll(async () => {
      neo4j = new Neo4jClient({
        uri: process.env.NEO4J_URI!,
        username: process.env.NEO4J_USERNAME!,
        password: process.env.NEO4J_PASSWORD!,
        database: process.env.NEO4J_DATABASE ?? 'neo4j',
      });
      await neo4j.ready();
      await new MigrationRunner(neo4j).run();

      const embedder = new OpenAIEmbeddings({ apiKey: process.env.OPENAI_API_KEY! });
      qdrant = new QdrantVectorClient({
        url: process.env.QDRANT_URL!,
        apiKey: process.env.QDRANT_API_KEY,
        collection: process.env.QDRANT_COLLECTION ?? 'recome_test',
        dim: embedder.dim,
      });
      await qdrant.ready();

      const graph = new GraphRepository(neo4j);
      ingestion = new SignalIngestion(graph, qdrant, embedder);
      trails = new ResearchTrailService(graph, qdrant, embedder);

      // Unique per run so test failures don't poison subsequent runs.
      userId = `test-user-${nanoid(6)}`;
      topic = `Eames Lounge Chair ${nanoid(4)}`;

      await graph.upsertUser({ id: userId, tier: 'FREE', createdAt: Date.now() });
    }, 60_000);

    afterAll(async () => {
      // Best-effort cleanup. We don't `forgetUser` because we want the
      // test data to be inspectable on failure.
      if (process.env.CLEAN_INTEGRATION === '1') {
        await neo4j.write(async (tx) => {
          await tx.run('MATCH (u:User { id: $userId }) DETACH DELETE u', { userId });
          await tx.run('MATCH (sg:Signal { userId: $userId }) DETACH DELETE sg', { userId });
        });
        await qdrant.deleteUserNamespace(userId);
      }
      await neo4j.close();
    }, 30_000);

    it('records three platform hops in time order', async () => {
      const t0 = Date.now();

      await ingestion.ingest({
        userId,
        kind: 'dwell',
        ts: t0,
        weight: 4,
        pageUrl: `https://youtube.com/watch?v=${nanoid(6)}`,
        pageTitle: `${topic} review`,
        platform: 'youtube',
        topics: [{ name: topic }],
      });

      await ingestion.ingest({
        userId,
        kind: 'dwell',
        ts: t0 + 60_000,
        weight: 3,
        pageUrl: `https://reddit.com/r/furniture/comments/${nanoid(6)}`,
        pageTitle: `Anyone tried a ${topic}?`,
        platform: 'reddit',
        topics: [{ name: topic }],
      });

      await ingestion.ingest({
        userId,
        kind: 'view',
        ts: t0 + 120_000,
        weight: 1,
        pageUrl: `https://amazon.com/dp/${nanoid(8)}`,
        pageTitle: topic,
        platform: 'amazon',
        topics: [{ name: topic }],
      });

      const trail = await trails.getTrail(userId, topic);
      expect(trail).not.toBeNull();
      expect(trail!.hops).toHaveLength(3);
      expect(trail!.hops.map((h) => h.platform)).toEqual(['youtube', 'reddit', 'amazon']);
      expect(trail!.platformsTouched.sort()).toEqual(['amazon', 'reddit', 'youtube']);
      expect(trail!.topicNormalizedName).toBe(normalizeTopic(topic));
    }, 60_000);

    it('lists the trail in /trails (cross-platform candidates query)', async () => {
      const all = await trails.listTrails(userId, { minPlatforms: 2 });
      const found = all.find((t) => t.topicNormalizedName === normalizeTopic(topic));
      expect(found).toBeDefined();
      expect(found!.hops.length).toBeGreaterThanOrEqual(3);
    });

    it('is idempotent — replaying the same signal id is a no-op', async () => {
      const id = `sig-replay-${nanoid(6)}`;
      const r1 = await ingestion.ingest({
        id,
        userId,
        kind: 'view',
        pageUrl: 'https://generic.example.com/page',
        platform: 'generic',
        topics: [{ name: 'replay topic' }],
      });
      const r2 = await ingestion.ingest({
        id,
        userId,
        kind: 'view',
        pageUrl: 'https://generic.example.com/page',
        platform: 'generic',
        topics: [{ name: 'replay topic' }],
      });
      expect(r1.signalId).toBe(id);
      expect(r2.signalId).toBe(id);
    });
  },
);

// Surface a friendly message in CI when the suite is skipped due to missing env.
if (enabled && missing.length > 0) {
  // eslint-disable-next-line no-console
  console.warn(
    `[thesis-flow.integration] skipped — RUN_INTEGRATION=1 but missing env: ${missing.join(', ')}`,
  );
}
