# RecoMe V4 — Platform Evolution Plan

## Vision

Transform RecoMe from a product into a platform — the taste and preference layer of the internet. Third parties build on RecoMe. Users own their preference identity. RecoMe becomes infrastructure that powers personalization everywhere.

---

## The Platform Thesis

Today, every app builds its own recommendation system from scratch. Netflix, Spotify, Amazon, YouTube — each one starts from zero when you sign up. Your preferences are siloed, duplicated, and lost when you switch services.

RecoMe V4 becomes the **universal preference graph** — a portable, user-owned taste identity that any service can read from (with permission) and write to. The user controls their data. RecoMe provides the intelligence layer.

```
┌──────────────────────────────────────────────────────────┐
│                    USER'S TASTE IDENTITY                  │
│         (owned by user, encrypted, portable)              │
├──────────────────────────────────────────────────────────┤
│                                                           │
│   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐   │
│   │ Netflix │  │ Spotify │  │ E-comm  │  │ News    │   │
│   │  app    │  │  app    │  │  sites  │  │  sites  │   │
│   └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘   │
│        │            │            │            │          │
│   ┌────┴────────────┴────────────┴────────────┴────┐    │
│   │           RecoMe Platform API                   │    │
│   │    (read preferences, write signals, get recs)  │    │
│   └────┬────────────┬────────────┬────────────┬────┘    │
│        │            │            │            │          │
│   ┌────┴────┐  ┌───┴────┐  ┌───┴────┐  ┌───┴────┐    │
│   │ Taste   │  │ Reco   │  │ Graph  │  │ Social │    │
│   │ Graph   │  │ Engine │  │ Intel  │  │ Layer  │    │
│   └─────────┘  └────────┘  └────────┘  └────────┘    │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Agent Architecture Evolution (V3 → V4)

V2 introduced 6 core agents: **FilterAgent**, **ScoutAgent**, **AdvisorAgent**, **ShopperAgent**, **SocialAgent**, **GuardianAgent**. V3 expanded with **FeedCuratorAgent**, **IngestAgent**, **CreatorAgent**, a cloud-hosted **Brain**, and an **Agent Mesh** for inter-agent communication.

In V4, the agent system becomes the platform itself. Agents are no longer internal implementation details — they are the product. Every platform capability is an agent, every API endpoint maps to an agent tool, and third parties can invoke, extend, and build on the agent system.

### 1. Agent-as-a-Service

Third-party developers can invoke RecoMe agents directly via API. A developer building a music app can call `ShopperAgent.find_alternatives()` or `AdvisorAgent.compare_items()` for their users. Agents become composable, callable services.

```
Developer's Music App                     RecoMe Agent Platform
┌──────────────────┐                     ┌──────────────────────────┐
│                  │  API call            │                          │
│  "Find cheaper   │ ──────────────────▶ │  ShopperAgent            │
│   alternatives   │                     │    .find_alternatives()  │
│   to AirPods     │                     │                          │
│   Max"           │ ◀────────────────── │  Returns: 5 alternatives │
│                  │  structured response │  with scores, reasons,   │
└──────────────────┘                     │  and price comparisons   │
                                         └──────────────────────────┘
```

**API pattern:** Every agent exposes its tools as REST endpoints.

```
POST /api/v2/agents/{agent_name}/{tool_name}
Authorization: Bearer <user_token>
X-App-Key: <app_key>

{
  "params": { ... },
  "user_context": true   // include user's taste identity (if scoped)
}
```

### 2. New Agents for V4

| Agent                 | Purpose                                                           | Tools                                                                                                    |
| --------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **PlatformAgent**     | Manages third-party app permissions, rate limits, and data access | `validate_scope`, `meter_usage`, `enforce_quota`, `audit_access`                                         |
| **IdentityAgent**     | Manages the user's Taste Identity across services                 | `export_identity`, `selective_share`, `verify_consent`, `revoke_access`, `merge_identities`              |
| **CommunityAgent**    | Powers taste-based communities and social features                | `find_taste_matches`, `detect_communities`, `mix_social_feed`, `compute_compatibility`                   |
| **IntelligenceAgent** | Powers B2B analytics and the Global Taste Graph                   | `aggregate_anonymized`, `detect_trends`, `compute_correlations`, `generate_report`, `predict_trajectory` |
| **FederationAgent**   | Manages communication between federated RecoMe nodes              | `sync_with_node`, `validate_protocol`, `route_request`, `merge_distributed_state`                        |

**Full V4 Agent Roster (14 agents):**

```
V2 Agents (core):
  FilterAgent       — Content filtering and blocking
  ScoutAgent        — Content discovery across platforms
  AdvisorAgent      — Comparison and decision support
  ShopperAgent      — Purchase optimization and deal-finding
  SocialAgent       — Social signal processing
  GuardianAgent     — Privacy enforcement and data protection (veto power)

V3 Agents (intelligence layer):
  FeedCuratorAgent  — Personalized feed curation
  IngestAgent       — Multi-platform content ingestion
  CreatorAgent      — Content creation assistance

V4 Agents (platform layer):
  PlatformAgent     — Third-party app management
  IdentityAgent     — Taste identity and portable preferences
  CommunityAgent    — Social taste communities
  IntelligenceAgent — B2B analytics and taste graph
  FederationAgent   — Decentralized node communication
