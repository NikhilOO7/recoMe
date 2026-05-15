import { GraphSync, type SignalDraft } from './GraphSync';
import { CLOUD_URL } from '@shared/constants';
import { getAccessToken } from '@shared/AuthManager';
import { safeStorageSyncGet } from '@shared/storageSync';
import { createLogger } from '@shared/Logger';

const log = createLogger('GraphSyncService');

/**
 * Background-singleton wrapper around GraphSync.
 *
 * Owns:
 *   - opt-in gate (reads `recome_settings.cloudIntelligenceEnabled`)
 *   - token retrieval (delegates to AuthManager)
 *   - cloud URL (from constants)
 *
 * Exposed:
 *   - initGraphSync()         — call once at background init
 *   - getGraphSync()          — singleton accessor; returns null if not init
 *   - enqueueGraphSignal(...) — convenience helper for handlers
 */

let instance: GraphSync | null = null;

interface SettingsLike {
  cloudIntelligenceEnabled?: boolean;
  [k: string]: unknown;
}

async function getOptInState(): Promise<boolean> {
  try {
    const data = await safeStorageSyncGet('recome_settings');
    const settings = data.recome_settings as SettingsLike | undefined;
    return settings?.cloudIntelligenceEnabled === true;
  } catch (err) {
    log.warn('failed to read opt-in state; defaulting to off', err);
    return false;
  }
}

export function initGraphSync(opts?: { baseUrl?: string }): GraphSync {
  if (instance) return instance;
  const baseUrl = opts?.baseUrl ?? CLOUD_URL;
  instance = new GraphSync({
    baseUrl,
    getToken: async () => (await getAccessToken()) ?? null,
    getOptInState,
    flushIntervalMs: 30_000,
    batchTrigger: 25,
    maxQueue: 500,
  });
  log.info(`GraphSync initialized → ${baseUrl}`);
  return instance;
}

export function getGraphSync(): GraphSync | null {
  return instance;
}

/**
 * Fire-and-forget enqueue helper. Safe to call from message handlers without
 * worrying about whether GraphSync has been initialized — if it hasn't, this
 * is a no-op. Use this in preference to `getGraphSync()?.enqueue(...)`
 * scattered through the codebase.
 */
export function enqueueGraphSignal(signal: SignalDraft): void {
  if (!instance) return;
  try {
    instance.enqueue(signal);
  } catch (err) {
    log.warn('GraphSync enqueue failed', err);
  }
}
