/**
 * SignalUploader — drains the IDB signal queue to cloud on alarm + on demand.
 *
 * Strategy:
 *   - alarm every 30s (ALARM_INTERVALS_MIN.signal_flush)
 *   - immediate flush on chrome.runtime startup + on FLUSH_NOW message
 *   - chunked at 100 (matches cloud signalBatchSchema cap)
 *   - on failure: keep in queue, exponential backoff via next alarm
 *   - on 401: refresh attempted inside CloudClient; if it still fails the
 *     queue accumulates until login
 *   - prune > 72h on every drain so an offline user's queue is bounded
 */

import { ALARM_NAMES, ALARM_INTERVALS_MIN } from '@shared/constants';
import { take, ack, pruneStale, queueSize } from '@shared/SignalBatcher';
import { postSignals, CloudHttpError } from '@shared/CloudClient';
import { getAuthState } from '@shared/AuthClient';
import { createLogger } from '@shared/Logger';

const log = createLogger('SignalUploader');
const BATCH = 100;

let flushInFlight = false;
let backoffUntil = 0;

export async function registerSignalUploader(): Promise<void> {
  await chrome.alarms.create(ALARM_NAMES.signal_flush, {
    periodInMinutes: ALARM_INTERVALS_MIN.signal_flush,
  });
  // Drain anything accumulated while SW was asleep.
  void flush();
}

export async function flush(): Promise<{ uploaded: number; remaining: number }> {
  if (flushInFlight) return { uploaded: 0, remaining: await queueSize() };
  if (Date.now() < backoffUntil) {
    return { uploaded: 0, remaining: await queueSize() };
  }

  flushInFlight = true;
  let uploaded = 0;
  try {
    const auth = await getAuthState();
    if (!auth.loggedIn) {
      // No upload while logged out. Queue persists until login.
      return { uploaded: 0, remaining: await queueSize() };
    }

    await pruneStale();

    // Keep draining until the queue is empty or a batch fails.
    while (true) {
      const batch = await take(BATCH);
      if (batch.length === 0) break;

      try {
        const res = await postSignals(batch);

        // Per-item outcome: ack everything except signals the cloud marked
        // transiently failed (`retryable`) — those stay queued and resend on
        // the next flush (server ingest is idempotent on signal id).
        // `rejected` signals failed validation permanently: ack (drop) them
        // individually and loudly, never their valid neighbors.
        const retryIdx = new Set((res.retryable ?? []).map((r) => r.index));
        const ackIds = batch.filter((_, i) => !retryIdx.has(i)).map((s) => s.id);
        await ack(ackIds);
        uploaded += res.accepted ?? batch.length;

        if (res.rejected && res.rejected.length > 0) {
          log.warn(
            `cloud permanently rejected ${res.rejected.length}/${batch.length} signals`,
            res.rejected.map((r) => `#${r.index} ${r.id ?? '?'}: ${r.issues.join('; ')}`),
          );
        }
        if (retryIdx.size > 0) {
          // Transient store trouble server-side — don't spin on it this cycle.
          backoffUntil = Date.now() + 60_000;
          log.warn(`${retryIdx.size} signals deferred by cloud; backing off`);
          break;
        }
      } catch (e) {
        if (e instanceof CloudHttpError && e.status >= 400 && e.status < 500) {
          // Envelope-level 4xx other than 401: the batch shape itself is
          // malformed — a client bug, since per-item validation handles bad
          // signals without erroring. Drop to avoid poisoning the queue, and
          // log at error level so it's never silent.
          if (e.status !== 401) {
            log.error(
              `ENVELOPE REJECTED — dropping ${batch.length} signals (${e.code}); client bug likely`,
            );
            await ack(batch.map((s) => s.id));
            continue;
          }
        }
        // 401 / 5xx / network: back off, retry on next alarm
        const wait = 60_000;
        backoffUntil = Date.now() + wait;
        log.warn(`upload failed; backing off ${wait}ms`, e);
        break;
      }
    }

    return { uploaded, remaining: await queueSize() };
  } finally {
    flushInFlight = false;
  }
}

export function handleAlarm(name: string): void {
  if (name === ALARM_NAMES.signal_flush) void flush();
}
