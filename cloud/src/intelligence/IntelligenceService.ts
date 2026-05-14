import type { Neo4jClient } from '../graph/Neo4jClient.js';
import { GraphRepository } from '../graph/GraphRepository.js';
import { MigrationRunner } from '../graph/migrations/runner.js';
import type { VectorClient } from '../vector/VectorClient.js';
import type { EmbeddingClient } from '../vector/EmbeddingClient.js';
import { SignalIngestion } from './SignalIngestion.js';
import { ResearchTrailService } from './ResearchTrail.js';
import { logger } from '../observability/logger.js';

export interface IntelligenceServiceConfig {
  /** Whether to run pending Cypher migrations on boot. Leave false in prod. */
  runMigrationsOnBoot?: boolean;
}

/**
 * IntelligenceService is the cloud-side facade that the rest of the backend
 * (HTTP controllers, sync, admin) talks to. It owns:
 *
 *   - the Neo4j driver lifecycle (init / health / shutdown)
 *   - the Qdrant + embedding client lifecycle
 *   - the GraphRepository, SignalIngestion, and ResearchTrailService
 *
 * Construct once at boot, expose via getIntelligence().
 */
export class IntelligenceService {
  readonly graph: GraphRepository;
  readonly ingestion: SignalIngestion;
  readonly trails: ResearchTrailService;

  constructor(
    readonly neo4j: Neo4jClient,
    readonly vectors: VectorClient,
    readonly embedder: EmbeddingClient,
    private readonly opts: IntelligenceServiceConfig = {},
  ) {
    this.graph = new GraphRepository(neo4j);
    this.ingestion = new SignalIngestion(this.graph, vectors, embedder);
    this.trails = new ResearchTrailService(this.graph, vectors, embedder);
  }

  async start(): Promise<void> {
    await Promise.all([this.neo4j.ready(), this.vectors.ready()]);
    if (this.opts.runMigrationsOnBoot) {
      logger.info('running cypher migrations');
      await new MigrationRunner(this.neo4j).run();
    } else {
      logger.info('skipping cypher migrations (INTELLIGENCE_RUN_MIGRATIONS_ON_BOOT=false)');
    }
    logger.info('intelligence service ready');
  }

  async health(): Promise<{
    ok: boolean;
    neo4j: { ok: boolean; latencyMs: number; error?: string };
    qdrant: { ok: boolean; latencyMs: number; error?: string };
  }> {
    const [neo4jHealth, qdrantHealth] = await Promise.all([
      this.neo4j.health(),
      this.vectors.health(),
    ]);
    return { ok: neo4jHealth.ok && qdrantHealth.ok, neo4j: neo4jHealth, qdrant: qdrantHealth };
  }

  /**
   * GDPR delete — wipe everything for one user across both stores.
   * Returns counts for audit logging. Idempotent.
   */
  async forgetUser(
    userId: string,
  ): Promise<{ nodesDeleted: number; relsDeleted: number; vectorsDeleted: boolean }> {
    const graphResult = await this.graph.deleteUserData(userId);
    try {
      await this.vectors.deleteUserNamespace(userId);
      return { ...graphResult, vectorsDeleted: true };
    } catch (err) {
      logger.error({ err, userId }, 'vector deletion failed during forgetUser');
      return { ...graphResult, vectorsDeleted: false };
    }
  }
}

let instance: IntelligenceService | null = null;

export function setIntelligence(svc: IntelligenceService): void {
  instance = svc;
}
export function getIntelligence(): IntelligenceService {
  if (!instance)
    throw new Error('IntelligenceService not initialized — call setIntelligence() first');
  return instance;
}
export function maybeIntelligence(): IntelligenceService | null {
  return instance;
}