```

**Agent hierarchy in V4:**

```
                    ┌──────────────┐
                    │    Brain     │  (orchestrator — routes all requests)
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
      ┌───────┴──────┐    │    ┌───────┴──────┐
      │ GuardianAgent│    │    │ PlatformAgent│
      │ (veto power) │    │    │ (gate all    │
      │              │    │    │  3rd-party)  │
      └───────┬──────┘    │    └───────┬──────┘
              │            │            │
              └────────────┼────────────┘
                           │
         ┌─────────┬───────┼───────┬──────────┐
         │         │       │       │          │
    ┌────┴───┐ ┌───┴──┐ ┌──┴──┐ ┌──┴───┐ ┌───┴────┐
    │Identity│ │Commu-│ │Intel│ │Feder-│ │ V2/V3  │
    │ Agent  │ │nity  │ │lig. │ │ation │ │ Agents │
    └────────┘ └──────┘ └─────┘ └──────┘ └────────┘
```

### 3. Agent Marketplace

Third parties can build and publish custom agents that plug into the Brain. Custom agents compose on top of existing agent tools and add domain-specific knowledge.

**Example: Wine Sommelier Agent**

```
WineSommelierAgent (third-party):
  inherits: AdvisorAgent tools (compare_items, rank_by_criteria)
  adds:     custom wine knowledge graph (10k+ wines, regions, pairings)
  tools:
    - pair_with_meal(meal_description) → wine recommendations
    - find_similar_wines(wine, budget) → alternatives
    - build_cellar_plan(preferences, budget, timeline) → collection plan

  Revenue: $2.99/mo subscription, 70/30 split (developer/RecoMe)
```

**Marketplace rules:**

- Custom agents run in a sandboxed environment
- All data access goes through PlatformAgent (scope enforcement)
- GuardianAgent monitors all third-party agent behavior
- Revenue share: 70% to developer, 30% to RecoMe
- Community rating and review system for agents
- RecoMe certifies high-quality agents with a "Verified" badge

### 4. Federated Agent Network

In Phase 5 (Decentralization), agents can run on any node in the federation. The Brain becomes a distributed orchestrator.

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  RecoMe Cloud   │    │  Corp Node      │    │  Self-hosted    │
│  (all agents)   │◄──►│  (subset)       │◄──►│  (personal)     │
│                 │    │                 │    │                 │
│  Brain routes   │    │  Brain routes   │    │  Brain routes   │
│  to nearest/    │    │  local-first,   │    │  all local,     │
│  fastest node   │    │  cloud fallback │    │  cloud opt-in   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                      │                      │
         └──────────────────────┴──────────────────────┘
                    FederationAgent (on each node)
                    syncs state, routes requests,
                    validates protocol compliance
```

- Brain routes each request to the nearest/fastest node that has the required agent
- User's GuardianAgent ensures data never leaves approved nodes
- FederationAgent handles node discovery, health checks, and state synchronization
- Latency-sensitive operations (FilterAgent, FeedCuratorAgent) run on-device or nearest node
- Heavy computation (IntelligenceAgent, trend detection) routes to cloud

### 5. Agent Governance

As agents become more powerful and accessible to third parties, governance becomes critical.

**Governance framework:**

- **Audit trail:** Every agent action is logged with timestamp, initiator, input/output hash, and decision rationale. Users can inspect the full trail via `/identity/agent-log`.
- **Decision transparency:** Users can inspect any agent decision. "Why did AdvisorAgent recommend X?" returns the full reasoning chain.
- **Rate limiting:** PlatformAgent enforces per-agent, per-third-party-app rate limits. Prevents abuse and ensures fair resource allocation.
- **GuardianAgent veto power:** GuardianAgent can veto any action by any other agent — including third-party agents. If a third-party agent tries to access data outside its scope, GuardianAgent blocks it before execution.
- **Community flagging:** Users and developers can flag misbehaving third-party agents. Flagged agents are reviewed; repeated violations result in suspension from the marketplace.
- **Agent sandboxing:** Third-party agents cannot access raw user data, other agents' internal state, or network resources outside the approved API surface.

```
Third-party agent request flow:

  Developer App → PlatformAgent (validate scope, check quota)
                → GuardianAgent (verify consent, check privacy rules)
                → Brain (route to target agent)
                → Target Agent (execute tool)
                → GuardianAgent (audit response, redact if needed)
                → PlatformAgent (meter usage, log)
                → Developer App (return result)
```

---

## Phase 1: Platform API & Developer Ecosystem

**Goal:** Open RecoMe's intelligence to third-party developers and services.

> **Agent integration:** The API IS the agent system. Every API endpoint maps to an agent + tool invocation. PlatformAgent gates all third-party access. GuardianAgent audits every call.

**API-to-Agent Mapping:**

