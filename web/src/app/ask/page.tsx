'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authFetch, getToken } from '@/lib/auth';
import { AppShell } from '@/components/AppShell';

/**
 * /ask — the interactive-demo surface from pitch-site/demos/agents-demo.html.
 *
 * Three columns of a single "speak with your agents" experience:
 *   - left  : AdvisorAgent — multi-turn chat against the Decision agent
 *   - right : ShopperAgent — Concierge watchlist with price targets
 *   - bottom: GuardianAgent — audit trail (per-agent runs over last 24h)
 *
 * No new state machinery here beyond what the cloud already exposes; this
 * page is a richer composition of:
 *   • /intelligence/agents/decision/run        (chat turn)
 *   • /intelligence/agents/concierge/watchlist (list/add/delete)
 *   • /intelligence/agents/budget              (per-agent spend strip)
 *   • /intelligence/agents/:name/runs          (audit trail rows)
 */

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

interface AgentBudget {
  agent: string;
  runsLast24h: number;
  spendMicrosLast24h: number;
  llmTokensLast24h: number;
}

interface BudgetResponse {
  since: string;
  dailyCapMicros: number;
  totalSpendMicros: number;
  perAgent: AgentBudget[];
}

interface WatchlistItem {
  id: string;
  label: string;
  targetPriceUsd?: number;
  retailers?: string[];
  pageUrl?: string;
  createdAt: string;
  lastPriceUsd?: number;
  lastPriceAt?: string;
}

interface DecisionRunResult {
  status: 'succeeded' | 'skipped' | 'capped' | 'failed' | 'started';
  emission?: { title: string; body?: string };
  reason?: string;
}

interface ChatTurn {
  role: 'user' | 'agent';
  text: string;
  pending?: boolean;
}

export default function AskPage() {
  return (
    <AppShell
      title="Talk to your agents"
      subtitle="The Advisor reads your graph. The Shopper watches prices. The Guardian shows you everything they did."
    >
      <Layout />
    </AppShell>
  );
}

function Layout() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!getToken()) {
      window.location.href = '/login?next=/ask';
      return;
    }
    setAuthed(true);
  }, []);

  if (!authed) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 mb-6">
      <AdvisorPanel />
      <ShopperPanel />
      <div className="lg:col-span-2">
        <GuardianAudit />
      </div>
    </div>
  );
}

// ── Advisor (chat) ─────────────────────────────────────────────────────────

