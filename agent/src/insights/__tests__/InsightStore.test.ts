import { InsightStore, type Insight } from '../InsightStore';

// ── Chrome API mock ──────────────────────────────────────────────────────────

let storedInsights: Insight[] = [];

globalThis.chrome = {
  storage: {
    local: {
      get: jest.fn().mockImplementation(async (key: string) => {
        return { [key]: storedInsights };
      }),
      set: jest.fn().mockImplementation(async (data: Record<string, any>) => {
        storedInsights = data['recome_insights'] ?? [];
      }),
    },
    session: { get: jest.fn(), set: jest.fn() },
    sync: { get: jest.fn(), set: jest.fn() },
  },
  runtime: { sendMessage: jest.fn() },
} as any;

jest.mock('@utils/Logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

beforeEach(() => {
  storedInsights = [];
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('InsightStore', () => {
  describe('getAll', () => {
    it('returns empty array initially', async () => {
      const store = new InsightStore();
      const all = await store.getAll();
      expect(all).toEqual([]);
    });

    it('returns stored insights', async () => {
      storedInsights = [
        {
          id: 'insight_1',
          type: 'extended_research',
          title: 'Researching headphones',
          message: 'You have been looking at headphones.',
          topicKey: 'topic:headphones',
          createdAt: Date.now(),
          shown: false,
          dismissed: false,
        },
      ];
      const store = new InsightStore();
      const all = await store.getAll();
      expect(all).toHaveLength(1);
      expect(all[0]!.title).toBe('Researching headphones');
    });
  });

  describe('add', () => {
    it('stores insight and returns true', async () => {
      const store = new InsightStore();
      const result = await store.add({
        type: 'extended_research',
        title: 'Researching laptops',
        message: 'You have been researching laptops.',
        topicKey: 'topic:laptops',
      });

      expect(result).toBe(true);

      const all = await store.getAll();
      expect(all).toHaveLength(1);
      expect(all[0]!.type).toBe('extended_research');
      expect(all[0]!.title).toBe('Researching laptops');
      expect(all[0]!.shown).toBe(false);
      expect(all[0]!.dismissed).toBe(false);
      expect(all[0]!.id).toMatch(/^insight_/);
      expect(typeof all[0]!.createdAt).toBe('number');
    });

    it('deduplicates within 3-day window (same type + topicKey)', async () => {
      const store = new InsightStore();

      // Add first insight
      const result1 = await store.add({
        type: 'extended_research',
        title: 'Researching headphones',
        message: 'msg1',
        topicKey: 'topic:headphones',
      });
      expect(result1).toBe(true);

      // Try to add duplicate (same type + topicKey)
      const result2 = await store.add({
        type: 'extended_research',
        title: 'Still researching headphones',
        message: 'msg2',
        topicKey: 'topic:headphones',
      });
      expect(result2).toBe(false);

      const all = await store.getAll();
      expect(all).toHaveLength(1);
    });

    it('allows same type with different topicKey', async () => {
      const store = new InsightStore();

      await store.add({
        type: 'extended_research',
        title: 'Researching headphones',
        message: 'msg1',
        topicKey: 'topic:headphones',
      });

      const result = await store.add({
        type: 'extended_research',
        title: 'Researching laptops',
        message: 'msg2',
        topicKey: 'topic:laptops',
      });
      expect(result).toBe(true);

      const all = await store.getAll();
      expect(all).toHaveLength(2);
    });

    it('allows same topicKey with different type', async () => {
      const store = new InsightStore();

      await store.add({
        type: 'extended_research',
        title: 'Research',
        message: 'msg1',
        topicKey: 'topic:headphones',
      });

      const result = await store.add({
        type: 'decision_fatigue',
        title: 'Fatigue',
        message: 'msg2',
        topicKey: 'topic:headphones',
      });
      expect(result).toBe(true);
    });

    it('allows duplicate after dedup window expires', async () => {
      const store = new InsightStore();

      await store.add({
        type: 'extended_research',
        title: 'Old research',
        message: 'msg',
        topicKey: 'topic:headphones',
      });

      // Manually age the stored insight beyond the 3-day window
      storedInsights[0]!.createdAt = Date.now() - 4 * 24 * 60 * 60 * 1000;

      const result = await store.add({
        type: 'extended_research',
        title: 'New research',
        message: 'msg2',
        topicKey: 'topic:headphones',
      });
      expect(result).toBe(true);
    });
  });

  describe('getPending', () => {
    it('returns insights not yet shown', async () => {
      const store = new InsightStore();
      await store.add({
        type: 'extended_research',
        title: 'Pending',
        message: 'msg',
        topicKey: 'topic:a',
      });

      const pending = await store.getPending();
      expect(pending).toHaveLength(1);
      expect(pending[0]!.shown).toBe(false);
    });

    it('excludes shown insights', async () => {
      const store = new InsightStore();
      await store.add({
        type: 'extended_research',
        title: 'Will be shown',
        message: 'msg',
        topicKey: 'topic:a',
      });

      const all = await store.getAll();
      await store.markShown(all[0]!.id);

      const pending = await store.getPending();
      expect(pending).toHaveLength(0);
    });

    it('excludes dismissed insights', async () => {
      const store = new InsightStore();
      await store.add({
        type: 'extended_research',
        title: 'Will be dismissed',
        message: 'msg',
        topicKey: 'topic:a',
      });

      const all = await store.getAll();
      await store.dismiss(all[0]!.id);

      const pending = await store.getPending();
      expect(pending).toHaveLength(0);
    });
  });

  describe('markShown', () => {
    it('updates shown flag to true', async () => {
      const store = new InsightStore();
      await store.add({
        type: 'extended_research',
        title: 'Test',
        message: 'msg',
        topicKey: 'topic:x',
      });

      const before = await store.getAll();
      expect(before[0]!.shown).toBe(false);

      await store.markShown(before[0]!.id);

      const after = await store.getAll();
      expect(after[0]!.shown).toBe(true);
    });

    it('no-ops for unknown insight id', async () => {
      const store = new InsightStore();
      // Should not throw
      await store.markShown('nonexistent');
    });
  });

  describe('dismiss', () => {
    it('marks insight as dismissed', async () => {
      const store = new InsightStore();
      await store.add({
        type: 'decision_fatigue',
        title: 'Dismiss me',
        message: 'msg',
        topicKey: 'topic:y',
      });

      const all = await store.getAll();
      await store.dismiss(all[0]!.id);

      const updated = await store.getAll();
      expect(updated[0]!.dismissed).toBe(true);
    });
  });

  describe('getActive', () => {
    it('returns shown but not dismissed insights', async () => {
      const store = new InsightStore();

      // Add two insights
      await store.add({
        type: 'extended_research',
        title: 'Shown active',
        message: 'msg1',
        topicKey: 'topic:a',
      });
      await store.add({
        type: 'decision_fatigue',
        title: 'Shown dismissed',
        message: 'msg2',
        topicKey: 'topic:b',
      });
      await store.add({
        type: 'cross_platform',
        title: 'Not shown',
        message: 'msg3',
        topicKey: 'topic:c',
      });

      const all = await store.getAll();
      // all[0]=Not shown, all[1]=Shown dismissed, all[2]=Shown active (prepended order)
      // Mark "Shown active" as shown
      await store.markShown(all[2]!.id);
      // Mark "Shown dismissed" as shown + dismissed
      await store.markShown(all[1]!.id);
      await store.dismiss(all[1]!.id);
      // "Not shown" stays unshown

      const active = await store.getActive();
      expect(active).toHaveLength(1);
      expect(active[0]!.title).toBe('Shown active');
    });

    it('returns empty when no shown insights exist', async () => {
      const store = new InsightStore();
      await store.add({
        type: 'extended_research',
        title: 'Unshown',
        message: 'msg',
        topicKey: 'topic:a',
      });

      const active = await store.getActive();
      expect(active).toHaveLength(0);
    });
  });

  describe('cleanup', () => {
    it('removes insights older than 7 days', async () => {
      const store = new InsightStore();

      // Add a fresh insight
      await store.add({
        type: 'extended_research',
        title: 'Fresh',
        message: 'msg',
        topicKey: 'topic:fresh',
      });

      // Manually add an old insight
      storedInsights.push({
        id: 'insight_old',
        type: 'decision_fatigue',
        title: 'Old',
        message: 'old msg',
        topicKey: 'topic:old',
        createdAt: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days ago
        shown: true,
        dismissed: false,
      });

      const removed = await store.cleanup();
      expect(removed).toBe(1);

      const remaining = await store.getAll();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.title).toBe('Fresh');
    });

    it('returns 0 when no old insights exist', async () => {
      const store = new InsightStore();
      await store.add({
        type: 'extended_research',
        title: 'Recent',
        message: 'msg',
        topicKey: 'topic:recent',
      });

      const removed = await store.cleanup();
      expect(removed).toBe(0);
    });

    it('removes all insights if all are old', async () => {
      storedInsights = [
        {
          id: 'old1',
          type: 'extended_research',
          title: 'Old 1',
          message: 'msg',
          topicKey: 'topic:a',
          createdAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
          shown: false,
          dismissed: false,
        },
        {
          id: 'old2',
          type: 'decision_fatigue',
          title: 'Old 2',
          message: 'msg',
          topicKey: 'topic:b',
          createdAt: Date.now() - 14 * 24 * 60 * 60 * 1000,
          shown: false,
          dismissed: false,
        },
      ];

      const store = new InsightStore();
      const removed = await store.cleanup();
      expect(removed).toBe(2);

      const remaining = await store.getAll();
      expect(remaining).toHaveLength(0);
    });
  });
});