| API Endpoint                           | Agent                         | Tool(s)                             |
| -------------------------------------- | ----------------------------- | ----------------------------------- |
| `GET /api/v2/taste/preferences`        | ScoutAgent                    | `get_preferences`                   |
| `POST /api/v2/taste/signals`           | IngestAgent                   | `process_signal`                    |
| `GET /api/v2/taste/graph`              | Brain (KnowledgeGraph)        | `query_graph`                       |
| `GET /api/v2/taste/embeddings`         | Brain (AffinityCalculator)    | `compute_embedding`                 |
| `GET /api/v2/recommendations/content`  | AdvisorAgent                  | `recommend_content`                 |
| `GET /api/v2/recommendations/products` | ShopperAgent                  | `find_products`                     |
| `GET /api/v2/recommendations/similar`  | ScoutAgent                    | `find_similar`                      |
| `GET /api/v2/recommendations/explain`  | AdvisorAgent                  | `explain_recommendation`            |
| `GET /api/v2/identity/profile`         | IdentityAgent                 | `get_profile`                       |
| `GET /api/v2/identity/portable`        | IdentityAgent                 | `export_identity`                   |
| `POST /api/v2/identity/permissions`    | IdentityAgent + GuardianAgent | `selective_share`, `verify_consent` |
| `GET /api/v2/social/similar-users`     | CommunityAgent                | `find_taste_matches`                |
| `GET /api/v2/social/recommendations`   | SocialAgent + CommunityAgent  | `mix_social_feed`                   |
| `GET /api/v2/social/trending`          | FeedCuratorAgent              | `get_trending`                      |
| `GET /api/v2/analytics/audience`       | IntelligenceAgent             | `aggregate_anonymized`              |
| `GET /api/v2/analytics/trends`         | IntelligenceAgent             | `detect_trends`                     |
| `GET /api/v2/analytics/segments`       | IntelligenceAgent             | `compute_correlations`              |

**Middleware is agent-powered:**

- `scopeValidator.ts` → PlatformAgent.`validate_scope`
- `rateLimiter.ts` → PlatformAgent.`enforce_quota`
- `usageTracker.ts` → PlatformAgent.`meter_usage`

### 1A. Platform API (v2)

Extend V2's developer API into a full platform API.

**New directory (cloud):** `cloud/src/platform/`

```
platform/
├── api/
│   ├── v2/
│   │   ├── taste/                    # Taste Graph API
│   │   │   ├── preferences.ts        # Read/write user preferences
│   │   │   ├── graph.ts              # Query knowledge graph
│   │   │   ├── signals.ts            # Submit behavioral signals
│   │   │   └── embeddings.ts         # Get user taste embeddings
│   │   ├── recommendations/          # Recommendation API
│   │   │   ├── content.ts            # "What content would this user like?"
│   │   │   ├── products.ts           # "What products match this user?"
│   │   │   ├── similar.ts            # "Find items similar to X for this user"
│   │   │   └── explain.ts            # "Why would this user like X?"
│   │   ├── identity/                 # Taste Identity API
│   │   │   ├── profile.ts            # Public taste profile
│   │   │   ├── portable.ts           # Export/import taste identity
│   │   │   └── permissions.ts        # Manage third-party access
│   │   ├── social/                   # Social API
│   │   │   ├── similar-users.ts      # Find users with similar taste
│   │   │   ├── recommendations.ts    # "What do people like me enjoy?"
│   │   │   └── trending.ts           # Trending in taste clusters
│   │   └── analytics/               # Analytics API (for businesses)
│   │       ├── audience.ts           # Audience taste composition
│   │       ├── trends.ts             # Interest trends over time
│   │       └── segments.ts           # Taste-based audience segments
│   └── middleware/
│       ├── scopeValidator.ts         # Validate OAuth scopes per endpoint
│       ├── rateLimiter.ts            # Per-app rate limiting
│       └── usageTracker.ts           # Metered API billing
├── oauth/
│   ├── OAuthServer.ts                # OAuth 2.0 provider (RecoMe as identity provider)
│   ├── ScopeManager.ts              # Define and validate scopes
│   └── ConsentScreen.ts             # User consent UI
└── webhooks/
    ├── WebhookManager.ts            # Register/manage webhooks
    ├── WebhookDispatcher.ts         # Event delivery with retry
    └── events.ts                    # Event type definitions
```

#### API Scopes (OAuth 2.0)

```
recome:preferences:read      — Read user's preference categories and strengths
recome:preferences:write     — Update preferences (with user approval per change)
recome:graph:read            — Query the knowledge graph
recome:signals:write         — Submit behavioral signals
recome:recommendations:read  — Get personalized recommendations
recome:profile:read          — Read public taste profile
recome:identity:export       — Export full taste identity (portable)
recome:analytics:read        — Audience analytics (B2B only)
```

**Consent model:**

- Every third-party app requests specific scopes
- User sees exactly what data the app will access
- User can revoke access at any time
- All API calls are audited and visible to the user

#### API Examples

**"What would this user like?" (Content recommendation)**

```
GET /api/v2/recommendations/content
  ?category=headphones
  &limit=10
  &explain=true

Authorization: Bearer <user_token>
X-App-Key: <app_key>

Response:
{
  "recommendations": [
    {
      "title": "Sony WH-1000XM5",
      "score": 0.92,
      "explanation": "Strong Sony preference, noise-cancelling matches past purchases",
      "factors": {
        "preference_match": 0.95,
        "graph_affinity": 0.88,
        "collaborative": 0.85
      }
    }
  ]
}
```

**"Submit a signal" (Third-party app tells RecoMe about user behavior)**

