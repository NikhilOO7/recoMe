# RecoMe V3 — Product Evolution Plan

## Vision

Transform RecoMe from a browser extension into a standalone product — a personal AI that understands your taste across the internet and becomes the place you go to discover, decide, and act on what matters to you.

---

## Agent Architecture Evolution (V2 → V3)

V2 established a powerful multi-agent system running entirely inside the browser extension: a central Brain orchestrating six specialized agents (FilterAgent, ScoutAgent, AdvisorAgent, ShopperAgent, SocialAgent, GuardianAgent) via a ToolExecutor framework. V3 fundamentally evolves this architecture for a cloud-first, multi-surface world.

### Cloud-Hosted Brain

The Brain now runs server-side as a persistent service, enabling richer orchestration, longer context, and cross-device continuity. A lightweight client-side Brain in the extension handles latency-sensitive operations (content filtering, dwell-based signals) and syncs state with the cloud Brain.

```
Extension (Client Brain)                    Cloud (Primary Brain)
┌──────────────────────┐              ┌──────────────────────────────┐
│ FilterAgent (local)  │              │ Brain Orchestrator           │
│ GuardianAgent (local)│──sync/RPC──▶ │   ├── TaskRouter             │
│ Lightweight context  │              │   ├── ContextAssembler       │
│ On-device taste model│◀──sync────── │   ├── ResponseMerger         │
│                      │              │   └── AgentMemory (shared)   │
└──────────────────────┘              │                              │
                                      │ All 9 Agents available       │
Web App                               │ Full knowledge graph access  │
┌──────────────────────┐              │ Persistent conversation      │
│ Agent Chat UI        │──WebSocket──▶│ Event Bus for agent mesh     │
│ Feed UI              │              │                              │
│ Dashboard            │◀──SSE─────── │                              │
└──────────────────────┘              └──────────────────────────────┘
```

**Dual-brain sync protocol:**

- Extension Brain handles: real-time content scoring, DOM-based filtering, dwell signal processing, privacy-sensitive operations that should never leave the device
- Cloud Brain handles: feed curation, cross-platform reasoning, conversational AI, predictive recommendations, multi-agent collaboration
- Sync: Agent state, user context, and tool results synchronize via the existing WebSocket sync hub (Phase 1B)
- Fallback: Extension Brain can operate fully offline using cached context and the on-device taste model

### New Agents for V3

V2's six agents (FilterAgent, ScoutAgent, AdvisorAgent, ShopperAgent, SocialAgent, GuardianAgent) are retained and enhanced. V3 adds three new agents:

#### Feed Curator Agent

**New file (cloud):** `cloud/src/brain/agents/FeedCuratorAgent.ts`

**Role:** Dedicated agent for the personalized discovery feed (Phase 2). Combines signals from all other agents to rank and diversify content. The Feed Curator is the primary consumer of other agents' outputs — it subscribes to FilterAgent scores, ScoutAgent discoveries, SocialAgent trends, and ShopperAgent deals to compose the final feed.

**Tools:**

| Tool                 | What it does                                                       | Example use                                                    |
| -------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------- |
| `aggregate_sources`  | Pull and normalize content from all connected feed sources         | Combine YouTube, Reddit, RSS, Product Hunt into unified stream |
| `rank_content`       | Score feed items using the 5-factor model + agent signals          | Rank 500 candidate items down to top 50                        |
| `diversify_feed`     | Apply anti-filter-bubble rules (category caps, diversity slots)    | Ensure no category exceeds 40% of feed                         |
| `inject_serendipity` | Insert unexpected-but-relevant items at graph distance 2-3         | "You like espresso — here's an article on tea ceremonies"      |
| `explain_ranking`    | Generate human-readable explanation for why an item is in the feed | Powers the "Why this?" button on feed cards                    |

#### Ingest Agent

**New file (cloud):** `cloud/src/brain/agents/IngestAgent.ts`

**Role:** Handles data ingestion from any source (Phase 3) — OAuth platform imports, email newsletters, file uploads, bookmarklets. The Ingest Agent is the gateway through which all external data enters the RecoMe system.

**Tools:**

| Tool                | What it does                                                               | Example use                                            |
| ------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------ |
| `parse_oauth_data`  | Process data from OAuth-connected platforms into unified schema            | Import 6 months of YouTube watch history               |
| `scrape_dom`        | Extract structured data from a web page via bookmarklet/clipper            | User saves a page from Safari via bookmarklet          |
| `parse_export_file` | Parse uploaded files (CSV bookmarks, Goodreads exports, Spotify playlists) | "Upload your Letterboxd ratings"                       |
| `parse_email`       | Extract content, links, products from forwarded newsletters                | Newsletter forwarded to `user@inbox.recome.ai`         |
| `extract_entities`  | Identify products, topics, people, brands from raw ingested data           | "This YouTube history mentions Sony, Bose, Sennheiser" |
| `deduplicate`       | Cross-source deduplication of entities and content                         | Same product found on Amazon and eBay → single entity  |

**Ingest flow:**

