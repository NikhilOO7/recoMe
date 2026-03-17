# RecoMe V2 — Product Evolution Plan

## Vision

Transform RecoMe from a browser-specific extension into a cross-device, monetizable AI companion that understands users deeply through passive signals, platform imports, and collaborative intelligence — while maintaining the privacy-first architecture that defines v1.

---

## Phase 1: Floating Overlay + Smart Dwell Prompts

**Goal:** Make the agent feel native to web browsing and eliminate friction from active feedback mechanisms.

### 1A. Floating Agent Overlay

Replace popup-only access with an always-available floating overlay injected into every page.

**New file:** `extension/src/content/overlay/FloatingOverlay.tsx`

- Draggable pill icon (bottom-right default, user-repositionable)
- Click expands to a 400×500px chat panel anchored to the pill
- Panel states: collapsed (pill), mini (last message preview), expanded (full chat)
- Shadow DOM isolation to prevent page CSS conflicts
- Remembers position per-domain via `chrome.storage.local`

**New file:** `extension/src/content/overlay/OverlayManager.ts`

- Lifecycle management: inject on page load, destroy on navigation
- Z-index management (always on top, but respects fullscreen/video)
- Handles drag-and-drop repositioning with snap-to-edge
- Keyboard shortcut: `Alt+R` to toggle overlay

**New file:** `extension/src/content/overlay/OverlayChat.tsx`

- Reuses `AgentChat` component logic but adapted for overlay context
- Page-aware context: knows current URL, detected products, content type
- Quick actions bar: "Block this", "Save to watchlist", "Why am I seeing this?"
- Inline recommendation cards within chat responses
- Auto-minimizes during video playback (detected via MutationObserver on `<video>` elements)

**New file:** `extension/src/content/overlay/OverlayStyles.ts`

- CSS-in-JS (injected into shadow DOM) — no external stylesheet to avoid CORS issues
- Light/dark theme matching extension settings
- Responsive: smaller on mobile viewports, full panel on desktop
- Animations: spring-based expand/collapse, subtle breathing glow when insights pending

**Modify:** `extension/src/content/ContentOrchestrator.ts`

- Add overlay injection after adapter initialization
- Pass adapter context (platform, content type) to overlay

**Modify:** `extension/src/popup/PopupApp.tsx`

- Add "Open overlay" button that sends message to content script
- Settings option: "Always show floating overlay" (default: off)

**Modify:** `extension/manifest.json`

- Add `"all_urls"` to content script matches for overlay injection
- Content script needs React bundle — add overlay entry point to webpack

**Modify:** `webpack.config.js`

- New entry point: `overlay` → bundles overlay React components separately
- Tree-shake to keep overlay bundle small (~50KB target)

#### Overlay Architecture

```
Content Script
├── Platform Adapter (existing)
├── DwellTracker (existing)
├── FloatingOverlay (new)
│   ├── Shadow DOM root
│   ├── OverlayChat (React, mounted in shadow)
│   └── OverlayManager (position, lifecycle)
└── ContentOrchestrator (modified — manages all above)
```

#### Overlay ↔ Background Communication

```
OverlayChat → chrome.runtime.sendMessage({ type: 'AGENT_CHAT', ... })
           ← chrome.runtime.onMessage → { type: 'AGENT_RESPONSE', ... }
```

Same message protocol as popup chat — no new message types needed for basic chat. New messages:

| Message                 | Direction            | Purpose                                          |
| ----------------------- | -------------------- | ------------------------------------------------ |
| `OVERLAY_CONTEXT`       | content → background | Current page context for overlay-aware responses |
| `OVERLAY_POSITION_SAVE` | content → background | Persist pill position per-domain                 |
| `OVERLAY_QUICK_ACTION`  | content → background | Block/boost/watchlist from overlay               |

### 1B. Smart Dwell Prompts

Replace active like/dislike buttons with intelligent, contextual micro-prompts triggered by browsing behavior.

**New file:** `extension/src/content/prompts/SmartPromptEngine.ts`

