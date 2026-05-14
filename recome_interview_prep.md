# RecoME — Interview Prep Guide

## 1. Elevator Pitch (30 seconds)

RecoME is a **privacy-first, AI-powered browser extension** that acts as your personal recommendation engine across the internet. Instead of each platform (YouTube, Amazon, Twitter, etc.) showing you content optimized for _their_ engagement metrics, RecoME learns _your_ preferences locally on your device and controls your feeds — hiding irrelevant content, boosting what matters to you, and surfacing cross-platform insights like "you watched reviews about this product on YouTube, here it is on Amazon at a good price." Everything runs client-side with a knowledge graph, multi-tier memory system, and multi-agent AI orchestration.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   Chrome Extension (Manifest V3)            │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │Content Scripts│  │ Background Worker │  │   Popup UI    │  │
│  │ (per-platform │──│  (Brain + Intel   │──│  (React/TSX)  │  │
│  │   adapters)   │  │   Service)        │  │  Dashboard    │  │
│  └──────────────┘  └────────┬─────────┘  └───────────────┘  │
└─────────────────────────────┼───────────────────────────────┘
                              │ chrome.runtime messages
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
      ┌──────────────┐ ┌───────────┐  ┌────────────────┐
      │  Brain Module │ │ IndexedDB │  │  Cloud Backend  │
      │ ─────────────│ │  (local)  │  │ (Hono/Prisma/  │
      │ • Orchestrator│ │ • Memory  │  │  PostgreSQL)   │
      │ • Knowledge  │ │ • Graph   │  │ • Auth (OAuth) │
      │   Graph      │ │ • Commerce│  │ • E2E Sync     │
      │ • Memory     │ │           │  │ • Stripe       │
      │   Service    │ └───────────┘  │ • Taste Twins  │
      │ • RecoEngine │                └────────────────┘
      │ • Agents (6) │
      └──────┬───────┘
             │
      ┌──────┴────────┐
      │   LLM APIs    │
      │ Claude / GPT  │
      │   / Gemini    │
      └───────────────┘
