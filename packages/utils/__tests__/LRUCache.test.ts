import { LRUCache } from '../LRUCache';

describe('LRUCache', () => {
  // ── Basic get/set ─────────────────────────────────────────────────────────

  describe('get and set', () => {
    it('returns undefined for a missing key', () => {
      const cache = new LRUCache<string, number>(10, 60_000);
      expect(cache.get('missing')).toBeUndefined();
    });

    it('stores and retrieves a value', () => {
      const cache = new LRUCache<string, number>(10, 60_000);
      cache.set('a', 1);
      expect(cache.get('a')).toBe(1);
    });

    it('overwrites existing value', () => {
      const cache = new LRUCache<string, number>(10, 60_000);
      cache.set('a', 1);
      cache.set('a', 2);
      expect(cache.get('a')).toBe(2);
    });

    it('stores multiple keys', () => {
      const cache = new LRUCache<string, string>(10, 60_000);
      cache.set('x', 'hello');
      cache.set('y', 'world');
      expect(cache.get('x')).toBe('hello');
      expect(cache.get('y')).toBe('world');
    });
  });

  // ── size ──────────────────────────────────────────────────────────────────

  describe('size', () => {
    it('starts at 0', () => {
      const cache = new LRUCache<string, number>(5, 60_000);
      expect(cache.size).toBe(0);
    });

    it('increases as items are added', () => {
      const cache = new LRUCache<string, number>(5, 60_000);
      cache.set('a', 1);
      cache.set('b', 2);
      expect(cache.size).toBe(2);
    });

    it('does not increase when overwriting', () => {
      const cache = new LRUCache<string, number>(5, 60_000);
      cache.set('a', 1);
      cache.set('a', 2);
      expect(cache.size).toBe(1);
    });
  });

  // ── Capacity eviction ─────────────────────────────────────────────────────

  describe('capacity eviction', () => {
    it('evicts oldest entry when full', () => {
      const cache = new LRUCache<string, number>(3, 60_000);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      // Cache is full, adding 'd' should evict 'a' (oldest)
      cache.set('d', 4);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
      expect(cache.size).toBe(3);
    });

    it('evicts least recently used, not just oldest inserted', () => {
      const cache = new LRUCache<string, number>(3, 60_000);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      // Access 'a' to make it recently used
      cache.get('a');
      // Now add 'd' — 'b' should be evicted (least recently used)
      cache.set('d', 4);
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('a')).toBe(1);
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
    });

    it('never exceeds capacity', () => {
      const cache = new LRUCache<number, number>(2, 60_000);
      for (let i = 0; i < 100; i++) {
        cache.set(i, i);
      }
      expect(cache.size).toBe(2);
    });
  });

  // ── TTL expiration ────────────────────────────────────────────────────────

  describe('TTL expiration', () => {
    it('returns undefined for expired entries on get', () => {
      const cache = new LRUCache<string, number>(10, 50); // 50ms TTL
      cache.set('a', 1);

      // Wait for expiration
      const start = Date.now();
      while (Date.now() - start < 60) {
        // busy wait
      }

      expect(cache.get('a')).toBeUndefined();
    });

    it('has() returns false for expired entries', () => {
      const cache = new LRUCache<string, number>(10, 50);
      cache.set('a', 1);

      const start = Date.now();
      while (Date.now() - start < 60) {
        // busy wait
      }

      expect(cache.has('a')).toBe(false);
    });

    it('non-expired entries are still accessible', () => {
      const cache = new LRUCache<string, number>(10, 60_000);
      cache.set('a', 1);
      expect(cache.get('a')).toBe(1);
      expect(cache.has('a')).toBe(true);
    });
  });

  // ── delete ────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('removes an existing entry', () => {
      const cache = new LRUCache<string, number>(10, 60_000);
      cache.set('a', 1);
      cache.delete('a');
      expect(cache.get('a')).toBeUndefined();
      expect(cache.size).toBe(0);
    });

    it('does not throw when deleting non-existent key', () => {
      const cache = new LRUCache<string, number>(10, 60_000);
      expect(() => cache.delete('missing')).not.toThrow();
    });

    it('does not affect other entries', () => {
      const cache = new LRUCache<string, number>(10, 60_000);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.delete('a');
      expect(cache.get('b')).toBe(2);
      expect(cache.size).toBe(1);
    });
  });

  // ── clear ─────────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('removes all entries', () => {
      const cache = new LRUCache<string, number>(10, 60_000);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBeUndefined();
    });

    it('allows new entries after clearing', () => {
      const cache = new LRUCache<string, number>(10, 60_000);
      cache.set('a', 1);
      cache.clear();
      cache.set('b', 2);
      expect(cache.get('b')).toBe(2);
      expect(cache.size).toBe(1);
    });
  });

  // ── has ───────────────────────────────────────────────────────────────────

  describe('has', () => {
    it('returns true for existing key', () => {
      const cache = new LRUCache<string, number>(10, 60_000);
      cache.set('a', 1);
      expect(cache.has('a')).toBe(true);
    });

    it('returns false for missing key', () => {
      const cache = new LRUCache<string, number>(10, 60_000);
      expect(cache.has('missing')).toBe(false);
    });

    it('returns false after deletion', () => {
      const cache = new LRUCache<string, number>(10, 60_000);
      cache.set('a', 1);
      cache.delete('a');
      expect(cache.has('a')).toBe(false);
    });
  });

  // ── LRU ordering ──────────────────────────────────────────────────────────

  describe('LRU ordering', () => {
    it('accessing an item moves it to front (prevents eviction)', () => {
      const cache = new LRUCache<string, number>(3, 60_000);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Access 'a' — it becomes most recently used
      cache.get('a');

      // Insert two more to evict 'b' and 'c'
      cache.set('d', 4);
      cache.set('e', 5);

      expect(cache.get('a')).toBe(1); // 'a' survived
      expect(cache.get('b')).toBeUndefined(); // 'b' was evicted
      expect(cache.get('c')).toBeUndefined(); // 'c' was evicted
    });

    it('set overwrites without affecting capacity', () => {
      const cache = new LRUCache<string, number>(2, 60_000);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('a', 10); // overwrite, not a new entry
      cache.set('c', 3); // should evict 'b', not 'a'

      expect(cache.get('a')).toBe(10);
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBe(3);
    });
  });

  // ── invalidate ────────────────────────────────────────────────────────────

  describe('invalidate', () => {
    it('removes entries matching predicate', () => {
      const cache = new LRUCache<string, number>(10, 60_000);
      cache.set('user:1', 1);
      cache.set('user:2', 2);
      cache.set('item:1', 10);

      cache.invalidate((key) => key.startsWith('user:'));

      expect(cache.get('user:1')).toBeUndefined();
      expect(cache.get('user:2')).toBeUndefined();
      expect(cache.get('item:1')).toBe(10);
    });

    it('does nothing when no entries match', () => {
      const cache = new LRUCache<string, number>(10, 60_000);
      cache.set('a', 1);
      cache.invalidate(() => false);
      expect(cache.get('a')).toBe(1);
      expect(cache.size).toBe(1);
    });
  });
});
