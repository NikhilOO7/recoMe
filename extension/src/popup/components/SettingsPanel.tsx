import { useState, useEffect, useMemo } from 'react';
import type { Platform } from '@shared/types';

type LLMProvider = 'anthropic' | 'openai' | 'gemini';

interface Settings {
  enabled: boolean;
  aggressiveness: number;
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
];
const PLATFORM_ICONS: Record<Platform, string> = {
  youtube: '▶',
  amazon: '📦',
  twitter: '𝕏',
  facebook: '𝔽',
  instagram: '📸',
  ebay: '🛍',
  walmart: 'W',
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

export function SettingsPanel() {
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

  function saveSettings(patch: Partial<Settings>) {
    if (!settings) return;
    const updated = { ...settings, ...patch };
    setSettings(updated);
    setSaving(true);
    send('SAVE_SETTINGS', patch)
      .then(() => setSaving(false))
      .catch(() => setSaving(false));
  }

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

  function handleClearData() {
    if (!confirm('Clear all RecoMe memory and preferences?')) return;
    send('CLEAR_ALL_DATA')
      .then(() => {
        alert('Data cleared.');
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
          alert('Invalid RecoMe export file.');
          return;
        }
        if (!confirm('Import will merge with your existing data. Continue?')) return;
        await send('IMPORT_DATA', data);
        alert('Import complete!');
        loadTopics();
      } catch {
        alert('Failed to import: invalid JSON file.');
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
            Clear all data
          </button>
        </div>
      </div>

      <div className="setting-group">
        <p className="setting-text" style={{ fontSize: 10, textAlign: 'center', opacity: 0.5 }}>
          All data is stored locally on your device. Nothing is sent to any server.
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
