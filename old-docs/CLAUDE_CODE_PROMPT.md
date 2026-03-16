# Claude Code Prompt for RecoMe Development

> Copy this entire document into Claude Code to get AI-assisted development.

---

## Project Overview

You are helping build **RecoMe**, a browser extension that gives users control over recommendation algorithms across YouTube, Amazon, Twitter, Facebook, eBay, and Walmart.

### Key Innovation

RecoMe uses two advanced systems:

1. **Mnemosyne Memory System**: Human-like memory with context buckets, forgetting lifecycle, and pattern detection
2. **Knowledge Graph**: Entity relationships that enable "block crypto → also blocks bitcoin, ethereum, NFT..."

### Tech Stack

- **Language**: TypeScript 5.0+
- **Extension**: Chrome Manifest V3
- **UI**: React 18 + TailwindCSS
- **Storage**: IndexedDB (via idb library) + Chrome Storage
- **Build**: Webpack 5
- **Testing**: Jest

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RECOME ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  BROWSER LAYER                                                              │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│  │   Content   │     │  Background │     │    Popup    │                   │
│  │   Scripts   │◀───▶│   Service   │◀───▶│     UI      │                   │
│  │  (per tab)  │     │  (worker)   │     │   (React)   │                   │
│  └─────────────┘     └─────────────┘     └─────────────┘                   │
│                              │                                              │
│  INTELLIGENCE LAYER          │                                              │
│                    ┌─────────┴─────────┐                                   │
│                    │                   │                                   │
│         ┌──────────┴───────┐ ┌────────┴────────┐                          │
│         │  Memory System   │ │ Knowledge Graph │                          │
│         │   (Mnemosyne)    │ │                 │                          │
│         │                  │ │  Entities       │                          │
│         │  Context Buckets │ │  Relations      │                          │
│         │  Memory Lanes    │ │  Affinity Calc  │                          │
│         │  Pattern Detect  │ │                 │                          │
│         │  Decay Lifecycle │ │                 │                          │
│         └──────────────────┘ └─────────────────┘                          │
│                    │                   │                                   │
│                    └─────────┬─────────┘                                   │
│                              │                                              │
│                    ┌─────────┴─────────┐                                   │
│                    │   Recommendation  │                                   │
│                    │      Engine       │                                   │
│                    │                   │                                   │
│                    │  Multi-factor     │                                   │
│                    │  scoring with     │                                   │
│                    │  explanations     │                                   │
│                    └───────────────────┘                                   │
│                              │                                              │
│  DATA LAYER                  │                                              │
│                    ┌─────────┴─────────┐                                   │
│                    │     IndexedDB     │                                   │
│                    │   Chrome Storage  │                                   │
│                    │     LRU Cache     │                                   │
│                    └───────────────────┘                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
src/
├── manifest.json              # Chrome Extension Manifest V3
│
├── background/                # Service Worker (single instance)
│   ├── index.ts               # Entry point, initialization
│   ├── messageHandler.ts      # Routes messages from content/popup
│   └── alarms.ts              # Scheduled tasks (decay cycle)
│
├── content/                   # Content Scripts (per-tab)
│   ├── index.ts               # Entry, detects platform, loads adapter
│   ├── adapters/
│   │   ├── BaseAdapter.ts     # Abstract base class
│   │   ├── YouTubeAdapter.ts  # YouTube-specific implementation
│   │   ├── AmazonAdapter.ts   # Amazon-specific implementation
│   │   ├── TwitterAdapter.ts
│   │   ├── FacebookAdapter.ts
│   │   ├── EbayAdapter.ts
│   │   └── WalmartAdapter.ts
│   ├── observer.ts            # MutationObserver manager
│   └── ui/
│       ├── FeedbackButtons.ts # Injected feedback UI
│       ├── HideAnimation.ts   # Hide animation effect
│       └── Toast.ts           # Toast notifications
│
├── popup/                     # Popup UI (React)
│   ├── index.tsx              # Entry point
│   ├── App.tsx                # Main app component
│   └── components/
│       ├── Dashboard.tsx      # Main dashboard view
│       ├── StatsCard.tsx      # Statistics display
│       ├── PreferenceList.tsx # List of preferences
│       ├── ContextSwitcher.tsx # Context toggle
│       └── Settings.tsx       # Settings panel
│
├── intelligence/              # AI/ML Layer
│   ├── index.ts               # IntelligenceService coordinator
│   │
│   ├── memory/                # Mnemosyne Memory System
│   │   ├── models/
│   │   │   ├── index.ts       # Export all models
│   │   │   ├── MemoryEntry.ts # Current state of a memory
│   │   │   ├── MemoryEvent.ts # Immutable timeline event
│   │   │   ├── MidTermCard.ts # Pattern card
│   │   │   └── ContextState.ts # Current context
│   │   ├── storage/
│   │   │   ├── schema.ts      # IndexedDB schema definition
│   │   │   └── MemoryStore.ts # CRUD operations
│   │   ├── MemoryService.ts   # Main API for memory operations
│   │   ├── PatternDetector.ts # Detects patterns, creates cards
│   │   ├── DecayManager.ts    # Handles forgetting lifecycle
│   │   └── ContextDetector.ts # Detects user context
│   │
│   ├── graph/                 # Knowledge Graph
│   │   ├── schema.ts          # Entity and Relation types
│   │   ├── KnowledgeGraph.ts  # Graph operations
│   │   ├── AffinityCalculator.ts # Calculates user-entity affinity
│   │   └── seed.ts            # Pre-seeded knowledge
│   │
│   ├── extraction/            # Entity Extraction
│   │   ├── EntityExtractor.ts # Coordinator
│   │   ├── RuleBasedExtractor.ts # Pattern matching
│   │   └── LLMExtractor.ts    # Claude Haiku integration
│   │
│   └── recommendation/        # Recommendation Engine
│       ├── RecommendationEngine.ts # Multi-factor scoring
│       ├── FactorCalculators.ts # Individual factor calculations
│       └── Explainer.ts       # Generates explanations
│
├── data/                      # Data Layer
│   ├── IndexedDBManager.ts    # IndexedDB wrapper
│   ├── ChromeStorageManager.ts # Chrome storage wrapper
│   ├── LRUCache.ts            # In-memory cache
│   └── SyncManager.ts         # Future: cloud sync
│
├── shared/                    # Shared Utilities
│   ├── types.ts               # Global type definitions
│   ├── constants.ts           # App constants
│   ├── messages.ts            # Message type definitions
│   ├── utils.ts               # Helper functions
│   └── Logger.ts              # Logging utility
│
└── styles/                    # CSS
    ├── variables.css          # CSS variables
    ├── animations.css         # Animation definitions
    └── popup.css              # Popup styles
