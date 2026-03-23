import * as SecureStore from 'expo-secure-store';

const STORAGE_KEYS = {
  accessToken: 'recome_access_token',
  refreshToken: 'recome_refresh_token',
  cloudUrl: 'recome_cloud_url',
  email: 'recome_email',
} as const;

const DEFAULT_CLOUD_URL = 'https://api.recome.app';

interface Profile {
  id: string;
  email: string;
  tier: string;
  createdAt: string;
}

interface Preference {
  topic: string;
  strength: number;
  sentiment: 'positive' | 'negative';
}

interface TrackedProduct {
  id: string;
  title: string;
  url: string;
  platform: string;
  currentPrice: number;
  lowestPrice: number;
  currency: string;
}

interface Insight {
  id: string;
  type: string;
  title: string;
  body: string;
  platform: string;
  actionUrl?: string;
  actionLabel?: string;
  createdAt: number;
}

interface DashboardStats {
  preferenceCount: number;
  trackedCount: number;
  insightCount: number;
  lastSync: number | null;
}

export class SyncService {
  private static instance: SyncService;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private cloudUrl: string = DEFAULT_CLOUD_URL;

  private constructor() {}

  static getInstance(): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService();
    }
    return SyncService.instance;
  }

  async init(): Promise<void> {
    this.accessToken = await SecureStore.getItemAsync(STORAGE_KEYS.accessToken);
    this.refreshToken = await SecureStore.getItemAsync(STORAGE_KEYS.refreshToken);
    const url = await SecureStore.getItemAsync(STORAGE_KEYS.cloudUrl);
    if (url) this.cloudUrl = url;
  }

  async isAuthenticated(): Promise<boolean> {
    if (!this.accessToken) await this.init();
    return this.accessToken !== null;
  }

  async login(email: string, password: string): Promise<boolean> {
    try {
      const res = await this.request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        skipAuth: true,
      });
      if (!res.ok) return false;
      const data = await res.json();
      this.accessToken = data.accessToken;
      this.refreshToken = data.refreshToken;
      await SecureStore.setItemAsync(STORAGE_KEYS.accessToken, data.accessToken);
      await SecureStore.setItemAsync(STORAGE_KEYS.refreshToken, data.refreshToken);
      await SecureStore.setItemAsync(STORAGE_KEYS.email, email);
      return true;
    } catch {
      return false;
    }
  }

  async logout(): Promise<void> {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    this.accessToken = null;
    this.refreshToken = null;
    await SecureStore.deleteItemAsync(STORAGE_KEYS.accessToken);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.refreshToken);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.email);
  }

  async fetchProfile(): Promise<Profile | null> {
    try {
      const res = await this.request('/user/profile');
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async fetchPreferences(): Promise<Preference[]> {
    try {
      const res = await this.request('/sync/pull', {
        method: 'POST',
        body: JSON.stringify({ dataTypes: ['PREFERENCES'], versions: {} }),
      });
      if (!res.ok) return [];
      const data = await res.json();
      const prefData = data.data?.PREFERENCES;
      if (!prefData?.data) return [];
      return prefData.data as Preference[];
    } catch {
      return [];
    }
  }

  async fetchWatchlist(): Promise<TrackedProduct[]> {
    try {
      const res = await this.request('/sync/pull', {
        method: 'POST',
        body: JSON.stringify({ dataTypes: ['PLATFORM_SETTINGS'], versions: {} }),
      });
      if (!res.ok) return [];
      const data = await res.json();
      const settings = data.data?.PLATFORM_SETTINGS;
      if (!settings?.data?.trackedProducts) return [];
      return settings.data.trackedProducts as TrackedProduct[];
    } catch {
      return [];
    }
  }

  async fetchInsights(): Promise<Insight[]> {
    try {
      const res = await this.request('/user/insights');
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }

  async fetchDashboardStats(): Promise<DashboardStats> {
    try {
      const res = await this.request('/user/stats');
      if (!res.ok) throw new Error('Failed');
      return await res.json();
    } catch {
      return { preferenceCount: 0, trackedCount: 0, insightCount: 0, lastSync: null };
    }
  }

  private async request(
    path: string,
    options: RequestInit & { skipAuth?: boolean } = {},
  ): Promise<Response> {
    const { skipAuth, ...fetchOptions } = options;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((fetchOptions.headers as Record<string, string>) ?? {}),
    };

    if (!skipAuth && this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    let res = await fetch(`${this.cloudUrl}${path}`, { ...fetchOptions, headers });

    if (res.status === 401 && !skipAuth && this.refreshToken) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${this.accessToken}`;
        res = await fetch(`${this.cloudUrl}${path}`, { ...fetchOptions, headers });
      }
    }

    return res;
  }

  private async tryRefreshToken(): Promise<boolean> {
    try {
      const res = await fetch(`${this.cloudUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      this.accessToken = data.accessToken;
      this.refreshToken = data.refreshToken;
      await SecureStore.setItemAsync(STORAGE_KEYS.accessToken, data.accessToken);
      await SecureStore.setItemAsync(STORAGE_KEYS.refreshToken, data.refreshToken);
      return true;
    } catch {
      return false;
    }
  }
}
