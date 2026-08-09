'use client';

import { useEffect } from 'react';

/**
 * Registers /sw.js once on mount in the browser. Pulled into its own
 * client component so the root layout can stay a server component.
 *
 * The SW handles installability + app-shell cache (see web/public/sw.js).
 * Phase 4 WS-10 will extend the SW with push notification handlers — bump
 * sw.js CACHE_VERSION when that lands so this registration replaces the
 * old worker on next visit.
 *
 * Guarded so:
 *   - dev (localhost over http) and prod both work
 *   - SSR doesn't try to touch navigator
 *   - duplicate registrations are no-ops (browsers handle this, but the
 *     `if (navigator.serviceWorker.controller)` early-return saves a noisy
 *     console line on every soft-nav)
 */
export function RegisterServiceWorker(): null {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (navigator.serviceWorker.controller) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
      // Swallow in prod; surface in dev for debugging.
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[sw] register failed:', err);
      }
    });
  }, []);
  return null;
}
