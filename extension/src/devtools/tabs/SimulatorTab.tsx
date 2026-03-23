import { useState, useCallback } from 'react';
import type { ContentAction, ScoringFactor } from '@shared/types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SimulationForm {
  platform: string;
  type: string;
  title: string;
  topics: string[];
  entities: string[];
  creator: string;
  url: string;
}

interface SimulationResult {
  content_id: string;
  action: ContentAction;
  score: number;
  confidence: number;
  factors: ScoringFactor[];
  explanation: string;
  hide_reason?: string;
  boost_reason?: string;
}

interface Preset {
  label: string;
  values: Partial<SimulationForm>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function send<T>(type: string, payload: unknown = null): Promise<T> {
  return chrome.runtime.sendMessage({ type, payload }).then((r: { success: boolean; data?: T }) => {
    if (!r?.success) throw new Error('Request failed');
    return r.data as T;
  });
}

function scoreColor(score: number): string {
  if (score <= -0.5) return 'var(--red)';
  if (score < 0) return 'var(--orange)';
  if (score > 0.5) return 'var(--green)';
  if (score > 0) return 'var(--green)';
  return 'var(--text2)';
}

function scoreBarWidth(score: number): string {
  return `${Math.round(((score + 1) / 2) * 100)}%`;
}

function actionColor(action: ContentAction): string {
  switch (action) {
    case 'hide':
      return 'var(--red)';
    case 'suppress':
      return 'var(--orange)';
    case 'boost':
      return 'var(--green)';
    case 'show':
    default:
      return 'var(--accent)';
  }
}

// ── Presets ───────────────────────────────────────────────────────────────────

const PRESETS: Preset[] = [
  {
    label: 'Blocked topic card',
    values: { title: 'Test Blocked', topics: ['politics'], platform: 'youtube' },
  },
  {
    label: 'High-affinity topic',
    values: { title: 'Cooking Tutorial', topics: ['cooking', 'recipes'], platform: 'youtube' },
  },
  {
    label: 'Unknown content',
    values: { title: 'Random XYZ', topics: ['unknown_test'], platform: 'twitter' },
  },
  {
    label: 'Shopping product',
    values: {
      title: 'Wireless Headphones',
      topics: ['electronics', 'audio'],
      platform: 'amazon',
      type: 'product',
    },
  },
  {
    label: 'Empty metadata',
    values: { title: '', topics: [], platform: 'youtube' },
  },
  {
    label: 'Mixed signals',
    values: {
      title: 'Political Cooking Show',
      topics: ['politics', 'cooking'],
      platform: 'youtube',
    },
  },
];

const DEFAULT_FORM: SimulationForm = {
  platform: 'youtube',
  type: 'video',
  title: '',
  topics: [],
  entities: [],
  creator: '',
  url: '',
};

const PLATFORMS = [
  'youtube',
  'amazon',
  'twitter',
  'facebook',
  'ebay',
  'walmart',
  'linkedin',
] as const;
const CONTENT_TYPES = ['video', 'product', 'post', 'article', 'tweet', 'listing'] as const;

// ── Component ────────────────────────────────────────────────────────────────

export function SimulatorTab() {
  const [form, setForm] = useState<SimulationForm>({ ...DEFAULT_FORM });
  const [topicsInput, setTopicsInput] = useState('');
  const [entitiesInput, setEntitiesInput] = useState('');
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const updateField = useCallback(
    <K extends keyof SimulationForm>(key: K, value: SimulationForm[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const applyPreset = useCallback((index: number) => {
    const preset = PRESETS[index];
    if (!preset) return;
    const merged = { ...DEFAULT_FORM, ...preset.values };
    setForm(merged);
    setTopicsInput(merged.topics.join(', '));
    setEntitiesInput(merged.entities.join(', '));
    setResult(null);
    setError(null);
  }, []);

  const handleTopicsChange = useCallback(
    (raw: string) => {
      setTopicsInput(raw);
      const tags = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      updateField('topics', tags);
    },
    [updateField],
  );

  const handleEntitiesChange = useCallback(
    (raw: string) => {
      setEntitiesInput(raw);
      const tags = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      updateField('entities', tags);
    },
    [updateField],
  );

  const runSimulation = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await send<SimulationResult>('SIMULATE_CONTENT', form);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation failed');
    } finally {
      setLoading(false);
    }
  }, [form]);

  return (
    <div className="dt-simulator-root">
      {/* ── Preset selector ─────────────────────────────────────── */}
      <div className="dt-simulator-presets">
        <label className="dt-simulator-label">Preset</label>
        <select
          className="dt-simulator-select"
          defaultValue=""
          onChange={(e) => {
            const idx = parseInt(e.target.value, 10);
            if (!isNaN(idx)) applyPreset(idx);
          }}
        >
          <option value="" disabled>
            Choose a preset...
          </option>
          {PRESETS.map((p, i) => (
            <option key={p.label} value={i}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Form ────────────────────────────────────────────────── */}
      <div className="dt-simulator-form">
        <div className="dt-simulator-row">
          <div className="dt-simulator-field">
            <label className="dt-simulator-label">Platform</label>
            <select
              className="dt-simulator-select"
              value={form.platform}
              onChange={(e) => updateField('platform', e.target.value)}
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="dt-simulator-field">
            <label className="dt-simulator-label">Type</label>
            <select
              className="dt-simulator-select"
              value={form.type}
              onChange={(e) => updateField('type', e.target.value)}
            >
              {CONTENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="dt-simulator-field">
          <label className="dt-simulator-label">Title</label>
          <input
            className="dt-simulator-input"
            type="text"
            value={form.title}
            placeholder="Content title..."
            onChange={(e) => updateField('title', e.target.value)}
          />
        </div>

        <div className="dt-simulator-field">
          <label className="dt-simulator-label">Topics (comma separated)</label>
          <input
            className="dt-simulator-input"
            type="text"
            value={topicsInput}
            placeholder="e.g. cooking, recipes, food"
            onChange={(e) => handleTopicsChange(e.target.value)}
          />
          {form.topics.length > 0 && (
            <div className="dt-simulator-tags">
              {form.topics.map((t) => (
                <span key={t} className="dt-simulator-tag">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="dt-simulator-field">
          <label className="dt-simulator-label">Entities (comma separated)</label>
          <input
            className="dt-simulator-input"
            type="text"
            value={entitiesInput}
            placeholder="e.g. Gordon Ramsay, Netflix"
            onChange={(e) => handleEntitiesChange(e.target.value)}
          />
          {form.entities.length > 0 && (
            <div className="dt-simulator-tags">
              {form.entities.map((t) => (
                <span key={t} className="dt-simulator-tag">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="dt-simulator-row">
          <div className="dt-simulator-field" style={{ flex: 1 }}>
            <label className="dt-simulator-label">Creator</label>
            <input
              className="dt-simulator-input"
              type="text"
              value={form.creator}
              placeholder="Creator name..."
              onChange={(e) => updateField('creator', e.target.value)}
            />
          </div>
          <div className="dt-simulator-field" style={{ flex: 2 }}>
            <label className="dt-simulator-label">URL</label>
            <input
              className="dt-simulator-input"
              type="text"
              value={form.url}
              placeholder="https://..."
              onChange={(e) => updateField('url', e.target.value)}
            />
          </div>
        </div>

        <button className="dt-simulator-run-btn" onClick={runSimulation} disabled={loading}>
          {loading ? 'Simulating...' : 'Run Simulation'}
        </button>
      </div>

      {/* ── Error ───────────────────────────────────────────────── */}
      {error && (
        <div className="dt-simulator-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* ── Result panel ────────────────────────────────────────── */}
      {result && (
        <div className="dt-simulator-result">
          <div className="dt-simulator-result-header">
            <span
              className="dt-simulator-action-badge"
              style={{ background: actionColor(result.action) }}
            >
              {result.action.toUpperCase()}
            </span>
            <div className="dt-simulator-score-block">
              <span className="dt-simulator-label">Score</span>
              <div className="dt-simulator-score-bar">
                <div
                  className="dt-simulator-score-fill"
                  style={{
                    width: scoreBarWidth(result.score),
                    background: scoreColor(result.score),
                  }}
                />
              </div>
              <span
                className="dt-simulator-score-value"
                style={{ color: scoreColor(result.score) }}
              >
                {result.score.toFixed(3)}
              </span>
            </div>
            <div className="dt-simulator-confidence-block">
              <span className="dt-simulator-label">Confidence</span>
              <span className="dt-simulator-confidence-value">
                {(result.confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Factor breakdown */}
          <div className="dt-simulator-factors">
            <h4 className="dt-simulator-section-title">Factor Breakdown</h4>
            {result.factors.map((f) => (
              <div key={f.name} className="factor-row">
                <span className="factor-name">{f.name}</span>
                <div className="factor-bar-wrap">
                  <div className="factor-bar">
                    <div
                      className="factor-bar-fill"
                      style={{
                        width: scoreBarWidth(f.score),
                        background: scoreColor(f.score),
                      }}
                    />
                  </div>
                  <span className="factor-score" style={{ color: scoreColor(f.score) }}>
                    {(f.score * f.weight).toFixed(3)}
                  </span>
                </div>
                <div className="factor-expl">{f.explanation}</div>
              </div>
            ))}
          </div>

          {/* Explanation */}
          <div className="dt-simulator-explanation">
            <h4 className="dt-simulator-section-title">Explanation</h4>
            <p className="dt-simulator-explanation-text">{result.explanation}</p>
          </div>
        </div>
      )}
    </div>
  );
}
