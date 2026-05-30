import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  sendMessage,
  type GetInboxPayload,
  type MarkSeenPayload,
  type InboxFeedbackPayload,
  type SetSettingsPayload,
} from '../shared/messages';
import { getWebAppUrl, STORAGE_KEYS } from '../shared/constants';
import type { AgentEvent } from '../shared/types';
import '../styles/popup.css';

interface AuthState {
  loggedIn: boolean;
  user?: { id: string; email?: string };
}

interface Settings {
  enabled: boolean;
}

const KIND_META: Record<string, { label: string; accent: string; icon: string }> = {
  recall: { label: 'Recall', accent: '#5eead4', icon: '↻' },
  deal_drop: { label: 'Concierge', accent: '#10b981', icon: '$' },
  new_alternative: { label: 'Concierge', accent: '#10b981', icon: '⇄' },
  fresh_content: { label: 'Curator', accent: '#8b5cf6', icon: '★' },
  decision_nudge: { label: 'Decision', accent: '#2356e8', icon: '?' },
  weekly_summary: { label: 'Synthesist', accent: '#5eead4', icon: '∑' },
};

export function App() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [events, setEvents] = useState<AgentEvent[] | null>(null);
  const [webUrl, setWebUrl] = useState('https://recome.app');
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unseen'>('unseen');
  const [welcomeDismissed, setWelcomeDismissed] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [authRes, settingsRes, inboxRes, url, flags] = await Promise.all([
        sendMessage<undefined, AuthState>('GET_AUTH_STATE'),
        sendMessage<undefined, Settings>('GET_SETTINGS'),
        sendMessage<GetInboxPayload, { events: AgentEvent[] }>('GET_INBOX', { limit: 30 }),
        getWebAppUrl(),
        chrome.storage.local.get(STORAGE_KEYS.welcome_popup_dismissed),
      ]);
      if (authRes.success) setAuth(authRes.data!);
      if (settingsRes.success) setSettings(settingsRes.data!);
      if (inboxRes.success) setEvents(inboxRes.data?.events ?? []);
      setWebUrl(url);
      setWelcomeDismissed(!!flags[STORAGE_KEYS.welcome_popup_dismissed]);
    } finally {
      setLoading(false);
    }
  }, []);

  const dismissWelcome = useCallback(async () => {
    await chrome.storage.local.set({ [STORAGE_KEYS.welcome_popup_dismissed]: true });
    setWelcomeDismissed(true);
  }, []);

  useEffect(() => {
    void load();
    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ): void => {
      if (area === 'local' && (changes['recome_access_token'] || changes['recome_inbox_cache'])) {
        void load();
      }
    };
    chrome.storage.onChanged.addListener(onChange);
    const onMsg = (m: unknown): void => {
      const msg = m as { type?: string };
      if (msg?.type === 'INBOX_UPDATED') void load();
    };
    chrome.runtime.onMessage.addListener(onMsg);
    return () => {
      chrome.storage.onChanged.removeListener(onChange);
      chrome.runtime.onMessage.removeListener(onMsg);
    };
  }, [load]);

  const openLogin = useCallback(() => {
    // Web /login reads `return=extension` + `ext_id`; on success it redirects
    // to chrome-extension://<ext_id>/callback.html with the tokens as URL
    // params. callback.html persists them via shared/AuthClient storage keys.
    const extId = chrome.runtime.id;
    chrome.tabs.create({ url: `${webUrl}/login?return=extension&ext_id=${extId}` });
  }, [webUrl]);
  const openWeb = useCallback(
    (path = '') => chrome.tabs.create({ url: `${webUrl}${path}` }),
    [webUrl],
  );
  const logout = useCallback(async () => {
    await sendMessage('LOGOUT');
    setAuth({ loggedIn: false });
    setEvents([]);
  }, []);
  const toggleEnabled = useCallback(async () => {
    if (!settings) return;
    const next = !settings.enabled;
    setSettings({ enabled: next });
    await sendMessage<SetSettingsPayload, Settings>('SET_SETTINGS', {
      settings: { enabled: next },
    });
  }, [settings]);

  const visible = useMemo(() => {
    if (!events) return [];
    return filter === 'unseen' ? events.filter((e) => !e.seenAt) : events;
  }, [events, filter]);

  if (!auth || !settings) {
    return (
      <>
        <Header status="Loading" />
        <div className="empty-state">
          <div className="empty-body">Connecting to your graph…</div>
        </div>
      </>
    );
  }

  if (!auth.loggedIn) {
    return (
      <>
        <Header status="Signed out" />
        <div className="empty-state">
          <div className="empty-title">Sign in to RecoMe</div>
          <div className="empty-body">
            Your interest graph lives in the cloud. Sign in once on the web app and the extension
            picks up your session.
          </div>
          <button className="btn btn-primary btn-block" onClick={openLogin}>
            Open recome.app to sign in
          </button>
        </div>
        <Footer webUrl={webUrl} onOpen={() => openWeb('')} />
      </>
    );
  }

  return (
    <>
      <Header status="Active" />

      <section className="panel panel-row-stack">
        <div className="panel-row">
          <span>Capture</span>
          <div className="row-right">
            <span className="muted">{settings.enabled ? 'on' : 'off'}</span>
            <div
              className={`toggle ${settings.enabled ? 'on' : ''}`}
              onClick={toggleEnabled}
              role="switch"
              aria-checked={settings.enabled}
            />
          </div>
        </div>
        <div className="panel-row">
          <span>Signed in</span>
          <span className="muted">{auth.user?.email ?? auth.user?.id ?? 'logged in'}</span>
        </div>
      </section>

      {welcomeDismissed === false && (events?.length ?? 0) === 0 && (
        <WelcomePanel onDismiss={dismissWelcome} />
      )}

      <section className="inbox-section">
        <div className="inbox-header">
          <div className="inbox-title">Inbox</div>
          <div className="tab-group">
            <button
              className={`tab ${filter === 'unseen' ? 'active' : ''}`}
              onClick={() => setFilter('unseen')}
            >
              Unseen
            </button>
            <button
              className={`tab ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All
            </button>
          </div>
        </div>

        {loading && events === null && <div className="inbox-loading">Loading…</div>}
        {!loading && visible.length === 0 && (
          <div className="inbox-empty">
            {filter === 'unseen' ? 'No new events. Check back later.' : 'No events yet.'}
          </div>
        )}
        {visible.map((e) => (
          <InboxRow
            key={e.id}
            event={e}
            onSeen={async () => {
              await sendMessage<MarkSeenPayload, void>('MARK_SEEN', { eventId: e.id });
              void load();
            }}
            onFeedback={async (feedback) => {
              await sendMessage<InboxFeedbackPayload, void>('INBOX_FEEDBACK', {
                eventId: e.id,
                feedback,
              });
              await sendMessage<MarkSeenPayload, void>('MARK_SEEN', { eventId: e.id });
              void load();
            }}
            onOpen={() => {
              const url = e.actionUrl ?? `${webUrl}/inbox`;
              chrome.tabs.create({ url });
              void sendMessage<MarkSeenPayload, void>('MARK_SEEN', { eventId: e.id });
            }}
          />
        ))}
      </section>

      <Footer webUrl={webUrl} onOpen={() => openWeb('/inbox')} onLogout={logout} />
    </>
  );
}

function WelcomePanel({ onDismiss }: { onDismiss: () => void }) {
  return (
    <section className="welcome-card">
      <div className="welcome-title">Welcome to RecoMe</div>
      <p className="welcome-body">
        RecoMe watches your browsing across YouTube, Amazon, Reddit, and 12 other sites — building a
        map of what you&apos;re researching.
      </p>
      <ul className="welcome-list">
        <li>
          <span className="welcome-agent" style={{ color: '#5eead4' }}>
            Recall
          </span>{' '}
          surfaces what you forgot when you re-encounter a topic
        </li>
        <li>
          <span className="welcome-agent" style={{ color: '#10b981' }}>
            Concierge
          </span>{' '}
          tracks prices and finds alternatives when you shop
        </li>
        <li>
          <span className="welcome-agent" style={{ color: '#8b5cf6' }}>
            Curator
          </span>{' '}
          brings fresh content on topics you&apos;ve been quiet on
        </li>
        <li>
          <span className="welcome-agent" style={{ color: '#2356e8' }}>
            Decision
          </span>{' '}
          pulls your research when you ask for a recommendation
        </li>
      </ul>
      <p className="welcome-tip">
        Try a YouTube video or Amazon product for 10 seconds — you&apos;ll see your first signal
        captured and your topics start to populate.
      </p>
      <button className="btn btn-primary btn-block" onClick={onDismiss}>
        Got it →
      </button>
    </section>
  );
}

function Header({ status }: { status: string }) {
  return (
    <header className="popup-header">
      <div className="brand">
        <span className="brand-dot" />
        <span className="brand-name">
          Reco<span>Me</span>
        </span>
      </div>
      <span className="header-status">● {status}</span>
    </header>
  );
}

function Footer({
  webUrl,
  onOpen,
  onLogout,
}: {
  webUrl: string;
  onOpen: () => void;
  onLogout?: () => void;
}) {
  return (
    <footer className="popup-footer">
      <span>v2.0.0</span>
      <span>
        <a href={webUrl} onClick={(e) => (e.preventDefault(), onOpen())}>
          Open recome.app
        </a>
        {onLogout && (
          <>
            {' · '}
            <a href="#logout" onClick={(e) => (e.preventDefault(), onLogout())}>
              Sign out
            </a>
          </>
        )}
      </span>
    </footer>
  );
}

function InboxRow({
  event,
  onSeen,
  onFeedback,
  onOpen,
}: {
  event: AgentEvent;
  onSeen: () => void;
  onFeedback: (f: 'useful' | 'not_useful') => void;
  onOpen: () => void;
}) {
  const meta = KIND_META[event.kind] ?? { label: event.agent, accent: '#5eead4', icon: '●' };
  return (
    <article className={`inbox-row ${event.seenAt ? 'seen' : ''}`}>
      <div
        className="inbox-icon"
        style={{
          background: meta.accent + '22',
          color: meta.accent,
          border: '1px solid ' + meta.accent + '44',
        }}
      >
        {meta.icon}
      </div>
      <div className="inbox-body">
        <div className="inbox-meta" style={{ color: meta.accent }}>
          {meta.label} · {timeAgo(event.createdAt)}
        </div>
        <div className="inbox-title-row">{event.title}</div>
        {event.body && <div className="inbox-text">{event.body}</div>}
        <div className="inbox-actions">
          <button className="inline-btn primary" onClick={onOpen}>
            Open
          </button>
          <button className="inline-btn" onClick={onSeen} title="Dismiss">
            ✕
          </button>
          <span className="inbox-spacer" />
          <button className="inline-btn ghost" onClick={() => onFeedback('useful')} title="Useful">
            👍
          </button>
          <button
            className="inline-btn ghost"
            onClick={() => onFeedback('not_useful')}
            title="Not useful"
          >
            👎
          </button>
        </div>
      </div>
    </article>
  );
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}
