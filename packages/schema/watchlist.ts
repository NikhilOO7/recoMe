// ── Watchlist types (from domain model) ──────────────────────────────────────

export interface WatchlistItem {
  watchlistItemId: string;
  entityType: 'product' | 'offer' | 'category';
  entityId: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}
