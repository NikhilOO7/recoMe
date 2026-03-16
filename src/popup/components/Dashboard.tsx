import { useEffect, useState, useCallback } from 'react';
import { StatsCard } from './StatsCard';
import type { RecoMeStats, ContextBucket } from '@shared/types';

const ALL_ACHIEVEMENTS = [
  // First Steps
  { id: 'first_block',   icon: '🎯', label: 'First Block' },
  { id: 'clean_start',   icon: '✨', label: 'Clean Start' },
  { id: 'quick_learner', icon: '🎓', label: 'Quick Learner' },
  // Growing
  { id: 'clean_sweep',   icon: '💯', label: 'Clean Sweep' },
  { id: 'mind_reader',   icon: '🧠', label: 'Mind Reader' },
  { id: 'laser_focus',   icon: '🔍', label: 'Laser Focus' },
  // Mastery
  { id: 'feed_master',   icon: '🏆', label: 'Feed Master' },
  { id: 'power_user',    icon: '⚡', label: 'Power User' },
  // Secret
  { id: 'unicorn',       icon: '🦄', label: 'Unicorn' },
  { id: 'party_time',    icon: '🎉', label: 'Party Time' },
];

interface DbStats {
  indexeddb: Record<string, number>;
  blocked: string[];
  liked?: string[];
  active_entries: Array<{ topic_key: string; memory_type: string; status: string; context_bucket: string; value: { strength?: number } }>;
}

function send(type: string, payload: unknown = null): Promise<{ success: boolean; data?: unknown }> {
  return chrome.runtime.sendMessage({ type, payload });
}

