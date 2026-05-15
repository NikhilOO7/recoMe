import { SyncManager } from '@shared/sync/SyncManager';
import { LicenseManager } from '@shared/sync/LicenseManager';
import { FeatureGate } from '@shared/sync/FeatureGate';
import { createLogger } from '@shared/Logger';
import { CLOUD_URL } from '@shared/constants';
import { initGraphSync } from './cloudSync/GraphSyncService';

const log = createLogger('CloudServices');

let syncManager: SyncManager | null = null;
let licenseManager: LicenseManager | null = null;
let featureGate: FeatureGate | null = null;
let initPromise: Promise<void> | null = null;

/** Initialize cloud services (call once during extension startup) */
export async function initCloudServices(): Promise<void> {
  if (syncManager && licenseManager && featureGate) return;
  try {
    licenseManager = new LicenseManager();
    await licenseManager.init();

    syncManager = new SyncManager();
    await syncManager.init();

    featureGate = new FeatureGate(() => licenseManager!.getTier());

    // GraphSync is independent of the legacy SyncManager — it gates on its
    // own opt-in setting and only ships signals to /intelligence/signals.
    // Safe to init unconditionally; it is a no-op until the user opts in.
    initGraphSync();

    // If user was previously authenticated, start auto-sync and license validation
    if (syncManager.isAvailable()) {
      syncManager.startAutoSync();
      licenseManager.startValidation(CLOUD_URL);
      log.info('Cloud services resumed — user is authenticated');
    } else {
      log.info('Cloud services initialized — user not authenticated');
    }
  } catch (err) {
    log.error('Failed to initialize cloud services', err);
  }
}

/** Ensure cloud services are initialized (lazy init for service worker wake) */
async function ensureInit(): Promise<void> {
  if (syncManager && licenseManager && featureGate) return;
  if (!initPromise) initPromise = initCloudServices();
  await initPromise;
}

export async function getSyncManager(): Promise<SyncManager> {
  await ensureInit();
  if (!syncManager) throw new Error('Cloud services failed to initialize');
  return syncManager;
}

export async function getLicenseManager(): Promise<LicenseManager> {
  await ensureInit();
  if (!licenseManager) throw new Error('Cloud services failed to initialize');
  return licenseManager;
}

export async function getFeatureGate(): Promise<FeatureGate> {
  await ensureInit();
  if (!featureGate) throw new Error('Cloud services failed to initialize');
  return featureGate;
}
