/**
 * Recome service worker — v2 (WS-9 M-1 + P4.3 push handler).
 *
 * Responsibilities:
 *   1. PWA installability — manifest + SW + https. App-shell precache for
 *      offline-friendly first paint.
 *   2. Stale-while-revalidate for same-origin GETs. API calls and any
 *      cross-origin request go straight to the network.
 *   3. PWA push (P4.3) — listens for `push` events from the VAPID-signed
 *      server send, renders a notification, opens the actionUrl on click.
 *
 * Web Share Target is handled entirely by manifest.webmanifest →
 * GET /paste?url=…&title=…&text=… — no SW intercept needed there.
 *
 * Bump CACHE_VERSION when the app shell or this file change so old
 * clients pick up the new SW on next page load.
 */

const CACHE_VERSION = 'recome-v2';
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

// ── Push (P4.3) ─────────────────────────────────────────────────────────────
// The server (cloud/src/notifications/PushService.ts) encrypts a JSON
// payload with the subscription's keys; the browser hands us the decoded
// body via event.data. We render a single notification per event — the
// dedupe window on AgentEventStore already prevents repeats.

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // Fall through with empty payload; the catch-all title below kicks in.
  }

  const title = payload.title || 'Recome';
  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.eventId || payload.url || undefined,
    // Renotify=false collapses repeats with the same tag — a re-deliver of
    // the same eventId won't buzz the user a second time.
    renotify: false,
    data: {
      url: payload.url || '/inbox',
      eventId: payload.eventId || null,
      agent: payload.agent || null,
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/inbox';

  // Reuse an existing tab if one is on the same origin — opening a fresh tab
  // for every click would explode the user's tab strip.
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windows) => {
        for (const w of windows) {
          if (new URL(w.url).origin === self.location.origin) {
            w.focus();
            return w.navigate(target);
          }
        }
        return self.clients.openWindow(target);
      }),
  );
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
