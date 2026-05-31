'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { authFetch, getToken } from '@/lib/auth';
import { AppShell } from '@/components/AppShell';
import {
  currentPushStatus,
  subscribeToPush,
  unsubscribeFromPush,
  type PushStatus,
} from '@/lib/push';

// ── Types mirror cloud/src/agents/types.ts + AgentEventStore.listForUser shape ─
type AgentEventKind =
  | 'recall'
  | 'deal_drop'
  | 'new_alternative'
  | 'fresh_content'
  | 'decision_nudge'
  | 'weekly_summary';

interface AgentEventSource {
  kind: 'signal' | 'topic' | 'page' | 'entity';
  id: string;
  label?: string;
  url?: string;
}

interface AgentEvent {
  id: string;
  agent: string;
  kind: AgentEventKind;
  title: string;
  body: string | null;
  actionUrl: string | null;
  sources: AgentEventSource[];
  seenAt: string | null;
  feedback: 'useful' | 'not_useful' | null;
  feedbackAt: string | null;
  createdAt: string;
}

// Agent identity. Each entry references CSS tokens so the same code
// drives both themes — colors come from globals.css (light + dark).
const AGENTS: Record<string, { color: string; soft: string; label: string }> = {
  recall: { color: 'var(--recall)', soft: 'var(--recall-soft)', label: 'Recall' },
  concierge: { color: 'var(--concierge)', soft: 'var(--concierge-soft)', label: 'Concierge' },
  curator: { color: 'var(--curator)', soft: 'var(--curator-soft)', label: 'Curator' },
  watchlist: { color: 'var(--watchlist)', soft: 'var(--watchlist-soft)', label: 'Watchlist' },
  decision: { color: 'var(--decision)', soft: 'var(--decision-soft)', label: 'Decision' },
  synthesist: { color: 'var(--synthesist)', soft: 'var(--synthesist-soft)', label: 'Synthesist' },
};

function agentTheme(agent: string) {
  return (
    AGENTS[agent.toLowerCase()] ?? {
      color: 'var(--accent)',
      soft: 'var(--accent-soft)',
      label: agent,
    }
  );
}

// Platform inference. Identity colors (theme-independent) per
// globals.css :root block; the chip background uses var(--surface-3)
// so contrast holds in both themes.
const PLATFORM_RULES: { host: RegExp; name: string; color: string }[] = [
  { host: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/, name: 'YouTube', color: 'var(--youtube)' },
  { host: /(^|\.)reddit\.com$/, name: 'Reddit', color: 'var(--reddit)' },
  { host: /(^|\.)amazon\./, name: 'Amazon', color: 'var(--amazon)' },
  { host: /(^|\.)substack\.com$|\.substack\./, name: 'Substack', color: 'var(--substack)' },
  { host: /(^|\.)theverge\.com$/, name: 'The Verge', color: 'var(--verge)' },
  { host: /(^|\.)news\.ycombinator\.com$/, name: 'Hacker News', color: 'var(--hn)' },
  { host: /(^|\.)arxiv\.org$/, name: 'arXiv', color: 'var(--arxiv)' },
  { host: /(^|\.)x\.com$|(^|\.)twitter\.com$/, name: 'X', color: 'var(--x)' },
  { host: /(^|\.)wayfair\.com$/, name: 'Wayfair', color: 'var(--wayfair)' },
];

function inferPlatform(url?: string): { name: string; color: string } | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    const hit = PLATFORM_RULES.find((r) => r.host.test(host));
    if (hit) return { name: hit.name, color: hit.color };
    return { name: host.replace(/^www\./, ''), color: 'var(--muted)' };
  } catch {
    return null;
  }
}

function relativeTime(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, Math.round((now - t) / 1000));
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

type FilterKey = 'all' | string;

