# RecoMe Phase Audit — Implementation Tickets

> Generated: 2026-04-07

---

## P0 — Before Beta (MUST FIX)

### TICKET-001: Bridge browsing signals to KnowledgeGraph

- **Priority**: P0-CRITICAL
- **Owner**: Brain/Intelligence
- **Why**: The Research Card reads from KnowledgeGraph, but browsing signals only go to MemoryStore. The card is always empty for new users.
- **Files**: `brain/src/memory/MemoryService.ts` (recordImplicitSignal), `brain/src/index.ts` (processContent)
- **Acceptance Criteria**:
  - When a user dwells on a YouTube video about "headphones", the entity "headphones" appears in KnowledgeGraph with `interested_in` relation
  - When user later visits an Amazon headphone product page, the Research Card shows "headphones" as a matched signal with YouTube attribution
- **Size**: M

### TICKET-002: Fix Reddit platform in IMPLICIT_SIGNAL union

- **Priority**: P0-CRITICAL
- **Owner**: Extension/Background
- **Why**: Reddit signals get cast to `'unknown'` because `'reddit'` is missing from the type assertion
- **Files**: `extension/src/background/messageHandler.ts` line 126
- **Acceptance Criteria**: After browsing Reddit, check chrome.storage for mid_term entries with `platform: 'reddit'` (not `'unknown'`)
- **Size**: S (1 line)

### TICKET-003: Improve Research Card topic matching

- **Priority**: P0-CRITICAL
- **Owner**: Extension/Content
- **Why**: Naive word overlap on product title produces zero matches for real products
- **Files**: `extension/src/content/index.ts` (injectResearchCardOnPDP function, lines 460-530)
- **Acceptance Criteria**:
  - Given graph contains "headphones", "noise cancelling", "Sony"
  - When user visits "Sony WH-1000XM5 Wireless Noise Cancelling Headphones"
  - Then Research Card shows matches for all three topics with correct platform attribution
- **Size**: M

### TICKET-004: Remove dead popup code

- **Priority**: P0-HIGH
- **Owner**: Extension/Build
- **Why**: Popup builds but manifest doesn't use it — 300+ lines of dead code, ~300KB bundle waste
- **Files**: `webpack.config.js` (remove popup entry), `extension/src/popup/App.tsx` (keep only components used by overlay)
- **Acceptance Criteria**: Popup entry removed from webpack, dist/popup.js no longer generated, extension still works
- **Size**: S

### TICKET-005: Update extension description to match thesis

- **Priority**: P0-HIGH
- **Owner**: Extension/Manifest
- **Why**: Current: "Intelligent recommendation feed control. Your feed, your rules." — doesn't match thesis
- **Files**: `extension/src/manifest.json` line 5
- **Acceptance Criteria**: Description reads something like "Your research, connected across YouTube, Reddit, and Amazon. RecoMe remembers what you research and shows why products match."
- **Size**: S (1 line)

### TICKET-006: Test OAuth callback flow end-to-end

- **Priority**: P0-HIGH
- **Owner**: Auth/Extension
- **Why**: The web app → callback.html → extension auth flow has never been tested in production
- **Files**: `public/callback.html`, `web/src/app/login/page.tsx`, `web/src/app/signup/page.tsx`
- **Acceptance Criteria**:
  - Sign up on web app with GitHub → tokens arrive at callback.html → stored in chrome.storage → extension shows authenticated state
  - Verify CORS doesn't block callback.html from fetching /user/profile
- **Size**: S (testing, not code)

---

## P1 — Before Phase 1 Beta

### TICKET-007: Build real web app dashboard

- **Priority**: P1-HIGH
- **Owner**: Web App
- **Why**: Dashboard is a placeholder. The architecture doc says web app should be the control center for research trails.
- **Files**: `web/src/app/dashboard/page.tsx`
- **Acceptance Criteria**:
  - Authenticated users see their research topics (fetched from cloud sync if enabled, or a prompt to enable sync)
  - Shows recent research activity across platforms
  - Links to privacy controls and settings
- **Size**: L

### TICKET-008: Add critical path automated tests

