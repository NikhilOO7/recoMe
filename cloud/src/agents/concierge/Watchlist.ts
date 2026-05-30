/**
 * Watchlist — per-user explicit watch list for ConciergeAgent.
 *
 * Backed by Prisma `WatchlistItem` (cloud/prisma/schema.prisma). Items survive
 * process restart and replicate across Fly machines via the shared Neon DB.
 *
 * The four exported functions match the contract that ConciergeAgent +
 * AgentController already call — only the implementation switched from an
 * in-memory Map (the Phase-4 stub) to Prisma. All callers must await.
 *
 * Why a separate module: the watchlist concept will move to its own
 * `WatchlistAgent` (ADR-0012 Tier-2) — keeping the store decoupled means
 * that future agent + the consumer-facing endpoints both share state.
 */

import { prisma } from '../../db.js';

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

// ── Helpers ─────────────────────────────────────────────────────────────────

// Prisma returns null for unset optional columns; the WatchlistItem contract
// uses `undefined` so the JSON shape matches what the extension/web clients
// have been consuming since Phase 4. This one helper keeps the boundary tidy.
type PrismaRow = {
  id: string;
  label: string;
  targetPriceUsd: number | null;
  retailers: string[];
  pageUrl: string | null;
  createdAt: Date;
  lastPriceUsd: number | null;
  lastPriceAt: Date | null;
};

function toClient(row: PrismaRow): WatchlistItem {
  const out: WatchlistItem = {
    id: row.id,
    label: row.label,
    retailers: row.retailers,
    createdAt: row.createdAt.toISOString(),
  };
  if (row.targetPriceUsd != null) out.targetPriceUsd = row.targetPriceUsd;
  if (row.pageUrl) out.pageUrl = row.pageUrl;
  if (row.lastPriceUsd != null) out.lastPriceUsd = row.lastPriceUsd;
  if (row.lastPriceAt) out.lastPriceAt = row.lastPriceAt.toISOString();
  return out;
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function listWatchlist(userId: string): Promise<WatchlistItem[]> {
  const rows = await prisma.watchlistItem.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toClient);
}

export async function addWatchlistItem(
  userId: string,
  input: Omit<WatchlistItem, 'id' | 'createdAt' | 'lastPriceUsd' | 'lastPriceAt'>,
): Promise<WatchlistItem> {
  const row = await prisma.watchlistItem.create({
    data: {
      userId,
      label: input.label,
      targetPriceUsd: input.targetPriceUsd ?? null,
      retailers: input.retailers ?? [],
      pageUrl: input.pageUrl ?? null,
    },
  });
  return toClient(row);
}

export async function removeWatchlistItem(userId: string, id: string): Promise<boolean> {
  // Scope the delete to (id, userId) so a forged id from another user can't
  // delete a row that doesn't belong to them. deleteMany returns a count.
  const res = await prisma.watchlistItem.deleteMany({ where: { id, userId } });
  return res.count > 0;
}

export async function updateWatchlistPrice(
  userId: string,
  id: string,
  priceUsd: number,
): Promise<WatchlistItem | null> {
  // Same tenant-safety pattern as removeWatchlistItem.
  const res = await prisma.watchlistItem.updateMany({
    where: { id, userId },
    data: { lastPriceUsd: priceUsd, lastPriceAt: new Date() },
  });
  if (res.count === 0) return null;
  const row = await prisma.watchlistItem.findUnique({ where: { id } });
  return row ? toClient(row) : null;
}
