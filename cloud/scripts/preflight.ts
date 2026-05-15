#!/usr/bin/env tsx
/**
 * Pre-deploy connectivity check.
 *
 * Verifies every external dependency the intelligence stack needs:
 *   - Neo4j: bolt connection + simple query
 *   - Qdrant: collections endpoint
 *   - OpenAI: tiny embedding call
 *
 * Exits 0 on full health, 1 with an actionable error per failure.
 * Safe to run from CI before flipping INTELLIGENCE_ENABLED.
 *
 * Usage:
 *   npm run preflight                 # uses .env in cwd
 *   NEO4J_URI=... npm run preflight   # explicit override
 */
import { getConfig } from '../src/config.js';
import { Neo4jClient } from '../src/graph/Neo4jClient.js';
import { QdrantVectorClient } from '../src/vector/QdrantClient.js';
import { OpenAIEmbeddings } from '../src/vector/OpenAIEmbeddings.js';
import { logger } from '../src/observability/logger.js';

interface CheckResult {
  name: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
  hint?: string;
}

async function checkNeo4j(): Promise<CheckResult> {
  const start = Date.now();
  const cfg = getConfig();
  if (!cfg.NEO4J_URI || !cfg.NEO4J_USERNAME || !cfg.NEO4J_PASSWORD) {
    return {
      name: 'neo4j',
      ok: false,
      latencyMs: 0,
      error: 'NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD must be set',
      hint: 'Provision a Neo4j AuraDB instance and copy creds — see docs/architecture/0002-deployment-notes.md',
    };
  }
  const client = new Neo4jClient({
    uri: cfg.NEO4J_URI,
    username: cfg.NEO4J_USERNAME,
    password: cfg.NEO4J_PASSWORD,
    database: cfg.NEO4J_DATABASE,
  });
  try {
    await client.ready();
    const h = await client.health();
    return { name: 'neo4j', ok: h.ok, latencyMs: h.latencyMs, error: h.error };
  } catch (err) {
    return {
      name: 'neo4j',
      ok: false,
      latencyMs: Date.now() - start,
      error: String(err),
      hint: 'Check NEO4J_URI scheme (neo4j+s for Aura), password rotation, IP allowlist',
    };
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function checkQdrant(): Promise<CheckResult> {
  const start = Date.now();
  const cfg = getConfig();
  if (!cfg.QDRANT_URL) {
    return {
      name: 'qdrant',
      ok: false,
      latencyMs: 0,
      error: 'QDRANT_URL must be set',
      hint: 'Spin up Qdrant Cloud (free 1GB) or run `docker compose up -d qdrant` locally',
    };
  }
  const client = new QdrantVectorClient({
    url: cfg.QDRANT_URL,
    apiKey: cfg.QDRANT_API_KEY,
    collection: cfg.QDRANT_COLLECTION,
    dim: 1536, // dim doesn't matter for health probe
  });
  try {
    const h = await client.health();
    return { name: 'qdrant', ok: h.ok, latencyMs: h.latencyMs, error: h.error };
  } catch (err) {
    return {
      name: 'qdrant',
      ok: false,
      latencyMs: Date.now() - start,
      error: String(err),
      hint: 'Verify QDRANT_URL and QDRANT_API_KEY; cluster may still be provisioning',
    };
  }
}

async function checkOpenAI(): Promise<CheckResult> {
  const start = Date.now();
  const cfg = getConfig();
  if (!cfg.OPENAI_API_KEY) {
    return {
      name: 'openai',
      ok: false,
      latencyMs: 0,
      error: 'OPENAI_API_KEY must be set',
      hint: 'Create a project-scoped key with Embeddings permission only',
    };
  }
  try {
    const embedder = new OpenAIEmbeddings({
      apiKey: cfg.OPENAI_API_KEY,
      model: cfg.OPENAI_EMBEDDING_MODEL,
    });
    const res = await embedder.embed({ inputs: ['preflight'] });
    const ok = res.vectors.length === 1 && res.vectors[0].length === embedder.dim;
    return {
      name: 'openai',
      ok,
      latencyMs: Date.now() - start,
      error: ok ? undefined : `unexpected dim or empty response`,
    };
  } catch (err) {
    return {
      name: 'openai',
      ok: false,
      latencyMs: Date.now() - start,
      error: String(err),
      hint: 'Check OPENAI_API_KEY validity, billing status, and usage limits',
    };
  }
}

async function main(): Promise<void> {
  logger.info({ enabled: getConfig().INTELLIGENCE_ENABLED }, 'preflight starting');
  const results = await Promise.all([checkNeo4j(), checkQdrant(), checkOpenAI()]);

  let allOk = true;
  for (const r of results) {
    if (r.ok) {
      logger.info({ check: r.name, latencyMs: r.latencyMs }, 'OK');
    } else {
      allOk = false;
      logger.error({ check: r.name, latencyMs: r.latencyMs, error: r.error, hint: r.hint }, 'FAIL');
    }
  }

  if (!allOk) {
    logger.error('preflight failed — do not flip INTELLIGENCE_ENABLED yet');
    process.exit(1);
  }
  logger.info('preflight passed — safe to deploy with INTELLIGENCE_ENABLED=true');
}

main().catch((err) => {
  logger.error({ err }, 'preflight crashed');
  process.exit(1);
});