```

---

## Core Data Models

### Memory Entry (Current State)

```typescript
interface MemoryEntry {
  entry_id: string;
  user_id: string;
  context_bucket: 'work' | 'learning' | 'shopping' | 'entertainment' | 'social' | 'general';
  memory_type: 'short_term' | 'mid_term' | 'working_set' | 'facts_prefs' | 'long_term';
  topic_key: string;           // e.g., "blocked:crypto", "interested:apple"
  value: MemoryValue;          // Flexible JSON content
  confidence: number;          // 0.0 - 1.0
  status: 'core' | 'dream' | 'forgotten' | 'archived' | 'deleted';
  valid_from: number;
  valid_to: number | null;
  last_confirmed_at: number;
  last_accessed_at: number;
  access_count: number;
  version: number;
  is_deleted: boolean;
  created_at: number;
  updated_at: number;
}
```

### Memory Event (Timeline)

```typescript
interface MemoryEvent {
  event_id: string;
  user_id: string;
  context_bucket: ContextBucket;
  memory_type: MemoryType;
  topic_key: string;
  event_type: 'preference_set' | 'preference_inferred' | 'interaction' | 
              'confirmation' | 'decay' | 'reactivation' | 'deletion' |
              'context_switch' | 'session_start' | 'session_end';
  payload: Record<string, unknown>;
  source_ref: string;
  occurred_at: number;
  created_at: number;
}
```

### Mid-Term Card (Pattern)

```typescript
interface MidTermCard {
  card_id: string;
  user_id: string;
  context_bucket: ContextBucket;
  summary: string;             // "User blocks crypto content"
  entities: CardEntity[];
  tags: string[];
  source_refs: SourceRef[];
  confidence: number;
  status: MemoryStatus;
  pattern_type: 'block_pattern' | 'interest_pattern' | 'research_pattern' | 
                'time_pattern' | 'context_pattern';
  occurrence_count: number;
  first_seen_at: number;
  last_seen_at: number;
  created_at: number;
  updated_at: number;
}
```

### Knowledge Graph Entity

```typescript
interface Entity {
  id: string;
  type: 'user' | 'creator' | 'brand' | 'product' | 'topic' | 
        'category' | 'content_type' | 'sentiment' | 'audience' | 
        'format' | 'content';
  name: string;
  aliases: string[];
  properties: Record<string, unknown>;
  embedding?: number[];
  created_at: number;
  updated_at: number;
}
```

### Knowledge Graph Relation

```typescript
interface Relation {
  id: string;
  source_id: string;
  target_id: string;
  type: 'interested_in' | 'not_interested_in' | 'one_time_interest' |
        'follows' | 'blocked' | 'created_by' | 'about' | 'features' |
        'belongs_to' | 'has_type' | 'targets' | 'has_format' | 'is_a' |
        'part_of' | 'owned_by' | 'similar_to' | 'opposite_of' |
        'related_to' | 'competes_with';
  weight: number;              // 0.0 - 1.0
  confidence: number;          // 0.0 - 1.0
  bidirectional: boolean;
  properties: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}
