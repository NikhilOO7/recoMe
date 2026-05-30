'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { authFetch, getToken } from '@/lib/auth';
import { ThemeToggle } from './ThemeToggle';

// ── Nav model — mirrors docs/demo/recome-app.html sidebar ────────
// Primary = day-to-day product surfaces (Phase 2 agents work here).
// Secondary = capture + control. Tertiary = settings + dev.
const PRIMARY = [
  { href: '/ask', label: 'Ask', dot: 'var(--decision)' },
  { href: '/inbox', label: 'Inbox', dot: 'var(--accent)' },
  { href: '/mind', label: 'Mind Map', dot: 'var(--concierge)' },
  { href: '/dashboard', label: 'Trails', dot: 'var(--curator)' },
];

const SECONDARY = [
  { href: '/paste', label: 'Capture', dot: 'var(--recall)' },
  { href: '/agents', label: 'Agents', dot: 'var(--watchlist)' },
  { href: '/personality', label: 'Attention Mirror', dot: 'var(--decision)' },
];

const TERTIARY = [
  { href: '/settings', label: 'Settings' },
  { href: '/sdk', label: 'Developers · /v1' },
  { href: '/audit-log', label: 'Audit Log' },
];

interface AppShellProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  // Optional content rendered above `children` and below the page head —
  // used for the live agent strip on the Inbox.
  preface?: ReactNode;
}

export function AppShell({ children, title, subtitle, actions, preface }: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authed, setAuthed] = useState<boolean>(false);

  useEffect(() => {
    setAuthed(!!getToken());
  }, [pathname]);

  return (
    <div
      className="grid min-h-screen"
      style={{
        gridTemplateColumns: 'minmax(0, 232px) 1fr',
        background: 'var(--bg)',
        color: 'var(--ink)',
      }}
    >
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside
        className={`sticky top-0 h-screen flex-col p-4 overflow-y-auto ${mobileOpen ? 'flex' : 'hidden md:flex'}`}
        style={{
          background: 'var(--surface-2)',
          borderRight: '1px solid var(--border)',
        }}
      >
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 px-2 pt-1 pb-4">
          <span
            className="grid place-items-center text-[13px] font-bold rounded-[7px]"
            style={{
              width: 28,
              height: 28,
              background: 'linear-gradient(135deg, var(--accent) 0%, var(--concierge) 100%)',
              color: 'var(--on-accent)',
              letterSpacing: '-0.02em',
            }}
          >
            R
          </span>
          <span
            className="text-[15px] font-semibold tracking-tight"
            style={{ color: 'var(--ink)' }}
          >
            Reco<span style={{ color: 'var(--accent)' }}>.</span>me
          </span>
        </Link>

        <NavGroup
          label="Today"
          items={PRIMARY}
          pathname={pathname}
          onNavigate={() => setMobileOpen(false)}
        />
        <NavGroup
          label="Surfaces"
          items={SECONDARY}
          pathname={pathname}
          onNavigate={() => setMobileOpen(false)}
        />
        <NavGroup
          label="Control"
          items={TERTIARY}
          pathname={pathname}
          onNavigate={() => setMobileOpen(false)}
        />

        {/* Sidebar footer */}
        <div className="mt-auto pt-4">
          <div
            className="rounded-lg p-3 text-[12px]"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--muted)',
            }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full pulse-dot"
                style={{ background: 'var(--success)' }}
              />
              <span className="font-semibold" style={{ color: 'var(--ink-2)' }}>
                Agents on
              </span>
            </div>
            <p className="leading-snug">
              Within today&rsquo;s $0.10 budget. Pause any agent from{' '}
              <Link href="/agents" style={{ color: 'var(--accent)' }} className="hover:underline">
                Agents
              </Link>
              .
            </p>
          </div>
        </div>
      </aside>

      {/* ── Main column ────────────────────────────────────────── */}
      <div className="flex flex-col min-w-0">
        {/* Topbar */}
        <header
          className="sticky top-0 z-20 flex items-center gap-3 px-5 py-3"
          style={{
            background: 'color-mix(in srgb, var(--bg) 85%, transparent)',
            borderBottom: '1px solid var(--border)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          {/* Mobile hamburger */}
          <button
            className="md:hidden flex flex-col gap-1 p-2 cursor-pointer rounded-md hover:opacity-70"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle navigation"
            style={{ color: 'var(--ink-2)' }}
          >
            <span style={{ background: 'currentColor' }} className="w-4 h-0.5" />
            <span style={{ background: 'currentColor' }} className="w-4 h-0.5" />
            <span style={{ background: 'currentColor' }} className="w-4 h-0.5" />
          </button>

          <div className="flex-1 min-w-0">
            <div
              className="text-[15px] font-semibold tracking-tight truncate"
              style={{ color: 'var(--ink)' }}
            >
              {title}
            </div>
            {subtitle && (
              <div className="text-[12.5px] truncate" style={{ color: 'var(--muted)' }}>
                {subtitle}
              </div>
            )}
          </div>

          {actions}
          <ThemeToggle size="sm" variant="pill" />
          {!authed && (
            <Link
              href="/login"
              className="text-[12.5px] font-semibold px-3 py-1.5 rounded-md"
              style={{
                background: 'var(--accent)',
                color: 'var(--on-accent)',
              }}
            >
              Sign in
            </Link>
          )}
        </header>

        {preface && <div className="px-5 pt-4">{preface}</div>}

        <main className="flex-1 px-5 py-6 min-w-0">{children}</main>
      </div>
    </div>
  );
}

// ─── Sidebar nav group ───────────────────────────────────────────
function NavGroup({
  label,
  items,
  pathname,
  onNavigate,
}: {
  label: string;
  items: Array<{ href: string; label: string; dot?: string }>;
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <div className="mt-3 first:mt-0">
      <div
        className="text-[11px] font-semibold uppercase tracking-[0.04em] px-2 py-1.5"
        style={{ color: 'var(--muted-2)' }}
      >
        {label}
      </div>
      <div className="flex flex-col gap-0.5">
        {items.map((it) => {
          const active = pathname === it.href;
          return (
            <Link
              key={it.href}
              href={it.href}
              onClick={onNavigate}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13.5px] font-medium transition-colors"
              style={{
                background: active ? 'var(--surface)' : 'transparent',
                color: active ? 'var(--ink)' : 'var(--ink-2)',
                boxShadow: active ? '0 0 0 1px var(--border), 0 1px 2px rgba(0,0,0,0.04)' : 'none',
              }}
            >
              {it.dot && (
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: it.dot }}
                />
              )}
              <span className="truncate">{it.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// Convenience helper for components inside AppShell that need to call
// the cloud API but don't want to re-import authFetch directly.
export { authFetch };
