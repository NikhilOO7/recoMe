'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { authFetch, getToken } from '@/lib/auth';
import { AppShell } from '@/components/AppShell';

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
    name: 'decision',
    displayName: 'Decision',
    color: '#60a5fa',
    soft: 'rgba(96, 165, 250, 0.14)',
    glyph: 'D',
    tagline: 'On-demand: summarise a trail, call out conflicts, recommend',
    description:
      'Pulls the full trail for one decision, summarises options, calls out criteria conflicts, cites every signal. Invoked from the in-page "Ask Decision" panel and the /ask Advisor chat.',
    trigger: 'on-demand only',
  },
  {
    name: 'curriculum',
    displayName: 'Curriculum',
    color: '#fb7185',
    soft: 'rgba(251, 113, 133, 0.14)',
    glyph: 'L',
    tagline: '"I want to learn X" — bridges from what you already know',
    description:
      'Reads your graph, finds the closest anchor topics, and produces a four-week reading plan that bridges from familiar ground to the target. Surfaces from Udemy / Coursera / edX overlays.',
    trigger: 'on-demand from learning platforms',
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
    <AppShell
      title="Agents"
      subtitle="Six background workers on your graph. They cite every signal. None can transact for you."
    >
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
        <div
          className="rounded-lg p-4 text-xs mb-6"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
          }}
        >
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
      <div
        className="mt-8 rounded-2xl p-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <h2
          className="text-[11px] font-bold uppercase tracking-[0.18em] mb-3"
          style={{ color: 'var(--muted-2)' }}
        >
          Trust + safety envelope (binding)
        </h2>
        <ul
          className="text-[13px] space-y-1.5 leading-relaxed pl-5 list-disc"
          style={{ color: 'var(--ink-2)' }}
        >
          <li>No agent takes irreversible action — buy / post / send / delete stay user-driven</li>
          <li>Every emission cites the captured signals it drew from</li>
          <li>One-click pause per agent, persisted across sessions</li>
          <li>Quiet hours respected for all push (default 22:00 – 08:00 local)</li>
          <li>
            Daily cost ceiling per user — currently capped at{' '}
            <b style={{ color: 'var(--ink)' }}>{formatUsd(budget?.dailyCapMicros ?? 100_000)}</b>
          </li>
          <li>Attention Mirror is opt-in and one-click-wipeable</li>
        </ul>
      </div>
    </AppShell>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────

function StatCard({ k, v, d }: { k: string; v: string; d: string }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div
        className="text-[11px] uppercase tracking-widest font-semibold mb-2"
        style={{ color: 'var(--muted-2)' }}
      >
        {k}
      </div>
      <div className="text-2xl font-black tracking-tight" style={{ color: 'var(--ink)' }}>
        {v}
      </div>
      <div className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>
        {d}
      </div>
    </div>
  );
}