```
POST /api/v2/taste/signals
Authorization: Bearer <user_token>

{
  "signals": [
    {
      "type": "engagement",
      "content": { "title": "Best Jazz Albums 2026", "category": "music" },
      "strength": 0.7,
      "context": "user read full article, 4 min dwell"
    }
  ]
}
```

### 1B. Developer Portal & SDK

**New repository:** `recome-sdk/`

```
recome-sdk/
├── packages/
│   ├── js/                    # JavaScript/TypeScript SDK
│   │   ├── src/
│   │   │   ├── RecoMeClient.ts
│   │   │   ├── auth.ts
│   │   │   ├── preferences.ts
│   │   │   ├── recommendations.ts
│   │   │   └── signals.ts
│   │   └── package.json       # @recome/sdk
│   ├── python/                # Python SDK
│   │   ├── recome/
│   │   │   ├── client.py
│   │   │   ├── auth.py
│   │   │   └── models.py
│   │   └── pyproject.toml     # recome-sdk
│   └── react/                 # React components
│       ├── src/
│       │   ├── RecoMeProvider.tsx
│       │   ├── RecommendationFeed.tsx
│       │   ├── TasteProfile.tsx
│       │   └── PreferenceChip.tsx
│       └── package.json       # @recome/react
└── docs/
    ├── getting-started.md
    ├── authentication.md
    ├── api-reference.md
    └── examples/
```

**Developer portal (web app):** `/developers`

- Interactive API explorer (try endpoints with your own data)
- SDK documentation with code examples
- App registration and key management
- Usage dashboard and billing
- Webhook testing tools

### 1C. Marketplace — "RecoMe Apps"

Third-party developers build apps that enhance RecoMe.

**App types:**

| Type            | Example                  | Revenue Model                                                   |
| --------------- | ------------------------ | --------------------------------------------------------------- |
| Data connectors | "Import from Letterboxd" | Free (user growth)                                              |
| Feed sources    | "Hacker News for RecoMe" | Free or paid                                                    |
| AI agents       | "Wine Sommelier Agent"   | Subscription ($1-5/mo) — plugs into Brain via Agent Marketplace |
| Visualization   | "Taste Map 3D"           | One-time purchase                                               |
| Integrations    | "RecoMe for Notion"      | Subscription                                                    |

**Marketplace infrastructure:**

```
cloud/src/marketplace/
├── AppRegistry.ts           # App submission, review, listing
├── AppInstaller.ts          # Install/uninstall apps
├── AppRuntime.ts            # Sandboxed execution environment
├── AppBilling.ts            # Revenue share (70/30 developer/RecoMe)
└── AppReview.ts             # Automated + manual review pipeline
```

---

## Phase 2: Taste Identity — Portable Preference Protocol

**Goal:** Users own their taste data and can take it anywhere. RecoMe becomes the "Sign in with Google" for preferences.

> **Agent integration:** IdentityAgent manages all taste identity operations — export, import, selective sharing, and identity merging. GuardianAgent enforces consent at every step, verifying that no data leaves without explicit user approval. Every "Sign in with RecoMe" flow passes through both agents.

**Agent flow for taste identity operations:**

```
User action: "Share my music taste with NewApp"
  → IdentityAgent.selective_share(categories=["music"], target="newapp")
  → GuardianAgent.verify_consent(user, scope="music", target="newapp")
  → GuardianAgent approves → IdentityAgent packages selective export
  → GuardianAgent.audit_access(log the share event)
  → PlatformAgent.meter_usage(newapp, "identity:read")
```

### 2A. Taste Identity Standard

Define an open, interoperable format for preference data.

**New repository:** `taste-identity-protocol/`

```
taste-identity-protocol/
├── spec/
│   ├── v1.0/
│   │   ├── schema.json           # JSON Schema for taste identity
│   │   ├── transport.md          # How to request/transfer identity
│   │   ├── consent.md            # Consent and privacy requirements
│   │   └── verification.md       # Cryptographic verification
│   └── examples/
│       ├── minimal.json
│       ├── full-profile.json
│       └── selective-share.json
└── README.md
```

**Taste Identity Schema (simplified):**

```json
{
  "$schema": "https://taste-identity.org/v1/schema.json",
  "version": "1.0",
  "identity": {
    "id": "did:recome:abc123", // Decentralized identifier
    "public_key": "...", // For verification
    "created_at": "2026-01-15T00:00:00Z"
  },
  "preferences": [
    {
      "category": "audio",
      "topic": "noise-cancelling headphones",
      "sentiment": "positive",
      "strength": 0.9,
      "confidence": 0.85,
      "source_count": 12, // How many signals support this
      "last_signal": "2026-03-15"
    }
  ],
  "graph_summary": {
    "top_categories": ["technology", "music", "cooking"],
    "entity_count": 450,
    "connection_density": 0.34
  },
  "sharing_preferences": {
    "allow_categories": ["technology", "music"], // Only share these
    "deny_categories": ["health"], // Never share these
    "granularity": "category", // Don't share individual items
    "anonymize": true
  }
}
```

### 2B. "Sign In with RecoMe"

Third-party sites can request taste context during sign-up, with user consent.

**Flow:**

