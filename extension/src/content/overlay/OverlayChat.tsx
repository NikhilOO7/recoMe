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
import { WEB_APP_URL } from '../../shared/constants';

// ── Types ────────────────────────────────────────────────────────────────────

type Theme = 'light' | 'dark';

export interface OverlayChatProps {
  onClose: () => void;
  pageContext: { url: string; platform: string; title: string };
  getCandidates?: () => unknown[];
  theme: Theme;
  onToggleTheme: () => void;
}

// ── Header ────────────────────────────────────────────────────────────────────

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

  // Still loading
  if (panelMode === 'loading') return null;

  // First-time: classy welcome screen with web app redirect
  if (panelMode === 'onboarding_required') {
    return (
      <>
        <OverlayHeader theme={theme} onToggleTheme={onToggleTheme} onClose={onClose} />
        <div className="recome-overlay-popup-content recome-welcome-screen">
          <div className="recome-welcome-icon">
            <img
              src={chrome.runtime.getURL('icons/recome_logo_128.png')}
              alt="RecoMe"
              style={{ width: 56, height: 56, borderRadius: 14 }}
            />
          </div>
          <h2 className="recome-welcome-title">Your research, connected</h2>
          <p className="recome-welcome-desc">
            RecoMe remembers what you research across YouTube, Reddit, and Amazon — then shows you
            why a product matches what you care about.
          </p>
          <div className="recome-welcome-features">
            <div className="recome-welcome-feature">
              <span className="recome-welcome-feature-icon">🔍</span>
              <span>Cross-platform research memory</span>
            </div>
            <div className="recome-welcome-feature">
              <span className="recome-welcome-feature-icon">🔒</span>
              <span>100% private — all data on your device</span>
            </div>
            <div className="recome-welcome-feature">
              <span className="recome-welcome-feature-icon">🧠</span>
              <span>Gets smarter as you browse</span>
            </div>
          </div>
          <button
            className="recome-welcome-btn-primary"
            onClick={() => {
              const extId = chrome.runtime.id;
              window.open(`${WEB_APP_URL}/signup?return=extension&ext_id=${extId}`, '_blank');
            }}
          >
            Create Free Account
          </button>
          <button
            className="recome-welcome-btn-secondary"
            onClick={async () => {
              await handleOnboardingComplete([], []);
            }}
          >
            Skip — browse with defaults
          </button>
          <button
            className="recome-welcome-btn-link"
            onClick={() => {
              const extId = chrome.runtime.id;
              window.open(`${WEB_APP_URL}/login?return=extension&ext_id=${extId}`, '_blank');
            }}
          >
            Already have an account? Sign in
          </button>
        </div>
      </>
    );
  }

  // Replay from Settings
  if (panelMode === 'onboarding_replay') {
    return (
      <>
        <OverlayHeader theme={theme} onToggleTheme={onToggleTheme} onClose={onClose} />
        <div className="recome-overlay-popup-content">
          <Onboarding onComplete={handleOnboardingComplete} isReplay={true} />
        </div>
      </>
    );
  }

  // ── Main overlay UI ─────────────────────────────────────────────────────

  return (
    <>
      <OverlayHeader theme={theme} onToggleTheme={onToggleTheme} onClose={onClose} />

      {/* Tab Navigation */}
      <div className="recome-tab-nav">
        {(['dashboard', 'agent', 'settings'] as PanelTab[]).map((tab) => (
          <button
            key={tab}
            className={`recome-tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => handleTabChange(tab)}
          >
            {tab === 'dashboard' ? 'Research' : tab === 'agent' ? 'Agent' : 'Settings'}
          </button>
        ))}
      </div>

      {/* Tab Content */}
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

      {/* Web app link bar */}
      <div className="recome-overlay-webapp-bar">
        <button
          className="recome-overlay-webapp-link"
          onClick={() => window.open(WEB_APP_URL, '_blank')}
        >
          Open full dashboard ↗
        </button>
      </div>
    </>
  );
}
