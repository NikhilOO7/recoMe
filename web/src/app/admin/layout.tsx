'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://recome-api.fly.dev';

const ADMIN_NAV = [
  { href: '/admin', label: 'Dashboard', icon: '📊' },
  { href: '/admin/users', label: 'Users', icon: '👥' },
  { href: '/admin/flags', label: 'Feature Flags', icon: '🚩' },
  { href: '/admin/deployments', label: 'Deployments', icon: '🚀' },
  { href: '/admin/config', label: 'App Config', icon: '⚙️' },
  { href: '/admin/errors', label: 'Error Logs', icon: '🐛' },
  { href: '/admin/audit', label: 'Audit Log', icon: '📋' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('recome_token');
    if (!token) {
      router.replace('/login');
      return;
    }

    // Verify admin access by hitting admin stats endpoint
    fetch(`${API_URL}/admin/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 403) {
          alert('Access denied. Admin role required.');
          router.replace('/dashboard');
        } else if (res.status === 401) {
          router.replace('/login');
        } else if (res.ok) {
          setAuthorized(true);
        }
      })
      .catch(() => router.replace('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-14">
        <div className="text-white/40 text-sm">Verifying admin access...</div>
      </div>
    );
  }

  if (!authorized) return null;

  return (
    <div className="flex min-h-screen pt-14">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-white/[0.08] bg-white/[0.02] px-3 py-6 hidden md:block">
        <div className="text-[10px] font-bold uppercase tracking-widest text-white/20 px-3 mb-4">
          Admin Panel
        </div>
        <nav className="flex flex-col gap-1">
          {ADMIN_NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-white/[0.08] text-white'
                    : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--ink)] border-t border-white/[0.08] px-2 py-2 flex gap-1 overflow-x-auto">
        {ADMIN_NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg text-[10px] flex-shrink-0 ${
                active ? 'bg-white/[0.08] text-white' : 'text-white/30'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label.split(' ')[0]}</span>
            </Link>
          );
        })}
      </div>

      {/* Main content */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto pb-24 md:pb-8">{children}</main>
    </div>
  );
}
