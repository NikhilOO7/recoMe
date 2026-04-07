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
import {
  getAuthState,
  openLogin,
  openSignup,
  openSettings as openWebSettings,
  type AuthState,
} from '../shared/AuthManager';
import { WEB_APP_URL } from '../shared/constants';
import '../styles/popup.css';

type Theme = 'light' | 'dark';

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function App() {
  const [activeTab, setActiveTab] = useState<PanelTab>('dashboard');
  const [panelMode, setPanelMode] = useState<PanelMode>('loading');
  const [theme, setTheme] = useState<Theme>('dark');
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const connectionStatus = useConnectionStatus();

  useEffect(() => {
    // Load theme
    chrome.storage.local
      .get('recome_theme')
      .then((r) => {
        const saved = r['recome_theme'] as Theme | undefined;
        if (saved) {
          setTheme(saved);
          applyTheme(saved);
        } else {
          applyTheme('dark');
        }
      })
      .catch(() => applyTheme('dark'));

    // Load panel state
    loadPanelState().then((snapshot) => {
      setPanelMode(snapshot.mode);
      setActiveTab(snapshot.activeTab);
    });

    // Load auth state
    getAuthState().then(setAuthState);

    // Listen for auth changes (callback.html stores tokens)
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes['recome_cloud_access_token']) {
        getAuthState().then(setAuthState);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const toggleTheme = useCallback(() => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    applyTheme(next);
    chrome.storage.local.set({ recome_theme: next }).catch(() => undefined);
  }, [theme]);

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
    }
    await completeOnboarding();
    setPanelMode('dashboard_default');
  }

  // Still loading
  if (panelMode === 'loading') return null;

  // First-time: show compact auth screen that redirects to web app
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
        <button className="popup-btn-primary" onClick={openSignup}>
          Create Account
        </button>
        <button
          className="popup-btn-secondary"
          onClick={async () => {
            await handleOnboardingComplete([], []);
          }}
        >
          Skip — use with defaults
        </button>
        <button className="popup-btn-link" onClick={openLogin}>
          Already have an account? Log in
        </button>
      </div>
    );
  }

  // Replay from Settings
  if (panelMode === 'onboarding_replay') {
    return (
      <div className="app">
        <Onboarding onComplete={handleOnboardingComplete} isReplay={true} />
      </div>
    );
  }

  // ── Main compact popup ────────────────────────────────────────────────────

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="app-header-row">
          <a
            className="app-logo"
            href={WEB_APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="Open RecoMe web app"
          >
            <img className="logo-icon" src="icons/recome_logo_48.png" alt="RecoMe" />
            <span className="logo-text">RecoMe</span>
          </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {authState?.authenticated && authState.profile && (
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--text-muted)',
                  maxWidth: 100,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {authState.profile.displayName || authState.profile.email}
              </span>
            )}
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
          </div>
        </div>
        {!authState?.authenticated && (
          <div style={{ display: 'flex', gap: 6, padding: '6px 0' }}>
            <button className="popup-btn-mini-primary" onClick={openSignup}>
              Sign up
            </button>
            <button className="popup-btn-mini-secondary" onClick={openLogin}>
              Log in
            </button>
          </div>
        )}
      </header>

      {/* Nav tabs */}
      <nav className="app-nav" role="tablist" aria-label="Main navigation">
        <button
          role="tab"
          aria-selected={activeTab === 'dashboard'}
          className={`nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => handleTabChange('dashboard')}
        >
          Dashboard
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'agent'}
          className={`nav-btn ${activeTab === 'agent' ? 'active' : ''}`}
          onClick={() => handleTabChange('agent')}
        >
          Agent
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'settings'}
          className={`nav-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => handleTabChange('settings')}
        >
          Settings
        </button>
      </nav>

      {connectionStatus !== 'connected' && <ConnectionBanner status={connectionStatus} />}

      {/* Tab content */}
      <div className="app-body">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'agent' && (
          <AgentChat onNavigateToSettings={() => handleTabChange('settings')} />
        )}
        {activeTab === 'settings' && (
          <SettingsPanel onReplayOnboarding={() => setPanelMode('onboarding_replay')} />
        )}
      </div>

      {/* Web app links bar at bottom */}
      <div className="popup-web-links">
        <button
          className="popup-web-link"
          onClick={() => chrome.tabs.create({ url: `${WEB_APP_URL}/extension` })}
        >
          Full Dashboard
        </button>
        <span className="popup-web-divider" />
        <button className="popup-web-link" onClick={openWebSettings}>
          Advanced Settings
        </button>
        <span className="popup-web-divider" />
        <button className="popup-web-link" onClick={() => chrome.tabs.create({ url: WEB_APP_URL })}>
          recome-web.vercel.app
        </button>
      </div>
    </div>
  );
}

function ConnectionBanner({ status }: { status: ConnectionStatus }) {
  if (status === 'connected') return null;
  return (
    <div className="connection-banner">
      {status === 'offline'
        ? 'Extension offline. Reload the page.'
        : 'Connection degraded — some features limited.'}
    </div>
  );
}
