# RecoMe — Product Definition (Single Source of Truth)

**Status:** Canonical for product direction. Created 2026-08-09.
**Precedence:** the user's explicit decisions → this document → [VISION.md](VISION.md) (ideology & positioning) → `architecture/` ADRs (technical decisions) → code comments. If code contradicts this doc, the code is either ahead (update this doc) or wrong (fix the code) — never silently either.
**Change protocol:** direction changes land here first, in a PR that also updates the roadmap section. Architecture-shaped changes get an ADR; this doc links it.

---

## 1. North star

**One-liner:** RecoMe captures what you actually paid attention to across the web, structures it into an interest graph you control, and puts that graph to work — for you through background agents, and for developers through an API.

**Category:** Personal Attention Infrastructure. **Thesis:** _the chat isn't the product; the personal interest graph is._ Full ideology, moats, and banned vocabulary: [VISION.md](VISION.md) and [architecture/0013-competitive-positioning.md](architecture/0013-competitive-positioning.md).

**North-star metric — Returned Attention Rate (RAR):** acted-on agent emissions per weekly active user per week (open / save / thumbs-up on an inbox event, insight card, or badge). This is the only metric that proves the graph is real: it measures _the product giving attention back_. Everything else is diagnostic.

**Guardrail metrics (never trade RAR against these):**

- LLM cost ≤ $0.10/user/day (Guardian-enforced, [GuardianAgent.ts](../cloud/src/agents/GuardianAgent.ts))
- Agent pause rate < 10% of WAU (pausing = we annoyed someone)
- Data deletion rate (full-account `forgetUser`) < 2%/month
- Signal loss in the capture→graph pipeline: 0 by design (see Defect register)

**Product principles:**

1. **Graph before chrome.** Any feature that doesn't read from or write to the graph is suspect.
2. **Deterministic first, LLM as a dial.** Every agent must produce a useful deterministic output at $0; LLM synthesis upgrades prose and reasoning behind the Guardian cap. We are margin-positive at today's inference prices and get smarter as prices fall.
3. **Proactive over conversational.** The default surface is something brought to you, cited, in context — not an empty chat box.
4. **Every emission cites its signals.** No black-box output, ever.
5. **Recommend, never act.** No irreversible action on the user's behalf. Concierge never clicks Buy.
6. **Capture must be boring.** Thin clients, no intelligence or keys in the browser, graceful when offline, silent when ineligible ([PageEligibility.ts](../extension/src/content/PageEligibility.ts) is load-bearing product surface, not plumbing).
7. **Honest by construction.** No invented data in real widgets, no aspirational claims in listings, no metric theater. Demo/empty states are visibly labeled.

---

## 2. Users and jobs

| Persona                       | Who                                                                         | Job-to-be-done                                                                                                | Primary surfaces                              | Pays via           |
| ----------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------ |
| **Riya** (consumer primary)   | 28, designer, researches purchases and hobbies across YouTube/Amazon/Reddit | "Don't let my research evaporate. Bring me the price move, the thread I forgot, the thing I was deciding on." | Extension in-page cards, inbox, web dashboard | Consumer Pro       |
| **Aman** (consumer secondary) | 22, CS undergrad, learns across YouTube/Coursera/docs                       | "Turn my scattered learning into a track. Tell me what to read next based on what I actually read."           | Curriculum agent, mind map, PWA               | Free → Pro         |
| **Maya** (developer primary)  | 31, engineer at a Series A consumer app                                     | "My app cold-starts on every user. Give me structured interests for _my_ users with one API call."            | `/v1` API, developer dashboard, OpenAPI docs  | IaaS metered plans |

Anyone else is a happy accident. Features that serve none of these three don't get built.

**The IaaS data boundary (product law):** Maya's tenants query graphs built **only from signals her own app submitted** (tenant-namespaced users, [tenantUserId.ts](../cloud/src/iaas/tenantUserId.ts)). Consumer graphs are never queryable by tenants. There is no cross-side data access and no cross-user training. The far-future consumer-grants-access model is Horizon (§6) and will be opt-in OAuth per app, per scope — never a default.

