'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/extension', label: 'Extension', dot: '#2356e8', active: true },
  { href: '/sdk', label: 'SDK', dot: '#d97706', active: false },
  { href: '/agents', label: 'Agents', dot: '#7c3aed', active: false },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-[var(--ink)]/80 border-b border-white/[0.08]">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-6">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Reco<span className="text-[#5eead4]">Me</span>
        </Link>

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

        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm font-medium text-white/60 hover:text-white transition-colors"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="text-sm font-semibold bg-white text-[var(--ink)] px-4 py-2 rounded-lg hover:bg-white/90 transition-colors"
          >
            Get Started
          </Link>
        </div>
      </div>
    </nav>
  );
}
