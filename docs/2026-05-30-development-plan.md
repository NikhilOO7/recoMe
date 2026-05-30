# RecoMe — Development Plan (post-v2.0.0)

**Date:** 2026-05-30
**Status:** Living document — the canonical "what to build next" reference. Update inline as items ship.
**Reads with:** [2026-05-30 Full-Project Audit](audits/2026-05-30-full-project-audit.md) (the backwards-looking snapshot that this doc plans forward from)
**Inherits from:** [ADR-0003 web-first pivot](architecture/0003-pivot-web-first-with-iaas.md), [ADR-0012 active agents](architecture/0012-active-agents-and-personality-mirror.md), [ADR-0014 unique surfaces](architecture/0014-unique-product-surfaces.md), [0015 HLD](architecture/0015-hld.md), [0016 LLD](architecture/0016-lld.md)

---

## 0. How to use this document

This is the **single forward-looking source of truth** for development decisions until superseded by the next quarterly plan. When you sit down to work, start here:

1. **Read §3 (priority queue)** — pick the next item.
2. **Find the workstream it belongs to in §5–§16** — read the _what_, _done_, _next_, _deps_.
3. **Check the acceptance criteria in §17** before claiming done.
4. **Update this doc** when an item ships — move from `Next` to `Done`, add follow-ups.

If a decision blocks work, escalate to §18 (open decisions) and tag the relevant ADR — don't sit on it.

---

## 1. North star

