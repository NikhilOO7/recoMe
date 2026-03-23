import { createLogger } from '../Logger';
import { SyncClient, type SyncDataType } from './SyncClient';

const log = createLogger('SyncManager');

/** Interval between automatic sync attempts (5 minutes) */
const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;

/** Debounce delay for push after local changes (10 seconds) */
const PUSH_DEBOUNCE_MS = 10_000;

export interface SyncableStore {
  dataType: SyncDataType;
  /** Get current local data for pushing */
  getData(): Promise<unknown>;
  /** Apply pulled data from cloud */
  applyData(data: unknown): Promise<void>;
  /** Get local version counter */
  getVersion(): Promise<number>;
  /** Set local version counter */
  setVersion(version: number): Promise<void>;
}

/**
 * SyncManager — coordinates automatic background sync between extension and cloud.
 *
 * - Registers syncable data stores
 * - Runs pull/push on interval
 * - Debounces pushes after local changes
 * - Handles conflicts (last-write-wins with logging)
 */
export class SyncManager {
  private readonly client = new SyncClient();
  private readonly stores = new Map<SyncDataType, SyncableStore>();
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private pushTimers = new Map<SyncDataType, ReturnType<typeof setTimeout>>();
  private syncing = false;

  /** Initialize the sync manager */
  async init(): Promise<void> {
    await this.client.init();
  }

  /** Register a data store for syncing */
  registerStore(store: SyncableStore): void {
    this.stores.set(store.dataType, store);
  }

  /** Start automatic background sync */
  startAutoSync(): void {
    if (this.syncInterval) return;

    // Initial sync
    void this.syncAll();

    this.syncInterval = setInterval(() => {
      void this.syncAll();
    }, AUTO_SYNC_INTERVAL_MS);

    log.info('Auto-sync started');
  }

  /** Stop automatic sync */
  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    for (const timer of this.pushTimers.values()) clearTimeout(timer);
    this.pushTimers.clear();
    log.info('Auto-sync stopped');
  }

  /** Notify that local data changed — schedules a debounced push */
  notifyChange(dataType: SyncDataType): void {
    if (!this.client.isAuthenticated()) return;

    const existing = this.pushTimers.get(dataType);
    if (existing) clearTimeout(existing);

    this.pushTimers.set(
      dataType,
      setTimeout(() => {
        this.pushTimers.delete(dataType);
        void this.pushOne(dataType);
      }, PUSH_DEBOUNCE_MS),
    );
  }

  /** Full sync cycle — pull all then push dirty */
  async syncAll(): Promise<void> {
    if (!this.client.isAuthenticated() || this.syncing) return;
    this.syncing = true;

    try {
      for (const [dataType, store] of this.stores) {
        await this.pullOne(dataType, store);
      }
      log.debug('Sync cycle complete');
    } catch (err) {
      log.error('Sync cycle failed', err);
    } finally {
      this.syncing = false;
    }
  }

  /** Get sync client for direct operations (login, register, etc.) */
  getClient(): SyncClient {
    return this.client;
  }

  /** Check if sync is available */
  isAvailable(): boolean {
    return this.client.isAuthenticated();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async pullOne(dataType: SyncDataType, store: SyncableStore): Promise<void> {
    try {
      const localVersion = await store.getVersion();
      const result = await this.client.pull(dataType, localVersion);

      if (result) {
        await store.applyData(result.data);
        await store.setVersion(result.version);
        log.debug(`Pulled ${dataType} v${result.version}`);
      }
    } catch (err) {
      log.warn(`Pull failed for ${dataType}`, err);
    }
  }

  private async pushOne(dataType: SyncDataType): Promise<void> {
    const store = this.stores.get(dataType);
    if (!store || !this.client.isAuthenticated()) return;

    try {
      const data = await store.getData();
      const version = await store.getVersion();
      const result = await this.client.push(dataType, data, version);

      if (result.conflict) {
        // Last-write-wins: pull server version, then re-push
        log.warn(`Conflict on ${dataType}, pulling server version`);
        await this.pullOne(dataType, store);
      } else {
        await store.setVersion(result.version);
        log.debug(`Pushed ${dataType} v${result.version}`);
      }
    } catch (err) {
      log.warn(`Push failed for ${dataType}`, err);
    }
  }
}
