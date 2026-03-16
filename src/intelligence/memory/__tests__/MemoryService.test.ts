import { MemoryService } from '../MemoryService';
import { MemoryStore } from '../storage/MemoryStore';
import { ContextDetector } from '../ContextDetector';
import { PatternDetector } from '../PatternDetector';
import { DecayManager } from '../DecayManager';

// ── Mock IndexedDB ─────────────────────────────────────────────────────────────

const memoryStore = new Map<string, unknown>();
const eventsStore: unknown[] = [];
const cardsStore = new Map<string, unknown>();

jest.mock('@data/db', () => ({
  getDB: jest.fn().mockResolvedValue({
    put: jest.fn().mockImplementation((_store: string, value: { entry_id?: string; card_id?: string }) => {
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
    getAllFromIndex: jest.fn().mockImplementation((_store: string, index: string, query: unknown) => {
      if (_store === 'memory_entries') {
        const entries = [...memoryStore.values()] as Array<{ user_id: string; context_bucket: string; status: string; topic_key: string; is_deleted: boolean }>;
        if (index === 'by_user_context') {
          const [uid, ctx] = query as [string, string];
          return Promise.resolve(entries.filter((e) => e.user_id === uid && e.context_bucket === ctx));
        }
        if (index === 'by_status') {
          const [uid, status] = query as [string, string];
          return Promise.resolve(entries.filter((e) => e.user_id === uid && e.status === status));
        }
        if (index === 'by_topic') {
          const [uid, topicKey] = query as [string, string];
          return Promise.resolve(entries.filter((e) => e.user_id === uid && e.topic_key === topicKey));
        }
      }
      if (_store === 'memory_events') {
        const events = [...eventsStore] as Array<{ topic_key: string }>;
        if (index === 'by_topic') return Promise.resolve(events.filter((e) => e.topic_key === query));
      }
      if (_store === 'mid_term_cards') {
        const cards = [...cardsStore.values()] as Array<{ user_id: string; context_bucket: string }>;
        if (index === 'by_user_context') {
          const [uid, ctx] = query as [string, string];
          return Promise.resolve(cards.filter((c) => c.user_id === uid && c.context_bucket === ctx));
        }
      }
      return Promise.resolve([]);
    }),
    clear: jest.fn().mockResolvedValue(undefined),
    count: jest.fn().mockResolvedValue(0),
  }),
}));

// ── Factory ─────────────────────────────────────────────────────────────────────

function makeService(): MemoryService {
  const store = new MemoryStore();
  const contextDetector = new ContextDetector();
  const patternDetector = new PatternDetector(store);
  const decayManager = new DecayManager(store);
  return new MemoryService(store, contextDetector, patternDetector, decayManager);
}

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('MemoryService', () => {
  beforeEach(() => {
    memoryStore.clear();
    eventsStore.length = 0;
    cardsStore.clear();
  });

  describe('blockForever', () => {
    it('should create a facts_prefs entry in general context', async () => {
      const svc = makeService();
      const entry = await svc.blockForever('crypto');

      expect(entry.topic_key).toBe('blocked:crypto');
      expect(entry.memory_type).toBe('facts_prefs');
      expect(entry.context_bucket).toBe('general');
      expect(entry.status).toBe('core');
      expect(entry.value.sentiment).toBe('negative');
    });

    it('should not create duplicate entries', async () => {
      const svc = makeService();
      await svc.blockForever('crypto');
      await svc.blockForever('crypto');

      const cryptoEntries = [...memoryStore.values()].filter(
        (e: unknown) => (e as { topic_key: string }).topic_key === 'blocked:crypto',
      );
      expect(cryptoEntries.length).toBe(1);
    });
  });

  describe('shouldHide', () => {
    it('should return hide=true for a directly blocked topic', async () => {
      const svc = makeService();
      await svc.blockForever('crypto');

      const result = await svc.shouldHide(['bitcoin', 'crypto'], 'work');
      expect(result.hide).toBe(true);
      expect(result.reason).toContain('crypto');
    });

    it('should return hide=false for topics not blocked', async () => {
      const svc = makeService();
      const result = await svc.shouldHide(['react', 'typescript'], 'work');
      expect(result.hide).toBe(false);
    });

    it('should always include general overlay regardless of context', async () => {
      const svc = makeService();
      await svc.blockForever('mlm');

      // Ask in entertainment context — general overlay should still apply
      const result = await svc.shouldHide(['mlm', 'pyramid scheme'], 'entertainment');
      expect(result.hide).toBe(true);
    });
  });

  describe('retrieve', () => {
    it('should always include general_overlay in the pack', async () => {
      const svc = makeService();
      await svc.blockForever('spam');

      const pack = await svc.retrieve('entertainment');
      expect(pack.context).toBe('entertainment');
      expect(pack.general_overlay).toBeDefined();
      expect(pack.general_overlay.entries.some((e) => e.topic_key === 'blocked:spam')).toBe(true);
    });
  });

  describe('writeTurn', () => {
    it('should write memory events for negative feedback', async () => {
      const svc = makeService();
      await svc.writeTurn({
        content: {
          id: 'video1',
          platform: 'youtube',
          type: 'video',
          title: 'All about Crypto',
          topics: ['crypto'],
          entities: [],
          url: 'https://youtube.com/watch?v=1',
        },
        action: 'not_interested',
        context: 'work',
      });

      expect(eventsStore.length).toBeGreaterThan(0);
    });

    it('should call blockForever when action is block_forever', async () => {
      const svc = makeService();
      const spy = jest.spyOn(svc, 'blockForever');

      await svc.writeTurn({
        content: {
          id: 'video2',
          platform: 'youtube',
          type: 'video',
          title: 'NFT tutorial',
          topics: ['nft'],
          entities: [],
          url: 'https://youtube.com/watch?v=2',
        },
        action: 'block_forever',
        context: 'general',
      });

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('shouldBoost', () => {
    it('should return true for an interested topic', async () => {
      const svc = makeService();
      await svc.writeTurn({
        content: {
          id: 'vid3',
          platform: 'youtube',
          type: 'video',
          title: 'React hooks deep dive',
          topics: ['react'],
          entities: [],
          url: 'https://youtube.com/watch?v=3',
        },
        action: 'interested',
        context: 'learning',
      });

      const boost = await svc.shouldBoost(['react'], 'learning');
      expect(boost).toBe(true);
    });
  });
});
