import { incrementHidden, incrementBoosted, recordBlockedTopic, readStats } from '../stats';

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
  runtime: { sendMessage: jest.fn() },
} as any;

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('stats', () => {
  beforeEach(() => {
    storage = {};
    jest.clearAllMocks();
  });

  describe('incrementHidden', () => {
    it('increases total_hidden count', async () => {
      await incrementHidden();
      const stats = await readStats();
      expect(stats.total_hidden).toBe(1);
    });

    it('increases hidden_today count', async () => {
      await incrementHidden();
      await incrementHidden();
      const stats = await readStats();
      expect(stats.hidden_today).toBe(2);
    });

    it('accumulates across multiple calls', async () => {
      await incrementHidden();
      await incrementHidden();
      await incrementHidden();
      const stats = await readStats();
      expect(stats.total_hidden).toBe(3);
      expect(stats.hidden_today).toBe(3);
    });
  });

  describe('incrementBoosted', () => {
    it('increases total_boosted count', async () => {
      await incrementBoosted();
      const stats = await readStats();
      expect(stats.total_boosted).toBe(1);
    });

    it('accumulates across multiple calls', async () => {
      await incrementBoosted();
      await incrementBoosted();
      const stats = await readStats();
      expect(stats.total_boosted).toBe(2);
    });
  });

  describe('recordBlockedTopic', () => {
    it('adds topic to blocked_topics list', async () => {
      await recordBlockedTopic('crypto');
      const stats = await readStats();
      expect(stats.blocked_topics).toHaveProperty('crypto');
      expect(stats.blocked_topics['crypto']).toBe(1);
    });

    it('increments count for repeated topic', async () => {
      await recordBlockedTopic('crypto');
      await recordBlockedTopic('crypto');
      await recordBlockedTopic('crypto');
      const stats = await readStats();
      expect(stats.blocked_topics['crypto']).toBe(3);
    });

    it('tracks multiple topics independently', async () => {
      await recordBlockedTopic('crypto');
      await recordBlockedTopic('politics');
      await recordBlockedTopic('crypto');
      const stats = await readStats();
      expect(stats.blocked_topics['crypto']).toBe(2);
      expect(stats.blocked_topics['politics']).toBe(1);
    });
  });

  describe('daily count reset', () => {
    it('resets hidden_today on a new day', async () => {
      // Simulate data from a previous day
      storage['recome_stats'] = {
        total_hidden: 50,
        hidden_today: 25,
        today_date: 'Mon Jan 01 2024', // old date
        total_boosted: 10,
        blocked_topics: { crypto: 5 },
      };

      // Reading stats should reset hidden_today since today_date won't match
      const stats = await readStats();
      expect(stats.hidden_today).toBe(0);
      expect(stats.total_hidden).toBe(50); // total preserved
      expect(stats.total_boosted).toBe(10); // boosted preserved
      expect(stats.blocked_topics).toEqual({ crypto: 5 }); // topics preserved
    });
  });

  describe('readStats / getStats shape', () => {
    it('returns proper shape with defaults when no data exists', async () => {
      const stats = await readStats();
      expect(stats).toEqual({
        total_hidden: 0,
        hidden_today: 0,
        today_date: expect.any(String),
        total_boosted: 0,
        blocked_topics: {},
      });
    });

    it('returns proper shape after operations', async () => {
      await incrementHidden();
      await incrementBoosted();
      await recordBlockedTopic('nft');
      const stats = await readStats();

      expect(stats).toEqual({
        total_hidden: 1,
        hidden_today: 1,
        today_date: expect.any(String),
        total_boosted: 1,
        blocked_topics: { nft: 1 },
      });
    });
  });
});
