# RecoMe Phase 0 / Phase 1 Audit

> Audit date: 2026-04-07
> Auditor: Claude Opus 4.6 — brutally honest assessment
> Repo: /Users/nikhiloo7/personal-projects/recoME

---

## Executive Summary

### Overall Phase 0 Status: NOT READY

Phase 0 has **4 critical blockers** that prevent the core thesis from working. The biggest problem is architectural: **browsing signals from YouTube/Reddit do NOT flow into the KnowledgeGraph**, so the "Research Detected" card on Amazon product pages will always be empty for new users. The Research Card code exists and is well-structured, but it reads from a graph that nothing writes to during normal browsing.

### Overall Phase 1 Status: NOT READY

Phase 1 has **8 additional blockers** beyond Phase 0. The web app dashboard is a placeholder. Zero tests exist. The cloud backend has type errors. No plans/pricing surface exists.

### Go / No-Go

- **Phase 0 Beta**: **NO-GO** — core thesis flow is broken at the data layer
- **Phase 1 Beta**: **NO-GO** — too many gaps for 200 real users

### Top 10 Blockers

| #   | Blocker                                                                                                                         | Severity    |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------- | ------- |
| 1   | Browsing signals go to MemoryStore, NOT KnowledgeGraph. Research Card reads from KnowledgeGraph. Data pipeline is disconnected. | P0-CRITICAL |
| 2   | Reddit platform missing from IMPLICIT_SIGNAL type union — signals lose attribution                                              | P0-CRITICAL |
| 3   | Topic matching in Research Card uses naive word overlap — will produce zero matches for real Amazon products                    | P0-CRITICAL |
| 4   | Web app dashboard is a placeholder, not a real research trail view                                                              | P0-CRITICAL |
| 5   | Popup still builds but manifest doesn't reference it — dead code creating confusion                                             | P0-HIGH     |
| 6   | Zero automated tests in the entire repository                                                                                   | P1-HIGH     |
| 7   | Cloud backend tsc build fails (uses `                                                                                           |             | true` workaround) | P1-HIGH |
| 8   | No plans/pricing page anywhere                                                                                                  | P1-HIGH     |
| 9   | Non-core platforms (Walmart, eBay, Facebook, Instagram, LinkedIn) dominate the product — dilutes Phase 0 thesis                 | P1-MEDIUM   |
| 10  | Extension description in manifest says "feed control" not "research connected" — misaligned with thesis                         | P1-MEDIUM   |

---

## Repo Map

| Folder               | Purpose                                                                            | LOC (approx) |
| -------------------- | ---------------------------------------------------------------------------------- | ------------ |
| `extension/src/`     | Chrome MV3 browser extension — adapters, overlay, popup, background service worker | ~15,000      |
| `brain/src/`         | Intelligence engine — graph, memory, scoring, agents, commerce                     | ~8,000       |
| `packages/schema/`   | Shared TypeScript types (Platform, Context, Graph entities)                        | ~500         |
| `packages/utils/`    | Shared utility functions                                                           | ~200         |
| `cloud/src/`         | Hono backend API — auth, sync, billing, admin, taste twin                          | ~4,000       |
| `cloud/prisma/`      | Database schema (14 models, 6 enums)                                               | ~250         |
| `web/src/`           | Next.js 16 web app — landing, auth, dashboard, admin panel                         | ~3,000       |
| `public/`            | Extension HTML files (popup.html, devtools.html, callback.html)                    | ~100         |
| `pitch-site/`        | Static investor pitch site (not production)                                        | ~2,000       |
| `.github/workflows/` | CI/CD for cloud deploy                                                             | ~20          |

---

## System-by-System Assessment

### Browser Extension: PARTIAL

- **Builds**: Yes, webpack compiles with only bundle-size warnings
- **Manifest**: MV3, no popup (action click toggles overlay), callback.html registered
- **Adapters**: 15 platform adapters exist (Amazon, YouTube, Reddit, eBay, Walmart, X, Facebook, Instagram, LinkedIn, TikTok, Indeed, Glassdoor, Udemy, Coursera, EdX + GenericAdapter)
- **Problem**: Too many adapters for Phase 0. Should focus on Amazon + YouTube + Reddit only.
- **Files**: `extension/src/content/`, `extension/src/background/`, `extension/src/shared/`

