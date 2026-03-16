import { PatternDetector } from '../PatternDetector';
import { MemoryStore } from '../storage/MemoryStore';
import type { MemoryEvent, MidTermCard } from '@shared/types';

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
          const events = [...eventsStore] as Array<{ topic_key: string }>;
          if (index === 'by_topic')
            return Promise.resolve(events.filter((e) => e.topic_key === query));
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
    clear: jest.fn().mockResolvedValue(undefined),
    count: jest.fn().mockResolvedValue(0),
  }),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────────

const USER_ID = 'test_user';

function makeEvent(overrides: Partial<MemoryEvent> = {}): MemoryEvent {
  return {
    event_id: `evt_${Math.random().toString(36).slice(2, 8)}`,
    user_id: USER_ID,
    occurred_at: Date.now(),
    platform: 'youtube',
    context_bucket: 'entertainment',
    topic_key: 'blocked:crypto',
    action: 'not_interested',
    content_id: 'video_123',
    content_title: 'Crypto tutorial',
    ...overrides,
  };
}

function seedEvents(
  topicKey: string,
  count: number,
  action: MemoryEvent['action'] = 'not_interested',
): void {
  for (let i = 0; i < count; i++) {
    eventsStore.push(
      makeEvent({
        topic_key: topicKey,
        action,
        user_id: USER_ID,
        event_id: `evt_${i}_${Math.random().toString(36).slice(2, 8)}`,
        occurred_at: Date.now() - (count - i) * 1000,
      }),
    );
  }
}

