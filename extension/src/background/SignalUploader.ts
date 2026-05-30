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
        await postSignals(batch);
        await ack(batch.map((s) => s.id));
        uploaded += batch.length;
      } catch (e) {
        if (e instanceof CloudHttpError && e.status >= 400 && e.status < 500) {
          // 4xx other than 401 means malformed signals — log + drop to avoid
          // poisoning the queue forever.
          if (e.status !== 401) {
            log.warn(`drop ${batch.length} signals (cloud rejected ${e.code})`);
            await ack(batch.map((s) => s.id));
            continue;
          }
        }
        // 5xx / network: back off, retry on next alarm
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
