'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';

// Public marketing nav. Links go to PUBLIC pages only — authed surfaces
// (mind map, inbox, agents) live behind AppShell and are reached via
// Dashboard after sign-in. Everything is token-driven: the nav paints
// var(--bg) glass, never a hardcoded white (the old bg-[var(--ink)]/80
// bug rendered a white band over the dark hero).
const NAV_ITEMS = [
  { href: '/how-it-works', label: 'How it works' },
  { href: '/#agents', label: 'Agents' },
  { href: '/extension', label: 'Extension' },
  { href: '/sdk', label: 'Developers' },
];

// Auth state via useSyncExternalStore: re-read on every render (pathname
// changes re-render the nav), cross-tab changes arrive via the storage
// event, and the server snapshot is a stable logged-out default.
function subscribeToStorage(cb: () => void) {
  window.addEventListener('storage', cb);
  return () => window.removeEventListener('storage', cb);
}

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const loggedIn = useSyncExternalStore(
    subscribeToStorage,
    () => !!localStorage.getItem('recome_token'),
    () => false,
  );

  function handleLogout() {
    localStorage.removeItem('recome_token');
    localStorage.removeItem('recome_refresh');
    window.location.href = '/';
  }

  const linkCls = (href: string) =>
    `text-sm font-medium transition-colors ${
      pathname === href ? 'text-[var(--ink)]' : 'text-[var(--muted)] hover:text-[var(--ink)]'
    }`;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-[var(--bg)]/75 border-b border-[var(--border)]">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-8">
        {/* Logo */}
        <Link href="/" className="text-lg font-bold tracking-tight flex-shrink-0 text-[var(--ink)]">
          Reco<span className="text-[var(--accent)]">Me</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className={linkCls(item.href)}>
              {item.label}
            </Link>
          ))}
        </div>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-4">
          {loggedIn ? (
            <>
              <Link href="/dashboard" className={`hidden sm:block ${linkCls('/dashboard')}`}>
                Dashboard
              </Link>
              <button
                onClick={handleLogout}
                className="text-sm font-medium text-[var(--muted-2)] hover:text-[var(--muted)] transition-colors cursor-pointer"
              >
                Sign out
              </button>
            </>
          ) : (
            pathname !== '/login' &&
            pathname !== '/signup' && (
              <>
                <Link
                  href="/login"
                  className="hidden sm:block text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
                >
                  Log in
                </Link>
                <Link href="/signup" className="btn btn-primary !px-4 !py-2 !text-sm !rounded-lg">
                  Start free
                </Link>
              </>
            )
          )}

          {/* Mobile hamburger */}
          <button
            className="md:hidden flex flex-col gap-1 p-1.5 cursor-pointer"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
          >
            <span
              className={`w-5 h-0.5 bg-[var(--muted)] transition-all ${mobileOpen ? 'rotate-45 translate-y-1.5' : ''}`}
            />
            <span
              className={`w-5 h-0.5 bg-[var(--muted)] transition-all ${mobileOpen ? 'opacity-0' : ''}`}
            />
            <span
              className={`w-5 h-0.5 bg-[var(--muted)] transition-all ${mobileOpen ? '-rotate-45 -translate-y-1.5' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-md px-6 py-4 flex flex-col gap-3">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className="text-sm font-medium py-1.5 text-[var(--muted)]"
            >
              {item.label}
            </Link>
          ))}
          {loggedIn && (
            <Link
              href="/dashboard"
              onClick={() => setMobileOpen(false)}
              className="text-sm font-medium text-[var(--muted)] py-1.5"
            >
              Dashboard
            </Link>
          )}
          <div className="border-t border-[var(--border)] pt-3 mt-1 flex gap-4">
            {loggedIn ? (
              <button
                onClick={handleLogout}
                className="text-sm text-[var(--muted-2)] cursor-pointer"
              >
                Sign out
              </button>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="text-sm text-[var(--muted)]"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setMobileOpen(false)}
                  className="text-sm text-[var(--accent)] font-semibold"
                >
                  Start free
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
