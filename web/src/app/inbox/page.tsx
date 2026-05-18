'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { authFetch, getToken } from '@/lib/auth';

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

// ── Agent visual identity. Matches the prototype palette (ADR-0012 §2.2). ────
const AGENT_THEME: Record<string, { color: string; soft: string; ring: string; label: string }> = {
  recall: {
    color: '#f59e0b',
    soft: 'rgba(245, 158, 11, 0.12)',
    ring: 'rgba(245, 158, 11, 0.35)',
    label: 'Recall',
  },
  concierge: {
    color: '#a78bfa',
    soft: 'rgba(167, 139, 250, 0.14)',
    ring: 'rgba(167, 139, 250, 0.35)',
    label: 'Concierge',
  },
  curator: {
    color: '#34d399',
    soft: 'rgba(52, 211, 153, 0.12)',
    ring: 'rgba(52, 211, 153, 0.35)',
    label: 'Curator',
  },
  watchlist: {
    color: '#fb7185',
    soft: 'rgba(251, 113, 133, 0.12)',
    ring: 'rgba(251, 113, 133, 0.35)',
    label: 'Watchlist',
  },
  decision: {
    color: '#60a5fa',
    soft: 'rgba(96, 165, 250, 0.14)',
    ring: 'rgba(96, 165, 250, 0.35)',
    label: 'Decision',
  },
  synthesist: {
    color: '#94a3b8',
    soft: 'rgba(148, 163, 184, 0.14)',
    ring: 'rgba(148, 163, 184, 0.35)',
    label: 'Synthesist',
  },
};

const DEFAULT_THEME = {
  color: '#5eead4',
  soft: 'rgba(94, 234, 212, 0.14)',
  ring: 'rgba(94, 234, 212, 0.35)',
  label: 'Agent',
};

function themeFor(agent: string) {
  return AGENT_THEME[agent.toLowerCase()] ?? { ...DEFAULT_THEME, label: agent };
}

// ── Platform inference from URL — keeps source chips legible. ────────────────
const PLATFORM_RULES: { host: RegExp; name: string; dot: string }[] = [
  { host: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/, name: 'YouTube', dot: '#ff0033' },
  { host: /(^|\.)reddit\.com$/, name: 'Reddit', dot: '#ff4500' },
  { host: /(^|\.)amazon\./, name: 'Amazon', dot: '#ff9900' },
  { host: /(^|\.)walmart\.com$/, name: 'Walmart', dot: '#0a66c2' },
  { host: /(^|\.)ebay\./, name: 'eBay', dot: '#e53238' },
  { host: /(^|\.)substack\.com$|\.substack\./, name: 'Substack', dot: '#ff6719' },
  { host: /(^|\.)theverge\.com$/, name: 'The Verge', dot: '#ff195a' },
  { host: /(^|\.)news\.ycombinator\.com$/, name: 'Hacker News', dot: '#ff6600' },
  { host: /(^|\.)arxiv\.org$/, name: 'arXiv', dot: '#b31b1b' },
  { host: /(^|\.)x\.com$|(^|\.)twitter\.com$/, name: 'X', dot: '#ffffff' },
  { host: /(^|\.)wayfair\.com$/, name: 'Wayfair', dot: '#5a31f4' },
  { host: /(^|\.)martin\.kleppmann\.com$/, name: 'Kleppmann', dot: '#9ca3af' },
];

function inferPlatform(url?: string): { name: string; dot: string } | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    const hit = PLATFORM_RULES.find((r) => r.host.test(host));
    if (hit) return { name: hit.name, dot: hit.dot };
    return { name: host.replace(/^www\./, ''), dot: '#5eead4' };
  } catch {
    return null;
  }
}

// ── Relative-time formatter. Stays small + deterministic; no Intl runtime hit. ─
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

// ── Filter keys: 'all' + each agent name lowercased. Derived from events. ───
type FilterKey = 'all' | string;

