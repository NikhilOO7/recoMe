import { MemoryStore } from '../MemoryStore';
import type { MemoryEntry, MemoryEvent } from '@shared/types';

// ── Mock IndexedDB ─────────────────────────────────────────────────────────────

const memoryStore = new Map<string, unknown>();
const eventsStore: unknown[] = [];
const cardsStore = new Map<string, unknown>();

jest.mock('@data/db', () => ({
  getDB: jest.fn().mockResolvedValue({
    put: jest
      .fn()
      .mockImplementation((_store: string, value: { entry_id?: string; card_id?: string }) => {
        if (_store === 'memory_entries') memoryStore.set(value.entry_id!, value);
        if (_store === 'mid_term_cards') cardsStore.set(value.card_id!, value);
        return Promise.resolve();
      }),
    add: jest.fn().mockImplementation((_store: string, value: unknown) => {
      eventsStore.push(value);
      return Promise.resolve();
    }),
    get: jest.fn().mockImplementation((_store: string, key: string) => {
      if (_store === 'memory_entries') return Promise.resolve(memoryStore.get(key));
      if (_store === 'mid_term_cards') return Promise.resolve(cardsStore.get(key));
      return Promise.resolve(undefined);
    }),
    getAll: jest.fn().mockResolvedValue([]),
    getAllFromIndex: jest
      .fn()
      .mockImplementation((_store: string, index: string, query: unknown) => {
        if (_store === 'memory_entries') {
          const entries = [...memoryStore.values()] as Array<{
            user_id: string;
            context_bucket: string;
            status: string;
            topic_key: string;
            is_deleted: boolean;
          }>;
          if (index === 'by_user_context') {
            const [uid, ctx] = query as [string, string];
            return Promise.resolve(
              entries.filter((e) => e.user_id === uid && e.context_bucket === ctx),
            );
          }
          if (index === 'by_status') {
            const [uid, status] = query as [string, string];
            return Promise.resolve(entries.filter((e) => e.user_id === uid && e.status === status));
          }
          if (index === 'by_topic') {
            const [uid, topicKey] = query as [string, string];
            return Promise.resolve(
              entries.filter((e) => e.user_id === uid && e.topic_key === topicKey),
            );
          }
        }
        if (_store === 'memory_events') {
          const events = [...eventsStore] as Array<{ topic_key: string; occurred_at: number }>;
          if (index === 'by_topic')
            return Promise.resolve(events.filter((e) => e.topic_key === query));
          if (index === 'by_occurred') {
            // query is an IDBKeyRange-like object — we mock it by filtering on occurred_at
            // Since IDBKeyRange isn't available in jest, we handle the sinceMs directly
            const sinceMs = (query as { lower: number }).lower ?? 0;
            return Promise.resolve(events.filter((e) => e.occurred_at >= sinceMs));
          }
        }
        if (_store === 'mid_term_cards') {
          const cards = [...cardsStore.values()] as Array<{
            user_id: string;
            context_bucket: string;
          }>;
          if (index === 'by_user_context') {
            const [uid, ctx] = query as [string, string];
            return Promise.resolve(
              cards.filter((c) => c.user_id === uid && c.context_bucket === ctx),
            );
          }
        }
        return Promise.resolve([]);
      }),
    clear: jest.fn().mockImplementation((_store: string) => {
      if (_store === 'memory_entries') memoryStore.clear();
      if (_store === 'memory_events') eventsStore.length = 0;
      if (_store === 'mid_term_cards') cardsStore.clear();
      return Promise.resolve();
    }),
    count: jest.fn().mockResolvedValue(0),
  }),
}));

// We also need to mock IDBKeyRange since it's used in getEventsAfter
globalThis.IDBKeyRange = {
  lowerBound: (lower: number) => ({ lower }),
} as any;

// ── Helpers ─────────────────────────────────────────────────────────────────────

const USER_ID = 'test_user';

