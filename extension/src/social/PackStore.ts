import { createLogger } from '@shared/Logger';
import type { PreferencePack, PackSearchParams, PackSearchResult, PackShareLink } from './types';

const log = createLogger('PackStore');

const LOCAL_PACKS_KEY = 'recome_local_packs';
const INSTALLED_PACKS_KEY = 'recome_installed_packs';

/**
 * PackStore — manages local packs and communicates with cloud for community packs.
 */
export class PackStore {
  private cloudUrl: string | null = null;

  /** Set cloud URL for community pack features */
  setCloudUrl(url: string): void {
    this.cloudUrl = url;
  }

  // ── Local Packs (created by user) ──────────────────────────────────────────

  /** Save a pack locally */
  async saveLocal(pack: PreferencePack): Promise<void> {
    const packs = await this.getLocalPacks();
    const idx = packs.findIndex((p) => p.id === pack.id);
    if (idx >= 0) {
      packs[idx] = pack;
    } else {
      packs.push(pack);
    }
    await chrome.storage.local.set({ [LOCAL_PACKS_KEY]: packs });
  }

  /** Get all local packs */
  async getLocalPacks(): Promise<PreferencePack[]> {
    try {
      const stored = await chrome.storage.local.get(LOCAL_PACKS_KEY);
      return (stored[LOCAL_PACKS_KEY] as PreferencePack[] | undefined) ?? [];
    } catch {
      return [];
    }
  }

  /** Delete a local pack */
  async deleteLocal(packId: string): Promise<void> {
    const packs = await this.getLocalPacks();
    const filtered = packs.filter((p) => p.id !== packId);
    await chrome.storage.local.set({ [LOCAL_PACKS_KEY]: filtered });
  }

  // ── Installed Packs (downloaded from community) ────────────────────────────

  /** Record that a pack was installed */
  async markInstalled(packId: string): Promise<void> {
    const installed = await this.getInstalledPackIds();
    if (!installed.includes(packId)) {
      installed.push(packId);
      await chrome.storage.local.set({ [INSTALLED_PACKS_KEY]: installed });
    }
  }

  /** Check if a pack is installed */
  async isInstalled(packId: string): Promise<boolean> {
    const installed = await this.getInstalledPackIds();
    return installed.includes(packId);
  }

  /** Get all installed pack IDs */
  async getInstalledPackIds(): Promise<string[]> {
    try {
      const stored = await chrome.storage.local.get(INSTALLED_PACKS_KEY);
      return (stored[INSTALLED_PACKS_KEY] as string[] | undefined) ?? [];
    } catch {
      return [];
    }
  }

  // ── Community Packs (cloud) ────────────────────────────────────────────────

  /** Search community packs */
  async search(params: PackSearchParams): Promise<PackSearchResult> {
    if (!this.cloudUrl) {
      return { packs: [], total: 0, page: 0, hasMore: false };
    }

    try {
      const query = new URLSearchParams();
      if (params.query) query.set('q', params.query);
      if (params.category) query.set('category', params.category);
      if (params.sortBy) query.set('sort', params.sortBy);
      if (params.page) query.set('page', String(params.page));
      if (params.limit) query.set('limit', String(params.limit));

      const res = await this.cloudFetch(`/packs/search?${query.toString()}`);
      if (!res.ok) return { packs: [], total: 0, page: 0, hasMore: false };
      return res.json() as Promise<PackSearchResult>;
    } catch (err) {
      log.warn('Pack search failed', err);
      return { packs: [], total: 0, page: 0, hasMore: false };
    }
  }

  /** Get a single pack from cloud */
  async getCloudPack(packId: string): Promise<PreferencePack | null> {
    if (!this.cloudUrl) return null;

    try {
      const res = await this.cloudFetch(`/packs/${packId}`);
      if (!res.ok) return null;
      return res.json() as Promise<PreferencePack>;
    } catch {
      return null;
    }
  }

  /** Publish a local pack to the community */
  async publish(pack: PreferencePack): Promise<boolean> {
    if (!this.cloudUrl) {
      log.warn('Cloud URL not set, cannot publish');
      return false;
    }

    try {
      const accessToken = (await chrome.storage.local.get('recome_cloud_access_token'))[
        'recome_cloud_access_token'
      ];
      const res = await fetch(`${this.cloudUrl}/packs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(pack),
      });

      if (!res.ok) {
        log.warn(`Publish failed: ${res.status}`);
        return false;
      }

      log.info(`Pack published: "${pack.name}"`);
      return true;
    } catch (err) {
      log.warn('Publish failed', err);
      return false;
    }
  }

  /** Generate a share link for a pack */
  async createShareLink(packId: string): Promise<PackShareLink | null> {
    if (!this.cloudUrl) return null;

    try {
      const res = await this.cloudFetch(`/packs/${packId}/share`, { method: 'POST' });
      if (!res.ok) return null;
      return res.json() as Promise<PackShareLink>;
    } catch {
      return null;
    }
  }

  /** Rate a pack */
  async ratePack(packId: string, rating: number): Promise<boolean> {
    if (!this.cloudUrl || rating < 1 || rating > 5) return false;

    try {
      const res = await this.cloudFetch(`/packs/${packId}/rate`, {
        method: 'POST',
        body: JSON.stringify({ rating }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Get featured/trending packs */
  async getFeatured(): Promise<PreferencePack[]> {
    const result = await this.search({ sortBy: 'downloads', limit: 10 });
    return result.packs;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async cloudFetch(path: string, options?: RequestInit): Promise<Response> {
    const accessToken = (await chrome.storage.local.get('recome_cloud_access_token'))[
      'recome_cloud_access_token'
    ] as string | undefined;
    return fetch(`${this.cloudUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...options?.headers,
      },
    });
  }
}
