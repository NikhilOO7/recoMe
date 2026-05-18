'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { authFetch, getToken } from '@/lib/auth';

// ── Backend shapes ──────────────────────────────────────────────────────────
interface AgentState {
  name: string;
  displayName: string;
  triggers: string[];
  enabled: boolean;
  paused: boolean;
  pausedReason: string | null;
  lastRunAt: string | null;
  lastEmittedAt: string | null;
}

interface AgentBudgetRow {
  agent: string;
  runsLast24h: number;
  spendMicrosLast24h: number;
  llmTokensLast24h: number;
}

interface BudgetResponse {
  since: string;
  dailyCapMicros: number;
  totalSpendMicros: number;
  perAgent: AgentBudgetRow[];
}

interface AgentRun {
  id: string;
  agent: string;
  trigger: string;
  status: 'started' | 'succeeded' | 'skipped' | 'capped' | 'failed';
  llmTokens: number;
  costMicros: number;
  startedAt: string;
  finishedAt: string | null;
  meta: Record<string, unknown> | null;
}

// ── Canonical roster (ADR-0012). Frontend owns the metadata; backend tells us
//    which are registered + their state. Coming-soon agents render dimmed.
interface AgentMeta {
  name: string;
  displayName: string;
  color: string;
  soft: string;
  glyph: string;
  tagline: string;
  description: string;
  trigger: string;
  comingSoon?: boolean;
}

