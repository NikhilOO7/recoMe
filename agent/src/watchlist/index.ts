import { createLogger } from '@utils/Logger';
import { generateId } from '@utils/index';
import { getBrain } from '@brain/BrainFacade';
import type { WatchlistItem } from '@schema/watchlist';

const log = createLogger('WatchlistService');

export interface AddToWatchlistRequest {
  entityType: WatchlistItem['entityType'];
  entityId: string;
  note?: string;
}

export class WatchlistService {
  /**
   * Add a product, offer, or category to the user's watchlist.
   */
  async add(request: AddToWatchlistRequest): Promise<WatchlistItem> {
    const brain = getBrain();
    const now = new Date().toISOString();

    const item: WatchlistItem = {
      watchlistItemId: generateId(),
      entityType: request.entityType,
      entityId: request.entityId,
      note: request.note,
      createdAt: now,
      updatedAt: now,
    };

    await brain.addToWatchlist(item);
    log.info(`Added to watchlist: ${request.entityType}:${request.entityId}`);
    return item;
  }

  /**
   * Remove an item from the watchlist.
   */
  async remove(watchlistItemId: string): Promise<void> {
    const brain = getBrain();
    await brain.removeFromWatchlist(watchlistItemId);
    log.info(`Removed from watchlist: ${watchlistItemId}`);
  }

  /**
   * Get the full watchlist.
   */
  async getAll(): Promise<WatchlistItem[]> {
    const brain = getBrain();
    return brain.getWatchlist();
  }

  /**
   * Check if an entity is already on the watchlist.
   */
  async isWatched(entityId: string): Promise<boolean> {
    const items = await this.getAll();
    return items.some((item) => item.entityId === entityId);
  }

  /**
   * Update the note on a watchlist item.
   */
  async updateNote(watchlistItemId: string, note: string): Promise<void> {
    const brain = getBrain();
    const items = await brain.getWatchlist();
    const existing = items.find((i) => i.watchlistItemId === watchlistItemId);
    if (!existing) return;

    const updated: WatchlistItem = {
      ...existing,
      note,
      updatedAt: new Date().toISOString(),
    };
    await brain.addToWatchlist(updated);
    log.info(`Updated watchlist note: ${watchlistItemId}`);
  }
}
