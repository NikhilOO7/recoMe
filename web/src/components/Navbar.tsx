'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

// Three primary surfaces, ordered the way ADR-0013 frames the product:
// consumer first (recome.app), then the dual-side IaaS, then agents.
// Dots map to the typed-graph palette used across docs + landing.
const NAV_ITEMS = [
  { href: '/mind', label: 'Mind Map', dot: '#5eead4', active: true },
  { href: '/agents', label: 'Agents', dot: '#fb7185', active: true },
  { href: '/sdk', label: 'Developers', dot: '#fbbf24', active: false },
];

export function Navbar() {
  const pathname = usePathname();
  const [loggedIn, setLoggedIn] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('recome_token');
    setLoggedIn(!!token);
  }, [pathname]);

  function handleLogout() {
    localStorage.removeItem('recome_token');
    localStorage.removeItem('recome_refresh');
    setLoggedIn(false);
    window.location.href = '/';
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-[var(--ink)]/80 border-b border-white/[0.08]">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-6">
        {/* Logo */}
        <Link href="/" className="text-lg font-bold tracking-tight flex-shrink-0">
          Reco<span className="text-[#5eead4]">Me</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-5 ml-6">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                pathname === item.href ? 'text-white' : 'text-white/50 hover:text-white/80'
              }`}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: item.dot }} />
              {item.label}
              {!item.active && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/40 font-semibold">
                  Soon
                </span>
              )}
            </Link>
          ))}
        </div>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-3">
          {loggedIn ? (
            <>
              <Link
                href="/dashboard"
                className={`hidden sm:block text-sm font-medium transition-colors ${
                  pathname === '/dashboard' ? 'text-white' : 'text-white/60 hover:text-white'
                }`}
              >
                Dashboard
              </Link>
              <button
                onClick={handleLogout}
                className="text-sm font-medium text-white/40 hover:text-white/70 transition-colors cursor-pointer"
              >
                Sign out
              </button>
            </>
          ) : (
            // Hide auth buttons when already on login/signup pages
            pathname !== '/login' &&
            pathname !== '/signup' && (
              <>
                <Link
                  href="/login"
                  className="hidden sm:block text-sm font-medium text-white/60 hover:text-white transition-colors"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="text-sm font-semibold bg-white text-[var(--ink)] px-4 py-2 rounded-lg hover:bg-white/90 transition-colors"
                >
                  Get Started
                </Link>
              </>
            )
          )}

          {/* Mobile hamburger */}
          <button
            className="sm:hidden flex flex-col gap-1 p-1.5 cursor-pointer"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            <span
              className={`w-5 h-0.5 bg-white/60 transition-all ${mobileOpen ? 'rotate-45 translate-y-1.5' : ''}`}
            />
            <span
              className={`w-5 h-0.5 bg-white/60 transition-all ${mobileOpen ? 'opacity-0' : ''}`}
            />
            <span
              className={`w-5 h-0.5 bg-white/60 transition-all ${mobileOpen ? '-rotate-45 -translate-y-1.5' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="sm:hidden border-t border-white/[0.08] bg-[var(--ink)]/95 backdrop-blur-md px-6 py-4 flex flex-col gap-3">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-2 text-sm font-medium py-1.5 ${
                pathname === item.href ? 'text-white' : 'text-white/50'
              }`}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: item.dot }} />
              {item.label}
              {!item.active && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/40 font-semibold">
                  Soon
                </span>
              )}
            </Link>
          ))}
          {loggedIn && (
            <Link
              href="/dashboard"
              onClick={() => setMobileOpen(false)}
              className="text-sm font-medium text-white/60 py-1.5"
            >
              Dashboard
            </Link>
          )}
          <div className="border-t border-white/[0.08] pt-3 mt-1 flex gap-3">
            {loggedIn ? (
              <button onClick={handleLogout} className="text-sm text-white/40 cursor-pointer">
                Sign out
              </button>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="text-sm text-white/60"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setMobileOpen(false)}
                  className="text-sm text-[#5eead4] font-semibold"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
