/**
 * InboxPoller — alarm-driven fetch of AgentEvents from cloud.
 *
 * Why poll instead of SSE/websocket: per HLD §11 anti-features, "real-time
 * graph mutation push to clients" is explicitly rejected. Pull on a 2-minute
 * cadence is plenty for an inbox.
 *
 * Cursor (`since` ms epoch) is persisted in chrome.storage.local so we don't
 * re-render the same events after a SW restart. Cache (the last N events)
 * is also persisted so the overlay/popup can render synchronously on open.
 */

import { ALARM_NAMES, ALARM_INTERVALS_MIN, STORAGE_KEYS } from '@shared/constants';
import { getInbox, CloudHttpError } from '@shared/CloudClient';
import { getAuthState } from '@shared/AuthClient';
import type { AgentEvent } from '@shared/types';
import { createLogger } from '@shared/Logger';

const log = createLogger('InboxPoller');
const CACHE_SIZE = 50;

export async function registerInboxPoller(): Promise<void> {
  await chrome.alarms.create(ALARM_NAMES.inbox_poll, {
    periodInMinutes: ALARM_INTERVALS_MIN.inbox_poll,
  });
  void poll();
}

export async function poll(): Promise<{ fetched: number; unseen: number }> {
  const auth = await getAuthState();
  if (!auth.loggedIn) return { fetched: 0, unseen: 0 };

  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.inbox_cursor,
    STORAGE_KEYS.inbox_cache,
  ]);
  const since = (stored[STORAGE_KEYS.inbox_cursor] as number | undefined) ?? 0;
  const cached = (stored[STORAGE_KEYS.inbox_cache] as AgentEvent[] | undefined) ?? [];

  try {
    const { events: fresh } = await getInbox({ since, limit: CACHE_SIZE });
    if (fresh.length === 0) {
      return { fetched: 0, unseen: cached.filter((e) => !e.seenAt).length };
    }

    // Merge: dedupe by id, sort desc by createdAt, cap at CACHE_SIZE
    const byId = new Map<string, AgentEvent>();
    for (const e of cached) byId.set(e.id, e);
    for (const e of fresh) byId.set(e.id, e);
    const merged = Array.from(byId.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, CACHE_SIZE);

    const newCursor = Math.max(since, ...fresh.map((e) => e.createdAt));
    await chrome.storage.local.set({
      [STORAGE_KEYS.inbox_cursor]: newCursor,
      [STORAGE_KEYS.inbox_cache]: merged,
    });

    const unseen = merged.filter((e) => !e.seenAt).length;

    // Update browser action badge with unseen count.
    void chrome.action.setBadgeBackgroundColor({ color: '#8b5cf6' });
    void chrome.action.setBadgeText({ text: unseen > 0 ? String(unseen) : '' });

    // Notify any open tabs / popups (best-effort).
    chrome.runtime
      .sendMessage({ type: 'INBOX_UPDATED', payload: { events: merged, unseenCount: unseen } })
      .catch(() => undefined);

    return { fetched: fresh.length, unseen };
  } catch (e) {
    if (e instanceof CloudHttpError && e.status === 401) {
      // Refresh failed; user effectively logged out. Stay quiet.
      return { fetched: 0, unseen: 0 };
    }
    log.warn('inbox poll failed', e);
    return { fetched: 0, unseen: cached.filter((e) => !e.seenAt).length };
  }
}

export async function getCachedInbox(): Promise<AgentEvent[]> {
  const r = await chrome.storage.local.get(STORAGE_KEYS.inbox_cache);
  return (r[STORAGE_KEYS.inbox_cache] as AgentEvent[] | undefined) ?? [];
}

export function handleAlarm(name: string): void {
  if (name === ALARM_NAMES.inbox_poll) void poll();
}
