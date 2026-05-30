# RecoMe — Full-Project Reality-Check Audit

**Date:** 2026-05-30
**Author:** Synthesis from five parallel critical-read agents (cloud, web, extension, docs, misc surfaces) + root config + git activity
**Supersedes:** [2026-05-14 Principal Audit](2026-05-14-principal-audit.md), [2026-04-07 Phase Audit](2026-04-07-phase-audit/PHASE_AUDIT_RECOME.md)
**Scope:** Every directory in the repo on `main` at commit `a778a15`

---

## 0. TL;DR

**The project is no longer a "9-month solo prototype dressed as a multi-surface product"** (the May-14 framing). Three rewrites since then changed the picture materially:

- **May 18:** Cloud rebuilt with real Neo4j + Qdrant + OpenAI + five working agents (Recall, Concierge, Curator, Decision, Curriculum) + IaaS surface + Stripe.
- **May 30 (this morning):** Extension rewritten from a 28k-LOC in-browser brain into a 5.4k-LOC capture-surface that talks to cloud. The four May-14 P0 security findings (deterministic encryption key, plaintext API-key fallback, stats race, unhandled `quick_block`) are resolved-by-deletion.
- **May 30 (this afternoon):** Onboarding pass (welcome card, sidebar hints, info panel) + auth bridge wired between popup, web `/login`, and `callback.html` + watchlist integration between Concierge and the `/ask` page.

What's _actually live and load-bearing today_ is the extension + cloud + web triad, with five real agents and ten production-shape web routes. What's still stub, stale, or aspirational is itemised in §3-6 below.

**The dominant remaining risk is now drift between docs and code, not phantom code.** The 2026-05-17 ADRs (0014 unique surfaces, 0004 roadmap, 0016 LLD) all predate the May-18 + May-30 rewrites and lie about what's shipped.

---

## 1. What we are actually doing

Per HLD §2.1 — and now matched by the code — RecoMe is:

> A personal interest graph (cloud Neo4j + Qdrant) fed by passive capture (browser extension + web paste + PWA share + IaaS `/v1`) and worked by five background agents (Recall, Concierge, Curator, Decision, Curriculum) whose emissions surface in-page (extension overlay, sidebar, proactive cards) and in-app (web `/ask`, `/inbox`, `/agents`).

Two business models share the same backend:

1. **Consumer** (JWT auth) — extension + web at `recome.app`. Freemium today.
2. **IaaS** (`rk_live_…` API keys) — `/v1/*` endpoints with tenant-scoped graphs and usage-metered billing. Foundation shipped, dashboard pending.

---

## 2. Quantitative snapshot

| Surface                                                | Status                           | LOC           | Recent commit           |
| ------------------------------------------------------ | -------------------------------- | ------------- | ----------------------- |
| `extension/`                                           | Shipping v2.0.0 today            | ~5,400 TS/TSX | `a778a15` 2026-05-30    |
| `cloud/`                                               | Live, 61 routes, 154 test files  | ~28,000+      | `d14f7b9` 2026-05-18    |
| `web/`                                                 | Live, 18 routes (16 user-facing) | ~7,000+       | `77bb843` 2026-05-30    |
| `mobile/`                                              | Scaffolding only                 | ~60K bytes    | `f762d6a` 2026-05-18    |
| `packages/{schema,utils}`                              | Live, consumed by extension      | ~500          | `bd…` 2026-05-14        |
| `docs/`                                                | Living + ADRs; ~2 weeks stale    | 1.7 MB        | `59fa2c1` 2026-05-17    |
| `pitch-site/`                                          | Marketing demos; mixed currency  | 772 KB        | 2026-03-31 / 2026-05-18 |
| `graveyard/2026-05-30-extension-rewrite/{brain,agent}` | Archived from this morning       | 884 KB        | 2026-05-30              |
| `store/` (CWS listing)                                 | **Stale at v1.2.0 copy**         | 20 KB         | 2026-03-16              |

---

## 3. What's shipped (production-ready)

### Cloud

