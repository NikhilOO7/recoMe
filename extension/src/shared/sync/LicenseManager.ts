import { createLogger } from '../Logger';

const log = createLogger('LicenseManager');

export type Tier = 'FREE' | 'PRO' | 'PREMIUM';

const STORAGE_KEY = 'recome_license';
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export interface LicenseState {
  tier: Tier;
  email: string | null;
  validUntil: number | null;
  lastChecked: number;
}

const DEFAULT_LICENSE: LicenseState = {
  tier: 'FREE',
  email: null,
  validUntil: null,
  lastChecked: 0,
};

export class LicenseManager {
  private state: LicenseState = { ...DEFAULT_LICENSE };
  private checkTimer: ReturnType<typeof setInterval> | null = null;

  /** Load license from storage */
  async init(): Promise<void> {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      if (stored[STORAGE_KEY]) {
        this.state = stored[STORAGE_KEY] as LicenseState;
      }
    } catch {
      log.warn('Failed to load license state');
    }
  }

  /** Start periodic license validation */
  startValidation(cloudUrl: string): void {
    if (this.checkTimer) return;
    this.checkTimer = setInterval(() => {
      void this.validate(cloudUrl);
    }, CHECK_INTERVAL_MS);
  }

  /** Stop periodic validation */
  stopValidation(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /** Get current tier */
  getTier(): Tier {
    return this.state.tier;
  }

  /** Get full license state */
  getState(): LicenseState {
    return { ...this.state };
  }

  /** Update license after login/subscription change */
  async setTier(tier: Tier, email?: string): Promise<void> {
    this.state.tier = tier;
    if (email) this.state.email = email;
    this.state.lastChecked = Date.now();
    await this.persist();
    log.info(`License updated: ${tier}`);
  }

  /** Clear license (on logout) */
  async clear(): Promise<void> {
    this.state = { ...DEFAULT_LICENSE };
    await this.persist();
  }

  /** Validate license against cloud */
  private async validate(cloudUrl: string): Promise<void> {
    try {
      const accessToken = (await chrome.storage.local.get('recome_cloud_access_token'))[
        'recome_cloud_access_token'
      ];
      if (!accessToken) return;

      const res = await fetch(`${cloudUrl}/billing/status`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) return;

      const data = (await res.json()) as { tier: Tier };
      if (data.tier !== this.state.tier) {
        await this.setTier(data.tier);
      }
      this.state.lastChecked = Date.now();
      await this.persist();
    } catch {
      // Offline or server down — keep current state
    }
  }

  private async persist(): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY]: this.state });
  }
}
