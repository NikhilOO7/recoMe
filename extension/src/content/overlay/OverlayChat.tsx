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

  // First-time onboarding: redirect to web app for account creation
  // Replay onboarding (from Settings): show in-extension flow
  if (panelMode === 'onboarding_required') {
    return (
      <>
        <OverlayHeader theme={theme} onToggleTheme={onToggleTheme} onClose={onClose} />
        <div
          className="recome-overlay-popup-content"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            gap: 12,
            padding: '40px 24px',
          }}
        >
          <div style={{ fontSize: 48 }}>🧩</div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Welcome to RecoMe</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: 280 }}>
            Your research, connected. Set up your account to get started — or skip to browse with
            defaults.
          </p>
          <button
            style={{
              background: 'var(--accent)',
              color: '#000',
              border: 'none',
              borderRadius: 8,
              padding: '10px 24px',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'inherit',
              marginTop: 8,
            }}
            onClick={() => {
              const extId = chrome.runtime.id;
              window.open(
                `https://recome-web.vercel.app/signup?return=extension&ext_id=${extId}`,
                '_blank',
              );
            }}
          >
            Create Account
          </button>
          <button
            style={{
              background: 'transparent',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '8px 20px',
              fontWeight: 500,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
            onClick={async () => {
              await handleOnboardingComplete([], []);
            }}
          >
            Skip — browse with defaults
          </button>
        </div>
      </>
    );
  }

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
