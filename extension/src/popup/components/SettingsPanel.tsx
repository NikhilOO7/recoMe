import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { Platform } from '@shared/types';
import type {
  CloudAccountStatus,
  TwinStatus,
  TwinMatchInfo,
  TwinRecommendationInfo,
} from '@shared/messages';

type LLMProvider = 'anthropic' | 'openai' | 'gemini';

interface Settings {
  enabled: boolean;
  aggressiveness: number;
  train_platform_algo?: boolean;
  platforms: Partial<Record<Platform, boolean>>;
  context_override?: string | null;
  llm_provider?: LLMProvider | null;
  anthropic_api_key?: string;
  openai_api_key?: string;
  gemini_api_key?: string;
}

const ALL_PLATFORMS: Platform[] = [
  'youtube',
  'amazon',
  'twitter',
  'facebook',
  'instagram',
  'ebay',
  'walmart',
  'linkedin',
  'tiktok',
  'indeed',
  'glassdoor',
  'udemy',
  'coursera',
  'edx',
];
const PLATFORM_ICONS: Record<Platform, string> = {
  youtube: '▶',
  amazon: '📦',
  twitter: '𝕏',
  facebook: '𝔽',
  instagram: '📸',
  ebay: '🛍',
  walmart: 'W',
  linkedin: 'in',
  tiktok: '♪',
  indeed: '■',
  glassdoor: '◆',
  udemy: 'U',
  coursera: 'C',
  edx: 'X',
  unknown: '?',
};

const CONTEXTS = ['general', 'work', 'shopping', 'entertainment', 'learning', 'social'] as const;

const LLM_PROVIDERS: Array<{
  id: LLMProvider;
  label: string;
  model: string;
  placeholder: string;
  keyField: keyof Settings;
}> = [
  {
    id: 'anthropic',
    label: 'Claude',
    model: 'Haiku 4.5',
    placeholder: 'sk-ant-api03-…',
    keyField: 'anthropic_api_key',
  },
  {
    id: 'openai',
    label: 'GPT',
    model: 'GPT-5',
    placeholder: 'sk-proj-…',
    keyField: 'openai_api_key',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    model: 'Gemini 2.5 Flash',
    placeholder: 'AIza…',
    keyField: 'gemini_api_key',
  },
];

function send(
  type: string,
  payload: unknown = null,
): Promise<{ success: boolean; data?: unknown }> {
  return chrome.runtime.sendMessage({ type, payload });
}

const MASKED = '••••••••••••••••';

interface SettingsPanelProps {
  onReplayOnboarding?: () => void;
}

