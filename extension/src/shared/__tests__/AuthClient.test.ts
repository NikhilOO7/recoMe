/**
 * @jest-environment jsdom
 *
 * Pins the session-survival contract of the refresh path (the 2026-08-13
 * "signed out on a server blip" regression): only an explicit rejection of
 * the refresh token may clear the session. Transient failures — cold-start
 * 502/503 from scale-to-zero, 429 from the API's own rate limiter — keep
 * tokens so the next attempt can succeed.
 */

const store: Record<string, unknown> = {};
(globalThis as { chrome?: unknown }).chrome = {
  storage: {
    local: {
      get: jest.fn(async (keys: string | string[]) => {
        const list = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(list.map((k) => [k, store[k]]));
      }),
      set: jest.fn(async (obj: Record<string, unknown>) => {
        Object.assign(store, obj);
      }),
      remove: jest.fn(async (keys: string | string[]) => {
        for (const k of Array.isArray(keys) ? keys : [keys]) delete store[k];
      }),
    },
  },
};

import { refreshAccessToken, hasRefreshToken } from '../AuthClient';
import { STORAGE_KEYS } from '../constants';

function seedSession(): void {
  store[STORAGE_KEYS.access_token] = 'old-access';
  store[STORAGE_KEYS.refresh_token] = 'refresh-abc';
}

function mockRefreshResponse(status: number, body?: unknown): void {
  globalThis.fetch = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body ?? {},
  })) as unknown as typeof fetch;
}

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  seedSession();
});

describe('refreshAccessToken failure handling', () => {
  test('503 (cold start) returns null but KEEPS the session', async () => {
    mockRefreshResponse(503);
    expect(await refreshAccessToken()).toBeNull();
    expect(await hasRefreshToken()).toBe(true);
    expect(store[STORAGE_KEYS.refresh_token]).toBe('refresh-abc');
  });

  test('429 (rate limited) returns null but KEEPS the session', async () => {
    mockRefreshResponse(429);
    expect(await refreshAccessToken()).toBeNull();
    expect(await hasRefreshToken()).toBe(true);
  });

  test('network error returns null but KEEPS the session', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    expect(await refreshAccessToken()).toBeNull();
    expect(await hasRefreshToken()).toBe(true);
  });

  test('401 (refresh token rejected) clears the session', async () => {
    mockRefreshResponse(401);
    expect(await refreshAccessToken()).toBeNull();
    expect(await hasRefreshToken()).toBe(false);
    expect(store[STORAGE_KEYS.access_token]).toBeUndefined();
  });

  test('success stores the rotated tokens', async () => {
    mockRefreshResponse(200, { accessToken: 'new-access', refreshToken: 'new-refresh' });
    expect(await refreshAccessToken()).toBe('new-access');
    expect(store[STORAGE_KEYS.access_token]).toBe('new-access');
    expect(store[STORAGE_KEYS.refresh_token]).toBe('new-refresh');
  });
});