function seedCard(card: MidTermCard): void {
  cardsStore.set(card.card_id, card);
}

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('PatternDetector', () => {
  let store: MemoryStore;
  let detector: PatternDetector;

  beforeEach(() => {
    memoryStore.clear();
    eventsStore.length = 0;
    cardsStore.clear();

    store = new MemoryStore();
    detector = new PatternDetector(store);
  });

  // ── processEvent below threshold ────────────────────────────────────────────

  describe('processEvent below threshold', () => {
    it('should NOT create a card when event count is below PATTERN_THRESHOLD (3)', async () => {
      // Seed only 2 events (below threshold of 3)
      seedEvents('blocked:crypto', 2);

      const event = makeEvent({ topic_key: 'blocked:crypto' });
      const result = await detector.processEvent(event, USER_ID);

      expect(result).toBeNull();
      expect(cardsStore.size).toBe(0);
    });

    it('should return null for events with no pattern type (unknown action)', async () => {
      seedEvents('blocked:crypto', 5);

      const event = makeEvent({
        topic_key: 'blocked:crypto',
        action: 'unknown_action' as MemoryEvent['action'],
      });
      const result = await detector.processEvent(event, USER_ID);

      expect(result).toBeNull();
    });
  });

  // ── processEvent at threshold ───────────────────────────────────────────────

  describe('processEvent at threshold', () => {
    it('should create a card when event count reaches PATTERN_THRESHOLD (3)', async () => {
      // Seed exactly 3 not_interested events
      seedEvents('blocked:crypto', 3);

      const event = makeEvent({ topic_key: 'blocked:crypto', action: 'not_interested' });
      const result = await detector.processEvent(event, USER_ID);

      expect(result).not.toBeNull();
      expect(result!.topic_key).toBe('blocked:crypto');
      expect(result!.pattern_type).toBe('block_pattern');
      expect(result!.status).toBe('core');
      expect(result!.user_id).toBe(USER_ID);
    });

    it('should create an interest_pattern card for "interested" actions', async () => {
      seedEvents('interested:react', 3, 'interested');

      const event = makeEvent({
        topic_key: 'interested:react',
        action: 'interested',
        context_bucket: 'learning',
      });
      const result = await detector.processEvent(event, USER_ID);

      expect(result).not.toBeNull();
      expect(result!.pattern_type).toBe('interest_pattern');
    });

    it('should create a research_pattern card for "one_time" actions', async () => {
      seedEvents('one_time:laptop_review', 3, 'one_time');

      const event = makeEvent({
        topic_key: 'one_time:laptop_review',
        action: 'one_time',
        context_bucket: 'shopping',
      });
      const result = await detector.processEvent(event, USER_ID);

      expect(result).not.toBeNull();
      expect(result!.pattern_type).toBe('research_pattern');
    });

    it('should reinforce an existing card instead of creating a duplicate', async () => {
      // Seed existing card
      const existingCard: MidTermCard = {
        card_id: 'card_existing',
        user_id: USER_ID,
        context_bucket: 'entertainment',
        pattern_type: 'block_pattern',
        topic_key: 'blocked:crypto',
        occurrence_count: 3,
        last_seen_at: Date.now() - 10000,
        first_seen_at: Date.now() - 100000,
        confidence: 0.5,
        platforms: ['youtube'],
        status: 'core',
        created_at: Date.now() - 100000,
        updated_at: Date.now() - 10000,
      };
      seedCard(existingCard);

      // Seed enough events to pass threshold
      seedEvents('blocked:crypto', 4);

      const event = makeEvent({ topic_key: 'blocked:crypto', action: 'not_interested' });
      const result = await detector.processEvent(event, USER_ID);

      expect(result).not.toBeNull();
      expect(result!.card_id).toBe('card_existing');
      expect(result!.occurrence_count).toBe(4); // incremented from 3
    });
  });

  // ── matchCards ──────────────────────────────────────────────────────────────

  describe('matchCards', () => {
    it('should return matching cards for given topics', async () => {
      const card: MidTermCard = {
        card_id: 'card_match',
        user_id: USER_ID,
        context_bucket: 'entertainment',
        pattern_type: 'block_pattern',
        topic_key: 'blocked:crypto',
        occurrence_count: 5,
        last_seen_at: Date.now(),
        first_seen_at: Date.now() - 50000,
        confidence: 0.7,
        platforms: ['youtube'],
        status: 'core',
        created_at: Date.now() - 50000,
        updated_at: Date.now(),
      };
      seedCard(card);

      const matches = await detector.matchCards(USER_ID, 'entertainment', ['crypto', 'bitcoin']);

      expect(matches.length).toBe(1);
      expect(matches[0]!.card_id).toBe('card_match');
    });

    it('should return empty array for unmatched topics', async () => {
      const card: MidTermCard = {
        card_id: 'card_nomatch',
        user_id: USER_ID,
        context_bucket: 'entertainment',
        pattern_type: 'block_pattern',
        topic_key: 'blocked:crypto',
        occurrence_count: 5,
        last_seen_at: Date.now(),
        first_seen_at: Date.now() - 50000,
        confidence: 0.7,
        platforms: ['youtube'],
        status: 'core',
        created_at: Date.now() - 50000,
        updated_at: Date.now(),
      };
      seedCard(card);

      const matches = await detector.matchCards(USER_ID, 'entertainment', ['react', 'typescript']);

      expect(matches).toEqual([]);
    });

    it('should not match cards with forgotten status', async () => {
      const card: MidTermCard = {
        card_id: 'card_forgotten',
        user_id: USER_ID,
        context_bucket: 'entertainment',
        pattern_type: 'block_pattern',
        topic_key: 'blocked:crypto',
        occurrence_count: 5,
        last_seen_at: Date.now() - 200000,
        first_seen_at: Date.now() - 500000,
        confidence: 0.3,
        platforms: ['youtube'],
        status: 'forgotten',
        created_at: Date.now() - 500000,
        updated_at: Date.now() - 200000,
      };
      seedCard(card);

      const matches = await detector.matchCards(USER_ID, 'entertainment', ['crypto']);

      expect(matches).toEqual([]);
    });

    it('should match cards with dream status', async () => {
      const card: MidTermCard = {
        card_id: 'card_dream',
        user_id: USER_ID,
        context_bucket: 'entertainment',
        pattern_type: 'block_pattern',
        topic_key: 'blocked:crypto',
        occurrence_count: 5,
        last_seen_at: Date.now(),
        first_seen_at: Date.now() - 50000,
        confidence: 0.4,
        platforms: ['youtube'],
        status: 'dream',
        created_at: Date.now() - 50000,
        updated_at: Date.now(),
      };
      seedCard(card);

      const matches = await detector.matchCards(USER_ID, 'entertainment', ['crypto']);

      expect(matches.length).toBe(1);
    });

    it('should not return cards from a different context', async () => {
      const card: MidTermCard = {
        card_id: 'card_other_ctx',
        user_id: USER_ID,
        context_bucket: 'work',
        pattern_type: 'block_pattern',
        topic_key: 'blocked:crypto',
        occurrence_count: 5,
        last_seen_at: Date.now(),
        first_seen_at: Date.now() - 50000,
        confidence: 0.7,
        platforms: ['youtube'],
        status: 'core',
        created_at: Date.now() - 50000,
        updated_at: Date.now(),
      };
      seedCard(card);

      const matches = await detector.matchCards(USER_ID, 'entertainment', ['crypto']);

      expect(matches).toEqual([]);
    });
  });

  // ── Confidence increases with more events ───────────────────────────────────

  describe('confidence scaling', () => {
    it('should have higher confidence with more events', async () => {
      // First: create a card with exactly threshold events
      seedEvents('blocked:spam', 3);
      const event1 = makeEvent({ topic_key: 'blocked:spam', action: 'not_interested' });
      const card1 = await detector.processEvent(event1, USER_ID);
      expect(card1).not.toBeNull();
      const conf1 = card1!.confidence;

      // Reinforce with more events
      seedEvents('blocked:spam', 3); // total now 6
      const event2 = makeEvent({ topic_key: 'blocked:spam', action: 'not_interested' });
      const card2 = await detector.processEvent(event2, USER_ID);
      expect(card2).not.toBeNull();
      const conf2 = card2!.confidence;

      expect(conf2).toBeGreaterThan(conf1);
    });

    it('should cap confidence at 1.0', async () => {
      // Seed a card with high confidence
      const card: MidTermCard = {
        card_id: 'card_high_conf',
        user_id: USER_ID,
        context_bucket: 'entertainment',
        pattern_type: 'block_pattern',
        topic_key: 'blocked:maxconf',
        occurrence_count: 100,
        last_seen_at: Date.now(),
        first_seen_at: Date.now() - 500000,
        confidence: 0.98,
        platforms: ['youtube'],
        status: 'core',
        created_at: Date.now() - 500000,
        updated_at: Date.now(),
      };
      seedCard(card);
      seedEvents('blocked:maxconf', 5);

      const event = makeEvent({ topic_key: 'blocked:maxconf', action: 'not_interested' });
      const result = await detector.processEvent(event, USER_ID);

      expect(result).not.toBeNull();
      expect(result!.confidence).toBeLessThanOrEqual(1.0);
    });
  });
});