export function Dashboard() {
  const [stats, setStats] = useState<RecoMeStats | null>(null);
  const [dbStats, setDbStats] = useState<DbStats | null>(null);
  const [context, setContext] = useState<ContextBucket>('general');
  const [loading, setLoading] = useState(true);
  const [unlockedIds, setUnlockedIds] = useState<string[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      send('GET_STATS'),
      send('GET_DB_STATS'),
    ]).then(([statsRes, dbRes]) => {
      if (statsRes.success && statsRes.data) setStats(statsRes.data as RecoMeStats);
      if (dbRes.success && dbRes.data) setDbStats(dbRes.data as DbStats);
    }).catch(() => undefined).finally(() => setLoading(false));

    chrome.storage.local.get('recome_achievements').then((r) => {
      const state = r['recome_achievements'] as { unlocked?: string[] } | undefined;
      setUnlockedIds(state?.unlocked ?? []);
    }).catch(() => undefined);

    // Also get current context
    send('GET_SETTINGS').then((r: { success: boolean; data?: unknown }) => {
      const s = r.data as { context_override?: ContextBucket | null } | undefined;
      if (s?.context_override) setContext(s.context_override);
    }).catch(() => undefined);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="dashboard-loading"><div className="spinner" /><span>Loading...</span></div>;

  const blockedCount = dbStats?.blocked.length ?? 0;
  const memoryCount = dbStats?.indexeddb.memory_entries ?? stats?.memory_entries ?? 0;
  const patternCount = stats?.active_patterns ?? 0;

  // suppress unused variable warning for context — it's stored for future use
  void context;

  return (
    <div className="dashboard">
      <div className="stats-grid">
        <StatsCard label="Hidden today" value={stats?.hidden_today ?? 0} icon="🙈" color="#ef4444" />
        <StatsCard label="Total hidden" value={stats?.total_hidden ?? 0} icon="🛡️" color="#6366f1" />
        <StatsCard label="Active blocks" value={blockedCount} icon="🚫" color="#f59e0b" />
        <StatsCard label="Memory entries" value={memoryCount} icon="🧠" color="#06b6d4" />
      </div>

      {/* Achievements */}
      <div className="achievements">
        <h3 className="section-title">
          Achievements
          {unlockedIds.length > 0 && (
            <span className="achievement-count">{unlockedIds.length}/{ALL_ACHIEVEMENTS.length}</span>
          )}
        </h3>
        <div className="achievement-grid">
          {ALL_ACHIEVEMENTS.map((a) => {
            const unlocked = unlockedIds.includes(a.id);
            return (
              <div key={a.id} className={`achievement-badge ${unlocked ? 'unlocked' : 'locked'}`} title={a.label}>
                <span className="achievement-icon">{a.icon}</span>
                <span className="achievement-label">{a.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active patterns */}
      {patternCount > 0 && (
        <div className="blocked-topics" style={{ marginBottom: 12 }}>
          <h3 className="section-title">Active Patterns <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({patternCount})</span></h3>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            RecoMe has detected {patternCount} recurring preference pattern{patternCount !== 1 ? 's' : ''} from your feedback.
          </p>
        </div>
      )}

      {/* Top blocked topics */}
      {dbStats && dbStats.blocked.length > 0 && (
        <div className="blocked-topics">
          <h3 className="section-title">Active Blocks</h3>
          <ul className="topic-list">
            {dbStats.blocked.slice(0, 5).map((key) => (
              <li key={key} className="topic-item">
                <span className="topic-name">{key.replace('blocked:', '')}</span>
                <span className="topic-count" style={{ color: 'var(--accent6)' }}>blocked</span>
              </li>
            ))}
            {dbStats.blocked.length > 5 && (
              <li className="topic-item" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                +{dbStats.blocked.length - 5} more — manage in Settings
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Current Focus */}
      <CurrentFocus onChanged={load} />

      <div className="quick-actions">
        <h3 className="section-title">Quick Block</h3>
        <QuickBlock onBlocked={load} />
      </div>

      <div className="quick-actions">
        <h3 className="section-title">Quick Like ✦</h3>
        <QuickLike onLiked={load} />
      </div>
    </div>
  );
}

function CurrentFocus({ onChanged }: { onChanged: () => void }) {
  const [focus, setFocus] = useState<{ topic: string; set_at: number } | null>(null);
  const [input, setInput] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    send('GET_FOCUS').then((r) => {
      if (r.success && r.data) setFocus(r.data as { topic: string; set_at: number });
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  function handleSet() {
    const trimmed = input.trim();
    if (!trimmed) return;
    send('SET_FOCUS', { topic: trimmed }).then((r) => {
      if (r.success && r.data) setFocus(r.data as { topic: string; set_at: number });
      setInput('');
      onChanged();
    }).catch(console.error);
  }

  function handleClear() {
    send('CLEAR_FOCUS').then(() => {
      setFocus(null);
      onChanged();
    }).catch(console.error);
  }

  if (!loaded) return null;

  const daysAgo = focus ? Math.floor((Date.now() - focus.set_at) / (24 * 60 * 60 * 1000)) : 0;

  return (
    <div className="quick-actions">
      <h3 className="section-title">Current Focus</h3>
      {focus ? (
        <div className="focus-active">
          <div className="focus-topic">
            <span className="focus-icon">🔬</span>
            <span className="focus-label">{focus.topic}</span>
            <span className="focus-age">{daysAgo === 0 ? 'today' : `${daysAgo}d ago`}</span>
          </div>
          <button className="block-btn" onClick={handleClear} style={{ fontSize: 11, padding: '4px 8px' }}>
            Clear
          </button>
        </div>
      ) : (
        <div className="quick-block">
          <input
            type="text"
            className="block-input"
            placeholder="What are you researching?"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSet()}
          />
          <button className="block-btn like-btn" onClick={handleSet} disabled={!input.trim()}>
            🔬 Set
          </button>
        </div>
      )}
    </div>
  );
}

function QuickBlock({ onBlocked }: { onBlocked: () => void }) {
  const [topic, setTopic] = useState('');
  const [status, setStatus] = useState<'idle' | 'sent'>('idle');

  function handleBlock() {
    const trimmed = topic.trim();
    if (!trimmed) return;
    chrome.runtime
      .sendMessage({ type: 'BLOCK_TOPIC', payload: { topic: trimmed } })
      .then(() => {
        setStatus('sent');
        setTopic('');
        onBlocked();
        setTimeout(() => setStatus('idle'), 1500);
      })
      .catch(console.error);
  }

  return (
    <div className="quick-block">
      <input
        type="text"
        className="block-input"
        placeholder="Topic to block..."
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleBlock()}
      />
      <button className="block-btn" onClick={handleBlock} disabled={!topic.trim()}>
        {status === 'sent' ? '✓' : '🚫 Block'}
      </button>
    </div>
  );
}

function QuickLike({ onLiked }: { onLiked: () => void }) {
  const [topic, setTopic] = useState('');
  const [status, setStatus] = useState<'idle' | 'sent'>('idle');

  function handleLike() {
    const trimmed = topic.trim();
    if (!trimmed) return;
    chrome.runtime
      .sendMessage({ type: 'LIKE_TOPIC', payload: { topic: trimmed } })
      .then(() => {
        setStatus('sent');
        setTopic('');
        onLiked();
        setTimeout(() => setStatus('idle'), 1500);
      })
      .catch(console.error);
  }

  return (
    <div className="quick-block">
      <input
        type="text"
        className="block-input like-input"
        placeholder="Topic to boost..."
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleLike()}
      />
      <button className="block-btn like-btn" onClick={handleLike} disabled={!topic.trim()}>
        {status === 'sent' ? '✓' : '✦ Like'}
      </button>
    </div>
  );
}