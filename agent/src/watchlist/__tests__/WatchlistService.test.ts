import { WatchlistService } from '../index';
import type { WatchlistItem } from '@schema/watchlist';

// ── Mock chrome APIs ────────────────────────────────────────────────────────────

(globalThis as any).chrome = {
  storage: {
    local: { get: jest.fn().mockResolvedValue({}), set: jest.fn().mockResolvedValue(undefined) },
    session: { get: jest.fn().mockResolvedValue({}), set: jest.fn().mockResolvedValue(undefined) },
  },
};

// ── Mock Logger ─────────────────────────────────────────────────────────────────

jest.mock('@utils/Logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// ── Mock @utils/index (generateId) ─────────────────────────────────────────────

let idCounter = 0;
jest.mock('@utils/index', () => ({
  generateId: jest.fn(() => `wl-${++idCounter}`),
}));

// ── Mock BrainFacade ────────────────────────────────────────────────────────────

const watchlistStore = new Map<string, WatchlistItem>();

jest.mock('@brain/BrainFacade', () => ({
  getBrain: jest.fn(() => ({
    addToWatchlist: jest.fn().mockImplementation((item: WatchlistItem) => {
      watchlistStore.set(item.watchlistItemId, item);
      return Promise.resolve();
    }),
    removeFromWatchlist: jest.fn().mockImplementation((id: string) => {
      watchlistStore.delete(id);
      return Promise.resolve();
    }),
    getWatchlist: jest.fn().mockImplementation(() => {
      return Promise.resolve([...watchlistStore.values()]);
    }),
  })),
}));

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('WatchlistService', () => {
  let service: WatchlistService;

  beforeEach(() => {
    watchlistStore.clear();
    idCounter = 0;
    service = new WatchlistService();
  });

  describe('add', () => {
    it('should create and return a WatchlistItem', async () => {
      const item = await service.add({
        entityType: 'product',
        entityId: 'prod-123',
        note: 'Great deal',
      });

      expect(item.watchlistItemId).toBe('wl-1');
      expect(item.entityType).toBe('product');
      expect(item.entityId).toBe('prod-123');
      expect(item.note).toBe('Great deal');
      expect(item.createdAt).toBeDefined();
      expect(item.updatedAt).toBeDefined();
    });

    it('should persist the item so getAll returns it', async () => {
      await service.add({ entityType: 'product', entityId: 'prod-1' });
      const all = await service.getAll();
      expect(all).toHaveLength(1);
      expect(all[0]!.entityId).toBe('prod-1');
    });
  });

  describe('getAll', () => {
    it('should return all items', async () => {
      await service.add({ entityType: 'product', entityId: 'p1' });
      await service.add({ entityType: 'offer', entityId: 'o1' });
      await service.add({ entityType: 'category', entityId: 'c1' });

      const items = await service.getAll();
      expect(items).toHaveLength(3);
      const ids = items.map((i) => i.entityId);
      expect(ids).toContain('p1');
      expect(ids).toContain('o1');
      expect(ids).toContain('c1');
    });

    it('should return empty array when no items exist', async () => {
      const items = await service.getAll();
      expect(items).toEqual([]);
    });
  });

  describe('remove', () => {
    it('should delete an item', async () => {
      const item = await service.add({ entityType: 'product', entityId: 'p1' });
      await service.remove(item.watchlistItemId);

      const all = await service.getAll();
      expect(all).toHaveLength(0);
    });
  });

  describe('isWatched', () => {
    it('should return true when entity is on the watchlist', async () => {
      await service.add({ entityType: 'product', entityId: 'p-watched' });
      const result = await service.isWatched('p-watched');
      expect(result).toBe(true);
    });

    it('should return false when entity is not on the watchlist', async () => {
      const result = await service.isWatched('p-not-here');
      expect(result).toBe(false);
    });
  });

  describe('updateNote', () => {
    it('should update the note on an existing item', async () => {
      const item = await service.add({
        entityType: 'product',
        entityId: 'p1',
        note: 'Old note',
      });

      await service.updateNote(item.watchlistItemId, 'New note');

      const all = await service.getAll();
      const updated = all.find((i) => i.watchlistItemId === item.watchlistItemId);
      expect(updated).toBeDefined();
      expect(updated!.note).toBe('New note');
    });

    it('should do nothing when item does not exist', async () => {
      // Should not throw
      await service.updateNote('nonexistent-id', 'Some note');
      const all = await service.getAll();
      expect(all).toHaveLength(0);
    });
  });
});