```
User visits new-streaming-app.com
  → "Sign in with RecoMe" button
  → OAuth flow: app requests scopes (e.g., recome:preferences:read for 'movies', 'music')
  → User sees consent screen: "NewApp wants to know your movie and music preferences"
  → User approves (can customize what's shared)
  → NewApp receives taste context: preferred genres, favorite directors, etc.
  → NewApp's recommendations are personalized from day one
```

**User benefit:** No more cold-start problem on any new service.

**Business benefit for third parties:** Instant personalization, higher engagement, lower churn.

### 2C. Taste Identity Wallet

Users manage their taste identity like a digital wallet.

**Web app section:** `/identity`

- **Overview:** See your complete taste identity
- **Sharing dashboard:** See which apps have access to what
- **Selective sharing:** Granular control — share music taste but not shopping preferences
- **Export:** Download your complete taste identity (open format)
- **Import:** Import from another service that supports the protocol
- **Delete:** Full data deletion with cryptographic proof

---

## Phase 3: Social Taste Network

**Goal:** Connect people through shared taste. Make discovery social.

> **Agent integration:** CommunityAgent + SocialAgent power all social features. Taste compatibility is computed by CommunityAgent.`compute_compatibility`. Community detection uses CommunityAgent.`detect_communities` to automatically cluster users by taste. SocialAgent processes social signals (follows, endorsements, shared discoveries) and feeds them into the Brain. FeedCuratorAgent mixes social signals into the personal feed via CommunityAgent.`mix_social_feed`.

**Agent-powered social features:**

| Feature                     | Agent(s)                          | Tool(s)                 |
| --------------------------- | --------------------------------- | ----------------------- |
| Taste compatibility score   | CommunityAgent                    | `compute_compatibility` |
| "People like you" discovery | CommunityAgent                    | `find_taste_matches`    |
| Auto-detected communities   | CommunityAgent                    | `detect_communities`    |
| Social feed mixing          | CommunityAgent + FeedCuratorAgent | `mix_social_feed`       |
| Social signal processing    | SocialAgent                       | `process_social_signal` |
| Endorsement validation      | SocialAgent + GuardianAgent       | `validate_endorsement`  |

### 3A. Public Taste Profiles

**Web app section:** `/profile/{username}`

```
┌──────────────────────────────────────┐
│  @nikhil's Taste Profile             │
│                                       │
│  🎵 Music: Jazz, Electronic, Indie   │
│  📺 Shows: Sci-fi, Documentaries     │
│  🛍️ Shopping: Audio gear, Cooking    │
│  💻 Tech: React, AI, DevTools        │
│                                       │
│  Taste Match with you: 73%           │
│                                       │
│  Recent Discoveries:                  │
│  • "Severance Season 3" ⭐⭐⭐⭐⭐       │
│  • Sony WF-1000XM6 → "Best upgrade"  │
│  • "The Bear" cookbook                 │
│                                       │
│  [Follow]  [Compare Taste]  [Message] │
└──────────────────────────────────────┘
```

**Features:**

- Users choose what to make public (everything private by default)
- Taste compatibility score between any two users
- "Taste DNA" visualization — radar chart of interest categories
- Discovery feed: see what people you follow are discovering
- Endorsements: "I agree with @nikhil on headphones" — social proof for preferences

### 3B. Taste-Based Communities

**New feature:** Groups organized by shared taste, not just topics.

```
cloud/src/social/
├── communities/
│   ├── CommunityEngine.ts       # Auto-detect communities from taste clusters
│   ├── CommunityFeed.ts         # Shared discovery feed per community
│   └── CommunityMatcher.ts      # "You'd fit in with these groups"
├── follow/
│   ├── FollowService.ts         # Follow users, receive their discoveries
│   └── FeedMixer.ts             # Mix personal + social signals in feed
└── messaging/
    ├── DirectMessage.ts          # Taste-context-aware messaging
    └── Recommendations.ts        # "Send a recommendation to @friend"
```

**Community types:**

- **Auto-discovered:** "Audiophiles who also cook" — RecoMe detects taste clusters
- **User-created:** "Budget Home Theater Enthusiasts"
- **Brand communities:** Official brand presence (opt-in for users)

### 3C. Social Recommendations

```
Feed item enrichment:
┌─────────────────────────────────────┐
│ Sony WH-1000XM6                     │
│ ⭐ 4.8 · $349                       │
│                                      │
│ 🤖 RecoMe: 92% match (Sony pref +   │
│    noise-cancelling + budget fit)     │
│                                      │
│ 👥 3 people you follow own this:     │
│    @alex: "Best headphones I've had" │
│    @sam: "Great for flights"          │
│    @jay rated 5/5                     │
│                                      │
│ 📊 87% satisfaction in your taste    │
│    cluster                            │
└─────────────────────────────────────┘
```

---

## Phase 4: Taste Intelligence for Business (B2B Platform)

**Goal:** Businesses pay for anonymized taste intelligence to improve their products and marketing.

> **Agent integration:** IntelligenceAgent powers all B2B analytics — audience insights, trend detection, correlation analysis, and report generation. Every aggregation request passes through GuardianAgent first, which enforces privacy rules: minimum cluster sizes, anonymization, and opt-out checks. No data reaches a business without GuardianAgent approval.

**Agent flow for B2B analytics:**