function AdvisorPanel() {
  const [turns, setTurns] = useState<ChatTurn[]>([
    {
      role: 'agent',
      text: "I read across every platform you've captured. Ask me about a decision, a trail, or something you've been comparing. I'll cite the signals.",
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns]);

  const send = useCallback(async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput('');
    setBusy(true);
    setTurns((t) => [
      ...t,
      { role: 'user', text: q },
      { role: 'agent', text: 'Thinking…', pending: true },
    ]);

    try {
      const res = await authFetch('/intelligence/agents/decision/run?trigger=on_demand', {
        method: 'POST',
        body: JSON.stringify({
          event: {
            userQuery: q,
            topicHint: q.toLowerCase(),
            pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
          },
        }),
      });
      const body = (await res.json().catch(() => null)) as { status?: DecisionRunResult } | null;
      const status = body?.status;
      setTurns((t) => {
        const next = t.slice(0, -1);
        if (!status || (status.status !== 'succeeded' && !status.emission)) {
          next.push({
            role: 'agent',
            text:
              status?.status === 'skipped'
                ? 'Your graph is still empty. Capture a few pages and ask me again.'
                : `Couldn't run: ${status?.reason ?? status?.status ?? 'unknown'}`,
          });
        } else {
          const e = status.emission!;
          next.push({ role: 'agent', text: (e.body ?? e.title).trim() });
        }
        return next;
      });
    } catch (e) {
      setTurns((t) => {
        const next = t.slice(0, -1);
        next.push({ role: 'agent', text: `Network error: ${(e as Error).message}` });
        return next;
      });
    } finally {
      setBusy(false);
    }
  }, [input, busy]);

  return (
    <div
      className="rounded-2xl flex flex-col overflow-hidden"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        minHeight: 540,
      }}
    >
      <header
        className="flex items-center gap-3 px-5 py-4 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <span
          className="w-9 h-9 rounded-xl inline-flex items-center justify-center font-black text-base"
          style={{
            background: 'rgba(96, 165, 250, 0.16)',
            color: '#60a5fa',
            border: '1px solid rgba(96, 165, 250, 0.4)',
          }}
        >
          A
        </span>
        <div className="flex-1">
          <div className="font-bold text-[15px]" style={{ color: 'var(--ink)' }}>
            AdvisorAgent
          </div>
          <div className="text-[12px]" style={{ color: 'var(--muted)' }}>
            Powered by your interest graph · Decision agent
          </div>
        </div>
        <span
          className="text-[10px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-full"
          style={{
            color: '#10b981',
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.32)',
          }}
        >
          ● Active
        </span>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
        {turns.map((t, i) => (
          <ChatBubble key={i} turn={t} />
        ))}
      </div>

      <footer
        className="flex items-end gap-2 px-3 py-3 border-t"
        style={{ borderColor: 'var(--border)' }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder='Try: "what does my graph say about my reading habits?"'
          className="flex-1 resize-none rounded-lg px-3 py-2 text-[13.5px] outline-none"
          style={{
            background: 'var(--surface-2)',
            color: 'var(--ink)',
            border: '1px solid var(--border)',
          }}
        />
        <button
          onClick={() => void send()}
          disabled={busy || input.trim().length === 0}
          className="rounded-lg px-4 py-2 text-[13px] font-semibold transition-opacity disabled:opacity-40"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          Send →
        </button>
      </footer>
      <div className="px-5 pb-3 text-[11px]" style={{ color: 'var(--muted-2)' }}>
        Press Enter to send · Shift+Enter for newline · Decision agent never auto-acts.
      </div>
    </div>
  );
}

function ChatBubble({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className="max-w-[84%] px-3 py-2 rounded-xl text-[13.5px] leading-relaxed whitespace-pre-wrap"
        style={
          isUser
            ? { background: 'var(--accent)', color: 'var(--on-accent)', borderBottomRightRadius: 4 }
            : {
                background: 'var(--surface-2)',
                color: turn.pending ? 'var(--muted)' : 'var(--ink-2)',
                border: '1px solid var(--border)',
                borderBottomLeftRadius: 4,
                fontStyle: turn.pending ? 'italic' : 'normal',
              }
        }
      >
        {turn.text}
      </div>
    </div>
  );
}

// ── Shopper (Watchlist) ────────────────────────────────────────────────────

