/**
 * SignalBatcher — IDB-backed offline queue for captured signals.
 *
 * Why IDB and not chrome.storage:
 *   - capture volume can spike (dozens/min during active research) and
 *     chrome.storage.local has a 5MB-ish soft ceiling + slow batch writes.
 *   - SW restarts must not lose pending signals (IDB persists; in-memory
 *     queues do not).
 *
 * Enqueue from any context (content/popup/bg). Drain only from background
 * (SignalUploader). Records older than 72h are dropped on drain to bound
 * the queue if the user is offline for a long time.
 */

import { openDB, type IDBPDatabase } from 'idb';
import { DB_NAME, DB_VERSION } from './constants';
import type { Signal } from './types';
import { createLogger } from './Logger';

const log = createLogger('SignalBatcher');
const STORE = 'signals';
const MAX_AGE_MS = 72 * 60 * 60 * 1000;

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database, oldVersion) {
        // Fresh schema for v3. Wipe any stale stores from prior versions.
        for (const name of Array.from(database.objectStoreNames)) {
          database.deleteObjectStore(name);
        }
        const store = database.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('ts', 'ts');
        log.info(`IDB upgraded ${oldVersion} → ${DB_VERSION}`);
      },
    });
  }
  return dbPromise;
}

export function makeSignalId(): string {
  // ULID-ish: 48-bit time + 80-bit random. Ordered by ts for natural read order.
  const ts = Date.now().toString(36).padStart(10, '0');
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(10)))
    .map((b) => (b % 36).toString(36))
    .join('');
  return `sig_${ts}_${rand}`;
}

export async function enqueue(signal: Signal): Promise<void> {
  const d = await db();
  await d.put(STORE, signal);
}

export async function enqueueMany(signals: Signal[]): Promise<void> {
  if (signals.length === 0) return;
  const d = await db();
  const tx = d.transaction(STORE, 'readwrite');
  await Promise.all(signals.map((s) => tx.store.put(s)));
  await tx.done;
}

export async function take(max: number): Promise<Signal[]> {
  const d = await db();
  const tx = d.transaction(STORE, 'readonly');
  const idx = tx.store.index('ts');
  const out: Signal[] = [];
  let cursor = await idx.openCursor();
  while (cursor && out.length < max) {
    out.push(cursor.value as Signal);
    cursor = await cursor.continue();
  }
  await tx.done;
  return out;
}

export async function ack(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const d = await db();
  const tx = d.transaction(STORE, 'readwrite');
  await Promise.all(ids.map((id) => tx.store.delete(id)));
  await tx.done;
}

export async function pruneStale(): Promise<number> {
  const cutoff = Date.now() - MAX_AGE_MS;
  const d = await db();
  const tx = d.transaction(STORE, 'readwrite');
  const idx = tx.store.index('ts');
  let cursor = await idx.openCursor(IDBKeyRange.upperBound(cutoff));
  let removed = 0;
  while (cursor) {
    await cursor.delete();
    removed++;
    cursor = await cursor.continue();
  }
  await tx.done;
  if (removed > 0) log.info(`pruned ${removed} stale signals (>72h)`);
  return removed;
}

export async function queueSize(): Promise<number> {
  const d = await db();
  return d.count(STORE);
}