---

## 3. The system model

```
CAPTURE            →  GRAPH                 →  AGENTS                →  SURFACES
extension (MV3)       Neo4j: User/Topic/       Recall · Concierge       in-page badges + cards
PWA share-target      Entity/Page/Session/     Curator · Decision       sidebar · overlay chat
mobile share sheet    Signal, EWMA intents     Curriculum (+Synthesist  inbox (web/PWA/push)
paste/import          Qdrant: embeddings       planned) — all through   dashboard · mind map
                                               the GUARDIAN gate        /v1 developer API
```

Layer contracts (each layer may rely on these and nothing more):

- **Capture → Graph:** signals matching [schemas.ts](../cloud/src/intelligence/schemas.ts)`#signalSchema`; at-least-once delivery; client queues ≤72h offline. _The platform enum in cloud MUST be a superset of client platforms — see Defect D1._
- **Graph → Agents:** typed reads (trails, intents, entities, sessions); agents never touch raw DOM payloads.
- **Agents → Surfaces:** `AgentEvent` emissions with citations; surfaces render, never re-rank.
- **Guardian wraps every agent run:** opt-in check, throttle, quiet hours, daily cost cap. No agent code path bypasses it.

---

## 4. Product pillars — current state and target state

Each pillar lists: **Now** (verified against code 2026-08-09), **Next** (committed, roadmap-scheduled), **Future** (directional, specified enough to build).

### P1 · Capture

**Now:** MV3 extension with per-platform extractors for 15 platforms (Amazon/YouTube/Reddit substantial; most others single-selector; Facebook/Instagram/TikTok fragile and default-off). Two signal kinds emitted: `view` (10s dwell) and `search`. IndexedDB outbound queue, 30s batch upload. PWA share-target (`/paste`) live; Android share intent live; iOS share extension is a documented Xcode scaffold.
**The mobile capture pyramid (decided 2026-08-10):** most people live in mobile apps, where passive third-party capture is impossible by OS design — and the workarounds (accessibility-service abuse, VPN sniffing) are trust poison we will never touch. On mobile, the capture surface is not the device; it is the platforms' own record of the user's activity, granted by the user. Channels, ranked by signal-per-user-effort:

1. **OAuth connectors** (connect once, zero effort after) — server-side polling of official APIs (Spotify listens, Reddit saves, YouTube likes/subscriptions) mapped into ordinary signals through the same ingestion pipeline. The strategic unlock for mobile-first users; scheduled R3.
2. **Takeout imports** (one upload, retroactive) — years of history from platform export files; the cold-start killer. Pairs with connectors: import backfills, connector keeps it current.
3. **Share sheet** (one tap, in-the-moment) — an explicit share from any app is a STRONGER signal than passive dwell, not a consolation prize. Android live; iOS is an hour of Xcode from done.
4. **Email ingest** (set up once) — newsletters + purchase receipts; gated on the notification pref-center (P6).
5. **PWA /paste** (manual) — live.
6. **iOS Safari Web Extension** (install once) — mobile-browser capture; our MV3 code ports. Post-launch.

Also structural: every `/v1` tenant app is a mobile capture channel — distribution is capture (the dual-sided flywheel on mobile).

**Next:**

- Fix batch-poisoning drop (Defect D1) so all 15 platforms actually land.
- iOS share extension: complete the prebuild + Xcode target flow; ship in TestFlight.
- Capture QA harness: per-platform fixture pages + selector health telemetry so a platform redesign is detected within a day, not discovered by silence.
  **Future:**
