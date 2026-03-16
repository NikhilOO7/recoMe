# RecoMe Improved Architecture

> Production-ready architecture with scalability, performance, and maintainability in mind.

---

## Table of Contents

1. [Architecture Principles](#architecture-principles)
2. [Improved Component Design](#improved-component-design)
3. [Data Layer Optimization](#data-layer-optimization)
4. [Performance Strategies](#performance-strategies)
5. [Error Handling & Recovery](#error-handling--recovery)
6. [Testing Architecture](#testing-architecture)
7. [Deployment & Updates](#deployment--updates)
8. [Future Scaling](#future-scaling)

---

## Architecture Principles

### Core Design Principles

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ARCHITECTURE PRINCIPLES                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. SEPARATION OF CONCERNS                                                  │
│  ─────────────────────────                                                  │
│  • Content scripts: DOM only, no business logic                             │
│  • Background: All intelligence, coordination                               │
│  • Popup: Pure UI, state from background                                    │
│                                                                             │
│  2. SINGLE SOURCE OF TRUTH                                                  │
│  ─────────────────────────                                                  │
│  • IndexedDB is authoritative for all persistent data                       │
│  • Memory cache is ephemeral, derived from IndexedDB                        │
│  • No duplicate state across components                                     │
│                                                                             │
│  3. EVENTUAL CONSISTENCY                                                    │
│  ─────────────────────────                                                  │
│  • UI updates optimistically                                                │
│  • Background confirms/corrects                                             │
│  • Graceful handling of sync delays                                         │
│                                                                             │
│  4. FAIL GRACEFULLY                                                         │
│  ─────────────────────────                                                  │
│  • Show content if recommendation fails                                     │
│  • Cache provides fallback when DB unavailable                              │
│  • No crashes, only degraded functionality                                  │
│                                                                             │
│  5. PRIVACY BY DEFAULT                                                      │
│  ─────────────────────────                                                  │
│  • All data stored locally                                                  │
│  • No telemetry without explicit consent                                    │
│  • User owns and controls their data                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Layer Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          LAYER ARCHITECTURE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     PRESENTATION LAYER                               │   │
│  │                                                                     │   │
│  │   Content Scripts          Popup UI            Options Page         │   │
│  │   (DOM manipulation)       (React)             (React)              │   │
│  │                                                                     │   │
│  │   • Platform adapters      • Dashboard         • Settings           │   │
│  │   • UI injection           • Stats             • Data management    │   │
│  │   • Event handling         • Preferences       • Export/Import      │   │
│  │                                                                     │   │
│  └───────────────────────────────┬─────────────────────────────────────┘   │
│                                  │                                          │
│                      Message Passing (chrome.runtime)                       │
│                                  │                                          │
│  ┌───────────────────────────────┴─────────────────────────────────────┐   │
│  │                      APPLICATION LAYER                               │   │
│  │                     (Background Service)                             │   │
│  │                                                                     │   │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐    │   │
│  │   │  Message    │  │   Alarm     │  │      API Gateway        │    │   │
│  │   │  Router     │  │   Manager   │  │  (rate limiting, auth)  │    │   │
│  │   └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘    │   │
│  │          │                │                     │                   │   │
│  │          └────────────────┴─────────────────────┘                   │   │
│  │                           │                                         │   │
│  └───────────────────────────┼─────────────────────────────────────────┘   │
│                              │                                              │
│  ┌───────────────────────────┴─────────────────────────────────────────┐   │
│  │                       DOMAIN LAYER                                   │   │
│  │                                                                     │   │
│  │   ┌─────────────────┐  ┌─────────────────┐  ┌───────────────────┐  │   │
│  │   │  MemoryService  │  │  GraphService   │  │ RecommendService  │  │   │
│  │   │                 │  │                 │  │                   │  │   │
│  │   │ • writeTurn     │  │ • addEntity     │  │ • recommend       │  │   │
│  │   │ • retrieve      │  │ • addRelation   │  │ • learnFeedback   │  │   │
│  │   │ • shouldHide    │  │ • getAffinity   │  │ • explain         │  │   │
│  │   │ • runDecay      │  │ • traverse      │  │                   │  │   │
│  │   └─────────────────┘  └─────────────────┘  └───────────────────┘  │   │
│  │                                                                     │   │
│  │   ┌─────────────────┐  ┌─────────────────┐  ┌───────────────────┐  │   │
│  │   │ ContextService  │  │ PatternService  │  │ ExtractionService │  │   │
│  │   │                 │  │                 │  │                   │  │   │
│  │   │ • detect        │  │ • detect        │  │ • extract         │  │   │
│  │   │ • switch        │  │ • createCard    │  │ • ruleBasedExtract│  │   │
│  │   │ • getState      │  │ • updateCard    │  │ • llmExtract      │  │   │
│  │   └─────────────────┘  └─────────────────┘  └───────────────────┘  │   │
│  │                                                                     │   │
│  └───────────────────────────┬─────────────────────────────────────────┘   │
│                              │                                              │
│  ┌───────────────────────────┴─────────────────────────────────────────┐   │
│  │                    INFRASTRUCTURE LAYER                              │   │
│  │                                                                     │   │
│  │   ┌─────────────────┐  ┌─────────────────┐  ┌───────────────────┐  │   │
│  │   │   MemoryStore   │  │   GraphStore    │  │    CacheStore     │  │   │
│  │   │   (IndexedDB)   │  │   (IndexedDB)   │  │   (In-Memory)     │  │   │
│  │   └─────────────────┘  └─────────────────┘  └───────────────────┘  │   │
│  │                                                                     │   │
│  │   ┌─────────────────┐  ┌─────────────────┐  ┌───────────────────┐  │   │
│  │   │  SettingsStore  │  │   SyncService   │  │   LoggerService   │  │   │
│  │   │ (ChromeStorage) │  │   (Future)      │  │                   │  │   │
│  │   └─────────────────┘  └─────────────────┘  └───────────────────┘  │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Improved Component Design

### Dependency Injection Pattern

```typescript
// src/intelligence/container.ts

export interface IContainer {
  get<T>(token: string): T;
  register<T>(token: string, factory: () => T): void;
}

export class Container implements IContainer {
  private factories = new Map<string, () => unknown>();
  private instances = new Map<string, unknown>();
  
  register<T>(token: string, factory: () => T): void {
    this.factories.set(token, factory);
  }
  
  get<T>(token: string): T {
    // Singleton pattern
    if (this.instances.has(token)) {
      return this.instances.get(token) as T;
    }
    
    const factory = this.factories.get(token);
    if (!factory) {
      throw new Error(`No factory registered for: ${token}`);
    }
    
    const instance = factory() as T;
    this.instances.set(token, instance);
    return instance;
  }
}

// Usage
const container = new Container();

// Register dependencies
container.register('MemoryStore', () => new MemoryStore());
container.register('GraphStore', () => new GraphStore());
container.register('Cache', () => new LRUCache({ max: 1000 }));

container.register('MemoryService', () => new MemoryService(
  container.get('MemoryStore'),
  container.get('Cache')
));

container.register('GraphService', () => new GraphService(
  container.get('GraphStore'),
  container.get('Cache')
));

container.register('RecommendationEngine', () => new RecommendationEngine(
  container.get('MemoryService'),
  container.get('GraphService')
));

// Export singleton
export const appContainer = container;
```

### Repository Pattern for Data Access

```typescript
// src/data/repositories/IRepository.ts

export interface IRepository<T, ID> {
  findById(id: ID): Promise<T | null>;
  findAll(): Promise<T[]>;
  findByQuery(query: QueryOptions): Promise<T[]>;
  save(entity: T): Promise<T>;
  saveBatch(entities: T[]): Promise<T[]>;
  delete(id: ID): Promise<void>;
  count(query?: QueryOptions): Promise<number>;
}

export interface QueryOptions {
  where?: Record<string, unknown>;
  orderBy?: { field: string; direction: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
}

// src/data/repositories/MemoryEntryRepository.ts

export class MemoryEntryRepository implements IRepository<MemoryEntry, string> {
  constructor(private db: IDBDatabase) {}
  
  async findById(id: string): Promise<MemoryEntry | null> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('memory_entries', 'readonly');
      const store = tx.objectStore('memory_entries');
      const request = store.get(id);
      
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }
  
  async findByQuery(query: QueryOptions): Promise<MemoryEntry[]> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('memory_entries', 'readonly');
      const store = tx.objectStore('memory_entries');
      
      // Use index if available
      const indexName = this.getIndexForQuery(query.where);
      const target = indexName ? store.index(indexName) : store;
      
      const results: MemoryEntry[] = [];
      const request = target.openCursor();
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          if (this.matchesQuery(cursor.value, query.where)) {
            results.push(cursor.value);
          }
          cursor.continue();
        } else {
          // Apply sorting and pagination
          const sorted = this.sortResults(results, query.orderBy);
          const paginated = this.paginateResults(sorted, query.offset, query.limit);
          resolve(paginated);
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }
  
  async save(entity: MemoryEntry): Promise<MemoryEntry> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('memory_entries', 'readwrite');
      const store = tx.objectStore('memory_entries');
      
      entity.updated_at = Date.now();
      const request = store.put(entity);
      
      request.onsuccess = () => resolve(entity);
      request.onerror = () => reject(request.error);
    });
  }
  
  // Batch operations for performance
  async saveBatch(entities: MemoryEntry[]): Promise<MemoryEntry[]> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('memory_entries', 'readwrite');
      const store = tx.objectStore('memory_entries');
      const now = Date.now();
      
      for (const entity of entities) {
        entity.updated_at = now;
        store.put(entity);
      }
      
      tx.oncomplete = () => resolve(entities);
      tx.onerror = () => reject(tx.error);
    });
  }
  
  // ... additional methods
}
```

### Event-Driven Architecture

```typescript
// src/shared/EventBus.ts

export type EventHandler<T = unknown> = (data: T) => void | Promise<void>;

export interface IEventBus {
  on<T>(event: string, handler: EventHandler<T>): () => void;
  off<T>(event: string, handler: EventHandler<T>): void;
  emit<T>(event: string, data: T): Promise<void>;
  once<T>(event: string, handler: EventHandler<T>): () => void;
}

export class EventBus implements IEventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  
  on<T>(event: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as EventHandler);
    
    // Return unsubscribe function
    return () => this.off(event, handler);
  }
  
  off<T>(event: string, handler: EventHandler<T>): void {
    this.handlers.get(event)?.delete(handler as EventHandler);
  }
  
  async emit<T>(event: string, data: T): Promise<void> {
    const handlers = this.handlers.get(event);
    if (!handlers) return;
    
    const promises = Array.from(handlers).map(handler => 
      Promise.resolve(handler(data)).catch(error => {
        console.error(`[EventBus] Handler error for ${event}:`, error);
      })
    );
    
    await Promise.all(promises);
  }
  
  once<T>(event: string, handler: EventHandler<T>): () => void {
    const wrappedHandler: EventHandler<T> = (data) => {
      this.off(event, wrappedHandler);
      return handler(data);
    };
    return this.on(event, wrappedHandler);
  }
}

// Event types
export const Events = {
  // Memory events
  MEMORY_WRITTEN: 'memory:written',
  MEMORY_DECAYED: 'memory:decayed',
  PATTERN_CREATED: 'pattern:created',
  PATTERN_UPDATED: 'pattern:updated',
  
  // Context events
  CONTEXT_SWITCHED: 'context:switched',
  CONTEXT_DETECTED: 'context:detected',
  
  // Graph events
  ENTITY_ADDED: 'graph:entity:added',
  RELATION_ADDED: 'graph:relation:added',
  
  // Recommendation events
  CONTENT_PROCESSED: 'recommendation:processed',
  FEEDBACK_RECEIVED: 'feedback:received',
  
  // System events
  EXTENSION_INSTALLED: 'system:installed',
  EXTENSION_UPDATED: 'system:updated',
  SETTINGS_CHANGED: 'settings:changed',
} as const;

// Usage
const eventBus = new EventBus();

// Subscribe to events
eventBus.on(Events.MEMORY_WRITTEN, async (data: { entry: MemoryEntry }) => {
  // Update cache
  await cache.set(data.entry.entry_id, data.entry);
  
  // Check for patterns
  await patternDetector.checkForPatterns(data.entry);
});

eventBus.on(Events.FEEDBACK_RECEIVED, async (data: { content: AnalyzedContent; feedback: IntentType }) => {
  // Log event
  logger.info('Feedback received', data);
  
  // Update analytics
  await analytics.trackFeedback(data);
});
```

---

## Data Layer Optimization

### IndexedDB Optimization

```typescript
// src/data/IndexedDBManager.ts

export class IndexedDBManager {
  private db: IDBDatabase | null = null;
  private readonly DB_NAME = 'recome_db';
  private readonly DB_VERSION = 1;
  
  async initialize(): Promise<void> {
    this.db = await this.openDatabase();
  }
  
  private async openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        this.createStores(db);
      };
    });
  }
  
  private createStores(db: IDBDatabase): void {
    // Memory entries with optimized indexes
    const memoryStore = db.createObjectStore('memory_entries', { keyPath: 'entry_id' });
    memoryStore.createIndex('by_user_context', ['user_id', 'context_bucket']);
    memoryStore.createIndex('by_user_type', ['user_id', 'memory_type']);
    memoryStore.createIndex('by_user_status', ['user_id', 'status']);
    memoryStore.createIndex('by_topic', 'topic_key');
    memoryStore.createIndex('by_last_accessed', 'last_accessed_at');
    
    // Memory events (append-only, time-series)
    const eventStore = db.createObjectStore('memory_events', { keyPath: 'event_id' });
    eventStore.createIndex('by_occurred', 'occurred_at');
    eventStore.createIndex('by_user_topic', ['user_id', 'topic_key']);
    
    // Mid-term cards
    const cardStore = db.createObjectStore('mid_term_cards', { keyPath: 'card_id' });
    cardStore.createIndex('by_context', 'context_bucket');
    cardStore.createIndex('by_status', 'status');
    cardStore.createIndex('by_last_seen', 'last_seen_at');
    
    // Knowledge graph
    const entityStore = db.createObjectStore('entities', { keyPath: 'id' });
    entityStore.createIndex('by_type', 'type');
    entityStore.createIndex('by_name', 'name');
    
    const relationStore = db.createObjectStore('relations', { keyPath: 'id' });
    relationStore.createIndex('by_source', 'source_id');
    relationStore.createIndex('by_target', 'target_id');
    relationStore.createIndex('by_type', 'type');
    relationStore.createIndex('by_source_type', ['source_id', 'type']);
  }
  
  // Batch operations for better performance
  async batchWrite<T>(storeName: string, items: T[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      
      for (const item of items) {
        store.put(item);
      }
      
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  
  // Cursor-based pagination for large datasets
  async paginatedQuery<T>(
    storeName: string,
    indexName: string,
    query: IDBKeyRange | null,
    pageSize: number,
    cursor?: IDBValidKey
  ): Promise<{ items: T[]; nextCursor?: IDBValidKey }> {
    if (!this.db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      
      const items: T[] = [];
      const request = cursor
        ? index.openCursor(query, 'next')
        : index.openCursor(query);
      
      let skipping = cursor !== undefined;
      let count = 0;
      let nextCursor: IDBValidKey | undefined;
      
      request.onsuccess = (event) => {
        const cursorResult = (event.target as IDBRequest).result as IDBCursorWithValue;
        
        if (!cursorResult) {
          resolve({ items, nextCursor });
          return;
        }
        
        // Skip to cursor position
        if (skipping) {
          if (cursorResult.key === cursor) {
            skipping = false;
          }
          cursorResult.continue();
          return;
        }
        
        // Collect items
        if (count < pageSize) {
          items.push(cursorResult.value);
          count++;
          cursorResult.continue();
        } else {
          nextCursor = cursorResult.key;
          resolve({ items, nextCursor });
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }
}
```

### LRU Cache with TTL

```typescript
// src/data/LRUCache.ts

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class LRUCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private readonly maxSize: number;
  private readonly defaultTTL: number;
  
  constructor(options: { max: number; ttl?: number }) {
    this.maxSize = options.max;
    this.defaultTTL = options.ttl || 5 * 60 * 1000; // 5 minutes default
  }
  
  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) return undefined;
    
    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    return entry.value;
  }
  
  set(key: K, value: V, ttl?: number): void {
    // Remove if exists (to update position)
    this.cache.delete(key);
    
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttl || this.defaultTTL),
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
  
  delete(key: K): boolean {
    return this.cache.delete(key);
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  // Batch operations
  getMany(keys: K[]): Map<K, V> {
    const results = new Map<K, V>();
    for (const key of keys) {
      const value = this.get(key);
      if (value !== undefined) {
        results.set(key, value);
      }
    }
    return results;
  }
  
  setMany(entries: Array<[K, V]>, ttl?: number): void {
    for (const [key, value] of entries) {
      this.set(key, value, ttl);
    }
  }
  
  // Cache stats
  stats(): { size: number; maxSize: number; hitRate: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: 0, // Would need to track hits/misses
    };
  }
}
```

---

## Performance Strategies

### Debouncing and Throttling

```typescript
// src/shared/performance.ts

export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), wait);
  };
}

export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = limit - (now - lastCall);
    
    if (remaining <= 0) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastCall = now;
      func(...args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        timeoutId = null;
        func(...args);
      }, remaining);
    }
  };
}

// Batch processor for bulk operations
export class BatchProcessor<T> {
  private queue: T[] = [];
  private processing = false;
  private readonly batchSize: number;
  private readonly processInterval: number;
  private readonly processor: (items: T[]) => Promise<void>;
  
  constructor(options: {
    batchSize: number;
    processInterval: number;
    processor: (items: T[]) => Promise<void>;
  }) {
    this.batchSize = options.batchSize;
    this.processInterval = options.processInterval;
    this.processor = options.processor;
    
    // Start processing loop
    this.startProcessing();
  }
  
  add(item: T): void {
    this.queue.push(item);
  }
  
  addBatch(items: T[]): void {
    this.queue.push(...items);
  }
  
  private async startProcessing(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    
    while (true) {
      if (this.queue.length > 0) {
        const batch = this.queue.splice(0, this.batchSize);
        try {
          await this.processor(batch);
        } catch (error) {
          console.error('[BatchProcessor] Processing error:', error);
          // Re-queue failed items
          this.queue.unshift(...batch);
        }
      }
      
      await this.sleep(this.processInterval);
    }
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Request Coalescing

```typescript
// src/shared/RequestCoalescer.ts

export class RequestCoalescer<K, V> {
  private pending = new Map<K, Promise<V>>();
  private readonly fetcher: (key: K) => Promise<V>;
  
  constructor(fetcher: (key: K) => Promise<V>) {
    this.fetcher = fetcher;
  }
  
  async get(key: K): Promise<V> {
    // Check if request is already pending
    const pendingRequest = this.pending.get(key);
    if (pendingRequest) {
      return pendingRequest;
    }
    
    // Create new request
    const request = this.fetcher(key).finally(() => {
      this.pending.delete(key);
    });
    
    this.pending.set(key, request);
    return request;
  }
  
  // Batch coalescing
  async getMany(keys: K[]): Promise<Map<K, V>> {
    const results = new Map<K, V>();
    const promises: Promise<void>[] = [];
    
    for (const key of keys) {
      promises.push(
        this.get(key).then(value => {
          results.set(key, value);
        })
      );
    }
    
    await Promise.all(promises);
    return results;
  }
}

// Usage
const memoryCoalescer = new RequestCoalescer<string, MemoryPack>(
  async (contextBucket) => memoryService.retrieve(contextBucket as ContextBucket)
);

// Multiple components requesting same data simultaneously
// will only trigger one actual database query
const [pack1, pack2, pack3] = await Promise.all([
  memoryCoalescer.get('entertainment'),
  memoryCoalescer.get('entertainment'),
  memoryCoalescer.get('entertainment'),
]);
// pack1 === pack2 === pack3 (same object)
```

### Lazy Initialization

```typescript
// src/shared/Lazy.ts

export class Lazy<T> {
  private value: T | undefined;
  private initialized = false;
  private initializing: Promise<T> | null = null;
  private readonly factory: () => T | Promise<T>;
  
  constructor(factory: () => T | Promise<T>) {
    this.factory = factory;
  }
  
  async get(): Promise<T> {
    if (this.initialized) {
      return this.value!;
    }
    
    if (this.initializing) {
      return this.initializing;
    }
    
    this.initializing = Promise.resolve(this.factory()).then(value => {
      this.value = value;
      this.initialized = true;
      this.initializing = null;
      return value;
    });
    
    return this.initializing;
  }
  
  isInitialized(): boolean {
    return this.initialized;
  }
  
  reset(): void {
    this.value = undefined;
    this.initialized = false;
    this.initializing = null;
  }
}

// Usage
const lazyGraph = new Lazy(async () => {
  const graph = new KnowledgeGraph();
  await graph.loadFromDatabase();
  await graph.seedDefaults();
  return graph;
});

// First call initializes, subsequent calls return cached
const graph = await lazyGraph.get();
```

---

## Error Handling & Recovery

### Retry with Exponential Backoff

```typescript
// src/shared/retry.ts

export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  shouldRetry?: (error: unknown) => boolean;
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxAttempts, baseDelay, maxDelay, shouldRetry = () => true } = options;
  
  let lastError: unknown;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error;
      }
      
      // Calculate delay with exponential backoff and jitter
      const delay = Math.min(
        baseDelay * Math.pow(2, attempt - 1) + Math.random() * 100,
        maxDelay
      );
      
      console.warn(`[Retry] Attempt ${attempt} failed, retrying in ${delay}ms`, error);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// Usage
const result = await retryWithBackoff(
  () => memoryStore.save(entry),
  {
    maxAttempts: 3,
    baseDelay: 100,
    maxDelay: 2000,
    shouldRetry: (error) => error instanceof TemporaryError,
  }
);
```

### Circuit Breaker Pattern

```typescript
// src/shared/CircuitBreaker.ts

enum CircuitState {
  CLOSED = 'closed',     // Normal operation
  OPEN = 'open',         // Failing, reject requests
  HALF_OPEN = 'half_open', // Testing recovery
}

export class CircuitBreaker<T> {
  private state = CircuitState.CLOSED;
  private failures = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly operation: () => Promise<T>;
  
  constructor(options: {
    operation: () => Promise<T>;
    failureThreshold: number;
    resetTimeout: number;
  }) {
    this.operation = options.operation;
    this.failureThreshold = options.failureThreshold;
    this.resetTimeout = options.resetTimeout;
  }
  
  async execute(): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = CircuitState.HALF_OPEN;
      } else {
        throw new CircuitOpenError('Circuit breaker is open');
      }
    }
    
    try {
      const result = await this.operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failures = 0;
    this.state = CircuitState.CLOSED;
  }
  
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
    }
  }
  
  getState(): CircuitState {
    return this.state;
  }
}

class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

// Usage
const llmCircuitBreaker = new CircuitBreaker({
  operation: () => llmExtractor.extract(content),
  failureThreshold: 5,
  resetTimeout: 60000, // 1 minute
});

try {
  const entities = await llmCircuitBreaker.execute();
} catch (error) {
  if (error instanceof CircuitOpenError) {
    // Fall back to rule-based extraction
    const entities = await ruleBasedExtractor.extract(content);
  }
}
```

---

## Testing Architecture

### Test Structure

```
tests/
├── unit/
│   ├── memory/
│   │   ├── MemoryService.test.ts
│   │   ├── MemoryStore.test.ts
│   │   ├── PatternDetector.test.ts
│   │   └── DecayManager.test.ts
│   ├── graph/
│   │   ├── KnowledgeGraph.test.ts
│   │   └── AffinityCalculator.test.ts
│   ├── recommendation/
│   │   └── RecommendationEngine.test.ts
│   └── extraction/
│       └── EntityExtractor.test.ts
│
├── integration/
│   ├── memory-graph.test.ts
│   ├── recommendation-pipeline.test.ts
│   └── content-processing.test.ts
│
├── e2e/
│   ├── youtube.test.ts
│   ├── amazon.test.ts
│   └── popup.test.ts
│
└── fixtures/
    ├── memory-entries.json
    ├── graph-data.json
    └── content-items.json
```

### Mock Factory Pattern

```typescript
// tests/mocks/factories.ts

export function createMockMemoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    entry_id: crypto.randomUUID(),
    user_id: 'local',
    context_bucket: 'general',
    memory_type: 'facts_prefs',
    topic_key: 'blocked:test',
    value: { sentiment: 'negative' },
    confidence: 1.0,
    status: 'core',
    valid_from: Date.now(),
    valid_to: null,
    last_confirmed_at: Date.now(),
    last_accessed_at: Date.now(),
    access_count: 0,
    version: 1,
    is_deleted: false,
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides,
  };
}

