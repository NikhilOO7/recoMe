import { useState, useEffect, useCallback } from 'react';
import { Dashboard } from '../../popup/components/Dashboard';
import { SettingsPanel } from '../../popup/components/SettingsPanel';
import { AgentChat } from '../../popup/components/AgentChat';
import { Onboarding, type SeedPreferences } from '../../popup/components/Onboarding';
import {
  loadPanelState,
  completeOnboarding,
  persistActiveTab,
  type PanelTab,
  type PanelMode,
} from '../../shared/PanelState';

// ── Types ────────────────────────────────────────────────────────────────────

type Theme = 'light' | 'dark';

export interface OverlayChatProps {
  onClose: () => void;
  pageContext: { url: string; platform: string; title: string };
  getCandidates?: () => unknown[];
  theme: Theme;
  onToggleTheme: () => void;
}

// ── Header (shared between onboarding and main views) ───────────────────────

function OverlayHeader({
  theme,
  onToggleTheme,
  onClose,
}: {
  theme: Theme;
  onToggleTheme: () => void;
  onClose: () => void;
}) {
  return (
    <div className="recome-panel-header">
      <img
        className="recome-panel-logo"
        src={chrome.runtime.getURL('icons/recome_logo_48.png')}
        alt="RecoMe"
      />
      <span className="recome-panel-title">RecoMe</span>
      <button
        className="recome-panel-btn recome-theme-toggle"
        onClick={onToggleTheme}
        title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        aria-label="Toggle theme"
      >
        {theme === 'light' ? '\u{1F319}' : '\u{2600}\u{FE0F}'}
      </button>
      <button
        className="recome-panel-btn"
        onClick={onClose}
        title="Minimize"
        aria-label="Minimize overlay"
      >
        &minus;
      </button>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function OverlayChat({ onClose, theme, onToggleTheme }: OverlayChatProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>('dashboard');
  const [panelMode, setPanelMode] = useState<PanelMode>('loading');

  useEffect(() => {
    loadPanelState().then((snapshot) => {
      setPanelMode(snapshot.mode);
      setActiveTab(snapshot.activeTab);
    });
  }, []);

  const handleTabChange = useCallback((tab: PanelTab) => {
    setActiveTab(tab);
    persistActiveTab(tab);
  }, []);

  async function handleOnboardingComplete(
    quickBlocks: string[],
    quickLikes: string[],
    seedPrefs?: SeedPreferences,
  ) {
    for (const topic of quickBlocks) {
      await chrome.runtime
        .sendMessage({ type: 'BLOCK_TOPIC', payload: { topic } })
        .catch(() => undefined);
    }
    for (const topic of quickLikes) {
      await chrome.runtime
        .sendMessage({ type: 'LIKE_TOPIC', payload: { topic } })
        .catch(() => undefined);
    }
    // Save seed preferences for cold-start scoring (now also saved from overlay)
    if (seedPrefs) {
      await chrome.storage.local
        .set({
          recome_seed_prefs: seedPrefs,
          recome_seed_prefs_at: new Date().toISOString(),
        })
        .catch(() => undefined);
      const aggressivenessMap = { casual: 0.3, moderate: 0.5, power: 0.8 };
      await chrome.runtime
        .sendMessage({
          type: 'SAVE_SETTINGS',
          payload: { aggressiveness: aggressivenessMap[seedPrefs.intensity] },
        })
        .catch(() => undefined);
    }
    await completeOnboarding();
    setPanelMode('dashboard_default');
  }

  // Still loading onboarding state
  if (panelMode === 'loading') return null;

  // Show onboarding if not complete
  if (panelMode === 'onboarding_required' || panelMode === 'onboarding_replay') {
    return (
      <>
        <OverlayHeader theme={theme} onToggleTheme={onToggleTheme} onClose={onClose} />
        <div className="recome-overlay-popup-content">
          <Onboarding
            onComplete={handleOnboardingComplete}
            isReplay={panelMode === 'onboarding_replay'}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <OverlayHeader theme={theme} onToggleTheme={onToggleTheme} onClose={onClose} />

      {/* Tab Navigation */}
      <div className="recome-tab-nav">
        <button
          className={`recome-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => handleTabChange('dashboard')}
        >
          Dashboard
        </button>
        <button
          className={`recome-tab-btn ${activeTab === 'agent' ? 'active' : ''}`}
          onClick={() => handleTabChange('agent')}
        >
          Agent
        </button>
        <button
          className={`recome-tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => handleTabChange('settings')}
        >
          Settings
        </button>
      </div>

      {/* Tab Content — renders popup components directly */}
      {activeTab === 'dashboard' && (
        <div className="recome-overlay-popup-content">
          <Dashboard />
        </div>
      )}

      {activeTab === 'agent' && (
        <div className="recome-overlay-popup-agent">
          <AgentChat onNavigateToSettings={() => handleTabChange('settings')} />
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="recome-overlay-popup-content">
          <SettingsPanel />
        </div>
      )}
    </>
  );
}