```

---

## Key Interfaces

### MemoryService API

```typescript
interface IMemoryService {
  // Write operations
  writeTurn(request: WriteTurnRequest): Promise<WriteTurnResponse>;
  blockForever(topic: string, entityType?: EntityType): Promise<void>;
  markInterested(topic: string, entityType?: EntityType, strength?: number): Promise<void>;
  setCurrentResearch(topic: string, criteria?: string[], candidates?: string[]): Promise<void>;
  
  // Read operations
  retrieve(contextBucket: ContextBucket): Promise<MemoryPack>;
  shouldHide(topics: string[], creator?: string, context?: ContextBucket): Promise<HideResult>;
  shouldBoost(topics: string[], creator?: string, context?: ContextBucket): Promise<BoostResult>;
  getWorkingSet(): Promise<WorkingSetState>;
  getTimeline(topicKey: string, limit?: number): Promise<MemoryEvent[]>;
  
  // Context operations
  detectContext(platform: Platform, topics: string[], time: Date): Promise<ContextBucket>;
  switchContext(context: ContextBucket): Promise<void>;
  
  // Lifecycle operations
  runDecayCycle(): Promise<DecayResult>;
  reactivate(topicKeys: string[]): Promise<number>;
}
```

### RecommendationEngine API

```typescript
interface IRecommendationEngine {
  recommend(content: AnalyzedContent): Promise<RecommendationResult>;
  learnFromFeedback(content: AnalyzedContent, feedback: IntentType): Promise<void>;
}

interface RecommendationResult {
  action: 'show' | 'hide' | 'boost' | 'suppress' | 'prompt';
  score: number;               // -1 to 1
  confidence: number;          // 0 to 1
  explanation: string;
  factors: RecommendationFactor[];
}

interface RecommendationFactor {
  name: string;
  weight: number;
  score: number;
  reason: string;
}
```

### KnowledgeGraph API

```typescript
interface IKnowledgeGraph {
  // Entity operations
  addEntity(entity: Omit<Entity, 'id' | 'created_at' | 'updated_at'>): Entity;
  getEntity(idOrAlias: string): Entity | null;
  getEntitiesByType(type: EntityType): Entity[];
  
  // Relation operations
  addRelation(relation: Omit<Relation, 'id' | 'created_at' | 'updated_at'>): Relation;
  getRelations(entityId: string, direction?: 'outgoing' | 'incoming' | 'both', type?: RelationType): Relation[];
  
  // Traversal
  traverse(sourceId: string, options?: TraverseOptions): TraversalResult[];
  findPath(sourceId: string, targetId: string, maxDepth?: number): string[] | null;
  findSimilar(entityId: string, limit?: number): Array<{ entity: Entity; score: number }>;
}
```

---

## Recommendation Factor Weights

```typescript
const FACTOR_WEIGHTS = {
  direct_block: 10,      // Explicit user block (highest priority)
  pattern_match: 7,      // Mid-term pattern card match
  working_set: 6,        // Current research/goals relevance
  interest_match: 5,     // Explicit interest match
  graph_affinity: 4,     // Knowledge graph path score
  context_fit: 3,        // Context appropriateness
  similarity: 2,         // Content similarity
  recency: 1,            // Recent interaction weight
};

