interface CacheEntry<V> {
  value: V;
  expiresAt: number;
  lastAccessed: number;
}

/**
 * Generic LRU cache with TTL support.
 * Used by intelligence services to avoid redundant IndexedDB reads.
 */
export class LRUCache<K, V> {
  private readonly capacity: number;
  private readonly ttlMs: number;
  private readonly cache: Map<K, CacheEntry<V>>;

  constructor(capacity: number, ttlMs: number) {
    this.capacity = capacity;
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // LRU: re-insert to mark as recently used
    entry.lastAccessed = Date.now();
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      this.evictLRU();
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
      lastAccessed: Date.now(),
    });
  }

  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key: K): void {
    this.cache.delete(key);
  }

  invalidate(predicate: (key: K) => boolean): void {
    for (const key of this.cache.keys()) {
      if (predicate(key)) this.cache.delete(key);
    }
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  private evictLRU(): void {
    let oldest: K | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldest = key;
      }
    }

    if (oldest !== null) this.cache.delete(oldest);
  }
}
