import { useState, useEffect } from 'react';
import { Dashboard } from '../../popup/components/Dashboard';
import { SettingsPanel } from '../../popup/components/SettingsPanel';
import { AgentChat } from '../../popup/components/AgentChat';
import { Onboarding } from '../../popup/components/Onboarding';

// ── Types ────────────────────────────────────────────────────────────────────

type OverlayTab = 'dashboard' | 'agent' | 'settings';
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
  const [activeTab, setActiveTab] = useState<OverlayTab>('dashboard');
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  useEffect(() => {
    chrome.storage.sync
      .get('recome_onboarding_done')
      .then((r) => {
        setOnboardingDone(!!r['recome_onboarding_done']);
      })
      .catch(() => setOnboardingDone(true));
  }, []);

  async function handleOnboardingComplete(quickBlocks: string[], quickLikes: string[]) {
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
    await chrome.storage.sync.set({ recome_onboarding_done: true });
    setOnboardingDone(true);
  }

  // Still loading onboarding state
  if (onboardingDone === null) return null;

  // Show onboarding if not complete
  if (!onboardingDone) {
    return (
      <>
        <OverlayHeader theme={theme} onToggleTheme={onToggleTheme} onClose={onClose} />
        <div className="recome-overlay-popup-content">
          <Onboarding onComplete={handleOnboardingComplete} />
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
          onClick={() => setActiveTab('dashboard')}
        >
          Dashboard
        </button>
        <button
          className={`recome-tab-btn ${activeTab === 'agent' ? 'active' : ''}`}
          onClick={() => setActiveTab('agent')}
        >
          Agent
        </button>
        <button
          className={`recome-tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
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
          <AgentChat onNavigateToSettings={() => setActiveTab('settings')} />
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