- **OAuth connectors v1 (R3):** Spotify + Reddit first (friendly APIs, exactly Aman's platforms), YouTube after. New cloud connector service: provider OAuth + encrypted token storage + refresh, BullMQ polling workers within provider rate limits, per-provider signal mapping. Connector events are ordinary signals — agents never know the source. Security surface (token custody, scope minimization, revocation) gets a design doc before code.
- **Imports v2 (R3, with connectors):** Google Takeout (YouTube history), Netflix, Amazon orders as a web/PWA upload surface per HLD §3. Each import is a batch of ordinary signals through the same pipeline — no special-case graph writes.
- **Explicit signals:** ✅ _Shipped 2026-08-10._ “More like this / Not for me” actions on card badges emit `boost`/`block` signals targeting the card's matched graph topics (CardScorer now returns `matchedTopics`; feedback only ever targets real topics). Server made both edges real: BLOCKS already excluded topics from intents; BOOSTS was write-only and now lifts ranking (+0.25 effective strength in `getTopIntents`). Immediate FLUSH_NOW so the sidebar updates in seconds. Also fixed en route: the claim-filter reason falsely credited GuardianAgent.
- **Email newsletter capture** (forward-to-address ingest) — high signal density for learning/finance interests. Requires its own eligibility rules; not before Trust §P6 push/pref-center work.

### P2 · The Interest Graph

**Now:** Neo4j graph (6 node labels, EWMA-weighted `HAS_INTENT` edges) + Qdrant embeddings written on ingest. Extraction is regex categories + a 39-brand hardcoded list; the graph is honestly a weighted bag of title tokens today. Vector store is write-only.
**Next:**

- **Semantic ingest v2:** LLM entity extraction on ingest (batched, cost-classed as ingest-budget separate from the per-user agent cap; target < $0.005/signal at current prices). Output: typed entities (product, brand, creator, concept) with confidence, replacing the brand list. Eval set before rollout: 200 labeled pages across 5 platforms, precision ≥ 0.85 on entities.
- **Vector read path:** related-trail retrieval and near-duplicate collapse via Qdrant (powers Recall quality and Curator dedupe).
  **Future:**
- **Cross-platform linking:** the YouTube-review → Amazon-PDP join (v1's killer demo, rebuilt server-side on real entities). Emits a `research_trail` event Concierge and Decision consume.
- **Decay & lifecycle:** interests cool over time (v1's three-tier memory concept, reborn as edge-weight decay + archived status in the graph — no separate memory store).
- **Graph portability:** user-facing full-graph export in a documented JSON schema. Precondition for the Horizon portability story and an honest trust feature now.

### P3 · Agents

**Now:** five registered agents + Guardian gate. All deterministic (0 LLM tokens): Recall (real Cypher over aged signals — the most genuine), Concierge (real logic, stub price vendor, refuses to run in prod), Curator (stub content fixtures), Decision & Curriculum (self-labeled template stubs). SSE streaming transport works end-to-end. A "Synthesist" agent is referenced in two UIs but not registered.
**Next:**

- **Decision agent, real:** ✅ _Code shipped 2026-08-09, flag off._ LLM synthesis over the user's trail ([llm.ts](../cloud/src/agents/llm.ts) + [DecisionAgent.ts](../cloud/src/agents/decision/DecisionAgent.ts)): graph facts in the system prompt, all client input fenced `<untrusted>`, bounded history, streaming with measured token usage landing in the Guardian ledger, deterministic fallback on any provider failure. Behind `AGENTS_LLM_ENABLED` (default off). **Eval set landed 2026-08-09**: 20 scripted trails asserting must-cite/must-not-cite topics, the 3-citation cap, system-turn grounding, and untrusted-fence integrity on every case (`DecisionAgent.eval.test.ts`, runs in CI). Remaining before prod flag-on: one manual spot-check of the same cases against the live model (costs tokens; not a CI job).
- **Curator, real sources:** ✅ _Shipped 2026-08-10._ `RssContentSource` (Google News RSS per topic — keyless, real URLs, 20-min TTL cache, hard timeout, size cap, never-throw) behind `INTELLIGENCE_AGENTS_CONTENT_SOURCE=rss`; plus the missing prod guard — Curator now refuses to run in production on the stub, same law as Concierge (fabricated URLs must never reach a real inbox). 10 tests. YouTube Data API vendor remains v1.1.
- **Concierge, real prices:** activate Keepa behind [KeepaPriceFetcher](../cloud/src/agents/concierge/) per ADR-0017; until the license lands, Concierge stays prod-disabled (correct current behavior — never fake a price).
- **Register or remove Synthesist from UI** (see Next release; we register it).
  **Future:**
- **Synthesist** (weekly): one Sunday emission synthesizing the week's graph deltas — new interests, cooled interests, open decisions — feeding the email digest and a pinned inbox card. Deterministic skeleton + LLM prose polish.
- **Curriculum v2:** real spaced sequencing from Curator's sources + user pace signals, replacing the string-overlap template.
- **Agent roster law:** new agents must (a) read the graph, (b) emit cited events, (c) pass Guardian, (d) have a deterministic $0 mode, (e) ship with an eval set. Roster stays ≤ 7 visible agents; consolidation beats sprawl.

### P4 · Consumer surfaces

**Now:** in-page badges/cards on 4 platforms, sidebar (renders invented demo topics in the real widget — Defect D4), overlay chat (multi-turn visually, but history never sent — D5), web app (dashboard, mind map, ask, inbox, personality mirror, audit log), installable PWA. Extension popup is built but unreachable (D3); push subscriptions stored but never delivered (D6); email digest wired but keyless.
**Next:** fix D3–D6 (decisions recorded in §7); wire push delivery on `AgentEventStore.insert`; ship digest with a real Resend key and a preference center (per-agent, per-channel opt-outs) — notification trust is a product feature, not ops.
**Future:**

- **Surface adapters beyond 4 platforms:** Walmart + Coursera shipped 2026-08-10 (6 total) with a DOM-contract fixture harness — each surface's supported DOM is written down as a test, so a platform redesign fails loudly in CI instead of dying silently. LinkedIn next.
- **Mind map time-scrub** (deferred P5.2) — replay your attention over time.
- **Per-row audit deletion** (deferred P5.4) — delete a single signal and its downstream traces.
- **Weekly review ritual:** Synthesist card + 3-tap interest confirmation ("still deciding / done / not interested") — the highest-quality explicit signal source we can build.

### P5 · Developer platform (IaaS)

**Now:** `/v1` API (signals in, trails/intents out, GDPR delete), OpenAPI + Swagger at `/v1/docs`, hashed `rk_live_/rk_test_` keys, tenant quotas enforced, developer dashboard, Stripe Meters rollup — **revenue-inert**: nothing sets a tenant's plan or Stripe customer (D7); live/test keys share one namespace; `ApiKey.scopes` unused; `/sdk` marketing page describes an SDK that doesn't exist (D8).
**Next:** tenant plan upgrade + Stripe customer wiring (first billable tenant); separate test-key namespace; make the `/sdk` page honest (quickstart + curl + OpenAPI until a real SDK exists).
**Future:**

- **Official TypeScript SDK** (thin, generated from the OpenAPI spec, published `@recome/sdk`).
- **Webhooks:** push agent-events and trail-updates to tenant endpoints (signed, replayable) — turns the API from pull to push and doubles metered surface.
- **Key scopes:** activate `ApiKey.scopes` (read-only keys, ingest-only keys) — table stakes for design partners' security reviews.
- **Design-partner program:** 5 named partners on STARTER+, hand-held; their integration pain is the API roadmap.

### P6 · Trust, privacy, safety

**Now:** the five binding constraints (citation / recommend-only / pause / audit+GDPR cascade / $0.10-day cap) are real in code. PageEligibility gating, chat-app denylist, incognito skip, no third-party telemetry. Gaps: rate limiter runs before auth so tier/tenant limits never apply (D2); `notifications` permission requested but unused; plaintext refresh token in `chrome.storage.local` (accepted MV3 trade-off — document it, don't pretend otherwise).
**Next:** fix D2; drop the unused permission; publish a plain-language data page ("what leaves your device, what we store, how to delete it") linked from store listing and onboarding.
**Future:** SOC 2 readiness when design partners require it (not before); key rotation + secret-manager hygiene for cloud; abuse/rate design review before webhooks ship.

### P7 · Monetization

**Now in code:** consumer Stripe subscriptions (FREE/PRO/PREMIUM tiers exist end-to-end); IaaS quotas FREE 1k/10k → STARTER 100k/1M → PRO 1M/10M → ENTERPRISE, metered via Stripe Meters (once D7 lands). Doc prices: STARTER $49, PRO $499.
**Decisions pending (owner: founder — recommendations in §7):** consumer price points; what exactly gates Free vs Pro.
**Recommended model:** Free = capture + Recall + weekly Synthesist (the graph grows, the habit forms). Pro = full agent roster + push + imports + mind-map history. Premium = higher Guardian budget + early features. The paid line is _agents working for you_, never _your data held hostage_ — export and delete are free forever.

---

## 5. Roadmap

Sequenced releases with exit criteria. No dates until R1 is done and velocity is known; order is the commitment.

**Production milestone 2026-08-11:** the full stack is LIVE — Fly Postgres/Neo4j/Qdrant/Redis, intelligence enabled, all six agents booted, BullMQ schedules registered (Curator daily, Concierge 6h, Synthesist Sun 13:00 UTC, rollup, digest), signals→graph→trails verified end-to-end in prod. `AGENTS_LLM_ENABLED` remains off: the live-model spot check is blocked on OpenAI credits (`credit_balance_exhausted`) — top up at platform.openai.com, rerun spot check, then flip the flag.

### R1 — Truthful Core (current)

Everything the demo and diligence touch is real or clearly labeled.

- Fix D1 (batch poisoning + platform enum), D2 (rate limiter), D4 (demo data labeled), D5 (chat history sent).
- Decision agent real (LLM + citations + evals + injection tests). Curator real sources. Synthesist registered (deterministic v1) so no UI references a ghost.
- Decide + execute D3 (popup) per §7.
- **Exit:** end-to-end demo on a fresh account — browse → graph → real cited agent output in-page and in inbox — with zero known silent-data-loss defects. `npm run validate` + cloud checks green in CI.

### R2 — Launch

> Operational breakdown with founder actions + build order: [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) (created 2026-08-11).

- Chrome Web Store listing live (screenshots produced, claims audited against this doc). Onboarding: sign-in → first-capture → first-Recall within 10 minutes of install.
- Push delivery + digest live with preference center. Consumer Pro purchasable. iOS share extension in TestFlight — share-sheet capture is the mobile story at launch (capture pyramid tier 3).
- **Exit:** installable by a stranger; first 100 external WAU; RAR baseline measured.

### R3 — The Graph Gets Real

- Semantic ingest v2 (LLM entities + eval gate). Vector read path. Cross-platform linking v1 (YouTube↔Amazon). (Explicit boost/block signals shipped early, 2026-08-10.)
- **Mobile capture tier 1–2:** OAuth connectors v1 (Spotify + Reddit) and Takeout imports — a mobile-first user with zero extension installs gets a real, growing graph.
- Concierge live if Keepa license landed; otherwise stays honest-off.
- **Exit:** RAR up ≥ 50% over R2 baseline on cohort comparison; entity precision ≥ 0.85 on the eval set.

### R4 — Platform

- Tenant billing live (D7), test-namespace split, TS SDK, first webhooks, key scopes. 5 design partners, ≥ 2 on paid plans.
- **Exit:** first metered IaaS revenue; a partner integration built without hand-holding, using docs alone.

### Horizon — future possibilities (directional, not committed)

Options we are building _toward_, not building _now_. Each lists the precondition that unlocks it; none may jump the roadmap without a PR to this section.

**H1 — Natural extensions (post-R4, high conviction):**

- **The graph as agent memory — MCP connector.** Expose the user's own graph to any AI assistant via an MCP server ("RecoMe connector" in Claude/ChatGPT/agent IDEs): the assistant queries _your_ trails and intents, with your consent, per conversation. This is the fastest route to "personal context layer for the agentic web" and turns the labs' assistants from competitors into distribution. Precondition: key scopes (R4) + consent UX. Risk: none of substance — read-only, user-keyed, revocable.
- **User-granted graph access (OAuth).** Consumer grants a third-party app scoped read access to slices of their graph — the full portability endgame, and the moment "your data works for you anywhere" becomes literal. Precondition: scopes, consent UX, regulatory review. This is the consumer twin of the tenant API and must never be a default-on.
- **Open interest-graph schema.** Publish the graph schema + export format as a documented open spec. Interoperability is a moat for the _first_ mover with density: every tool that reads our format increases switching cost to leave the ecosystem, not the product.
- **Vertical packs.** The same graph, packaged per job: RecoMe for job search (Indeed/Glassdoor/LinkedIn capture + Curator on postings), for learning (Curriculum-led), for travel planning. Packs are curation + agent presets, not new engines — near-zero marginal engineering, clean marketing wedges.
- **Household graphs.** Shared research spaces for multi-person decisions (a couple buying a car, a family planning a trip): explicit per-trail sharing into a joint space, never account merging. Precondition: per-row audit deletion (P5.4) so sharing is reversible at signal granularity.

**H2 — Big swings (real optionality, higher risk):**

- **Decision copilot.** The graph knows when you're _deciding_ (repeated comparisons, price checks, review reading). Decision agent evolves into a purchase/commitment copilot: assembles your own evidence, names the open questions, tells you when you already decided and are just re-reading reviews. This is the feature normal people would describe to a friend. Risk: must stay recommend-only and regret-minimizing, never conversion-optimizing.
- **Consented commerce referrals.** Concierge recommendations carry affiliate links — a revenue line with zero data sale. Product law if we ever do it: ranking and verdicts are provably unaffected by commission (deterministic scorer, disclosed per-link, Guardian-audited), or we don't do it at all. This is the highest-margin and highest-trust-risk item in the doc; it ships only after RAR proves users trust Concierge, and reverts instantly if pause-rate moves.
- **AI-browser partnerships.** Arc/Dia/Comet-class browsers need exactly what we build and don't own capture history outside their walls. Position the capture pipeline + graph as the memory layer an AI browser embeds (OEM/licensing). Precondition: the open schema + SDK maturity; this is a BD play, not an engineering one.
- **Agent-to-agent serving.** Tenant and consumer agents query graphs over emerging A2A/agent-protocol standards — the IaaS API's next interface, same data boundary laws. Watch the standards; adopt when one wins, don't bet early.
- **Local/edge inference.** Capture-side extraction on small local models as they become viable — reduces ingest cost toward zero and strengthens the trust story. Adopt when a small model passes the P2 entity eval set on-device.

**Explicitly not chasing (adjacent, tempting, no):** enterprise work-graphs (Glean's ground — different buyer, different data, sales-led motion we shouldn't fund); ambient/wearable capture (Limitless's ground — consent model is unsolved and poisons the trust story); a general-purpose assistant or browser of our own (the labs' ground — we are the layer they all need, not a competitor to their chat). These are non-goals with a reason attached; revisit only if the reason dies.

---

## 6. Defect register (as of 2026-08-09 — fix, don't build around)

| ID  | Defect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Where                                                                                                                                                       | Scheduled   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| D1  | ~~Signals from 5 platforms fail cloud validation; uploader acks-and-drops the entire ≤100 batch~~ **Fixed 2026-08-09**: platform enum is now a client superset; per-item batch ingest (`ingestBatch.ts`) with `rejected`/`retryable` semantics on both `/intelligence` and `/v1`; uploader drops only server-rejected signals; tenants billed on accepted signals only                                                                                                                                                                                                                | [ingestBatch.ts](../cloud/src/intelligence/ingestBatch.ts) · [SignalUploader.ts](../extension/src/background/SignalUploader.ts)                             | ~~R1~~ Done |
| D2  | ~~Global rate limiter runs before auth → tier/tenant limits never apply~~ **Fixed 2026-08-09**: layered limiting — coarse per-IP guard pre-auth (kept deliberately for abuse/brute-force, stricter scope on `/auth`), tier-keyed per-user on `/intelligence`, plan-keyed per-tenant on `/v1`; fails closed if mounted without auth context                                                                                                                                                                                                                                            | [rateLimiter.ts](../cloud/src/middleware/rateLimiter.ts)                                                                                                    | ~~R1~~ Done |
| D3  | ~~React popup built, bundled, unreachable~~ **Resolved 2026-08-10 per §7 decision: popup deleted** (archived in graveyard/2026-08-10-popup-removal). dist/ no longer ships popup.html/popup.js/vendor.js — React is out of the extension bundle. `_execute_action` description made honest ('Open RecoMe (web app)'); dead `quick_block` command and unused `notifications` permission removed; dead `@ui`/`@popup` webpack aliases dropped                                                                                                                                           | [webpack.config.js](../webpack.config.js)                                                                                                                   | Done        |
| D4  | ~~Sidebar renders invented demo topics inside the real widget~~ **Fixed 2026-08-09**: example rows carry an explicit "Example preview — not your data" badge; the leaked `INTELLIGENCE_AGENTS_ENABLED` env-var string in the agents empty state replaced with user-facing copy                                                                                                                                                                                                                                                                                                        | [Sidebar.ts](../extension/src/surfaces/Sidebar.ts)                                                                                                          | ~~R1~~ Done |
| D5  | ~~Overlay chat never transmits history; citations parsed then discarded~~ **Fixed 2026-08-09**: bounded history (last 10 turns, 500 chars each) travels with every request; agent answers are written back into the history array (they previously stayed "Thinking…" forever); citations render as "From your graph" chips; skip/capped stream metas render friendly copy instead of double-running the fallback                                                                                                                                                                     | [OverlayChat.ts](../extension/src/surfaces/OverlayChat.ts)                                                                                                  | ~~R1~~ Done |
| D12 | ~~`/decision/stream` bypassed Guardian and recorded no AgentRun — an uncapped-spend side door once LLM landed~~ **Fixed 2026-08-09** (found during LLM work): stream route now runs the same Guardian pre-check and lands usage in the AgentRun ledger the cost cap reads                                                                                                                                                                                                                                                                                                             | [AgentController.ts](../cloud/src/agents/AgentController.ts)                                                                                                | Done        |
| D13 | Web token-rename fallout **fixed on public surface 2026-08-09**: `bg-[var(--ink)]` painted a white navbar over the dark hero; `bg-white text-[var(--ink)]` made CTAs invisible; dead Chrome-store links. Public pages rebuilt token-driven (`.btn-*`/`.card`/`.eyebrow` in globals.css, new home + /sdk + chrome). Web lint debt cleared 2026-08-09 (auth gates moved to a shared `useAuthed`/`useAuthGate` external-store hook, ThemeProvider rebuilt on the same pattern, all 7 errors + 3 warnings gone — eslint fully clean). Remaining: authed app pages keep old visual styling | [web/src/app/globals.css](../web/src/app/globals.css)                                                                                                       | R1/R2       |
| D6  | ~~Push subscriptions collected, delivery never wired~~ **Fixed 2026-08-13**: every non-deduped agent emission fans out to the user's active push subscriptions (fire-and-forget, warn-on-failure); VAPID keys live on Fly. The preference center (digest GET/PUT, settings sections, push toggle) already existed — it was unreachable until intelligence went live. `digestEnabled` also exposed via /user/profile for non-web clients                                                                                                                                               | [AgentEventStore.ts](../cloud/src/agents/AgentEventStore.ts)                                                                                                | Done        |
| D7  | IaaS revenue-inert: no plan-change path, no tenant `stripeCustomerId`, `embeddingsBilled` never increments                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | [StripeMetersService.ts](../cloud/src/billing/StripeMetersService.ts)                                                                                       | R4          |
| D8  | `/sdk` fiction **fixed 2026-08-09** (page now documents the live /v1 API — real quickstart, real quotas, no fake `@recome/sdk`). ~~Synthesist ghost~~ **registered 2026-08-09**: deterministic weekly-summary agent (fresh/active/cooling buckets, ISO-week dedupe, Guardian 144h throttle, Sunday 13:00 UTC cron one hour before the digest)                                                                                                                                                                                                                                         | [web/src/app/sdk/page.tsx](../web/src/app/sdk/page.tsx)                                                                                                     | R1/R4       |
| D9  | Orphaned `packages/schema` (zero importers); shipped dead code (`vendor.js` popup bundle); unused `notifications` permission; `@ui` webpack alias to nothing                                                                                                                                                                                                                                                                                                                                                                                                                          | repo-wide                                                                                                                                                   | R1 hygiene  |
| D10 | `/twins` + `/packs` routes and Prisma models live despite Taste Twins being anti-featured by ADR-0012                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | [cloud/src/](../cloud/src/)                                                                                                                                 | R2 removal  |
| D11 | ~~Pre-existing cloud test-suite failures on a clean checkout~~ **Fixed 2026-08-09**: Concierge tests mock the Prisma-backed watchlist; the Curator failure was a real API flaw — `findFreshForTopic` hid a `Date.now()` against the repo's own ctx.now convention, now clock-injected. Suite green with no database                                                                                                                                                                                                                                                                   | [ConciergeAgent.test.ts](../cloud/src/agents/__tests__/ConciergeAgent.test.ts) · [CuratorAgent.test.ts](../cloud/src/agents/__tests__/CuratorAgent.test.ts) | R1 hygiene  |

## 7. Open decisions (with CTO recommendation)

1. **Popup (D3):** _Recommend: delete the popup; keep action-click → web app._ One inbox (web/PWA) beats two half-maintained ones; MV3 popups are the weakest surface we own. Revisit only if metrics show in-page users never reach the web inbox.
2. **Consumer pricing:** _Recommend: Free / Pro $8/mo / Premium $16/mo at launch, revisit with real cost data._ Guardian cap makes COGS per Pro user ≤ ~$3/mo worst case — margin holds even at $8.
3. **Taste Twins code (D10):** _Recommend: remove routes + models in R2._ ADR-0012 anti-featured it; dead social surface area is attack surface and diligence noise. Graveyard, don't delete history.
4. **Keepa license:** commercial decision; Concierge stays honest-off until signed. _Recommend signing before R3 so Concierge lands with the graph upgrade._
5. **YC application:** if pursued, enter via RFS #6 (daily consumer AI priced for two years out) with the Guardian economics as the lead differentiator; deck ask-slide switches to the $500K standard deal. Draft on request.

## 8. Non-goals (the never list)

No acting on the user's behalf (no buying, posting, applying). No engagement-optimization metrics — RAR measures usefulness, not time-in-app. No ads, ever; no selling or sharing consumer graph data; no cross-user training. No cross-side data access between consumer and IaaS. No LLM keys or intelligence in browser clients. No fake urgency, streaks, or dark patterns (v1's achievements stay dead). No new chat-first surfaces. Vocabulary bans per ADR-0013 ("AI assistant", "knowledge graph", "privacy-first", "second brain", …).

## 9. Definition of done (applies to every feature)

Typed contracts end-to-end · deterministic $0 mode for any agent feature · eval set before any LLM path ships · Guardian-gated · emissions cited · empty/demo states labeled · capture changes covered by fixture tests · `npm run validate` + cloud typecheck green · listings and marketing claims re-audited against this doc · VISION.md state register updated in the same PR.