function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  const ts = Date.now();
  return {
    entry_id: `entry_${Math.random().toString(36).slice(2, 8)}`,
    user_id: USER_ID,
    context_bucket: 'general',
    memory_type: 'working_set',
    topic_key: 'test:topic',
    value: {},
    confidence: 1.0,
    status: 'core',
    valid_from: ts,
    valid_to: null,
    last_confirmed_at: ts,
    last_accessed_at: ts,
    access_count: 1,
    version: 1,
    is_deleted: false,
    created_at: ts,
    updated_at: ts,
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('MemoryStore', () => {
  let store: MemoryStore;

  beforeEach(() => {
    memoryStore.clear();
    eventsStore.length = 0;
    cardsStore.clear();
    store = new MemoryStore();
  });

  // ── upsertEntry ──────────────────────────────────────────────────────────────

  describe('upsertEntry', () => {
    it('should create a new entry with timestamps', async () => {
      const entry = makeEntry({ entry_id: 'entry_new' });
      const beforeTs = Date.now();

      await store.upsertEntry(entry);

      const stored = memoryStore.get('entry_new') as MemoryEntry;
      expect(stored).toBeDefined();
      expect(stored.entry_id).toBe('entry_new');
      expect(stored.user_id).toBe(USER_ID);
      expect(stored.updated_at).toBeGreaterThanOrEqual(beforeTs);
    });

    it('should update an existing entry', async () => {
      const entry = makeEntry({ entry_id: 'entry_update', topic_key: 'test:original' });
      await store.upsertEntry(entry);

      const updated = { ...entry, topic_key: 'test:updated', confidence: 0.8 };
      await store.upsertEntry(updated);

      const stored = memoryStore.get('entry_update') as MemoryEntry;
      expect(stored.topic_key).toBe('test:updated');
      expect(stored.confidence).toBe(0.8);
    });

    it('should overwrite updated_at on upsert', async () => {
      const oldTs = Date.now() - 100000;
      const entry = makeEntry({ entry_id: 'entry_ts', updated_at: oldTs });

      await store.upsertEntry(entry);

      const stored = memoryStore.get('entry_ts') as MemoryEntry;
      // upsertEntry spreads the entry and sets updated_at to now()
      expect(stored.updated_at).toBeGreaterThan(oldTs);
    });
  });

  // ── getEntriesByUserContext ──────────────────────────────────────────────────

  describe('getEntriesByUserContext', () => {
    it('should filter entries by user and context', async () => {
      const e1 = makeEntry({ entry_id: 'e1', context_bucket: 'work' });
      const e2 = makeEntry({ entry_id: 'e2', context_bucket: 'entertainment' });
      const e3 = makeEntry({ entry_id: 'e3', context_bucket: 'work' });
      const e4 = makeEntry({ entry_id: 'e4', context_bucket: 'work', user_id: 'other_user' });

      await store.upsertEntry(e1);
      await store.upsertEntry(e2);
      await store.upsertEntry(e3);
      await store.upsertEntry(e4);

      const results = await store.getEntriesByUserContext(USER_ID, 'work');

      expect(results.length).toBe(2);
      expect(results.every((e) => e.context_bucket === 'work' && e.user_id === USER_ID)).toBe(true);
    });

    it('should return empty array when no entries match', async () => {
      const results = await store.getEntriesByUserContext(USER_ID, 'shopping');
      expect(results).toEqual([]);
    });
  });

  // ── getAllActiveEntries ──────────────────────────────────────────────────────

  describe('getAllActiveEntries', () => {
    it('should return non-deleted core and dream entries', async () => {
      const core = makeEntry({ entry_id: 'e_core', status: 'core' });
      const dream = makeEntry({ entry_id: 'e_dream', status: 'dream' });
      const forgotten = makeEntry({ entry_id: 'e_forgotten', status: 'forgotten' });
      const deleted = makeEntry({ entry_id: 'e_deleted', status: 'core', is_deleted: true });

      await store.upsertEntry(core);
      await store.upsertEntry(dream);
      await store.upsertEntry(forgotten);
      await store.upsertEntry(deleted);

      const results = await store.getAllActiveEntries(USER_ID);

      // Should include core and dream, but not forgotten or is_deleted
      const ids = results.map((e) => e.entry_id);
      expect(ids).toContain('e_core');
      expect(ids).toContain('e_dream');
      expect(ids).not.toContain('e_forgotten');
      expect(ids).not.toContain('e_deleted');
    });

    it('should return empty when no active entries exist', async () => {
      const results = await store.getAllActiveEntries(USER_ID);
      expect(results).toEqual([]);
    });
  });

  // ── softDeleteEntry ─────────────────────────────────────────────────────────

  describe('softDeleteEntry', () => {
    it('should set is_deleted flag and status to deleted', async () => {
      const entry = makeEntry({ entry_id: 'e_softdel' });
      await store.upsertEntry(entry);

      await store.softDeleteEntry('e_softdel');

      const stored = memoryStore.get('e_softdel') as MemoryEntry;
      expect(stored.is_deleted).toBe(true);
      expect(stored.status).toBe('deleted');
    });

    it('should be a no-op for non-existent entry', async () => {
      // Should not throw
      await store.softDeleteEntry('nonexistent');
      expect(memoryStore.has('nonexistent')).toBe(false);
    });
  });

  // ── appendEvent ─────────────────────────────────────────────────────────────

  describe('appendEvent', () => {
    it('should store an event with all fields', async () => {
      const event = await store.appendEvent(
        USER_ID,
        'blocked:crypto',
        'not_interested',
        'youtube',
        'entertainment',
        'video_123',
        'Crypto tutorial',
      );

      expect(eventsStore.length).toBe(1);
      const stored = eventsStore[0] as MemoryEvent;
      expect(stored.user_id).toBe(USER_ID);
      expect(stored.topic_key).toBe('blocked:crypto');
      expect(stored.action).toBe('not_interested');
      expect(stored.platform).toBe('youtube');
      expect(stored.context_bucket).toBe('entertainment');
      expect(stored.content_id).toBe('video_123');
      expect(stored.content_title).toBe('Crypto tutorial');
      expect(stored.event_id).toBeDefined();
      expect(stored.occurred_at).toBeGreaterThan(0);
    });

    it('should return the created event', async () => {
      const event = await store.appendEvent(
        USER_ID,
        'interested:react',
        'interested',
        'youtube',
        'learning',
        'vid_456',
      );

      expect(event.event_id).toBeDefined();
      expect(event.topic_key).toBe('interested:react');
    });

    it('should handle optional contentTitle', async () => {
      const event = await store.appendEvent(
        USER_ID,
        'test:topic',
        'not_interested',
        'twitter',
        'social',
        'tweet_789',
      );

      expect(event.content_title).toBeUndefined();
    });
  });

  // ── getEventsAfter ──────────────────────────────────────────────────────────

  describe('getEventsAfter', () => {
    it('should return events after a given timestamp', async () => {
      const baseTime = Date.now();

      // Add events at different times
      await store.appendEvent(USER_ID, 'topic:a', 'interested', 'youtube', 'entertainment', 'c1');
      // Manually set occurred_at on the stored events for testing
      (eventsStore[0] as MemoryEvent).occurred_at = baseTime - 10000; // old

      await store.appendEvent(USER_ID, 'topic:b', 'interested', 'youtube', 'entertainment', 'c2');
      (eventsStore[1] as MemoryEvent).occurred_at = baseTime + 5000; // after

      await store.appendEvent(USER_ID, 'topic:c', 'interested', 'youtube', 'entertainment', 'c3');
      (eventsStore[2] as MemoryEvent).occurred_at = baseTime + 10000; // after

      const results = await store.getEventsAfter(baseTime);

      expect(results.length).toBe(2);
      expect(results.every((e) => e.occurred_at >= baseTime)).toBe(true);
    });

    it('should return empty array when no events exist after timestamp', async () => {
      await store.appendEvent(USER_ID, 'topic:old', 'interested', 'youtube', 'entertainment', 'c1');
      (eventsStore[0] as MemoryEvent).occurred_at = 1000;

      const results = await store.getEventsAfter(Date.now());
      expect(results).toEqual([]);
    });
  });

  // ── clearAll ────────────────────────────────────────────────────────────────

  describe('clearAll', () => {
    it('should empty all stores', async () => {
      // Seed some data
      await store.upsertEntry(makeEntry({ entry_id: 'e_clear1' }));
      await store.appendEvent(USER_ID, 'topic:x', 'interested', 'youtube', 'entertainment', 'c1');

      expect(memoryStore.size).toBeGreaterThan(0);
      expect(eventsStore.length).toBeGreaterThan(0);

      await store.clearAll();

      // Our mock implementation actually clears the stores
      expect(memoryStore.size).toBe(0);
      expect(eventsStore.length).toBe(0);
      expect(cardsStore.size).toBe(0);
    });
  });

  // ── createBaseEntry ─────────────────────────────────────────────────────────

  describe('createBaseEntry', () => {
    it('should create and persist a base entry with defaults', async () => {
      const entry = await store.createBaseEntry(USER_ID, 'test:base', 'work', 'working_set');

      expect(entry.entry_id).toBeDefined();
      expect(entry.user_id).toBe(USER_ID);
      expect(entry.topic_key).toBe('test:base');
      expect(entry.context_bucket).toBe('work');
      expect(entry.memory_type).toBe('working_set');
      expect(entry.status).toBe('core');
      expect(entry.confidence).toBe(1.0);
      expect(entry.is_deleted).toBe(false);
      expect(entry.access_count).toBe(1);

      // Should be persisted
      expect(memoryStore.has(entry.entry_id)).toBe(true);
    });

    it('should apply overrides', async () => {
      const entry = await store.createBaseEntry(
        USER_ID,
        'test:override',
        'general',
        'facts_prefs',
        {
          confidence: 0.5,
          status: 'dream',
          value: { sentiment: 'negative' },
        },
      );

      expect(entry.confidence).toBe(0.5);
      expect(entry.status).toBe('dream');
      expect(entry.value.sentiment).toBe('negative');
    });
  });
});