```
Data Source (any) → IngestAgent
  → parse_* tool (source-specific)
  → extract_entities
  → deduplicate
  → Update knowledge graph
  → Emit events: ENTITIES_IMPORTED, PREFERENCES_UPDATED
  → FeedCuratorAgent, ScoutAgent, FilterAgent react to events
```

#### Creator Agent

**New file (cloud):** `cloud/src/brain/agents/CreatorAgent.ts`

**Role:** Powers creator and publisher tools (Phase 6). Provides anonymized, aggregated audience insights and content suggestions for creators who opt into the RecoMe for Creators program.

**Tools:**

| Tool                | What it does                                                 | Example use                                                            |
| ------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `analyze_audience`  | Generate anonymized audience interest breakdown              | "62% of your followers are into audio gear, 34% into photography"      |
| `suggest_content`   | Recommend content topics based on audience interest gaps     | "Your audience would engage with content about lens adapters"          |
| `track_performance` | Track how creator's content performs within RecoMe ecosystem | "Your last video was saved by 847 users"                               |
| `identify_trends`   | Spot emerging trends within the creator's audience segment   | "Interest in mirrorless cameras is up 40% in your audience this month" |

### Agent Mesh — Event-Driven Collaboration

V2 agents communicated only through the Brain (hub-and-spoke). V3 introduces an Agent Mesh where agents communicate via an event bus, enabling reactive, decoupled collaboration.

```
┌────────────────────────────────────────────────────────────┐
│                       Event Bus                             │
│                                                             │
│  ENTITIES_IMPORTED ──▶ FeedCuratorAgent, ScoutAgent         │
│  PRICE_DROP ──────────▶ ShopperAgent, FeedCuratorAgent      │
│  NEW_TREND ───────────▶ SocialAgent, FeedCuratorAgent       │
│  PREFERENCE_CHANGED ──▶ FilterAgent, FeedCuratorAgent,      │
│                         ScoutAgent                          │
│  PRIVACY_VIOLATION ───▶ GuardianAgent (blocks + alerts)     │
│  FEED_GENERATED ──────▶ GuardianAgent (audit)               │
└────────────────────────────────────────────────────────────┘
```

**Examples:**

- When IngestAgent imports YouTube history, it emits `ENTITIES_IMPORTED` — FeedCuratorAgent re-ranks the feed with new signals, ScoutAgent scans for opportunities related to new interests
- When ShopperAgent detects a price drop, it emits `PRICE_DROP` — FeedCuratorAgent boosts the item in the feed, the notification system alerts the user
- The Brain still orchestrates complex multi-agent tasks (like answering a chat question), but routine inter-agent communication happens via events without Brain involvement

### Agent Context Protocol (ACP)

Standardized context format so agents work identically whether running in the extension (local) or cloud (remote). This is critical for the dual-brain architecture.

```typescript
interface AgentContext {
  // Identity — same regardless of runtime
  user_id: string;
  session_id: string;

  // Environment — differs between local and cloud
  runtime: 'extension' | 'cloud' | 'web-app';
  capabilities: RuntimeCapabilities; // What tools/data are available

  // User state — synced across runtimes
  profile: UserProfile;
  interest_graph: GraphSnapshot;
  active_goals: UserGoal[];
  recent_actions: UserAction[];

  // Task-specific — provided by Brain or event
  task: BrainTask;
  event?: AgentEvent;

  // Model — reference to taste model endpoint
  taste_model: TasteModelEndpoint; // Local ONNX or cloud inference
}

interface RuntimeCapabilities {
  has_dom_access: boolean; // true in extension, false in cloud
  has_full_graph: boolean; // true in cloud, partial in extension
  has_taste_model: boolean; // true if on-device model is loaded
  has_realtime_sync: boolean; // true if WebSocket connected
  max_llm_context_tokens: number; // Higher in cloud
}
```

Agents check `context.runtime` and `context.capabilities` to adapt behavior — e.g., FilterAgent uses `scrape_dom` locally but `query_cached_content` in cloud. The ACP ensures agent logic is write-once, run-anywhere.

### Personal Taste Model Integration

Each agent gets access to a local inference endpoint from the fine-tuned personal taste model (Phase 5A). This replaces many LLM API calls with instant on-device inference.

**Before (V2):** Agent calls LLM API for "Would user like this?" → 500ms+ latency, $0.001/call
**After (V3):** Agent calls taste model → 5ms latency, $0 cost

**Agent-specific taste model use:**

| Agent            | LLM call replaced                         | Taste model alternative                  |
| ---------------- | ----------------------------------------- | ---------------------------------------- |
| FilterAgent      | `score_content` sent to LLM for relevance | Taste model instant classification       |
| FeedCuratorAgent | `rank_content` batch scoring via LLM      | Taste model batch inference in <50ms     |
| ScoutAgent       | `cross_reference` opportunity matching    | Taste model embedding similarity         |
| ShopperAgent     | `find_alternatives` product matching      | Taste model preference vector comparison |
| AdvisorAgent     | Simple preference lookups                 | Taste model direct query                 |

LLM calls are reserved for complex reasoning, natural language generation, and multi-step analysis where the taste model alone is insufficient.