export default function InboxPage() {
  const [events, setEvents] = useState<AgentEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Optimistic flags so feedback / mark-seen feel instant without a refetch.
  const [optimisticSeen, setOptimisticSeen] = useState<Record<string, true>>({});
  const [optimisticFeedback, setOptimisticFeedback] = useState<
    Record<string, 'useful' | 'not_useful'>
  >({});

  // Load once on mount + redirect to /login if no token (matches dashboard).
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

  // Filter chips reflect the agents that actually produced events for this user.
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

  return (
    <div className="max-w-5xl mx-auto px-6 pt-24 pb-16">
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">
          <span className="w-2 h-2 rounded-full bg-[#5eead4]" />
          Inbox · agent surface
        </div>
        <h1 className="text-3xl sm:text-4xl font-black tracking-[-1.5px] mb-2">
          Things your agents brought you
        </h1>
        <p className="text-sm text-white/50 max-w-xl leading-relaxed">
          Six background agents work your interest graph. They surface — they never transact. You
          decide what to act on.
        </p>
      </header>

      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        <FilterChip
          on={filter === 'all'}
          onClick={() => setFilter('all')}
          label="All"
          count={counts.all}
        />
        {Object.keys(AGENT_THEME).map((key) => {
          const n = counts[key] ?? 0;
          if (n === 0) return null;
          const t = AGENT_THEME[key];
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
        <div className="ml-auto text-xs text-white/30">
          {events === null ? 'Loading…' : `${visible.length} of ${events.length}`}
        </div>
      </div>

      {/* States */}
      {events === null && (
        <div className="space-y-3">
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      )}

      {events !== null && events.length === 0 && <EmptyState error={error} />}

      {events !== null && events.length > 0 && visible.length === 0 && (
        <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center text-sm text-white/50">
          No <strong className="text-white/80">{filter}</strong> events yet. Try{' '}
          <button
            onClick={() => setFilter('all')}
            className="text-[#5eead4] hover:underline cursor-pointer"
          >
            all agents
          </button>
          .
        </div>
      )}

      {/* Event list */}
      <div className="flex flex-col gap-3">
        {visible.map((evt) => {
          const t = themeFor(evt.agent);
          const isExpanded = !!expanded[evt.id];
          const isSeen = !!evt.seenAt || !!optimisticSeen[evt.id];
          const fb = optimisticFeedback[evt.id] ?? evt.feedback;

          return (
            <article
              key={evt.id}
              className="group bg-white/3 border border-white/8 rounded-2xl p-5 hover:bg-white/4 hover:border-white/14 transition-colors"
              style={{ borderLeftColor: t.color, borderLeftWidth: 3 }}
              onMouseEnter={() => !isSeen && markSeen(evt.id)}
            >
              {/* Card header */}
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-md"
                  style={{
                    background: t.soft,
                    color: t.color,
                    boxShadow: `inset 0 0 0 1px ${t.ring}`,
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: t.color }} />
                  {t.label}
                </span>
                <span className="text-[11px] text-white/30 uppercase tracking-widest">
                  {evt.kind.replace(/_/g, ' ')}
                </span>
                {!isSeen && (
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-[#5eead4] bg-[#5eead4]/10 px-1.5 py-0.5 rounded">
                    new
                  </span>
                )}
                <span className="ml-auto text-xs text-white/35">{relativeTime(evt.createdAt)}</span>
              </div>

              {/* Title + body */}
              <h2 className="text-base sm:text-[17px] font-bold leading-snug mb-1.5 tracking-[-0.01em]">
                {evt.title}
              </h2>
              {evt.body && (
                <p className="text-sm text-white/65 leading-relaxed mb-3 whitespace-pre-wrap">
                  {evt.body}
                </p>
              )}

              {/* Sources */}
              {evt.sources && evt.sources.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  {evt.sources.slice(0, 4).map((s, i) => (
                    <SourceChip key={`${s.id}-${i}`} source={s} />
                  ))}
                  {evt.sources.length > 4 && (
                    <span className="text-[11px] text-white/30">
                      +{evt.sources.length - 4} more
                    </span>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                {evt.actionUrl && (
                  <a
                    href={evt.actionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold bg-white text-(--ink) px-3 py-1.5 rounded-md hover:bg-white/90 transition-colors"
                  >
                    Open
                    <span aria-hidden>→</span>
                  </a>
                )}
                <FeedbackButton
                  active={fb === 'useful'}
                  disabled={!!fb}
                  onClick={() => !fb && sendFeedback(evt.id, 'useful')}
                  ariaLabel="Mark useful"
                >
                  👍 Useful
                </FeedbackButton>
                <FeedbackButton
                  active={fb === 'not_useful'}
                  disabled={!!fb}
                  onClick={() => !fb && sendFeedback(evt.id, 'not_useful')}
                  ariaLabel="Mark not useful"
                >
                  👎 Not relevant
                </FeedbackButton>
                <button
                  onClick={() => setExpanded((p) => ({ ...p, [evt.id]: !p[evt.id] }))}
                  className="ml-auto text-xs text-white/40 hover:text-[#5eead4] transition-colors cursor-pointer"
                >
                  {isExpanded ? 'Hide reasoning' : 'Why am I seeing this?'}
                  <span aria-hidden> {isExpanded ? '↑' : '↓'}</span>
                </button>
              </div>

              {/* Reasoning drawer */}
              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-white/6 text-xs text-white/55 leading-relaxed">
                  <div className="font-semibold text-white/70 mb-2">
                    Grounded in {evt.sources.length} signal
                    {evt.sources.length === 1 ? '' : 's'} from your graph
                  </div>
                  <ul className="space-y-1.5">
                    {evt.sources.map((s, i) => (
                      <li key={`${s.id}-detail-${i}`} className="flex items-start gap-2">
                        <span className="text-white/30 shrink-0 w-14 capitalize">{s.kind}</span>
                        <span className="text-white/65 break-all">
                          {s.url ? (
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-[#5eead4] underline decoration-white/20 underline-offset-2"
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
                  <p className="mt-3 text-[11px] text-white/35">
                    Every agent emission cites the captured signals it drew from (ADR-0012 §5).{' '}
                    <Link href="/privacy" className="text-[#5eead4] hover:underline">
                      Audit log →
                    </Link>
                  </p>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* Footer link */}
      <div className="mt-10 text-center">
        <Link
          href="/dashboard"
          className="text-xs text-white/30 hover:text-white/60 transition-colors"
        >
          ← Back to dashboard
        </Link>
      </div>
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────────────────

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
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
        on
          ? 'bg-white text-(--ink) border-white'
          : 'bg-white/4 border-white/10 text-white/65 hover:bg-white/8 hover:text-white'
      }`}
    >
      {color && <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />}
      {label}
      <span
        className={`text-[10px] font-bold tabular-nums ${on ? 'text-(--ink)/50' : 'text-white/35'}`}
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
    <span className="inline-flex items-center gap-1.5 text-[11px] bg-white/4 border border-white/8 rounded-md px-2 py-1 text-white/70">
      {platform ? (
        <span className="w-2 h-2 rounded-sm" style={{ background: platform.dot }} />
      ) : (
        <span className="text-white/40 text-[10px] uppercase tracking-wider">{source.kind}</span>
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
        className="hover:bg-white/7 hover:border-white/16 rounded-md transition-colors"
      >
        {content}
      </a>
    );
  }
  return content;
}

function FeedbackButton({
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
      className={`text-xs font-medium px-2.5 py-1.5 rounded-md border transition-colors ${
        active
          ? 'bg-[#5eead4]/15 border-[#5eead4]/35 text-[#5eead4]'
          : disabled
            ? 'border-white/6 text-white/25 cursor-not-allowed'
            : 'bg-white/3 border-white/8 text-white/55 hover:bg-white/7 hover:text-white cursor-pointer'
      }`}
    >
      {children}
    </button>
  );
}

function Skeleton() {
  return (
    <div className="bg-white/2 border border-white/6 rounded-2xl p-5 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-5 w-20 bg-white/6 rounded-md" />
        <div className="h-3 w-16 bg-white/4 rounded-md" />
        <div className="ml-auto h-3 w-12 bg-white/4 rounded-md" />
      </div>
      <div className="h-5 w-2/3 bg-white/6 rounded mb-2" />
      <div className="h-3 w-full bg-white/4 rounded mb-1.5" />
      <div className="h-3 w-3/4 bg-white/4 rounded" />
    </div>
  );
}

function EmptyState({ error }: { error: string | null }) {
  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl p-10 text-center">
      <div className="text-3xl mb-3">📥</div>
      <h2 className="text-base font-bold mb-2">
        {error ? 'Inbox unavailable' : 'Your agents are warming up'}
      </h2>
      <p className="text-sm text-white/50 max-w-md mx-auto leading-relaxed mb-4">
        {error ??
          'Recall surfaces forgotten captures when you re-engage a dormant topic — it fires automatically as you browse. Concierge and Curator come online with the next release.'}
      </p>
      {!error && (
        <div className="flex gap-3 justify-center flex-wrap">
          <Link
            href="/paste"
            className="text-xs font-semibold bg-white text-(--ink) px-4 py-2 rounded-lg hover:bg-white/90 transition-colors"
          >
            Capture a link →
          </Link>
          <Link
            href="/dashboard"
            className="text-xs font-medium text-white/60 hover:text-white px-4 py-2 transition-colors"
          >
            Back to dashboard
          </Link>
        </div>
      )}
    </div>
  );
}