const THRESHOLDS = {
  hide: -0.5,            // score < -0.5 → hide
  suppress: -0.2,        // score < -0.2 → suppress (dim)
  boost: 0.5,            // score > 0.5 → boost (highlight)
  prompt: 0.3,           // confidence < 0.3 → prompt user
};
```

---

## Forgetting Lifecycle

```
CORE (100% weight)
  │
  │ 30 days inactive
  ▼
DREAM (50% weight)
  │
  │ 90 days inactive
  ▼
FORGOTTEN (0% weight, not retrieved)
  │
  │ 180 days inactive
  ▼
DELETED (removed)

REACTIVATION: User interacts with topic → status returns to CORE
```

### Decay Policy

| Memory Type | Core → Dream | Dream → Forgotten | → Deleted |
|-------------|--------------|-------------------|-----------|
| mid_term | 30 days | 90 days | 180 days |
| working_set | 7 days | 30 days | 90 days |
| facts_prefs | NEVER | NEVER | Manual only |
| short_term | Session end | N/A | Immediate |

---

## Context Detection

### Context Buckets

| Context | When Detected | Boost | Suppress |
|---------|---------------|-------|----------|
| work | Weekday 9-5, programming content | Productivity, coding, business | Gaming, entertainment |
| learning | Tutorial content, courses | Educational, how-to | Distractions |
| shopping | Amazon/eBay/Walmart | Products, reviews | Unrelated |
| entertainment | Evening, weekend, fun content | Gaming, movies, music | Work-related |
| social | Twitter/Facebook | Social, news | N/A |
| general | Always active | N/A | Blocked forever items |

### Detection Signals

```typescript
interface ContextSignals {
  time: Date;           // Time of day, day of week
  platform: Platform;   // Which site user is on
  topics: string[];     // Detected content topics
  explicit?: ContextBucket; // User explicitly switched
}
```

---

## Message Types

```typescript
// Content Script → Background
type ContentToBackgroundMessage =
  | { type: 'PROCESS_CONTENT'; payload: ProcessContentPayload }
  | { type: 'LEARN_FEEDBACK'; payload: LearnFeedbackPayload }
  | { type: 'GET_SETTINGS'; payload: null };

// Popup → Background
type PopupToBackgroundMessage =
  | { type: 'GET_STATS'; payload: null }
  | { type: 'GET_MEMORY_PACK'; payload: { contextBucket: ContextBucket } }
  | { type: 'GET_GRAPH_DATA'; payload: null }
  | { type: 'BLOCK_TOPIC'; payload: { topic: string } }
  | { type: 'SWITCH_CONTEXT'; payload: { context: ContextBucket } };

// Response format
interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
```

---

## Implementation Priorities

### Phase 1: Core Memory (Week 1)
1. IndexedDB schema and MemoryStore
2. Basic MemoryService (writeTurn, retrieve, blockForever, shouldHide)
3. Facts/prefs storage
4. General overlay in all retrievals

### Phase 2: Context System (Week 2)
1. ContextDetector
2. Context state tracking
3. Context-specific retrieval
4. switchContext()

### Phase 3: Pattern Detection (Week 3)
1. PatternDetector
2. Mid-term card creation
3. Pattern-based recommendation boost
4. Card lifecycle management

### Phase 4: Knowledge Graph (Week 4)
1. KnowledgeGraph class
2. Entity extraction (rule-based)
3. Seed data for common topics
4. AffinityCalculator

### Phase 5: Integration (Week 5)
1. Full recommendation pipeline
2. Decay cycle via chrome.alarms
3. LLM extraction (optional)
4. Graph visualization

---

## Coding Standards

### TypeScript Guidelines

```typescript
// Use interfaces for object shapes
interface ContentItem {
  id: string;
  title: string;
  // ...
}