function BudgetMeter({ spendMicros, capMicros }: { spendMicros: number; capMicros: number }) {
  const pct = capMicros > 0 ? Math.min(100, (spendMicros / capMicros) * 100) : 0;
  // Threshold colors are theme-independent (success → warn → danger semantic).
  const color = pct < 60 ? 'var(--success)' : pct < 90 ? 'var(--warn)' : 'var(--danger)';
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div
        className="text-[11px] uppercase tracking-widest font-semibold mb-2"
        style={{ color: 'var(--muted-2)' }}
      >
        Spend · last 24h
      </div>
      <div className="text-2xl font-black tracking-tight" style={{ color: 'var(--ink)' }}>
        {formatUsd(spendMicros)}{' '}
        <span className="text-sm font-medium" style={{ color: 'var(--muted-2)' }}>
          / {formatUsd(capMicros)}
        </span>
      </div>
      <div
        className="h-1.5 rounded-full mt-3 overflow-hidden"
        style={{ background: 'var(--surface-3)' }}
      >
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
      className="rounded-2xl p-5 transition-all"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${meta.color}`,
        opacity: meta.comingSoon ? 0.65 : 1,
      }}
    >
      {/* Head */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-base"
          style={{
            background: `linear-gradient(135deg, ${meta.color}, ${meta.color}cc)`,
            boxShadow: `0 4px 12px ${meta.color}40`,
            color: '#ffffff',
          }}
        >
          {meta.glyph}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
            {meta.displayName}
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted-2)' }}>
            {meta.tagline}
          </p>
        </div>
        <StatusPill meta={meta} state={state} />
      </div>

      <p className="text-[13px] leading-relaxed mb-4" style={{ color: 'var(--ink-2)' }}>
        {meta.description}
      </p>

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
          className="text-[12px] leading-relaxed mb-4 p-3 rounded-lg"
          style={{
            background: meta.soft,
            borderLeft: `2px solid ${meta.color}`,
            color: 'var(--ink-2)',
          }}
        >
          {state.lastEmittedAt ? (
            <>
              Last surfaced an event{' '}
              <b style={{ color: 'var(--ink)' }}>{relativeTime(state.lastEmittedAt)}</b>.
            </>
          ) : (
            <>
              Last run <b style={{ color: 'var(--ink)' }}>{relativeTime(state.lastRunAt)}</b> — no
              event emitted (skipped, capped, or no match).
            </>
          )}
        </div>
      )}

      {meta.comingSoon && (
        <div
          className="text-xs rounded-lg p-3 mb-4"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
          }}
        >
          Ships in Phase 3 (per <code style={{ color: 'var(--ink-2)' }}>ADR-0012 §2.2</code>).
          Wiring will appear here once registered.
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {isShipped && (
          <>
            <button
              disabled={running}
              onClick={onRunNow}
              className="text-xs font-semibold px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
            >
              {running ? 'Running…' : 'Run now'}
            </button>
            <button
              disabled={pausing}
              onClick={onTogglePause}
              className="text-xs font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 cursor-pointer hover:opacity-90"
              style={{
                background: isPaused ? 'var(--surface-2)' : 'transparent',
                border: '1px solid var(--border)',
                color: isPaused ? 'var(--ink-2)' : 'var(--muted)',
              }}
            >
              {pausing ? '…' : isPaused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button
              onClick={onToggleExpand}
              className="ml-auto text-xs transition-colors cursor-pointer hover:underline"
              style={{ color: 'var(--muted)' }}
            >
              {expanded ? 'Hide history ↑' : 'View run history ↓'}
            </button>
          </>
        )}
      </div>

      {/* Run history drawer */}
      {expanded && (
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <div
            className="text-[11px] uppercase tracking-widest font-semibold mb-3"
            style={{ color: 'var(--muted-2)' }}
          >
            Recent runs
          </div>
          {runs === null && (
            <div className="text-xs" style={{ color: 'var(--muted-2)' }}>
              Loading…
            </div>
          )}
          {runs && runs.length === 0 && (
            <div className="text-xs" style={{ color: 'var(--muted)' }}>
              No runs yet — try{' '}
              <button
                onClick={onRunNow}
                className="hover:underline cursor-pointer"
                style={{ color: 'var(--accent)' }}
              >
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
                    className="flex items-start gap-3 text-xs py-1.5"
                    style={{ borderBottom: '1px solid var(--border)' }}
                  >
                    <span className="w-14 shrink-0" style={{ color: 'var(--muted-2)' }}>
                      {relativeTime(r.startedAt)}
                    </span>
                    <span
                      className="text-[10px] font-bold uppercase tracking-widest shrink-0 w-16"
                      style={{ color: s.color }}
                    >
                      {s.label}
                    </span>
                    <span className="shrink-0 w-16" style={{ color: 'var(--muted-2)' }}>
                      {r.trigger}
                    </span>
                    <span className="flex-1 wrap-break-word" style={{ color: 'var(--ink-2)' }}>
                      {reason ?? '—'}
                      {r.costMicros > 0 && (
                        <span className="ml-2" style={{ color: 'var(--muted-2)' }}>
                          · {formatUsd(r.costMicros)}
                        </span>
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
  // Off / Soon use neutral surface tokens so they read in both themes.
  // Paused / Active use the semantic warn/success colors with a soft
  // background derived from the same hue.
  if (meta.comingSoon) {
    return (
      <span
        className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md shrink-0"
        style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          color: 'var(--muted-2)',
        }}
      >
        Soon
      </span>
    );
  }
  if (!state) {
    return (
      <span
        className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md shrink-0"
        style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          color: 'var(--muted-2)',
        }}
      >
        Off
      </span>
    );
  }
  if (state.paused) {
    return (
      <span
        className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md shrink-0"
        style={{
          background: 'rgba(245, 158, 11, 0.14)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          color: 'var(--warn)',
        }}
      >
        Paused
      </span>
    );
  }
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md shrink-0 inline-flex items-center gap-1.5"
      style={{
        background: 'rgba(16, 185, 129, 0.12)',
        border: '1px solid rgba(16, 185, 129, 0.3)',
        color: 'var(--success)',
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--success)' }} />
      Active
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg p-2"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
    >
      <div
        className="text-[10px] uppercase tracking-widest font-semibold mb-1"
        style={{ color: 'var(--muted-2)' }}
      >
        {label}
      </div>
      <div className="text-xs font-bold truncate" style={{ color: 'var(--ink)' }}>
        {value}
      </div>
    </div>
  );
}
