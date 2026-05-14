import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../retry.js';

describe('withRetry', () => {
  it('returns the value on first success', async () => {
    const fn = vi.fn().mockResolvedValue(42);
    await expect(withRetry(fn)).resolves.toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on transient ECONNRESET', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('reset'), { code: 'ECONNRESET' }))
      .mockResolvedValue('ok');
    await expect(withRetry(fn, { baseDelayMs: 1 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry on non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('schema invalid'));
    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toThrow('schema invalid');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('honors attempts cap', async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }));
    await expect(withRetry(fn, { attempts: 2, baseDelayMs: 1 })).rejects.toThrow('timeout');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on Neo4jError Transient/ServiceUnavailable', async () => {
    const transient = Object.assign(new Error('Neo.TransientError.Cluster.NotALeader'), {
      name: 'Neo4jError',
    });
    const fn = vi.fn().mockRejectedValueOnce(transient).mockResolvedValue('after-failover');
    await expect(withRetry(fn, { baseDelayMs: 1 })).resolves.toBe('after-failover');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
