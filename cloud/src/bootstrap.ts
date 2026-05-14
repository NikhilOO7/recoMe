import type { Config } from './config.js';
import { initNeo4j } from './graph/Neo4jClient.js';
import { initQdrant } from './vector/QdrantClient.js';
import { OpenAIEmbeddings } from './vector/OpenAIEmbeddings.js';
import { IntelligenceService, setIntelligence } from './intelligence/IntelligenceService.js';
import { logger } from './observability/logger.js';

/**
 * Lazy boot of the intelligence stack. Called from index.ts.
 *
 * Fails fast if INTELLIGENCE_ENABLED=true and any required env var is missing,
 * so the operator notices misconfig at deploy time, not at first request.
 */
export async function bootIntelligence(config: Config): Promise<void> {
  if (!config.INTELLIGENCE_ENABLED) {
    logger.info('intelligence stack disabled (INTELLIGENCE_ENABLED=false)');
    return;
  }

  const missing: string[] = [];
  if (!config.NEO4J_URI) missing.push('NEO4J_URI');
  if (!config.NEO4J_USERNAME) missing.push('NEO4J_USERNAME');
  if (!config.NEO4J_PASSWORD) missing.push('NEO4J_PASSWORD');
  if (!config.QDRANT_URL) missing.push('QDRANT_URL');
  if (!config.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
  if (missing.length > 0) {
    throw new Error(`intelligence enabled but missing env: ${missing.join(', ')}`);
  }

  const neo4j = initNeo4j({
    uri: config.NEO4J_URI!,
    username: config.NEO4J_USERNAME!,
    password: config.NEO4J_PASSWORD!,
    database: config.NEO4J_DATABASE,
  });

  const embedder = new OpenAIEmbeddings({
    apiKey: config.OPENAI_API_KEY!,
    model: config.OPENAI_EMBEDDING_MODEL,
  });

  const vectors = initQdrant({
    url: config.QDRANT_URL!,
    apiKey: config.QDRANT_API_KEY,
    collection: config.QDRANT_COLLECTION,
    dim: embedder.dim,
  });

  const svc = new IntelligenceService(neo4j, vectors, embedder, {
    runMigrationsOnBoot: config.INTELLIGENCE_RUN_MIGRATIONS_ON_BOOT,
  });
  await svc.start();
  setIntelligence(svc);
}
