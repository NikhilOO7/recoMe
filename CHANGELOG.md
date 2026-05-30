# Changelog

## [2.0.0] - 2026-05-30

### Architectural reset

The extension is rewritten as the thin capture + render surface specified by
HLD §2.1: no LLM calls in the browser, no in-extension brain/agent runtime,
no per-user encryption (the cloud holds the graph). 28,225 LOC → 5,433 LOC.

### Added

- **Capture pipeline** ([extension/src/capture/](extension/src/capture/)) —
  per-platform extractors (YouTube, Amazon, Reddit, eBay, Walmart, Twitter/X,
  Facebook, Instagram, TikTok, LinkedIn, Indeed, Glassdoor, Udemy, Coursera,
  edX, Generic). Page-level dwell signal after 10s + URL/form search signal.
  Output matches `cloud/src/intelligence/schemas.ts#signalSchema`.
- **Cloud client + queue** ([extension/src/shared/](extension/src/shared/)) —
  `AuthClient` (JWT access + refresh, de-duped refresh in flight),
  `CloudClient` (typed fetch wrapper, 401-once retry, graceful 404 degrade),
  `SignalBatcher` (IDB queue with 72h TTL, ULID-ish ts-ordered ids).
- **Background workers** ([extension/src/background/](extension/src/background/)) —
  `SignalUploader` (alarm-driven 30s flush, 100-batch chunks),
  `InboxPoller` (alarm-driven 2-min poll, cursor-persisted, browser-action
  badge for unseen count). Slim 190-LOC `messageHandler` replaces the
  prior 1,217-LOC dispatcher.
- **In-page surfaces** ([extension/src/surfaces/](extension/src/surfaces/))
  matching `pitch-site/demos/extension-demo.html`:
  - per-card scoring badges + reasoning callouts (Amazon, YouTube, Reddit,
    eBay) driven by cloud `POST /intelligence/score/cards`;
  - right-edge shadow-DOM sidebar with status, Interest Graph bars, Agents
    list, Inbox badge, "Ask the agents" manual-flow buttons;
  - bottom-left InsightCard stack rendering page-relevant AgentEvents from
    the inbox poll with Open / Dismiss / 👍 / 👎.
- **Per-platform agentic workflows** ([surfaces/workflows/](extension/src/surfaces/workflows/)):
  Concierge auto on commerce PDP; Recall auto on YouTube /watch and Reddit
  posts; Curator manual on content/jobs platforms; Curriculum manual on
  learning platforms; Decision/AskFlow everywhere (opens overlay chat).
- **Overlay chat** ([surfaces/OverlayChat.ts](extension/src/surfaces/OverlayChat.ts))
  — multi-turn shadow-DOM chat against the Decision agent with typewriter
  reveal, page-context hints.
- **Real popup inbox** ([popup/App.tsx](extension/src/popup/App.tsx)) —
  AgentEvent rows with kind badge, age, body, Open / Dismiss / feedback
  actions; Unseen / All tabs; capture toggle + sign-out.
- **Web `/ask` page** ([web/src/app/ask/page.tsx](web/src/app/ask/page.tsx))
  matching `pitch-site/demos/agents-demo.html`: AdvisorAgent chat column,
  Concierge Watchlist column, full-width GuardianAgent audit trail.
- **New cloud agents + endpoints**:
  - `DecisionAgent` (on-demand; cites top intents),
  - `CurriculumAgent` (on-demand; 4-week bridge from anchors),
  - `POST /intelligence/score/cards` (per-card scoring stub for badges),
  - `GET|POST|DELETE /intelligence/agents/concierge/watchlist` (in-memory
    stub; production swap to Prisma model is ~20 LOC),
  - `POST /intelligence/agents/:name/run` now threads body `event` into
    `AgentContext` so extension-driven workflows can fire event-triggered
    agents with synthetic payloads.

### Changed

- Manifest v2.0.0. Host permissions + CSP `connect-src` reduced to
  `api.recome.app` (and the legacy `recome-api.fly.dev` for env override).
  Direct host entries for `api.anthropic.com`, `api.openai.com`,
  `generativelanguage.googleapis.com` removed.
