#!/usr/bin/env tsx
/**
 * One-shot cypher migration runner.
 *
 * Use:  npm run graph:migrate
 *
 * Prefer this over INTELLIGENCE_RUN_MIGRATIONS_ON_BOOT=true in production:
 * boot-time migrations couple deploys to schema changes and make rollback
 * harder. Run this once, then deploy the new app code.
 */
import { getConfig } from '../src/config.js';
import { initNeo4j } from '../src/graph/Neo4jClient.js';
import { MigrationRunner } from '../src/graph/migrations/runner.js';
import { logger } from '../src/observability/logger.js';

async function main(): Promise<void> {
  const config = getConfig();
  if (!config.NEO4J_URI || !config.NEO4J_USERNAME || !config.NEO4J_PASSWORD) {
    logger.error('NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD must be set');
    process.exit(1);
  }
  const neo4j = initNeo4j({
    uri: config.NEO4J_URI,
    username: config.NEO4J_USERNAME,
    password: config.NEO4J_PASSWORD,
    database: config.NEO4J_DATABASE,
  });
  await neo4j.ready();
  await new MigrationRunner(neo4j).run();
  await neo4j.close();
  logger.info('migrations complete');
}

main().catch((err) => {
  logger.error({ err }, 'migration failed');
  process.exit(1);
});
