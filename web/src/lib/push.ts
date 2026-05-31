/**
 * Web Push (P4.3) — client helpers.
 *
 * Three operations:
 *   - currentSubscription() : peek at the SW's existing subscription (if any)
 *   - subscribeToPush()     : request permission, subscribe, POST to /notifications/push/subscribe
 *   - unsubscribeFromPush() : unsubscribe at the SW + DELETE on the cloud
 *
 * Push only works under https + a registered service worker. We register the
 * SW in `RegisterServiceWorker.tsx` on page load; this module assumes it's
 * already running and skips silently when it isn't.
 */

import { authFetch } from './auth';

export interface PushStatus {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
  endpoint?: string;
}

function isSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function currentPushStatus(): Promise<PushStatus> {
  if (!isSupported()) return { supported: false, permission: 'unsupported', subscribed: false };
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) {
    return { supported: true, permission: Notification.permission, subscribed: false };
  }
  const sub = await reg.pushManager.getSubscription();
  return {
    supported: true,
    permission: Notification.permission,
    subscribed: !!sub,
    ...(sub ? { endpoint: sub.endpoint } : {}),
  };
}

export async function subscribeToPush(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isSupported()) return { ok: false, reason: 'push_not_supported' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: `permission_${permission}` };

  const reg = await navigator.serviceWorker.ready;

  // VAPID public key has to be fetched from the server so the encryption
  // matches what cloud's PushService signs with.
  const keyRes = await authFetch('/notifications/push/vapid-public-key');
  if (!keyRes.ok) return { ok: false, reason: 'vapid_key_unavailable' };
  const { publicKey } = (await keyRes.json()) as { publicKey: string };

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    // PushManager wants a BufferSource; the .buffer of our Uint8Array is
    // ArrayBufferLike (could be SharedArrayBuffer in TS lib), so re-wrap
    // through a fresh ArrayBuffer to satisfy the strict type.
    applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
  });

  // toJSON gives us { endpoint, keys: { p256dh, auth } } — exactly the
  // shape the cloud expects.
  const json = sub.toJSON() as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };

  const postRes = await authFetch('/notifications/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      userAgent: navigator.userAgent,
    }),
  });
  if (!postRes.ok) {
    // Roll back the local subscription so the next attempt is clean.
    await sub.unsubscribe().catch(() => undefined);
    return { ok: false, reason: `cloud_${postRes.status}` };
  }
  return { ok: true };
}

export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return true;

  // Server first — if the cloud delete fails we still want the browser
  // to stop receiving pushes locally.
  await authFetch('/notifications/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => undefined);

  return sub.unsubscribe();
}

// VAPID public keys are url-safe base64; PushManager needs a Uint8Array.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normal = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normal);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