### Extension Overlay: PARTIAL

- **Renders**: Yes, Shadow DOM isolated
- **Auth-aware**: Yes, shows welcome/signup or main tabs based on onboarding state
- **Tabs**: Dashboard, Agent, Settings — all render popup components inside overlay
- **Problem**: Duplicates full popup functionality inside overlay. Should be compact per architecture doc.
- **Files**: `extension/src/content/overlay/OverlayChat.tsx`, `extension/src/content/overlay/FloatingOverlay.tsx`

### Extension Popup: BROKEN (dead code)

- **Status**: Builds via webpack (`popup` entry still in webpack.config.js), HTML generated
- **But**: `manifest.json` has NO `default_popup` — popup is never shown to users
- **Problem**: ~300 lines of dead code that imports AuthManager, Dashboard, Settings
- **Fix**: Remove popup entry from webpack, delete popup-specific code
- **Files**: `extension/src/popup/App.tsx`, `extension/src/popup/index.tsx`, `webpack.config.js`

### Extension Onboarding: PARTIAL

- **Code**: 3-step flow (Welcome, Quick Preferences, Done) — `extension/src/popup/components/Onboarding.tsx` (210 lines)
- **Overlay path**: Welcome screen redirects to web app signup, "Skip" button completes instantly
- **Problem**: "Skip" writes onboarding_done to both sync and local storage — good
- **Problem**: Onboarding is inside popup components which the overlay imports — architectural mess
- **Verdict**: Functional but architecturally tangled
- **Files**: `extension/src/popup/components/Onboarding.tsx`, `extension/src/shared/PanelState.ts`

### Amazon Flow: PARTIAL

- **Adapter**: Strong — 569 lines, page-type detection (home/search/product/deals/feed), rich metadata extraction (ASIN, price, rating, seller, brand), commerce-enabled
- **Research Card**: Code exists (314 lines) — injects below product title on `/dp/` pages
- **Problem**: Research Card reads from KnowledgeGraph via `GET_GRAPH_SUMMARY` → `topInterests`. But KnowledgeGraph is only populated by explicit `learnFeedback` (user clicks "interested"/"block"). Normal browsing signals go to MemoryStore via `recordImplicitSignal`. **The graph will be empty for any user who hasn't manually liked topics.**
- **Problem**: Topic matching is naive — splits product title into words >3 chars and checks if any graph entity name contains that word. "Sony WH-1000XM5 Wireless Noise Cancelling Headphones" → keywords ["sony", "wireless", "noise", "cancelling", "headphones"]. Will match "headphones" if it's in the graph, but the graph is empty.
- **Files**: `extension/src/content/adapters/AmazonAdapter.ts`, `extension/src/content/ui/ResearchCard.ts`, `extension/src/content/index.ts` (lines 312-530)

### YouTube Flow: PARTIAL

- **Adapter**: 312 lines, 16 card selectors, page-type detection, rich metadata (video ID, channel, duration, engagement)
- **Signal capture**: DwellTracker sends IMPLICIT_SIGNAL with `platform: 'youtube'` and extracted topics
- **Problem**: Signals go to MemoryStore (mid_term entries), NOT to KnowledgeGraph
- **Verdict**: YouTube captures signals but they don't reach the Research Card data source
- **Files**: `extension/src/content/adapters/YouTubeAdapter.ts`, `extension/src/content/DwellTracker.ts`

### Reddit Flow: BROKEN

- **Adapter**: 238 lines, covers new Reddit (shreddit), old Reddit, comments, search
- **Platform detection**: `reddit` is in Platform type union and observer.ts
- **Manifest**: reddit.com is in host_permissions and content_scripts
- **CRITICAL BUG**: `IMPLICIT_SIGNAL` handler in `messageHandler.ts` casts `sig.platform` to a union type that does NOT include `'reddit'`:
  ```typescript
  platform: sig.platform as
    | 'youtube'
    | 'amazon'
    | 'twitter'
    | 'facebook'
    | 'instagram'
    | 'ebay'
    | 'walmart'
    | 'unknown';
  ```
  Reddit signals will be cast to `'unknown'` at runtime, losing platform attribution.