export function SettingsPanel({ onReplayOnboarding }: SettingsPanelProps = {}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [blockedTopics, setBlockedTopics] = useState<string[]>([]);
  const [likedTopics, setLikedTopics] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // LLM state
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider | null>(null);
  const [keyInputs, setKeyInputs] = useState<Record<LLMProvider, string>>({
    anthropic: '',
    openai: '',
    gemini: '',
  });
  const [keySaved, setKeySaved] = useState(false);

  useEffect(() => {
    send('GET_SETTINGS')
      .then((r: { success: boolean; data?: unknown }) => {
        if (r.success && r.data) {
          const s = r.data as Settings;
          setSettings(s);
          setSelectedProvider(s.llm_provider ?? null);
          setKeyInputs({
            anthropic: s.anthropic_api_key ? MASKED : '',
            openai: s.openai_api_key ? MASKED : '',
            gemini: s.gemini_api_key ? MASKED : '',
          });
        }
      })
      .catch(() => undefined);
    loadTopics();
  }, []);

  function loadTopics() {
    send('GET_DB_STATS')
      .then((r: { success: boolean; data?: unknown }) => {
        if (r.success && r.data) {
          const d = r.data as { blocked: string[]; liked?: string[] };
          setBlockedTopics(d.blocked.map((k) => k.replace('blocked:', '')));
          setLikedTopics((d.liked ?? []).map((k) => k.replace('interested:', '')));
        }
      })
      .catch(() => undefined);
  }

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveSettings = useCallback(
    (patch: Partial<Settings>) => {
      if (!settings) return;
      const updated = { ...settings, ...patch };
      setSettings(updated);
      setSaving(true);
      // Debounce saves — wait 400ms before sending to background
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        send('SAVE_SETTINGS', patch)
          .then(() => setSaving(false))
          .catch(() => setSaving(false));
      }, 400);
    },
    [settings],
  );

  function togglePlatform(p: Platform) {
    if (!settings) return;
    const current = settings.platforms[p] !== false;
    saveSettings({ platforms: { ...settings.platforms, [p]: !current } });
  }

  function setContext(ctx: string | null) {
    saveSettings({ context_override: ctx });
    if (ctx) send('SWITCH_CONTEXT', { context: ctx }).catch(() => undefined);
  }

  function unblock(topic: string) {
    send('UNBLOCK_TOPIC', { topic })
      .then(() => loadTopics())
      .catch(() => undefined);
  }

  function unlike(topic: string) {
    send('UNLIKE_TOPIC', { topic })
      .then(() => loadTopics())
      .catch(() => undefined);
  }

  function handleProviderSelect(p: LLMProvider | null) {
    setSelectedProvider(p);
    setKeySaved(false);
  }

  function handleKeyFocus(p: LLMProvider) {
    if (keyInputs[p] === MASKED) setKeyInputs((prev) => ({ ...prev, [p]: '' }));
  }

  function handleKeyChange(p: LLMProvider, val: string) {
    setKeyInputs((prev) => ({ ...prev, [p]: val }));
    setKeySaved(false);
  }

  function handleSaveProvider() {
    if (!selectedProvider) {
      // Disable LLM
      saveSettings({ llm_provider: null });
      setKeySaved(true);
      setTimeout(() => setKeySaved(false), 2000);
      return;
    }
    const provider = LLM_PROVIDERS.find((p) => p.id === selectedProvider)!;
    const rawKey = keyInputs[selectedProvider];
    if (rawKey === MASKED) {
      // Only updating provider selection, key unchanged
      saveSettings({ llm_provider: selectedProvider });
    } else {
      const trimmed = rawKey.trim();
      saveSettings({ llm_provider: selectedProvider, [provider.keyField]: trimmed || undefined });
    }
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  }

  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Cloud account state
  const [cloudStatus, setCloudStatus] = useState<CloudAccountStatus | null>(null);
  const [cloudTab, setCloudTab] = useState<'login' | 'register'>('login');
  const [cloudEmail, setCloudEmail] = useState('');
  const [cloudPassword, setCloudPassword] = useState('');
  const [cloudName, setCloudName] = useState('');
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);

  useEffect(() => {
    send('CLOUD_GET_STATUS')
      .then((r) => {
        if (r.success && r.data) setCloudStatus(r.data as CloudAccountStatus);
      })
      .catch(() => undefined);
  }, []);

  function handleCloudAuth() {
    if (!cloudEmail || !cloudPassword) return;
    setCloudLoading(true);
    setCloudError(null);
    const type = cloudTab === 'register' ? 'CLOUD_REGISTER' : 'CLOUD_LOGIN';
    const payload =
      cloudTab === 'register'
        ? { email: cloudEmail, password: cloudPassword, displayName: cloudName || undefined }
        : { email: cloudEmail, password: cloudPassword };
    send(type, payload)
      .then((r) => {
        if (r.success) {
          setCloudStatus({
            authenticated: true,
            email: cloudEmail,
            tier: 'FREE',
            syncAvailable: true,
            lastSync: null,
          });
          setCloudEmail('');
          setCloudPassword('');
          setCloudName('');
        } else {
          setCloudError((r as { error?: string }).error ?? 'Authentication failed');
        }
      })
      .catch(() => setCloudError('Connection failed'))
      .finally(() => setCloudLoading(false));
  }

  function handleCloudLogout() {
    send('CLOUD_LOGOUT')
      .then(() => {
        setCloudStatus({
          authenticated: false,
          email: null,
          tier: 'FREE',
          syncAvailable: false,
          lastSync: null,
        });
      })
      .catch(() => undefined);
  }

  function handleCloudSync() {
    setCloudLoading(true);
    send('CLOUD_SYNC_NOW')
      .then(() => setStatusMessage('Sync complete!'))
      .catch(() => setStatusMessage('Sync failed'))
      .finally(() => {
        setCloudLoading(false);
        setTimeout(() => setStatusMessage(null), 2500);
      });
  }

  // Taste Twin state
  const [twinStatus, setTwinStatus] = useState<TwinStatus | null>(null);
  const [twins, setTwins] = useState<TwinMatchInfo[]>([]);
  const [twinRecs, setTwinRecs] = useState<TwinRecommendationInfo[]>([]);
  const [twinLoading, setTwinLoading] = useState(false);

  useEffect(() => {
    if (cloudStatus?.authenticated) {
      send('TWIN_GET_STATUS')
        .then((r) => {
          if (r.success && r.data) setTwinStatus(r.data as TwinStatus);
        })
        .catch(() => undefined);
    }
  }, [cloudStatus?.authenticated]);

  function loadTwinData() {
    send('TWIN_GET_TWINS')
      .then((r) => {
        if (r.success && Array.isArray(r.data)) setTwins(r.data as TwinMatchInfo[]);
      })
      .catch(() => undefined);
    send('TWIN_GET_RECOMMENDATIONS')
      .then((r) => {
        if (r.success && Array.isArray(r.data)) setTwinRecs(r.data as TwinRecommendationInfo[]);
      })
      .catch(() => undefined);
  }

  function handleTwinOptIn() {
    setTwinLoading(true);
    send('TWIN_OPT_IN')
      .then((r) => {
        if (r.success) {
          setTwinStatus({
            optedIn: true,
            twinCount: 0,
            recommendationCount: 0,
            isDiscoverable: true,
          });
        }
      })
      .catch(() => undefined)
      .finally(() => setTwinLoading(false));
  }

  function handleTwinOptOut() {
    if (confirmAction !== 'twin-opt-out') {
      setConfirmAction('twin-opt-out');
      return;
    }
    setConfirmAction(null);
    setTwinLoading(true);
    send('TWIN_OPT_OUT')
      .then(() => {
        setTwinStatus({ optedIn: false, twinCount: 0, recommendationCount: 0 });
        setTwins([]);
        setTwinRecs([]);
      })
      .catch(() => undefined)
      .finally(() => setTwinLoading(false));
  }

  function handleFindTwins() {
    setTwinLoading(true);
    send('TWIN_COMPUTE_MATCHES')
      .then(() => {
        loadTwinData();
        send('TWIN_GET_STATUS')
          .then((r) => {
            if (r.success && r.data) setTwinStatus(r.data as TwinStatus);
          })
          .catch(() => undefined);
      })
      .catch(() => undefined)
      .finally(() => setTwinLoading(false));
  }

  function handleClearData() {
    if (confirmAction !== 'clear') {
      setConfirmAction('clear');
      return;
    }
    setConfirmAction(null);
    send('CLEAR_ALL_DATA')
      .then(() => {
        setStatusMessage('Data cleared.');
        setTimeout(() => setStatusMessage(null), 2500);
        loadTopics();
      })
      .catch(console.error);
  }

  function handleExport() {
    send('EXPORT_DATA')
      .then((res: { success: boolean; data?: unknown }) => {
        if (!res.success || !res.data) return;
        const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `recome-export-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(console.error);
  }

  function handleImport() {
    if (confirmAction === 'import-confirm') {
      // Already confirmed — skip (handled by file picker callback)
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text) as { memory?: unknown; graph?: unknown; stats?: unknown };
        if (!data.memory && !data.graph) {
          setStatusMessage('Invalid RecoMe export file.');
          setTimeout(() => setStatusMessage(null), 3000);
          return;
        }
        await send('IMPORT_DATA', data);
        setStatusMessage('Import complete!');
        setTimeout(() => setStatusMessage(null), 2500);
        loadTopics();
      } catch {
        setStatusMessage('Failed to import: invalid JSON file.');
        setTimeout(() => setStatusMessage(null), 3000);
      }
    };
    input.click();
  }

  if (!settings) return <div className="settings-loading">Loading…</div>;

  const agr = settings.aggressiveness ?? 0.5;
  const agrLabel = agr < 0.3 ? 'Low' : agr < 0.7 ? 'Medium' : 'High';
  const activeProviderDef = LLM_PROVIDERS.find((p) => p.id === selectedProvider);

  return (
    <div className="settings">
      {/* Blocked Topics */}
      <TopicList
        title="Blocked Topics"
        topics={blockedTopics}
        variant="blocked"
        emptyText="No topics blocked yet. Use Quick Block on the dashboard or the 🚫 button on any post."
        onRemove={unblock}
      />

      {/* Liked Topics */}
      <TopicList
        title="Liked Topics"
        topics={likedTopics}
        variant="liked"
        subtitle="Topics you want to see more of. RecoMe will boost matching content."
        onRemove={unlike}
      />

      {/* Platform Toggles */}
      <div className="setting-group">
        <h3 className="setting-title">Platforms</h3>
        <div className="platform-toggles">
          {ALL_PLATFORMS.map((p) => {
            const on = settings.platforms[p] !== false;
            return (
              <button
                key={p}
                className={`platform-toggle ${on ? 'on' : 'off'}`}
                onClick={() => togglePlatform(p)}
                title={on ? `Disable on ${p}` : `Enable on ${p}`}
              >
                <span className="platform-toggle-icon">{PLATFORM_ICONS[p]}</span>
                <span className="platform-toggle-name">{p}</span>
                <span className={`platform-toggle-dot ${on ? 'on' : 'off'}`} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Aggressiveness */}
      <div className="setting-group">
        <h3 className="setting-title">
          Aggressiveness
          <span className="setting-badge" style={{ marginLeft: 8 }}>
            {agrLabel}
          </span>
          {saving && <span className="setting-saving">saving…</span>}
        </h3>
        <p className="setting-text">How aggressively to hide content that matches your blocks.</p>
        <div className="slider-wrap">
          <span className="slider-label">Low</span>
          <input
            type="range"
            className="agr-slider"
            min="0"
            max="1"
            step="0.05"
            value={agr}
            onChange={(e) => saveSettings({ aggressiveness: parseFloat(e.target.value) })}
          />
          <span className="slider-label">High</span>
        </div>
      </div>

      {/* Train Platform Algorithm */}
      <div className="setting-group">
        <div className="train-algo-row">
          <div>
            <h3 className="setting-title">Train platform algorithm</h3>
            <p className="setting-text">
              When RecoMe hides content, also click the platform's native "Not interested" button
              (YouTube, Instagram, Twitter, Facebook) to train their recommendation algorithm.
            </p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={settings.train_platform_algo === true}
              onChange={() => saveSettings({ train_platform_algo: !settings.train_platform_algo })}
            />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>

      {/* Context Override */}
      <div className="setting-group">
        <h3 className="setting-title">Active Context</h3>
        <p className="setting-text">Override automatic context detection.</p>
        <div className="context-pills">
          <button
            className={`context-pill ${!settings.context_override ? 'active' : ''}`}
            onClick={() => setContext(null)}
          >
            auto
          </button>
          {CONTEXTS.map((c) => (
            <button
              key={c}
              className={`context-pill ${settings.context_override === c ? 'active' : ''}`}
              onClick={() => setContext(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* AI Enhancement */}
      <div className="setting-group">
        <h3 className="setting-title">
          AI Enhancement
          <span className="setting-badge" style={{ marginLeft: 8, opacity: 0.6 }}>
            optional
          </span>
        </h3>
        <p className="setting-text">
          Enable smarter topic extraction. Your key is stored locally, only sent to the chosen
          provider.
        </p>

        {/* Provider selector */}
        <div className="llm-providers">
          <button
            className={`llm-provider-btn ${!selectedProvider ? 'active' : ''}`}
            onClick={() => handleProviderSelect(null)}
          >
            Off
          </button>
          {LLM_PROVIDERS.map((p) => (
            <button
              key={p.id}
              className={`llm-provider-btn ${selectedProvider === p.id ? 'active' : ''}`}
              onClick={() => handleProviderSelect(p.id)}
            >
              {p.label}
              {settings[p.keyField] && <span className="llm-provider-dot" />}
            </button>
          ))}
        </div>

        {/* Key input for selected provider */}
        {activeProviderDef && (
          <div style={{ marginTop: 8 }}>
            <p className="api-key-model">Model: {activeProviderDef.model}</p>
            <div className="api-key-wrap">
              <input
                key={activeProviderDef.id}
                type="password"
                className="api-key-input"
                placeholder={activeProviderDef.placeholder}
                value={keyInputs[activeProviderDef.id]}
                onFocus={() => handleKeyFocus(activeProviderDef.id)}
                onChange={(e) => handleKeyChange(activeProviderDef.id, e.target.value)}
              />
              <button className="setting-btn" onClick={handleSaveProvider}>
                {keySaved ? '✓' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {/* No provider selected — just show save to disable */}
        {!activeProviderDef && settings.llm_provider && (
          <button className="setting-btn" style={{ marginTop: 8 }} onClick={handleSaveProvider}>
            {keySaved ? '✓ Disabled' : 'Disable AI'}
          </button>
        )}

        {/* Active status */}
        {settings.llm_provider && !keySaved && (
          <p className="api-key-status">
            ✦ {LLM_PROVIDERS.find((p) => p.id === settings.llm_provider)?.model ?? 'AI'} active
          </p>
        )}
      </div>

      {/* Cloud Account */}
      <div className="setting-group">
        <h3 className="setting-title">
          Cloud Sync
          <span className="setting-badge" style={{ marginLeft: 8 }}>
            {cloudStatus?.authenticated ? 'connected' : 'offline'}
          </span>
        </h3>
        {cloudStatus?.authenticated ? (
          <div className="cloud-account-connected">
            <p className="setting-text">
              Signed in as <strong>{cloudStatus.email}</strong>
              <br />
              Tier: {cloudStatus.tier}
            </p>
            <div className="setting-actions">
              <button className="setting-btn" onClick={handleCloudSync} disabled={cloudLoading}>
                {cloudLoading ? 'Syncing…' : 'Sync now'}
              </button>
              <button className="setting-btn setting-btn-danger" onClick={handleCloudLogout}>
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <div className="cloud-auth-form">
            <div className="cloud-tabs">
              <button
                className={`cloud-tab ${cloudTab === 'login' ? 'active' : ''}`}
                onClick={() => setCloudTab('login')}
              >
                Sign in
              </button>
              <button
                className={`cloud-tab ${cloudTab === 'register' ? 'active' : ''}`}
                onClick={() => setCloudTab('register')}
              >
                Register
              </button>
            </div>
            {cloudTab === 'register' && (
              <input
                type="text"
                className="cloud-input"
                placeholder="Display name"
                value={cloudName}
                onChange={(e) => setCloudName(e.target.value)}
              />
            )}
            <input
              type="email"
              className="cloud-input"
              placeholder="Email"
              value={cloudEmail}
              onChange={(e) => setCloudEmail(e.target.value)}
            />
            <input
              type="password"
              className="cloud-input"
              placeholder="Password"
              value={cloudPassword}
              onChange={(e) => setCloudPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCloudAuth()}
            />
            {cloudError && <p className="cloud-error">{cloudError}</p>}
            <button className="setting-btn" onClick={handleCloudAuth} disabled={cloudLoading}>
              {cloudLoading
                ? 'Please wait…'
                : cloudTab === 'register'
                  ? 'Create account'
                  : 'Sign in'}
            </button>
          </div>
        )}
      </div>

      {/* Taste Twin Network */}
      {cloudStatus?.authenticated && (
        <div className="setting-group">
          <h3 className="setting-title">
            Taste Twins
            <span className="setting-badge" style={{ marginLeft: 8 }}>
              {twinStatus?.optedIn
                ? `${twinStatus.twinCount} twin${twinStatus.twinCount !== 1 ? 's' : ''}`
                : 'off'}
            </span>
          </h3>
          {!twinStatus?.optedIn ? (
            <div>
              <p className="setting-text">
                Find users with similar tastes. Your interests are anonymized — only bucketed
                signals are shared, never raw data. Twin identities are never revealed.
              </p>
              <button className="setting-btn" onClick={handleTwinOptIn} disabled={twinLoading}>
                {twinLoading ? 'Please wait…' : 'Join Taste Twin Network'}
              </button>
            </div>
          ) : (
            <div>
              <p className="setting-text">
                You have {twinStatus.twinCount} taste twin{twinStatus.twinCount !== 1 ? 's' : ''}{' '}
                and {twinStatus.recommendationCount} pending recommendation
                {twinStatus.recommendationCount !== 1 ? 's' : ''}.
              </p>
              <div className="setting-actions">
                <button className="setting-btn" onClick={handleFindTwins} disabled={twinLoading}>
                  {twinLoading ? 'Searching…' : 'Find twins'}
                </button>
                <button className="setting-btn setting-btn-danger" onClick={handleTwinOptOut}>
                  {confirmAction === 'twin-opt-out' ? 'Confirm leave?' : 'Leave network'}
                </button>
                {confirmAction === 'twin-opt-out' && (
                  <button className="setting-btn" onClick={() => setConfirmAction(null)}>
                    Cancel
                  </button>
                )}
              </div>

              {twins.length > 0 && (
                <div className="twin-list">
                  <span className="twin-list-heading">Your Twins</span>
                  {twins.map((t) => (
                    <div key={t.matchId} className="twin-card">
                      <div className="twin-card-info">
                        <span className="twin-card-score">
                          {Math.round(t.similarityScore * 100)}% match
                        </span>
                        <span className="twin-card-buckets">
                          {t.sharedBuckets} shared interest{t.sharedBuckets !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="twin-card-actions">
                        {!t.accepted && (
                          <button
                            className="setting-btn"
                            onClick={() =>
                              send('TWIN_ACCEPT_MATCH', { matchId: t.matchId }).then(() =>
                                loadTwinData(),
                              )
                            }
                          >
                            Accept
                          </button>
                        )}
                        <button
                          className="setting-btn setting-btn-danger"
                          onClick={() =>
                            send('TWIN_BLOCK_MATCH', { matchId: t.matchId }).then(() =>
                              loadTwinData(),
                            )
                          }
                        >
                          Block
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {twinRecs.length > 0 && (
                <div className="twin-recs">
                  <span className="twin-list-heading">Twin Recommendations</span>
                  {twinRecs.map((r) => (
                    <div key={r.id} className="twin-rec-card">
                      <div className="twin-rec-content">
                        <span className="twin-rec-title">{r.title}</span>
                        <span className="twin-rec-body">{r.body}</span>
                        {r.platform && <span className="twin-rec-platform">{r.platform}</span>}
                      </div>
                      <button
                        className="twin-rec-dismiss"
                        onClick={() =>
                          send('TWIN_DISMISS_RECOMMENDATION', { recommendationId: r.id }).then(() =>
                            loadTwinData(),
                          )
                        }
                        title="Dismiss"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Data */}
      <div className="setting-group">
        <h3 className="setting-title">Data</h3>
        <div className="setting-actions">
          <button className="setting-btn" onClick={handleExport}>
            Export data
          </button>
          <button className="setting-btn" onClick={handleImport}>
            Import data
          </button>
          <button className="setting-btn setting-btn-danger" onClick={handleClearData}>
            {confirmAction === 'clear' ? 'Confirm clear?' : 'Clear all data'}
          </button>
          {confirmAction === 'clear' && (
            <button className="setting-btn" onClick={() => setConfirmAction(null)}>
              Cancel
            </button>
          )}
          {statusMessage && (
            <p className="setting-text" style={{ marginTop: 6 }}>
              {statusMessage}
            </p>
          )}
        </div>
      </div>

      {/* Replay Onboarding */}
      {onReplayOnboarding && (
        <div className="setting-group">
          <h3 className="setting-title">Setup Wizard</h3>
          <p className="setting-text">Re-run the onboarding flow to update your preferences.</p>
          <button className="setting-btn" onClick={onReplayOnboarding}>
            Replay onboarding
          </button>
        </div>
      )}

      <div className="setting-group">
        <p className="setting-text" style={{ fontSize: 10, textAlign: 'center', opacity: 0.5 }}>
          Data is stored locally. Cloud sync is optional and end-to-end encrypted.
          <br />v{chrome.runtime.getManifest().version}
        </p>
      </div>
    </div>
  );
}

// ── Collapsible Topic List ───────────────────────────────────────────────────

const COLLAPSED_LIMIT = 8;

interface TopicListProps {
  title: string;
  topics: string[];
  variant: 'blocked' | 'liked';
  emptyText?: string;
  subtitle?: string;
  onRemove: (topic: string) => void;
}

function TopicList({ title, topics, variant, emptyText, subtitle, onRemove }: TopicListProps) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');

  const isLiked = variant === 'liked';
  const badgeClass = isLiked ? 'setting-badge setting-badge-green' : 'setting-badge';
  const chipClass = isLiked ? 'blocked-chip liked-chip' : 'blocked-chip';

  const filtered = useMemo(() => {
    if (!search.trim()) return topics;
    const q = search.toLowerCase();
    return topics.filter((t) => t.toLowerCase().includes(q));
  }, [topics, search]);

  const showSearch = topics.length > COLLAPSED_LIMIT;
  const isCollapsed = !expanded && !search.trim();
  const visible = isCollapsed ? filtered.slice(0, COLLAPSED_LIMIT) : filtered;
  const hiddenCount = filtered.length - visible.length;

  return (
    <div className="setting-group">
      <h3 className="setting-title">
        {title} {topics.length > 0 && <span className={badgeClass}>{topics.length}</span>}
      </h3>
      {subtitle && <p className="setting-text">{subtitle}</p>}
      {topics.length === 0 && emptyText ? (
        <p className="setting-text">{emptyText}</p>
      ) : (
        <>
          {showSearch && (
            <input
              type="text"
              className="topic-search-input"
              placeholder={`Search ${topics.length} topics...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
          <div className="blocked-list" style={{ marginTop: showSearch ? 6 : 6 }}>
            {visible.map((t) => (
              <div key={t} className={chipClass}>
                <span className="blocked-chip-label">{isLiked ? `✦ ${t}` : t}</span>
                <button
                  className="blocked-chip-remove"
                  onClick={() => onRemove(t)}
                  title={isLiked ? 'Remove' : 'Unblock'}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {hiddenCount > 0 && !search.trim() && (
            <button className="topic-show-more" onClick={() => setExpanded(true)}>
              Show {hiddenCount} more
            </button>
          )}
          {expanded && topics.length > COLLAPSED_LIMIT && !search.trim() && (
            <button className="topic-show-more" onClick={() => setExpanded(false)}>
              Show less
            </button>
          )}
          {search.trim() && filtered.length === 0 && (
            <p className="setting-text" style={{ marginTop: 6 }}>
              No matching topics.
            </p>
          )}
        </>
      )}
    </div>
  );
}