- Popup re-enabled (`default_popup`) — the no-popup overlay-only UX from
  v1.x is replaced by a real inbox.
- Storage migration on extension update: legacy keys wiped
  (`recome_api_keys_encrypted`, `recome_encryption_salt`, `recome_brain_state`,
  `recome_stats`, `recome_storage_version`, `recome_cloud_access_token`).
  Users must sign in via the web app once after upgrading.
- Web `AppShell` PRIMARY nav adds `Ask` link.

### Removed

- In-extension brain ([brain/](graveyard/2026-05-30-extension-rewrite/brain/))
  and agent ([agent/](graveyard/2026-05-30-extension-rewrite/agent/)) packages
  — moved to `graveyard/`. They were inert per the 2026-05-14 principal audit
  (`ToolExecutor` never had tools registered); rewrite routes all agent work
  through cloud.
- `extension/src/devtools/` — devtools panel was tied to the in-extension
  agent runtime; rebuilt as cloud-driven surfaces in `/agents` and `/ask`.
- `extension/src/importers/` — bulk import is a paste/PWA surface per HLD §3,
  not an extension responsibility.
- `extension/src/social/` (PackBuilder/PackImporter) — taste twins are a
  server-side concern (and removed per ADR-0012 anti-features list).
- `extension/src/shared/encryption.ts`, `KeyVault.ts`, `AuthManager.ts`,
  `PerfMonitor.ts`, `EventBus.ts`, `PanelState.ts`, `storageSync.ts` — the
  per-install encryption (key derived from `chrome.runtime.id`, deterministic)
  and local achievements/stats infrastructure are no longer needed.
- 13 platform adapters (BaseAdapter god class, 1,634 LOC) + `PlatformIntelligenceEngine`
  - `SmartPromptEngine` — replaced by the slimmer capture extractors above and
    the cloud-driven AgentEvents rendered in-page.
- `graphology`, `graphology-communities-louvain`, `uuid` deps — cluster
  detection moves to cloud per HLD; ULID-ish ids generated inline.

### Security / privacy fixes (P0s from 2026-05-14 audit)

- Encryption key derived from `chrome.runtime.id` → resolved by deletion;
  there is no in-browser crypto anymore. The graph lives in cloud Neo4j.
- Plaintext API-key fallback in messageHandler → resolved by deletion; the
  extension does not hold third-party API keys.
- Stats counter race (read-modify-write on `chrome.storage.local`) → resolved
  by deletion; stats move to the cloud audit log (F-408).
- `quick_block` command had no `.catch()` → command removed; `toggle_overlay`
  - `toggle_extension` are the remaining keyboard commands, both try/catch.

### Tests

- `extension/src/shared/__tests__/SignalBatcher.test.ts` — IDB queue ordering,
  ack, prune, id sortability.
- `extension/src/surfaces/__tests__/AgentEventRouter.test.ts` — page-relevance
  filter for cross-platform vs URL-anchored events.
- `extension/src/surfaces/__tests__/CardBadge.test.ts` — verdict → DOM rendering,
  re-render replacement, clear semantics.
- `extension/src/capture/__tests__/PlatformCapture.test.ts` — title
  tokenization, brand/category extraction.

---

## [1.0.0] - 2026-03-16

### Added

- Core recommendation engine with 5-factor scoring (direct block, pattern match, graph affinity, context fit, recency)
- Memory system (Smriti) with three-tier architecture (working set, mid-term cards, core facts)
- Knowledge graph with entity relationships and affinity calculation
- 8 platform adapters (YouTube, Amazon, Instagram, Twitter/X, Facebook, eBay, Walmart, Generic)
- AI-powered agent chat with LLM support (Claude, GPT, Gemini) and regex fallback
- Commerce brain with product scoring, intent memory, and watchlist
- Proactive insights engine (extended research, cross-platform, decision fatigue, preference drift)
- 6-step onboarding flow with quick blocks and likes
- 13 unlockable achievements
- Dark/light theme with persistence
- Data export/import in Settings
- Privacy policy and landing page website
