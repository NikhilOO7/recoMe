import neo4j, { Driver, ManagedTransaction, QueryResult, RecordShape } from 'neo4j-driver';
import { logger } from '../observability/logger.js';
import { onShutdown } from '../observability/lifecycle.js';
import { withRetry } from '../observability/retry.js';

export interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
  /** Max sessions per connection pool. Default neo4j-driver = 100. */
  maxConnectionPoolSize?: number;
  /** Acquisition timeout in ms. Default 60s; we use 5s to fail fast. */
  connectionAcquisitionTimeoutMs?: number;
}

export class Neo4jClient {
  private readonly driver: Driver;
  private readonly database: string;
  private readyPromise: Promise<void> | null = null;

  constructor(private readonly config: Neo4jConfig) {
    this.database = config.database ?? 'neo4j';
    this.driver = neo4j.driver(config.uri, neo4j.auth.basic(config.username, config.password), {
      maxConnectionPoolSize: config.maxConnectionPoolSize ?? 50,
      connectionAcquisitionTimeout: config.connectionAcquisitionTimeoutMs ?? 5000,
      disableLosslessIntegers: true,
      userAgent: 'recome-cloud/1.0',
    });
    onShutdown(() => this.close());
  }

  /** Eager connectivity check; safe to call multiple times. */
  async ready(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = withRetry(
        () => this.driver.verifyConnectivity({ database: this.database }),
        {
          attempts: 5,
          baseDelayMs: 500,
          label: 'neo4j.verifyConnectivity',
        },
      ).then(() => {
        logger.info({ uri: this.config.uri, database: this.database }, 'neo4j connected');
      });
    }
    return this.readyPromise;
  }

  /** Health probe — short timeout, no retry. */
  async health(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      const session = this.driver.session({ database: this.database });
      try {
        await session.run('RETURN 1 AS ok');
        return { ok: true, latencyMs: Date.now() - start };
      } finally {
        await session.close();
      }
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, error: String(err) };
    }
  }

  async read<T>(work: (tx: ManagedTransaction) => Promise<T>, label = 'read'): Promise<T> {
    const session = this.driver.session({
      database: this.database,
      defaultAccessMode: neo4j.session.READ,
    });
    try {
      return await withRetry(() => session.executeRead(work), { label: `neo4j.${label}` });
    } finally {
      await session.close();
    }
  }

  async write<T>(work: (tx: ManagedTransaction) => Promise<T>, label = 'write'): Promise<T> {
    const session = this.driver.session({
      database: this.database,
      defaultAccessMode: neo4j.session.WRITE,
    });
    try {
      return await withRetry(() => session.executeWrite(work), { label: `neo4j.${label}` });
    } finally {
      await session.close();
    }
  }

  /** Convenience for one-shot autocommit reads. Prefer read() for multi-statement work. */
  async run<R extends RecordShape = RecordShape>(
    cypher: string,
    params: Record<string, unknown> = {},
    label = 'run',
  ): Promise<QueryResult<R>> {
    const session = this.driver.session({ database: this.database });
    try {
      return await withRetry(() => session.run<R>(cypher, params), { label: `neo4j.${label}` });
    } finally {
      await session.close();
    }
  }

  async close(): Promise<void> {
    try {
      await this.driver.close();
      logger.info('neo4j driver closed');
    } catch (err) {
      logger.error({ err }, 'neo4j driver close failed');
    }
  }
}

let instance: Neo4jClient | null = null;

export function initNeo4j(config: Neo4jConfig): Neo4jClient {
  if (!instance) instance = new Neo4jClient(config);
  return instance;
}

export function getNeo4j(): Neo4jClient {
  if (!instance) throw new Error('Neo4jClient not initialized — call initNeo4j() first');
  return instance;
}
