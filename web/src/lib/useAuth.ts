'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { getToken } from './auth';

// Auth state as an external store — the token lives in localStorage, so
// reading it during render via useSyncExternalStore is the correct shape:
// no setState-in-effect, a stable logged-out server snapshot, and cross-tab
// changes arrive through the storage event.

function subscribe(cb: () => void) {
  window.addEventListener('storage', cb);
  return () => window.removeEventListener('storage', cb);
}

export function useAuthed(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !!getToken(),
    () => false,
  );
}

/**
 * Client-side auth gate: redirects to login (preserving the return path)
 * when no session exists. Render nothing while `false`.
 */
export function useAuthGate(next: string): boolean {
  const authed = useAuthed();
  useEffect(() => {
    if (!authed) {
      window.location.assign(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [authed, next]);
  return authed;
}
