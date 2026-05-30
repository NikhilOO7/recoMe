import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import { DB_NAME, DB_VERSION } from '@shared/constants';
import type {
  MemoryEntry,
  MemoryEvent,
  MidTermCard,
  GraphEntity,
  GraphRelation,
  Product,
  Brand,
  Seller,
  Offer,
  IntentEvent,
  DecisionRecord,
  WatchlistItem,
} from '@shared/types';

// ── Schema ────────────────────────────────────────────────────────────────────

export interface RecomeDBSchema extends DBSchema {
  // v1 stores
  memory_entries: {
    key: string;
    value: MemoryEntry;
    indexes: {
      by_user_context: [string, string];
      by_user_type: [string, string];
      by_status: [string, string];
      by_topic: [string, string];
      by_last_accessed: number;
    };
  };
  memory_events: {
    key: string;
    value: MemoryEvent;
    indexes: {
      by_occurred: number;
      by_topic: string;
      by_platform: string;
    };
  };
  mid_term_cards: {
    key: string;
    value: MidTermCard;
    indexes: {
      by_context: string;
      by_user_context: [string, string];
      by_last_seen: number;
      by_status: string;
    };
  };
  entities: {
    key: string;
    value: GraphEntity;
    indexes: {
      by_type: string;
      by_name: string;
    };
  };
  relations: {
    key: string;
    value: GraphRelation;
    indexes: {
      by_source: string;
      by_target: string;
      by_type: string;
      by_source_type: [string, string];
    };
  };

  // v2 commerce stores
  products: {
    key: string;
    value: Product;
    indexes: {
      by_brand: string;
      by_title: string;
    };
  };
  brands: {
    key: string;
    value: Brand;
    indexes: {
      by_name: string;
    };
  };
  sellers: {
    key: string;
    value: Seller;
    indexes: {
      by_name: string;
    };
  };
  offers: {
    key: string;
    value: Offer;
    indexes: {
      by_product: string;
      by_seller: string;
      by_site: string;
    };
  };
  intents: {
    key: string;
    value: IntentEvent;
    indexes: {
      by_entity: string;
      by_type: string;
      by_created: string;
    };
  };
  decisions: {
    key: string;
    value: DecisionRecord;
    indexes: {
      by_candidate: string;
      by_decision: string;
      by_created: string;
    };
  };
  watchlists: {
    key: string;
    value: WatchlistItem;
    indexes: {
      by_entity: string;
      by_type: string;
    };
  };
}

export type RecomeDB = IDBPDatabase<RecomeDBSchema>;

// ── Singleton ─────────────────────────────────────────────────────────────────

let dbInstance: RecomeDB | null = null;

export async function getDB(): Promise<RecomeDB> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<RecomeDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion) {
      migrateDB(db, oldVersion, newVersion ?? DB_VERSION);
    },
    blocked() {
      console.warn('[RecoMe] DB upgrade blocked by another tab.');
    },
    blocking() {
      dbInstance?.close();
      dbInstance = null;
    },
    terminated() {
      dbInstance = null;
    },
  });

  return dbInstance;
}

export function closeDB(): void {
  dbInstance?.close();
  dbInstance = null;
}

// ── Migrations ────────────────────────────────────────────────────────────────

function migrateDB(db: IDBPDatabase<RecomeDBSchema>, oldVersion: number, newVersion: number): void {
  if (oldVersion < 1 && newVersion >= 1) {
    createV1Schema(db);
  }
  if (oldVersion < 2 && newVersion >= 2) {
    createV2Schema(db);
  }
}

function createV1Schema(db: IDBPDatabase<RecomeDBSchema>): void {
  const memoryStore = db.createObjectStore('memory_entries', { keyPath: 'entry_id' });
  memoryStore.createIndex('by_user_context', ['user_id', 'context_bucket'], { unique: false });
  memoryStore.createIndex('by_user_type', ['user_id', 'memory_type'], { unique: false });
  memoryStore.createIndex('by_status', ['user_id', 'status'], { unique: false });
  memoryStore.createIndex('by_topic', ['user_id', 'topic_key'], { unique: false });
  memoryStore.createIndex('by_last_accessed', 'last_accessed_at', { unique: false });

  const eventsStore = db.createObjectStore('memory_events', { keyPath: 'event_id' });
  eventsStore.createIndex('by_occurred', 'occurred_at', { unique: false });
  eventsStore.createIndex('by_topic', 'topic_key', { unique: false });
  eventsStore.createIndex('by_platform', 'platform', { unique: false });

  const cardsStore = db.createObjectStore('mid_term_cards', { keyPath: 'card_id' });
  cardsStore.createIndex('by_context', 'context_bucket', { unique: false });
  cardsStore.createIndex('by_user_context', ['user_id', 'context_bucket'], { unique: false });
  cardsStore.createIndex('by_last_seen', 'last_seen_at', { unique: false });
  cardsStore.createIndex('by_status', 'status', { unique: false });

  const entitiesStore = db.createObjectStore('entities', { keyPath: 'id' });
  entitiesStore.createIndex('by_type', 'type', { unique: false });
  entitiesStore.createIndex('by_name', 'name', { unique: false });

  const relationsStore = db.createObjectStore('relations', { keyPath: 'id' });
  relationsStore.createIndex('by_source', 'source_id', { unique: false });
  relationsStore.createIndex('by_target', 'target_id', { unique: false });
  relationsStore.createIndex('by_type', 'type', { unique: false });
  relationsStore.createIndex('by_source_type', ['source_id', 'type'], { unique: false });
}

function createV2Schema(db: IDBPDatabase<RecomeDBSchema>): void {
  const productsStore = db.createObjectStore('products', { keyPath: 'productId' });
  productsStore.createIndex('by_brand', 'brandId', { unique: false });
  productsStore.createIndex('by_title', 'normalizedTitle', { unique: false });

  const brandsStore = db.createObjectStore('brands', { keyPath: 'brandId' });
  brandsStore.createIndex('by_name', 'displayName', { unique: false });

  const sellersStore = db.createObjectStore('sellers', { keyPath: 'sellerId' });
  sellersStore.createIndex('by_name', 'displayName', { unique: false });

  const offersStore = db.createObjectStore('offers', { keyPath: 'offerId' });
  offersStore.createIndex('by_product', 'productId', { unique: false });
  offersStore.createIndex('by_seller', 'sellerId', { unique: false });
  offersStore.createIndex('by_site', 'site', { unique: false });

  const intentsStore = db.createObjectStore('intents', { keyPath: 'id' });
  intentsStore.createIndex('by_entity', 'entityId', { unique: false });
  intentsStore.createIndex('by_type', 'intentType', { unique: false });
  intentsStore.createIndex('by_created', 'createdAt', { unique: false });

  const decisionsStore = db.createObjectStore('decisions', { keyPath: 'decisionId' });
  decisionsStore.createIndex('by_candidate', 'candidateId', { unique: false });
  decisionsStore.createIndex('by_decision', 'decision', { unique: false });
  decisionsStore.createIndex('by_created', 'createdAt', { unique: false });

  const watchlistsStore = db.createObjectStore('watchlists', { keyPath: 'watchlistItemId' });
  watchlistsStore.createIndex('by_entity', 'entityId', { unique: false });
  watchlistsStore.createIndex('by_type', 'entityType', { unique: false });
}
