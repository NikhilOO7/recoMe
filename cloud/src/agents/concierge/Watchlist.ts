/**
 * Watchlist — per-user explicit watch list for ConciergeAgent.
 *
 * Phase-4 stub: in-memory Map per user. Survives a hot-reload of the same
 * process but not a restart. Production swap: add `WatchlistItem` to
 * Prisma schema with `userId, label, targetPriceUsd, retailers[], createdAt`
 * and rewire the four methods below.
 *
 * Why a separate module: the watchlist concept will move to its own
 * `WatchlistAgent` (ADR-0012 Tier-2) — keeping the store decoupled means
 * that future agent + the consumer-facing endpoints both share state.
 */

import { randomUUID } from 'node:crypto';

export interface WatchlistItem {
  id: string;
  label: string;
  /** Currency-agnostic target price; UI formats to USD until F-403 vendor pick. */
  targetPriceUsd?: number;
  retailers?: string[];
  /** Optional URL to anchor the item to a concrete page. */
  pageUrl?: string;
  createdAt: string;
  /** Updated by ConciergeAgent when it observes a new price for this item. */
  lastPriceUsd?: number;
  lastPriceAt?: string;
}

const STORE = new Map<string, WatchlistItem[]>();

export function listWatchlist(userId: string): WatchlistItem[] {
  return STORE.get(userId) ?? [];
}

export function addWatchlistItem(
  userId: string,
  input: Omit<WatchlistItem, 'id' | 'createdAt'>,
): WatchlistItem {
  const items = STORE.get(userId) ?? [];
  const item: WatchlistItem = {
    id: `wl_${randomUUID()}`,
    createdAt: new Date().toISOString(),
    ...input,
  };
  items.unshift(item);
  STORE.set(userId, items);
  return item;
}

export function removeWatchlistItem(userId: string, id: string): boolean {
  const items = STORE.get(userId);
  if (!items) return false;
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return false;
  items.splice(idx, 1);
  return true;
}

export function updateWatchlistPrice(
  userId: string,
  id: string,
  priceUsd: number,
): WatchlistItem | null {
  const items = STORE.get(userId);
  const item = items?.find((i) => i.id === id);
  if (!item) return null;
  item.lastPriceUsd = priceUsd;
  item.lastPriceAt = new Date().toISOString();
  return item;
}
