/**
 * EncryptionClient — E2E encryption for sync data.
 *
 * Uses AES-256-GCM via WebCrypto API (available in extension contexts).
 * The encryption key is derived from a user passphrase using PBKDF2
 * and never leaves the client.
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const PBKDF2_ITERATIONS = 600_000;

export interface EncryptedPayload {
  encryptedData: string; // base64
  iv: string; // base64
  authTag: string; // base64 (included in ciphertext for WebCrypto)
}

export class EncryptionClient {
  private cachedKey: CryptoKey | null = null;
  private cachedPassphraseHash: string | null = null;

  /** Derive and cache an encryption key from a passphrase */
  async deriveKey(passphrase: string): Promise<void> {
    const hash = await this.hashPassphrase(passphrase);
    if (this.cachedPassphraseHash === hash && this.cachedKey) return;

    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey'],
    );

    // Use a fixed salt derived from the passphrase hash (so same passphrase = same key)
    const salt = encoder.encode(hash.slice(0, SALT_LENGTH));

    this.cachedKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      keyMaterial,
      { name: ALGORITHM, length: KEY_LENGTH },
      false,
      ['encrypt', 'decrypt'],
    );
    this.cachedPassphraseHash = hash;
  }

  /** Encrypt data (JSON-serializable) */
  async encrypt(data: unknown): Promise<EncryptedPayload> {
    if (!this.cachedKey) throw new Error('Encryption key not derived. Call deriveKey() first.');

    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoded = new TextEncoder().encode(JSON.stringify(data));

    const ciphertext = await crypto.subtle.encrypt(
      { name: ALGORITHM, iv },
      this.cachedKey,
      encoded,
    );

    // WebCrypto AES-GCM appends the 16-byte auth tag to the ciphertext
    const ctBytes = new Uint8Array(ciphertext);
    const encryptedBytes = ctBytes.slice(0, ctBytes.length - 16);
    const authTag = ctBytes.slice(ctBytes.length - 16);

    return {
      encryptedData: this.toBase64(encryptedBytes),
      iv: this.toBase64(iv),
      authTag: this.toBase64(authTag),
    };
  }

  /** Decrypt data */
  async decrypt<T = unknown>(payload: EncryptedPayload): Promise<T> {
    if (!this.cachedKey) throw new Error('Encryption key not derived. Call deriveKey() first.');

    const iv = this.fromBase64(payload.iv);
    const encryptedBytes = this.fromBase64(payload.encryptedData);
    const authTag = this.fromBase64(payload.authTag);

    // Reconstruct the ciphertext with auth tag appended (WebCrypto expects this)
    const combined = new Uint8Array(encryptedBytes.length + authTag.length);
    combined.set(encryptedBytes);
    combined.set(authTag, encryptedBytes.length);

    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv: iv.buffer as ArrayBuffer },
      this.cachedKey,
      combined.buffer as ArrayBuffer,
    );

    const text = new TextDecoder().decode(decrypted);
    return JSON.parse(text) as T;
  }

  /** Check if a key has been derived */
  hasKey(): boolean {
    return this.cachedKey !== null;
  }

  /** Clear cached key */
  clearKey(): void {
    this.cachedKey = null;
    this.cachedPassphraseHash = null;
  }

  /** Compute a checksum of data for sync conflict detection */
  async checksum(data: unknown): Promise<string> {
    const encoded = new TextEncoder().encode(JSON.stringify(data));
    const hash = await crypto.subtle.digest('SHA-256', encoded);
    return this.toBase64(new Uint8Array(hash)).slice(0, 16);
  }

  private async hashPassphrase(passphrase: string): Promise<string> {
    const encoded = new TextEncoder().encode(passphrase);
    const hash = await crypto.subtle.digest('SHA-256', encoded);
    return this.toBase64(new Uint8Array(hash));
  }

  private toBase64(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  private fromBase64(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
}
