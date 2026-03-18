import { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { SettingsPanel } from './components/SettingsPanel';
import { AgentChat } from './components/AgentChat';
import { Onboarding } from './components/Onboarding';
import { useConnectionStatus, type ConnectionStatus } from './hooks/useConnectionStatus';
import '../styles/popup.css';

type Tab = 'dashboard' | 'agent' | 'settings';
type Theme = 'light' | 'dark';

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
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

    chrome.storage.sync
      .get('recome_onboarding_done')
      .then((r) => {
        setOnboardingDone(!!r['recome_onboarding_done']);
      })
      .catch(() => setOnboardingDone(true));
  }, []);

  function toggleTheme() {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    applyTheme(next);
    chrome.storage.local.set({ recome_theme: next }).catch(() => undefined);
  }

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

  // Still loading — show nothing to avoid flash
  if (onboardingDone === null) return null;

  if (!onboardingDone) {
    return (
      <div className="app">
        <Onboarding onComplete={handleOnboardingComplete} />
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
          onClick={() => setActiveTab('dashboard')}
        >
          Dashboard
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'agent'}
          aria-controls="tabpanel-agent"
          className={`nav-btn ${activeTab === 'agent' ? 'active' : ''}`}
          onClick={() => setActiveTab('agent')}
        >
          Agent
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'settings'}
          aria-controls="tabpanel-settings"
          className={`nav-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
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
          <AgentChat onNavigateToSettings={() => setActiveTab('settings')} />
        )}
        {activeTab === 'settings' && <SettingsPanel />}
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