**RecoMe is a personal interest graph + five background agents working it for you.** Per [HLD §1](architecture/0015-hld.md#1-system-context):

> The graph is durable in Neo4j. LLMs are used at the edges (chat synthesis, optional copy-polish on agent emissions). A Claude outage degrades chat and Synthesist; it does not affect Recall, Mind Map, or the IaaS API.

Two business surfaces share the same graph:

- **Consumer** (`recome.app` + browser extension) — JWT auth, freemium today.
- **IaaS** (`api.recome.app/v1`) — `rk_live_…` API keys, tenant-scoped, usage-metered (foundation shipped, public launch in §11).

---

## 2. Non-goals (binding)

Pulled forward from ADR-0012 §2.3 and HLD §11 — these are explicit refusals so scope creep has a hard wall to bounce off:

- ❌ **LLM API keys in the browser.** All LLM calls happen cloud-side.
- ❌ **In-browser graph / agents / recommender.** The graph is Neo4j, the agents run on Fly, the scorer is `cloud/src/intelligence/`.
- ❌ **Agents that take irreversible action.** Recommend only; user clicks Buy / Post / Send.
- ❌ **Cross-user training / cross-tenant graph queries.** Per-user namespace, per-tenant isolation, no aggregate ML on individual data without explicit opt-in.
- ❌ **Always-on screen / audio capture.** Different value model; ruled out in ADR-0013 §1.1.
- ❌ **Real-time graph mutation push to clients.** Pull on demand or background polling only — see HLD §11.
- ❌ **A browser** (ADR-0013 §3.7) or **email / calendar agents** (ADR-0012 §2.3).
- ❌ **Personality type quizzes / Big Five / MBTI inference** — opt-in Attention Composition is descriptive, not diagnostic.

When a feature request lands, check this list first. If it conflicts, the request needs an ADR before implementation.

---

## 3. Priority queue (pick from the top)

Each item is a workstream-scoped task with an acceptance criterion. Move items to "Done" once shipped; don't accumulate dead text.

### P0 — Today (security + hygiene; 1–2 hours total)

| #    | Item                                                       | Workstream                         | Acceptance                                                                                                   |
| ---- | ---------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| P0.1 | Move `dist.pem` to Fly secrets + rotate key                | [WS-1](#5-ws-1--security--hygiene) | Repo `git grep` returns 0 hits for `dist.pem`; new key uploaded to CWS dev console                           |
| P0.2 | Move `creds.txt` → `.env.example` + add to `.gitignore`    | [WS-1](#5-ws-1--security--hygiene) | `git ls-files \| grep creds.txt` empty; `.env.example` documents demo creds                                  |
| P0.3 | Untrack `dist.crx` + add `dist/` to `.gitignore`           | [WS-1](#5-ws-1--security--hygiene) | `git ls-files dist/` empty                                                                                   |
| P0.4 | Trim extension `host_permissions` to drop LLM hosts        | [WS-1](#5-ws-1--security--hygiene) | `manifest.json` has no `api.anthropic.com`/`api.openai.com`/`generativelanguage.googleapis.com`; build green |
| P0.5 | Remove `brain/` + `agent/` globs from `eslint.config.mjs`  | [WS-1](#5-ws-1--security--hygiene) | `npm run lint` runs clean with no "directory not found" warnings                                             |
| P0.6 | `.gitignore` `coverage/` and remove tracked stale coverage | [WS-1](#5-ws-1--security--hygiene) | `git ls-files coverage/` empty                                                                               |

### P1 — This week (docs alignment; ~1 day)

| #    | Item                                                                       | Workstream                               | Acceptance                                                                                |
| ---- | -------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| P1.1 | Rewrite `store/STORE_LISTING.md` for v2.0.0                                | [WS-2](#6-ws-2--docs--listing-alignment) | Listing references current 5-agent roster, no mention of ShopperAgent / ScoutAgent / BYOK |
| P1.2 | Update ADR-0014 §1 status column                                           | [WS-2](#6-ws-2--docs--listing-alignment) | F-401/403/404/406/407 statuses match code reality                                         |
| P1.3 | Update ADR-0004 roadmap dates + state                                      | [WS-2](#6-ws-2--docs--listing-alignment) | Phase 0 marked complete; Phase 2 dates reflect actual delivery                            |
| P1.4 | Update ADR-0016 LLD §2 with MindMap / PersonalityMirror / AuditLog modules | [WS-2](#6-ws-2--docs--listing-alignment) | LLD module catalog lists all current `cloud/src/intelligence/*.ts`                        |
| P1.5 | Decide `mobile/` fate (resurrect with plan OR graveyard)                   | [WS-9](#13-ws-9--mobile-decision)        | Either a 1-month mobile roadmap added here, or `mobile/` moved to `graveyard/`            |

### P2 — Next sprint (cloud hardening + CI; ~3 days)

| #    | Item                                                                                                   | Workstream                             | Acceptance                                                                |
| ---- | ------------------------------------------------------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------- |
| P2.1 | Fix 70 cloud TS errors via Hono `Variables` interface                                                  | [WS-3](#7-ws-3--cloud-correctness--ci) | `cd cloud && npx tsc --noEmit` exits 0                                    |
| P2.2 | Swap `Watchlist` in-memory Map → Prisma `WatchlistItem` model                                          | [WS-3](#7-ws-3--cloud-correctness--ci) | Watchlist items survive process restart; ConciergeAgent tests still green |
| P2.3 | Restore `graphology` + `graphology-communities-louvain` in `cloud/package.json` for MindMap clustering | [WS-3](#7-ws-3--cloud-correctness--ci) | `cd cloud && npm run test` passes including MindMap cluster tests         |
| P2.4 | Wire `.github/workflows/ci.yml`: typecheck + test on push to all subprojects                           | [WS-3](#7-ws-3--cloud-correctness--ci) | PRs blocked when extension typecheck or cloud tests fail                  |
| P2.5 | Archive `cloud/src/agent/` (singular, legacy chat stub)                                                | [WS-3](#7-ws-3--cloud-correctness--ci) | Moved to `graveyard/2026-05-30-extension-rewrite/cloud-agent-singular/`   |

### P3 — Two weeks out (real Concierge + Decision streaming + BullMQ + CardScorer)

| #    | Item                                                                    | Workstream                                 | Acceptance                                                                                                     |
| ---- | ----------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| P3.1 | Decide ADR-0017 price vendor (Keepa / RainforestAPI / Amazon Affiliate) | [WS-4](#8-ws-4--concierge-price-vendor)    | ADR-0017 written with vendor + cost analysis; PriceFetcher tied to chosen vendor                               |
| P3.2 | Real `CardScorer` with LLM reasoning polish                             | [WS-5](#9-ws-5--cardscorer-llm-polish)     | `POST /intelligence/score/cards` returns reasoning that beats the deterministic baseline on a 50-card eval set |
| P3.3 | Decision agent SSE streaming                                            | [WS-6](#10-ws-6--decision-llm-streaming)   | Extension `OverlayChat` and web `/ask` chat stream token-by-token; latency p95 first-token < 1.5s              |
| P3.4 | BullMQ worker fleet (Curator 1×/day + Concierge watchlist sweep)        | [WS-7](#11-ws-7--bullmq-scheduled-workers) | Curator emits weekly via cron without manual `/run`; Concierge sweeps Watchlist on schedule                    |

### P4 — Month out (IaaS public launch + notifications + new surfaces)

| #    | Item                                                             | Workstream                                 | Acceptance                                                                              |
| ---- | ---------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------- |
| P4.1 | Stripe Meters daily rollup for IaaS usage                        | [WS-8](#12-ws-8--iaas-public-launch)       | `TenantUsage.signalsIngested` aggregate reports to Stripe; first paying tenant billable |
| P4.2 | OpenAPI spec generated from Zod schemas + `docs.recome.app` site | [WS-8](#12-ws-8--iaas-public-launch)       | `docs.recome.app/v1` shows authoritative spec; key-issuance UI in `web/developer/`      |
| P4.3 | PWA push (VAPID) for AgentEvent notifications                    | [WS-10](#14-ws-10--notifications--digests) | Web `/inbox` registers push subscription; agent events surface as system notifications  |
| P4.4 | Email weekly digest of unseen events                             | [WS-10](#14-ws-10--notifications--digests) | Synthesist-templated digest in Resend; opt-out via settings                             |

### P5 — Deferred (Synthesist + Mind Map time-scrub + Composition trajectory)

| #    | Item                                  | Workstream                             | Acceptance                                                               |
| ---- | ------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------ |
| P5.1 | Synthesist agent (Tier 3 in ADR-0012) | [WS-11](#15-ws-11--synthesist-agent)   | Weekly cron emits long-form summary of active intents; cited             |
| P5.2 | F-318 Mind Map time-scrub slider      | [WS-12](#16-ws-12--remaining-surfaces) | `/mind?window=…` accepts time-window; UI scrubber replays past 90 days   |
| P5.3 | F-407 Composition trajectory surface  | [WS-12](#16-ws-12--remaining-surfaces) | Personality Mirror shows 8-week trajectory + underrepresented dimensions |
| P5.4 | F-408 per-row Audit Log deletion      | [WS-12](#16-ws-12--remaining-surfaces) | Each AgentRun/Signal row has a delete button; idempotent + cascade-safe  |

---

## 4. Workstream map

Twelve workstreams, ordered by current priority:

| WS                                         | Title                             | Owner              | Current P |
| ------------------------------------------ | --------------------------------- | ------------------ | --------- |
| [WS-1](#5-ws-1--security--hygiene)         | Security + Hygiene                | (founder)          | P0        |
| [WS-2](#6-ws-2--docs--listing-alignment)   | Docs + Listing Alignment          | (founder)          | P1        |
| [WS-3](#7-ws-3--cloud-correctness--ci)     | Cloud Correctness + CI            | (cloud)            | P2        |
| [WS-4](#8-ws-4--concierge-price-vendor)    | Concierge Price Vendor (ADR-0017) | (founder, blocked) | P3        |
| [WS-5](#9-ws-5--cardscorer-llm-polish)     | CardScorer LLM Polish             | (cloud)            | P3        |
| [WS-6](#10-ws-6--decision-llm-streaming)   | Decision LLM Streaming            | (cloud + clients)  | P3        |
| [WS-7](#11-ws-7--bullmq-scheduled-workers) | BullMQ Scheduled Workers          | (cloud)            | P3        |
| [WS-8](#12-ws-8--iaas-public-launch)       | IaaS Public Launch                | (cloud + web)      | P4        |
| [WS-9](#13-ws-9--mobile-decision)          | Mobile Decision                   | (founder)          | P1        |
| [WS-10](#14-ws-10--notifications--digests) | Notifications + Digests           | (cloud + web)      | P4        |
| [WS-11](#15-ws-11--synthesist-agent)       | Synthesist Agent                  | (cloud)            | P5        |
| [WS-12](#16-ws-12--remaining-surfaces)     | Remaining Unique Surfaces         | (cloud + web)      | P5        |

---

## 5. WS-1 — Security + Hygiene

**Why it matters:** Three secrets are in the repo (CWS signing key, demo creds, built `.crx`). Extension manifest over-permissions blocks CWS submission. Two hours' work prevents a category of "oops" incidents.

**Done so far:** Audit identified all issues (see [audit §6](audits/2026-05-30-full-project-audit.md#6-security--hygiene-issues-found)).

**Next:** P0.1–P0.6 in priority queue. Plus:

- Rotate `JWT_ACCESS_SECRET` + `JWT_REFRESH_SECRET` in Fly secrets after pem move (defense-in-depth).
- Audit `.husky/` + `lint-staged` config to make sure pre-commit catches future `dist.pem`-style accidents (add a pre-commit hook that fails if `*.pem` or `creds*` is staged).

**Dependencies:** None. Can ship today.

**Files to touch:**

- [package.json](../package.json) (scripts), [.gitignore](../.gitignore), [eslint.config.mjs](../eslint.config.mjs), [extension/src/manifest.json](../extension/src/manifest.json)
- Move + rotate: `dist.pem`, `creds.txt`, `dist.crx`, `coverage/`

---

## 6. WS-2 — Docs + Listing Alignment

**Why it matters:** A new engineer reading ADR-0014 today would conclude F-401 Mind Map is "spec only" and duplicate work that's been shipped for two weeks. Worse, an investor or first paying IaaS customer reading the roadmap sees Phase 0 still in flight.

**Done so far:** Audit lists exact stale claims (see [audit §8.5](audits/2026-05-30-full-project-audit.md#85-docs-docs)).

**Next:** P1.1–P1.5 in priority queue. Plus:

- Add **"Last verified" line** to top of every living doc with a date and a list of known stale sections. Makes drift visible.
- Move `recome_interview_prep.md` out of repo root (it's a personal doc, not project documentation).
- Move `AUDIT_PERPLEXITY_2026-05-17.md` into `docs/audits/`.

**Dependencies:** P1.5 (mobile decision) gates whether the roadmap mentions mobile as live or graveyarded.

**Files to touch:**

- [docs/architecture/0014-unique-product-surfaces.md](architecture/0014-unique-product-surfaces.md)
- [docs/architecture/0004-production-roadmap.md](architecture/0004-production-roadmap.md)
- [docs/architecture/0016-lld.md](architecture/0016-lld.md)
- [store/STORE_LISTING.md](../store/STORE_LISTING.md)

---

## 7. WS-3 — Cloud Correctness + CI

**Why it matters:** 70 TypeScript errors aren't crashes but they hide future real errors. No CI means PRs can merge with a broken typecheck. Watchlist losing user data on restart is the kind of thing that gets flagged by a single angry support ticket.

**Done so far:**

- Cloud has 154 vitest test files
- All Phase-4 changes (DecisionAgent, CurriculumAgent, /score/cards, watchlist CRUD) type-clean

**Next:** P2.1–P2.5 in priority queue. Specifically:

- **P2.1** — Add `cloud/src/types.ts#AuthVars` (or augment existing) so every controller can declare `Hono<AuthVars>` and `c.get('userId')` typechecks. Fix one controller, copy pattern to the other six. ~3 hours.
- **P2.2** — Prisma model:
  ```prisma
  model WatchlistItem {
    id              String   @id @default(cuid())
    userId          String
    user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
    label           String
    targetPriceUsd  Float?
    retailers       String[] @default([])
    pageUrl         String?
    createdAt       DateTime @default(now())
    lastPriceUsd    Float?
    lastPriceAt     DateTime?
    @@index([userId])
  }
  ```
  Then rewrite `cloud/src/agents/concierge/Watchlist.ts` four exported functions against Prisma; the AgentController routes need no changes (same call signature).
- **P2.3** — `cd cloud && npm install graphology graphology-communities-louvain` + verify MindMap tests pass.
- **P2.4** — `.github/workflows/ci.yml` matrix: extension (npm run typecheck + npm test + npm run build), cloud (npm test + tsc --noEmit), web (npm run build).

**Dependencies:** None blocking.

**Files to touch:**

- All 6 cloud controllers with `c.get('userId')` errors (admin, tastetwin, sync × 2, storage, billing, social, auth)
- [cloud/prisma/schema.prisma](../cloud/prisma/schema.prisma)
- [cloud/src/agents/concierge/Watchlist.ts](../cloud/src/agents/concierge/Watchlist.ts)
- [cloud/package.json](../cloud/package.json)
- New: `.github/workflows/ci.yml`

---

## 8. WS-4 — Concierge Price Vendor (ADR-0017)

**Why it matters:** ConciergeAgent silently no-ops in production today (`INTELLIGENCE_AGENTS_PRICE_VENDOR=stub` blocked by GuardianAgent check). Without real prices, the agent's Watchlist sweep + on-PDP fire produce nothing. The most marketed agent is effectively absent in prod.

**Done so far:**

- Concierge runtime + Watchlist integration shipped today
- `compareOffers()` interface defined in [cloud/src/agents/concierge/tools.ts](../cloud/src/agents/concierge/tools.ts)
- Stub adapter satisfies the interface

**Decision needed:** Keepa vs RainforestAPI vs direct Amazon Affiliate API (vs hybrid). ADR-0017 placeholder is in [docs/architecture/INDEX.md](architecture/INDEX.md).

**Comparison frame** (from ADR-0012 §10):
| Vendor | $/mo | Coverage | Latency | Notes |
|---|---|---|---|---|
| Keepa | ~$20 | Amazon-only deep | <500ms | Best for trail-based price tracking |
| RainforestAPI | $30+ | Amazon + Walmart | ~1s | Real-time, broader |
| Amazon Affiliate | free | Amazon-only shallow | ~2s | Requires affiliate program approval; no eBay/Walmart |
| Hybrid (Keepa + scrape) | ~$20 + ops | All retailers | Variable | Legal exposure on scraping |

**Recommendation to evaluate:** Start with **Keepa for Amazon** (~$20/mo gets enough resolution to ship Concierge for the largest retailer category), defer Walmart/eBay until 10+ paying users request. Document tradeoff in ADR-0017.

**Next:**

- P3.1 — Write ADR-0017 with vendor pick + cost analysis + 30-day eval criteria
- Implement chosen vendor as a `PriceFetcher` impl behind the `compareOffers()` interface
- Set `INTELLIGENCE_AGENTS_PRICE_VENDOR=keepa` (or chosen) in Fly secrets
- Add cost metric: `concierge_price_check_total` counter to Grafana

**Dependencies:** Founder decision on vendor. Blocked until written.

**Files to touch:**

- New: `docs/architecture/0017-price-data-vendor.md` (placeholder filename in INDEX)
- New: `cloud/src/agents/concierge/KeepaPriceFetcher.ts` (or chosen vendor)
- [cloud/src/agents/concierge/tools.ts](../cloud/src/agents/concierge/tools.ts) — wire selector by env

---

## 9. WS-5 — CardScorer LLM Polish

**Why it matters:** Current per-card badges score by topic-overlap (deterministic, honest, but coarse). The mockup shows reasoning like _"Conflicting signals in your research history — articles you read show mixed evidence on this supplement type during treatment"_ — that's LLM-polish, not topic-overlap.

**Done so far:**

- `POST /intelligence/score/cards` endpoint live with deterministic scorer
- Extension `ScoreBatcher` + `CardBadge` renderer wired
- TODO marker at [cloud/src/intelligence/IntelligenceController.ts:220](../cloud/src/intelligence/IntelligenceController.ts#L220)

**Next:**

- Create `cloud/src/intelligence/CardScorer.ts` with a real LLM-polished scorer:
  - Input: page context + N cards
  - Step 1: deterministic topic-match (current logic) — pre-filter to ≤10 highest-scoring cards
  - Step 2: Haiku call with prompt template that grounds reasoning in named topics from user's graph
  - Output: same `{id, score, verdict, reason}` shape
- Eval set: 50 hand-labelled (card, user-graph-snapshot) → expected verdict pairs
- Cost guard: per-user daily LLM cap for scoring (default $0.02 — fits in $0.10 Guardian envelope alongside other agents)

**Dependencies:** None blocking. Phase-4 extension Phase 2 already consumes this endpoint.

**Files to touch:**

- New: [cloud/src/intelligence/CardScorer.ts](../cloud/src/intelligence/CardScorer.ts)
- [cloud/src/intelligence/IntelligenceController.ts](../cloud/src/intelligence/IntelligenceController.ts) — wire the new scorer behind the route
- New: `cloud/src/intelligence/__tests__/CardScorer.eval.ts` with the 50-pair eval set

---

## 10. WS-6 — Decision LLM Streaming

**Why it matters:** Decision agent today returns a single deterministic emission; extension/web fake stream it with a typewriter animation. Real streaming reduces perceived latency from ~2s to <500ms first-token and unlocks longer multi-turn responses.

**Done so far:**

- Decision agent v1 deterministic ([cloud/src/agents/decision/DecisionAgent.ts](../cloud/src/agents/decision/DecisionAgent.ts))
- Extension `OverlayChat.ts` + web `/ask` AdvisorPanel render single-response with typewriter

**Next:**

- New endpoint: `POST /intelligence/agents/decision/stream` returns SSE
- Hono supports streaming via `c.streamSSE()` — straightforward refactor
- Refactor DecisionAgent.run to optionally return an async iterator for streaming, single response for batch
- Extension `OverlayChat.send()`: parse SSE chunks, append to text element as they arrive
- Web `/ask` AdvisorPanel: same pattern with EventSource

**Dependencies:** WS-5 (some shared prompt-template infrastructure).

**Files to touch:**

- [cloud/src/agents/decision/DecisionAgent.ts](../cloud/src/agents/decision/DecisionAgent.ts) — `runStream` method
- [cloud/src/intelligence/IntelligenceController.ts](../cloud/src/intelligence/IntelligenceController.ts) — new SSE route
- [extension/src/surfaces/OverlayChat.ts](../extension/src/surfaces/OverlayChat.ts) — switch to SSE
- [web/src/app/ask/page.tsx](../web/src/app/ask/page.tsx) — AdvisorPanel SSE

---

## 11. WS-7 — BullMQ Scheduled Workers

**Why it matters:** Curator is spec'd as "1×/day" (ADR-0012). Concierge is spec'd as "4×/day per active trail". Both fire today only via on-demand POSTs (extension or manual). Without a scheduler, the agents only do work when the user is browsing — defeating the "while you sleep" pitch from ADR-0012 §6.

**Done so far:** Nothing for scheduled execution. Both agents handle the `scheduled` trigger in their `canRun` / `run` methods; just nothing fires them.

**Decision needed:** BullMQ + Redis (per HLD §2.1) or Fly cron command. HLD assumed BullMQ — Redis is already provisioned via Upstash for rate limiting + embedding cache. BullMQ workers can share that Redis instance.

**Next:**

- Add `cloud/src/workers/` directory
- `WorkerEntry.ts`: boots with `--worker` flag (skips Hono, registers BullMQ processors)
- Three queues: `curator-daily`, `concierge-sweep`, `synthesist-weekly` (Synthesist later in WS-11)
- Scheduling: cron strings via BullMQ Repeatable Jobs
  - Curator: `0 9 * * *` (9am daily per user timezone — see open Q in ADR-0012)
  - Concierge: `0 */6 * * *` (4×/day per user with non-empty watchlist)
- Per-user fanout: cron emits one job per active user
- Fly deployment: second machine, same image, started with `--worker` flag

**Dependencies:** None blocking. Can ship before WS-4 (Concierge will run-and-no-op if vendor is still stub).

**Files to touch:**

- New: `cloud/src/workers/index.ts` + `WorkerEntry.ts` + `processors/`
- [cloud/src/index.ts](../cloud/src/index.ts) — branch on `--worker` flag
- New: `cloud/fly.worker.toml` for the worker machine
- [cloud/package.json](../cloud/package.json) — `bullmq` dep

---

## 12. WS-8 — IaaS Public Launch

**Why it matters:** ADR-0003's dual-sided business model needs IaaS revenue to validate. Foundation is shipped (key issuance, tenant scoping, usage counters, `/v1/*` routes) but no developer can sign up because there's no dashboard, no public docs, no Stripe Meters integration.

**Done so far:**

- All `/v1/*` routes work; tenant-scoped usage tracked in Postgres
- Schema sharing between consumer + IaaS surfaces (Zod schemas in `cloud/src/intelligence/schemas.ts`)
- API key model in Prisma

**Next:**

1. **Developer dashboard** (`web/src/app/developer/page.tsx`):
   - Create tenant
   - Issue / revoke API keys (`rk_live_…` shown once)
   - View usage counters + plan tier
   - Per-tenant agent customization (per ADR-0012 §10 open Q4 — deferred until 10 paying tenants)
2. **Public docs site** `docs.recome.app`:
   - Next 16 MD-rendered (per HLD §2.1)
   - OpenAPI spec auto-generated from Zod schemas (zod-to-openapi)
   - Per-endpoint examples
3. **Stripe Meters daily rollup**:
   - Cron job (BullMQ): aggregate `TenantUsage.signalsIngested` → `stripe.billing.meterEvents.create()`
   - Plan tiers per HLD §4: FREE 1K/10K, STARTER $49/100K/1M, PRO $499/1M/10M

**Dependencies:** WS-7 (BullMQ) for the daily rollup cron.

**Files to touch:**

- New: `web/src/app/developer/page.tsx`
- New: `docs-site/` (separate Next 16 app or subdomain config)
- [cloud/src/iaas/usageTracker.ts](../cloud/src/iaas/usageTracker.ts) — add Stripe Meters export
- [cloud/src/billing/StripeService.ts](../cloud/src/billing/StripeService.ts) — Meters wiring

---

## 13. WS-9 — Mobile Decision

**Why it matters:** Carrying scaffolding indefinitely is a tax on every status conversation, every audit, every decision about CI/lint scope. The right answer is a decision, not stasis.

**Done so far:** Expo + React Native + react-navigation init. Nothing functional.

**Two paths:**

**Path A: Resurrect (3-week plan):**

1. Week 1: PWA-first — make `recome.app` installable as a PWA with Web Share Target. Most "mobile RecoMe" value (capture from any app's share sheet) ships here without native code. Existing `web/` already runs in Next 16 with Tailwind 4; needs `manifest.webmanifest` + service worker.
2. Week 2: iOS Share Extension (native Swift) — captures URL+title from share sheet, POSTs to `/intelligence/signals` via stored JWT. ~300 LOC Swift.
3. Week 3: Android Share Target intent handler — Kotlin equivalent of week 2.
4. **Native app comes later** if a real surface requires it. The PWA + share extensions cover 80% of mobile capture value.

**Path B: Graveyard:**

- `mv mobile/ graveyard/2026-05-30-extension-rewrite/mobile/`
- Delete `mobile/` from `tsconfig.json` includes, jest paths, package.json workspaces
- Add note to `docs/architecture/0003-pivot-web-first-with-iaas.md` that mobile is deferred indefinitely

**Recommendation:** Path A but with **Week 1 only as a commitment** — ship PWA + Share Target, then assess whether the native share extensions are worth the iOS/Android dev cost. PWA share-target is 2 days of work and covers iOS Safari + Android Chrome share menus.

**Dependencies:** Founder commitment.

**Files to touch (Path A Week 1):**

- New: `web/public/manifest.webmanifest`
- New: `web/src/app/sw.ts` (service worker)
- [web/src/app/paste/page.tsx](../web/src/app/paste/page.tsx) — already handles `?url=` hydration; just needs share-target manifest entry pointing to it

---

## 14. WS-10 — Notifications + Digests

**Why it matters:** Inbox-poll model means users only see agent emissions when they open the extension popup or web inbox. PWA push + email digest extend the reach without changing the core ingest model.

**Done so far:** None. Extension shows browser-action badge for unseen count; that's it.

**Next:**

1. **PWA push** (VAPID):
   - Generate VAPID keys, store in Fly secrets
   - Web `web/src/app/inbox/page.tsx` registers ServiceWorker push subscription on first visit (with permission gate)
   - Cloud: when AgentEvent inserts, lookup user's push subscription, send via web-push library
   - Subscription persistence in Prisma `PushSubscription` model
2. **Email digest**:
   - Synthesist agent (WS-11) emits weekly summary as AgentEvent
   - Resend integration in `cloud/src/notifications/EmailService.ts` (Resend is already in `tech-stack.md`)
   - Opt-out in `/settings`
3. **Browser notification fallback in extension**:
   - When AgentEvent arrives via InboxPoller and tab is hidden, fire `chrome.notifications.create()` with the event title
   - Click → open `recome.app/inbox`

**Dependencies:** WS-11 for Synthesist weekly digest; WS-7 for BullMQ to schedule daily digest aggregation.

**Files to touch:**

- New: `web/src/app/sw.ts` (push handler — same SW as PWA)
- New: `cloud/src/notifications/EmailService.ts` + `PushService.ts`
- [cloud/prisma/schema.prisma](../cloud/prisma/schema.prisma) — `PushSubscription` model
- [extension/src/background/InboxPoller.ts](../extension/src/background/InboxPoller.ts) — `chrome.notifications` call when tab hidden

---

## 15. WS-11 — Synthesist Agent

**Why it matters:** ADR-0012 Tier 3 agent — "Weekly long-form 'where you are on each active intent' report." Replaces the templated digest with LLM-synthesized text. Last agent to ship before the v2 roster (Watchlist as its own agent, beyond) starts.

**Done so far:** None. ADR-0012 §2.2 spec exists; no code.

**Next:**

- New file: `cloud/src/agents/synthesist/SynthesistAgent.ts`
- Trigger: `scheduled`, weekly
- Algorithm:
  1. Pull last 7 days of signals + agent emissions for user
  2. Group by topic; pick top 5 active intents
  3. For each: brief paragraph summarizing what changed (new signals, new entities, agent events fired)
  4. LLM polish: Haiku call with prompt template "summarize the user's week on [topic] grounded in these signals: [...]"
- Cost budget: $0.10/user/mo (per ADR-0012 §4)
- Emission: `kind: 'weekly_summary'`, body is the full markdown digest
- Email delivery via WS-10 EmailService

**Dependencies:** WS-7 (BullMQ scheduler) + WS-10 (EmailService for delivery)

**Files to touch:**

- New: `cloud/src/agents/synthesist/SynthesistAgent.ts`
- [cloud/src/agents/index.ts](../cloud/src/agents/index.ts) — register
- [cloud/src/agents/GuardianAgent.ts](../cloud/src/agents/GuardianAgent.ts) — add `synthesist: 168h` (weekly) to `AGENT_MIN_GAP_HOURS`

---

## 16. WS-12 — Remaining Unique Surfaces

Pulled forward from ADR-0014 — the surfaces flagged "spec only" that haven't been built yet.

### 16.1 F-318 Mind Map time-scrub slider

- Today: `/intelligence/mindmap?window=90d` returns a snapshot
- Need: slider in `web/src/app/mind/page.tsx` that re-queries on drag with debounce
- Backend already supports `?window=7d|30d|90d|1y` — just UI work

### 16.2 F-407 Composition trajectory

- Today: PersonalityMirror returns composition (last 30d)
- Need: trajectory (week-over-week deltas), underrepresented dimensions
- Backend: extend `cloud/src/intelligence/PersonalityMirror.ts` with `trajectory()` method
- Frontend: chart in `web/src/app/personality/page.tsx`

### 16.3 F-408 per-row Audit Log deletion

- Today: user-wide `DELETE /intelligence/me` cascades everything
- Need: per-Signal and per-AgentRun deletion endpoints
- Backend: `DELETE /intelligence/signals/:id` + `DELETE /intelligence/agents/runs/:id`
- Frontend: row-level delete buttons in `web/src/app/audit-log/page.tsx`
- Cascade: deleting a Signal removes its Cypher relationships + Qdrant point + agent events that cite it (or marks them as orphaned)

**Dependencies:** None blocking.

**Files to touch:** Listed inline.

---

## 17. Acceptance criteria — definition of done

For every workstream item, "done" means:

1. **Code merged** to `main` with green CI
2. **Tests cover the happy path** + at least one error path
3. **Typecheck clean** (`cd <subproject> && npx tsc --noEmit` exits 0)
4. **No new TODO markers** without an issue link
5. **Docs updated** — if the change affects HLD/LLD/ADR, those docs reflect the new state
6. **Manual verification** — for UI work, screenshot in the PR. For agents, a `curl` example showing the new behavior
7. **Privacy-impact check** — does this change what data is sent / stored / surfaced? If yes, AuditLog.ts records it
8. **Cost-impact check** — does this change LLM spend / vendor calls? If yes, daily-cap implications calculated

For shipped surfaces (extension v2.x, web v2.x), additionally:

- **Released-version bump** in `extension/src/manifest.json` + `package.json`
- **CHANGELOG entry** — Added / Changed / Removed / Security
- **Build artifact** produced fresh (`npm run build` in repo root, plus `cd web && npm run build`)

---

## 18. Open architectural decisions

Carried forward from HLD §10 + flagged in audit. Each needs an ADR before the work it blocks can start:

| #   | Decision                                                    | Blocks                       | Target                                          |
| --- | ----------------------------------------------------------- | ---------------------------- | ----------------------------------------------- |
| 1   | Price-data vendor for Concierge                             | WS-4                         | ADR-0017, this sprint                           |
| 2   | Embedding cache TTL + invalidation (Upstash Redis)          | Cost discipline              | P2                                              |
| 3   | BullMQ worker carve-out timing (separate Fly machine)       | WS-7, WS-11                  | P3                                              |
| 4   | Per-tenant agent customization for IaaS                     | WS-8 §F-405                  | After 10 paying IaaS tenants                    |
| 5   | Mind Map cluster algorithm (Louvain vs Leiden)              | F-401 polish                 | Re-revisit if Louvain instability bothers users |
| 6   | Conversation persistence for chat-on-demand                 | Decision agent multi-tenancy | WS-6                                            |
| 7   | Schema migration strategy (Prisma `migrate dev` everywhere) | P0 hard requirement          | P2                                              |
| 8   | EU region                                                   | IaaS expansion               | Triggered by demand                             |

---

## 19. Risk register

Top 10 from audit, with mitigations:

| #   | Risk                                            | Mitigation               | Owner   |
| --- | ----------------------------------------------- | ------------------------ | ------- |
| 1   | Docs lie about shipped surfaces                 | WS-2 P1.2–P1.4 this week | founder |
| 2   | `dist.pem` in repo                              | WS-1 P0.1 today          | founder |
| 3   | Watchlist in-memory loses data on restart       | WS-3 P2.2 next sprint    | cloud   |
| 4   | CWS listing describes v1.2.0                    | WS-2 P1.1 this week      | founder |
| 5   | 70 cloud TS errors hide future bugs             | WS-3 P2.1 next sprint    | cloud   |
| 6   | Concierge silently no-ops in prod (stub vendor) | WS-4 P3.1 two weeks      | founder |
| 7   | `mobile/` undecided                             | WS-9 P1.5 this week      | founder |
| 8   | Extension manifest over-permissioned            | WS-1 P0.4 today          | founder |
| 9   | Web `/admin` unaudited                          | Spot-read next sprint    | founder |
| 10  | No CI green-bar                                 | WS-3 P2.4 next sprint    | cloud   |

---

## 20. Quality bars (binding NFRs from HLD §4)

These are not goals — they are conditions the system must meet at all times. If a change would violate them, gate the change.

| Concern                | Target                      | What enforces                                      |
| ---------------------- | --------------------------- | -------------------------------------------------- |
| Capture p95 latency    | < 250ms                     | Sentry / BetterStack                               |
| Retrieval p95 latency  | < 400ms                     | Sentry                                             |
| IaaS `/v1/signals` p95 | < 250ms (batch of 10)       | Sentry, per-route                                  |
| Chat first-token       | < 1.5s                      | Sentry (Phase 4 SSE will gate WS-6)                |
| Availability           | 99.5% consumer / 99.9% IaaS | BetterStack                                        |
| Embedding cost ceiling | < $0.30/MAU/mo              | OpenAI billing / active users                      |
| Agent cost ceiling     | < $1.00/MAU/mo aggregate    | `AgentRun.costMicros` sum (GuardianAgent enforces) |
| GDPR delete completion | < 24h end-to-end            | AuditLog entries                                   |
| Cross-tenant isolation | Zero leaks ever             | `composeTenantUserId` invariant test               |

---

## 21. Glossary (for new contributors)

- **Signal** — a captured event (view, dwell, like, block, search, etc.) with topics + entities; the atomic unit fed into the graph
- **Topic** — normalized noun phrase (e.g. "standing desks"); HAS_INTENT edge from User
- **Entity** — specific thing (product, brand, creator); MENTIONS edge from Signal
- **Trail** — chronological hop sequence on a topic; the explainable user-visible surface
- **AgentRun** — Postgres row for every agent execution (success/skip/cap/fail); the audit trail
- **AgentEvent** — Postgres row for a user-facing emission; the inbox surface
- **AgentSubscription** — per-user per-agent enable/pause state
- **Surface** — a place users see RecoMe: extension sidebar, popup inbox, in-page card, web /ask chat, etc.
- **Workstream** — a coordinated track of work in this doc; see §4

---

## 22. Maintenance — when to update this doc

- **Item ships** → move from priority queue to that workstream's "Done so far"; add the file paths touched
- **New priority emerges** → add to queue (P0–P5) and link to its workstream
- **New decision needed** → add to §18 with target ADR number
- **Risk realized or mitigated** → update §19
- **NFR violated** → escalate immediately; update §20 only if the target itself changes (rare)
- **Quarterly** → archive this doc to `docs/archive/2026-Q2-development-plan.md`; create the next quarter's plan as a fresh file with the same structure

---

**End of plan. Next pickup: §3 priority queue, P0.1.**