Trigger conditions (all configurable):

| Trigger             | Threshold                                   | Prompt Type          | Example                                  |
| ------------------- | ------------------------------------------- | -------------------- | ---------------------------------------- |
| Extended dwell      | >15s on content item                        | Subtle toast         | "Enjoying this? 👍 👎"                   |
| Scroll-back         | User scrolls back to previously viewed item | Inline badge         | "Came back to this — interested?"        |
| Tab revisit         | Same content within 2h                      | Overlay notification | "You've visited this 3 times — save it?" |
| Comparison behavior | 3+ similar items in 5min                    | Comparison offer     | "Comparing headphones? Let me help"      |
| Cart/wishlist hover | Hover on add-to-cart >3s                    | Purchase intent      | "Want me to track this price?"           |
| Exit without action | Leave category page after viewing 5+ items  | Exit prompt          | "Found what you needed?"                 |

**New file:** `extension/src/content/prompts/PromptRenderer.ts`

- Renders prompts as non-intrusive micro-UIs injected near the content item
- Three styles: toast (bottom-right, auto-dismiss 5s), inline (next to content), overlay (in agent panel)
- Respects "prompt fatigue" — max 3 prompts per page, max 8 per hour, exponential backoff
- User can snooze all prompts for 1h/1d/forever from any prompt

**New file:** `extension/src/content/prompts/PromptFatigueManager.ts`

- Tracks prompt frequency per session and per day
- Adaptive frequency: reduces prompts for users who rarely respond, increases for engaged users
- Stores fatigue state in `chrome.storage.session`
- Cool-down periods: after dismissal, wait 5min before next prompt; after snooze, respect snooze duration

**Modify:** `extension/src/content/DwellTracker.ts`

- Add scroll-back detection (track scroll position history)
- Add comparison behavior detection (rapid viewing of similar items)
- Emit `SMART_PROMPT_TRIGGER` events with trigger type and content context

**Modify:** `extension/src/shared/messages.ts`

- Add `SMART_PROMPT_TRIGGER`, `SMART_PROMPT_RESPONSE`, `SMART_PROMPT_DISMISS`, `SMART_PROMPT_SNOOZE`

**Modify:** `extension/src/background/messageHandler.ts`

- Route prompt responses to MemoryService (positive → implicit signal, negative → soft block)

#### Prompt Response Flow

```
DwellTracker detects trigger
  → SmartPromptEngine evaluates (fatigue check, context check)
  → PromptRenderer shows micro-UI
  → User responds (👍/👎/dismiss/ignore)
  → Background: record implicit signal or soft preference
  → PromptFatigueManager updates frequency model
```

---

## Phase 2: Cloud Sync + Tiered Pricing

**Goal:** Enable cross-device continuity and establish a sustainable revenue model.

### 2A. Cloud Sync Architecture

**New directory:** `cloud/` — Standalone sync backend

```
cloud/
├── src/
│   ├── server.ts              # Express/Hono API server
│   ├── auth/
│   │   ├── AuthController.ts  # Login/register/token refresh
│   │   ├── OAuthProvider.ts   # Google, GitHub OAuth
│   │   └── TokenService.ts    # JWT issuance + refresh tokens
│   ├── sync/
│   │   ├── SyncController.ts  # Push/pull/conflict resolution
│   │   ├── SyncEngine.ts      # CRDT-based merge logic
│   │   ├── DeltaCompressor.ts # Only sync changes since last sync
│   │   └── ConflictResolver.ts # Last-write-wins with manual override
│   ├── storage/
│   │   ├── UserDataStore.ts   # Per-user encrypted blob storage
│   │   └── EncryptionService.ts # Client-side E2E encryption keys
│   ├── billing/
│   │   ├── BillingController.ts
│   │   ├── StripeService.ts
│   │   └── UsageTracker.ts
│   └── middleware/
│       ├── rateLimiter.ts
│       └── authMiddleware.ts
├── prisma/
│   └── schema.prisma          # User, SyncState, Subscription tables
├── Dockerfile
├── docker-compose.yml
└── package.json
```

