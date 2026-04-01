/**
 * P3.3: Safe chrome.storage.sync wrapper with fallback to chrome.storage.local.
 *
 * Firefox private browsing and some environments don't support storage.sync
 * or may hit quota limits. This wrapper tries sync first, then falls back
 * to local storage transparently.
 */

const SYNC_PREFIX = '__sync_fallback_';

function isSyncAvailable(): boolean {
  try {
    return typeof chrome !== 'undefined' && !!chrome.storage?.sync;
  } catch {
    return false;
  }
}

/**
 * Get values from storage.sync, falling back to storage.local on failure.
 */
export async function safeStorageSyncGet(
  keys: string | string[] | null,
): Promise<Record<string, unknown>> {
  if (isSyncAvailable()) {
    try {
      return await chrome.storage.sync.get(keys);
    } catch {
      // sync unavailable at runtime (e.g., Firefox private browsing) — fall through
    }
  }

  // Fallback: read from local with prefix
  if (keys === null) {
    const all = await chrome.storage.local.get(null);
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(all)) {
      if (k.startsWith(SYNC_PREFIX)) {
        result[k.slice(SYNC_PREFIX.length)] = v;
      }
    }
    return result;
  }

  const keyArr = typeof keys === 'string' ? [keys] : keys;
  const prefixed = keyArr.map((k) => SYNC_PREFIX + k);
  const raw = await chrome.storage.local.get(prefixed);
  const result: Record<string, unknown> = {};
  for (const k of keyArr) {
    const val = raw[SYNC_PREFIX + k];
    if (val !== undefined) result[k] = val;
  }
  return result;
}

/**
 * Set values in storage.sync, falling back to storage.local on failure.
 */
export async function safeStorageSyncSet(items: Record<string, unknown>): Promise<void> {
  if (isSyncAvailable()) {
    try {
      await chrome.storage.sync.set(items);
      return;
    } catch {
      // Fall through to local fallback
    }
  }

  const prefixed: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(items)) {
    prefixed[SYNC_PREFIX + k] = v;
  }
  await chrome.storage.local.set(prefixed);
}