- **Auth** (6 routes): JWT signup/login/refresh/logout + Google/GitHub/Facebook OAuth.
- **Intelligence** (9 routes): `/signals` (consumer ingest), `/trails`, `/trails/:topic`, `/intents`, `/mindmap`, `/personality` (GET/enable/disable/DELETE), `/audit-log`, `/audit-log/export`, `/score/cards`, `DELETE /me`.
- **Agents** (8 routes under `/intelligence/agents/*`): list, pause/resume per-agent, on-demand `run` with body event, per-agent `runs` audit, `budget`, watchlist CRUD; plus `/intelligence/inbox` (list/seen/feedback).
- **IaaS V1** (6 routes): `/v1/signals` tenant-scoped, `/v1/users/:externalUserId/trails|intents`, `DELETE /v1/users/:externalUserId`, `/v1/usage`.
- **Billing** (3 routes): Stripe webhook + sub queries + usage lookup.
- **Sync, Storage, Social/TasteTwin, Admin** (37 routes): legacy + admin surfaces; all production-shape.
- **Five agents** ([cloud/src/agents/](../../cloud/src/agents/)): Recall, Concierge, Curator, Decision, Curriculum — all real, all 0-LLM-token deterministic v1; Guardian enforces $0.10/day cost cap, quiet hours, per-agent throttle.
- **Persistence**: 43 Prisma models, all written/read; Neo4j + Qdrant + OpenAI all connect with retry + fail-fast at boot.

### Web (recome.app, Next 16)

- **Marketing**: `/`, `/extension`, `/privacy`, `/terms`, `/sdk` (the last is a placeholder labeled "Coming 2026").
- **Auth**: `/login` (email/password + OAuth + extension callback), `/signup`.
- **Logged-in primary**: `/dashboard`, `/inbox`, `/ask` (Advisor chat + Watchlist + Guardian audit), `/mind` (force-graph), `/agents` (operator console), `/audit-log`, `/personality` (opt-in Attention Mirror), `/paste`, `/settings`.
- **Server route**: `/api/extract` (CORS escape for URL metadata, SSRF-guarded, 1MB+8s caps).

### Extension (v2.0.0)

- **Capture pipeline**: 15 platforms (YouTube, Amazon, Reddit individually; 12 more in `SimpleCaptures.ts`); page-level dwell + URL/form search triggers; IDB queue with 72h TTL.
- **Background**: alarm-driven `SignalUploader` (30s flush, 100-batch chunks, 4xx-drop / 5xx-backoff), `InboxPoller` (2-min, browser-action badge), ~190-LOC message router.
- **In-page surfaces**: shadow-DOM right sidebar with Interest Graph + Agents + "Ask the agents" buttons, per-card scoring badges + reasoning callouts on Amazon/YouTube/Reddit/eBay, bottom-left InsightCard stack for AgentEvents, multi-turn Decision chat in shadow-DOM overlay.
- **Onboarding**: first-install welcome card (bottom-left), popup welcome panel (auto-dismiss when inbox populates), sidebar info button with "How RecoMe works" panel, demo topics in empty Interest Graph.
- **Tests**: 120 passing across SignalBatcher (IDB queue), CardBadge (DOM rendering), AgentEventRouter (page-relevance filter), PlatformCapture (tokenizer).

### Auth bridge end-to-end (wired today)

Extension popup → `recome.app/login?return=extension&ext_id=<id>` → user signs in → cloud returns tokens → web redirects to `chrome-extension://<id>/callback.html?token=…&refresh=…` → callback fires `LOGIN_WITH_TOKEN` → background stores via `AuthClient`, immediately drains queue + polls inbox → popup re-renders as Active.

---

## 4. What's partial / stubbed

