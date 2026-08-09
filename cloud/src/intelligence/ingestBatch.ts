import { signalSchema } from './schemas.js';
import type { SignalIngestion } from './SignalIngestion.js';
import { logger } from '../observability/logger.js';

// Per-item batch ingestion shared by /intelligence/signals (consumer) and
// /v1/signals (IaaS). Semantics:
//   - results:   ingested signals, in input order
//   - rejected:  failed validation — permanent, the client must not retry
//   - retryable: passed validation but ingest threw (Neo4j/Qdrant/OpenAI
//                outage) — transient, the client should keep and resend;
//                ingestion is idempotent on the client-supplied signal id
// A batch never fails as a unit once the envelope parses.

export interface BatchItemReject {
  index: number;
  id: string | null;
  code: 'invalid_signal';
  issues: string[];
}

export interface BatchItemRetry {
  index: number;
  id: string | null;
}

export interface BatchIngestOutcome {
  results: Array<{ signalId: string; topicsCreated: number; entitiesCreated: number }>;
  accepted: number;
  rejected: BatchItemReject[];
  retryable: BatchItemRetry[];
}

function idOf(raw: unknown): string | null {
  if (raw !== null && typeof raw === 'object' && 'id' in raw && typeof raw.id === 'string') {
    return raw.id;
  }
  return null;
}

export async function ingestBatch(
  ingestion: SignalIngestion,
  userId: string,
  rawSignals: unknown[],
): Promise<BatchIngestOutcome> {
  const outcome: BatchIngestOutcome = { results: [], accepted: 0, rejected: [], retryable: [] };

  for (let index = 0; index < rawSignals.length; index++) {
    const raw = rawSignals[index];
    const parsed = signalSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      outcome.rejected.push({ index, id: idOf(raw), code: 'invalid_signal', issues });
      logger.warn({ userId, index, id: idOf(raw), issues }, 'signal rejected by validation');
      continue;
    }
    try {
      const r = await ingestion.ingest({ ...parsed.data, userId });
      outcome.results.push({
        signalId: r.signalId,
        topicsCreated: r.topicsCreated,
        entitiesCreated: r.entitiesCreated,
      });
      outcome.accepted++;
    } catch (err) {
      outcome.retryable.push({ index, id: parsed.data.id ?? null });
      logger.error(
        { err, userId, index, kind: parsed.data.kind },
        'signal ingest failed (retryable)',
      );
    }
  }

  return outcome;
}
