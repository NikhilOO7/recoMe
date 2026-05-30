/**
 * @jest-environment jsdom
 */
// Provide an in-memory IndexedDB shim BEFORE importing modules that open it.
import 'fake-indexeddb/auto';

import {
  enqueue,
  enqueueMany,
  take,
  ack,
  queueSize,
  pruneStale,
  makeSignalId,
} from '../SignalBatcher';
import type { Signal } from '../types';

// Polyfill structuredClone for fake-indexeddb on older node test envs.
const g = globalThis as unknown as { structuredClone?: <T>(v: T) => T };
if (!g.structuredClone) g.structuredClone = (v) => JSON.parse(JSON.stringify(v));

function makeSignal(over: Partial<Signal> = {}): Signal {
  return {
    id: makeSignalId(),
    kind: 'view',
    ts: Date.now(),
    platform: 'youtube',
    topics: [{ name: 'standing desks' }],
    sessionId: 'sess_x',
    ...over,
  };
}

describe('SignalBatcher', () => {
  test('enqueue → take returns the signal; ack removes it', async () => {
    const s = makeSignal();
    await enqueue(s);
    expect(await queueSize()).toBeGreaterThanOrEqual(1);

    const out = await take(10);
    expect(out.find((x) => x.id === s.id)).toBeDefined();

    await ack([s.id]);
    const remaining = await take(10);
    expect(remaining.find((x) => x.id === s.id)).toBeUndefined();
  });

  test('enqueueMany is atomic-ish — all rows visible after the call', async () => {
    const batch = [makeSignal(), makeSignal(), makeSignal()];
    await enqueueMany(batch);
    const out = await take(50);
    for (const s of batch) {
      expect(out.find((x) => x.id === s.id)).toBeDefined();
    }
  });

  test('take orders by ts ascending — oldest first', async () => {
    const old = makeSignal({ ts: 1_000 });
    const newer = makeSignal({ ts: 5_000 });
    // Insert newer first to prove ordering is by ts, not insertion.
    await enqueue(newer);
    await enqueue(old);
    const out = await take(50);
    const oldIdx = out.findIndex((s) => s.id === old.id);
    const newIdx = out.findIndex((s) => s.id === newer.id);
    expect(oldIdx).toBeGreaterThanOrEqual(0);
    expect(newIdx).toBeGreaterThanOrEqual(0);
    expect(oldIdx).toBeLessThan(newIdx);
  });

  test('pruneStale removes signals older than 72h', async () => {
    const stale = makeSignal({ ts: Date.now() - 80 * 60 * 60 * 1000 });
    const fresh = makeSignal({ ts: Date.now() - 1_000 });
    await enqueueMany([stale, fresh]);

    const removed = await pruneStale();
    expect(removed).toBeGreaterThanOrEqual(1);

    const out = await take(50);
    expect(out.find((x) => x.id === stale.id)).toBeUndefined();
    expect(out.find((x) => x.id === fresh.id)).toBeDefined();
  });

  test('makeSignalId is lexicographically time-sortable', () => {
    const a = makeSignalId();
    // Force the next id into a measurably later ms by busy-spinning briefly.
    const start = Date.now();
    while (Date.now() === start) {
      /* spin */
    }
    const b = makeSignalId();
    expect(a < b).toBe(true);
  });
});