const ROSTER: AgentMeta[] = [
  {
    name: 'concierge',
    displayName: 'Concierge',
    color: '#a78bfa',
    soft: 'rgba(167, 139, 250, 0.14)',
    glyph: 'C',
    tagline: 'Watches your active purchase trails',
    description:
      'Price-checks across retailers, surfaces alternatives matching your revealed criteria, and drafts a decision on demand. Recommends only — never transacts.',
    trigger: 'event-triggered on commerce signals',
  },
  {
    name: 'curator',
    displayName: 'Curator',
    color: '#34d399',
    soft: 'rgba(52, 211, 153, 0.14)',
    glyph: 'C',
    tagline: 'Pulls new content matching dormant + active interests',
    description:
      'RSS, YouTube uploads, Reddit, Substack, arXiv. Calls out topics you have not touched in a while, with fresh items anchored to your graph.',
    trigger: 'scheduled · 1×/day',
  },
  {
    name: 'recall',
    displayName: 'Recall',
    color: '#fbbf24',
    soft: 'rgba(245, 158, 11, 0.14)',
    glyph: 'R',
    tagline: 'Surfaces forgotten captures at the right moment',
    description:
      'The most uniquely-Recome agent. Reads your graph for older signals on a topic when a new one lands. Hard cap at 2 notifications/week.',
    trigger: 'event-triggered on capture',
  },
  {
    name: 'watchlist',
    displayName: 'Watchlist',
    color: '#fb7185',
    soft: 'rgba(251, 113, 133, 0.14)',
    glyph: 'W',
    tagline: 'Explicit watches on a topic, entity, or person',
    description:
      'User-set tracking with real-time fires on price, new mention, or sentiment shift. Phase-3 launch.',
    trigger: 'event-triggered on watch hit',
    comingSoon: true,
  },
  {
    name: 'decision',
    displayName: 'Decision',
    color: '#60a5fa',
    soft: 'rgba(96, 165, 250, 0.14)',
    glyph: 'D',
    tagline: 'On-demand: summarise a trail, call out conflicts, recommend',
    description:
      'Pulls the full trail for one decision, summarises options, calls out criteria conflicts, cites every signal. Phase-3 launch.',
    trigger: 'on-demand only',
    comingSoon: true,
  },
  {
    name: 'synthesist',
    displayName: 'Synthesist',
    color: '#94a3b8',
    soft: 'rgba(148, 163, 184, 0.14)',
    glyph: 'S',
    tagline: 'Weekly long-form report on every active intent',
    description:
      'LLM-synthesised replacement for the templated digest. Where you are on each active trail, what changed this week. Phase-3 launch.',
    trigger: 'scheduled · weekly',
    comingSoon: true,
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Math.max(0, Math.round((now - t) / 1000));
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatUsd(micros: number): string {
  const dollars = micros / 1_000_000;
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`;
  return `$${dollars.toFixed(3)}`;
}

function statusLabel(s: AgentRun['status']): { label: string; color: string } {
  switch (s) {
    case 'succeeded':
      return { label: 'emitted', color: '#34d399' };
    case 'skipped':
      return { label: 'skipped', color: '#94a3b8' };
    case 'capped':
      return { label: 'capped', color: '#fbbf24' };
    case 'failed':
      return { label: 'failed', color: '#fb7185' };
    case 'started':
      return { label: 'running', color: '#60a5fa' };
  }
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function AgentsPage() {
  const [states, setStates] = useState<Record<string, AgentState> | null>(null);
  const [budget, setBudget] = useState<BudgetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [runsByAgent, setRunsByAgent] = useState<Record<string, AgentRun[]>>({});
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  // Load list + budget on mount.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login?next=/agents';
      return;
    }
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      const [agentsRes, budgetRes] = await Promise.all([
        authFetch('/intelligence/agents'),
        authFetch('/intelligence/agents/budget'),
      ]);
      if (agentsRes.status === 404 || agentsRes.status === 501) {
        setError('Active agents are not enabled on this account.');
        setStates({});
        return;
      }
      if (!agentsRes.ok) throw new Error(`agents fetch: ${agentsRes.status}`);
      const data: { enabled: boolean; agents: AgentState[] } = await agentsRes.json();
      const map: Record<string, AgentState> = {};
      data.agents.forEach((a) => (map[a.name] = a));
      setStates(map);
      if (budgetRes.ok) {
        const b: BudgetResponse = await budgetRes.json();
        setBudget(b);
      }
    } catch (err: unknown) {
      console.error('Agents load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load agents');
      setStates({});
    }
  }, []);

  const loadRunsFor = useCallback(async (agentName: string) => {
    try {
      const res = await authFetch(`/intelligence/agents/${agentName}/runs?limit=10`);
      if (!res.ok) return;
      const data: { runs: AgentRun[] } = await res.json();
      setRunsByAgent((prev) => ({ ...prev, [agentName]: data.runs }));
    } catch (err) {
      console.warn('runs fetch failed:', err);
    }
  }, []);

  const toggleExpand = useCallback(
    (name: string) => {
      setExpandedAgent((prev) => {
        const next = prev === name ? null : name;
        if (next && !runsByAgent[name]) loadRunsFor(name);
        return next;
      });
    },
    [runsByAgent, loadRunsFor],
  );

  const togglePause = useCallback(
    async (name: string, currentlyPaused: boolean) => {
      setPendingAction(`${name}:pause`);
      try {
        const path = `/intelligence/agents/${name}/${currentlyPaused ? 'resume' : 'pause'}`;
        const res = await authFetch(path, { method: 'POST' });
        if (res.ok) await refreshAll();
      } finally {
        setPendingAction(null);
      }
    },
    [refreshAll],
  );

  const runNow = useCallback(
    async (name: string) => {
      setPendingAction(`${name}:run`);
      try {
        const res = await authFetch(`/intelligence/agents/${name}/run`, { method: 'POST' });
        if (res.ok) {
          await Promise.all([refreshAll(), loadRunsFor(name)]);
          // Auto-expand to show the new run
          setExpandedAgent(name);
        }
      } finally {
        setPendingAction(null);
      }
    },
    [refreshAll, loadRunsFor],
  );

  const budgetByAgent = useMemo(() => {
    const map: Record<string, AgentBudgetRow> = {};
    budget?.perAgent.forEach((r) => (map[r.agent] = r));
    return map;
  }, [budget]);

  const totalActive = useMemo(
    () => (states ? Object.values(states).filter((s) => s.enabled && !s.paused).length : 0),
    [states],
  );
  const totalRuns = useMemo(
    () => budget?.perAgent.reduce((s, r) => s + r.runsLast24h, 0) ?? 0,
    [budget],
  );

  return (
    <div className="max-w-6xl mx-auto px-6 pt-24 pb-16">
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">
          <span className="w-2 h-2 rounded-full bg-[#7c3aed]" />
          Agents · ADR-0012
        </div>
        <h1 className="text-3xl sm:text-4xl font-black tracking-[-1.5px] mb-2">Your agents</h1>
        <p className="text-sm text-white/50 max-w-2xl leading-relaxed">
          Six background workers on your interest graph. Each cites every signal it draws from. None
          can buy, post, send, or delete on your behalf — by design.
        </p>
      </header>

      {/* Stat strip */}
      <div className="grid sm:grid-cols-3 gap-3 mb-8">
        <StatCard
          k="Active agents"
          v={`${totalActive}`}
          d={`${ROSTER.filter((r) => !r.comingSoon).length} shipped · ${ROSTER.filter((r) => r.comingSoon).length} planned`}
        />
        <StatCard k="Runs · last 24h" v={`${totalRuns}`} d="across all your agents" />
        <BudgetMeter
          spendMicros={budget?.totalSpendMicros ?? 0}
          capMicros={budget?.dailyCapMicros ?? 100_000}
        />
      </div>

      {error && (
        <div className="bg-white/2 border border-white/6 rounded-lg p-4 text-xs text-white/55 mb-6">
          {error}
        </div>
      )}

      {/* Agent grid */}
      <div className="grid lg:grid-cols-2 gap-4">
        {ROSTER.map((meta) => {
          const state = states?.[meta.name] ?? null;
          const budgetRow = budgetByAgent[meta.name];
          const isExpanded = expandedAgent === meta.name;
          const runs = runsByAgent[meta.name] ?? null;
          return (
            <AgentCard
              key={meta.name}
              meta={meta}
              state={state}
              budgetRow={budgetRow}
              expanded={isExpanded}
              runs={runs}
              pendingAction={pendingAction}
              onToggleExpand={() => toggleExpand(meta.name)}
              onTogglePause={() => state && togglePause(meta.name, state.paused)}
              onRunNow={() => runNow(meta.name)}
            />
          );
        })}
      </div>

      {/* Trust posture */}
      <div className="mt-8 bg-white/3 border border-white/6 rounded-2xl p-6">
        <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
          <span>🛡</span> Trust + safety envelope
        </h2>
        <ul className="text-xs text-white/60 space-y-1.5 leading-relaxed">
          <li>
            ✓ No agent takes irreversible action — buy / post / send / delete stay user-driven
          </li>
          <li>✓ Every emission cites the captured signals it drew from</li>
          <li>✓ One-click pause per agent, persisted across sessions</li>
          <li>✓ Quiet hours respected for all push (default 22:00 – 08:00 local)</li>
          <li>
            ✓ Daily cost ceiling per user — currently capped at{' '}
            <b>{formatUsd(budget?.dailyCapMicros ?? 100_000)}</b>
          </li>
          <li>✓ Personality Mirror is opt-in and one-click-wipeable</li>
        </ul>
      </div>

      <div className="mt-10 text-center">
        <Link href="/inbox" className="text-xs text-white/30 hover:text-white/60 transition-colors">
          ← Back to inbox
        </Link>
      </div>
    </div>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────

function StatCard({ k, v, d }: { k: string; v: string; d: string }) {
  return (
    <div className="bg-white/3 border border-white/6 rounded-xl p-4">
      <div className="text-[11px] uppercase tracking-widest text-white/40 font-semibold mb-2">
        {k}
      </div>
      <div className="text-2xl font-black tracking-tight">{v}</div>
      <div className="text-[11px] text-white/40 mt-1">{d}</div>
    </div>
  );
}

function BudgetMeter({ spendMicros, capMicros }: { spendMicros: number; capMicros: number }) {
  const pct = capMicros > 0 ? Math.min(100, (spendMicros / capMicros) * 100) : 0;
  const color = pct < 60 ? '#34d399' : pct < 90 ? '#fbbf24' : '#fb7185';
  return (
    <div className="bg-white/3 border border-white/6 rounded-xl p-4">
      <div className="text-[11px] uppercase tracking-widest text-white/40 font-semibold mb-2">
        Spend · last 24h
      </div>
      <div className="text-2xl font-black tracking-tight">
        {formatUsd(spendMicros)}{' '}
        <span className="text-sm text-white/40 font-medium">/ {formatUsd(capMicros)}</span>
      </div>
      <div className="h-1.5 bg-white/6 rounded-full mt-3 overflow-hidden">
        <div className="h-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function AgentCard({
  meta,
  state,
  budgetRow,
  expanded,
  runs,
  pendingAction,
  onToggleExpand,
  onTogglePause,
  onRunNow,
}: {
  meta: AgentMeta;
  state: AgentState | null;
  budgetRow?: AgentBudgetRow;
  expanded: boolean;
  runs: AgentRun[] | null;
  pendingAction: string | null;
  onToggleExpand: () => void;
  onTogglePause: () => void;
  onRunNow: () => void;
}) {
  const isShipped = !meta.comingSoon && !!state;
  const isPaused = state?.paused ?? false;
  const pausing = pendingAction === `${meta.name}:pause`;
  const running = pendingAction === `${meta.name}:run`;

  return (
    <div
      className={`bg-white/3 border border-white/8 rounded-2xl p-5 transition-all ${
        meta.comingSoon ? 'opacity-60' : 'hover:bg-white/4 hover:border-white/14'
      }`}
      style={{ borderLeftColor: meta.color, borderLeftWidth: 3 }}
    >
      {/* Head */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-base text-white"
          style={{
            background: `linear-gradient(135deg, ${meta.color}, ${meta.color}cc)`,
            boxShadow: `0 4px 12px ${meta.color}40`,
          }}
        >
          {meta.glyph}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold">{meta.displayName}</h3>
          <p className="text-xs text-white/45 mt-0.5">{meta.tagline}</p>
        </div>
        <StatusPill meta={meta} state={state} />
      </div>

      <p className="text-[13px] text-white/55 leading-relaxed mb-4">{meta.description}</p>

      {/* Metrics row */}
      {isShipped && (
        <div className="grid grid-cols-3 gap-2 text-xs mb-4">
          <Metric label="Trigger" value={meta.trigger.split('·')[0]?.trim() ?? meta.trigger} />
          <Metric label="Runs · 24h" value={budgetRow ? `${budgetRow.runsLast24h}` : '—'} />
          <Metric
            label="Spend · 24h"
            value={budgetRow ? formatUsd(budgetRow.spendMicrosLast24h) : '$0'}
          />
        </div>
      )}

      {/* Last activity */}
      {isShipped && state && (state.lastRunAt || state.lastEmittedAt) && (
        <div
          className="text-[12px] text-white/55 leading-relaxed mb-4 p-3 rounded-lg"
          style={{ background: meta.soft, borderLeft: `2px solid ${meta.color}` }}
        >
          {state.lastEmittedAt ? (
            <>
              Last surfaced an event{' '}
              <b className="text-white">{relativeTime(state.lastEmittedAt)}</b>.
            </>
          ) : (
            <>
              Last run <b className="text-white">{relativeTime(state.lastRunAt)}</b> — no event
              emitted (skipped, capped, or no match).
            </>
          )}
        </div>
      )}

      {meta.comingSoon && (
        <div className="text-xs bg-white/2 border border-white/6 rounded-lg p-3 mb-4 text-white/45">
          Ships in Phase 3 (per <code className="text-white/60">ADR-0012 §2.2</code>). Wiring will
          appear here once registered.
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {isShipped && (
          <>
            <button
              disabled={running}
              onClick={onRunNow}
              className="text-xs font-semibold bg-white text-(--ink) px-3 py-1.5 rounded-md hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {running ? 'Running…' : 'Run now'}
            </button>
            <button
              disabled={pausing}
              onClick={onTogglePause}
              className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors disabled:opacity-50 cursor-pointer ${
                isPaused
                  ? 'bg-white/4 border-white/10 text-white/70 hover:bg-white/7'
                  : 'bg-transparent border-white/10 text-white/55 hover:text-white hover:border-white/20'
              }`}
            >
              {pausing ? '…' : isPaused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button
              onClick={onToggleExpand}
              className="ml-auto text-xs text-white/40 hover:text-[#5eead4] transition-colors cursor-pointer"
            >
              {expanded ? 'Hide history ↑' : 'View run history ↓'}
            </button>
          </>
        )}
      </div>

      {/* Run history drawer */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-white/6">
          <div className="text-[11px] uppercase tracking-widest text-white/40 font-semibold mb-3">
            Recent runs
          </div>
          {runs === null && <div className="text-xs text-white/30">Loading…</div>}
          {runs && runs.length === 0 && (
            <div className="text-xs text-white/40">
              No runs yet — try{' '}
              <button onClick={onRunNow} className="text-[#5eead4] hover:underline cursor-pointer">
                Run now
              </button>
              .
            </div>
          )}
          {runs && runs.length > 0 && (
            <ul className="space-y-1.5">
              {runs.map((r) => {
                const s = statusLabel(r.status);
                const reason =
                  (r.meta as { reason?: string; error?: string } | null)?.reason ??
                  (r.meta as { error?: string } | null)?.error ??
                  null;
                return (
                  <li
                    key={r.id}
                    className="flex items-start gap-3 text-xs py-1.5 border-b border-white/4 last:border-b-0"
                  >
                    <span className="text-white/35 w-14 shrink-0">{relativeTime(r.startedAt)}</span>
                    <span
                      className="text-[10px] font-bold uppercase tracking-widest shrink-0 w-16"
                      style={{ color: s.color }}
                    >
                      {s.label}
                    </span>
                    <span className="text-white/35 shrink-0 w-16">{r.trigger}</span>
                    <span className="text-white/55 flex-1 wrap-break-word">
                      {reason ?? '—'}
                      {r.costMicros > 0 && (
                        <span className="text-white/35 ml-2">· {formatUsd(r.costMicros)}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function StatusPill({ meta, state }: { meta: AgentMeta; state: AgentState | null }) {
  if (meta.comingSoon) {
    return (
      <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md bg-white/4 border border-white/8 text-white/40 shrink-0">
        Soon
      </span>
    );
  }
  if (!state) {
    return (
      <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md bg-white/4 border border-white/8 text-white/45 shrink-0">
        Off
      </span>
    );
  }
  if (state.paused) {
    return (
      <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md bg-[#fbbf24]/14 border border-[#fbbf24]/30 text-[#fbbf24] shrink-0">
        Paused
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md bg-[#34d399]/14 border border-[#34d399]/30 text-[#34d399] shrink-0 inline-flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-[#34d399]" />
      Active
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/2 border border-white/6 rounded-lg p-2">
      <div className="text-[10px] uppercase tracking-widest text-white/35 font-semibold mb-1">
        {label}
      </div>
      <div className="text-xs font-bold text-white/85 truncate">{value}</div>
    </div>
  );
}
