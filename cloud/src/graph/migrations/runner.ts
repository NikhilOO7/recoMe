import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Neo4jClient } from '../Neo4jClient.js';
import { logger } from '../../observability/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Cypher migration runner.
 *
 * Stores applied migrations in (:Migration {id, appliedAt}) nodes.
 * Filenames must match `\d{3}_.+\.cypher`; ID is the leading number.
 * Each file may contain multiple statements separated by `;`.
 * Statements are run inside a single write transaction per file
 * so a partial failure rolls back to a known state.
 */
export class MigrationRunner {
  constructor(private readonly neo4j: Neo4jClient) {}

  async run(): Promise<void> {
    const applied = await this.loadApplied();
    const files = await this.discoverFiles();

    for (const file of files) {
      if (applied.has(file.id)) {
        logger.debug({ id: file.id, name: file.name }, 'migration already applied');
        continue;
      }
      const start = Date.now();
      logger.info({ id: file.id, name: file.name }, 'applying migration');
      const statements = this.splitStatements(await readFile(file.path, 'utf8'));

      // Neo4j 5+ / AuraDB forbids mixing schema modifications (CREATE
      // CONSTRAINT / INDEX) with data writes in a single transaction
      // (GQL 25N01 "invalid combination of statement types"). Run the
      // migration file's statements in one tx, then record the marker
      // node in its own tx. If the marker write fails after a successful
      // schema apply, the next run will see schema-already-exists (IF NOT
      // EXISTS makes that a no-op) and retry the marker — idempotent.
      await this.neo4j.write(async (tx) => {
        for (const stmt of statements) {
          await tx.run(stmt);
        }
      }, `migration_${file.id}`);
      await this.neo4j.write(async (tx) => {
        await tx.run(
          'MERGE (m:Migration {id: $id}) SET m.name = $name, m.appliedAt = timestamp()',
          { id: file.id, name: file.name },
        );
      }, `migration_${file.id}_marker`);
      logger.info(
        { id: file.id, name: file.name, durationMs: Date.now() - start },
        'migration applied',
      );
    }
  }

  private async loadApplied(): Promise<Set<string>> {
    const res = await this.neo4j.read(async (tx) => {
      const r = await tx.run('MATCH (m:Migration) RETURN m.id AS id');
      return r.records.map((rec) => rec.get('id') as string);
    }, 'load_migrations');
    return new Set(res);
  }

  private async discoverFiles(): Promise<{ id: string; name: string; path: string }[]> {
    const entries = await readdir(__dirname, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && /^\d{3}_.+\.cypher$/.test(e.name))
      .map((e) => ({
        id: e.name.slice(0, 3),
        name: e.name,
        path: join(__dirname, e.name),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    return files;
  }

  private splitStatements(content: string): string[] {
    return content
      .split(/;\s*(?:\n|$)/)
      .map((s) => s.replace(/^\s*\/\/.*$/gm, '').trim())
      .filter((s) => s.length > 0);
  }
}