```
Business requests: "Audience taste composition for headphone buyers"
  → PlatformAgent.validate_scope(app="biz_123", scope="analytics:read")
  → PlatformAgent.enforce_quota(app="biz_123", endpoint="audience")
  → GuardianAgent verifies: cluster_size >= 100, all users opted in
  → IntelligenceAgent.aggregate_anonymized(category="headphones", metric="composition")
  → GuardianAgent.audit_access(log the query, verify no PII in response)
  → IntelligenceAgent returns anonymized, aggregated result
```

**B2B product-to-agent mapping:**

| B2B Product              | Agent                       | Tool(s)                                        |
| ------------------------ | --------------------------- | ---------------------------------------------- |
| Audience Insights        | IntelligenceAgent           | `aggregate_anonymized`                         |
| Trend Radar              | IntelligenceAgent           | `detect_trends`, `predict_trajectory`          |
| Recommendation Widget    | AdvisorAgent + ShopperAgent | `recommend_content`, `find_products`           |
| Product-Market Fit Score | IntelligenceAgent           | `compute_correlations`                         |
| Campaign Targeting       | IntelligenceAgent           | `aggregate_anonymized`, `compute_correlations` |
| Custom Reports           | IntelligenceAgent           | `generate_report`                              |

### 4A. RecoMe for Business

**New web app:** `business.recome.ai`

```
business-web/
├── src/
│   ├── dashboard/
│   │   ├── AudienceInsights.tsx      # Who are your customers?
│   │   ├── TrendRadar.tsx            # What's trending in your space?
│   │   ├── CompetitorAnalysis.tsx    # How does taste differ across brands?
│   │   ├── ProductFit.tsx            # How well does your product match audience taste?
│   │   └── CampaignPlanner.tsx       # Plan campaigns based on taste segments
│   ├── integrations/
│   │   ├── ShopifyPlugin.tsx         # RecoMe-powered recommendations for Shopify
│   │   ├── WooCommercePlugin.tsx
│   │   └── CustomIntegration.tsx     # API-based integration guide
│   └── reports/
│       ├── WeeklyDigest.tsx          # Automated weekly taste reports
│       └── CustomReport.tsx          # Build custom taste analyses
```

**B2B Products:**

| Product                  | Description                                      | Pricing           |
| ------------------------ | ------------------------------------------------ | ----------------- |
| Audience Insights        | Understand what your audience cares about        | $99/mo            |
| Trend Radar              | Early detection of taste trends in your space    | $199/mo           |
| Recommendation Widget    | Embed RecoMe-powered recs on your site           | $0.001/rec served |
| Product-Market Fit Score | How well does your product match audience taste? | $49/report        |
| Campaign Targeting       | Taste-based audience segments for ad targeting   | $299/mo           |
| Custom API               | Full platform API access for internal tools      | $499/mo+          |

**Privacy model:**

- All B2B data is aggregated and anonymized (minimum cluster size: 100 users)
- No individual user data ever exposed to businesses
- Users can opt out of aggregated analytics entirely
- Regular privacy audits and transparency reports

### 4B. E-Commerce Integration Platform

**Widget SDK:**

```typescript
// On any e-commerce site:
import { RecoMeWidget } from '@recome/widget';

RecoMeWidget.init({
  appKey: 'shop_xxx',
  container: '#recommendations',
  type: 'product-recommendations',
  category: 'headphones',
  limit: 6,
  style: 'carousel', // or 'grid', 'list'
});

// Widget shows personalized recommendations
// for logged-in RecoMe users
// Falls back to popular items for non-users
```

**Integration flow:**

```
User visits partner-shop.com
  → Shop page loads RecoMe widget
  → Widget checks if user has RecoMe (cookie/extension detection)
  → If yes: fetch personalized recommendations via API
  → If no: show popular/trending items
  → Click tracking feeds back to RecoMe (with user consent)
```

### 4C. Content Publisher Tools

For bloggers, YouTubers, newsletter writers:

**"Powered by RecoMe" recommendation blocks:**

- Auto-insert personalized product/content recommendations in articles
- Revenue share: publisher gets 50% of affiliate revenue from their readers
- Dashboard: see how your recommendations perform, what your audience likes

---

## Phase 5: Decentralization & Data Sovereignty

**Goal:** Make RecoMe resilient, trustless, and truly user-owned.

> **Agent integration:** FederationAgent manages all node-to-node communication — discovery, sync, health checks, and protocol compliance. The Brain becomes a distributed orchestrator that routes requests across federated nodes. GuardianAgent on each node enforces data sovereignty: user data never leaves approved nodes.

**How the Brain routes across federated nodes:**

```
User on Corp Node requests a recommendation:

  1. Brain (local) receives request
  2. Brain checks: does this node have the required agent?
     - FilterAgent, FeedCuratorAgent → YES (latency-sensitive, run local)
     - IntelligenceAgent → NO (heavy compute, only on cloud)
  3. FederationAgent.route_request(target="cloud", agent="IntelligenceAgent")
  4. GuardianAgent (local) checks: is "cloud" an approved node for this user?
     - YES → FederationAgent sends request (encrypted, no raw user data)
     - NO → request blocked, user notified
  5. FederationAgent on cloud node receives, validates protocol
  6. Cloud Brain executes IntelligenceAgent tool
  7. Response returns via FederationAgent (encrypted)
  8. Local Brain assembles final result
```