- **Priority**: P1-HIGH
- **Owner**: All
- **Why**: Zero tests in the entire repo. No regression safety.
- **Files**: New test files across brain/, extension/src/, cloud/src/
- **Acceptance Criteria**:
  - Test: recordImplicitSignal writes to graph (after TICKET-001)
  - Test: Reddit signals have correct platform attribution
  - Test: Research Card topic matching produces results for known products
  - Test: OAuth callback stores tokens correctly
- **Size**: L

### TICKET-009: Fix cloud TypeScript build errors

- **Priority**: P1-HIGH
- **Owner**: Cloud/Backend
- **Why**: `tsc` fails with Hono context typing errors. Uses `|| true` workaround.
- **Files**: All controllers in `cloud/src/` that use `c.get('userId')`
- **Acceptance Criteria**: `npm run build` in cloud/ succeeds without `|| true`
- **Size**: M

### TICKET-010: Build plans/pricing page

- **Priority**: P1-MEDIUM
- **Owner**: Web App
- **Why**: Billing routes exist in backend but no UI for users to see/select plans
- **Files**: New `web/src/app/plans/page.tsx`
- **Acceptance Criteria**: Page shows FREE/PRO/PREMIUM tiers with features and Stripe checkout
- **Size**: M

### TICKET-011: Wire feature flags to extension

- **Priority**: P1-MEDIUM
- **Owner**: Extension/Background
- **Why**: Feature flags exist in DB and admin panel but extension ignores them
- **Files**: `extension/src/shared/constants.ts`, new flag-fetching service
- **Acceptance Criteria**: Extension fetches active flags from `/admin/flags` (or a public endpoint) on startup and caches locally
- **Size**: M

### TICKET-012: Move PrivacyReport to overlay

- **Priority**: P1-MEDIUM
- **Owner**: Extension/Overlay
- **Why**: PrivacyReport is in popup components. Popup is dead code. The component works when imported by overlay, but it's buried in Settings tab.
- **Files**: `extension/src/popup/components/PrivacyReport.tsx`
- **Acceptance Criteria**: PrivacyReport is prominently accessible from overlay — either as a tab or a top-level button
- **Size**: S

### TICKET-013: Sign up admin account and verify admin panel

- **Priority**: P1-MEDIUM
- **Owner**: Product/Admin
- **Why**: No admin users exist. Admin panel can't be accessed.
- **Files**: Supabase DB
- **Acceptance Criteria**: nikhilbindal983@gmail.com account exists with SUPER_ADMIN role, can access /admin
- **Size**: S

---

## P2 — After Beta

### TICKET-014: De-emphasize non-core platforms in UI

- **Priority**: P2
- **Owner**: Extension/UI
- **Why**: 15 platform adapters dilute the Amazon+YouTube+Reddit thesis
- **Files**: `extension/src/popup/components/SettingsPanel.tsx`, overlay
- **Acceptance Criteria**: Non-thesis platforms are beta-labeled or hidden in the default view
- **Size**: M

### TICKET-015: Config schema versioning

- **Priority**: P2
- **Owner**: Extension/Shared
- **Why**: Extension should handle older cached configs safely
- **Files**: `extension/src/shared/constants.ts`
- **Acceptance Criteria**: Config has a version field, extension validates and migrates on mismatch
- **Size**: M

### TICKET-016: Build extension demo page on web app

- **Priority**: P2
- **Owner**: Web App
- **Why**: Architecture doc calls for a demo showing how the extension works
- **Files**: New `web/src/app/demo/page.tsx`
- **Acceptance Criteria**: Interactive demo showing YouTube→Reddit→Amazon research flow
- **Size**: L

### TICKET-017: Facebook OAuth business verification

- **Priority**: P2
- **Owner**: Product
- **Why**: Facebook login button hidden because app is unpublished
- **Files**: `web/src/components/SocialLoginButtons.tsx` (uncomment)
- **Acceptance Criteria**: Facebook app published, button visible, login works
- **Size**: S (mostly external process)

### TICKET-018: Weekly digest testing and polish

- **Priority**: P2
- **Owner**: Extension/Background
- **Why**: Weekly digest alarm exists but is untested — may not fire correctly
- **Files**: `extension/src/background/alarms.ts`
- **Acceptance Criteria**: Digest notification appears after 7 days with real research summary
- **Size**: S