| Item                              | Where                                                                                                               | What's missing                                                                                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Watchlist persistence**         | [cloud/src/agents/concierge/Watchlist.ts](../../cloud/src/agents/concierge/Watchlist.ts)                            | In-memory `Map`. Survives hot-reload, not process restart. Prisma model swap is ~20 LOC.                                                                                                                     |
| **CardScorer LLM polish**         | [cloud/src/intelligence/IntelligenceController.ts:220](../../cloud/src/intelligence/IntelligenceController.ts#L220) | `POST /intelligence/score/cards` is a deterministic topic-overlap scorer. Real LLM-polished scorer flagged TODO.                                                                                             |
| **MindMap clustering deps**       | [cloud/src/intelligence/MindMap.ts](../../cloud/src/intelligence/MindMap.ts)                                        | Imports `graphology` + `graphology-communities-louvain` — those packages were dropped from root `package.json` during the extension rewrite. Cloud still needs them; type errors.                            |
| **Concierge price vendor**        | [cloud/src/agents/concierge/PriceFetcher.ts](../../cloud/src/agents/concierge/PriceFetcher.ts)                      | Stub provider blocked in `NODE_ENV=production` unless `INTELLIGENCE_AGENTS_PRICE_VENDOR != stub`. Real vendor pick (Keepa / RainforestAPI / Amazon Affiliate API) is ADR-0017's open question.               |
| **Decision LLM streaming**        | [cloud/src/agents/decision/DecisionAgent.ts](../../cloud/src/agents/decision/DecisionAgent.ts)                      | Returns a single deterministic citation block. Client (extension OverlayChat, web /ask) animates with a typewriter. Real SSE streaming is Phase 4 follow-up.                                                 |
| **Curriculum cluster detection**  | [cloud/src/agents/curriculum/CurriculumAgent.ts](../../cloud/src/agents/curriculum/CurriculumAgent.ts)              | String-overlap "adjacent topic" detection. Will swap for shared Mind-Map cluster primitive (Louvain) once that's wired in cloud.                                                                             |
| **BullMQ worker fleet**           | n/a yet                                                                                                             | Concierge `scheduled` trigger + Curator 1×/day cron not yet wired. Today both fire on-demand from extension or manual `/run` POST. HLD §2.2 carves this out to its own Fly machine when queue depth demands. |
| **Web `/sdk` page**               | [web/src/app/sdk/page.tsx](../../web/src/app/sdk/page.tsx)                                                          | Placeholder labeled "Coming 2026". No OpenAPI spec, no key issuance UI.                                                                                                                                      |
| **Web `/api/extract` enrichment** | [web/src/app/api/extract/route.ts](../../web/src/app/api/extract/route.ts)                                          | Best-effort meta/og scraping. LLM topic enrichment flagged as next step.                                                                                                                                     |
| **`/admin` page**                 | [web/src/app/admin/page.tsx](../../web/src/app/admin/page.tsx)                                                      | Present in route table; full implementation depth not verified — likely operator-only thin wrapper over cloud `/admin/*`.                                                                                    |

---

## 5. What's stale / dead

| Item                                                | Where                                                                            | Verdict                                                                                                                                                                                                                                   |
| --------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`cloud/src/agent/AgentController.ts`** (singular) | [cloud/src/agent/](../../cloud/src/agent/)                                       | **Legacy stub** from before the real `agents/` plural directory existed. POSTs to `/agent/chat` return template replies + an in-memory conversation store. Should be archived; nothing should call it.                                    |
| **`mobile/`**                                       | [mobile/](../../mobile/)                                                         | **Scaffolding only**. Expo + React Native init; no platform bridging, no signal capture, no shipping build. ADR-0003 already pivoted to web-first. Either resurrect intentionally or graveyard.                                           |
| **`pitch-site/agents.html` + older demos**          | [pitch-site/](../../pitch-site/)                                                 | Mixed currency: `agents-demo.html` updated 2026-05-18 and reflects shipped agents; older `agents.html` + March demos reference ShopperAgent / ScoutAgent (the deleted brain agents). Marketing-site cleanup needed before next demo push. |
| **`store/STORE_LISTING.md`**                        | [store/STORE_LISTING.md](../../store/STORE_LISTING.md)                           | Describes v1.2.0 features ("achievements", "BYOK AI agents", "ShopperAgent"). **Must be rewritten before any Chrome Web Store submission of v2.0.0** — current copy would either get rejected or mislead users.                           |
| **`eslint.config.mjs`**                             | [eslint.config.mjs](../../eslint.config.mjs)                                     | Still globs `brain/src/**` and `agent/src/**` (those directories no longer exist on disk). Harmless but stale.                                                                                                                            |
| **`coverage/`**                                     | [coverage/](../../coverage/)                                                     | 2.8 MB of Jest output from 2026-03-16. Should be `.gitignore`-d.                                                                                                                                                                          |
| **`docs/audits/2026-04-07-phase-audit/`**           | [docs/audits/2026-04-07-phase-audit/](../../docs/audits/2026-04-07-phase-audit/) | 53 days old. Superseded by this document. Keep with a "superseded" header or move to `docs/archive/`.                                                                                                                                     |
| **`recome_interview_prep.md`**                      | [recome_interview_prep.md](../../recome_interview_prep.md)                       | 33 KB at root. Personal interview-prep doc; not project documentation. Should live outside repo (or in `docs/private/`).                                                                                                                  |

---

## 6. Security / hygiene issues found

1. **`creds.txt`** at repo root contains `demo@recome.local / demo1234!`. **Move out of repo** — even demo creds shouldn't live in version control. Use `.env.example`.
2. **`dist.pem`** at repo root is the Chrome Web Store signing private key. **Move to secrets manager** (1Password, Fly secrets, etc.) and `.gitignore`. Anyone who clones the repo can sign extension updates with it.
3. **`dist.crx`** (185 KB) is a checked-in compiled extension package. Should be a build artifact, not source.

These three should be the next commit after the audit lands.

---

## 7. What's missing / planned but not started

- **Stripe Meters integration** for IaaS usage-based billing (ADR-0003 §4 — `TenantUsage` counters live, daily Meters rollup pending).
- **PWA push for AgentEvent notifications** (ADR-0012 §10 open Q2 — VAPID setup outstanding; today everything goes to popup inbox + sidebar).
- **`docs.recome.app`** — public OpenAPI docs for IaaS callers (HLD §2.1; not yet built).
- **Personality Mirror "trajectory" surface** (ADR-0012 §8 deferred — composition shipped today, trajectory deferred until enough opted-in users to validate).
- **EU region deployment** (HLD §10 open #8 — triggered by first EU enterprise IaaS customer).
- **WatchlistAgent as its own Tier-2 agent** (ADR-0012 — today Concierge owns the Watchlist sweep; future split is per-roadmap).

---

## 8. Per-area highlights

### 8.1 Cloud (`/cloud`)

- 61 production routes across 9 controllers; 154 test files.
- **70 TypeScript errors** but **all in pre-existing controllers** (`admin/`, `tastetwin/`, `sync/`, `storage/`, `billing/`, `auth/`, `social/`) all sharing the same Hono `c.get('userId')` typing pattern. Cosmetic — nothing breaks at runtime. Fix is a single `Variables` interface + cast helper, ~50 LOC.
- Only one `TODO` marker in source: `IntelligenceController.ts:220` for the CardScorer LLM pass.
- Env-gated boot: `INTELLIGENCE_ENABLED=true` mounts `/intelligence` + `/v1` routes and inits Neo4j/Qdrant/OpenAI; `INTELLIGENCE_AGENTS_ENABLED=true` boots the registry. Both default false.

### 8.2 Web (`/web`)

- Next 16 + React 19 + Tailwind 4 + `react-force-graph-2d`. App Router throughout.
- All `/intelligence/*` consumers handle 401/404/501 gracefully ("Active agents are not enabled on this account").
- `authFetch()` in `web/src/lib/auth.ts` does automatic 401 → `/auth/refresh` → retry — same de-dup pattern as the extension's `AuthClient.ts`.
- Dual-palette theming (`globals.css` `:root` vs `[data-theme="light"]`) — both ship; toggle via `ThemeProvider`.

### 8.3 Extension (`/extension`)

- v2.0.0 manifest, MV3, 15 platforms, no LLM hosts in `connect-src`.
- One residual issue flagged by the audit agent: `host_permissions` in `manifest.json` still lists `api.anthropic.com`, `api.openai.com`, `generativelanguage.googleapis.com`. CSP `connect-src` correctly drops them, but the host permissions string is stale. **Fix before next CWS submission** — over-permissioned extensions get rejected.
- `Sidebar.ts` is 19.9 KB — largest surface file. Single-file is acceptable for now; if it grows further, split into Header / Panels / EmptyStates submodules.
- IDB upgrade path: bumped to v3, wipes old object stores. Existing v1.x installs would lose their queued signals on upgrade — acceptable for the v1→v2 break.

### 8.4 Mobile (`/mobile`)

- Expo + RN 0.76.7 + react-navigation 7. `App.tsx`, `package.json`, `tsconfig.json`, `src/`.
- No iOS/Android native code, no screens implemented, no platform-specific entitlements.
- **Decision needed**: resurrect (committing engineering time) or graveyard. Currently it's neither dead nor alive — drains brain time during status checks.

### 8.5 Docs (`/docs`)

- Architecture portfolio is well-structured (ADR discipline, INDEX, README), but content has drifted ~2 weeks.
- **ADR-0014 "Unique Product Surfaces" is the most damaging stale doc**: marks F-401 Mind Map, F-403 Concierge, F-404 Curriculum, F-406 Decision, F-407 Composition Report as "spec only" — all five have shipped code as of May 18 / May 30. A new engineer reading this would duplicate work.
- ADR-0004 Production Roadmap dates are now in the past (Phase 0 ended May 28; rewrite landed May 30).
- ADR-0016 LLD missing entries for `MindMap.ts`, `PersonalityMirror.ts`, `AuditLog.ts` (all May-18 additions).

### 8.6 Pitch-site (`/pitch-site`)

- `demos/agents-demo.html` and `demos/extension-demo.html` are the binding visual specs that the live extension matches (per the May-30 Phase 2 rebuild).
- Other demos and `agents.html` still reference deleted agent names (Shopper / Scout). Quick cleanup, not a load-bearing fix.

### 8.7 Misc

- `packages/{schema,utils}` are clean and consumed by extension. No orphans.
- `scripts/dev-local.sh` + `scripts/sync-version.js` work.
- `docker-compose.yml` is local dev (Postgres + Neo4j + Qdrant) with hardcoded `recome:recome` creds — fine for dev, not for prod.
- `public/callback.html` is the auth-bridge HTML and now matches the Phase-0 storage-key contract.

---

## 9. Top 10 risks (ordered by likelihood × blast radius)

1. **Docs lie about shipped surfaces.** ADR-0014's stale "Spec only" labels on five shipped surfaces. Onboarding hazard.
2. **`dist.pem` in repo.** Anyone with read access can sign and publish updates that look authentic. Move to Fly secrets.
3. **Watchlist persistence is in-memory.** Cloud restart loses all user watchlist items silently. Single-line fix: swap for Prisma.
4. **CWS store listing describes v1.2.0.** Any submission would either fail review or actively mislead users about the v2.0.0 surface.
5. **Cloud TypeScript errors not fixed.** 70 errors cosmetic, but accumulating; first real type bug they hide will be hours of debugging.
6. **Concierge price-vendor unmade.** `INTELLIGENCE_AGENTS_PRICE_VENDOR=stub` is the default; in prod Concierge will silently no-op until ADR-0017 lands.
7. **Mobile undecided.** Neither shipped nor archived. Mental tax on every status conversation.
8. **`extension/src/manifest.json` host_permissions over-permissioned.** Still lists 3 LLM hosts the extension never calls.
9. **Web `/admin` unaudited.** Operator-only surface; risk profile unknown without a careful read.
10. **No CI green-bar visible.** `.github/` directory exists but no `.github/workflows/*` shown by recent listings. PRs may be merging without automated typecheck/test gates.

---

## 10. Recommended next priorities

In order, smallest-leverage to largest:

1. **Today (1 hour total):**
   - Move `creds.txt` → `.env.example` + `.gitignore`.
   - Move `dist.pem` → secrets manager + `.gitignore` + rotate the key.
   - Remove `dist.crx` from tracked files (`.gitignore` `dist/`).
   - Fix extension `host_permissions` to drop LLM hosts.
   - Delete `eslint.config.mjs` globs for `brain/` and `agent/`.

2. **This week (~1 day):**
   - Rewrite `store/STORE_LISTING.md` for v2.0.0.
   - Update ADR-0014 §1 status column (all five "Spec only" → "Shipped").
   - Update ADR-0004 roadmap dates + state.
   - Update ADR-0016 LLD §2 to mention MindMap, PersonalityMirror, AuditLog modules.
   - Decide on `mobile/`: resurrect with a 1-month plan or move to `graveyard/`.

3. **Next sprint (~3 days):**
   - Fix the 70 cloud TS errors (single Hono `Variables` interface).
   - Swap Watchlist `Map` → Prisma model.
   - Restore `graphology` deps in cloud `package.json` for MindMap clustering.
   - Wire CI: `.github/workflows/ci.yml` running typecheck + tests on push.

4. **Phase-3 follow-on (~2 weeks):**
   - Decide ADR-0017 price vendor; wire real PriceFetcher.
   - Stripe Meters daily rollup for IaaS billing.
   - Public OpenAPI spec → `docs.recome.app`.
   - PWA push (VAPID) for AgentEvent notifications.

---

## 11. Appendix — `graveyard/2026-05-30-extension-rewrite/`

Two packages were moved here this morning during the extension rewrite:

- **`brain/`** — the former in-extension multi-agent runtime: FilterAgent, ScoutAgent, ShopperAgent, AdvisorAgent, SocialAgent, GuardianAgent, plus KnowledgeGraph, MemoryService, RecommendationEngine, CommerceScorer, PreferenceSynthesizer, AffinityCalculator, ToolExecutor (the famously-empty registry from the May-14 audit), and a Brain orchestrator. ~30 source files, ~15k LOC.

- **`agent/`** — the in-extension agent facade the extension consumed via `getAgent()`: AIChatEngine, ConversationMemory, CompareService, RetrievalService, InsightDetector + InsightStore, WatchlistService, LLMClient + PromptBuilder. ~15 files.

Both packages are **orphaned in the live tree** (verified zero imports of `@brain`, `@agent`, `@intelligence`, `@data` in `extension/`, `web/`, `cloud/`, `mobile/`). They're kept in `graveyard/` per the May-14 audit's "move, don't delete" discipline so git history + the code itself remain inspectable.

**Status:** archival reference only. No live consumer. The full Q&A on whether to delete or re-use is in §12.

---

## 12. Re: graveyarded brain/ and agent/ — are we ever going to use them?

(This was the explicit follow-up question.)

**Short answer:** No. Nothing in `web/`, `mobile/`, or any near-future plan needs them. They stay in `graveyard/` as reference, not source.

**Long answer:** Every meaningful piece of `brain/` and `agent/` has been re-implemented in `cloud/` with a different (and better-supported) architecture:

| Old (graveyard)                       | New (cloud)                                                              | Why the new one wins                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `brain/agents/ShopperAgent`           | `cloud/src/agents/concierge/ConciergeAgent.ts`                           | Real Neo4j + real PriceFetcher + Stripe-funded LLM (vs BYOK) + Guardian-enforced cost cap |
| `brain/agents/ScoutAgent`             | `cloud/src/agents/curator/CuratorAgent.ts`                               | Real content-source adapters + scheduled trigger + dedupe via Postgres                    |
| `brain/agents/SocialAgent`            | `cloud/src/agents/recall/RecallAgent.ts`                                 | Real cross-session Cypher recall vs in-memory ring buffer                                 |
| `brain/agents/AdvisorAgent`           | `cloud/src/agents/decision/DecisionAgent.ts`                             | Cites real trail; multi-turn via overlay/web chat                                         |
| `brain/agents/GuardianAgent`          | `cloud/src/agents/GuardianAgent.ts`                                      | Enforces real $0.10/day cap from `AgentRun.costMicros` aggregate                          |
| `brain/agents/FilterAgent`            | `cloud/src/intelligence/CardScorer` (TODO) + score/cards endpoint        | Cross-tab, cross-session, cloud-grounded                                                  |
| `brain/graph/KnowledgeGraph`          | `cloud/src/graph/Neo4jClient` + `GraphRepository`                        | Real graph DB vs hand-coded DFS                                                           |
| `brain/memory/*`                      | Neo4j Signal nodes + Qdrant vectors                                      | Durable + searchable + per-user namespace                                                 |
| `brain/recommendation/*`              | `POST /intelligence/score/cards`                                         | Server-side scoring with reasoning                                                        |
| `brain/commerce/tracking/Price*`      | `cloud/src/agents/concierge/PriceFetcher.ts` + `tools.ts`                | Same shape, real (planned) vendor backing                                                 |
| `brain/extraction/RuleBasedExtractor` | Inline in `cloud/src/intelligence/SignalIngestion.ts`                    | Tied to canonical signal-ingest pipeline                                                  |
| `brain/tools/ToolExecutor` (empty)    | `cloud/src/agents/<agent>/tools.ts` (real)                               | The thing that made the May-14 audit call brain/ "theatre" is fixed                       |
| `agent/chat/AIChatEngine`             | `DecisionAgent` + extension `OverlayChat.ts` + web `/ask`                | Streaming-feel via cloud, no LLM key in browser                                           |
| `agent/llm/LLMClient + PromptBuilder` | `cloud/src/vector/OpenAIEmbeddings.ts` + direct Claude calls server-side | Stripe-funded, audited, single source of truth                                            |
| `agent/insights/*`                    | `cloud/src/agents/AgentEventStore.ts` + `AgentRunner.ts`                 | Audit-logged in Postgres `AgentRun`/`AgentEvent`                                          |
| `agent/watchlist/WatchlistService`    | `cloud/src/agents/concierge/Watchlist.ts` (stub) → web `/ask` UI         | Cross-device, server-driven                                                               |
| `agent/retrieval/RetrievalService`    | `cloud/src/intelligence/ResearchTrail.ts`                                | Real Cypher trails with explainStrength                                                   |

**Architectural reason it cannot come back:** HLD §11 explicitly rejects "synchronous LLM calls on the capture path" and §1 says "Recome does not depend on any LLM model provider for the existence of the graph; the graph is durable in Neo4j." Both old packages violate both principles — they're in-browser LLM clients reading in-memory graphs.

**Could mobile use them?** No. When `mobile/` ships, it should follow the same pattern as `web/`: thin client that hits the cloud. The HLD/ADR-0003 web-first pivot specifically rules out heavy on-device intelligence for non-extension surfaces.

**Could anything be salvaged as reference?** A few patterns are worth a one-time read before deletion:

- `brain/extraction/RuleBasedExtractor.ts` — if we ever ship a client-side fallback extractor for very-low-bandwidth mobile use, the rule patterns there are a starting point.
- `agent/llm/PromptBuilder.ts` — if a future BYOK consumer ever ships (against HLD), the prompt shapes were thoughtful.
- `brain/memory/PatternDetector.ts` — the "pattern emerges after N similar signals" logic is similar to what a cloud-side aggregator would do at signal-ingest time.

None of these are urgent enough to pull back out. Keeping `graveyard/` checked in lets future-us `git log` the design history without resurrecting dead code into the build graph.

**Recommendation:** leave it in `graveyard/` indefinitely. It costs ~880KB of disk and zero build time. If in 6 months no one has cited it, delete in a "graveyard cleanup" commit. Today it's cheap insurance.

---

## 13. Closing

The May-14 audit asked a sharp question: _"will this product become real?"_ As of May 30, the answer is "the core triad already is real" — extension v2.0.0 ships today, cloud has real agents on real data, web has 10+ production-shape routes wired to all of it. The remaining work is mostly **honesty about what's shipped** (docs catch-up, store listing rewrite) and **the cost-vendor + persistence stubs** (watchlist Prisma model, Concierge price API) before the cost ceiling NFRs from HLD §4 stop being aspirational.

**Net delta vs the May-14 audit:** four of four P0s resolved, brain/agent vaporware archived, extension rewritten clean, web `/ask` + `/agents` operator console wired, auth bridge working end-to-end. The product is no longer dressed as more than it is.

Next month's audit will probably be about cost discipline + the BullMQ carve-out, not about correctness.

---

**End of audit. See §10 for ordered priorities.**