```

### Module Breakdown

| Module         | Purpose                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------- |
| **extension/** | Chrome extension — content scripts, background service worker, popup UI                       |
| **brain/**     | Intelligence layer — knowledge graph, memory, recommendation engine, multi-agent orchestrator |
| **web/**       | Next.js web dashboard for settings, analytics, and control                                    |
| **cloud/**     | Backend API — auth, E2E encrypted sync, billing, Taste Twin social network                    |
| **packages/**  | Shared TypeScript types and schema contracts across all modules                               |

---

## 3. The Content Recommendation Pipeline

This is the core data flow — how a piece of content gets scored and acted upon.

### Step-by-step Flow

1. User visits YouTube/Amazon/Twitter/etc.
2. **Content script adapter** detects feed items in the DOM and extracts metadata (title, creator, topics, URL)
3. Sends a `PROCESS_CONTENT` message to the background service worker
4. Background calls `IntelligenceService.processContent()`
5. **RecommendationEngine** runs a **5-factor scoring pipeline**
6. Returns an action (`hide` / `suppress` / `show` / `boost`) + human-readable explanation
7. Content script applies the action — hides the DOM element, adds a boost indicator, etc.

### The 5 Scoring Factors

| Factor             | What It Checks                                                                               | Weight      | Details                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------- |
| **Direct Block**   | Has the user explicitly blocked this topic/creator?                                          | Highest     | Short-circuits to `hide` if score <= -0.9. No need to compute anything else. |
| **Pattern Match**  | Does this match recurring interest/disinterest patterns?                                     | High        | Uses `PatternDetector` to find emerging behavioral patterns                  |
| **Graph Affinity** | How connected is this content to things the user cares about in the Knowledge Graph?         | Medium-High | Uses graph traversal via `AffinityCalculator`                                |
| **Context Fit**    | Does this content match the current browsing context (work/learning/shopping/entertainment)? | Medium      | Context auto-detected from URL + time-of-day                                 |
| **Recency**        | How fresh is the content?                                                                    | Low         | Newer content gets a slight boost                                            |

### Score-to-Action Mapping

```typescript
scoreToAction(score: number, aggressiveness: number): ContentAction {
  const hideThreshold = -0.9 + aggressiveness * 0.8;  // aggressiveness 0 → -0.9, 0.5 → -0.5, 1 → -0.1
  const suppressThreshold = -0.6 + aggressiveness * 0.6;
  if (score < hideThreshold) return 'hide';
  if (score < suppressThreshold) return 'suppress';
  if (score > SCORE_THRESHOLDS.boost) return 'boost';
  return 'show';
}
```

The **aggressiveness slider** lets users control how aggressive the filtering is. At 0, only extremely negative content gets hidden. At 1, almost anything below neutral gets hidden.

### Key Design Decision

Direct blocks **short-circuit** the entire pipeline. There is no point computing graph affinity if the user explicitly said "never show me this." This keeps the hot path fast.

---

## 4. The Knowledge Graph

### What It Is

An **entity-relation graph** stored in IndexedDB with an in-memory **LRU cache** (500 items, 5-minute TTL). It models the user's interests, preferences, and the relationships between topics, brands, creators, and products.

### Data Model

**Entity types**: `user`, `topic`, `brand`, `creator`, `product`, `category`

**Relation types**: `interested_in`, `not_interested_in`, `similar_to`, `related_to`, `bought`, `watched`, and more

### How the Graph Grows

| Source                    | How It Works                                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Explicit signals**      | User clicks "like" or "block" → adds/strengthens an edge                                                       |
| **Implicit signals**      | Dwell time on a YouTube video, search queries on Amazon → recorded via `recordImplicitSignalWithGraphBridge()` |
| **Entity extraction**     | LLM-powered `EntityExtractor` parses page content into structured entities                                     |
| **Rule-based extraction** | `RuleBasedExtractor` uses regex and heuristics as a fallback when LLM is unavailable                           |
| **Seeding**               | First-run seeds common entities/relations so the graph is not cold-start empty                                 |

### Cross-Platform Linking (Killer Feature)

The `CrossPlatformLinker` connects entities across platforms. Example:

1. User watches "Sony WH-1000XM5 review" on YouTube (5+ min dwell time)
2. Implicit signal records `topic: noise-canceling headphones`, `brand: Sony`, `product: WH-1000XM5`
3. User later browses Amazon and sees Sony WH-1000XM5 listing
4. `AffinityCalculator` traverses the graph, finds strong connection
5. A **Research Card** overlay appears: "You watched 3 reviews of this on YouTube"

### Why Not a Real Graph Database?

Everything runs client-side in the browser. IndexedDB is the only persistent storage available in a Chrome extension. The LRU cache makes traversals fast enough (sub-50ms for typical graphs). Since it is per-user and client-side, each instance only handles one user's data — no need for a distributed graph DB.

### Caching Strategy

```typescript
const entityCache = new LRUCache<string, GraphEntity>(500, 5 * 60 * 1000);
const relationsCache = new LRUCache<string, GraphRelation[]>(500, 5 * 60 * 1000);
```

- 500-item capacity per cache
- 5-minute TTL
- Cache-aside pattern: check cache first, fall back to IndexedDB, populate cache on read

---

## 5. The Memory System (Three-Tier)

### Design Inspiration

Inspired by human memory — short-term, mid-term, and long-term — with a decay mechanism that naturally forgets stale interests.

### Three Tiers

| Tier           | Purpose                                | Storage                    | Lifetime             |
| -------------- | -------------------------------------- | -------------------------- | -------------------- |
| **Short-term** | Ring buffer of recent browsing topics  | In-memory array            | Current session only |
| **Mid-term**   | Emerging interests with evidence cards | IndexedDB `mid_term_cards` | Days to weeks        |
| **Long-term**  | Confirmed preferences (core identity)  | IndexedDB `memory_entries` | Months+              |

### Promotion Flow

```
Short-term  ──(PatternDetector detects repeated engagement)──>  Mid-term
Mid-term    ──(sustained engagement over time)──>                Long-term
```

- A topic enters short-term when you first interact with it
- `PatternDetector` notices repeated engagement (e.g., user keeps watching cooking videos) → promotes to mid-term with a confidence score
- Sustained engagement over weeks → promoted to long-term as a "core" memory

### Decay Mechanism

`DecayManager` runs periodically, reducing confidence scores on memories that have not been reinforced. Old mid-term entries that never got promoted eventually decay to "forgotten" status. This prevents stale interests from polluting recommendations.

### Automatic Context Detection

`ContextDetector` auto-detects browsing context from URL patterns and time-of-day:

| Signal                           | Detected Context |
| -------------------------------- | ---------------- |
| `linkedin.com` at 10am           | `work`           |
| `youtube.com` at 9pm             | `entertainment`  |
| `amazon.com` with search queries | `shopping`       |
| `coursera.com` or `medium.com`   | `learning`       |
| `twitter.com` or `reddit.com`    | `social`         |

This context feeds into the recommendation engine so work-related content is not penalized during work hours, and entertainment is not suppressed during downtime.

### Memory Events

Every interaction records a `MemoryEvent`:

```typescript
async writeTurn(params: {
  content: ContentMetadata;
  action: FeedbackType;       // interested, not_interested, one_time, block_forever
  context?: ContextBucket;
  platform?: Platform;
}): Promise<void>
```

---

## 6. Multi-Agent Orchestration (Brain)

### Architecture

The `Brain` class is a **multi-agent orchestrator** inspired by crew-based AI architectures.

```
Task → ContextAssembler → TaskRouter → [Agents in parallel] → ResponseMerger → FeedbackLoop
```

### Processing Flow

1. A `BrainTask` arrives (from message handler, page event, or scheduled trigger)
2. `ContextAssembler` builds rich context from memory, graph, and current page state
3. `TaskRouter` selects which agents are relevant for this task type
4. Selected agents execute **in parallel** via `Promise.all()`
5. `ResponseMerger` consolidates all agent results into a coherent output
6. `FeedbackLoop` records which agents were helpful for future routing optimization

### The 6 Specialized Agents

| Agent             | Purpose                                                             | When It Activates             |
| ----------------- | ------------------------------------------------------------------- | ----------------------------- |
| **FilterAgent**   | Feed quality control — decides what to show/hide                    | Every content processing task |
| **ScoutAgent**    | Discovers deals, courses, events relevant to interests              | Shopping/learning contexts    |
| **ShopperAgent**  | Shopping intelligence — price analysis, comparison, deal evaluation | Amazon, eBay, Walmart pages   |
| **AdvisorAgent**  | Conversational Q&A — answers user questions about their data        | User-initiated chat           |
| **SocialAgent**   | Community trends, viral content detection                           | Twitter, Reddit, Instagram    |
| **GuardianAgent** | Privacy/safety auditing — flags tracking, dark patterns             | All contexts (background)     |

### Why Multiple Agents vs. One Big Prompt?

**Specialization.** Each agent has:

- A focused system prompt with domain-specific instructions
- Specific tools it can invoke via `ToolExecutor`
- Domain knowledge relevant to its specialty

The `ShopperAgent` knows about price history and deal evaluation; the `GuardianAgent` knows about privacy red flags. Routing ensures only relevant agents run, keeping **latency and API cost down**.

### Key Components

| Component          | Role                                                         |
| ------------------ | ------------------------------------------------------------ |
| `AgentRegistry`    | Manages available agents and their capabilities              |
| `TaskRouter`       | Routes tasks to appropriate agents based on type and context |
| `ContextAssembler` | Builds rich context from memory, graph, and page state       |
| `ResponseMerger`   | Consolidates multi-agent results into coherent output        |
| `FeedbackLoop`     | Records agent effectiveness for future routing optimization  |
| `AgentMemory`      | Tracks agent interaction history                             |
| `BaseAgent`        | Abstract base class with tool execution framework            |

---

## 7. Platform Adapters (Adapter Pattern)

### The Problem

RecoME supports 10+ platforms, each with completely different DOM structures, page layouts, and dynamic loading patterns. YouTube uses a completely different HTML structure than Amazon, Twitter, or Reddit.

### The Solution

Each platform has a dedicated adapter that extends `BaseAdapter`:

| Adapter            | Pages Handled                                        |
| ------------------ | ---------------------------------------------------- |
| `YouTubeAdapter`   | Home, search, watch, shorts, subscriptions, trending |
| `AmazonAdapter`    | Search, product pages, deals, homepage               |
| `TwitterAdapter`   | Timeline, search, profile, trending                  |
| `FacebookAdapter`  | News feed, marketplace, groups                       |
| `InstagramAdapter` | Feed, explore, reels                                 |
| `RedditAdapter`    | Home, subreddit, post                                |
| `eBayAdapter`      | Search, product, deals                               |
| `WalmartAdapter`   | Search, product, deals                               |
| `LinkedInAdapter`  | Feed, jobs, search                                   |

### What Each Adapter Handles

1. **Page type detection** — determines which type of page the user is on
2. **Card selectors** — CSS selectors to find feed items in the DOM
3. **Metadata extraction** — pulling title, creator, thumbnail, price from DOM elements
4. **Action application** — how to hide/boost/annotate cards on that specific platform
5. **MutationObserver setup** — watching for dynamically loaded content (infinite scroll, SPA navigation)

### Selector Health Tracking

`PathPatternCache` tracks selector health — if selectors break due to a platform UI update, it detects the failure rate and falls back gracefully rather than breaking silently.

### Why This Pattern?

Platforms change their DOM frequently. With this pattern, when YouTube redesigns their homepage, **only `YouTubeAdapter` needs updating**. The recommendation pipeline, memory system, and knowledge graph are completely decoupled from platform-specific DOM logic.

---

## 8. Cloud Backend

### Tech Stack

- **Framework**: Hono (lightweight, fast web framework)
- **ORM**: Prisma
- **Database**: PostgreSQL
- **Billing**: Stripe
- **Deployment**: Fly.io
- **Auth**: JWT access + refresh tokens, OAuth (Google, GitHub, Facebook)

### API Routes

| Route      | Purpose                                             |
| ---------- | --------------------------------------------------- |
| `/auth`    | Registration, login, token refresh, OAuth flows     |
| `/sync`    | E2E encrypted push/pull for settings, memory, graph |
| `/billing` | Stripe subscription management, usage tracking      |
| `/user`    | Profile, data store, device fingerprinting          |
| `/packs`   | Social data sharing (encrypted packs)               |
| `/twins`   | Taste Twin network (find similar users)             |
| `/agent`   | Agent context retrieval for cloud-side AI           |
| `/admin`   | Admin operations                                    |

### Database Schema (Prisma)

| Table             | Purpose                                                       |
| ----------------- | ------------------------------------------------------------- |
| **Users**         | Email, OAuth IDs, tier (FREE/PRO/PREMIUM), Stripe customer ID |
| **Devices**       | Device fingerprint, last seen, browser tracking               |
| **RefreshTokens** | JWT refresh tokens with expiry                                |
| **SyncState**     | Per-user, per-datatype encrypted storage blobs                |
| **BillingEvents** | Stripe event log                                              |
| **UsageRecords**  | Feature usage metering per user per period                    |

### E2E Encryption for Sync

**Privacy-first principle**: All intelligence runs **locally**. The cloud is optional and only used for sync across devices.

1. Client generates encryption key (AES-256-GCM)
2. Memory/graph/preferences are encrypted **client-side** before leaving the browser
3. Server stores opaque encrypted blobs — it **cannot read user data**
4. Conflict resolution: version numbers + checksums. Server detects conflicts and returns the server version for client-side merge

### Tier-Based Sync

| Tier    | What Syncs                                |
| ------- | ----------------------------------------- |
| FREE    | Preferences only                          |
| PRO     | Preferences + Memory                      |
| PREMIUM | Everything (Preferences + Memory + Graph) |

---

## 9. Data Import Pipeline

### Purpose

Bootstrap the recommendation system with existing user data so users do not start from zero.

### Supported Platforms

| Platform      | Data Imported                              |
| ------------- | ------------------------------------------ |
| **Spotify**   | Listening history, saved tracks, playlists |
| **Netflix**   | Watch history, ratings                     |
| **YouTube**   | Watch history (via Google Takeout)         |
| **Instagram** | Liked posts, saved content                 |
| **Reddit**    | Saved posts, upvoted content               |
| **Amazon**    | Purchase history, wishlists                |
| **Twitter**   | Likes, bookmarks                           |

### Two Import Modes

1. **Data Takeout parsing** — user uploads their Google/Spotify/Netflix data export file. `DataTakeoutParser` handles the format.
2. **Live scraping** — `LiveScrapeParser` extracts data from currently loaded pages in real-time.

### How Imported Data Flows

Imported data flows into the knowledge graph as entities and relations, bootstrapping the preference model immediately. The `ImportManager` orchestrates the process, and `ImportScheduler` can run periodic re-imports.

---

## 10. Message System & Communication

### Architecture

All communication happens via Chrome's `chrome.runtime.sendMessage` API:

```
Content Scripts  ──(messages)──>  Background Service Worker
Popup UI         ──(messages)──>  Background Service Worker
Background       ──(HTTP REST)──> Cloud Backend
```

### 100+ Message Types

Organized by domain:

| Domain         | Key Messages                                                                    |
| -------------- | ------------------------------------------------------------------------------- |
| **Content**    | `PROCESS_CONTENT`, `LEARN_FEEDBACK`, `IMPLICIT_SIGNAL`, `ENRICH_PAGE_SIGNAL`    |
| **Scoring**    | `SCORE_CANDIDATES`, `RECORD_INTENT`, `REVOKE_INTENT`                            |
| **Agent**      | `AGENT_CHAT`, `AGENT_COMPARE`, `AGENT_WATCHLIST_*`                              |
| **Memory**     | `GET_STATS`, `GET_MEMORY_PACK`, `GET_GRAPH_DATA`, `BLOCK_TOPIC`, `LIKE_TOPIC`   |
| **Settings**   | `GET_SETTINGS`, `SAVE_SETTINGS`, `CLEAR_ALL_DATA`, `EXPORT_DATA`, `IMPORT_DATA` |
| **Cloud**      | `CLOUD_REGISTER`, `CLOUD_LOGIN`, `CLOUD_LOGOUT`, `CLOUD_SYNC_NOW`               |
| **Taste Twin** | `TWIN_GET_STATUS`, `TWIN_OPT_IN`, `TWIN_COMPUTE_MATCHES`                        |
| **Price**      | `PRICE_TRACK`, `PRICE_GET_HISTORY`, `PRICE_ADD_RULE`, `PRICE_DISMISS_ALERT`     |
| **Brain**      | `BRAIN_PROCESS`, `BRAIN_STATUS`, `BRAIN_FEEDBACK`                               |
| **Monitoring** | `GET_MONITOR_*`, `RUN_VALIDATORS`, `SIMULATE_*`                                 |

All messages are **typed with TypeScript contracts** defined in `packages/schema` and `extension/src/shared/messages.ts`, ensuring compile-time safety across module boundaries.

---

## 11. Shared Type System

The `packages/schema` module defines all cross-module TypeScript contracts:

| File           | What It Defines                                                                 |
| -------------- | ------------------------------------------------------------------------------- |
| `api.ts`       | Request/response shapes for all API endpoints                                   |
| `entities.ts`  | Commerce entities (Product, Brand, Seller, Offer)                               |
| `intent.ts`    | User intent types (interested, not_interested, researching, prefer_brand, etc.) |
| `decisions.ts` | Recommendation decisions (boost, neutral, caution, suppress)                    |
| `context.ts`   | Browsing contexts and 15+ platform definitions                                  |
| `graph.ts`     | Knowledge graph entity types, relation types, affinity results                  |
| `memory.ts`    | Memory tiers, statuses, feedback types, memory entries                          |
| `content.ts`   | Content metadata, content actions, recommendation results                       |
| `watchlist.ts` | Product watchlist items                                                         |
| `stats.ts`     | Statistics and per-platform breakdowns                                          |

---

## 12. Commerce & Price Tracking

### Commerce Scoring

`CommerceScorer` evaluates products and offers using multiple factors:

- Price competitiveness
- Brand affinity (from knowledge graph)
- Seller reputation
- Deal quality evaluation

`CommerceExplainer` generates human-readable explanations for commerce decisions.

### Price Tracking

- `PriceTracker` records price history for tracked products
- `PriceAlertEngine` manages alert rules (e.g., "notify me if this drops below $50")
- Price data stored in IndexedDB with full history
- Messages: `PRICE_TRACK`, `PRICE_GET_HISTORY`, `PRICE_ADD_RULE`, `PRICE_DISMISS_ALERT`

---

## 13. Taste Twin Network (Social Feature)

### Concept

Taste Twins are users with similar preference profiles. The system matches users based on their knowledge graph similarity and provides anonymous social recommendations.

### Flow

1. User opts in via `TWIN_OPT_IN`
2. `TasteTwinService` on the cloud computes similarity scores between opted-in users
3. Matching users become "Taste Twins"
4. Twins can share encrypted recommendation packs via `PackService`
5. All sharing is **anonymous and encrypted** — users never see each other's identities

---

## 14. Achievement & Gamification System

13 unlockable badges tracked by `achievements.ts`:

Incentivizes engagement with the system — blocking first content, training preferences, importing data, etc.

---

## 15. Tech Stack Summary

| Layer         | Technology                                                                  |
| ------------- | --------------------------------------------------------------------------- |
| Extension     | Chrome Manifest V3, TypeScript, React (popup/overlay), Webpack              |
| Brain         | TypeScript, IndexedDB (via `idb`), LRU Cache                                |
| Web Dashboard | Next.js 16, React 19, Tailwind CSS                                          |
| Cloud Backend | Hono, Prisma, PostgreSQL, Stripe                                            |
| AI/LLM        | Claude (Anthropic), GPT (OpenAI), Gemini (Google) — multi-provider fallback |
| Deployment    | Fly.io (cloud), Chrome Web Store (extension)                                |
| Monorepo      | Shared `packages/schema` for types, path aliases via `tsconfig`             |
| Testing       | Jest, integration tests, monitoring collector, decision log                 |

---

## 16. Key Design Patterns

| Pattern                      | Where Used                                     | Why                                                       |
| ---------------------------- | ---------------------------------------------- | --------------------------------------------------------- |
| **Adapter**                  | Platform content scripts                       | Isolates platform-specific DOM logic from core engine     |
| **Singleton**                | IntelligenceService, Brain, BrainFacade        | Single instance manages lifecycle of all services         |
| **Message-Driven**           | Content scripts <-> background worker          | Chrome extension architecture requirement                 |
| **LRU Cache**                | Knowledge graph entity/relation lookups        | Fast reads without repeated IndexedDB access              |
| **Event Bus**                | Domain events (CONTENT_HIDDEN, MEMORY_WRITTEN) | Loose coupling between modules                            |
| **Multi-Agent**              | Brain orchestrator with 6 specialized agents   | Specialization, parallel execution, focused prompts       |
| **Factory**                  | Service initialization                         | Lazy instantiation of heavyweight services                |
| **Eventual Consistency**     | Cloud sync with conflict resolution            | Handles offline-first with periodic sync                  |
| **Graceful Degradation**     | LLM fallback, selector health tracking         | System works without LLM; adapts to DOM changes           |
| **Short-Circuit Evaluation** | Direct block check in recommendation pipeline  | Performance: skip expensive computation for obvious cases |

---

## 17. System Design Questions & Answers

### Q: How do you handle cold start?

Three strategies:

1. **Seed the knowledge graph** with common entities on first install
2. **Data import** from 7 existing platforms (Spotify, Netflix, YouTube, etc.)
3. **Onboarding flow** that asks about interests

The aggressiveness slider starts low so the system observes before acting aggressively.

### Q: How do you handle scale — what if the graph gets huge?

- LRU cache (500 items, 5-min TTL) keeps hot entities in memory
- IndexedDB handles persistence
- `DecayManager` prunes stale memories
- Since it is per-user and client-side, each instance only handles one user's data — no distributed scaling needed

### Q: Why client-side instead of server-side?

**Privacy.** Browsing history and preferences are extremely sensitive data. By keeping everything in the browser:

- No liability of storing user behavior data on a server
- No trust issues
- Zero server cost for the intelligence layer
- GDPR/CCPA compliance is simpler — user owns their data

### Q: How do you handle extension performance?

1. Direct blocks short-circuit the pipeline (no wasted computation)
2. Graph and pattern factors compute in parallel via `Promise.all()`
3. LRU caching avoids repeated IndexedDB reads
4. Content scripts use `document_idle` injection to avoid blocking page load
5. `PerfMonitor` tracks latency to catch regressions

### Q: What happens if the LLM API is down?

**Graceful degradation.** The `RuleBasedExtractor` handles entity extraction without LLM. Recommendations still work using the knowledge graph and memory system. The LLM is only needed for enrichment and chat features — **core feed control works without it**.

### Q: How do you ensure data consistency with IndexedDB?

- Transactions for multi-entity writes (e.g., seeding uses a single transaction for entities + relations)
- Version numbers and checksums for cloud sync conflict detection
- Cache invalidation on writes (LRU cache is write-through)

### Q: How do you test this?

- Jest test suite with unit tests for each module
- Integration tests for the full pipeline
- `MonitoringCollector` for QA telemetry (non-production)
- `DecisionLog` for devtools inspection of recommendation decisions
- `RUN_VALIDATORS` message to run validation checks at runtime

---

## 18. Key Talking Points to Impress

1. **"I built a personal knowledge graph that runs entirely in the browser"** — shows understanding of graph data structures, caching, and browser storage constraints.

2. **"The recommendation engine uses 5 weighted factors with short-circuit evaluation"** — shows algorithmic thinking and performance awareness.

3. **"Three-tier memory with decay is inspired by cognitive science"** — shows thinking beyond basic CRUD.

4. **"Multi-agent orchestration with parallel execution and feedback loops"** — shows understanding of modern AI architecture patterns.

5. **"Cross-platform entity linking bridges YouTube research to Amazon purchases"** — shows ability to build genuinely useful, non-trivial features.

6. **"E2E encryption means even I cannot read user data on my own server"** — shows security-first thinking.

7. **"The adapter pattern isolates platform-specific DOM logic so the core engine is never affected by UI changes"** — shows clean architecture and maintainability thinking.

8. **"100+ typed message contracts between content scripts, background worker, and cloud"** — shows ability to design inter-process communication in constrained environments.

---

## 19. Project Roadmap

| Phase        | Status   | What Was Built                                                               |
| ------------ | -------- | ---------------------------------------------------------------------------- |
| **Phase 1**  | Complete | YouTube + Amazon + 8 platforms, feed control, memory system                  |
| **Phase 2**  | Complete | Dashboard UI, action history, graph visualization                            |
| **Phase 3A** | Complete | Data imports (Spotify, Netflix, YouTube, Instagram, Reddit, Amazon, Twitter) |
| **Phase 3B** | Complete | Price tracking with alerts                                                   |
| **Phase 4**  | Complete | Multi-agent brain, productization                                            |
| **Phase 5**  | Complete | Cloud sync, auth, billing, Taste Twin network                                |
| **Future**   | Planned  | Mobile app, API for third parties, advanced analytics                        |