export default function InboxPage() {
  const [events, setEvents] = useState<AgentEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [optimisticSeen, setOptimisticSeen] = useState<Record<string, true>>({});
  const [optimisticFeedback, setOptimisticFeedback] = useState<
    Record<string, 'useful' | 'not_useful'>
  >({});

  useEffect(() => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login?next=/inbox';
      return;
    }
    authFetch('/intelligence/inbox?limit=50')
      .then(async (res) => {
        if (res.status === 404 || res.status === 501) {
          setError('Active agents are not enabled yet for your account.');
          setEvents([]);
          return;
        }
        if (!res.ok) throw new Error(`Inbox fetch failed: ${res.status}`);
        const data = await res.json();
        setEvents(Array.isArray(data.events) ? data.events : []);
      })
      .catch((err: Error) => {
        console.error('Inbox load error:', err);
        setError(err.message || 'Could not load your inbox.');
        setEvents([]);
      });
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    (events ?? []).forEach((e) => {
      c.all++;
      const key = e.agent.toLowerCase();
      c[key] = (c[key] ?? 0) + 1;
    });
    return c;
  }, [events]);

  const visible = useMemo(() => {
    if (!events) return [];
    if (filter === 'all') return events;
    return events.filter((e) => e.agent.toLowerCase() === filter);
  }, [events, filter]);

  // Live-strip copy. Derived from which agents have produced events
  // recently — falls back to a static "warming up" message if empty.
  // Real backend signal will replace this in P2 (per ADR-0012 §2.5).
  const liveAgents = useMemo(() => {
    if (!events) return [];
    const recent = events.slice(0, 6);
    const set = new Set<string>();
    recent.forEach((e) => set.add(e.agent));
    return Array.from(set).slice(0, 2);
  }, [events]);

  const markSeen = useCallback((id: string) => {
    setOptimisticSeen((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
    authFetch(`/intelligence/agents/inbox/${id}/seen`, { method: 'POST' }).catch((err: Error) =>
      console.warn('mark-seen failed:', err.message),
    );
  }, []);

  const sendFeedback = useCallback((id: string, feedback: 'useful' | 'not_useful') => {
    setOptimisticFeedback((prev) => ({ ...prev, [id]: feedback }));
    authFetch(`/intelligence/agents/inbox/${id}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback }),
    }).catch((err: Error) => console.warn('feedback failed:', err.message));
  }, []);

  const total30d = events?.length ?? 0;
  const activeTrails = new Set(
    (events ?? []).flatMap((e) => e.sources.filter((s) => s.kind === 'topic').map((s) => s.id)),
  ).size;

  return (
    <AppShell
      title="Inbox"
      subtitle="Things your agents brought you. Sorted by when they need you, not when they fired."
      actions={
        <div className="flex items-center gap-2">
          <PushToggle />
          <button
            type="button"
            className="text-[12.5px] font-semibold px-3 py-1.5 rounded-md hover:opacity-80 transition-opacity"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              color: 'var(--ink-2)',
            }}
          >
            Mark all read
          </button>
        </div>
      }
      preface={<LiveStrip liveAgents={liveAgents} />}
    >
      {/* Stat strip — demo recome-app.html lines 756-777 */}
      <StatStrip total={total30d} trails={activeTrails} />

      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap mb-5 mt-6">
        <FilterChip
          on={filter === 'all'}
          onClick={() => setFilter('all')}
          label="All"
          count={counts.all}
        />
        {Object.keys(AGENTS).map((key) => {
          const n = counts[key] ?? 0;
          if (n === 0) return null;
          const t = AGENTS[key];
          return (
            <FilterChip
              key={key}
              on={filter === key}
              onClick={() => setFilter(key)}
              label={t.label}
              count={n}
              color={t.color}
            />
          );
        })}
        <div className="ml-auto text-[11.5px]" style={{ color: 'var(--muted-2)' }}>
          {events === null ? 'Loading…' : `${visible.length} of ${events.length}`}
        </div>
      </div>

      {events === null && (
        <div className="space-y-3">
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      )}

      {events !== null && events.length === 0 && <EmptyState error={error} />}

      {events !== null && events.length > 0 && visible.length === 0 && (
        <div
          className="rounded-2xl p-8 text-center text-sm"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
          }}
        >
          No <strong style={{ color: 'var(--ink)' }}>{filter}</strong> events yet. Try{' '}
          <button
            onClick={() => setFilter('all')}
            className="hover:underline cursor-pointer"
            style={{ color: 'var(--accent)' }}
          >
            all agents
          </button>
          .
        </div>
      )}

      <div className="flex flex-col gap-3">
        {visible.map((evt) => {
          const t = agentTheme(evt.agent);
          const isExpanded = !!expanded[evt.id];
          const isSeen = !!evt.seenAt || !!optimisticSeen[evt.id];
          const fb = optimisticFeedback[evt.id] ?? evt.feedback;

          return (
            <article
              key={evt.id}
              className="rounded-2xl p-5 transition-colors"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderLeft: `3px solid ${t.color}`,
              }}
              onMouseEnter={() => !isSeen && markSeen(evt.id)}
            >
              {/* Card header */}
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-md"
                  style={{
                    background: t.soft,
                    color: t.color,
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: t.color }} />
                  {t.label}
                </span>
                <span
                  className="text-[11px] uppercase tracking-widest"
                  style={{ color: 'var(--muted-2)' }}
                >
                  · {evt.kind.replace(/_/g, ' ')}
                </span>
                {!isSeen && (
                  <span
                    className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
                    style={{
                      background: 'var(--accent-soft)',
                      color: 'var(--accent)',
                    }}
                  >
                    new
                  </span>
                )}
                <span className="ml-auto text-[12px]" style={{ color: 'var(--muted-2)' }}>
                  {relativeTime(evt.createdAt)}
                </span>
              </div>

              <h2
                className="text-[17px] font-semibold leading-snug mb-1.5"
                style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}
              >
                {evt.title}
              </h2>
              {evt.body && (
                <p
                  className="text-[14px] leading-relaxed mb-3 whitespace-pre-wrap"
                  style={{ color: 'var(--ink-2)' }}
                >
                  {evt.body}
                </p>
              )}

              {evt.sources && evt.sources.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  {evt.sources.slice(0, 4).map((s, i) => (
                    <SourceChip key={`${s.id}-${i}`} source={s} />
                  ))}
                  {evt.sources.length > 4 && (
                    <span className="text-[11px]" style={{ color: 'var(--muted-2)' }}>
                      +{evt.sources.length - 4} more
                    </span>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap pt-1">
                {evt.actionUrl && (
                  <a
                    href={evt.actionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[12.5px] font-semibold px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity"
                    style={{
                      background: 'var(--accent)',
                      color: 'var(--on-accent)',
                    }}
                  >
                    Open
                    <span aria-hidden>→</span>
                  </a>
                )}
                <PillButton
                  active={fb === 'useful'}
                  disabled={!!fb}
                  onClick={() => !fb && sendFeedback(evt.id, 'useful')}
                  ariaLabel="Mark useful"
                >
                  Useful
                </PillButton>
                <PillButton
                  active={fb === 'not_useful'}
                  disabled={!!fb}
                  onClick={() => !fb && sendFeedback(evt.id, 'not_useful')}
                  ariaLabel="Mark not useful"
                >
                  Not relevant
                </PillButton>
                <button
                  onClick={() => setExpanded((p) => ({ ...p, [evt.id]: !p[evt.id] }))}
                  className="ml-auto text-[12px] hover:underline transition-colors cursor-pointer"
                  style={{ color: 'var(--muted)' }}
                >
                  {isExpanded ? 'Hide reasoning' : 'Why am I seeing this?'}
                </button>
              </div>

              {isExpanded && (
                <div
                  className="mt-4 pt-4 text-[12.5px] leading-relaxed"
                  style={{ borderTop: '1px solid var(--border)', color: 'var(--ink-2)' }}
                >
                  <div className="font-semibold mb-2" style={{ color: 'var(--ink)' }}>
                    Grounded in {evt.sources.length} signal
                    {evt.sources.length === 1 ? '' : 's'} from your graph
                  </div>
                  <ul className="space-y-1.5">
                    {evt.sources.map((s, i) => (
                      <li key={`${s.id}-detail-${i}`} className="flex items-start gap-2">
                        <span
                          className="shrink-0 w-14 capitalize"
                          style={{ color: 'var(--muted-2)' }}
                        >
                          {s.kind}
                        </span>
                        <span className="break-all">
                          {s.url ? (
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline"
                              style={{ color: 'var(--accent)' }}
                            >
                              {s.label ?? s.url}
                            </a>
                          ) : (
                            (s.label ?? s.id)
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[11px]" style={{ color: 'var(--muted-2)' }}>
                    Every agent emission cites the captured signals it drew from (ADR-0012 §5).{' '}
                    <Link
                      href="/audit-log"
                      className="hover:underline"
                      style={{ color: 'var(--accent)' }}
                    >
                      Audit log →
                    </Link>
                  </p>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </AppShell>
  );
}

// ── Subcomponents ───────────────────────────────────────────────────────────

function PushToggle() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void currentPushStatus().then(setStatus);
  }, []);

  if (!status || !status.supported) return null;

  const onClick = async () => {
    setErr(null);
    setPending(true);
    try {
      if (status.subscribed) {
        await unsubscribeFromPush();
      } else {
        const res = await subscribeToPush();
        if (!res.ok) {
          // permission_denied is the user saying no, not a real error — be
          // gentle. Other reasons (e.g. VAPID unavailable, http_503) are
          // worth surfacing so the founder can debug.
          if (res.reason === 'permission_denied') setErr('Notifications were blocked.');
          else if (res.reason === 'vapid_key_unavailable')
            setErr('Push isn’t configured server-side.');
          else setErr(res.reason);
        }
      }
      setStatus(await currentPushStatus());
    } finally {
      setPending(false);
    }
  };

  const label = pending
    ? 'Working…'
    : status.subscribed
      ? 'Notifications on'
      : 'Turn on notifications';

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="text-[12.5px] font-semibold px-3 py-1.5 rounded-md hover:opacity-80 transition-opacity"
        style={{
          background: status.subscribed ? 'var(--accent-soft)' : 'var(--surface-2)',
          border: `1px solid ${status.subscribed ? 'var(--accent-border)' : 'var(--border)'}`,
          color: status.subscribed ? 'var(--accent)' : 'var(--ink-2)',
          cursor: pending ? 'wait' : 'pointer',
        }}
      >
        {label}
      </button>
      {err && (
        <span className="text-[10.5px]" style={{ color: 'var(--muted-2)' }}>
          {err}
        </span>
      )}
    </div>
  );
}

function LiveStrip({ liveAgents }: { liveAgents: string[] }) {
  if (liveAgents.length === 0) return null;
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4 py-3"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
      }}
    >
      <span
        className="w-2 h-2 rounded-full pulse-dot shrink-0"
        style={{ background: 'var(--success)' }}
      />
      <div className="flex-1 min-w-0 text-[13px] leading-snug" style={{ color: 'var(--ink-2)' }}>
        {liveAgents.map((a, i) => (
          <span key={a}>
            {i > 0 && <span style={{ color: 'var(--muted-2)' }}> · </span>}
            <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{a}</span>{' '}
            <span style={{ color: 'var(--muted)' }}>working your graph</span>
          </span>
        ))}
      </div>
      <span className="text-[12px] shrink-0" style={{ color: 'var(--muted-2)' }}>
        within today&rsquo;s budget
      </span>
    </div>
  );
}

function StatStrip({ total, trails }: { total: number; trails: number }) {
  const stats = [
    {
      label: 'Surfaced this week',
      value: total.toString(),
      delta: total > 0 ? `${total} in inbox` : 'awaiting first signal',
    },
    {
      label: 'Active research trails',
      value: trails.toString(),
      delta: trails > 2 ? `${trails} live` : 'building',
    },
    { label: 'Signals captured (30d)', value: '—', delta: 'wired to /intelligence/stats next' },
    { label: "Today's agent budget", value: '$0.00', delta: 'of $0.10 cap' },
  ];
  return (
    <div
      className="grid gap-3 mt-4"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
    >
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-xl p-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div
            className="text-[11px] uppercase tracking-[0.06em]"
            style={{ color: 'var(--muted-2)' }}
          >
            {s.label}
          </div>
          <div
            className="text-[22px] font-bold mt-1"
            style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
          >
            {s.value}
          </div>
          <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--muted)' }}>
            {s.delta}
          </div>
        </div>
      ))}
    </div>
  );
}

function FilterChip({
  on,
  onClick,
  label,
  count,
  color,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  count: number;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-full transition-colors cursor-pointer"
      style={{
        background: on ? 'var(--accent)' : 'var(--surface)',
        color: on ? 'var(--on-accent)' : 'var(--ink-2)',
        border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
      }}
    >
      {color && <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />}
      {label}
      <span
        className="text-[10px] font-bold tabular-nums"
        style={{ color: on ? 'var(--on-accent)' : 'var(--muted-2)', opacity: on ? 0.7 : 1 }}
      >
        {count}
      </span>
    </button>
  );
}

function SourceChip({ source }: { source: AgentEventSource }) {
  const platform = inferPlatform(source.url);
  const label = source.label ?? platform?.name ?? source.kind;
  const content = (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] rounded-md px-2 py-1"
      style={{
        background: 'var(--surface-3)',
        border: '1px solid var(--border)',
        color: 'var(--ink-2)',
      }}
    >
      {platform ? (
        <span className="w-2 h-2 rounded-sm" style={{ background: platform.color }} />
      ) : (
        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted-2)' }}>
          {source.kind}
        </span>
      )}
      <span className="truncate max-w-50">{label}</span>
    </span>
  );
  if (source.url) {
    return (
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:opacity-80 rounded-md transition-opacity"
      >
        {content}
      </a>
    );
  }
  return content;
}

function PillButton({
  active,
  disabled,
  onClick,
  ariaLabel,
  children,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className="text-[12px] font-medium px-2.5 py-1.5 rounded-md transition-colors"
      style={{
        background: active ? 'var(--accent-soft)' : 'var(--surface-2)',
        color: active ? 'var(--accent)' : disabled ? 'var(--muted-2)' : 'var(--ink-2)',
        border: `1px solid ${active ? 'var(--accent-border)' : 'var(--border)'}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function Skeleton() {
  return (
    <div
      className="rounded-2xl p-5 animate-pulse"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="h-5 w-20 rounded-md" style={{ background: 'var(--surface-3)' }} />
        <div className="h-3 w-16 rounded-md" style={{ background: 'var(--surface-3)' }} />
        <div className="ml-auto h-3 w-12 rounded-md" style={{ background: 'var(--surface-3)' }} />
      </div>
      <div className="h-5 w-2/3 rounded mb-2" style={{ background: 'var(--surface-3)' }} />
      <div className="h-3 w-full rounded mb-1.5" style={{ background: 'var(--surface-3)' }} />
      <div className="h-3 w-3/4 rounded" style={{ background: 'var(--surface-3)' }} />
    </div>
  );
}

function EmptyState({ error }: { error: string | null }) {
  return (
    <div
      className="rounded-2xl p-10 text-center"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <h2 className="text-base font-semibold mb-2" style={{ color: 'var(--ink)' }}>
        {error ? 'Inbox unavailable' : 'Your agents are warming up'}
      </h2>
      <p
        className="text-sm max-w-md mx-auto leading-relaxed mb-4"
        style={{ color: 'var(--muted)' }}
      >
        {error ??
          'Recall surfaces forgotten captures when you re-engage a dormant topic — it fires automatically as you browse. Concierge and Curator come online with the next release.'}
      </p>
      {!error && (
        <div className="flex gap-3 justify-center flex-wrap">
          <Link
            href="/paste"
            className="text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            Capture a link →
          </Link>
          <Link
            href="/dashboard"
            className="text-xs font-medium px-4 py-2 hover:opacity-80 transition-opacity"
            style={{ color: 'var(--muted)' }}
          >
            Back to dashboard
          </Link>
        </div>
      )}
    </div>
  );
}
