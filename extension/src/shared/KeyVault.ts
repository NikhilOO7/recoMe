/**
 * KeyVault — encrypted storage for API keys.
 *
 * Wraps chrome.storage.local with AES-GCM encryption via DataEncryption.
 * Keys are never stored in plaintext; the encryption key is derived from
 * the extension ID (deterministic per installation).
 *
 * Falls back to plaintext if Web Crypto is unavailable (e.g., HTTP context).
 */

import { getEncryption, DataEncryption } from './encryption';
import { createLogger } from './Logger';

const log = createLogger('KeyVault');

const STORAGE_KEY = 'recome_api_keys';
const ENCRYPTED_MARKER = 'recome_api_keys_encrypted';

export type ApiKeyMap = Record<string, string>;

/**
 * Save API keys — encrypts before storing.
 * Merges with existing keys (does not overwrite keys not in the patch).
 */
export async function saveApiKeys(patch: ApiKeyMap): Promise<void> {
  const existing = await loadApiKeys();
  const merged = { ...existing, ...patch };

  const enc = await getEncryption();
  if (enc) {
    try {
      const encrypted = await enc.encrypt(merged);
      await chrome.storage.local.set({
        [STORAGE_KEY]: encrypted,
        [ENCRYPTED_MARKER]: true,
      });
      return;
    } catch (err) {
      log.warn('Encryption failed, falling back to plaintext', err);
    }
  }

  // Fallback: store plaintext (Web Crypto unavailable)
  await chrome.storage.local.set({
    [STORAGE_KEY]: merged,
    [ENCRYPTED_MARKER]: false,
  });
}

/**
 * Load API keys — decrypts if stored encrypted.
 */
export async function loadApiKeys(): Promise<ApiKeyMap> {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEY, ENCRYPTED_MARKER]);
    const raw = result[STORAGE_KEY];
    const isEncrypted = result[ENCRYPTED_MARKER] === true;

    if (!raw) return {};

    // Already a plain object (legacy or fallback)
    if (typeof raw === 'object' && !isEncrypted) {
      return raw as ApiKeyMap;
    }

    // Encrypted string
    if (typeof raw === 'string' && isEncrypted) {
      const enc = await getEncryption();
      if (enc) {
        try {
          return await enc.decrypt<ApiKeyMap>(raw);
        } catch (err) {
          log.error('Failed to decrypt API keys — keys may be corrupted', err);
          return {};
        }
      }
      log.warn('Encrypted keys found but encryption unavailable');
      return {};
    }

    // Legacy plaintext object with encrypted marker mismatch — migrate
    if (typeof raw === 'object') {
      return raw as ApiKeyMap;
    }

    return {};
  } catch (err) {
    log.error('Failed to load API keys', err);
    return {};
  }
}

/**
 * Clear all stored API keys.
 */
export async function clearApiKeys(): Promise<void> {
  await chrome.storage.local.remove([STORAGE_KEY, ENCRYPTED_MARKER]);
}

/**
 * Migrate plaintext keys to encrypted storage (one-time on startup).
 */
export async function migrateKeysIfNeeded(): Promise<void> {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEY, ENCRYPTED_MARKER]);
    const raw = result[STORAGE_KEY];
    const isEncrypted = result[ENCRYPTED_MARKER] === true;

    // Already encrypted or nothing stored
    if (!raw || isEncrypted) return;

    // Plain object — needs encryption
    if (typeof raw === 'object' && DataEncryption.isAvailable()) {
      const keys = raw as ApiKeyMap;
      const hasKeys = Object.values(keys).some((v) => typeof v === 'string' && v.trim());
      if (!hasKeys) return;

      log.info('Migrating plaintext API keys to encrypted storage');
      await saveApiKeys(keys);
    }
  } catch (err) {
    log.warn('Key migration check failed', err);
  }
}
