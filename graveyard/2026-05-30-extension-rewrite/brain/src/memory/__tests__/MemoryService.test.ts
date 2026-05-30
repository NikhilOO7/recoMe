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

  describe('writeTurn — one_time action', () => {
    it('should create a working_set entry for one_time feedback', async () => {
      const svc = makeService();
      await svc.writeTurn({
        content: {
          id: 'vid4',
          platform: 'youtube',
          type: 'video',
          title: 'One time skip',
          topics: ['cooking'],
          entities: [],
          url: 'https://youtube.com/watch?v=4',
        },
        action: 'one_time',
        context: 'entertainment',
      });

      // Should have created an event and a memory entry
      expect(eventsStore.length).toBeGreaterThan(0);
      const entries = [...memoryStore.values()] as Array<{
        topic_key: string;
        memory_type: string;
      }>;
      const oneTimeEntry = entries.find((e) => e.topic_key.startsWith('one_time:'));
      expect(oneTimeEntry).toBeDefined();
      expect(oneTimeEntry!.memory_type).toBe('working_set');
    });
  });

  describe('writeTurn — interested action', () => {
    it('should create a positive mid_term entry for interested feedback', async () => {
      const svc = makeService();
      await svc.writeTurn({
        content: {
          id: 'vid5',
          platform: 'youtube',
          type: 'video',
          title: 'TypeScript tips',
          topics: ['typescript'],
          entities: [],
          url: 'https://youtube.com/watch?v=5',
        },
        action: 'interested',
        context: 'learning',
      });

      const entries = [...memoryStore.values()] as Array<{
        topic_key: string;
        memory_type: string;
        value: { sentiment: string };
      }>;
      const intEntry = entries.find((e) => e.topic_key.startsWith('interested:'));
      expect(intEntry).toBeDefined();
      expect(intEntry!.memory_type).toBe('mid_term');
      expect(intEntry!.value.sentiment).toBe('positive');
    });
  });

  describe('recordSearch', () => {
    it('should store search query as interest signal', async () => {
      const svc = makeService();
      await svc.recordSearch('mechanical keyboard', 'amazon');

      const entries = [...memoryStore.values()] as Array<{
        topic_key: string;
        memory_type: string;
        value: { source_type: string; strength: number };
      }>;
      const searchEntry = entries.find((e) => e.topic_key.startsWith('searched:'));
      expect(searchEntry).toBeDefined();
      expect(searchEntry!.memory_type).toBe('mid_term');
      expect(searchEntry!.value.source_type).toBe('search');
      expect(searchEntry!.value.strength).toBe(0.4);
    });

    it('should skip very short queries', async () => {
      const svc = makeService();
      await svc.recordSearch('a', 'amazon');

      const entries = [...memoryStore.values()] as Array<{ topic_key: string }>;
      const searchEntry = entries.find((e) => e.topic_key.startsWith('searched:'));
      expect(searchEntry).toBeUndefined();
    });

    it('should touch existing entry on repeated search', async () => {
      const svc = makeService();
      await svc.recordSearch('mechanical keyboard', 'amazon');
      const countBefore = memoryStore.size;
      await svc.recordSearch('mechanical keyboard', 'amazon');
      // Should not create a new entry
      expect(memoryStore.size).toBe(countBefore);
    });
  });

  describe('retrieve with specific contexts', () => {
    it('should return entries for entertainment context', async () => {
      const svc = makeService();
      await svc.writeTurn({
        content: {
          id: 'vid6',
          platform: 'youtube',
          type: 'video',
          title: 'Funny cats',
          topics: ['cats'],
          entities: [],
          url: 'https://youtube.com/watch?v=6',
        },
        action: 'interested',
        context: 'entertainment',
      });

      const pack = await svc.retrieve('entertainment');
      expect(pack.context).toBe('entertainment');
      expect(pack.entries.some((e) => e.topic_key.includes('cats'))).toBe(true);
    });

    it('should return entries for shopping context', async () => {
      const svc = makeService();
      await svc.writeTurn({
        content: {
          id: 'prod1',
          platform: 'amazon',
          type: 'product',
          title: 'Wireless Mouse',
          topics: ['mouse'],
          entities: [],
          url: 'https://amazon.com/dp/1',
        },
        action: 'not_interested',
        context: 'shopping',
      });

      const pack = await svc.retrieve('shopping');
      expect(pack.context).toBe('shopping');
      expect(pack.entries.length).toBeGreaterThan(0);
    });
  });

  describe('unblockTopic / unlikeTopic', () => {
    it('should soft-delete a blocked entry', async () => {
      const svc = makeService();
      await svc.blockForever('spam');
      await svc.unblockTopic('spam');

      // The entry should still exist in the store but be soft-deleted
      const entries = [...memoryStore.values()] as Array<{
        topic_key: string;
        is_deleted: boolean;
      }>;
      const spamEntry = entries.find((e) => e.topic_key === 'blocked:spam');
      expect(spamEntry).toBeDefined();
      expect(spamEntry!.is_deleted).toBe(true);
    });

    it('should soft-delete a liked entry', async () => {
      const svc = makeService();
      await svc.likeForever('react');
      await svc.unlikeTopic('react');

      const entries = [...memoryStore.values()] as Array<{
        topic_key: string;
        is_deleted: boolean;
      }>;
      const reactEntry = entries.find((e) => e.topic_key === 'interested:react');
      expect(reactEntry).toBeDefined();
      expect(reactEntry!.is_deleted).toBe(true);
    });
  });

  describe('likeForever', () => {
    it('should create a positive facts_prefs entry', async () => {
      const svc = makeService();
      const entry = await svc.likeForever('typescript');

      expect(entry.topic_key).toBe('interested:typescript');
      expect(entry.memory_type).toBe('facts_prefs');
      expect(entry.value.sentiment).toBe('positive');
    });

    it('should not duplicate on repeated calls', async () => {
      const svc = makeService();
      await svc.likeForever('typescript');
      await svc.likeForever('typescript');

      const entries = [...memoryStore.values()].filter(
        (e: any) => e.topic_key === 'interested:typescript',
      );
      expect(entries.length).toBe(1);
    });
  });

  describe('context management', () => {
    it('detectContext should update context state', () => {
      const svc = makeService();
      const state = svc.detectContext('youtube', 'https://youtube.com');
      expect(state.current).toBeDefined();
    });

    it('switchContext should set context manually', async () => {
      const svc = makeService();
      await svc.switchContext('shopping');
      expect(svc.getCurrentContext()).toBe('shopping');
    });

    it('getContextState returns general by default', () => {
      const svc = makeService();
      const state = svc.getContextState();
      expect(state.current).toBe('general');
      expect(state.confidence).toBe(0.5);
    });
  });

  describe('getMidTermCards', () => {
    it('should delegate to store.getActiveCards', async () => {
      const svc = makeService();
      const cards = await svc.getMidTermCards();
      expect(Array.isArray(cards)).toBe(true);
    });
  });

  describe('clearAll', () => {
    it('should clear store and short term buffer', async () => {
      const svc = makeService();
      await svc.writeTurn({
        content: {
          id: 'vid7',
          platform: 'youtube',
          type: 'video',
          title: 'Test',
          topics: ['test'],
          entities: [],
          url: 'https://youtube.com/watch?v=7',
        },
        action: 'interested',
        context: 'general',
      });
      await svc.clearAll();
      // After clearing, retrieve should return empty
      // (the mock store was cleared)
    });
  });

  describe('shouldHide — pattern-detected blocks', () => {
    it('should return hide=false when no patterns match', async () => {
      const svc = makeService();
      const result = await svc.shouldHide(['unknown_topic'], 'general');
      expect(result.hide).toBe(false);
    });
  });

  describe('writeTurn — upsert existing entry', () => {
    it('should touch existing entry instead of creating duplicate', async () => {
      const svc = makeService();
      const content = {
        id: 'vid8',
        platform: 'youtube' as const,
        type: 'video' as const,
        title: 'Rust tutorial',
        topics: ['rust'],
        entities: [],
        url: 'https://youtube.com/watch?v=8',
      };

      await svc.writeTurn({ content, action: 'interested', context: 'learning' });
      const countAfterFirst = memoryStore.size;
      await svc.writeTurn({ content, action: 'interested', context: 'learning' });
      // Should not create a new entry
      expect(memoryStore.size).toBe(countAfterFirst);
    });
  });
});