// Use type for unions and aliases
type Platform = 'youtube' | 'amazon' | 'twitter';
type ContextBucket = 'work' | 'learning' | 'shopping' | 'entertainment' | 'social' | 'general';

// Use readonly for immutable data
interface MemoryEvent {
  readonly event_id: string;
  readonly occurred_at: number;
  // ...
}

// Use explicit return types
async function processContent(item: ContentItem): Promise<RecommendationResult> {
  // ...
}

// Prefer async/await over .then()
// Prefer const over let
// Use optional chaining and nullish coalescing
const creator = item.creator ?? 'Unknown';
const title = item.metadata?.title?.trim();
```

### Error Handling

```typescript
// Wrap async operations in try/catch
try {
  const result = await memoryService.retrieve(context);
  return result;
} catch (error) {
  console.error('[RecoMe] Memory retrieval failed:', error);
  return getDefaultMemoryPack();
}

// Use custom error types for specific errors
class MemoryStoreError extends Error {
  constructor(message: string, public readonly operation: string) {
    super(message);
    this.name = 'MemoryStoreError';
  }
}
```

### Logging

```typescript
// Use consistent prefix
console.log('[RecoMe]', 'Processing content:', item.title);
console.warn('[RecoMe]', 'Low confidence result:', result.confidence);
console.error('[RecoMe]', 'Failed to save memory:', error);

// Use structured logging for debugging
if (DEBUG) {
  console.log('[RecoMe Debug]', {
    operation: 'recommend',
    input: content,
    output: result,
    duration: performance.now() - start,
  });
}
```

---

## Testing Patterns

```typescript
// Unit test example
describe('MemoryService', () => {
  let service: MemoryService;
  let store: MockMemoryStore;
  
  beforeEach(() => {
    store = new MockMemoryStore();
    service = new MemoryService(store);
  });
  
  describe('blockForever', () => {
    it('should create a blocked entry in facts_prefs', async () => {
      await service.blockForever('crypto');
      
      const entries = await store.getEntriesByType('facts_prefs');
      expect(entries).toContainEqual(
        expect.objectContaining({
          topic_key: 'blocked:crypto',
          memory_type: 'facts_prefs',
          context_bucket: 'general',
        })
      );
    });
    
    it('should include blocked topic in shouldHide check', async () => {
      await service.blockForever('crypto');
      
      const result = await service.shouldHide(['bitcoin', 'crypto']);
      expect(result.hide).toBe(true);
      expect(result.reason).toContain('crypto');
    });
  });
});
```

---

## Common Patterns

### Adapter Pattern for Platforms

```typescript
// BaseAdapter.ts
export abstract class BaseAdapter {
  abstract detectContent(container: HTMLElement): ContentItem[];
  abstract injectFeedbackUI(item: ContentItem): void;
  abstract hideContent(item: ContentItem): void;
}

// YouTubeAdapter.ts
export class YouTubeAdapter extends BaseAdapter {
  detectContent(container: HTMLElement): ContentItem[] {
    return Array.from(container.querySelectorAll('ytd-rich-item-renderer'))
      .map(el => this.parseItem(el as HTMLElement))
      .filter(Boolean);
  }
}
```

### Observer Pattern for DOM Changes

```typescript
// observer.ts
export function observeContainer(
  selector: string,
  callback: (mutations: MutationRecord[]) => void
): MutationObserver {
  const container = document.querySelector(selector);
  if (!container) throw new Error(`Container not found: ${selector}`);
  
  const observer = new MutationObserver(callback);
  observer.observe(container, { childList: true, subtree: true });
  
  return observer;
}
```

### Message Passing Pattern

```typescript
// Send message and wait for response
export async function sendMessage<T>(message: Message): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: MessageResponse<T>) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response.success) {
        resolve(response.data!);
      } else {
        reject(new Error(response.error));
      }
    });
  });
}
```

---

## Remember

1. **Always include general overlay** in memory retrieval
2. **Never delete facts_prefs** without explicit user action
3. **Decay only applies to mid_term and working_set**
4. **Graph affinity uses path decay** (0.7^depth)
5. **Pattern cards require 3+ occurrences**
6. **Context detection considers time + platform + content**
7. **Reactivation bumps status back to CORE**

---

**Use this prompt with Claude Code to get accurate, contextual assistance for RecoMe development.**
