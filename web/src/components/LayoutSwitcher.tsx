'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Navbar } from './Navbar';
import { Footer } from './Footer';

// Routes that render their own chrome (the AppShell sidebar). The
// LayoutSwitcher hides Navbar+Footer on these so the AppShell is the
// only chrome the user sees.
//
// Auth pages also opt out of marketing chrome — they should feel
// like a focused funnel, not a marketing page.
const APP_PREFIXES = [
  '/inbox',
  '/mind',
  '/agents',
  '/paste',
  '/personality',
  '/dashboard',
  '/settings',
  '/audit-log',
  '/admin',
];

const AUTH_PREFIXES = ['/login', '/signup'];

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function LayoutSwitcher({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/';

  if (matches(pathname, APP_PREFIXES)) {
    // App routes wrap themselves in AppShell (so each can supply its
    // own title/subtitle/actions). Render just the children.
    return <>{children}</>;
  }

  if (matches(pathname, AUTH_PREFIXES)) {
    return <main className="min-h-screen flex flex-col">{children}</main>;
  }

  return (
    <>
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
