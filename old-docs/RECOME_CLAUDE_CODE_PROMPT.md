# RecoMe Development Prompt for Claude Code

> Paste this into Claude Code for AI-assisted development of RecoMe.

---

## 🎯 Project Identity

**RecoMe** is a browser extension that gives users sovereignty over recommendation algorithms.

**Tagline**: "Your feed, your rules."

**Core Problem**: Platforms optimize for engagement, not user wellbeing. Blocking "crypto" doesn't stop bitcoin/ethereum content. Research phases never end. Context doesn't matter.

**Solution**: Intelligent recommendation filtering with:
1. **Mnemosyne Memory** - Human-like memory with context, decay, and patterns
2. **Knowledge Graph** - Entity relationships (crypto → bitcoin → ethereum)
3. **Explainable AI** - User knows why content was hidden/shown

---

## 🏗️ Architecture At-a-Glance

```
USER ACTION → Content Script → Background Service → Intelligence Layer → Response
                    ↑                                      │
                    └──────────────────────────────────────┘
                              chrome.runtime.sendMessage

INTELLIGENCE LAYER:
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│  │   Memory    │    │  Knowledge  │    │   Recom-    │    │
│  │   System    │───▶│    Graph    │───▶│  mendation  │    │
│  │ (Mnemosyne) │    │             │    │   Engine    │    │
│  └─────────────┘    └─────────────┘    └─────────────┘    │
│        │                   │                   │           │
│        └───────────────────┴───────────────────┘           │
│                           │                                 │
│                    ┌──────┴──────┐                         │
│                    │  IndexedDB  │                         │
│                    └─────────────┘                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 Complete File Map

### Configuration Files
```
/
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── webpack.config.js         # Build configuration
├── tailwind.config.js        # TailwindCSS configuration
├── jest.config.js            # Test configuration
├── .eslintrc.js              # ESLint rules
├── .prettierrc               # Prettier formatting
└── .env.example              # Environment template
```

### Source Files
```
src/
├── manifest.json             # Extension manifest V3
│
├── background/
│   ├── index.ts              # Service worker entry
│   ├── messageHandler.ts     # Message router
│   └── alarms.ts             # Scheduled tasks
│
├── content/
│   ├── index.ts              # Content script entry
│   ├── adapters/
│   │   ├── BaseAdapter.ts    # Abstract adapter
│   │   ├── YouTubeAdapter.ts
│   │   ├── AmazonAdapter.ts
│   │   ├── TwitterAdapter.ts
│   │   ├── FacebookAdapter.ts
│   │   ├── EbayAdapter.ts
│   │   └── WalmartAdapter.ts
│   ├── observer.ts           # DOM observer
│   └── ui/
│       ├── FeedbackButtons.ts
│       ├── HideAnimation.ts
│       └── Toast.ts
│
├── popup/
│   ├── index.tsx             # Popup entry
│   ├── App.tsx               # Main component
│   └── components/
│       ├── Dashboard.tsx
│       ├── StatsCard.tsx
│       ├── PreferenceList.tsx
│       ├── ContextSwitcher.tsx
│       ├── GraphVisualization.tsx
│       └── Settings.tsx
│
├── intelligence/
│   ├── index.ts              # IntelligenceService
│   │
│   ├── memory/
│   │   ├── models/
│   │   │   ├── index.ts
│   │   │   ├── MemoryEntry.ts
│   │   │   ├── MemoryEvent.ts
│   │   │   ├── MidTermCard.ts
│   │   │   └── ContextState.ts
│   │   ├── storage/
│   │   │   ├── schema.ts
│   │   │   └── MemoryStore.ts
│   │   ├── MemoryService.ts
│   │   ├── PatternDetector.ts
│   │   ├── DecayManager.ts
│   │   └── ContextDetector.ts
│   │
│   ├── graph/
│   │   ├── schema.ts
│   │   ├── KnowledgeGraph.ts
│   │   ├── AffinityCalculator.ts
│   │   └── seed.ts
│   │
│   ├── extraction/
│   │   ├── EntityExtractor.ts
│   │   ├── RuleBasedExtractor.ts
│   │   └── LLMExtractor.ts
│   │
│   └── recommendation/
│       ├── RecommendationEngine.ts
│       ├── FactorCalculators.ts
│       └── Explainer.ts
│
├── data/
│   ├── IndexedDBManager.ts
│   ├── ChromeStorageManager.ts
│   ├── LRUCache.ts
│   └── SyncManager.ts
│
├── shared/
│   ├── types.ts
│   ├── constants.ts
│   ├── messages.ts
│   ├── utils.ts
│   └── Logger.ts
│
└── styles/
    ├── variables.css
    ├── animations.css
    ├── components.css
    └── popup.css
