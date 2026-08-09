/**
 * @jest-environment jsdom
 */
// In-memory IndexedDB BEFORE anything opens a DB.
import 'fake-indexeddb/auto';

import { enqueueMany, take, ack, queueSize, makeSignalId } from '@shared/SignalBatcher';
import { CloudHttpError } from '@shared/CloudClient';
import type { BatchIngestResponse } from '@shared/CloudClient';
import type { Signal } from '@shared/types';

const g = globalThis as unknown as { structuredClone?: <T>(v: T) => T };
if (!g.structuredClone) g.structuredClone = (v) => JSON.parse(JSON.stringify(v));

// Mock only the network + auth boundaries; the IDB queue is real.
jest.mock('@shared/CloudClient', () => {
  const actual = jest.requireActual('@shared/CloudClient');
  return { ...actual, postSignals: jest.fn() };
});
jest.mock('@shared/AuthClient', () => ({
  getAuthState: jest.fn(async () => ({ loggedIn: true, user: { id: 'u1', email: 'x@y.z' } })),
}));

const { postSignals } = require('@shared/CloudClient') as { postSignals: jest.Mock };

function makeSignal(over: Partial<Signal> = {}): Signal {
  return {
    id: makeSignalId(),
    kind: 'view',
    ts: Date.now(),
    platform: 'udemy',
    topics: [{ name: 'distributed systems' }],
    ...over,
  };
}

async function drainQueue(): Promise<void> {
  const all = await take(1000);
  if (all.length) await ack(all.map((s) => s.id));
}

// flush() keeps module state (backoff, in-flight flag) — fresh module per test.
async function freshFlush() {
  let flush: () => Promise<{ uploaded: number; remaining: number }> = async () => {
    throw new Error('not loaded');
  };
  jest.isolateModules(() => {
    flush = (require('../SignalUploader') as typeof import('../SignalUploader')).flush;
  });
  return flush;
}

const ok = (over: Partial<BatchIngestResponse> = {}): BatchIngestResponse => ({
  results: [],
  accepted: 0,
  rejected: [],
  retryable: [],
  ...over,
});

describe('SignalUploader.flush', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await drainQueue();
  });

  test('acks the whole batch on clean acceptance', async () => {
    const signals = [makeSignal(), makeSignal(), makeSignal()];
    await enqueueMany(signals);
    postSignals.mockResolvedValueOnce(ok({ accepted: 3 }));

    const flush = await freshFlush();
    const res = await flush();

    expect(res.uploaded).toBe(3);
    expect(await queueSize()).toBe(0);
  });

  test('D1 regression: rejected signals are dropped individually — valid neighbors are acked, not lost', async () => {
    // Explicit sortable ids: take() returns id-sorted, and makeSignalId ties
    // within a millisecond — fixed ids keep batch positions deterministic.
    const first = makeSignal({ id: 'sig_test_a' });
    const bad = makeSignal({ id: 'sig_test_b' });
    const third = makeSignal({ id: 'sig_test_c' });
    await enqueueMany([first, bad, third]);
    postSignals.mockResolvedValueOnce(
      ok({
        accepted: 2,
        rejected: [{ index: 1, id: bad.id, code: 'invalid_signal', issues: ['platform: bad'] }],
      }),
    );

    const flush = await freshFlush();
    const res = await flush();

    // 2 landed, 1 permanently rejected; nothing survives in the queue and
    // nothing valid was thrown away with the bad one.
    expect(res.uploaded).toBe(2);
    expect(await queueSize()).toBe(0);
  });

  test('retryable signals stay queued for the next flush; others are acked', async () => {
    // Explicit sortable ids (see above): flaky's id sorts last → batch index 2.
    const first = makeSignal({ id: 'sig_test_a' });
    const second = makeSignal({ id: 'sig_test_b' });
    const flaky = makeSignal({ id: 'sig_test_c' });
    await enqueueMany([first, second, flaky]);
    postSignals.mockResolvedValueOnce(ok({ accepted: 2, retryable: [{ index: 2, id: flaky.id }] }));

    const flush = await freshFlush();
    const res = await flush();

    expect(res.uploaded).toBe(2);
    expect(await queueSize()).toBe(1);
    const remaining = await take(10);
    expect(remaining.map((s) => s.id)).toEqual([flaky.id]);
    await ack(remaining.map((s) => s.id));
  });

  test('envelope-level 4xx drops the batch (client bug guard) instead of poisoning the queue', async () => {
    await enqueueMany([makeSignal(), makeSignal()]);
    postSignals.mockRejectedValueOnce(new CloudHttpError(400, 'invalid_signals'));

    const flush = await freshFlush();
    const res = await flush();

    expect(res.uploaded).toBe(0);
    expect(await queueSize()).toBe(0);
  });

  test('5xx keeps everything queued and backs off', async () => {
    await enqueueMany([makeSignal(), makeSignal()]);
    postSignals.mockRejectedValueOnce(new CloudHttpError(503, 'unavailable'));

    const flush = await freshFlush();
    const res = await flush();

    expect(res.uploaded).toBe(0);
    expect(await queueSize()).toBe(2);
  });

  test('does not upload while logged out', async () => {
    const { getAuthState } = require('@shared/AuthClient') as { getAuthState: jest.Mock };
    getAuthState.mockResolvedValueOnce({ loggedIn: false });
    await enqueueMany([makeSignal()]);

    const flush = await freshFlush();
    const res = await flush();

    expect(postSignals).not.toHaveBeenCalled();
    expect(res.uploaded).toBe(0);
    expect(await queueSize()).toBe(1);
  });
});
