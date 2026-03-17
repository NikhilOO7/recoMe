# RecoMe V3 — Product Evolution Plan

## Vision

Transform RecoMe from a browser extension into a standalone product — a personal AI that understands your taste across the internet and becomes the place you go to discover, decide, and act on what matters to you.

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

**Anti-filter-bubble mechanisms:**

- **Diversity slots** — Every 10th item is deliberately outside the user's usual interests but adjacent (graph distance = 2-3)
- **Serendipity score** — Items get a bonus for being unexpected but potentially relevant
- **Category caps** — No single category can dominate >40% of the feed
- **Exploration mode** — User can toggle "Surprise me" to maximize diversity

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
- **Why this?** — agent explains the recommendation
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

**Connected platform experience:**

1. User clicks "Connect YouTube" in web app settings
2. OAuth flow → user grants read access to watch history, likes, subscriptions
3. Initial import: pull last 6 months of activity
4. Ongoing sync: every 6 hours (or via webhooks where available)
5. Data feeds into preference learning + knowledge graph + feed

### 3B. Email Newsletter Parsing

**New service (cloud):** `cloud/src/ingestion/email/`

```
email/
├── EmailIngester.ts          # Receive forwarded newsletters
├── NewsletterParser.ts       # Extract content from HTML emails
├── ContentExtractor.ts       # Pull articles, products, links
└── SubjectClassifier.ts      # Categorize newsletter content
```

**How it works:**

- User gets a unique RecoMe email: `username@inbox.recome.ai`
- Forward newsletters to this address, or set up auto-forward rules
- Parser extracts: links, products mentioned, topics discussed
- Content feeds into preference learning and feed

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

**How it works:**

- Every agent conversation is stored (encrypted)
- Conversations older than 30 days are summarized (compressed)
- When user asks a question, RAG retrieves relevant past conversations
- Agent can reference: "Last month you were comparing TVs and liked the LG C3 — want me to check if the price dropped?"

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

**Implementation:**

- Rule-based pattern detection (like V1 insights, but forward-looking)
- LLM-assisted prediction: send compressed preference timeline to LLM, ask "What might this user need next?"
- Predictions shown as a dedicated feed section: "Coming Up" — things RecoMe thinks you'll want soon

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

**Affiliate link injection (ethical approach):**

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

**New page:** Web app → `/creators`

- Anonymous, aggregated insights about what their audience cares about
- "X% of users who follow you are also interested in Y"
- Content suggestions: "Your audience would engage with content about Z"
- Pricing: free tier (basic insights), $19.99/mo (detailed analytics)

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
Phase 1: Web App Dashboard              → RecoMe accessible everywhere
Phase 2: Personalized Feed              → RecoMe becomes a destination
Phase 3: Browser-Agnostic Ingestion     → Learn from any source
Phase 4: Multi-Browser Extensions       → Full browser coverage
Phase 5: Advanced AI                    → Best-in-class intelligence
Phase 6: Monetization Expansion         → Sustainable business
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