**Technology choices:**

- **Server:** Hono (lightweight, edge-deployable) on Cloudflare Workers or Node.js
- **Database:** PostgreSQL (users, subscriptions) + R2/S3 (encrypted data blobs)
- **Auth:** JWT with refresh tokens, OAuth (Google, GitHub)
- **Encryption:** AES-256-GCM, key derived from user password — server never sees plaintext data
- **Sync protocol:** Delta-based CRDT (Conflict-free Replicated Data Type) for eventual consistency

#### Sync Data Model

```typescript
interface SyncPayload {
  version: number; // Schema version for migration
  deviceId: string; // Unique per browser/device
  timestamp: number; // Last sync time
  deltas: SyncDelta[]; // Only changes since last sync
  checksum: string; // Integrity verification
}

interface SyncDelta {
  collection: 'memory' | 'graph' | 'preferences' | 'watchlist' | 'achievements';
  operation: 'upsert' | 'delete';
  key: string; // Entity ID
  value: EncryptedBlob; // E2E encrypted
  vectorClock: Record<string, number>; // Per-device logical clock
}
```

#### Conflict Resolution Strategy

| Conflict Type                        | Resolution                                                      | Rationale                                            |
| ------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------- |
| Same entity modified on 2 devices    | Vector clock comparison → latest wins                           | Simple, predictable                                  |
| Block on device A, boost on device B | Block wins (safety-first)                                       | Prefer user's restrictive intent                     |
| Achievement unlocked on both         | Union (keep both timestamps, earliest wins)                     | Achievements are additive                            |
| Settings conflict                    | Device-specific settings stay local, shared settings use latest | Some settings (overlay position) are device-specific |

**New file (extension):** `extension/src/sync/SyncClient.ts`

- Handles push/pull with cloud API
- Delta computation: diff current state against last-synced snapshot
- E2E encryption: encrypt before upload, decrypt after download
- Retry with exponential backoff on network failure
- Sync triggers: on settings change, every 15 minutes (configurable), on browser startup

**New file (extension):** `extension/src/sync/SyncManager.ts`

- Orchestrates sync lifecycle: auth → compute deltas → encrypt → push → pull → decrypt → merge
- Conflict resolution on client side
- Progress events for UI feedback

**New file (extension):** `extension/src/sync/EncryptionClient.ts`