**FederationAgent responsibilities per node type:**

| Node Type        | FederationAgent Behavior                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------ |
| RecoMe Cloud     | Full agent roster. Accepts routed requests. Syncs anonymized graph data.                   |
| Corporate Node   | Runs subset of agents. Routes overflow to cloud. Keeps employee data local.                |
| Self-hosted Node | Runs all agents locally. Cloud opt-in only. FederationAgent syncs only what user approves. |

### 5A. Decentralized Taste Identity (DID)

Move taste identity from RecoMe's servers to a decentralized system.

**Architecture:**

```
User's devices                    Decentralized network
┌──────────────┐           ┌────────────────────────┐
│ Taste data   │           │  IPFS (data storage)   │
│ (encrypted)  │──store──▶ │  + DID registry         │
│              │           │  (identity resolution)  │
│ Private key  │           │                          │
│ (user holds) │           │  RecoMe = one node in   │
│              │           │  the network, not owner  │
└──────────────┘           └────────────────────────┘
```

- **Decentralized Identifiers (DIDs):** `did:recome:abc123` — user-controlled identity
- **IPFS storage:** Encrypted taste data stored on IPFS — no single point of failure
- **User holds the key:** Only the user's private key can decrypt their taste data
- **RecoMe as a service provider:** RecoMe provides the intelligence layer, but doesn't own the data
- **Portability:** User can switch from RecoMe to a competitor without losing their taste history

### 5B. Federated Recommendation Network

Multiple organizations can run RecoMe-compatible recommendation nodes.

```
┌─────────┐  ┌─────────┐  ┌─────────┐
│ RecoMe  │  │ Partner │  │ Self-   │
│ Cloud   │  │ Node    │  │ hosted  │
│ (main)  │  │ (corp)  │  │ (user)  │
└────┬────┘  └────┬────┘  └────┬────┘
     │            │            │
     └────────────┴────────────┘
              │
     ┌────────┴────────┐
     │  Federated       │
     │  Protocol        │
     │  (taste-net)     │
     └─────────────────┘
```

- **Organizations run their own nodes:** A company can run a RecoMe node for their employees (data stays in-house)
- **Nodes communicate via protocol:** Share anonymized taste signals (with consent)
- **User chooses their node:** Like choosing an email provider — use RecoMe's cloud or host your own
- **Open source core:** The recommendation engine, knowledge graph, and scoring pipeline are open-sourced

### 5C. Open Source Strategy

| Component               | License             | Rationale                                           |
| ----------------------- | ------------------- | --------------------------------------------------- |
| Recommendation engine   | Apache 2.0          | Core algorithm — commoditize to grow ecosystem      |
| Knowledge graph         | Apache 2.0          | Foundation — more implementations = more value      |
| Browser extension       | Apache 2.0          | Client-side — no competitive moat in keeping closed |
| Taste Identity Protocol | CC0 (public domain) | Must be open standard to gain adoption              |
| Cloud platform          | Proprietary         | This is the business — hosted service + scale       |
| B2B analytics           | Proprietary         | Revenue generator                                   |
| AI models (fine-tuned)  | Proprietary         | Competitive advantage                               |

**Why open source?**

- Builds trust (users can verify privacy claims)
- Grows ecosystem (more developers = more integrations)
- Accelerates protocol adoption (more implementations = more value)
- RecoMe's moat is data + AI + network effects, not code

---

## Phase 6: Global Taste Graph

**Goal:** Build the world's most comprehensive map of human preferences — a new kind of knowledge base.

> **Agent integration:** IntelligenceAgent maintains the Global Taste Graph — computing correlations, detecting trends, and predicting trajectories. The graph is maintained by an **agent swarm architecture**: distributed IntelligenceAgent instances across federated nodes each maintain local graph partitions, with FederationAgent synchronizing updates. GuardianAgent enforces that only anonymized, aggregated data enters the global graph.

**Agent swarm for distributed graph computation:**

```
┌─────────────────────────────────────────────────────┐
│                 Global Taste Graph                    │
│            (assembled from all nodes)                │
└─────────────────────┬───────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
  ┌─────┴─────┐ ┌─────┴─────┐ ┌─────┴─────┐
  │ Node A    │ │ Node B    │ │ Node C    │
  │           │ │           │ │           │
  │ Intel.    │ │ Intel.    │ │ Intel.    │
  │ Agent     │ │ Agent     │ │ Agent     │
  │ (local    │ │ (local    │ │ (local    │
  │  graph    │ │  graph    │ │  graph    │
  │  partition│ │  partition│ │  partition│
  │  100k     │ │  50k      │ │  200k    │
  │  entities)│ │  entities)│ │  entities)│
  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
        │             │             │
        └──────FederationAgent──────┘
          syncs anonymized graph deltas
          (entity correlations, trend signals,
           NOT individual user data)
```

**Swarm computation model:**