- **Problem**: Even if the union is fixed, signals still go to MemoryStore not KnowledgeGraph
- **Files**: `extension/src/content/adapters/RedditAdapter.ts`, `extension/src/background/messageHandler.ts` (line 126)

### Non-Core Platforms: NOT NEEDED FOR PHASE 0

- **Present**: Walmart (344 lines), eBay (280 lines), X/Twitter (296 lines), Facebook (250 lines), Instagram (260 lines), LinkedIn (370 lines), TikTok, Indeed, Glassdoor, Udemy, Coursera, EdX
- **Problem**: These dilute the Phase 0 thesis. The extension description, settings UI, and overlay all surface all platforms equally — there's no focus on Amazon + YouTube + Reddit
- **Recommendation**: Beta-label or hide non-core platforms from user-facing UI

### Web App Landing Page: DONE

- **Status**: Polished, responsive, dark theme matching pitch-site style
- **Content**: Hero with stats, "What RecoMe Does" (4 feature cards), "Built For" (3 personas), "How It Works" (3-step YouTube→Reddit→Amazon flow), Privacy section, Products section, CTA
- **Chrome Web Store link**: Real URL (`fgpjboodmfnjbpdmbapjjjbfkflhbkcf`)
- **Files**: `web/src/app/page.tsx` (~400 lines)

### Web App Onboarding: PARTIAL

- **What exists**: Login page with Google + GitHub OAuth buttons + email/password form. Signup page same.
- **OAuth flow**: Works for Google and GitHub. Facebook hidden (needs business verification).
- **Token handling**: Login/signup pages capture `?token=&refresh=` from OAuth callback URL, store in localStorage, redirect to /dashboard
- **Extension callback**: `callback.html` captures tokens, stores in chrome.storage, marks onboarding done
- **Problem**: The full OAuth→callback→extension flow has NOT been tested end-to-end in production
- **Files**: `web/src/app/login/page.tsx`, `web/src/app/signup/page.tsx`, `public/callback.html`

### Web App Auth: PARTIAL

- **Backend**: JWT auth with access + refresh tokens, OAuth for Google/GitHub/Facebook
- **RBAC**: USER, ADMIN, SUPER_ADMIN roles
- **Problem**: No user with `nikhilbindal983@gmail.com` exists yet — admin can't access admin panel
- **Files**: `cloud/src/auth/AuthController.ts`, `cloud/src/auth/OAuthService.ts`, `cloud/src/auth/TokenService.ts`

### Web App Plans: MISSING

- **Backend**: Billing routes exist (`/billing/checkout`, `/billing/portal`, `/billing/status`) with Stripe integration
- **Frontend**: Zero plans/pricing pages. No way for users to see or select plans.
- **Verdict**: Not needed for Phase 0, needed for Phase 1

### Web App Dashboard / Research Trail: MISSING

- **What exists**: `/dashboard` page shows user profile + 3 quick-link cards + placeholder text: "Research topics appear here once cloud sync is enabled"
- **Problem**: This is NOT a research trail dashboard. It's a placeholder page with no actual research data.
- **The architecture says**: Web app should be the control center for research trails
- **Reality**: Research data lives in extension's local IndexedDB, inaccessible from the web app unless cloud sync is enabled (which requires the user to explicitly enable it in Settings)
- **Files**: `web/src/app/dashboard/page.tsx`

### Web App Privacy/Settings: PARTIAL

- **Privacy page**: Static privacy policy content (good copy, covers what stays local vs server)
- **Settings page**: Shows account info (email, tier), links to privacy, delete account button
- **Problem**: Not a real privacy control center. No interactive export, no data size display, no toggle controls
- **Extension has**: `PrivacyReport.tsx` component with storage size, API key status, data flow visibility — but this is in the popup (which is dead code since popup was removed from manifest)
- **Files**: `web/src/app/privacy/page.tsx`, `web/src/app/settings/page.tsx`, `extension/src/popup/components/PrivacyReport.tsx`

### Admin Panel: DONE

