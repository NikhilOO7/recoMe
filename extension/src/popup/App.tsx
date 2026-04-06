import { useState, useEffect, useCallback } from 'react';
import { Dashboard } from './components/Dashboard';
import { SettingsPanel } from './components/SettingsPanel';
import { AgentChat } from './components/AgentChat';
import { Onboarding, type SeedPreferences } from './components/Onboarding';
import { useConnectionStatus, type ConnectionStatus } from './hooks/useConnectionStatus';
import {
  loadPanelState,
  completeOnboarding,
  persistActiveTab,
  type PanelTab,
  type PanelMode,
} from '../shared/PanelState';
import '../styles/popup.css';

type Theme = 'light' | 'dark';

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function App() {
  const [activeTab, setActiveTab] = useState<PanelTab>('dashboard');
  const [panelMode, setPanelMode] = useState<PanelMode>('loading');
  const [theme, setTheme] = useState<Theme>('light');
  const connectionStatus = useConnectionStatus();

  useEffect(() => {
    chrome.storage.local
      .get('recome_theme')
      .then((r) => {
        const saved = r['recome_theme'] as Theme | undefined;
        if (saved === 'light' || saved === 'dark') {
          setTheme(saved);
          applyTheme(saved);
        }
      })
      .catch(() => undefined);

    loadPanelState().then((snapshot) => {
      setPanelMode(snapshot.mode);
      setActiveTab(snapshot.activeTab);
    });
  }, []);

  const handleTabChange = useCallback((tab: PanelTab) => {
    setActiveTab(tab);
    persistActiveTab(tab);
  }, []);

  function toggleTheme() {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    applyTheme(next);
    chrome.storage.local.set({ recome_theme: next }).catch(() => undefined);
  }

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
    // Save seed preferences for cold-start scoring
    if (seedPrefs) {
      await chrome.storage.local
        .set({
          recome_seed_prefs: seedPrefs,
          recome_seed_prefs_at: new Date().toISOString(),
        })
        .catch(() => undefined);
      // Map intensity to aggressiveness setting
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

  // Still loading — show nothing to avoid flash
  if (panelMode === 'loading') return null;

  // First-time: redirect to web app for account creation
  if (panelMode === 'onboarding_required') {
    return (
      <div
        className="app"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: 12,
          padding: '40px 20px',
          minHeight: 400,
        }}
      >
        <img
          src={chrome.runtime.getURL('icons/recome_logo_128.png')}
          alt="RecoMe"
          style={{ width: 64, height: 64, borderRadius: 16 }}
        />
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Welcome to RecoMe</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: 260 }}>
          Your research, connected across YouTube, Reddit, and Amazon.
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
            width: '100%',
            maxWidth: 240,
          }}
          onClick={() => {
            const extId = chrome.runtime.id;
            chrome.tabs.create({
              url: `https://recome.vercel.app/signup?return=extension&ext_id=${extId}`,
            });
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
            width: '100%',
            maxWidth: 240,
          }}
          onClick={async () => {
            await handleOnboardingComplete([], []);
          }}
        >
          Skip — use with defaults
        </button>
        <button
          style={{
            background: 'transparent',
            color: 'var(--text-muted)',
            border: 'none',
            padding: '6px 12px',
            fontSize: 11,
            cursor: 'pointer',
            fontFamily: 'inherit',
            textDecoration: 'underline',
          }}
          onClick={() => {
            const extId = chrome.runtime.id;
            chrome.tabs.create({
              url: `https://recome.vercel.app/login?return=extension&ext_id=${extId}`,
            });
          }}
        >
          Already have an account? Log in
        </button>
      </div>
    );
  }

  // Replay from Settings: show in-extension onboarding
  if (panelMode === 'onboarding_replay') {
    return (
      <div className="app">
        <Onboarding onComplete={handleOnboardingComplete} isReplay={true} />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-row">
          <a
            className="app-logo"
            href="https://nikhiloo7.github.io/recome-website/"
            target="_blank"
            rel="noopener noreferrer"
            title="Visit RecoMe website"
          >
            <img className="logo-icon" src="icons/recome_logo_48.png" alt="RecoMe" />
            <span className="logo-text">RecoMe</span>
          </a>
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
        <p className="app-tagline">Your feed, your rules.</p>
      </header>

      <nav className="app-nav" role="tablist" aria-label="Main navigation">
        <button
          role="tab"
          aria-selected={activeTab === 'dashboard'}
          aria-controls="tabpanel-dashboard"
          className={`nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => handleTabChange('dashboard')}
        >
          Dashboard
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'agent'}
          aria-controls="tabpanel-agent"
          className={`nav-btn ${activeTab === 'agent' ? 'active' : ''}`}
          onClick={() => handleTabChange('agent')}
        >
          Agent
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'settings'}
          aria-controls="tabpanel-settings"
          className={`nav-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => handleTabChange('settings')}
        >
          Settings
        </button>
      </nav>

      {connectionStatus !== 'connected' && <ConnectionBanner status={connectionStatus} />}

      <main
        className="app-content"
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-label={`${activeTab} panel`}
      >
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'agent' && (
          <AgentChat onNavigateToSettings={() => handleTabChange('settings')} />
        )}
        {activeTab === 'settings' && (
          <SettingsPanel onReplayOnboarding={() => setPanelMode('onboarding_replay')} />
        )}
      </main>

      <footer className="app-footer">
        <span>
          v1.0.0 ·{' '}
          <a
            href="https://nikhiloo7.github.io/recome-website/"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-site-link"
          >
            recome.dev
          </a>
        </span>
        <button
          className="devtools-link"
          onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('devtools.html') })}
          title="Open developer monitoring page"
        >
          DevTools
        </button>
      </footer>
    </div>
  );
}

function ConnectionBanner({ status }: { status: ConnectionStatus }) {
  const isOffline = status === 'offline';
  const bannerStyle: React.CSSProperties = {
    padding: '6px 20px',
    fontSize: '11px',
    fontWeight: 500,
    textAlign: 'center',
    background: isOffline ? 'rgba(245, 158, 11, 0.12)' : 'rgba(249, 115, 22, 0.12)',
    color: isOffline ? '#b45309' : '#c2410c',
    borderBottom: `1px solid ${isOffline ? 'rgba(245, 158, 11, 0.3)' : 'rgba(249, 115, 22, 0.3)'}`,
  };

  return (
    <div role="status" style={bannerStyle}>
      {isOffline
        ? 'You\u2019re offline \u2014 RecoMe works locally but AI features are unavailable'
        : 'Background service restarting\u2026'}
    </div>
  );
}
