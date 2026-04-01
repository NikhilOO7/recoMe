/**
 * PanelState — Unified panel-state controller shared by popup and overlay.
 *
 * Single source of truth for:
 *   - Onboarding completion status
 *   - Active tab persistence
 *   - QA override flag
 *
 * Fixes:
 *   - Fail-open error handling (storage read failure no longer bypasses onboarding)
 *   - Two different onboarding paths (overlay now also saves seed prefs)
 *   - Tab state not persisted across popup reopens
 */
import { safeStorageSyncGet, safeStorageSyncSet } from './storageSync';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PanelTab = 'dashboard' | 'agent' | 'settings';

export type PanelMode =
  | 'loading' // Async storage read in progress
  | 'onboarding_required' // First run, never completed
  | 'onboarding_replay' // User chose to re-run from Settings
  | 'dashboard_default'; // Normal tabbed UI

export interface PanelSnapshot {
  mode: PanelMode;
  activeTab: PanelTab;
  onboardingVersion: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEYS = {
  onboardingDone: 'recome_onboarding_done',
  onboardingVersion: 'recome_onboarding_version',
  activeTab: 'recome_active_tab',
  qaBypassOnboarding: 'recome_qa_bypass_onboarding',
} as const;

/** Current onboarding version — bump to force re-onboarding on major changes */
export const CURRENT_ONBOARDING_VERSION = 1;

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Load panel state from storage. Returns a deterministic PanelSnapshot.
 *
 * IMPORTANT: On storage failure, defaults to onboarding_required (fail-closed)
 * rather than bypassing onboarding (the old fail-open behavior).
 */
export async function loadPanelState(): Promise<PanelSnapshot> {
  try {
    const [syncResult, localResult] = await Promise.all([
      safeStorageSyncGet([STORAGE_KEYS.onboardingDone, STORAGE_KEYS.onboardingVersion]),
      chrome.storage.local.get([STORAGE_KEYS.activeTab, STORAGE_KEYS.qaBypassOnboarding]),
    ]);

    const done = !!syncResult[STORAGE_KEYS.onboardingDone];
    const version = (syncResult[STORAGE_KEYS.onboardingVersion] as number) || 0;
    const qaBypass = !!localResult[STORAGE_KEYS.qaBypassOnboarding];
    const savedTab = localResult[STORAGE_KEYS.activeTab] as PanelTab | undefined;

    // QA override: skip onboarding for automated testing
    if (qaBypass) {
      return {
        mode: 'dashboard_default',
        activeTab: savedTab || 'dashboard',
        onboardingVersion: version,
      };
    }

    // Onboarding not completed or version mismatch → require onboarding
    if (!done || version < CURRENT_ONBOARDING_VERSION) {
      return {
        mode: 'onboarding_required',
        activeTab: 'dashboard',
        onboardingVersion: version,
      };
    }

    // Normal operation
    return {
      mode: 'dashboard_default',
      activeTab: savedTab || 'dashboard',
      onboardingVersion: version,
    };
  } catch {
    // Fail-CLOSED: if storage is broken, require onboarding rather than bypass
    return {
      mode: 'onboarding_required',
      activeTab: 'dashboard',
      onboardingVersion: 0,
    };
  }
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Mark onboarding as complete. Called from BOTH popup and overlay paths.
 */
export async function completeOnboarding(): Promise<void> {
  await safeStorageSyncSet({
    [STORAGE_KEYS.onboardingDone]: true,
    [STORAGE_KEYS.onboardingVersion]: CURRENT_ONBOARDING_VERSION,
  });
}

/**
 * Persist the active tab so it survives popup close/reopen.
 */
export async function persistActiveTab(tab: PanelTab): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.activeTab]: tab }).catch(() => undefined);
}

/**
 * Request onboarding replay (from Settings). Does NOT clear onboarding_done —
 * replay is a local UI state that reverts when the component unmounts.
 */
export function requestReplay(): PanelMode {
  return 'onboarding_replay';
}