- AES-256-GCM encryption using Web Crypto API
- Key derivation from user password via PBKDF2 (100k iterations)
- Key stored in `chrome.storage.local` (encrypted with browser's storage encryption)

**Modify:** `extension/src/popup/components/SettingsPanel.tsx`

- Add "Cloud Sync" section: sign in, sync status, last synced, sync now button
- Device management: list synced devices, remove devices

**Modify:** `extension/manifest.json`

- Add cloud API URL to CSP

### 2B. Tiered Pricing Model

#### Tier Structure

| Feature                 | Free         | Pro ($4.99/mo)  | Premium ($9.99/mo)         |
| ----------------------- | ------------ | --------------- | -------------------------- |
| Core recommendations    | Yes          | Yes             | Yes                        |
| Platform adapters       | 3            | 8 (all)         | 8 (all)                    |
| Agent chat (regex mode) | Yes          | Yes             | Yes                        |
| Agent chat (AI mode)    | 10/day       | 100/day         | Unlimited                  |
| Cloud sync              | No           | Yes (2 devices) | Yes (unlimited)            |
| Smart dwell prompts     | Basic        | Advanced        | Advanced + custom rules    |
| Proactive insights      | 3 types      | All types       | All + custom triggers      |
| Achievements            | Basic set    | Full set        | Full + custom achievements |
| Knowledge graph depth   | 100 entities | 1,000 entities  | Unlimited                  |
| Data export             | JSON only    | JSON + CSV      | JSON + CSV + API access    |
| Overlay themes          | Default      | 5 themes        | Custom themes              |
| Price tracking          | No           | 5 items         | Unlimited                  |
| Priority support        | No           | Email           | Email + Discord            |

#### Implementation

**New file (extension):** `extension/src/billing/LicenseManager.ts`

- Validates subscription status via cloud API
- Caches license locally (valid for 7 days offline)
- Feature gating: `LicenseManager.canUse('cloud_sync')` → boolean
- Grace period: 3 days after subscription expires before downgrading

**New file (extension):** `extension/src/billing/FeatureGate.ts`

- Wraps feature access checks
- Shows upgrade prompts when free users hit limits
- Tracks usage counters (AI chat calls/day, tracked prices, etc.)

**New file (cloud):** `cloud/src/billing/StripeService.ts`

- Stripe Checkout for subscription creation
- Webhook handler for payment events (success, failure, cancellation)
- Prorated upgrades/downgrades

**Modify:** `extension/src/popup/PopupApp.tsx`

- Add subscription badge in header
- Upgrade prompts integrated naturally (not aggressive)

**New page:** `website/pricing.html`

- Feature comparison table
- Stripe checkout integration
- FAQ about billing

---

## Phase 3: Platform Imports + Price Tracking

**Goal:** Deeply understand users through their existing platform data and provide actionable shopping intelligence.

### 3A. Platform Data Imports

Read users' existing likes, wishlists, watch history, and purchase history from supported platforms.

**New directory:** `extension/src/importers/`

```
importers/
├── ImportManager.ts           # Orchestrates imports, dedup, progress
├── ImportScheduler.ts         # Periodic re-imports (daily/weekly)
├── platforms/
│   ├── YouTubeImporter.ts     # Watch history, liked videos, subscriptions
│   ├── AmazonImporter.ts      # Purchase history, wishlists, reviews
│   ├── TwitterImporter.ts     # Likes, bookmarks, followed topics
│   ├── InstagramImporter.ts   # Saved posts, liked posts
│   ├── RedditImporter.ts      # Upvoted posts, saved, subscribed subreddits
│   ├── SpotifyImporter.ts     # Liked songs, playlists, top artists
│   └── NetflixImporter.ts     # Watch history, ratings, My List
└── parsers/
    ├── DataTakeoutParser.ts   # Google/Meta/Twitter data export parsing
    └── LiveScrapeParser.ts    # DOM-based extraction from logged-in pages
```

#### Import Methods (per platform)

| Platform  | Method 1 (Preferred)          | Method 2 (Fallback)          | Data Available                |
| --------- | ----------------------------- | ---------------------------- | ----------------------------- |
| YouTube   | DOM scrape (history page)     | Google Takeout JSON          | Watch history, likes, subs    |
| Amazon    | DOM scrape (order history)    | —                            | Purchases, wishlists, reviews |
| Twitter/X | API (if available)            | DOM scrape (likes/bookmarks) | Likes, bookmarks, follows     |
| Instagram | Meta data export JSON         | DOM scrape (saved)           | Saves, likes                  |
| Reddit    | Reddit API (OAuth)            | DOM scrape                   | Upvotes, saves, subs          |
| Spotify   | Spotify API (OAuth)           | Data export JSON             | Listens, likes, playlists     |
| Netflix   | DOM scrape (viewing activity) | —                            | Watch history, ratings        |

**New file:** `extension/src/importers/ImportManager.ts`

```typescript
interface ImportResult {
  platform: string;
  itemsFound: number;
  itemsNew: number; // Not already in memory
  itemsDuplicate: number; // Already known
  preferencesInferred: PreferenceInference[];
  errors: ImportError[];
}

interface PreferenceInference {
  topic: string;
  confidence: number; // Based on frequency/recency
  source: string; // "youtube_likes", "amazon_purchases"
  evidence: string[]; // Item titles that support this inference
}
```

**Import flow:**

1. User initiates import from settings or overlay
2. ImportManager checks current tab — if on target platform, uses DOM scrape
3. Otherwise, prompts for data export file upload
4. Parser extracts structured data
5. Entity extraction (existing pipeline) runs on imported items
6. Dedup against existing memory entries
7. Write new memory entries with `source_type: 'platform_import'`
8. Run preference inference: aggregate imported data into high-confidence preferences
9. Update knowledge graph with new entities and relationships

**New file:** `extension/src/importers/platforms/YouTubeImporter.ts`

```typescript
class YouTubeImporter {
  // Navigate to youtube.com/feed/history
  // Scroll and collect video entries (title, channel, date)
  // Parse liked videos from youtube.com/playlist?list=LL
  // Extract subscriptions from youtube.com/feed/channels

  async importFromDOM(): Promise<RawImportData> { ... }
  async importFromTakeout(file: File): Promise<RawImportData> { ... }
}
```

**Modify:** `extension/src/popup/components/SettingsPanel.tsx`

- Add "Import Data" section with platform cards
- Import progress indicator
- Import history (last imported, items count)

**Modify:** `brain/src/memory/MemoryService.ts`

- Add `recordImportedPreferences(items: ImportResult[])` method
- Batch write with source tracking

### 3B. Price Tracking & Alerts

**New directory:** `brain/src/commerce/tracking/`

```
tracking/
├── PriceTracker.ts         # Core tracking logic
├── PriceStore.ts           # IndexedDB storage for price history
├── PriceAlertEngine.ts     # Alert rules and notification dispatch
└── PriceChartData.ts       # Prepare data for sparkline charts
```

**New file:** `brain/src/commerce/tracking/PriceTracker.ts`

- Records price snapshots when user visits product pages
- Stores: `{ productId, url, title, price, currency, timestamp, platform }`
- Price extraction leverages existing platform adapters' DOM parsing
- Check interval: every visit + background check every 6 hours (via alarm)

**New file:** `brain/src/commerce/tracking/PriceAlertEngine.ts`

- Alert rules:
  - Price drops below user-set threshold
  - Price drops X% from highest recorded
  - Price reaches all-time low
  - Price increases (alert before it goes higher)
- Notifications via `chrome.notifications` API + overlay toast

**Modify:** `extension/src/popup/components/AgentChat.tsx`

- Agent can show price history sparklines inline
- "Track this price" quick action
- "Price dropped!" proactive insight integration

**Modify:** `extension/manifest.json`

- Add `notifications` permission
- Add alarm for periodic price checks

---

## Phase 4: Preference Packs + Mobile Companion

**Goal:** Enable social discovery and extend RecoMe beyond desktop browsers.

### 4A. Preference Packs (Shareable Profiles)

Allow users to create and share curated preference profiles.

**New directory:** `extension/src/social/`

```
social/
├── PackBuilder.ts          # Create preference packs
├── PackRenderer.ts         # Visual pack cards
├── PackImporter.ts         # Apply a pack to your profile
└── PackStore.ts            # Browse/discover packs
```

**Pack structure:**

```typescript
interface PreferencePack {
  id: string;
  name: string; // "Audiophile Essentials"
  description: string;
  author: string; // Anonymous or username
  category: string; // "Audio", "Gaming", "Cooking"
  preferences: PackPreference[];
  version: number;
  downloads: number;
  rating: number;
}

interface PackPreference {
  topic: string; // "open-back headphones"
  sentiment: 'positive' | 'negative';
  strength: number; // 0-1
  explanation: string; // "Open-back for home listening"
}
```

**Features:**

- Create packs from your preferences (select which to include)
- Share via link or QR code
- Browse community packs (stored on cloud, requires free account)
- Preview before applying (shows what would change)
- Merge mode: combine pack preferences with your own (doesn't overwrite)
- Pack categories: curated collections for new users to bootstrap quickly

**New page:** `website/packs.html`

- Browse community packs
- Featured/trending packs
- Category filtering

### 4B. Mobile Companion App

**New directory:** `mobile/` — React Native app

```
mobile/
├── src/
│   ├── App.tsx
│   ├── screens/
│   │   ├── DashboardScreen.tsx    # Stats, recent activity
│   │   ├── AgentScreen.tsx        # Chat with agent
│   │   ├── PreferencesScreen.tsx  # View/edit preferences
│   │   ├── WatchlistScreen.tsx    # Price tracking, wishlists
│   │   ├── InsightsScreen.tsx     # Proactive insights feed
│   │   └── SettingsScreen.tsx     # Sync, subscription, etc.
│   ├── components/
│   │   ├── RecommendationCard.tsx
│   │   ├── PriceChart.tsx
│   │   └── InsightBanner.tsx
│   ├── services/
│   │   ├── SyncService.ts        # Cloud sync (same protocol as extension)
│   │   ├── NotificationService.ts # Push notifications
│   │   └── AgentService.ts       # Agent chat via cloud API
│   └── hooks/
│       └── useSync.ts
├── ios/
├── android/
└── package.json
```

**Key decisions:**

- React Native for cross-platform (iOS + Android)
- Shares cloud sync protocol with extension
- Agent chat works via cloud API (not local — no service worker on mobile)
- Push notifications for: price alerts, insights, achievement unlocks
- Read-heavy: mainly viewing preferences, insights, watchlist — not for browsing
- Deep links: "View on Amazon" opens browser where extension takes over

**Cloud additions for mobile:**

- Push notification service (Firebase Cloud Messaging)
- Mobile-specific API endpoints for batched data retrieval
- WebSocket for real-time agent chat

---

## Phase 5: Collaborative Filtering + Developer API

**Goal:** Enable anonymous, privacy-preserving collective intelligence and open RecoMe as a platform.

### 5A. Privacy-Preserving Collaborative Filtering

Allow users to opt into anonymous preference sharing for better recommendations.

**New directory (cloud):** `cloud/src/collaborative/`

```
collaborative/
├── AnonymousAggregator.ts     # Collects anonymized preference vectors
├── SimilarityEngine.ts        # User-to-user similarity (cosine similarity)
├── CollaborativeRecommender.ts # "Users like you also liked..."
├── DifferentialPrivacy.ts     # Noise injection for privacy
└── FederatedLearning.ts       # Future: on-device model training
```

#### Privacy Architecture

```
User's device                          Cloud
┌─────────────┐                  ┌──────────────────┐
│ Preferences  │                  │ Aggregate only    │
│ (detailed)   │─── anonymize ──▶│ (no individual    │
│              │    + noise       │  profiles stored) │
│              │                  │                    │
│              │◀── similar ─────│ Similarity matches │
│              │    vectors       │ (anonymized)       │
└─────────────┘                  └──────────────────┘
```

**How it works:**

1. User opts in (explicit consent, off by default)
2. Extension computes a preference vector: 50-dimensional embedding of interests
3. Differential privacy: add calibrated noise (ε=1.0) before upload
4. Cloud stores only the noisy vector — no user ID, no individual preferences
5. Similarity computation: find clusters of similar vectors
6. Return: "Users with similar taste also showed interest in: [topics]"
7. Extension uses these as weak signals (confidence: 0.2) in the scoring pipeline

**Key constraint:** Individual preferences are NEVER uploaded. Only anonymized, noisy aggregate vectors. The cloud cannot reconstruct any individual's browsing history.

**Modify (extension):** `brain/src/recommendation/RecommendationEngine.ts`

- Add optional 6th scoring factor: `collaborativeAffinity` (weight: 0.1, lowest of all factors)
- Only active when user has opted in AND cloud returns similar-user data

### 5B. Developer API

**New directory (cloud):** `cloud/src/api/v1/`

```
api/v1/
├── recommendations.ts    # GET /api/v1/recommendations?context=...
├── preferences.ts        # GET/POST /api/v1/preferences
├── insights.ts           # GET /api/v1/insights
├── webhooks.ts           # POST /api/v1/webhooks (subscribe to events)
└── apiKeys.ts            # API key management
```

**API use cases:**

- Third-party apps integrating RecoMe recommendations
- Content creators understanding audience preferences (aggregated, anonymized)
- E-commerce sites personalizing based on RecoMe signals (with user consent)
- Research: anonymized recommendation quality metrics

**API tier limits:**

| Endpoint           | Free    | Pro     | Premium  |
| ------------------ | ------- | ------- | -------- |
| Recommendations    | 100/day | 10k/day | 100k/day |
| Preferences (read) | 50/day  | 5k/day  | 50k/day  |
| Webhooks           | 2       | 10      | 50       |
| Rate limit         | 10/min  | 100/min | 1000/min |

**Developer portal:** `website/developers.html`

- API documentation
- Interactive API explorer
- API key management
- Usage dashboard
- Code examples (JavaScript, Python, cURL)

---

## Cross-Cutting Concerns

### Migration Strategy (V1 → V2)

```
V1 User installs V2 update
  → Migration runner detects V1 data format
  → Automatically converts IndexedDB schema (additive, no data loss)
  → Existing preferences preserved as-is
  → New features disabled by default (opt-in)
  → Welcome modal explains what's new
```

### Performance Budgets

| Component                | Budget              | Notes                           |
| ------------------------ | ------------------- | ------------------------------- |
| Overlay bundle           | <50KB gzipped       | Loaded on every page            |
| Smart prompt check       | <5ms                | Runs per scroll event           |
| Sync delta computation   | <100ms              | Runs every 15min                |
| Price check (background) | <2s per item        | Rate-limited to avoid detection |
| Import parser            | <10s for 1000 items | Web Worker for large imports    |
| Collaborative vector     | <1KB upload         | 50 floats × 4 bytes + noise     |

### Security Model

| Concern                   | Mitigation                                                       |
| ------------------------- | ---------------------------------------------------------------- |
| Cloud data breach         | E2E encryption — server only stores encrypted blobs              |
| API key theft             | Per-key rate limits, key rotation, abuse detection               |
| Import scraping detection | Randomized delays, respectful rate limiting, user-initiated only |
| Collaborative privacy     | Differential privacy (ε=1.0), no individual profiles on server   |
| Payment security          | Stripe handles all payment data, no card numbers stored          |

### Testing Strategy

| Phase   | Test Focus                                                                               |
| ------- | ---------------------------------------------------------------------------------------- |
| Phase 1 | Overlay shadow DOM isolation, prompt fatigue limits, cross-page state                    |
| Phase 2 | Sync conflict resolution (simulate multi-device), encryption roundtrip, Stripe webhooks  |
| Phase 3 | Import parser accuracy per platform, price extraction reliability, DOM change resilience |
| Phase 4 | Pack merge correctness, mobile-cloud sync parity, push notification delivery             |
| Phase 5 | Differential privacy guarantees (statistical tests), API rate limiting under load        |

---

## Execution Timeline

```
Phase 1: Floating Overlay + Smart Dwell       → Foundation for V2 UX
Phase 2: Cloud Sync + Pricing                  → Revenue + cross-device
Phase 3: Platform Imports + Price Tracking     → Deep understanding + utility
Phase 4: Preference Packs + Mobile             → Social + mobile reach
Phase 5: Collaborative Filtering + API         → Platform play
```

Each phase is independently valuable and shippable. No phase depends on a later phase. Phases 1-2 are the critical path for monetization.

---

## Success Metrics

| Metric                     | V1 Baseline | V2 Target                              |
| -------------------------- | ----------- | -------------------------------------- |
| Daily active users         | —           | 10k (6 months post-launch)             |
| Overlay engagement         | N/A         | 40% of users interact daily            |
| Smart prompt response rate | N/A         | >25% (vs <5% for like/dislike buttons) |
| Cloud sync adoption        | N/A         | 60% of active users                    |
| Paid conversion            | N/A         | 5% free → Pro, 1% Pro → Premium        |
| Import completion rate     | N/A         | >70% start → finish                    |
| Price alert accuracy       | N/A         | >90% correct price extraction          |
| Mobile DAU / Extension DAU | N/A         | 30%                                    |
| API developer signups      | N/A         | 500 in first year                      |