function ShopperPanel() {
  const [items, setItems] = useState<WatchlistItem[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [target, setTarget] = useState('');

  const load = useCallback(async () => {
    const res = await authFetch('/intelligence/agents/concierge/watchlist');
    if (res.ok) {
      const body = (await res.json()) as { items: WatchlistItem[] };
      setItems(body.items);
    } else {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = useCallback(async () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const targetPriceUsd = target ? Number(target) : undefined;
    const res = await authFetch('/intelligence/agents/concierge/watchlist', {
      method: 'POST',
      body: JSON.stringify({
        label: trimmed,
        ...(targetPriceUsd && !Number.isNaN(targetPriceUsd) ? { targetPriceUsd } : {}),
      }),
    });
    if (res.ok) {
      setLabel('');
      setTarget('');
      setAdding(false);
      void load();
    }
  }, [label, target, load]);

  const remove = useCallback(
    async (id: string) => {
      await authFetch(`/intelligence/agents/concierge/watchlist/${id}`, { method: 'DELETE' });
      void load();
    },
    [load],
  );

  return (
    <aside
      className="rounded-2xl flex flex-col overflow-hidden"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', minHeight: 540 }}
    >
      <header
        className="flex items-center gap-3 px-5 py-4 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <span
          className="w-9 h-9 rounded-xl inline-flex items-center justify-center font-black"
          style={{
            background: 'rgba(167, 139, 250, 0.18)',
            color: '#a78bfa',
            border: '1px solid rgba(167, 139, 250, 0.42)',
          }}
        >
          $
        </span>
        <div className="flex-1">
          <div className="font-bold text-[15px]" style={{ color: 'var(--ink)' }}>
            ShopperAgent
          </div>
          <div className="text-[12px]" style={{ color: 'var(--muted)' }}>
            Concierge watchlist
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {items === null && (
          <div className="text-[12px]" style={{ color: 'var(--muted)' }}>
            Loading…
          </div>
        )}
        {items?.length === 0 && (
          <div className="text-[12.5px] px-1 py-3" style={{ color: 'var(--muted)' }}>
            Nothing on your watchlist yet. Add a product to track its price across retailers.
          </div>
        )}
        {items?.map((i) => (
          <WatchlistRow key={i.id} item={i} onRemove={() => remove(i.id)} />
        ))}

        {adding && (
          <div
            className="rounded-lg p-3 flex flex-col gap-2 mt-2"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--accent-border)' }}
          >
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="What are you watching? e.g. Sony WH-1000XM6"
              className="rounded px-2 py-1.5 text-[13px] outline-none"
              style={{
                background: 'var(--surface-3)',
                color: 'var(--ink)',
                border: '1px solid var(--border)',
              }}
            />
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="Target price (USD, optional)"
              inputMode="decimal"
              className="rounded px-2 py-1.5 text-[13px] outline-none"
              style={{
                background: 'var(--surface-3)',
                color: 'var(--ink)',
                border: '1px solid var(--border)',
              }}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setAdding(false)}
                className="text-[12px] px-3 py-1.5 rounded"
                style={{ color: 'var(--muted)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => void add()}
                className="text-[12px] px-3 py-1.5 rounded font-semibold"
                style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>

      <footer className="px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="w-full rounded-lg py-2 text-[13px] font-semibold transition-colors"
            style={{
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
              border: '1px solid var(--accent-border)',
            }}
          >
            + Add to watchlist
          </button>
        )}
      </footer>
    </aside>
  );
}

function WatchlistRow({ item, onRemove }: { item: WatchlistItem; onRemove: () => void }) {
  const targetText = item.targetPriceUsd ? `Target: <$${item.targetPriceUsd}` : 'No target set';
  const lastText = item.lastPriceUsd != null ? `Last: $${item.lastPriceUsd}` : 'Watching…';
  return (
    <div
      className="rounded-lg p-3"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[13.5px] truncate" style={{ color: 'var(--ink)' }}>
            {item.label}
          </div>
          <div className="text-[11.5px] flex gap-3" style={{ color: 'var(--muted)' }}>
            <span>{targetText}</span>
            <span>·</span>
            <span>{lastText}</span>
          </div>
        </div>
        <button
          onClick={onRemove}
          className="text-[12px] opacity-60 hover:opacity-100"
          style={{ color: 'var(--muted)' }}
          title="Remove"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ── Guardian (Audit Trail) ─────────────────────────────────────────────────

function GuardianAudit() {
  const [budget, setBudget] = useState<BudgetResponse | null>(null);
  const [runsByAgent, setRunsByAgent] = useState<Record<string, AgentRun[]>>({});

  useEffect(() => {
    void (async () => {
      const b = await authFetch('/intelligence/agents/budget');
      if (b.ok) setBudget((await b.json()) as BudgetResponse);

      const names = ['decision', 'concierge', 'recall', 'curator', 'curriculum'];
      const results = await Promise.all(
        names.map((n) =>
          authFetch(`/intelligence/agents/${n}/runs?limit=8`)
            .then((r) => (r.ok ? r.json() : { runs: [] }))
            .catch(() => ({ runs: [] })),
        ),
      );
      const map: Record<string, AgentRun[]> = {};
      names.forEach((n, i) => {
        map[n] = (results[i] as { runs: AgentRun[] }).runs;
      });
      setRunsByAgent(map);
    })();
  }, []);

  const merged = useMemo(() => {
    const all: Array<{ name: string; run: AgentRun }> = [];
    for (const [name, runs] of Object.entries(runsByAgent)) {
      for (const r of runs) all.push({ name, run: r });
    }
    all.sort((a, b) => new Date(b.run.startedAt).getTime() - new Date(a.run.startedAt).getTime());
    return all.slice(0, 20);
  }, [runsByAgent]);

  return (
    <section
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <header
        className="flex items-center gap-3 px-5 py-4 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <span
          className="w-9 h-9 rounded-xl inline-flex items-center justify-center font-black"
          style={{
            background: 'rgba(94, 234, 212, 0.16)',
            color: '#5eead4',
            border: '1px solid rgba(94, 234, 212, 0.4)',
          }}
        >
          G
        </span>
        <div className="flex-1">
          <div className="font-bold text-[15px]" style={{ color: 'var(--ink)' }}>
            GuardianAgent — audit trail
          </div>
          <div className="text-[12px]" style={{ color: 'var(--muted)' }}>
            Every agent run is logged. Cost-cap enforced at{' '}
            <span style={{ color: 'var(--accent)' }}>
              {budget ? formatUsd(budget.dailyCapMicros) : '$0.10'}
            </span>{' '}
            / day.
          </div>
        </div>
        {budget && (
          <div className="text-right">
            <div
              className="text-[10px] uppercase tracking-widest font-bold"
              style={{ color: 'var(--muted-2)' }}
            >
              Spend · 24h
            </div>
            <div className="font-mono text-[15px] font-bold" style={{ color: 'var(--ink)' }}>
              {formatUsd(budget.totalSpendMicros)}
            </div>
          </div>
        )}
      </header>

      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 px-5 py-3"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        {(budget?.perAgent ?? []).map((b) => (
          <div
            key={b.agent}
            className="px-3 py-2 rounded-lg"
            style={{ background: 'var(--surface-2)' }}
          >
            <div
              className="text-[10px] uppercase font-bold tracking-widest"
              style={{ color: 'var(--muted-2)' }}
            >
              {b.agent}
            </div>
            <div className="text-[14px] font-bold mt-1" style={{ color: 'var(--ink)' }}>
              {b.runsLast24h}{' '}
              <span className="text-[11px] font-normal" style={{ color: 'var(--muted)' }}>
                runs
              </span>
            </div>
            <div className="text-[11px] font-mono mt-0.5" style={{ color: 'var(--muted)' }}>
              {formatUsd(b.spendMicrosLast24h)}
            </div>
          </div>
        ))}
        {(!budget || budget.perAgent.length === 0) && (
          <div
            className="col-span-full text-[12px] text-center py-3"
            style={{ color: 'var(--muted)' }}
          >
            No agent runs in the last 24 hours.
          </div>
        )}
      </div>

      <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {merged.length === 0 && (
          <li className="px-5 py-6 text-[12.5px] text-center" style={{ color: 'var(--muted)' }}>
            No runs to show yet.
          </li>
        )}
        {merged.map(({ name, run }) => {
          const s = statusLabel(run.status);
          return (
            <li key={run.id} className="px-5 py-3 flex items-center gap-3 text-[13px]">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: s.color, boxShadow: `0 0 0 3px ${s.color}22` }}
              />
              <span className="font-mono text-[11.5px]" style={{ color: 'var(--muted-2)' }}>
                {new Date(run.startedAt).toLocaleTimeString()}
              </span>
              <span className="font-semibold" style={{ color: 'var(--ink)' }}>
                {name}
              </span>
              <span
                className="text-[11px] uppercase font-semibold tracking-wider"
                style={{ color: s.color }}
              >
                {s.label}
              </span>
              <span style={{ color: 'var(--muted)' }}>·</span>
              <span style={{ color: 'var(--muted)' }}>via {run.trigger}</span>
              {run.costMicros > 0 && (
                <>
                  <span style={{ color: 'var(--muted)' }}>·</span>
                  <span className="font-mono text-[12px]" style={{ color: 'var(--muted)' }}>
                    {formatUsd(run.costMicros)}
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
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