- **Pages**: Dashboard, Users, Feature Flags, Deployments, App Config, Error Logs, Audit Log (7 pages)
- **RBAC**: adminMiddleware checks ADMIN/SUPER_ADMIN role server-side
- **API**: Full CRUD for flags, users, deployments, config, errors, audit
- **Problem**: No admin users exist yet (test accounts are SUPER_ADMIN but your real account isn't created)
- **Files**: `web/src/app/admin/`, `cloud/src/admin/AdminController.ts`, `cloud/src/middleware/adminMiddleware.ts`

### Token/Auth Sync: PARTIAL

- **Extension → Web App**: Popup/overlay redirect to web app signup/login with `ext_id` param
- **Web App → Extension**: `callback.html` receives tokens and stores in chrome.storage
- **Extension AuthManager**: Reads tokens from storage, provides `getAuthState()`, `isAuthenticated()`
- **Problem**: This flow has NOT been tested end-to-end. `callback.html` tries to fetch user profile from `recome-api.fly.dev` — CORS may block this from a chrome-extension:// origin
- **Problem**: Extension doesn't fetch user config from server on startup. No config schema versioning.
- **Files**: `extension/src/shared/AuthManager.ts`, `public/callback.html`, `extension/src/shared/constants.ts`

### Config / Schema / Feature Flags: PARTIAL

- **Schema**: 14 Prisma models, 6 enums, well-structured
- **Feature flags**: FeatureFlag model in DB + admin CRUD API + admin UI
- **Extension-side**: Feature flags are NOT consumed by the extension. `extension/src/shared/constants.ts` has hardcoded feature values, not fetched from server.
- **Problem**: Feature flags exist in the database and admin panel but the extension ignores them entirely
- **Files**: `cloud/prisma/schema.prisma`, `extension/src/shared/constants.ts`

---

## Phase 0 Audit

### P0.1: Amazon is the primary decision surface

**Status**: PARTIAL

**Evidence**: AmazonAdapter is the strongest adapter (569 lines), with page-type detection, rich metadata extraction, commerce-enabled. Research Card code exists and targets `/dp/` pages.

**What's missing**: The Research Card will always be empty because the data pipeline is disconnected. `processContent()` does NOT write to KnowledgeGraph — it only scores content for hide/boost/show decisions. `recordImplicitSignal()` writes to MemoryStore (mid_term entries) not KnowledgeGraph. The Research Card reads from KnowledgeGraph via `GET_GRAPH_SUMMARY`.

**Fix**: Bridge MemoryStore → KnowledgeGraph. When `recordImplicitSignal` processes a positive signal, also call `graph.addRelation('local_user', entity, 'interested_in', weight)`. Or: modify `injectResearchCardOnPDP` to also query MemoryStore via a new message type.

**Files**: `brain/src/index.ts` (processContent, learnFeedback), `brain/src/memory/MemoryService.ts` (recordImplicitSignal), `extension/src/content/index.ts` (injectResearchCardOnPDP), `extension/src/content/ui/ResearchCard.ts`

### P0.2: "Research Detected" card on Amazon product pages

**Status**: BROKEN (code exists, data pipeline empty)

**Evidence**: `ResearchCard.ts` (314 lines) is well-designed — injects below `#productTitle`, shows match score, platform signal badges, "See full research trail" / "Not relevant" actions. CSS is polished.

**What's broken**: `injectResearchCardOnPDP()` in `index.ts` does:

1. Extract product title → split into words >3 chars
2. Query `GET_GRAPH_SUMMARY` → `topInterests` (KnowledgeGraph entities with `interested_in` relations)
3. Match title words against entity names

Step 2 returns empty for new users. Even for users who've manually liked topics, step 3 uses naive string matching that's unlikely to connect "Sony WH-1000XM5" to "headphones".

**Fix**:

1. Bridge browsing signals to KnowledgeGraph (see P0.1)
2. Improve topic matching: use extracted topics from MemoryStore entries, not just graph entity names
3. Consider querying MemoryStore directly for platform-attributed signals

### P0.3: Cross-platform research trail (YouTube + Reddit + Amazon)

**Status**: BROKEN

**Evidence**: Each adapter extracts topics and sends them via DwellTracker → IMPLICIT_SIGNAL. But:

- YouTube signals → MemoryStore (correct platform attribution)
- Reddit signals → MemoryStore (platform cast to 'unknown' — BUG)
- Research Card on Amazon → reads KnowledgeGraph (empty)

**What's broken**: Three disconnects:

1. MemoryStore ≠ KnowledgeGraph — signals and queries use different stores
2. Reddit platform attribution broken (missing from union type)
3. No way to query "what did the user research on YouTube and Reddit that relates to this Amazon product?"

**Fix**:

1. Add 'reddit' to IMPLICIT_SIGNAL platform union (line 126 of messageHandler.ts)
2. Make recordImplicitSignal ALSO write to KnowledgeGraph
3. Or: build a dedicated cross-platform query that joins MemoryStore entries by topic across platforms

### P0.4: Lightweight onboarding that doesn't block core value

**Status**: PARTIAL (acceptable for Phase 0)

**Evidence**: 3-step onboarding (Welcome, Preferences, Done). "Skip — browse with defaults" completes instantly. Web app redirect for account creation.

**What's good**: Non-blocking. Works without account.
**What's concerning**: If user skips, they get zero personalization. The extension still works (adapters run, content is scored) but the Research Card will be empty until they browse enough.

### P0.5: Minimal popup or compact control view

**Status**: BROKEN

**Evidence**: Popup code exists but manifest doesn't reference it. The overlay is the only UI. Extension icon click triggers `chrome.action.onClicked` → sends `TOGGLE_OVERLAY` message.

**Problem**: On pages where content script isn't injected (chrome://, new tab, about:), clicking the icon opens the web app — which is fine, but there's no way to see extension status without navigating to a supported page.

**Fix**: Either restore a minimal popup OR ensure the overlay-only approach works cleanly.

### P0.6: Clear privacy/trust story

**Status**: PARTIAL

**Evidence**:

- Web app `/privacy` page has comprehensive privacy policy
- Extension `PrivacyReport.tsx` shows storage size, API key status, data flow visibility
- Data is local-first, cloud sync is optional and E2E encrypted
- KeyVault encrypts API keys at rest

**Problem**: `PrivacyReport.tsx` is in the popup components, which are dead code (popup removed from manifest). The overlay renders popup components, so it's accessible via overlay Settings tab, but it's buried.

### P0.7: Non-core platforms don't dominate

**Status**: NOT MET

**Evidence**: The extension is active on 15+ platforms. Settings panel shows toggles for all. Overlay shows the same Dashboard/Agent/Settings regardless of platform.

**Fix**: De-emphasize non-core platforms in UI. Don't hide the adapters (they provide data) but don't surface them prominently. Marketing copy should focus on Amazon + YouTube + Reddit.

---

## Phase 1 Audit

### P1.1: Usable research trail / dashboard

**Status**: MISSING

- Web app `/dashboard` is a placeholder with "Research topics appear here once cloud sync is enabled"
- Extension `ResearchTopics.tsx` exists but reads from graph (which is empty)
- No end-to-end research trail visualization

### P1.2: Privacy report / export / delete controls

**Status**: PARTIAL

- `PrivacyReport.tsx` exists with storage metrics
- Export/import/clear data exists in Settings panel
- Web app `/settings` has delete account button
- Missing: interactive privacy controls on web app, data flow toggle, export from web app

### P1.3: Stable insight quality

**Status**: PARTIAL

- OpportunityRanker with 4-factor scoring exists
- Agent insights dashboard exists
- Smart prompt dedup (topic + content level) exists
- Toast queue prevents overlap
- But: Research Card (the thesis feature) produces no data

### P1.4: Coherent product story

**Status**: NOT MET

- Web app landing page tells a clear story (YouTube → Reddit → Amazon research connection)
- But extension description says "Intelligent recommendation feed control. Your feed, your rules." — misaligned with thesis
- Extension overlay and adapters treat all 15 platforms equally

### P1.5: Reliability for ~200 users

**Status**: NOT MET

- Zero automated tests
- Cloud backend has type errors
- OAuth flow untested end-to-end
- Research Card will be empty for all new users

### P1.6: Users can understand quickly

**Status**: PARTIAL

- Landing page is clear
- Extension onboarding is lightweight
- But: actual product behavior doesn't match the promise

### P1.7: Distribution surfaces ready

**Status**: NOT MET

- Chrome Web Store listing exists
- Web app deployed on Vercel
- But: core flow is broken, so distribution of a broken product

---

## Bug and Gap List

| ID  | Issue                                       | Severity | Area      | Status      | Why It Matters                 | Technical Cause                                                             | Fix                                                             | Files                                                     |
| --- | ------------------------------------------- | -------- | --------- | ----------- | ------------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------- |
| B1  | Browsing signals don't reach KnowledgeGraph | P0       | Brain     | Broken      | Research Card has no data      | processContent only scores, recordImplicitSignal only writes to MemoryStore | Bridge MemoryStore writes to also addRelation in KnowledgeGraph | `brain/src/index.ts`, `brain/src/memory/MemoryService.ts` |
| B2  | Reddit missing from IMPLICIT_SIGNAL union   | P0       | Extension | Broken      | Reddit signals lose platform   | Type assertion missing 'reddit'                                             | Add 'reddit' to union                                           | `extension/src/background/messageHandler.ts:126`          |
| B3  | Research Card topic matching is naive       | P0       | Extension | Broken      | Zero matches for real products | Word overlap on product title                                               | Use MemoryStore topics + semantic matching                      | `extension/src/content/index.ts:460-530`                  |
| B4  | Web app dashboard is placeholder            | P0       | Web App   | Missing     | No research trail visible      | Just static text                                                            | Build real dashboard or remove                                  | `web/src/app/dashboard/page.tsx`                          |
| B5  | Popup builds but isn't used                 | P0       | Extension | Dead code   | Confusion, bundle size         | Manifest has no default_popup                                               | Remove from webpack                                             | `webpack.config.js`, `extension/src/popup/`               |
| B6  | Zero automated tests                        | P1       | All       | Missing     | No regression safety           | Never written                                                               | Add critical path tests                                         | All                                                       |
| B7  | Cloud tsc build fails                       | P1       | Cloud     | Broken      | Type safety compromised        | Hono context typing                                                         | Fix context types                                               | `cloud/src/`                                              |
| B8  | No plans/pricing page                       | P1       | Web App   | Missing     | Can't monetize                 | Never built                                                                 | Build plans page                                                | `web/src/app/`                                            |
| B9  | Extension description misaligned            | P1       | Extension | Wrong       | Confuses users                 | Old copy                                                                    | Update to thesis messaging                                      | `extension/src/manifest.json:5`                           |
| B10 | Feature flags not consumed by extension     | P1       | Extension | Missing     | Can't do rollouts              | Never wired                                                                 | Fetch flags from API on startup                                 | `extension/src/shared/constants.ts`                       |
| B11 | No admin user exists                        | P1       | Admin     | Blocked     | Can't access admin panel       | Haven't signed up                                                           | Sign up + promote                                               | Supabase                                                  |
| B12 | OAuth callback CORS untested                | P1       | Auth      | Unknown     | May fail in production         | chrome-extension:// CORS                                                    | Test and fix                                                    | `public/callback.html`                                    |
| B13 | PrivacyReport in dead popup code            | P1       | Extension | Orphaned    | Users can't see it easily      | Popup removed from manifest                                                 | Move to overlay or web app                                      | `extension/src/popup/components/PrivacyReport.tsx`        |
| B14 | Non-core platforms dominate UI              | P2       | Extension | Wrong focus | Dilutes thesis                 | All platforms treated equally                                               | Beta-label or hide                                              | Multiple adapter files                                    |

---

## File-by-File Recommendations

### Critical Files

| File                                              | What It Does                                         | Phase 0/1 Impact                                   | Change Needed                         | Size   |
| ------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------- | ------------------------------------- | ------ |
| `brain/src/index.ts`                              | Intelligence service — processContent, learnFeedback | CRITICAL — processContent doesn't write to graph   | Add graph writes for browsing signals | Medium |
| `brain/src/memory/MemoryService.ts`               | Memory store — recordImplicitSignal                  | CRITICAL — writes to MemoryStore only              | Bridge to KnowledgeGraph              | Medium |
| `extension/src/background/messageHandler.ts`      | Message dispatch — IMPLICIT_SIGNAL handler           | CRITICAL — Reddit missing from union               | Add 'reddit' to type assertion        | Small  |
| `extension/src/content/index.ts`                  | Content script bootstrap + Research Card injection   | CRITICAL — topic matching is naive                 | Improve matching algorithm            | Medium |
| `extension/src/content/ui/ResearchCard.ts`        | Research Detected card component                     | Good code, bad data                                | No change needed — fix data pipeline  | None   |
| `extension/src/content/adapters/RedditAdapter.ts` | Reddit post/comment extraction                       | Good adapter, platform attribution broken upstream | Fix is in messageHandler              | None   |
| `extension/src/popup/App.tsx`                     | Popup UI (dead code)                                 | Dead weight                                        | Delete or repurpose                   | Small  |
| `webpack.config.js`                               | Build config                                         | Still builds popup                                 | Remove popup entry                    | Small  |
| `web/src/app/dashboard/page.tsx`                  | User dashboard                                       | Placeholder                                        | Build real dashboard                  | Deep   |
| `extension/src/manifest.json`                     | Extension config                                     | Description misaligned                             | Update description                    | Small  |

---

## Fast Wins

1. **Add 'reddit' to IMPLICIT_SIGNAL union** — 1 line change in `messageHandler.ts:126`
2. **Update manifest description** — change to "Your research, connected across YouTube, Reddit, and Amazon"
3. **Remove popup from webpack** — delete entry, save ~300KB bundle size
4. **Sign up with GitHub** — create account, promote to SUPER_ADMIN
5. **Bridge implicit signals to graph** — add `graph.addRelation` calls in `recordImplicitSignal`

## Deep Work

1. **Rebuild Research Card data pipeline** — design proper cross-platform topic matching using MemoryStore + KnowledgeGraph
2. **Build real web app dashboard** — fetch research topics from extension via cloud sync or direct API
3. **Add E2E test suite** — at minimum: signal capture → graph → Research Card flow
4. **Fix cloud TSC errors** — resolve Hono context typing across all controllers
5. **Build plans/pricing** — implement Stripe checkout flow end-to-end

---

## Suggested Execution Order

### Phase 0 Sprint (get thesis working)

1. Fix Reddit platform union (5 min)
2. Bridge recordImplicitSignal → KnowledgeGraph (2-4 hours)
3. Improve Research Card topic matching (4-8 hours)
4. Manual E2E test: YouTube → Reddit → Amazon (1 hour)
5. Remove dead popup code (30 min)
6. Update manifest description (5 min)
7. De-emphasize non-core platforms in UI (2 hours)
8. Test OAuth callback flow end-to-end (1 hour)

### Phase 1 Sprint (beta-ready)

9. Build real web app dashboard (8-16 hours)
10. Add critical path tests (8 hours)
11. Fix cloud TSC errors (4 hours)
12. Build plans/pricing page (8 hours)
13. Move PrivacyReport to overlay/web app (2 hours)
14. Wire feature flags to extension (4 hours)
15. Sign up admin account, verify admin panel (30 min)

---

## Beta Readiness Decision

### Ready Now

- Web app landing page (polished, clear messaging)
- Web app auth (Google + GitHub OAuth working)
- Admin panel (7 pages, RBAC, deployed)
- Cloud backend API (deployed on Fly.io, Supabase DB)
- Extension adapters (Amazon, YouTube, Reddit code exists)
- Extension overlay (renders, auth-aware)
- Privacy story (policy page, local-first architecture)

### NOT Ready

- **Research Card data pipeline** — the thesis feature is broken at data layer
- **Cross-platform research trail** — YouTube and Reddit signals don't reach the graph
- **Reddit platform attribution** — signals cast to 'unknown'
- **Web app dashboard** — placeholder, not real
- **Automated tests** — zero coverage
- **Extension popup** — dead code still building

### Must Fix Before Real-User Beta

1. Bridge browsing signals to KnowledgeGraph
2. Fix Reddit platform union
3. Improve Research Card topic matching
4. Test the full thesis flow manually (YouTube → Reddit → Amazon)
5. Remove dead popup code

### Can Wait Until After Beta

- Plans/pricing page
- Feature flag consumption by extension
- Cloud TSC errors (runtime works, just types)
- Web app dashboard (can show data in extension overlay for beta)
- Non-core platform de-emphasis (cosmetic, not functional)
