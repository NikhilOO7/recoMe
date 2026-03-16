import { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { SettingsPanel } from './components/SettingsPanel';
import { Onboarding } from './components/Onboarding';
import '../styles/popup.css';

type Tab = 'dashboard' | 'settings';

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  useEffect(() => {
    chrome.storage.sync.get('recome_onboarding_done').then((r) => {
      setOnboardingDone(!!r['recome_onboarding_done']);
    }).catch(() => setOnboardingDone(true));
  }, []);

  async function handleOnboardingComplete(quickBlocks: string[], quickLikes: string[]) {
    for (const topic of quickBlocks) {
      await chrome.runtime.sendMessage({ type: 'BLOCK_TOPIC', payload: { topic } }).catch(() => undefined);
    }
    for (const topic of quickLikes) {
      await chrome.runtime.sendMessage({ type: 'LIKE_TOPIC', payload: { topic } }).catch(() => undefined);
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
        <div className="app-logo">
          <span className="logo-icon">🎯</span>
          <span className="logo-text">RecoMe</span>
        </div>
        <p className="app-tagline">Your feed, your rules.</p>
      </header>

      <nav className="app-nav">
        <button
          className={`nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          Dashboard
        </button>
        <button
          className={`nav-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
      </nav>

      <main className="app-content">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'settings' && <SettingsPanel />}
      </main>

      <footer className="app-footer">
        <span>v1.0.0 · Privacy-first · Local only</span>
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