export function createMockContentItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: crypto.randomUUID(),
    title: 'Test Video Title',
    creator: 'Test Creator',
    platform: 'youtube',
    element: document.createElement('div'),
    metadata: {},
    ...overrides,
  };
}

export function createMockMidTermCard(overrides: Partial<MidTermCard> = {}): MidTermCard {
  return {
    card_id: crypto.randomUUID(),
    user_id: 'local',
    context_bucket: 'general',
    summary: 'Test pattern card',
    entities: [],
    tags: [],
    source_refs: [],
    confidence: 0.9,
    status: 'core',
    pattern_type: 'block_pattern',
    occurrence_count: 5,
    first_seen_at: Date.now() - 86400000,
    last_seen_at: Date.now(),
    created_at: Date.now() - 86400000,
    updated_at: Date.now(),
    ...overrides,
  };
}
```

---

## Deployment & Updates

### Version Migration

```typescript
// src/data/migrations/index.ts

interface Migration {
  version: number;
  up: (db: IDBDatabase) => Promise<void>;
  down: (db: IDBDatabase) => Promise<void>;
}

const migrations: Migration[] = [
  {
    version: 2,
    up: async (db) => {
      // Add new index for faster queries
      const tx = db.transaction('memory_entries', 'readwrite');
      const store = tx.objectStore('memory_entries');
      store.createIndex('by_confidence', 'confidence');
    },
    down: async (db) => {
      const tx = db.transaction('memory_entries', 'readwrite');
      const store = tx.objectStore('memory_entries');
      store.deleteIndex('by_confidence');
    },
  },
  {
    version: 3,
    up: async (db) => {
      // Add new store for analytics
      db.createObjectStore('analytics', { keyPath: 'id' });
    },
    down: async (db) => {
      db.deleteObjectStore('analytics');
    },
  },
];

