/**
 * DataEncryption — encrypt/decrypt user data at rest using Web Crypto API.
 *
 * Uses AES-GCM with a key derived from a user-provided passphrase (PBKDF2).
 * The encryption key never leaves the device — it's derived on-demand and
 * stored in the CryptoKey API (non-extractable by default).
 *
 * Usage:
 *   const enc = new DataEncryption();
 *   await enc.init('user-passphrase');
 *   const encrypted = await enc.encrypt({ foo: 'bar' });
 *   const decrypted = await enc.decrypt(encrypted);
 *
 * Storage format: base64(salt + iv + ciphertext)
 */

import { createLogger } from './Logger';

const log = createLogger('Encryption');

const ALGO = 'AES-GCM';
const KEY_LENGTH = 256;
const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

export class DataEncryption {
  private key: CryptoKey | null = null;
  private salt: Uint8Array | null = null;

  /** Whether encryption is available (Web Crypto must exist) */
  static isAvailable(): boolean {
    return typeof crypto !== 'undefined' && !!crypto.subtle;
  }

  /**
   * Initialize with a passphrase. Derives an AES-GCM key via PBKDF2.
   * If an existing salt is provided (from storage), it's reused for consistency.
   */
  async init(passphrase: string, existingSalt?: Uint8Array): Promise<void> {
    if (!DataEncryption.isAvailable()) {
      log.warn('Web Crypto API not available — encryption disabled');
      return;
    }

    this.salt = existingSalt ?? crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey'],
    );

    this.key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: this.salt.buffer as ArrayBuffer,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: ALGO, length: KEY_LENGTH },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  /** Returns the salt for storage (needed to re-derive the same key later) */
  getSalt(): Uint8Array | null {
    return this.salt;
  }

  /** Encrypt arbitrary JSON-serializable data. Returns base64 string. */
  async encrypt(data: unknown): Promise<string> {
    if (!this.key) throw new Error('Encryption not initialized');

    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoded = new TextEncoder().encode(JSON.stringify(data));

    const ciphertext = await crypto.subtle.encrypt({ name: ALGO, iv }, this.key, encoded);

    // Concatenate: salt (16) + iv (12) + ciphertext
    const combined = new Uint8Array(this.salt!.length + iv.length + ciphertext.byteLength);
    combined.set(this.salt!, 0);
    combined.set(iv, this.salt!.length);
    combined.set(new Uint8Array(ciphertext), this.salt!.length + iv.length);

    return btoa(String.fromCharCode(...combined));
  }

  /** Decrypt a base64-encoded encrypted string back to the original data. */
  async decrypt<T = unknown>(encoded: string): Promise<T> {
    if (!this.key) throw new Error('Encryption not initialized');

    const raw = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));

    // Extract parts: salt (16) + iv (12) + ciphertext (rest)
    const iv = raw.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const ciphertext = raw.slice(SALT_LENGTH + IV_LENGTH);

    const decrypted = await crypto.subtle.decrypt({ name: ALGO, iv }, this.key, ciphertext);

    const text = new TextDecoder().decode(decrypted);
    return JSON.parse(text) as T;
  }

  /** Check if a string looks like encrypted data (base64 with correct length prefix) */
  static isEncrypted(value: string): boolean {
    try {
      const raw = atob(value);
      // Must be at least salt + iv + 1 byte of ciphertext
      return raw.length > SALT_LENGTH + IV_LENGTH;
    } catch {
      return false;
    }
  }

  /** Destroy the key material */
  destroy(): void {
    this.key = null;
    this.salt = null;
  }
}

// ── Convenience: per-extension encryption keyed to extension ID ─────────────

let sharedInstance: DataEncryption | null = null;

/**
 * Get or create a shared DataEncryption instance.
 * Uses the extension ID as the passphrase base (deterministic per installation).
 * For stronger security, call with a user-provided passphrase.
 */
export async function getEncryption(passphrase?: string): Promise<DataEncryption | null> {
  if (!DataEncryption.isAvailable()) return null;
  if (sharedInstance) return sharedInstance;

  const enc = new DataEncryption();
  const phrase = passphrase ?? chrome.runtime.id ?? 'recome-default-key';

  // Try to load existing salt from storage for key consistency
  try {
    const stored = await chrome.storage.local.get('recome_encryption_salt');
    const saltB64 = stored.recome_encryption_salt as string | undefined;
    const existingSalt = saltB64
      ? Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0))
      : undefined;

    await enc.init(phrase, existingSalt);

    // Store salt if it's new
    if (!saltB64 && enc.getSalt()) {
      const newSaltB64 = btoa(String.fromCharCode(...enc.getSalt()!));
      await chrome.storage.local.set({ recome_encryption_salt: newSaltB64 });
    }
  } catch (err) {
    log.error('Failed to initialize encryption', err);
    return null;
  }

  sharedInstance = enc;
  return enc;
}
