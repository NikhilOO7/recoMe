/**
 * Per-tab session id. Persists for the life of the tab so all signals from
 * one "research session" can be correlated server-side (cloud uses Session
 * nodes per HLD 0009 §3). Regenerated on full page reload, persisted across
 * SPA navigations.
 */

const KEY = '__recome_session_id';

declare global {
  interface Window {
    [KEY]?: string;
  }
}

function makeId(): string {
  const ts = Date.now().toString(36);
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => (b % 36).toString(36))
    .join('');
  return `sess_${ts}_${rand}`;
}

export function getSessionId(): string {
  if (!window[KEY]) window[KEY] = makeId();
  return window[KEY]!;
}