export class MigrationRunner {
  async run(db: IDBDatabase, fromVersion: number, toVersion: number): Promise<void> {
    const pendingMigrations = migrations.filter(
      m => m.version > fromVersion && m.version <= toVersion
    );
    
    for (const migration of pendingMigrations) {
      console.log(`[Migration] Running migration v${migration.version}`);
      await migration.up(db);
    }
  }
  
  async rollback(db: IDBDatabase, fromVersion: number, toVersion: number): Promise<void> {
    const rollbackMigrations = migrations
      .filter(m => m.version <= fromVersion && m.version > toVersion)
      .reverse();
    
    for (const migration of rollbackMigrations) {
      console.log(`[Migration] Rolling back migration v${migration.version}`);
      await migration.down(db);
    }
  }
}
```

---

## Future Scaling

### Cloud Sync Architecture (Future)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      FUTURE: CLOUD SYNC ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        CLIENT (Extension)                            │   │
│  │                                                                     │   │
│  │   ┌─────────────────┐         ┌─────────────────┐                  │   │
│  │   │   Local Data    │◀───────▶│   Sync Engine   │                  │   │
│  │   │   (IndexedDB)   │         │                 │                  │   │
│  │   └─────────────────┘         │ • Conflict      │                  │   │
│  │                               │   resolution    │                  │   │
│  │                               │ • Delta sync    │                  │   │
│  │                               │ • Encryption    │                  │   │
│  │                               └────────┬────────┘                  │   │
│  │                                        │                            │   │
│  └────────────────────────────────────────┼────────────────────────────┘   │
│                                           │                                 │
│                                    HTTPS / WebSocket                        │
│                                           │                                 │
│  ┌────────────────────────────────────────┼────────────────────────────┐   │
│  │                                        │                            │   │
│  │                                        ▼                            │   │
│  │   ┌─────────────────────────────────────────────────────────────┐  │   │
│  │   │                      CLOUD SERVICE                           │  │   │
│  │   │                                                             │  │   │
│  │   │   ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐    │  │   │
│  │   │   │    Auth     │  │  Sync API   │  │    Storage      │    │  │   │
│  │   │   │   Service   │  │             │  │    (E2E Enc)    │    │  │   │
│  │   │   └─────────────┘  └─────────────┘  └─────────────────┘    │  │   │
│  │   │                                                             │  │   │
│  │   │   ┌─────────────────────────────────────────────────────┐  │  │   │
│  │   │   │              PostgreSQL + Redis                      │  │  │   │
│  │   │   │                                                     │  │  │   │
│  │   │   │  • User accounts                                    │  │  │   │
│  │   │   │  • Encrypted preference blobs                       │  │  │   │
│  │   │   │  • Sync state                                       │  │  │   │
│  │   │   │  • Device registry                                  │  │  │   │
│  │   │   └─────────────────────────────────────────────────────┘  │  │   │
│  │   │                                                             │  │   │
│  │   └─────────────────────────────────────────────────────────────┘  │   │
│  │                                                                     │   │
│  │                           CLOUD (AWS/GCP)                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Next Steps

1. **Read**: [TESTING.md](TESTING.md) - Detailed testing guide
2. **Read**: [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment procedures
3. **Implement**: Start with core architecture using [CLAUDE_CODE_PROMPT.md](CLAUDE_CODE_PROMPT.md)
