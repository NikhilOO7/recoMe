import { SyncManager } from '@shared/sync/SyncManager';
import { LicenseManager } from '@shared/sync/LicenseManager';
import { FeatureGate } from '@shared/sync/FeatureGate';
import { createLogger } from '@shared/Logger';

const log = createLogger('CloudServices');

let syncManager: SyncManager | null = null;
let licenseManager: LicenseManager | null = null;
let featureGate: FeatureGate | null = null;

/** Initialize cloud services (call once during extension startup) */
export async function initCloudServices(): Promise<void> {
  try {
    licenseManager = new LicenseManager();
    await licenseManager.init();

    syncManager = new SyncManager();
    await syncManager.init();

    featureGate = new FeatureGate(() => licenseManager!.getTier());

    // If user was previously authenticated, start auto-sync and license validation
    if (syncManager.isAvailable()) {
      syncManager.startAutoSync();
      licenseManager.startValidation('http://localhost:3001');
      log.info('Cloud services resumed — user is authenticated');
    } else {
      log.info('Cloud services initialized — user not authenticated');
    }
  } catch (err) {
    log.error('Failed to initialize cloud services', err);
  }
}

export function getSyncManager(): SyncManager {
  if (!syncManager) throw new Error('Cloud services not initialized');
  return syncManager;
}

export function getLicenseManager(): LicenseManager {
  if (!licenseManager) throw new Error('Cloud services not initialized');
  return licenseManager;
}

export function getFeatureGate(): FeatureGate {
  if (!featureGate) throw new Error('Cloud services not initialized');
  return featureGate;
}
