/**
 * Recome service worker — v1 (WS-9 M-1).
 *
 * Minimum viable SW: lets Chrome / Edge / Brave / Arc count us as a PWA
 * (manifest + SW + https = installable). Caches the app shell so first
 * paint after install is offline-friendly. Web Share Target is handled
 * entirely by manifest.webmanifest → GET /paste?url=…&title=…&text=… —
 * no SW intercept needed for that.
 *
 * Phase 4 (WS-10) will extend this file with the `push` + `notificationclick`
 * handlers for AgentEvent push notifications. Bump CACHE_VERSION when that
 * lands so old clients refetch.
 */

const CACHE_VERSION = 'recome-v1';
const APP_SHELL = ['/', '/paste', '/manifest.webmanifest', '/icon-192.png'];

self.addEventListener('install', (event) => {
  // Precache the app shell on first visit. Failures (e.g. offline install
  // edge cases) don't block activation — we degrade to network-only.
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Sweep old cache versions on upgrade.
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // API calls and authenticated routes always go to the network — we
  // don't want stale signals or stale agent events under any circumstance.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // cross-origin (cloud API)
  if (url.pathname.startsWith('/api/')) return;

  // Stale-while-revalidate for the rest. Serve from cache, refresh in bg.
  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          // Only cache successful, basic-origin GETs.
          if (res.ok && res.type === 'basic') cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