---

## Phase 1: Web App — RecoMe Dashboard

**Goal:** RecoMe works without the extension installed. Any browser, any device, always accessible.

### 1A. Web Application Architecture

**New repository:** `recome-web/`

```
recome-web/
├── src/
│   ├── app/
│   │   ├── layout.tsx                 # Root layout with nav, auth
│   │   ├── page.tsx                   # Landing / feed
│   │   ├── dashboard/
│   │   │   ├── page.tsx               # Stats, activity, overview
│   │   │   ├── preferences/
│   │   │   │   └── page.tsx           # View/edit all preferences
│   │   │   ├── insights/
│   │   │   │   └── page.tsx           # AI insights feed
│   │   │   ├── watchlist/
│   │   │   │   └── page.tsx           # Price tracking, saved items
│   │   │   ├── history/
│   │   │   │   └── page.tsx           # Browsing & decision history
│   │   │   └── graph/
│   │   │       └── page.tsx           # Interactive knowledge graph
│   │   ├── feed/
│   │   │   └── page.tsx               # RecoMe personalized feed
│   │   ├── agent/
│   │   │   └── page.tsx               # Full-screen agent chat
│   │   ├── settings/
│   │   │   ├── page.tsx
│   │   │   ├── connections/page.tsx   # Connected platforms
│   │   │   ├── sync/page.tsx          # Device sync management
│   │   │   └── billing/page.tsx       # Subscription management
│   │   └── auth/
│   │       ├── login/page.tsx
│   │       └── signup/page.tsx
│   ├── components/
│   │   ├── feed/
│   │   │   ├── FeedCard.tsx           # Unified content/product card
│   │   │   ├── FeedFilter.tsx         # Category, platform, type filters
│   │   │   └── FeedLayout.tsx         # Grid/list/compact views
│   │   ├── agent/
│   │   │   ├── WebAgentChat.tsx       # Full-featured agent UI
│   │   │   ├── AgentSidebar.tsx       # Context panel alongside chat
│   │   │   └── AgentActions.tsx       # Rich action cards
│   │   ├── graph/
│   │   │   ├── InteractiveGraph.tsx   # D3/Three.js knowledge graph
│   │   │   └── GraphControls.tsx      # Zoom, filter, highlight
│   │   ├── insights/
│   │   │   ├── InsightCard.tsx
│   │   │   └── InsightTimeline.tsx
│   │   └── shared/
│   │       ├── Navigation.tsx
│   │       ├── CommandPalette.tsx      # Cmd+K universal search
│   │       └── NotificationCenter.tsx
│   ├── lib/
│   │   ├── api.ts                     # Cloud API client
│   │   ├── realtime.ts                # WebSocket for live updates
│   │   ├── auth.ts                    # Auth state management
│   │   └── sync.ts                    # Real-time sync with extension
│   └── stores/
│       ├── preferences.ts             # Zustand preference store
│       ├── feed.ts                    # Feed state & pagination
│       └── agent.ts                   # Agent conversation state
├── package.json
└── next.config.ts
```

**Technology stack:**

- **Framework:** Next.js 15 (App Router, RSC for feed pages)
- **State:** Zustand (same patterns as extension popup)
- **Styling:** Tailwind CSS + shadcn/ui components
- **Real-time:** WebSocket via cloud server for live sync
- **Graphs:** D3.js for knowledge graph visualization
- **Hosting:** Vercel (auto-scaling, edge functions)
- **Auth:** Shared with V2 cloud auth (JWT, OAuth)

### 1B. Extension ↔ Web App Sync

The web app and extension share the same cloud backend. Real-time sync keeps them in lockstep.

**Sync architecture:**

```
Extension (browser)              Cloud                    Web App
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│ User blocks  │──push──▶ │  Sync Hub    │──push──▶ │ Dashboard    │
│ a topic      │          │  (WebSocket) │          │ updates live │
│              │◀──pull── │              │◀──pull── │ User edits   │
│ Extension    │          │              │          │ preference   │
│ updates      │          │              │          │              │
└──────────────┘          └──────────────┘          └──────────────┘
```

- WebSocket connection from both extension and web app to cloud sync hub
- Changes propagate in <500ms between devices
- Conflict resolution: same CRDT strategy from V2
- Offline web app: Service Worker + local cache, syncs on reconnection

### 1C. Web-Based Agent Chat

Full-screen agent experience with capabilities beyond the extension popup.

**Features beyond extension chat:**

- **Multi-turn context panel** — sidebar shows relevant preferences, recent activity, knowledge graph nodes related to the conversation
- **Rich responses** — embedded product cards, price charts, comparison tables, knowledge graph snippets
- **Agent memory** — conversation history persisted in cloud (not just 10 turns)
- **File/image input** — "Here's a screenshot of a product I liked" → agent extracts preferences
- **Voice input** — Web Speech API for hands-free interaction
- **Shareable conversations** — generate a link to share an agent conversation (e.g., a comparison the agent did for you)

**Modify (cloud):** `cloud/src/agent/`