- Each node's IntelligenceAgent computes local correlations and trends from its user base
- FederationAgent periodically syncs anonymized graph deltas between nodes
- GuardianAgent on each node verifies that outgoing deltas contain no PII (minimum cluster size enforced)
- The global graph is a merge of all node partitions — no single node holds the complete graph
- IntelligenceAgent.`predict_trajectory` uses the global graph for cross-node trend prediction
- IntelligenceAgent.`generate_report` can query the distributed graph via FederationAgent routing

### 6A. The Taste Graph

An anonymized, aggregated graph of how preferences relate across millions of users.

```
┌─────────────────────────────────────────┐
│              Global Taste Graph          │
│                                          │
│   "People who like Sony headphones"      │
│     ├── 73% also prefer Bose speakers    │
│     ├── 68% interested in jazz music     │
│     ├── 52% read tech reviews            │
│     └── 41% cook as a hobby              │
│                                          │
│   "People who watch sci-fi"              │
│     ├── 81% also read sci-fi books       │
│     ├── 45% interested in space tech     │
│     ├── 38% play strategy games          │
│     └── 29% follow AI news               │
│                                          │
└─────────────────────────────────────────┘
```

**Use cases:**

- **Product development:** "What adjacent interests does our audience have?"
- **Content strategy:** "What should we write about next based on audience taste evolution?"
- **Academic research:** "How do preferences correlate across cultures?"
- **Personal discovery:** "Based on taste patterns, you might enjoy X even though it seems unrelated"

### 6B. Trend Prediction

Detect emerging trends before they go mainstream by analyzing taste graph dynamics.

```
Trend Detection Pipeline:
  Rate of new signals per topic (acceleration)
  + Cross-category spillover (topic appears in new clusters)
  + Geographic spread (from concentrated to distributed)
  + Influencer adoption (high-connectivity nodes pick it up)
  = Trend confidence score + predicted trajectory
```

**Output examples:**

- "Mechanical keyboards: trending up 340% in 'developer' cluster, spreading to 'design' cluster"
- "Vinyl records: sustained growth across 'music' clusters, predicted to plateau in 6 months"
- "Home espresso: accelerating in 'remote work' cluster, correlated with 'specialty coffee' interest"

### 6C. Taste Intelligence API (Premium B2B)

Enterprise-grade access to the global taste graph.

| Endpoint                     | What it answers                         | Price       |
| ---------------------------- | --------------------------------------- | ----------- |
| `/intelligence/correlations` | "What else do people who like X enjoy?" | $0.01/query |
| `/intelligence/trends`       | "What's trending in category X?"        | $0.05/query |
| `/intelligence/predictions`  | "Where is taste heading in X?"          | $0.10/query |
| `/intelligence/segments`     | "What taste segments exist in X?"       | $0.05/query |
| `/intelligence/report`       | Custom taste intelligence report        | $500/report |

---

## Platform Revenue Model

| Revenue Stream                  | V4 Phase | Monthly Target |
| ------------------------------- | -------- | -------------- |
| Consumer subscriptions (V2)     | Ongoing  | $200k          |
| Affiliate commissions (V3)      | Ongoing  | $100k          |
| Creator tools (V3)              | Ongoing  | $30k           |
| Platform API (metered)          | Phase 1  | $50k           |
| Marketplace revenue share (30%) | Phase 1  | $20k           |
| B2B Audience Insights           | Phase 4  | $150k          |
| E-commerce widgets              | Phase 4  | $80k           |
| Publisher tools                 | Phase 4  | $40k           |
| Taste Intelligence API          | Phase 6  | $200k          |
| **Total Target MRR**            |          | **$870k**      |

---

## Platform Health Metrics

| Metric                                                       | Target                    |
| ------------------------------------------------------------ | ------------------------- |
| Total users (all platforms)                                  | 500k                      |
| Monthly active users                                         | 200k                      |
| Connected platforms per user                                 | 4+                        |
| Third-party apps in marketplace                              | 200+                      |
| API calls per month                                          | 50M+                      |
| B2B customers                                                | 500+                      |
| Taste Identity adoptions (third-party "Sign in with RecoMe") | 100+ sites                |
| Developer community                                          | 5k+ registered developers |
| Open-source contributors                                     | 200+                      |
| Taste graph entities                                         | 10M+                      |
| Taste graph connections                                      | 100M+                     |

---

## V4 Execution Order

```
Phase 1: Platform API + Developer Ecosystem    → Agents become the API (PlatformAgent gates access)
Phase 2: Taste Identity Protocol               → IdentityAgent + GuardianAgent manage portable data
Phase 3: Social Taste Network                  → CommunityAgent + SocialAgent power social discovery
Phase 4: B2B Platform                          → IntelligenceAgent powers analytics (GuardianAgent enforces privacy)
Phase 5: Decentralization                      → FederationAgent manages node-to-node, Brain routes distributed
Phase 6: Global Taste Graph                    → Agent swarm (IntelligenceAgent) maintains distributed graph
```

---

## The Long-Term Moat

```
Year 1 (V1-V2): Best personal recommendation tool          → Product moat
Year 2 (V3):    Best AI taste engine + multi-platform       → Intelligence moat
Year 3 (V4):    Taste identity protocol + social graph      → Network moat
Year 4+:        Global taste graph + platform ecosystem     → Data + ecosystem moat
```

Each layer makes the next more defensible. By the time competitors realize what RecoMe is, the taste graph and developer ecosystem are too far ahead to replicate.
