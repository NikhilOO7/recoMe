# Mnemosyne Memory System - Implementation Guide

> Complete TypeScript implementation of RecoMe's human-like memory system.

---

## Table of Contents

1. [Data Models](#data-models)
2. [MemoryStore Implementation](#memorystore-implementation)
3. [MemoryService API](#memoryservice-api)
4. [PatternDetector](#patterndetector)
5. [DecayManager](#decaymanager)
6. [ContextDetector](#contextdetector)
7. [Integration Examples](#integration-examples)

---

## Data Models

### Type Definitions

```typescript
// src/intelligence/memory/models/types.ts

export type ContextBucket = 
  | 'work' 
  | 'learning' 
  | 'shopping' 
  | 'entertainment' 
  | 'social' 
  | 'general';

export type MemoryType = 
  | 'short_term' 
  | 'mid_term' 
  | 'working_set' 
  | 'facts_prefs' 
  | 'long_term';

export type MemoryStatus = 
  | 'core'       // 100% weight, actively considered
  | 'dream'      // 50% weight, fading
  | 'forgotten'  // 0% weight, not retrieved
  | 'archived'   // User archived, can restore
  | 'deleted';   // Marked for removal

export type PatternType = 
  | 'block_pattern'
  | 'interest_pattern'
  | 'research_pattern'
  | 'time_pattern'
  | 'context_pattern';

export type EventType =
  | 'preference_set'
  | 'preference_inferred'
  | 'interaction'
  | 'confirmation'
  | 'decay'
  | 'reactivation'
  | 'deletion'
  | 'context_switch'
  | 'session_start'
  | 'session_end';

export type IntentType = 
  | 'interested'
  | 'not_interested'
  | 'one_time';
```

### MemoryEntry

```typescript
// src/intelligence/memory/models/MemoryEntry.ts

import { ContextBucket, MemoryType, MemoryStatus } from './types';

export interface MemoryValue {
  sentiment?: 'positive' | 'negative' | 'neutral';
  strength?: number;  // 0.0 - 1.0
  entity_type?: string;
  entity_name?: string;
  related_entities?: string[];
  source_type?: 'explicit' | 'inferred' | 'llm';
  [key: string]: unknown;
}

export interface MemoryEntry {
  entry_id: string;
  user_id: string;
  context_bucket: ContextBucket;
  memory_type: MemoryType;
  topic_key: string;              // e.g., "blocked:crypto", "interested:photography"
  value: MemoryValue;
  confidence: number;             // 0.0 - 1.0
  status: MemoryStatus;
  valid_from: number;             // Timestamp when this version became valid
  valid_to: number | null;        // Null if currently valid
  last_confirmed_at: number;      // Last user confirmation
  last_accessed_at: number;       // Last retrieval
  access_count: number;
  version: number;
  is_deleted: boolean;
  created_at: number;
  updated_at: number;
}

// Factory function
export function createMemoryEntry(
  partial: Partial<MemoryEntry> & Pick<MemoryEntry, 'topic_key' | 'memory_type'>
): MemoryEntry {
  const now = Date.now();
  return {
    entry_id: crypto.randomUUID(),
    user_id: 'local',
    context_bucket: 'general',
    value: {},
    confidence: 1.0,
    status: 'core',
    valid_from: now,
    valid_to: null,
    last_confirmed_at: now,
    last_accessed_at: now,
    access_count: 0,
    version: 1,
    is_deleted: false,
    created_at: now,
    updated_at: now,
    ...partial,
  };
}
```

### MemoryEvent

```typescript
// src/intelligence/memory/models/MemoryEvent.ts

import { ContextBucket, MemoryType, EventType } from './types';

export interface MemoryEvent {
  readonly event_id: string;
  readonly user_id: string;
  readonly context_bucket: ContextBucket;
  readonly memory_type: MemoryType;
  readonly topic_key: string;
  readonly event_type: EventType;
  readonly payload: Record<string, unknown>;
  readonly source_ref: string;       // Content ID or user action reference
  readonly occurred_at: number;
  readonly created_at: number;
}

export function createMemoryEvent(
  partial: Partial<MemoryEvent> & Pick<MemoryEvent, 'topic_key' | 'event_type'>
): MemoryEvent {
  const now = Date.now();
  return {
    event_id: crypto.randomUUID(),
    user_id: 'local',
    context_bucket: 'general',
    memory_type: 'long_term',
    payload: {},
    source_ref: '',
    occurred_at: now,
    created_at: now,
    ...partial,
  };
}
```

### MidTermCard

```typescript
// src/intelligence/memory/models/MidTermCard.ts

import { ContextBucket, MemoryStatus, PatternType } from './types';

export interface CardEntity {
  type: string;
  name: string;
  weight: number;
}

export interface SourceRef {
  content_id: string;
  platform: string;
  action: string;
  timestamp: number;
}

export interface MidTermCard {
  card_id: string;
  user_id: string;
  context_bucket: ContextBucket;
  summary: string;                  // Human-readable summary
  entities: CardEntity[];           // Entities this card matches
  tags: string[];                   // Searchable tags
  source_refs: SourceRef[];         // Actions that formed this pattern
  confidence: number;
  status: MemoryStatus;
  pattern_type: PatternType;
  occurrence_count: number;
  first_seen_at: number;
  last_seen_at: number;
  created_at: number;
  updated_at: number;
}

export function createMidTermCard(
  partial: Partial<MidTermCard> & Pick<MidTermCard, 'summary' | 'pattern_type'>
): MidTermCard {
  const now = Date.now();
  return {
    card_id: crypto.randomUUID(),
    user_id: 'local',
    context_bucket: 'general',
    entities: [],
    tags: [],
    source_refs: [],
    confidence: 0.8,
    status: 'core',
    occurrence_count: 1,
    first_seen_at: now,
    last_seen_at: now,
    created_at: now,
    updated_at: now,
    ...partial,
  };
}
```

### MemoryPack

```typescript
// src/intelligence/memory/models/MemoryPack.ts

import { ContextBucket } from './types';
import { MemoryEntry } from './MemoryEntry';
import { MidTermCard } from './MidTermCard';

export interface ShortTermItem {
  content_id: string;
  topics: string[];
  creator?: string;
  action: 'like' | 'hide' | 'skip' | 'view';
  timestamp: number;
}

export interface WorkingSetState {
  current_research?: {
    topic: string;
    criteria: string[];
    candidates: string[];
    started_at: number;
  };
  active_goals?: Array<{
    goal: string;
    progress: number;
    deadline?: number;
  }>;
  pending_decisions?: Array<{
    topic: string;
    options: string[];
    created_at: number;
  }>;
}

export interface GeneralOverlay {
  blocked_forever: string[];
  always_interested: string[];
  followed_creators: string[];
  blocked_creators: string[];
  personal_facts: Record<string, unknown>;
}

export interface MemoryPack {
  context: ContextBucket;
  short_term: ShortTermItem[];
  mid_term: MidTermCard[];
  working_set: WorkingSetState;
  facts_prefs: MemoryEntry[];
  general_overlay: GeneralOverlay;  // ALWAYS included
  retrieved_at: number;
}
```

---

## MemoryStore Implementation

```typescript
// src/intelligence/memory/storage/MemoryStore.ts

import { DBSchema, IDBPDatabase, openDB } from 'idb';
import { MemoryEntry } from '../models/MemoryEntry';
import { MemoryEvent } from '../models/MemoryEvent';
import { MidTermCard } from '../models/MidTermCard';
import { ContextBucket, MemoryType, MemoryStatus } from '../models/types';

interface RecomeDBSchema extends DBSchema {
  memory_entries: {
    key: string;
    value: MemoryEntry;
    indexes: {
      'by_user_context': [string, ContextBucket];
      'by_user_type': [string, MemoryType];
      'by_status': [string, MemoryStatus];
      'by_topic': string;
      'by_last_accessed': number;
    };
  };
  memory_events: {
    key: string;
    value: MemoryEvent;
    indexes: {
      'by_occurred': number;
      'by_user_topic': [string, string];
    };
  };
  mid_term_cards: {
    key: string;
    value: MidTermCard;
    indexes: {
      'by_context': ContextBucket;
      'by_status': MemoryStatus;
      'by_last_seen': number;
    };
  };
}

export class MemoryStore {
  private db: IDBPDatabase<RecomeDBSchema> | null = null;
  private readonly DB_NAME = 'recome_db';
  private readonly DB_VERSION = 1;
  
  async initialize(): Promise<void> {
    this.db = await openDB<RecomeDBSchema>(this.DB_NAME, this.DB_VERSION, {
      upgrade(db) {
        // Memory entries store
        const entryStore = db.createObjectStore('memory_entries', {
          keyPath: 'entry_id',
        });
        entryStore.createIndex('by_user_context', ['user_id', 'context_bucket']);
        entryStore.createIndex('by_user_type', ['user_id', 'memory_type']);
        entryStore.createIndex('by_status', ['user_id', 'status']);
        entryStore.createIndex('by_topic', 'topic_key');
        entryStore.createIndex('by_last_accessed', 'last_accessed_at');
        
        // Memory events store
        const eventStore = db.createObjectStore('memory_events', {
          keyPath: 'event_id',
        });
        eventStore.createIndex('by_occurred', 'occurred_at');
        eventStore.createIndex('by_user_topic', ['user_id', 'topic_key']);
        
        // Mid-term cards store
        const cardStore = db.createObjectStore('mid_term_cards', {
          keyPath: 'card_id',
        });
        cardStore.createIndex('by_context', 'context_bucket');
        cardStore.createIndex('by_status', 'status');
        cardStore.createIndex('by_last_seen', 'last_seen_at');
      },
    });
  }
  
  // ============ MEMORY ENTRIES ============
  
  async getEntry(entryId: string): Promise<MemoryEntry | undefined> {
    return this.db?.get('memory_entries', entryId);
  }
  
  async getEntryByTopic(topicKey: string): Promise<MemoryEntry | undefined> {
    const entries = await this.db?.getAllFromIndex('memory_entries', 'by_topic', topicKey);
    return entries?.find(e => !e.is_deleted && e.valid_to === null);
  }
  
  async getEntriesByContext(
    userId: string,
    context: ContextBucket,
    statusFilter?: MemoryStatus[]
  ): Promise<MemoryEntry[]> {
    const entries = await this.db?.getAllFromIndex(
      'memory_entries',
      'by_user_context',
      [userId, context]
    );
    
    if (!entries) return [];
    
    return entries.filter(e => {
      if (e.is_deleted || e.valid_to !== null) return false;
      if (statusFilter && !statusFilter.includes(e.status)) return false;
      return true;
    });
  }
  
  async getEntriesByType(
    userId: string,
    memoryType: MemoryType
  ): Promise<MemoryEntry[]> {
    const entries = await this.db?.getAllFromIndex(
      'memory_entries',
      'by_user_type',
      [userId, memoryType]
    );
    
    return entries?.filter(e => !e.is_deleted && e.valid_to === null) ?? [];
  }
  
  async saveEntry(entry: MemoryEntry): Promise<void> {
    entry.updated_at = Date.now();
    await this.db?.put('memory_entries', entry);
  }
  
  async saveEntries(entries: MemoryEntry[]): Promise<void> {
    const tx = this.db?.transaction('memory_entries', 'readwrite');
    if (!tx) return;
    
    const now = Date.now();
    for (const entry of entries) {
      entry.updated_at = now;
      await tx.store.put(entry);
    }
    
    await tx.done;
  }
  
  async deleteEntry(entryId: string): Promise<void> {
    const entry = await this.getEntry(entryId);
    if (entry) {
      entry.is_deleted = true;
      entry.status = 'deleted';
      entry.valid_to = Date.now();
      await this.saveEntry(entry);
    }
  }
  
  // ============ MEMORY EVENTS ============
  
  async appendEvent(event: MemoryEvent): Promise<void> {
    await this.db?.add('memory_events', event);
  }
  
  async getEventsByTopic(
    userId: string,
    topicKey: string,
    limit?: number
  ): Promise<MemoryEvent[]> {
    const events = await this.db?.getAllFromIndex(
      'memory_events',
      'by_user_topic',
      [userId, topicKey]
    );
    
    if (!events) return [];
    
    // Sort by occurred_at descending
    events.sort((a, b) => b.occurred_at - a.occurred_at);
    
    return limit ? events.slice(0, limit) : events;
  }
  
  async getRecentEvents(limit: number = 100): Promise<MemoryEvent[]> {
    const events: MemoryEvent[] = [];
    const tx = this.db?.transaction('memory_events', 'readonly');
    if (!tx) return events;
    
    const index = tx.store.index('by_occurred');
    let cursor = await index.openCursor(null, 'prev');
    
    while (cursor && events.length < limit) {
      events.push(cursor.value);
      cursor = await cursor.continue();
    }
    
    return events;
  }
  
  // ============ MID-TERM CARDS ============
  
  async getCard(cardId: string): Promise<MidTermCard | undefined> {
    return this.db?.get('mid_term_cards', cardId);
  }
  
  async getCardsByContext(context: ContextBucket): Promise<MidTermCard[]> {
    const cards = await this.db?.getAllFromIndex(
      'mid_term_cards',
      'by_context',
      context
    );
    return cards?.filter(c => c.status !== 'deleted') ?? [];
  }
  
  async getActiveCards(): Promise<MidTermCard[]> {
    const coreCards = await this.db?.getAllFromIndex(
      'mid_term_cards',
      'by_status',
      'core'
    );
    const dreamCards = await this.db?.getAllFromIndex(
      'mid_term_cards',
      'by_status',
      'dream'
    );
    return [...(coreCards ?? []), ...(dreamCards ?? [])];
  }
  
  async saveCard(card: MidTermCard): Promise<void> {
    card.updated_at = Date.now();
    await this.db?.put('mid_term_cards', card);
  }
  
  async findMatchingCard(
    entities: string[],
    patternType: string
  ): Promise<MidTermCard | undefined> {
    const cards = await this.getActiveCards();
    
    return cards.find(card => {
      if (card.pattern_type !== patternType) return false;
      const cardEntityNames = card.entities.map(e => e.name.toLowerCase());
      return entities.some(e => cardEntityNames.includes(e.toLowerCase()));
    });
  }
  
  // ============ QUERIES ============
  
  async getEntriesForDecay(
    cutoffDate: number,
    currentStatus: MemoryStatus
  ): Promise<MemoryEntry[]> {
    const allEntries = await this.db?.getAll('memory_entries');
    if (!allEntries) return [];
    
    return allEntries.filter(entry => {
      if (entry.is_deleted || entry.valid_to !== null) return false;
      if (entry.status !== currentStatus) return false;
      if (entry.memory_type === 'facts_prefs') return false; // Never decay
      return entry.last_accessed_at < cutoffDate;
    });
  }
  
  async getCardsForDecay(
    cutoffDate: number,
    currentStatus: MemoryStatus
  ): Promise<MidTermCard[]> {
    const allCards = await this.db?.getAll('mid_term_cards');
    if (!allCards) return [];
    
    return allCards.filter(card => {
      if (card.status !== currentStatus) return false;
      return card.last_seen_at < cutoffDate;
    });
  }
}
```

---

## MemoryService API

```typescript
// src/intelligence/memory/MemoryService.ts

import { MemoryStore } from './storage/MemoryStore';
import { PatternDetector } from './PatternDetector';
import { ContextDetector } from './ContextDetector';
import { 
  MemoryEntry, 
  createMemoryEntry 
} from './models/MemoryEntry';
import { 
  MemoryEvent, 
  createMemoryEvent 
} from './models/MemoryEvent';
import { MidTermCard } from './models/MidTermCard';
import { 
  MemoryPack, 
  ShortTermItem, 
  GeneralOverlay,
  WorkingSetState 
} from './models/MemoryPack';
import { 
  ContextBucket, 
  MemoryStatus, 
  IntentType 
} from './models/types';

export interface WriteTurnRequest {
  content_id: string;
  content_topics: string[];
  creator?: string;
  platform: string;
  action: IntentType;
  context?: ContextBucket;
}

export interface WriteTurnResponse {
  success: boolean;
  pattern_triggered?: MidTermCard;
  entries_updated: number;
}

export interface HideResult {
  hide: boolean;
  reason?: string;
  confidence: number;
  matched_topics?: string[];
  matched_cards?: string[];
}

export interface BoostResult {
  boost: boolean;
  reason?: string;
  confidence: number;
  matched_topics?: string[];
}

const MAX_SHORT_TERM = 20;

export class MemoryService {
  private store: MemoryStore;
  private patternDetector: PatternDetector;
  private contextDetector: ContextDetector;
  private shortTermBuffer: ShortTermItem[] = [];
  private currentContext: ContextBucket = 'general';
  
  constructor(store: MemoryStore) {
    this.store = store;
    this.patternDetector = new PatternDetector(store);
    this.contextDetector = new ContextDetector();
  }
  
  async initialize(): Promise<void> {
    await this.store.initialize();
  }
  
  // ============ WRITE OPERATIONS ============
  
  async writeTurn(request: WriteTurnRequest): Promise<WriteTurnResponse> {
    const { content_id, content_topics, creator, platform, action, context } = request;
    const detectedContext = context ?? await this.detectContext(platform, content_topics, new Date());
    
    // 1. Add to short-term buffer
    this.addToShortTerm({
      content_id,
      topics: content_topics,
      creator,
      action: this.actionToBufferAction(action),
      timestamp: Date.now(),
    });
    
    // 2. Append timeline event
    for (const topic of content_topics) {
      await this.store.appendEvent(createMemoryEvent({
        topic_key: topic,
        event_type: 'interaction',
        context_bucket: detectedContext,
        payload: { content_id, action, creator, platform },
        source_ref: content_id,
      }));
    }
    
    // 3. Update or create memory entries based on action
    let entriesUpdated = 0;
    
    if (action === 'not_interested') {
      // Check if we should create/update a blocked entry
      for (const topic of content_topics) {
        const existing = await this.store.getEntryByTopic(`blocked:${topic}`);
        if (existing) {
          existing.last_confirmed_at = Date.now();
          existing.access_count++;
          existing.confidence = Math.min(1.0, existing.confidence + 0.1);
          await this.store.saveEntry(existing);
        } else {
          // Create new blocked entry (will be promoted to facts_prefs if pattern detected)
          await this.store.saveEntry(createMemoryEntry({
            topic_key: `disliked:${topic}`,
            memory_type: 'mid_term',
            context_bucket: detectedContext,
            value: { sentiment: 'negative', strength: 0.5 },
            confidence: 0.5,
          }));
        }
        entriesUpdated++;
      }
    } else if (action === 'interested') {
      for (const topic of content_topics) {
        const existing = await this.store.getEntryByTopic(`interested:${topic}`);
        if (existing) {
          existing.last_confirmed_at = Date.now();
          existing.access_count++;
          existing.confidence = Math.min(1.0, existing.confidence + 0.1);
          await this.store.saveEntry(existing);
        } else {
          await this.store.saveEntry(createMemoryEntry({
            topic_key: `interested:${topic}`,
            memory_type: 'mid_term',
            context_bucket: detectedContext,
            value: { sentiment: 'positive', strength: 0.5 },
            confidence: 0.5,
          }));
        }
        entriesUpdated++;
      }
    }
    
    // 4. Check for pattern formation
    const patternCard = await this.patternDetector.detect(content_topics, action, detectedContext);
    
    return {
      success: true,
      pattern_triggered: patternCard ?? undefined,
      entries_updated: entriesUpdated,
    };
  }
  
  async blockForever(topic: string, entityType?: string): Promise<void> {
    const topicKey = `blocked:${topic.toLowerCase()}`;
    
    // Check if already blocked
    const existing = await this.store.getEntryByTopic(topicKey);
    if (existing && existing.memory_type === 'facts_prefs') {
      return; // Already permanently blocked
    }
    
    // Create or upgrade to facts_prefs
    const entry = createMemoryEntry({
      topic_key: topicKey,
      memory_type: 'facts_prefs',
      context_bucket: 'general', // Blocks are global
      value: {
        sentiment: 'negative',
        strength: 1.0,
        entity_type: entityType,
        entity_name: topic,
        source_type: 'explicit',
      },
      confidence: 1.0,
    });
    
    await this.store.saveEntry(entry);
    
    // Log event
    await this.store.appendEvent(createMemoryEvent({
      topic_key: topicKey,
      event_type: 'preference_set',
      context_bucket: 'general',
      payload: { action: 'block_forever', topic, entityType },
    }));
  }
  
  async unblock(topic: string): Promise<void> {
    const topicKey = `blocked:${topic.toLowerCase()}`;
    const entry = await this.store.getEntryByTopic(topicKey);
    
    if (entry) {
      await this.store.deleteEntry(entry.entry_id);
      
      await this.store.appendEvent(createMemoryEvent({
        topic_key: topicKey,
        event_type: 'deletion',
        payload: { action: 'unblock', topic },
      }));
    }
  }
  
  async markInterested(topic: string, entityType?: string, strength: number = 0.8): Promise<void> {
    const topicKey = `interested:${topic.toLowerCase()}`;
    
    const entry = createMemoryEntry({
      topic_key: topicKey,
      memory_type: 'facts_prefs',
      context_bucket: 'general',
      value: {
        sentiment: 'positive',
        strength,
        entity_type: entityType,
        entity_name: topic,
        source_type: 'explicit',
      },
      confidence: 1.0,
    });
    
    await this.store.saveEntry(entry);
  }
  
  async setCurrentResearch(
    topic: string,
    criteria?: string[],
    candidates?: string[]
  ): Promise<void> {
    const topicKey = `research:${topic.toLowerCase()}`;
    
    const entry = createMemoryEntry({
      topic_key: topicKey,
      memory_type: 'working_set',
      context_bucket: 'general', // Research is global
      value: {
        topic,
        criteria: criteria ?? [],
        candidates: candidates ?? [],
        started_at: Date.now(),
      },
    });
    
    await this.store.saveEntry(entry);
  }
  
  // ============ READ OPERATIONS ============
  
  async retrieve(contextBucket: ContextBucket): Promise<MemoryPack> {
    // 1. Get context-specific entries
    const contextEntries = await this.store.getEntriesByContext(
      'local',
      contextBucket,
      ['core', 'dream']
    );
    
    // 2. ALWAYS get general entries (blocked_forever, always_interested)
    const generalEntries = await this.store.getEntriesByContext(
      'local',
      'general',
      ['core', 'dream']
    );
    
    // 3. Get mid-term cards
    const contextCards = await this.store.getCardsByContext(contextBucket);
    const generalCards = await this.store.getCardsByContext('general');
    const allCards = [...contextCards, ...generalCards];
    
    // 4. Build general overlay
    const generalOverlay = this.buildGeneralOverlay(generalEntries);
    
    // 5. Get working set
    const workingSet = await this.getWorkingSet();
    
    // 6. Get facts_prefs for context
    const factsPrefs = contextEntries.filter(e => e.memory_type === 'facts_prefs');
    
    return {
      context: contextBucket,
      short_term: [...this.shortTermBuffer],
      mid_term: allCards.filter(c => c.status === 'core' || c.status === 'dream'),
      working_set: workingSet,
      facts_prefs: factsPrefs,
      general_overlay: generalOverlay,
      retrieved_at: Date.now(),
    };
  }
  
  async shouldHide(
    topics: string[],
    creator?: string,
    context?: ContextBucket
  ): Promise<HideResult> {
    const memoryPack = await this.retrieve(context ?? this.currentContext);
    const matchedTopics: string[] = [];
    const matchedCards: string[] = [];
    
    // 1. Check blocked_forever (highest priority)
    const blocked = memoryPack.general_overlay.blocked_forever;
    for (const topic of topics) {
      if (blocked.some(b => 
        b.toLowerCase() === topic.toLowerCase() ||
        topic.toLowerCase().includes(b.toLowerCase())
      )) {
        matchedTopics.push(topic);
      }
    }
    
    if (matchedTopics.length > 0) {
      return {
        hide: true,
        reason: `Blocked topic: ${matchedTopics[0]}`,
        confidence: 1.0,
        matched_topics: matchedTopics,
      };
    }
    
    // 2. Check blocked_creators
    if (creator && memoryPack.general_overlay.blocked_creators.includes(creator)) {
      return {
        hide: true,
        reason: `Blocked creator: ${creator}`,
        confidence: 1.0,
      };
    }
    
    // 3. Check mid-term pattern cards
    for (const card of memoryPack.mid_term) {
      if (card.pattern_type === 'block_pattern') {
        const cardTopics = card.entities.map(e => e.name.toLowerCase());
        const matches = topics.filter(t => cardTopics.includes(t.toLowerCase()));
        
        if (matches.length > 0) {
          matchedCards.push(card.card_id);
          const weight = card.status === 'core' ? 1.0 : 0.5;
          
          if (card.confidence * weight > 0.7) {
            return {
              hide: true,
              reason: `Pattern: ${card.summary}`,
              confidence: card.confidence * weight,
              matched_topics: matches,
              matched_cards: [card.card_id],
            };
          }
        }
      }
    }
    
    // 4. Check recent short-term for strong negative signal
    const recentHides = this.shortTermBuffer
      .filter(item => item.action === 'hide')
      .filter(item => item.topics.some(t => 
        topics.some(topic => t.toLowerCase() === topic.toLowerCase())
      ));
    
    if (recentHides.length >= 2) {
      return {
        hide: true,
        reason: 'Recently hidden similar content',
        confidence: 0.7,
        matched_topics: topics,
      };
    }
    
    return {
      hide: false,
      confidence: 0.9,
    };
  }
  
  async shouldBoost(
    topics: string[],
    creator?: string,
    context?: ContextBucket
  ): Promise<BoostResult> {
    const memoryPack = await this.retrieve(context ?? this.currentContext);
    const matchedTopics: string[] = [];
    
    // 1. Check always_interested
    const interested = memoryPack.general_overlay.always_interested;
    for (const topic of topics) {
      if (interested.some(i => 
        i.toLowerCase() === topic.toLowerCase() ||
        topic.toLowerCase().includes(i.toLowerCase())
      )) {
        matchedTopics.push(topic);
      }
    }
    
    if (matchedTopics.length > 0) {
      return {
        boost: true,
        reason: `Interested in: ${matchedTopics[0]}`,
        confidence: 0.9,
        matched_topics: matchedTopics,
      };
    }
    
    // 2. Check followed_creators
    if (creator && memoryPack.general_overlay.followed_creators.includes(creator)) {
      return {
        boost: true,
        reason: `Following: ${creator}`,
        confidence: 0.95,
      };
    }
    
    // 3. Check working set relevance
    if (memoryPack.working_set.current_research) {
      const research = memoryPack.working_set.current_research;
      const researchMatches = topics.filter(t => 
        t.toLowerCase().includes(research.topic.toLowerCase()) ||
        research.topic.toLowerCase().includes(t.toLowerCase())
      );
      
      if (researchMatches.length > 0) {
        return {
          boost: true,
          reason: `Relevant to current research: ${research.topic}`,
          confidence: 0.85,
          matched_topics: researchMatches,
        };
      }
    }
    
    // 4. Check interest pattern cards
    for (const card of memoryPack.mid_term) {
      if (card.pattern_type === 'interest_pattern') {
        const cardTopics = card.entities.map(e => e.name.toLowerCase());
        const matches = topics.filter(t => cardTopics.includes(t.toLowerCase()));
        
        if (matches.length > 0 && card.confidence > 0.7) {
          return {
            boost: true,
            reason: `Pattern: ${card.summary}`,
            confidence: card.confidence,
            matched_topics: matches,
          };
        }
      }
    }
    
    return {
      boost: false,
      confidence: 0.8,
    };
  }
  
  async getWorkingSet(): Promise<WorkingSetState> {
    const entries = await this.store.getEntriesByType('local', 'working_set');
    const state: WorkingSetState = {};
    
    for (const entry of entries) {
      if (entry.topic_key.startsWith('research:')) {
        state.current_research = entry.value as WorkingSetState['current_research'];
      }
      // Handle other working set types...
    }
    
    return state;
  }
  
  async getTimeline(topicKey: string, limit: number = 50): Promise<MemoryEvent[]> {
    return this.store.getEventsByTopic('local', topicKey, limit);
  }
  
  // ============ CONTEXT OPERATIONS ============
  
  async detectContext(
    platform: string,
    topics: string[],
    time: Date
  ): Promise<ContextBucket> {
    const detected = this.contextDetector.detect({ platform, topics, time });
    this.currentContext = detected;
    return detected;
  }
  
  async switchContext(context: ContextBucket): Promise<void> {
    const previousContext = this.currentContext;
    this.currentContext = context;
    
    await this.store.appendEvent(createMemoryEvent({
      topic_key: `context:${context}`,
      event_type: 'context_switch',
      payload: { from: previousContext, to: context },
    }));
  }
  
  getCurrentContext(): ContextBucket {
    return this.currentContext;
  }
  
  // ============ LIFECYCLE OPERATIONS ============
  
  async runDecayCycle(): Promise<{ decayed: number; deleted: number }> {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    
    let decayed = 0;
    let deleted = 0;
    
    // Core → Dream (30 days for mid_term, 7 days for working_set)
    const coreToDecay = await this.store.getEntriesForDecay(
      now - 30 * DAY,
      'core'
    );
    
    for (const entry of coreToDecay) {
      const threshold = entry.memory_type === 'working_set' ? 7 * DAY : 30 * DAY;
      if (now - entry.last_accessed_at > threshold) {
        entry.status = 'dream';
        await this.store.saveEntry(entry);
        decayed++;
      }
    }
    
    // Dream → Forgotten (90 days for mid_term, 30 days for working_set)
    const dreamToForget = await this.store.getEntriesForDecay(
      now - 90 * DAY,
      'dream'
    );
    
    for (const entry of dreamToForget) {
      const threshold = entry.memory_type === 'working_set' ? 30 * DAY : 90 * DAY;
      if (now - entry.last_accessed_at > threshold) {
        entry.status = 'forgotten';
        await this.store.saveEntry(entry);
        decayed++;
      }
    }
    
    // Forgotten → Deleted (180 days for mid_term, 90 days for working_set)
    const forgottenToDelete = await this.store.getEntriesForDecay(
      now - 180 * DAY,
      'forgotten'
    );
    
    for (const entry of forgottenToDelete) {
      const threshold = entry.memory_type === 'working_set' ? 90 * DAY : 180 * DAY;
      if (now - entry.last_accessed_at > threshold) {
        await this.store.deleteEntry(entry.entry_id);
        deleted++;
      }
    }
    
    // Also decay cards
    const coreCards = await this.store.getCardsForDecay(now - 30 * DAY, 'core');
    for (const card of coreCards) {
      card.status = 'dream';
      await this.store.saveCard(card);
      decayed++;
    }
    
    return { decayed, deleted };
  }
  
  async reactivate(topicKeys: string[]): Promise<number> {
    let reactivated = 0;
    
    for (const topicKey of topicKeys) {
      const entries = await this.store.getEntriesByContext('local', 'general');
      const matching = entries.filter(e => 
        e.topic_key === topicKey && 
        (e.status === 'dream' || e.status === 'forgotten')
      );
      
      for (const entry of matching) {
        entry.status = 'core';
        entry.last_accessed_at = Date.now();
        await this.store.saveEntry(entry);
        
        await this.store.appendEvent(createMemoryEvent({
          topic_key: topicKey,
          event_type: 'reactivation',
          payload: { from_status: entry.status },
        }));
        
        reactivated++;
      }
    }
    
    return reactivated;
  }
  
  // ============ PRIVATE HELPERS ============
  
  private addToShortTerm(item: ShortTermItem): void {
    this.shortTermBuffer.push(item);
    
    // Evict oldest if over capacity
    while (this.shortTermBuffer.length > MAX_SHORT_TERM) {
      const evicted = this.shortTermBuffer.shift();
      if (evicted) {
        // Could trigger pattern detection on eviction
        this.patternDetector.onEviction(evicted);
      }
    }
  }
  
  private buildGeneralOverlay(entries: MemoryEntry[]): GeneralOverlay {
    const blocked: string[] = [];
    const interested: string[] = [];
    const followedCreators: string[] = [];
    const blockedCreators: string[] = [];
    const facts: Record<string, unknown> = {};
    
    for (const entry of entries) {
      if (entry.topic_key.startsWith('blocked:')) {
        blocked.push(entry.topic_key.replace('blocked:', ''));
      } else if (entry.topic_key.startsWith('interested:')) {
        interested.push(entry.topic_key.replace('interested:', ''));
      } else if (entry.topic_key.startsWith('follow_creator:')) {
        followedCreators.push(entry.topic_key.replace('follow_creator:', ''));
      } else if (entry.topic_key.startsWith('block_creator:')) {
        blockedCreators.push(entry.topic_key.replace('block_creator:', ''));
      } else if (entry.topic_key.startsWith('fact:')) {
        const factKey = entry.topic_key.replace('fact:', '');
        facts[factKey] = entry.value;
      }
    }
    
    return {
      blocked_forever: blocked,
      always_interested: interested,
      followed_creators: followedCreators,
      blocked_creators: blockedCreators,
      personal_facts: facts,
    };
  }
  
  private actionToBufferAction(action: IntentType): ShortTermItem['action'] {
    switch (action) {
      case 'interested': return 'like';
      case 'not_interested': return 'hide';
      case 'one_time': return 'skip';
      default: return 'view';
    }
  }
}
```

---

## PatternDetector

```typescript
// src/intelligence/memory/PatternDetector.ts

import { MemoryStore } from './storage/MemoryStore';
import { MidTermCard, createMidTermCard } from './models/MidTermCard';
import { ShortTermItem } from './models/MemoryPack';
import { ContextBucket, IntentType, PatternType } from './models/types';

const PATTERN_THRESHOLD = 3; // Minimum occurrences to create pattern
const CONFIRM_THRESHOLD = 5; // Occurrences to confirm pattern

export class PatternDetector {
  private store: MemoryStore;
  private evictionBuffer: ShortTermItem[] = [];
  
  constructor(store: MemoryStore) {
    this.store = store;
  }
  
  async detect(
    topics: string[],
    action: IntentType,
    context: ContextBucket
  ): Promise<MidTermCard | null> {
    // Only detect patterns for explicit feedback
    if (action === 'one_time') return null;
    
    const patternType: PatternType = action === 'not_interested' 
      ? 'block_pattern' 
      : 'interest_pattern';
    
    // Check if pattern card already exists
    for (const topic of topics) {
      const existingCard = await this.store.findMatchingCard([topic], patternType);
      
      if (existingCard) {
        // Update existing card
        existingCard.occurrence_count++;
        existingCard.last_seen_at = Date.now();
        existingCard.confidence = Math.min(
          1.0,
          existingCard.confidence + 0.05
        );
        
        // Add any new topics
        for (const t of topics) {
          if (!existingCard.entities.some(e => e.name.toLowerCase() === t.toLowerCase())) {
            existingCard.entities.push({
              type: 'topic',
              name: t,
              weight: 0.8,
            });
          }
        }
        
        await this.store.saveCard(existingCard);
        return existingCard;
      }
    }
    
    // Check if we should create a new pattern
    const recentEvents = await this.store.getRecentEvents(100);
    
    for (const topic of topics) {
      const similarActions = recentEvents.filter(event => {
        if (event.event_type !== 'interaction') return false;
        const payload = event.payload as { action?: string };
        if (payload.action !== action) return false;
        return event.topic_key.toLowerCase().includes(topic.toLowerCase());
      });
      
      if (similarActions.length >= PATTERN_THRESHOLD) {
        // Create new pattern card
        const summary = action === 'not_interested'
          ? `User consistently blocks ${topic} content`
          : `User consistently likes ${topic} content`;
        
        const card = createMidTermCard({
          summary,
          pattern_type: patternType,
          context_bucket: context,
          entities: topics.map(t => ({
            type: 'topic',
            name: t,
            weight: 1.0,
          })),
          tags: topics,
          confidence: similarActions.length >= CONFIRM_THRESHOLD ? 0.9 : 0.7,
          occurrence_count: similarActions.length,
          source_refs: similarActions.slice(0, 10).map(e => ({
            content_id: e.source_ref,
            platform: (e.payload as Record<string, string>).platform ?? 'unknown',
            action: action,
            timestamp: e.occurred_at,
          })),
        });
        
        await this.store.saveCard(card);
        return card;
      }
    }
    
    return null;
  }
  
  onEviction(item: ShortTermItem): void {
    this.evictionBuffer.push(item);
    
    // Keep buffer manageable
    if (this.evictionBuffer.length > 100) {
      this.evictionBuffer.shift();
    }
    
    // Could analyze eviction buffer for patterns too
  }
}
```

---

## DecayManager

```typescript
// src/intelligence/memory/DecayManager.ts

import { MemoryStore } from './storage/MemoryStore';
import { MemoryStatus } from './models/types';

export interface DecayConfig {
  mid_term: {
    core_to_dream: number;      // days
    dream_to_forgotten: number;
    forgotten_to_deleted: number;
  };
  working_set: {
    core_to_dream: number;
    dream_to_forgotten: number;
    forgotten_to_deleted: number;
  };
}

const DEFAULT_CONFIG: DecayConfig = {
  mid_term: {
    core_to_dream: 30,
    dream_to_forgotten: 90,
    forgotten_to_deleted: 180,
  },
  working_set: {
    core_to_dream: 7,
    dream_to_forgotten: 30,
    forgotten_to_deleted: 90,
  },
};

export class DecayManager {
  private store: MemoryStore;
  private config: DecayConfig;
  
  constructor(store: MemoryStore, config: DecayConfig = DEFAULT_CONFIG) {
    this.store = store;
    this.config = config;
  }
  
  async runCycle(): Promise<{ decayed: number; deleted: number }> {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    
    let decayed = 0;
    let deleted = 0;
    
    // Process transitions: core → dream → forgotten → deleted
    const transitions: Array<{
      fromStatus: MemoryStatus;
      toStatus: MemoryStatus | 'delete';
      thresholdKey: keyof DecayConfig['mid_term'];
    }> = [
      { fromStatus: 'core', toStatus: 'dream', thresholdKey: 'core_to_dream' },
      { fromStatus: 'dream', toStatus: 'forgotten', thresholdKey: 'dream_to_forgotten' },
      { fromStatus: 'forgotten', toStatus: 'delete', thresholdKey: 'forgotten_to_deleted' },
    ];
    
    for (const transition of transitions) {
      // Get entries for this transition
      const mtThreshold = this.config.mid_term[transition.thresholdKey] * DAY;
      const wsThreshold = this.config.working_set[transition.thresholdKey] * DAY;
      
      const entries = await this.store.getEntriesForDecay(
        now - Math.max(mtThreshold, wsThreshold),
        transition.fromStatus
      );
      
      for (const entry of entries) {
        const threshold = entry.memory_type === 'working_set' 
          ? wsThreshold 
          : mtThreshold;
        
        if (now - entry.last_accessed_at >= threshold) {
          if (transition.toStatus === 'delete') {
            await this.store.deleteEntry(entry.entry_id);
            deleted++;
          } else {
            entry.status = transition.toStatus;
            await this.store.saveEntry(entry);
            decayed++;
          }
        }
      }
      
      // Also process cards
      const cards = await this.store.getCardsForDecay(
        now - mtThreshold,
        transition.fromStatus
      );
      
      for (const card of cards) {
        if (now - card.last_seen_at >= mtThreshold) {
          if (transition.toStatus === 'delete') {
            card.status = 'deleted';
            deleted++;
          } else {
            card.status = transition.toStatus;
            decayed++;
          }
          await this.store.saveCard(card);
        }
      }
    }
    
    return { decayed, deleted };
  }
}
```

---

## ContextDetector

```typescript
// src/intelligence/memory/ContextDetector.ts

import { ContextBucket } from './models/types';

interface ContextSignals {
  platform: string;
  topics: string[];
  time: Date;
  explicit?: ContextBucket;
}

interface ContextScore {
  context: ContextBucket;
  score: number;
  reason: string;
}

export class ContextDetector {
  detect(signals: ContextSignals): ContextBucket {
    // Explicit override takes priority
    if (signals.explicit) {
      return signals.explicit;
    }
    
    const scores: ContextScore[] = [
      this.scoreWork(signals),
      this.scoreLearning(signals),
      this.scoreShopping(signals),
      this.scoreEntertainment(signals),
      this.scoreSocial(signals),
    ];
    
    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);
    
    // Return highest scoring context, or 'general' if no strong signal
    if (scores[0].score >= 0.5) {
      return scores[0].context;
    }
    
    return 'general';
  }
  
  private scoreWork(signals: ContextSignals): ContextScore {
    let score = 0;
    const reasons: string[] = [];
    
    // Time signal: weekday 9am-5pm
    const hour = signals.time.getHours();
    const day = signals.time.getDay();
    const isWeekday = day >= 1 && day <= 5;
    const isWorkHours = hour >= 9 && hour <= 17;
    
    if (isWeekday && isWorkHours) {
      score += 0.4;
      reasons.push('work hours');
    }
    
    // Topic signals
    const workTopics = ['programming', 'coding', 'business', 'productivity', 'work', 'office', 'meeting'];
    const topicMatches = signals.topics.filter(t => 
      workTopics.some(wt => t.toLowerCase().includes(wt))
    );
    
    if (topicMatches.length > 0) {
      score += 0.3 * Math.min(topicMatches.length, 2);
      reasons.push(`topics: ${topicMatches.join(', ')}`);
    }
    
    return { context: 'work', score, reason: reasons.join('; ') };
  }
  
  private scoreLearning(signals: ContextSignals): ContextScore {
    let score = 0;
    const reasons: string[] = [];
    
    // Topic signals
    const learningTopics = ['tutorial', 'course', 'learn', 'how to', 'education', 'lesson', 'guide'];
    const topicMatches = signals.topics.filter(t => 
      learningTopics.some(lt => t.toLowerCase().includes(lt))
    );
    
    if (topicMatches.length > 0) {
      score += 0.5 * Math.min(topicMatches.length, 2);
      reasons.push(`topics: ${topicMatches.join(', ')}`);
    }
    
    return { context: 'learning', score, reason: reasons.join('; ') };
  }
  
  private scoreShopping(signals: ContextSignals): ContextScore {
    let score = 0;
    const reasons: string[] = [];
    
    // Platform signal
    const shoppingPlatforms = ['amazon', 'ebay', 'walmart', 'target', 'bestbuy'];
    if (shoppingPlatforms.some(p => signals.platform.toLowerCase().includes(p))) {
      score += 0.7;
      reasons.push(`platform: ${signals.platform}`);
    }
    
    // Topic signals
    const shoppingTopics = ['review', 'unboxing', 'comparison', 'best', 'deal', 'price'];
    const topicMatches = signals.topics.filter(t => 
      shoppingTopics.some(st => t.toLowerCase().includes(st))
    );
    
    if (topicMatches.length > 0) {
      score += 0.3 * Math.min(topicMatches.length, 2);
      reasons.push(`topics: ${topicMatches.join(', ')}`);
    }
    
    return { context: 'shopping', score, reason: reasons.join('; ') };
  }
  
  private scoreEntertainment(signals: ContextSignals): ContextScore {
    let score = 0;
    const reasons: string[] = [];
    
    // Time signal: evening/weekend
    const hour = signals.time.getHours();
    const day = signals.time.getDay();
    const isWeekend = day === 0 || day === 6;
    const isEvening = hour >= 18 || hour <= 6;
    
    if (isWeekend) {
      score += 0.3;
      reasons.push('weekend');
    }
    if (isEvening) {
      score += 0.2;
      reasons.push('evening');
    }
    
    // Topic signals
    const entertainmentTopics = ['gaming', 'game', 'movie', 'music', 'funny', 'comedy', 'entertainment'];
    const topicMatches = signals.topics.filter(t => 
      entertainmentTopics.some(et => t.toLowerCase().includes(et))
    );
    
    if (topicMatches.length > 0) {
      score += 0.4 * Math.min(topicMatches.length, 2);
      reasons.push(`topics: ${topicMatches.join(', ')}`);
    }
    
    return { context: 'entertainment', score, reason: reasons.join('; ') };
  }
  
  private scoreSocial(signals: ContextSignals): ContextScore {
    let score = 0;
    const reasons: string[] = [];
    
    // Platform signal
    const socialPlatforms = ['twitter', 'facebook', 'instagram', 'tiktok', 'reddit'];
    if (socialPlatforms.some(p => signals.platform.toLowerCase().includes(p))) {
      score += 0.6;
      reasons.push(`platform: ${signals.platform}`);
    }
    
    return { context: 'social', score, reason: reasons.join('; ') };
  }
}
```

---

## Integration Examples

### Background Service Integration

```typescript
// src/background/index.ts

import { MemoryStore } from '../intelligence/memory/storage/MemoryStore';
import { MemoryService } from '../intelligence/memory/MemoryService';
import { DecayManager } from '../intelligence/memory/DecayManager';

let memoryService: MemoryService;

// Initialize on extension install/start
chrome.runtime.onInstalled.addListener(async () => {
  const store = new MemoryStore();
  await store.initialize();
  
  memoryService = new MemoryService(store);
  await memoryService.initialize();
  
  // Set up decay cycle alarm (runs daily)
  chrome.alarms.create('decay-cycle', {
    periodInMinutes: 24 * 60, // Daily
  });
});

// Handle decay cycle
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'decay-cycle') {
    const decayManager = new DecayManager(memoryService['store']);
    const result = await decayManager.runCycle();
    console.log('[RecoMe] Decay cycle complete:', result);
  }
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(message: any): Promise<any> {
  switch (message.type) {
    case 'PROCESS_CONTENT':
      return handleProcessContent(message.payload);
    case 'BLOCK_TOPIC':
      await memoryService.blockForever(message.payload.topic);
      return { success: true };
    case 'GET_MEMORY_PACK':
      return memoryService.retrieve(message.payload.context);
    default:
      return { error: 'Unknown message type' };
  }
}

async function handleProcessContent(payload: any) {
  const shouldHide = await memoryService.shouldHide(
    payload.topics,
    payload.creator,
    payload.context
  );
  
  const shouldBoost = await memoryService.shouldBoost(
    payload.topics,
    payload.creator,
    payload.context
  );
  
  return {
    hide: shouldHide.hide,
    boost: shouldBoost.boost,
    hideReason: shouldHide.reason,
    boostReason: shouldBoost.reason,
  };
}

export { memoryService };
```

### Content Script Usage

```typescript
// src/content/index.ts

async function processContentItem(item: ContentItem): Promise<void> {
  const response = await chrome.runtime.sendMessage({
    type: 'PROCESS_CONTENT',
    payload: {
      id: item.id,
      topics: item.topics,
      creator: item.creator,
      platform: detectPlatform(),
      context: getCurrentContext(),
    },
  });
  
  if (response.hide) {
    hideElement(item.element, response.hideReason);
  } else if (response.boost) {
    boostElement(item.element, response.boostReason);
  }
}

async function handleFeedback(
  contentId: string,
  topics: string[],
  creator: string | undefined,
  feedback: 'interested' | 'not_interested' | 'one_time'
): Promise<void> {
  await chrome.runtime.sendMessage({
    type: 'LEARN_FEEDBACK',
    payload: {
      content_id: contentId,
      content_topics: topics,
      creator,
      platform: detectPlatform(),
      action: feedback,
    },
  });
  
  // Optimistic UI update
  if (feedback === 'not_interested') {
    const element = document.querySelector(`[data-content-id="${contentId}"]`);
    if (element) {
      hideElement(element as HTMLElement, 'You said not interested');
    }
  }
}
```

---

## Summary

The Mnemosyne implementation provides:

1. **MemoryStore** - IndexedDB persistence with optimized indexes
2. **MemoryService** - High-level API for all memory operations
3. **PatternDetector** - Automatic pattern card creation
4. **DecayManager** - Configurable forgetting lifecycle
5. **ContextDetector** - Time/platform/content-based context detection

**Key Rules**:
- `facts_prefs` NEVER decay
- `general_overlay` ALWAYS included in retrieval
- Reactivation returns status to `core`
- Pattern cards need 3+ occurrences

**Next**: See [KNOWLEDGE_GRAPH.md](KNOWLEDGE_GRAPH.md) for graph integration.