```
agent/
├── WebAgentEngine.ts        # Extended chat engine for web (longer context, richer responses)
├── AgentMemory.ts           # Persistent conversation storage
├── AgentTools.ts            # Tools the agent can call (search, compare, track, graph query)
└── AgentStreaming.ts        # Server-Sent Events for streaming responses
```

The agent becomes a proper tool-using AI:

| Tool                | What it does                         | Example                                      |
| ------------------- | ------------------------------------ | -------------------------------------------- |
| `search_products`   | Query across connected platforms     | "Find me wireless earbuds under $100"        |
| `compare`           | Side-by-side comparison with scoring | "Compare AirPods Pro vs Galaxy Buds"         |
| `track_price`       | Add item to price tracker            | "Track this and alert me if it drops"        |
| `query_graph`       | Search the knowledge graph           | "What brands do I prefer for audio?"         |
| `get_insights`      | Fetch pending insights               | "What patterns have you noticed?"            |
| `update_preference` | Modify a preference                  | "I'm done with Sony, remove that preference" |
| `search_web`        | Web search for reviews/info          | "Find reviews for this laptop"               |

### 1D. Cloud Brain Hosting & Multi-Agent Chat

The web app is where the cloud Brain lives. The agent chat (1C) is not a single chatbot — it is the Brain orchestrating multiple specialized agents with full tool visibility in the UI.

**Multi-agent chat experience:**

- When the user asks a question, the UI shows which agents are active: "ShopperAgent is comparing prices... AdvisorAgent is checking your preferences..."
- Tool calls are visible in a collapsible panel: users can see `compare_prices` running, `query_knowledge_graph` returning results
- Agent attribution: each part of a response is tagged with the agent that produced it (e.g., price analysis from ShopperAgent, personal fit from AdvisorAgent)
- GuardianAgent runs silently alongside every conversation, auditing data access and redacting PII

**Cloud Brain deployment:**

```
cloud/src/brain/
├── Brain.ts                    # Cloud Brain orchestrator (evolved from V2)
├── AgentRegistry.ts            # All 9 agents registered and available
├── TaskRouter.ts               # Routes chat messages to agent(s)
├── ContextAssembler.ts         # Full context: graph, memory, connections
├── ResponseMerger.ts           # Merges multi-agent outputs for chat
├── EventBus.ts                 # Agent mesh event system
├── agents/
│   ├── FilterAgent.ts          # V2 agent, cloud-enhanced
│   ├── ScoutAgent.ts           # V2 agent, cloud-enhanced
│   ├── AdvisorAgent.ts         # V2 agent, cloud-enhanced
│   ├── ShopperAgent.ts         # V2 agent, cloud-enhanced
│   ├── SocialAgent.ts          # V2 agent, cloud-enhanced
│   ├── GuardianAgent.ts        # V2 agent, cloud-enhanced
│   ├── FeedCuratorAgent.ts     # NEW: V3 feed agent
│   ├── IngestAgent.ts          # NEW: V3 ingestion agent
│   └── CreatorAgent.ts         # NEW: V3 creator tools agent
└── tools/
    ├── ToolExecutor.ts         # Unified tool execution (evolved from V2)
    └── ToolRegistry.ts         # All agent tools registered here
```

---

## Phase 2: RecoMe Feed — The Personalized Discovery Engine

**Goal:** RecoMe becomes a destination, not just a filter. Users open RecoMe to discover things they didn't know they wanted.

### 2A. Content Aggregation Pipeline

**New directory (cloud):** `cloud/src/feed/`

```
feed/
├── FeedAggregator.ts        # Pulls content from all sources
├── FeedRanker.ts            # Scores and ranks feed items
├── FeedDiversifier.ts       # Prevents filter bubbles
├── sources/
│   ├── RSSSource.ts         # RSS/Atom feed ingestion
│   ├── APISource.ts         # Platform APIs (YouTube, Reddit, etc.)
│   ├── NewsSource.ts        # News aggregation
│   ├── ProductSource.ts     # Product feeds (affiliate networks)
│   └── CommunitySource.ts   # From collaborative filtering signals
├── dedup/
│   └── ContentDedup.ts      # Cross-source deduplication
└── cache/
    └── FeedCache.ts         # Pre-computed personalized feeds
```

**Feed sources:**

| Source       | Method                       | Content Type                             |
| ------------ | ---------------------------- | ---------------------------------------- |
| YouTube      | Data API                     | Videos matching interests                |
| Reddit       | API                          | Posts from relevant subreddits           |
| Hacker News  | API                          | Tech content                             |
| Product Hunt | API                          | New products                             |
| Amazon/eBay  | Product Advertising API      | Products matching interests              |
| RSS feeds    | User-added + auto-discovered | Articles, blogs                          |
| News APIs    | NewsAPI, Google News         | Current events in interest areas         |
| Community    | Collaborative filtering      | "People like you found this interesting" |

### 2B. Feed Ranking Algorithm

The feed uses the same 5-factor scoring philosophy from the extension, extended for aggregated content:

