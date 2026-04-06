import { createLogger } from '../Logger';
import { EncryptionClient } from './EncryptionClient';

const log = createLogger('SyncClient');

export type SyncDataType =
  | 'PREFERENCES'
  | 'INTEREST_GRAPH'
  | 'FILTER_RULES'
  | 'DECISION_HISTORY'
  | 'PLATFORM_SETTINGS';

export interface SyncStatus {
  dataTypes: Array<{
    dataType: SyncDataType;
    version: number;
    lastModified: string;
    checksum: string | null;
  }>;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface SyncPullResponse {
  hasUpdate: boolean;
  version: number;
  encryptedData?: string;
  iv?: string;
  authTag?: string;
  checksum?: string;
}

interface SyncPushResponse {
  ok?: boolean;
  version?: number;
  conflict?: boolean;
  serverVersion?: number;
  serverData?: {
    encryptedData: string;
    iv: string;
    authTag: string;
    checksum: string;
  };
}

const STORAGE_KEYS = {
  accessToken: 'recome_cloud_access_token',
  refreshToken: 'recome_cloud_refresh_token',
  syncVersions: 'recome_cloud_sync_versions',
  cloudUrl: 'recome_cloud_url',
} as const;

// Import from constants — override via chrome.storage.local for local dev
import { CLOUD_URL as DEFAULT_CLOUD_URL } from '../constants';

export class SyncClient {
  private encryption = new EncryptionClient();
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private cloudUrl: string = DEFAULT_CLOUD_URL;

  /** Initialize from stored credentials */
  async init(): Promise<void> {
    try {
      const stored = await chrome.storage.local.get([
        STORAGE_KEYS.accessToken,
        STORAGE_KEYS.refreshToken,
        STORAGE_KEYS.cloudUrl,
      ]);
      this.accessToken = (stored[STORAGE_KEYS.accessToken] as string | undefined) ?? null;
      this.refreshToken = (stored[STORAGE_KEYS.refreshToken] as string | undefined) ?? null;
      this.cloudUrl = (stored[STORAGE_KEYS.cloudUrl] as string | undefined) ?? DEFAULT_CLOUD_URL;
    } catch {
      log.warn('Failed to load sync credentials');
    }
  }

  /** Check if user is authenticated */
  isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  /** Register a new account */
  async register(email: string, password: string, displayName?: string): Promise<boolean> {
    const res = await this.fetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
      skipAuth: true,
    });
    if (!res.ok) return false;

    const data = (await res.json()) as AuthTokens & { user: unknown };
    await this.saveTokens(data.accessToken, data.refreshToken);
    await this.encryption.deriveKey(password);
    return true;
  }

  /** Login */
  async login(email: string, password: string): Promise<boolean> {
    const res = await this.fetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      skipAuth: true,
    });
    if (!res.ok) return false;

    const data = (await res.json()) as AuthTokens & { user: unknown };
    await this.saveTokens(data.accessToken, data.refreshToken);
    await this.encryption.deriveKey(password);
    return true;
  }

  /** Logout */
  async logout(): Promise<void> {
    try {
      await this.fetch('/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    this.accessToken = null;
    this.refreshToken = null;
    this.encryption.clearKey();
    await chrome.storage.local.remove([STORAGE_KEYS.accessToken, STORAGE_KEYS.refreshToken]);
  }

  /** Pull latest data from cloud */
  async pull<T>(
    dataType: SyncDataType,
    clientVersion: number,
  ): Promise<{ data: T; version: number } | null> {
    if (!this.encryption.hasKey()) {
      log.warn('Encryption key not set, cannot pull');
      return null;
    }

    const res = await this.fetch('/sync/pull', {
      method: 'POST',
      body: JSON.stringify({ dataType, clientVersion }),
    });
    if (!res.ok) return null;

    const pullRes = (await res.json()) as SyncPullResponse;
    if (!pullRes.hasUpdate || !pullRes.encryptedData || !pullRes.iv || !pullRes.authTag) {
      return null;
    }

    const decrypted = await this.encryption.decrypt<T>({
      encryptedData: pullRes.encryptedData,
      iv: pullRes.iv,
      authTag: pullRes.authTag,
    });

    await this.saveSyncVersion(dataType, pullRes.version);
    return { data: decrypted, version: pullRes.version };
  }

  /** Push data to cloud */
  async push(
    dataType: SyncDataType,
    data: unknown,
    clientVersion: number,
  ): Promise<{ version: number; conflict: boolean }> {
    if (!this.encryption.hasKey()) {
      throw new Error('Encryption key not set');
    }

    const encrypted = await this.encryption.encrypt(data);
    const checksum = await this.encryption.checksum(data);

    const res = await this.fetch('/sync/push', {
      method: 'POST',
      body: JSON.stringify({
        dataType,
        clientVersion,
        encryptedData: encrypted.encryptedData,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        checksum,
      }),
    });

    if (res.status === 409) {
      const conflict = (await res.json()) as SyncPushResponse;
      return { version: conflict.serverVersion ?? clientVersion, conflict: true };
    }

    if (!res.ok) {
      throw new Error(`Push failed: ${res.status}`);
    }

    const result = (await res.json()) as SyncPushResponse;
    const newVersion = result.version ?? clientVersion + 1;
    await this.saveSyncVersion(dataType, newVersion);
    return { version: newVersion, conflict: false };
  }

  /** Get sync status from cloud */
  async getStatus(): Promise<SyncStatus | null> {
    const res = await this.fetch('/sync/status');
    if (!res.ok) return null;
    return res.json() as Promise<SyncStatus>;
  }

  /** Get locally stored sync versions */
  async getSyncVersions(): Promise<Partial<Record<SyncDataType, number>>> {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.syncVersions);
    return (
      (stored[STORAGE_KEYS.syncVersions] as Partial<Record<SyncDataType, number>> | undefined) ?? {}
    );
  }

  /** Set encryption passphrase (for returning users who are already logged in) */
  async setPassphrase(passphrase: string): Promise<void> {
    await this.encryption.deriveKey(passphrase);
  }

  /** Set cloud URL */
  async setCloudUrl(url: string): Promise<void> {
    this.cloudUrl = url;
    await chrome.storage.local.set({ [STORAGE_KEYS.cloudUrl]: url });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async fetch(
    path: string,
    options: { method?: string; body?: string; skipAuth?: boolean } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (!options.skipAuth && this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    let res = await globalThis.fetch(`${this.cloudUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body,
    });

    // Token refresh on 401
    if (res.status === 401 && !options.skipAuth && this.refreshToken) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${this.accessToken}`;
        res = await globalThis.fetch(`${this.cloudUrl}${path}`, {
          method: options.method ?? 'GET',
          headers,
          body: options.body,
        });
      }
    }

    return res;
  }

  private async tryRefresh(): Promise<boolean> {
    try {
      const res = await globalThis.fetch(`${this.cloudUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });

      if (!res.ok) {
        await this.logout();
        return false;
      }

      const data = (await res.json()) as AuthTokens;
      await this.saveTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    }
  }

  private async saveTokens(access: string, refresh: string): Promise<void> {
    this.accessToken = access;
    this.refreshToken = refresh;
    await chrome.storage.local.set({
      [STORAGE_KEYS.accessToken]: access,
      [STORAGE_KEYS.refreshToken]: refresh,
    });
  }

  private async saveSyncVersion(dataType: SyncDataType, version: number): Promise<void> {
    const versions = await this.getSyncVersions();
    versions[dataType] = version;
    await chrome.storage.local.set({ [STORAGE_KEYS.syncVersions]: versions });
  }
}
