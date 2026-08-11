'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { SocialLoginButtons } from '@/components/SocialLoginButtons';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Extract params from URL
  const params =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
  const returnTo = params.get('return') ?? undefined;
  const extId = params.get('ext_id') ?? undefined;

  useEffect(() => {
    // Re-read params inside useEffect to ensure we have the real URL (not SSR)
    const currentParams = new URLSearchParams(window.location.search);

    // Handle OAuth callback — tokens arrive as URL params from the API redirect
    const token = currentParams.get('token');
    const refresh = currentParams.get('refresh');
    if (token) {
      localStorage.setItem('recome_token', token);
      if (refresh) localStorage.setItem('recome_refresh', refresh);
      // Clean URL and redirect
      window.history.replaceState({}, '', '/login');
      window.location.href = '/dashboard';
      return;
    }

    // Auto-redirect if already logged in
    const existing = localStorage.getItem('recome_token');
    const returnTo = currentParams.get('return');
    const extIdParam = currentParams.get('ext_id');
    // Extension ids are exactly 32 chars of a–p; anything else (including the
    // literal string "undefined" from a broken caller) must never be
    // navigated to — chrome-extension://<garbage> renders as ://invalid/.
    const validExtId = extIdParam && /^[a-p]{32}$/.test(extIdParam);
    if (existing && returnTo === 'extension' && validExtId) {
      // Already signed in + arriving from the extension: hand the existing
      // session straight to the extension callback — no re-login. Without
      // this branch the user sat at a login form they were already past.
      const refresh = localStorage.getItem('recome_refresh') ?? '';
      window.location.href = `chrome-extension://${extIdParam}/callback.html?token=${encodeURIComponent(existing)}&refresh=${encodeURIComponent(refresh)}`;
      return;
    }
    if (existing && !returnTo) {
      window.location.href = '/dashboard';
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'https://recome-api.fly.dev'}/auth/login`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }

      // Store the session in the web app either way, then hand off to the
      // extension only when the id is well-formed (32 chars of a–p).
      localStorage.setItem('recome_token', data.accessToken);
      localStorage.setItem('recome_refresh', data.refreshToken);
      if (returnTo === 'extension' && extId && /^[a-p]{32}$/.test(extId)) {
        window.location.href = `chrome-extension://${extId}/callback.html?token=${encodeURIComponent(data.accessToken)}&refresh=${encodeURIComponent(data.refreshToken)}`;
      } else {
        window.location.href = '/dashboard';
      }
    } catch {
      setError('Connection failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="min-h-screen flex items-center justify-center px-6 pt-16">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold tracking-tight">
            Reco<span className="text-[#5eead4]">Me</span>
          </Link>
          <h1 className="text-xl font-bold mt-4 mb-1">Welcome back</h1>
          <p className="text-sm text-white/50">Sign in to your account</p>
        </div>

        {/* Social Login */}
        <SocialLoginButtons returnTo={returnTo} extId={extId} />

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-white/[0.08]" />
          <span className="text-xs text-white/30 font-medium">or</span>
          <div className="flex-1 h-px bg-white/[0.08]" />
        </div>

        {/* Email/Password */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-white/[0.06] border border-white/[0.12] text-sm text-white placeholder:text-white/30 outline-none focus:border-[#5eead4]/50 transition-colors"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-white/[0.06] border border-white/[0.12] text-sm text-white placeholder:text-white/30 outline-none focus:border-[#5eead4]/50 transition-colors"
            required
          />

          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white/[0.08] border border-white/[0.12] text-white py-3 rounded-lg font-bold text-sm hover:bg-white/[0.12] transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'Signing in...' : 'Sign in with email'}
          </button>
        </form>

        <p className="text-center text-sm text-white/40 mt-6">
          Don&apos;t have an account?{' '}
          <Link
            href={`/signup${extId ? `?return=extension&ext_id=${extId}` : ''}`}
            className="text-[#5eead4] font-medium hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </section>
  );
}
