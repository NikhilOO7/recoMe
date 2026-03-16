import {
  checkAchievements,
  unlockFirstBlock,
  getAchievementState,
  trackProductsScored,
  trackWatchlistAdd,
  unlockUnicorn,
  type AchievementState,
} from '../achievements';

// ── Mock chrome APIs ────────────────────────────────────────────────────────────

let storage: Record<string, any> = {};

globalThis.chrome = {
  storage: {
    local: {
      get: jest.fn().mockImplementation((key: string) => Promise.resolve({ [key]: storage[key] })),
      set: jest.fn().mockImplementation((obj: Record<string, any>) => {
        Object.assign(storage, obj);
        return Promise.resolve();
      }),
    },
  },
  tabs: {
    query: jest.fn().mockResolvedValue([]),
    sendMessage: jest.fn().mockResolvedValue(undefined),
  },
  runtime: { sendMessage: jest.fn() },
} as any;

// Mock EventBus to prevent side effects
jest.mock('@shared/EventBus', () => ({
  eventBus: {
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  },
}));

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('achievements', () => {
  beforeEach(() => {
    storage = {};
    jest.clearAllMocks();
  });

  describe('checkAchievements', () => {
    it('returns without unlocking when no thresholds met', async () => {
      await checkAchievements({ totalHidden: 0, blockedCount: 0, patternCount: 0 });

      const state = await getAchievementState();
      // Only active_days may have been modified, no achievements unlocked
      expect(state.unlocked).toEqual([]);
    });

    it('100 items hidden triggers clean_sweep achievement', async () => {
      await checkAchievements({ totalHidden: 100, blockedCount: 0, patternCount: 0 });

      const state = await getAchievementState();
      expect(state.unlocked).toContain('clean_sweep');
      // Also triggers clean_start (10) which is below 100
      expect(state.unlocked).toContain('clean_start');
    });

    it('achievement not re-triggered once unlocked', async () => {
      // First call unlocks
      await checkAchievements({ totalHidden: 100, blockedCount: 0, patternCount: 0 });
      const stateAfterFirst = await getAchievementState();
      const firstUnlockedCount = stateAfterFirst.unlocked.length;

      // Second call with same params should not duplicate
      await checkAchievements({ totalHidden: 100, blockedCount: 0, patternCount: 0 });
      const stateAfterSecond = await getAchievementState();
      expect(stateAfterSecond.unlocked.length).toBe(firstUnlockedCount);

      // No duplicates
      const uniqueIds = new Set(stateAfterSecond.unlocked);
      expect(uniqueIds.size).toBe(stateAfterSecond.unlocked.length);
    });

    it('also triggers milestone_toasts_shown for 100', async () => {
      await checkAchievements({ totalHidden: 100, blockedCount: 0, patternCount: 0 });
      const state = await getAchievementState();
      expect(state.milestone_toasts_shown).toContain(100);
      expect(state.milestone_toasts_shown).toContain(10);
    });
  });

  describe('unlockFirstBlock', () => {
    it('triggers first_block achievement', async () => {
      await unlockFirstBlock();

      const state = await getAchievementState();
      expect(state.unlocked).toContain('first_block');
    });

    it('records proper achievement shape', async () => {
      await unlockFirstBlock();

      const state = await getAchievementState();
      // State has the expected shape
      expect(state).toEqual(
        expect.objectContaining({
          unlocked: expect.arrayContaining(['first_block']),
          milestone_toasts_shown: expect.any(Array),
          active_days: expect.any(Array),
          recent_blocks: expect.any(Array),
          products_scored: expect.any(Number),
          watchlist_adds: expect.any(Number),
        }),
      );

      // recent_blocks should contain a timestamp
      expect(state.recent_blocks.length).toBeGreaterThanOrEqual(1);
      expect(typeof state.recent_blocks[0]).toBe('number');
    });
  });

  describe('feed_master achievement', () => {
    it('unlocks feed_master at 1000 items hidden', async () => {
      await checkAchievements({ totalHidden: 1000, blockedCount: 0, patternCount: 0 });

      const state = await getAchievementState();
      expect(state.unlocked).toContain('feed_master');
      // Should also trigger the 1000 milestone toast
      expect(state.milestone_toasts_shown).toContain(1000);
    });
  });

  describe('power_user achievement', () => {
    it('unlocks power_user after 30 active days', async () => {
      // Pre-populate 29 active days
      const days: string[] = [];
      for (let i = 1; i <= 29; i++) {
        days.push(`2025-01-${String(i).padStart(2, '0')}`);
      }
      storage['recome_achievements'] = {
        unlocked: [],
        milestone_toasts_shown: [],
        active_days: days,
        recent_blocks: [],
        products_scored: 0,
        watchlist_adds: 0,
      };

      // The 30th call adds today
      await checkAchievements({ totalHidden: 0, blockedCount: 0, patternCount: 0 });

      const state = await getAchievementState();
      expect(state.active_days.length).toBeGreaterThanOrEqual(30);
      expect(state.unlocked).toContain('power_user');
    });
  });

  describe('party_time achievement', () => {
    it('unlocks party_time after 10 blocks in 1 minute', async () => {
      // Pre-populate 9 recent blocks within the last minute
      const now = Date.now();
      const recentBlocks = Array.from({ length: 9 }, (_, i) => now - i * 1000);
      storage['recome_achievements'] = {
        unlocked: [],
        milestone_toasts_shown: [],
        active_days: [],
        recent_blocks: recentBlocks,
        products_scored: 0,
        watchlist_adds: 0,
      };

      // The 10th block triggers party_time
      await unlockFirstBlock();

      const state = await getAchievementState();
      expect(state.unlocked).toContain('party_time');
    });
  });

  describe('trackProductsScored', () => {
    it('unlocks smart_shopper on first product scored', async () => {
      await trackProductsScored(1);

      const state = await getAchievementState();
      expect(state.unlocked).toContain('smart_shopper');
      expect(state.products_scored).toBe(1);
    });

    it('unlocks deal_hunter at 50 products scored', async () => {
      await trackProductsScored(50);

      const state = await getAchievementState();
      expect(state.unlocked).toContain('deal_hunter');
      expect(state.products_scored).toBe(50);
    });

    it('increments products_scored cumulatively', async () => {
      await trackProductsScored(10);
      await trackProductsScored(5);

      const state = await getAchievementState();
      expect(state.products_scored).toBe(15);
    });
  });

  describe('trackWatchlistAdd', () => {
    it('unlocks curator at 5 watchlist adds', async () => {
      for (let i = 0; i < 5; i++) {
        await trackWatchlistAdd();
      }

      const state = await getAchievementState();
      expect(state.unlocked).toContain('curator');
      expect(state.watchlist_adds).toBe(5);
    });

    it('increments watchlist_adds by 1 each call', async () => {
      await trackWatchlistAdd();
      await trackWatchlistAdd();

      const state = await getAchievementState();
      expect(state.watchlist_adds).toBe(2);
    });
  });

  describe('unlockUnicorn', () => {
    it('unlocks the unicorn easter egg achievement', async () => {
      await unlockUnicorn();

      const state = await getAchievementState();
      expect(state.unlocked).toContain('unicorn');
    });

    it('does not duplicate if already unlocked', async () => {
      await unlockUnicorn();
      await unlockUnicorn();

      const state = await getAchievementState();
      const unicornCount = state.unlocked.filter((id: string) => id === 'unicorn').length;
      expect(unicornCount).toBe(1);
    });
  });

  describe('milestone toasts', () => {
    it('triggers 500 milestone toast', async () => {
      await checkAchievements({ totalHidden: 500, blockedCount: 0, patternCount: 0 });

      const state = await getAchievementState();
      expect(state.milestone_toasts_shown).toContain(500);
    });
  });

  describe('laser_focus and mind_reader', () => {
    it('unlocks laser_focus at 5 blocked topics', async () => {
      await checkAchievements({ totalHidden: 0, blockedCount: 5, patternCount: 0 });

      const state = await getAchievementState();
      expect(state.unlocked).toContain('laser_focus');
    });

    it('unlocks mind_reader at 10 patterns', async () => {
      await checkAchievements({ totalHidden: 0, blockedCount: 0, patternCount: 10 });

      const state = await getAchievementState();
      expect(state.unlocked).toContain('mind_reader');
    });
  });
});