```
Feed Score = weighted sum of:
  ├── Preference Match (0.30)    — How well does this match stated/learned preferences?
  ├── Graph Affinity (0.20)      — How connected is this to the user's knowledge graph?
  ├── Freshness (0.15)           — How recent? Decays over time
  ├── Source Trust (0.15)        — User's history with this source/platform
  ├── Diversity Bonus (0.10)     — Boost for underrepresented categories (anti-bubble)
  └── Social Signal (0.10)       — Collaborative filtering strength
```

**Agent-powered ranking:** The entire feed ranking pipeline is orchestrated by the **FeedCuratorAgent**. Rather than a standalone `FeedRanker.ts` service, the agent calls its tools in sequence: `aggregate_sources` → `rank_content` → `diversify_feed` → `inject_serendipity`. This means the ranking is contextual and adaptive — the FeedCuratorAgent can adjust weights based on time of day, user mood signals, or recent agent conversations (e.g., if the user just asked AdvisorAgent about cameras, camera content gets a temporary boost).

**Anti-filter-bubble mechanisms (FeedCuratorAgent tools):**

- **Diversity slots** (`diversify_feed` tool) — Every 10th item is deliberately outside the user's usual interests but adjacent (graph distance = 2-3)
- **Serendipity score** (`inject_serendipity` tool) — Items get a bonus for being unexpected but potentially relevant
- **Category caps** (`diversify_feed` tool) — No single category can dominate >40% of the feed
- **Exploration mode** — User can toggle "Surprise me" which tells FeedCuratorAgent to maximize the `inject_serendipity` weight

### 2C. Feed UI

**Feed card types:**

| Type       | Visual                                         | Content                            |
| ---------- | ---------------------------------------------- | ---------------------------------- |
| Article    | Thumbnail + title + source + snippet           | Blog posts, news                   |
| Product    | Image + price + rating + price trend sparkline | Shopping items                     |
| Video      | Thumbnail + duration + channel                 | YouTube, tutorials                 |
| Discussion | Title + community + engagement count           | Reddit, HN                         |
| Insight    | Agent avatar + insight text + action button    | Proactive insights mixed into feed |
| Discovery  | "New interest?" badge + explanation            | Serendipity items                  |

**Feed interactions:**

- **Save** — adds to watchlist/reading list
- **Block** — "Don't show me this" (feeds back to preferences)
- **More like this** — boosts similar content
- **Why this?** — triggers FeedCuratorAgent's `explain_ranking` tool, showing which agents contributed signals and why
- **Share** — share with note, or save to preference pack

---

## Phase 3: Browser-Agnostic Ingestion

**Goal:** RecoMe learns about you even without the extension, from any source.

### 3A. Platform Connections (OAuth)

Replace DOM scraping with proper API integrations where available.

**New directory (cloud):** `cloud/src/connections/`

```
connections/
├── ConnectionManager.ts       # OAuth flow management
├── platforms/
│   ├── YouTubeConnection.ts   # YouTube Data API v3
│   ├── SpotifyConnection.ts   # Spotify Web API
│   ├── RedditConnection.ts    # Reddit API (OAuth2)
│   ├── TwitterConnection.ts   # Twitter API v2
│   ├── GoodreadsConnection.ts # Goodreads API
│   ├── LetterboxdConnection.ts # Letterboxd (RSS export)
│   ├── SteamConnection.ts     # Steam Web API
│   ├── GithubConnection.ts    # GitHub API (starred repos, interests)
│   └── PocketConnection.ts    # Pocket API (saved articles)
├── sync/
│   ├── ConnectionSync.ts      # Periodic pull from connected platforms
│   └── WebhookReceiver.ts     # Real-time updates where supported
└── transforms/
    └── UnifiedContent.ts      # Normalize platform data to common schema
```

**Connected platform experience (IngestAgent-orchestrated):**

1. User clicks "Connect YouTube" in web app settings
2. OAuth flow → user grants read access to watch history, likes, subscriptions
3. IngestAgent receives `CONNECTION_ESTABLISHED` event and begins import:
   - `parse_oauth_data` — pulls last 6 months of activity into unified schema
   - `extract_entities` — identifies products, topics, creators, brands from watch history
   - `deduplicate` — merges with existing knowledge graph entities
4. IngestAgent emits `ENTITIES_IMPORTED` event → triggers downstream agents:
   - FeedCuratorAgent re-ranks feed with new interest signals
   - ScoutAgent scans for opportunities matching newly discovered interests
   - FilterAgent updates content scoring weights
5. Ongoing sync: every 6 hours IngestAgent re-runs `parse_oauth_data` for incremental updates (or via webhooks where available)

### 3B. Email Newsletter Parsing

**New service (cloud):** `cloud/src/ingestion/email/`

```
email/
├── EmailIngester.ts          # Receive forwarded newsletters
├── NewsletterParser.ts       # Extract content from HTML emails
├── ContentExtractor.ts       # Pull articles, products, links
└── SubjectClassifier.ts      # Categorize newsletter content
```

**How it works (IngestAgent pipeline):**