```

---

## 🧠 Memory System (Mnemosyne)

### Context Buckets
```typescript
type ContextBucket = 
  | 'work'           // 9-5 weekdays, productivity
  | 'learning'       // Tutorials, courses
  | 'shopping'       // E-commerce platforms
  | 'entertainment'  // Evenings, weekends, fun
  | 'social'         // Social media
  | 'general';       // ALWAYS included (blocked_forever)
```

### Memory Lanes
```typescript
type MemoryType = 
  | 'short_term'     // Session ring buffer (20 items)
  | 'mid_term'       // Pattern cards with decay
  | 'working_set'    // Current research, goals
  | 'facts_prefs'    // Permanent preferences
  | 'long_term';     // Historical timeline
```

### Memory Entry Schema
```typescript
interface MemoryEntry {
  entry_id: string;
  user_id: string;
  context_bucket: ContextBucket;
  memory_type: MemoryType;
  topic_key: string;              // "blocked:crypto", "interested:apple"
  value: {
    sentiment?: 'positive' | 'negative' | 'neutral';
    strength?: number;            // 0-1
    entity_type?: EntityType;
    entity_name?: string;
    related_entities?: string[];
    source_type?: 'explicit' | 'inferred' | 'llm';
    [key: string]: unknown;
  };
  confidence: number;             // 0-1
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

### Forgetting Lifecycle
```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   CORE ────────────▶ DREAM ────────────▶ FORGOTTEN ────▶ DEL │
│   100%               50%                 0%                  │
│    │                  │                   │                  │
│    │    30 days       │    90 days        │   180 days       │
│    │                  │                   │                  │
│    ◀──────────────────┴───────────────────┘                  │
│              REACTIVATION (user interacts)                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Decay Policy
| Type | Core → Dream | Dream → Forgotten | → Deleted |
|------|--------------|-------------------|-----------|
| mid_term | 30 days | 90 days | 180 days |
| working_set | 7 days | 30 days | 90 days |
| facts_prefs | NEVER | NEVER | Manual |

### Key Rule: General Overlay
```typescript
// ALWAYS include general context in retrieval
async retrieve(contextBucket: ContextBucket): Promise<MemoryPack> {
  const contextMemory = await this.getForContext(contextBucket);
  const generalMemory = await this.getForContext('general');  // ALWAYS
  
  return {
    ...contextMemory,
    general_overlay: generalMemory,  // blocked_forever lives here
  };
}
```

---

## 🕸️ Knowledge Graph

### Entity Types
```typescript
type EntityType = 
  | 'user' | 'creator' | 'brand' | 'product' 
  | 'topic' | 'category' | 'content_type' 
  | 'sentiment' | 'audience' | 'format' | 'content';
```

### Relation Types
```typescript
type RelationType =
  // User preferences
  | 'interested_in' | 'not_interested_in' | 'one_time_interest'
  | 'follows' | 'blocked'
  // Content
  | 'created_by' | 'about' | 'features' | 'belongs_to'
  | 'has_type' | 'targets' | 'has_format'
  // Entity-entity
  | 'is_a' | 'part_of' | 'owned_by' | 'similar_to'
  | 'opposite_of' | 'related_to' | 'competes_with';
```

### Affinity Calculation
```typescript
// Path decay: 0.7^depth
// user ─blocked→ crypto ─similar_to→ bitcoin
// affinity(user, bitcoin) = -1 × 0.7 = -0.7

calculateAffinity(userId: string, entityId: string): number {
  let score = 0;
  
  // Direct relations
  const direct = this.getRelations(userId, 'outgoing');
  for (const rel of direct) {
    if (rel.target_id === entityId) {
      score += this.getRelationScore(rel);  // ±1 × weight
    }
  }
  
  // Indirect (traverse with decay)
  const paths = this.findPaths(userId, entityId, maxDepth: 3);
  for (const path of paths) {
    const pathScore = this.calculatePathScore(path);  // decay^depth
    score += pathScore;
  }
  
  return Math.max(-1, Math.min(1, score));
}
```

### Seed Data (Pre-loaded)
```typescript
const SEED_RELATIONS = [
  // Crypto cluster
  { source: 'crypto', target: 'bitcoin', type: 'similar_to', weight: 0.95 },
  { source: 'crypto', target: 'ethereum', type: 'similar_to', weight: 0.9 },
  { source: 'crypto', target: 'NFT', type: 'similar_to', weight: 0.85 },
  { source: 'crypto', target: 'DeFi', type: 'similar_to', weight: 0.8 },
  { source: 'crypto', target: 'Web3', type: 'similar_to', weight: 0.75 },
  
  // Product hierarchies
  { source: 'iPhone', target: 'smartphone', type: 'is_a', weight: 1.0 },
  { source: 'iPhone', target: 'Apple', type: 'owned_by', weight: 1.0 },
  
  // Categories
  { source: 'gaming', target: 'entertainment', type: 'belongs_to', weight: 1.0 },
  // ... more
];
```

---

## ⚖️ Recommendation Engine

### Factor Weights
```typescript
const FACTOR_WEIGHTS = {
  direct_block: 10,    // Explicit block → instant hide
  pattern_match: 7,    // Mid-term card match
  working_set: 6,      // Research relevance
  interest_match: 5,   // Explicit interest
  graph_affinity: 4,   // Knowledge graph score
  context_fit: 3,      // Context appropriateness
  similarity: 2,       // Content similarity
  recency: 1,          // Recent interaction
};
```

### Thresholds
```typescript
const THRESHOLDS = {
  hide: -0.5,       // score < -0.5 → HIDE
  suppress: -0.2,   // score < -0.2 → dim/suppress
  boost: 0.5,       // score > 0.5 → BOOST
  prompt: 0.3,      // confidence < 0.3 → ask user
};
```

### Recommendation Flow
```typescript
async recommend(content: AnalyzedContent): Promise<RecommendationResult> {
  // 1. Check instant-block first
  const blockFactor = await this.checkDirectBlock(content);
  if (blockFactor.score < -0.9) {
    return { action: 'hide', score: -1, confidence: 1, ... };
  }
  
  // 2. Calculate all factors
  const factors = [
    blockFactor,
    await this.calculatePatternMatch(content),
    await this.calculateWorkingSetRelevance(content),
    await this.calculateInterestMatch(content),
    await this.calculateGraphAffinity(content),
    await this.calculateContextFit(content),
  ];
  
  // 3. Weighted score
  const totalWeight = factors.reduce((s, f) => s + Math.abs(f.weight), 0);
  const score = factors.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight;
  
  // 4. Determine action
  const action = score < -0.5 ? 'hide' 
    : score < -0.2 ? 'suppress'
    : score > 0.5 ? 'boost' 
    : 'show';
  
  return { action, score, factors, explanation: '...' };
}
```

---

## 📨 Message Protocol

### Content Script → Background
```typescript
// Process content item
{ type: 'PROCESS_CONTENT', payload: { id, title, creator, platform, metadata } }

// Record feedback
{ type: 'LEARN_FEEDBACK', payload: { content, feedback: 'interested' | 'not_interested' | 'one_time' } }

// Get settings
{ type: 'GET_SETTINGS', payload: null }
```

### Popup → Background
```typescript
{ type: 'GET_STATS', payload: null }
{ type: 'GET_MEMORY_PACK', payload: { contextBucket } }
{ type: 'GET_GRAPH_DATA', payload: null }
{ type: 'BLOCK_TOPIC', payload: { topic: string } }
{ type: 'SWITCH_CONTEXT', payload: { context: ContextBucket } }
```

### Response Format
```typescript
interface MessageResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

---

## 🗄️ IndexedDB Schema

```typescript
const STORES = {
  memory_entries: {
    keyPath: 'entry_id',
    indexes: [
      { name: 'by_user_context', keyPath: ['user_id', 'context_bucket'] },
      { name: 'by_user_type', keyPath: ['user_id', 'memory_type'] },
      { name: 'by_status', keyPath: ['user_id', 'status'] },
      { name: 'by_topic', keyPath: ['user_id', 'topic_key'] },
      { name: 'by_last_accessed', keyPath: 'last_accessed_at' },
    ],
  },
  memory_events: {
    keyPath: 'event_id',
    indexes: [
      { name: 'by_occurred', keyPath: 'occurred_at' },
      { name: 'by_topic', keyPath: 'topic_key' },
    ],
  },
  mid_term_cards: {
    keyPath: 'card_id',
    indexes: [
      { name: 'by_context', keyPath: 'context_bucket' },
      { name: 'by_last_seen', keyPath: 'last_seen_at' },
    ],
  },
  entities: {
    keyPath: 'id',
    indexes: [
      { name: 'by_type', keyPath: 'type' },
      { name: 'by_name', keyPath: 'name' },
    ],
  },
  relations: {
    keyPath: 'id',
    indexes: [
      { name: 'by_source', keyPath: 'source_id' },
      { name: 'by_target', keyPath: 'target_id' },
      { name: 'by_type', keyPath: 'type' },
    ],
  },
};
```

---

## 🎨 UI Components

### Hide Animation
```css
.recome-hiding {
  animation: recome-hide 400ms ease-out forwards;
}

@keyframes recome-hide {
  0% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.95); }
  100% { opacity: 0; transform: scale(0.9); height: 0; margin: 0; padding: 0; }
}
```

### Toast Notification
```typescript
function showToast(message: string, type: 'success' | 'info' | 'warning') {
  const toast = document.createElement('div');
  toast.className = `recome-toast recome-toast-${type}`;
  toast.innerHTML = `
    <span class="recome-toast-icon">${type === 'success' ? '✨' : 'ℹ️'}</span>
    <span class="recome-toast-message">${message}</span>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
```

### Feedback Buttons
```typescript
function injectFeedbackUI(element: HTMLElement, contentId: string) {
  const container = document.createElement('div');
  container.className = 'recome-feedback';
  container.innerHTML = `
    <button class="recome-btn recome-btn-like" data-action="interested">👍</button>
    <button class="recome-btn recome-btn-dislike" data-action="not_interested">👎</button>
    <button class="recome-btn recome-btn-onetime" data-action="one_time">⏱️</button>
  `;
  
  container.addEventListener('click', (e) => {
    const action = (e.target as HTMLElement).dataset.action;
    if (action) handleFeedback(contentId, action as IntentType);
  });
  
  element.appendChild(container);
}
```

---

## 🧪 Testing Patterns

### Memory Service Tests
```typescript
describe('MemoryService', () => {
  it('should block topic forever', async () => {
    await memoryService.blockForever('crypto');
    
    const result = await memoryService.shouldHide(['bitcoin', 'crypto']);
    expect(result.hide).toBe(true);
  });
  
  it('should include general overlay in all contexts', async () => {
    await memoryService.blockForever('crypto');
    
    const pack = await memoryService.retrieve('entertainment');
    expect(pack.general_overlay.entries).toContainEqual(
      expect.objectContaining({ topic_key: 'blocked:crypto' })
    );
  });
  
  it('should create pattern card after 3 similar actions', async () => {
    for (let i = 0; i < 5; i++) {
      await memoryService.writeTurn({
        content_topics: ['crypto'],
        action: 'not_interested',
      });
    }
    
    const cards = await memoryService.getMidTermCards();
    expect(cards).toContainEqual(
      expect.objectContaining({ pattern_type: 'block_pattern' })
    );
  });
});
```

### Knowledge Graph Tests
```typescript
describe('KnowledgeGraph', () => {
  it('should find similar entities', () => {
    graph.seedDefaults();
    graph.addRelation({
      source_id: 'user',
      target_id: 'crypto',
      type: 'blocked',
      weight: 1.0,
    });
    
    const similar = graph.findSimilar('crypto', 5);
    expect(similar.map(s => s.entity.name)).toContain('bitcoin');
  });
  
  it('should propagate negative affinity', () => {
    const affinity = affinityCalculator.calculateEntityAffinity('user', 'bitcoin');
    expect(affinity).toBeLessThan(0);  // crypto blocked → bitcoin negative
  });
});
```

---

## 📋 Implementation Checklist

### Phase 1: Core Memory (Week 1)
- [ ] IndexedDB schema (schema.ts)
- [ ] MemoryStore CRUD operations
- [ ] MemoryService.writeTurn()
- [ ] MemoryService.retrieve()
- [ ] MemoryService.blockForever()
- [ ] MemoryService.shouldHide()
- [ ] General overlay in all retrievals
- [ ] Unit tests

### Phase 2: Context System (Week 2)
- [ ] ContextDetector
- [ ] Time-based detection
- [ ] Platform-based detection
- [ ] Content-based detection
- [ ] switchContext()
- [ ] Context state persistence
- [ ] Unit tests

### Phase 3: Pattern Detection (Week 3)
- [ ] PatternDetector
- [ ] Mid-term card creation
- [ ] Pattern-based recommendation
- [ ] Card lifecycle (3+ occurrences)
- [ ] Unit tests

### Phase 4: Knowledge Graph (Week 4)
- [ ] KnowledgeGraph class
- [ ] Entity/Relation storage
- [ ] Seed data
- [ ] RuleBasedExtractor
- [ ] AffinityCalculator
- [ ] Unit tests

### Phase 5: Integration (Week 5)
- [ ] Full recommendation pipeline
- [ ] DecayManager + chrome.alarms
- [ ] YouTube adapter complete
- [ ] Hide animation + toast
- [ ] Popup UI
- [ ] End-to-end tests

---

## 🚨 Critical Rules

1. **Always include `general` overlay** - blocked_forever must apply everywhere
2. **Never auto-delete facts_prefs** - explicit user action only
3. **Decay only mid_term and working_set** - not facts_prefs
4. **Graph affinity uses 0.7^depth decay** - deeper paths matter less
5. **Pattern cards need 3+ occurrences** - don't create on single action
6. **Reactivation returns status to CORE** - not just Dream
7. **Direct block = instant hide** - don't calculate other factors

---

## 💡 Development Tips

```typescript
// Enable debug logging
localStorage.setItem('recome_debug', 'true');

// Quick test memory in console
await memoryService.blockForever('test');
console.log(await memoryService.shouldHide(['test']));

// Reset all data
await indexedDB.deleteDatabase('recome_db');

// View current context
console.log(await memoryService.getContextState());
```

---

**Use this prompt with Claude Code. It contains everything needed to implement RecoMe correctly.**