- User gets a unique RecoMe email: `username@inbox.recome.ai`
- Forward newsletters to this address, or set up auto-forward rules
- IngestAgent's `parse_email` tool extracts: links, products mentioned, topics discussed
- IngestAgent's `extract_entities` tool identifies entities → `deduplicate` merges with knowledge graph
- Emits `ENTITIES_IMPORTED` event → FeedCuratorAgent incorporates newsletter content into feed

### 3C. Manual Curation & Bookmarklet

For platforms without APIs or extension support:

**Bookmarklet:** A lightweight JavaScript snippet users can add to any browser's bookmarks bar

```javascript
// "Save to RecoMe" bookmarklet
// Extracts page title, URL, meta description, OG tags
// Sends to cloud API with user's auth token
```

**Web clipper:** Browser-agnostic alternative to the extension

- Minimal permissions — just sends the current page's metadata to RecoMe
- Available for Safari, Firefox, Arc, Brave, Opera
- No content filtering (that's extension-only), just ingestion

**Manual add:** In the web app, users can:

- Paste a URL → RecoMe fetches and categorizes it
- Type a preference directly: "I love mechanical keyboards"
- Upload a file: CSV of bookmarks, Goodreads export, Spotify playlist

---

## Phase 4: Multi-Browser Extension Support

**Goal:** Bring the full RecoMe extension experience to every major browser.

### 4A. Firefox Extension

**Porting approach:**

- Chrome extension uses Manifest V3 — Firefox supports MV3 with minor differences
- Replace `chrome.*` APIs with `browser.*` (WebExtension polyfill already handles most)
- Service worker → Firefox uses background scripts (event pages) — may need `webextension-polyfill`

**Key differences to handle:**

| Feature        | Chrome (current)   | Firefox                  | Solution                        |
| -------------- | ------------------ | ------------------------ | ------------------------------- |
| Service Worker | `chrome.runtime`   | Background script        | `webextension-polyfill`         |
| Storage        | `chrome.storage`   | `browser.storage`        | Polyfill                        |
| IndexedDB      | Works in SW        | Works in background      | Same API                        |
| Side panel     | `chrome.sidePanel` | Not supported            | Use sidebar API or overlay only |
| Manifest       | MV3                | MV3 (slight differences) | Conditional manifest fields     |

**Build pipeline:**

```
webpack.config.js
├── target: 'chrome'     → dist/chrome/
├── target: 'firefox'    → dist/firefox/   (different manifest, polyfill included)
├── target: 'edge'       → dist/edge/      (same as chrome, different store metadata)
└── target: 'safari'     → dist/safari/    (Xcode conversion via safari-web-extension-converter)
```

### 4A-1. Agent System: Browser-Agnostic by Design

The agent architecture is inherently browser-agnostic thanks to the Agent Context Protocol (ACP). The same Brain logic, same agents, same tools — only the content script adapters differ per browser.

- **Same client Brain** runs in Chrome, Firefox, Safari, Edge — agents check `context.capabilities` to adapt (e.g., Firefox lacks side panel → FilterAgent uses overlay instead)
- **Content script adapters** are the only browser-specific code — they feed data to the client Brain in a normalized format via ACP
- **Cloud Brain is completely browser-independent** — it receives data via the sync hub regardless of which browser sent it
- **Extension build pipeline** bundles the same `brain/` code into each browser target, with only manifest and polyfill differences

### 4B. Safari Extension

- Use Apple's `safari-web-extension-converter` tool to convert the WebExtension
- Requires an Xcode wrapper project
- Distribute via Mac App Store (required for Safari extensions)
- iOS Safari: possible via Safari Web Extensions on iOS 15+

### 4C. Edge Extension

- Essentially identical to Chrome (Chromium-based)
- Different extension store submission
- Same codebase, different manifest metadata

**New file:** `extension/scripts/build-all.ts`

- Builds for all 4 browser targets
- Runs browser-specific manifest transforms
- Outputs to `dist/{chrome,firefox,edge,safari}/`

---

## Phase 5: Advanced AI & Intelligence

**Goal:** Make RecoMe's AI genuinely best-in-class — not just an LLM wrapper.

### 5A. Personal Taste Model

Train a small, on-device model that understands the user's taste better than generic LLMs.

**Architecture:**

```
Cloud (training)                    Device (inference)
┌─────────────────┐           ┌─────────────────────┐
│ Fine-tune small  │           │ ONNX Runtime Web    │
│ model on user's  │──export──▶│ or WebNN API        │
│ preference data  │           │                      │
│ (LoRA adapter)   │           │ ~5MB model file      │
│                  │           │ Runs in <50ms        │
└─────────────────┘           └─────────────────────┘
```

- Base model: Small transformer (DistilBERT-scale, ~66M params)
- Fine-tuning: LoRA adapter trained on user's preference data (cloud-side, encrypted)
- Inference: ONNX Runtime Web runs the model in-browser
- Use cases:
  - Instant content classification ("Would I like this?") without LLM API call
  - Embedding generation for similarity search
  - Preference prediction for feed ranking

**Agent integration:** The taste model replaces LLM calls for the most frequent agent operations. FilterAgent's `score_content`, FeedCuratorAgent's `rank_content`, and ScoutAgent's `cross_reference` all use the taste model for instant inference (<5ms) instead of LLM API calls (500ms+). LLM calls are reserved for complex reasoning tasks like AdvisorAgent's `generate_insight` or ShopperAgent's `analyze_reviews`. This cuts per-user AI costs by an estimated 80% while improving latency.

**Cost:** Fine-tuning runs once per week, takes ~2 minutes on a single GPU. Per-user cost: ~$0.01/week.

### 5B. Conversational Memory

The agent remembers everything you've ever discussed across all conversations.

**New service (cloud):** `cloud/src/agent/memory/`

```
memory/
├── ConversationStore.ts      # All conversations, searchable
├── MemoryIndex.ts            # Vector index for semantic search
├── MemoryRetriever.ts        # RAG: retrieve relevant past conversations
└── MemoryCompressor.ts       # Summarize old conversations to save space
```

**How it works (shared AgentMemory):**

- Every agent conversation is stored (encrypted) in a shared AgentMemory layer accessible to all agents
- Conversations older than 30 days are summarized (compressed)
- When user asks a question, RAG retrieves relevant past conversations
- Agent can reference: "Last month you were comparing TVs and liked the LG C3 — want me to check if the price dropped?"
- **Cross-agent memory:** AgentMemory is not per-agent — it is shared. When ShopperAgent tracks a price, AdvisorAgent can reference that in a later conversation. When ScoutAgent discovers an opportunity, FeedCuratorAgent remembers the user's reaction to similar past suggestions. This shared memory is the connective tissue that makes the multi-agent system feel like one coherent AI personality.

### 5C. Predictive Recommendations

Move from reactive ("you liked X, here's similar Y") to predictive ("you'll need Z next week").

**Prediction signals:**

| Pattern                                            | Prediction              | Action                                        |
| -------------------------------------------------- | ----------------------- | --------------------------------------------- |
| Researching running shoes + signed up for marathon | Will need running gear  | Surface: hydration packs, GPS watches         |
| Bought a camera 2 weeks ago                        | Will need accessories   | Surface: lenses, bags, memory cards           |
| Watching cooking videos increasing                 | Developing new interest | Surface: cookbooks, kitchen tools, meal kits  |
| Holiday season approaching + gift-giving history   | Will shop for gifts     | Surface: gift guides in preference categories |
| Reading about a topic every morning                | Routine forming         | Pin relevant content to top of feed           |

**Implementation (ScoutAgent + FeedCuratorAgent collaboration):**

- **ScoutAgent** detects predictive patterns using rule-based detection and LLM-assisted reasoning. It emits `PREDICTION_GENERATED` events with predicted needs and confidence scores
- **FeedCuratorAgent** subscribes to `PREDICTION_GENERATED` events and creates the "Coming Up" feed section — a dedicated area showing things RecoMe predicts the user will want soon
- **ShopperAgent** enriches predictions with pricing data (e.g., "You'll probably want running shoes — here are the best deals right now")
- **SocialAgent** adds social timing signals (e.g., "Holiday season approaching" from `content_calendar` tool)
- The taste model handles simple predictions (next-item inference from browsing patterns) while LLM handles complex temporal reasoning ("user is training for a marathon → will need gear in 3 weeks")

### 5D. Multi-Modal Understanding

The agent understands images, not just text.

**Capabilities:**

- **Screenshot analysis:** User shares a screenshot → agent identifies products, content, UI elements
- **Image search:** "Find me furniture that looks like this" → visual similarity search
- **Product recognition:** Point camera (mobile) at a product → RecoMe identifies it and gives recommendations
- Uses cloud vision API (Claude's vision, or Google Vision) — not on-device

---

## Phase 6: Monetization Expansion

**Goal:** Diversify revenue beyond subscriptions.

### 6A. Affiliate Revenue

When RecoMe recommends a product and the user buys it, RecoMe earns a commission.

**Implementation:**

- Join affiliate programs: Amazon Associates, eBay Partner Network, CJ Affiliate, ShareASale
- When agent or feed surfaces a product with a purchase link, append affiliate tag
- Track: click → purchase attribution
- Revenue share with user (optional): "You saved $X using RecoMe this month" — builds loyalty

**Affiliate link injection (ShopperAgent-managed, ethical approach):**

- ShopperAgent's tools (`compare_prices`, `find_alternatives`, `assess_deal`) automatically append affiliate tags to product links they surface
- GuardianAgent audits all affiliate link injection to ensure compliance with disclosure rules
- Only on links RecoMe actively surfaces (feed, agent, overlay)
- Never on organic browsing (extension doesn't modify existing page links)
- Clear disclosure: "RecoMe may earn a commission" in settings
- User can disable affiliate links entirely

### 6B. Premium AI Features (Add-On)

Beyond Pro/Premium tiers, offer à la carte AI features:

| Feature                       | Price               | Value                     |
| ----------------------------- | ------------------- | ------------------------- |
| Personal taste model training | $2.99/mo            | On-device AI tuned to you |
| Unlimited agent conversations | Included in Premium | No daily cap              |
| Predictive recommendations    | $1.99/mo            | "Coming Up" feed section  |
| Multi-modal (image search)    | $1.99/mo            | Visual recommendation     |
| Priority processing           | $0.99/mo            | Faster AI responses       |

### 6C. RecoMe for Creators (B2B Lite)

Content creators and small businesses get audience insights.

**New page:** Web app → `/creators` (powered by CreatorAgent)

- **CreatorAgent's `analyze_audience`** — anonymous, aggregated insights about what their audience cares about: "X% of users who follow you are also interested in Y"
- **CreatorAgent's `suggest_content`** — content suggestions based on audience interest gaps: "Your audience would engage with content about Z"
- **CreatorAgent's `track_performance`** — how creator's content performs within RecoMe: saves, shares, feed appearances
- **CreatorAgent's `identify_trends`** — emerging trends within the creator's specific audience segment
- Pricing: free tier (basic insights via `analyze_audience`), $19.99/mo (full CreatorAgent access with all tools)

---

## Infrastructure Evolution

### Cloud Architecture (V3)

```
                         ┌─────────────┐
                         │   CDN Edge   │
                         │  (Vercel/CF) │
                         └──────┬───────┘
                                │
                    ┌───────────┴────────────┐
                    │                         │
              ┌─────┴─────┐           ┌──────┴──────┐
              │  Web App   │           │  API Gateway │
              │ (Next.js)  │           │  (Hono)      │
              └─────┬──────┘           └──────┬───────┘
                    │                          │
         ┌──────────┼──────────┐     ┌────────┼────────┐
         │          │          │     │        │        │
    ┌────┴───┐ ┌───┴────┐ ┌──┴──┐ ┌┴────┐ ┌─┴──┐ ┌──┴───┐
    │ Auth   │ │ Sync   │ │Feed │ │Agent│ │Billing│ │Connect│
    │Service │ │Service │ │Svc  │ │ Svc │ │ Svc  │ │ Svc   │
    └────┬───┘ └───┬────┘ └──┬──┘ └┬────┘ └──┬──┘ └──┬───┘
         │         │         │     │         │       │
    ┌────┴─────────┴─────────┴─────┴─────────┴───────┴────┐
    │                    PostgreSQL                         │
    │          + Redis (cache/sessions/queues)              │
    │          + S3/R2 (encrypted blobs, models)            │
    │          + Pinecone/pgvector (embeddings)             │
    └─────────────────────────────────────────────────────┘
```

### Database Schema Additions (V3)

```sql
-- Feed
CREATE TABLE feed_items (
  id UUID PRIMARY KEY,
  source TEXT NOT NULL,           -- 'youtube', 'reddit', 'rss', etc.
  source_id TEXT,                 -- Original item ID on source platform
  content_type TEXT NOT NULL,     -- 'article', 'product', 'video', 'discussion'
  title TEXT NOT NULL,
  url TEXT,
  thumbnail_url TEXT,
  metadata JSONB,                 -- Platform-specific data
  created_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

-- User feed scores (pre-computed)
CREATE TABLE user_feed_scores (
  user_id UUID REFERENCES users(id),
  item_id UUID REFERENCES feed_items(id),
  score FLOAT NOT NULL,
  factors JSONB,                  -- Score breakdown
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, item_id)
);

-- Platform connections
CREATE TABLE connections (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  platform TEXT NOT NULL,
  access_token_encrypted BYTEA,
  refresh_token_encrypted BYTEA,
  scopes TEXT[],
  last_synced_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active'
);

-- Agent conversations (persistent)
CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id),
  role TEXT NOT NULL,              -- 'user', 'agent'
  content TEXT NOT NULL,
  actions JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversation embeddings for RAG
CREATE TABLE conversation_embeddings (
  message_id UUID REFERENCES conversation_messages(id),
  embedding vector(768),          -- pgvector
  PRIMARY KEY (message_id)
);
```

---

## V3 Execution Order

```
Phase 1: Web App Dashboard              → Cloud Brain + 9 agents deployed, multi-agent chat UI
Phase 2: Personalized Feed              → FeedCuratorAgent powers the discovery engine
Phase 3: Browser-Agnostic Ingestion     → IngestAgent orchestrates all imports via event mesh
Phase 4: Multi-Browser Extensions       → Same Brain, different adapters (ACP)
Phase 5: Advanced AI                    → Taste model replaces LLM calls, shared AgentMemory
Phase 6: Monetization Expansion         → ShopperAgent affiliates + CreatorAgent B2B tools
```

## V3 Success Metrics

| Metric                            | V2 Baseline | V3 Target                     |
| --------------------------------- | ----------- | ----------------------------- |
| Web app DAU                       | N/A         | 25k                           |
| Feed engagement (clicks/session)  | N/A         | 8+                            |
| Connected platforms per user      | N/A         | 3.5 avg                       |
| Agent conversations per user/week | 2           | 8                             |
| Browser coverage                  | Chrome only | Chrome, Firefox, Safari, Edge |
| Affiliate revenue / user / month  | $0          | $0.50                         |
| Creator accounts                  | N/A         | 500                           |
| MRR                               | $50k (V2)   | $200k                         |
