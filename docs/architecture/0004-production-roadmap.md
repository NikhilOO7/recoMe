# 0004 — Production Roadmap

**Owner:** Founder / CTO
**Status:** Living document — **major scope acceleration logged 2026-05-30; see §0.1**
**Last reviewed:** 2026-05-30 (was 2026-05-17)
**Cadence:** Reviewed monthly; updated whenever scope, dates, or KPIs change.

---

## 0.1 Schedule reality vs original phase map (2026-05-30)

Two rewrites collapsed the original P0–P2 window. The **code reality is now ahead of the original plan**, but onboarding telemetry (KPI measurement) has not caught up — so the phase-gate "go/no-go" decisions can't be made yet.

| Phase      | Original window              | Code status (2026-05-30)                                                                                                                                                                                                              | KPI measurement status                                             | Net                                                                       |
| ---------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| P0 Capture | weeks 1–6 (May 17 → Jun 28)  | **Shipped early** — extension v2.0.0 + web /paste + cloud ingest all live                                                                                                                                                             | Cohort data not yet collected                                      | Go/no-go review **deferred** until ≥4 weeks of cohort telemetry exists    |
| P1 Memory  | weeks 7–14 (Jun 29 → Aug 23) | **Partially shipped early** — dashboard v2 (trails), Mind Map, weekly digest infra all live; bulk import deferred (see plan §11)                                                                                                      | Pending P0 cohort                                                  | Bulk import is the only remaining P1 scope item; can fold into P2         |
| P2 Agents  | weeks 15–24 (Aug 24 → Nov 1) | **Shipped early (v1)** — five agents (Recall, Concierge, Curator, Decision, Curriculum), agent runtime, GuardianAgent, dashboard, Mind Map, Personality Mirror all live as of cloud rebuild 2026-05-18 + extension rewrite 2026-05-30 | KPIs not yet measured (need ≥4 weeks of agent runs in user cohort) | Original P2 dates are **moot for build**; KPI measurement is the new gate |
| P3 IaaS    | weeks 25–36 (Nov 2 → Feb 7)  | **Foundation shipped, public launch pending** — `/v1/*` routes + tenant scoping + usage counters; dev dashboard + OpenAPI + Stripe Meters still to build (plan §12 WS-8)                                                              | n/a until launch                                                   | On original schedule for public launch                                    |

**Implication for the phase-gate model:** the original "ship phase → measure → go/no-go" cadence no longer matches reality. The system can't roll back v2.0.0 if P0 KPIs miss — that genie's out. The kill criteria are still useful as **forward-looking pivot triggers** ("if Recall isn't useful, replace it") but not as "should we even build it."

**Recommendation pending review:** collapse the next 12 weeks into a single observation phase ("**P2.5 Listening**") with the KPI dashboards from §2 wired up, then make a real go/no-go on P3 IaaS public launch in August with two months of telemetry.

This recommendation is not yet a decision. The 2026-05-30 audit + development plan are the working surfaces until a refreshed roadmap lands.

This is the **master execution plan**. Every other doc supports it. If
something here conflicts with a feature spec or a doc, this wins —
update the spec, not this.

---

## 0. Operating principles

1. **Ship the smallest thing that proves the next bet.** Every phase has
   one falsifiable hypothesis and one user-facing surface that tests it.
2. **Kill criteria are real.** If a phase fails its kill criteria, we
   pivot — we do not "give it one more sprint."
3. **No parallel new bets while a current bet is unresolved.** Solo /
   small-team focus discipline. The temptation to start the IaaS sales
   motion while the consumer product is unproven is the biggest
   distraction risk; this doc forbids it explicitly.
4. **Boring tech, novel product.** Every layer of the stack should be a
   load-bearing choice from [0005-tech-stack](0005-tech-stack.md);
   novelty lives in the data model and product, not in build tools.
5. **Two-week sprints, no exceptions.** Demos every Friday of week 2,
   even if the demo is "this thing didn't work."

---

## 1. Phase map (12 months)

```
NOW                P0 (6w)            P1 (8w)             P2 (10w)            P3 (12w)
│                  Capture works      Memory feels        Agents work the     IaaS lands
│                  │                  magical             graph for you       first 10 paying
│                  │                  │                   (ADR-0012)          tenants + agents
└──> 2026-05      └──> 2026-06       └──> 2026-08        └──> 2026-11        └──> 2027-02
```

| Phase          | Original window              | Code status (2026-05-30)                                                                                                                                                                 | Hypothesis                                                                                                                                | Surface tested                                                        | Kill criterion (still load-bearing as a pivot trigger)                                                                                                                                                                                                                        |
| -------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0** Capture | weeks 1–6 (May 17 → Jun 28)  | **Shipped early.** Extension v2.0.0 capture pipeline (15 platforms, dwell + search) + web /paste + cloud `/intelligence/signals` ingest all live.                                        | A user can capture interesting attention into Recome from any device in <5s with no install                                               | `/paste` web + PWA share-sheet                                        | If <20% of cohort captures ≥10 items in week 1, the friction model is broken — go re-design before building chat.                                                                                                                                                             |
| **P1** Memory  | weeks 7–14 (Jun 29 → Aug 23) | **Partially shipped early.** Dashboard v2 (trails), Mind Map, weekly digest infra live. Bulk-import surface deferred (plan §11 WS-7).                                                    | Users come back in week 2 because the trail/dashboard surfaces things they forgot they cared about                                        | Dashboard v2 + bulk import + weekly digest email                      | If week-2 retention <25% in the cohort that captured ≥10 items in P0, the graph isn't producing recall value — re-examine extraction & ranking before chat.                                                                                                                   |
| **P2** Agents  | weeks 15–24 (Aug 24 → Nov 1) | **Shipped early (v1).** Five agents (Recall, Concierge, Curator, Decision, Curriculum) + Guardian + dashboard + Mind Map + Personality Mirror live. Concierge price-vendor = ADR-0017.   | Background agents working the user's interest graph deliver value Perplexity Memory + Comet structurally cannot (proactive, not reactive) | Concierge + Curator + Recall + Mind Map + Personality Mirror (opt-in) | If ≥70% of active users do not enable at least one agent OR per-user agent cost exceeds $1/mo OR Mind Map weekly opens <2/user, the proactive thesis isn't landing — re-examine ranking + onboarding before P3. See [ADR-0012](0012-active-agents-and-personality-mirror.md). |
| **P3** IaaS    | weeks 25–36 (Nov 2 → Feb 7)  | **Foundation shipped, public launch pending.** `/v1/*` routes + tenant scoping + usage counters live; dev dashboard, OpenAPI, Stripe Meters daily rollup still to build (plan §12 WS-8). | At least one independent developer signs up, ships an integration to prod, and pays                                                       | Dev portal + API docs + first 10 customers                            | If we don't have 10 paying tenants in 12 weeks of GTM, the API is too narrow or too expensive — review pricing and reposition.                                                                                                                                                |

Each phase ends with a **go/no-go review** against its KPIs. The review
is a 90-minute meeting with one decision: continue, pivot, or shelve.

---

## 2. KPIs per phase

Hard numbers. Every cell is a leading indicator we can measure weekly.

### Phase 0 — Capture

| KPI                                      | Target         | Source             | Why                                                          |
| ---------------------------------------- | -------------- | ------------------ | ------------------------------------------------------------ |
| Capture conversion (sessions → ≥1 paste) | ≥40%           | Posthog            | If lower, the form is friction itself, not just the install. |
| Median time-to-first-capture             | <90s           | Posthog timer      | Onboarding speed.                                            |
| Captures per active user, week 1         | ≥10            | DB count           | Density needed for P1 to be testable.                        |
| Share-sheet capture share (of total)     | ≥25% by week 6 | Posthog UTM        | Validates the PWA bet.                                       |
| Extension repositioning churn            | <10% MAU drop  | Existing telemetry | Make sure we didn't cannibalize the working product.         |

### Phase 1 — Memory

| KPI                                               | Target              | Source         | Why                                     |
| ------------------------------------------------- | ------------------- | -------------- | --------------------------------------- |
| Week-2 retention (cohort: ≥10 captures in week 1) | ≥25%                | Posthog cohort | The aha-moment must land.               |
| Bulk-import adoption                              | ≥30% of new signups | Posthog event  | If lower, onboarding still feels empty. |
| Median trail strength viewed                      | ≥0.4                | Server metric  | Users seeing real trails, not stubs.    |
| Weekly digest open rate                           | ≥35%                | Email service  | The "we remembered for you" moment.     |
| Daily active users                                | 200                 | Posthog        | Volume to power P2 user tests.          |

### Phase 2 — Agents v1 (replaces Chat; see ADR-0012)

| KPI                                                        | Target         | Source                | Why                                                                                        |
| ---------------------------------------------------------- | -------------- | --------------------- | ------------------------------------------------------------------------------------------ |
| % active users with ≥1 agent enabled at end of phase       | ≥70%           | DB count              | If lower, agent value isn't landing in onboarding.                                         |
| Concierge: price-drop alerts that lead to purchase tracked | ≥10% of alerts | Server (decision log) | The headline value prop for the most concrete agent.                                       |
| Curator: weekly digest click-through                       | ≥40%           | Email + PWA push      | If lower, Curator picks are wrong; tune ranking.                                           |
| Recall: surfaced reminders rated "useful"                  | ≥60% of shown  | In-product thumb vote | Recall is the most uniquely-us agent; quality matters more than volume.                    |
| Mind Map view: weekly opens / active user                  | ≥2             | PostHog               | Reflection surface that converts users into evangelists.                                   |
| Personality Mirror opt-in rate                             | ≥30% of MAU    | DB                    | Opt-in metric, not push metric. Anything <30% means the framing is intimidating; redesign. |
| Agent cost per active user / month                         | <$1.00         | Provider bill / DAU   | Hard ceiling. Above this, GuardianAgent caps fire and ops budget conversation begins.      |

### Phase 3 — IaaS

| KPI                                                     | Target         | Source       | Why                                                      |
| ------------------------------------------------------- | -------------- | ------------ | -------------------------------------------------------- |
| Self-serve signup → first signal ingested               | ≥30%           | Posthog + DB | Activation rate that matters.                            |
| Median time-to-first-signal (signup → POST /v1/signals) | <30 min        | DB           | Onboarding works.                                        |
| Paying tenants by end of phase                          | ≥10            | Stripe       | Direct revenue signal.                                   |
| MRR at end of phase                                     | ≥$2,500        | Stripe       | Loose target; what matters is unit economics holding up. |
| Tenant churn, monthly                                   | <8%            | Stripe       | Stickiness signal.                                       |
| Support load per tenant                                 | <30 min / week | Calendar     | Founder time fence.                                      |

---

## 3. Milestone-level scope

Every milestone references features in [0007-feature-catalog](0007-feature-catalog.md).
Dates are end-of-week. Owner is who walks it through QA, not who codes
every line. **Solo team for now** — owner = founder unless noted.

### Phase 0 — Capture (May 17 → Jun 28)

| Week        | Milestone                                        | Features (0007) | Owner   | Exit criterion                                                 |
| ----------- | ------------------------------------------------ | --------------- | ------- | -------------------------------------------------------------- |
| W1 (May 24) | Paste + extract live in prod                     | F-101, F-102    | Founder | Paste a YouTube URL on mobile Safari, signal lands in DB       |
| W2 (Jun 7)  | PWA installable + share-sheet                    | F-103, F-104    | Founder | Share-sheet on iOS sends URL to /paste with prefill            |
| W3 (Jun 14) | Onboarding flow (signup → first capture in <90s) | F-105           | Founder | Time-to-first-capture instrumented, P50 <90s in dogfood cohort |
| W4 (Jun 21) | LLM topic enrichment replaces keyword scrape     | F-106           | Founder | Topic quality ≥4/5 in 50-URL audit                             |
| W5 (Jun 28) | Phase 0 review + cleanup                         | —               | Founder | All Phase 0 KPIs measured; go/no-go meeting                    |

### Phase 1 — Memory (Jun 29 → Aug 23)

| Week | Milestone                                               | Features     | Owner   | Exit criterion                                              |
| ---- | ------------------------------------------------------- | ------------ | ------- | ----------------------------------------------------------- |
| W6–7 | Bulk import: YouTube watch-history dump + Amazon orders | F-201, F-202 | Founder | New user can import 6mo of history in <10 min               |
| W8   | Bulk import: Reddit saved + Pocket export               | F-203        | Founder | Two more importers shipped                                  |
| W9   | Dashboard v2: trail-of-the-week + intent surfacing      | F-204, F-205 | Founder | Dogfood: surfaces ≥1 forgotten thing per week per dogfooder |
| W10  | Weekly digest email                                     | F-206        | Founder | First digest delivers; open rate measured                   |
| W11  | Memory recall test feature ("did you mean…")            | F-207        | Founder | Recall accuracy ≥70% in unit eval set                       |
| W12  | Cross-platform inference: related-topic recommendations | F-208        | Founder | "you also saw on Reddit" panel in dashboard                 |
| W13  | Decay & freshness tuning                                | F-209        | Founder | Old/dropped topics fade; recent ones surface first          |
| W14  | Phase 1 review                                          | —            | Founder | All Phase 1 KPIs measured; go/no-go meeting                 |

### Phase 2 — Agents v1 (Aug 24 → Nov 1)

Replaces the Phase-2 chat plan after ADR-0012. Old chat features
(F-301..F-307) are deprecated; see [0007 feature catalog](0007-feature-catalog.md)
for the new F-310..F-319 block.

| Week   | Milestone                                                                                           | Features     | Owner   | Exit criterion                                                                                          |
| ------ | --------------------------------------------------------------------------------------------------- | ------------ | ------- | ------------------------------------------------------------------------------------------------------- |
| W15–16 | Agent runtime: BullMQ workers + `tools/registered/` registry + `GuardianAgent` cost-cap enforcement | F-310, F-315 | Founder | One end-to-end scheduled agent pass runs against a real user graph with a real LLM call and a hard cap. |
| W17    | Concierge v1: `price_check` + `find_alternatives` tools + decision drafting                         | F-311        | Founder | 5 dogfooded purchase trails get 1 useful surfaced alternative or price change each.                     |
| W18    | Curator v1: `rss_fetch` + `youtube_uploads_check` + `summarize_topic` tools + ranking               | F-312        | Founder | Daily Curator output has ≥1 click-through per dogfooder per day.                                        |
| W19    | Recall v1: capture-triggered retrieval over 30-day forgotten window + 2/wk notification cap         | F-313        | Founder | Recall fires at least once per dogfooder per week with thumb-vote ≥60% useful.                          |
| W20    | Agent dashboard cards (per-agent status + last-run + actions surfaced) + per-agent pause toggle     | F-314        | Founder | Each dogfooder can see what every agent did this week and pause any of them in one click.               |
| W21    | Mind Map v1 (render user's graph as spatial map, time-scrub last 90 days, export PNG)               | F-318        | Founder | Mind Map renders in <1.5s for a user with 500+ topics; dogfooders open it ≥2×/week.                     |
| W22    | Personality Mirror v1 (opt-in, composition + trajectory; mirror-not-judgment copy review)           | F-319        | Founder | Opt-in flow ships with explicit consent + wipe; LLM cost ≤$0.10/user/week.                              |
| W23    | `/ask` route as thin invocation of Decision + Synthesist on demand (no streaming chat UI)           | F-316, F-317 | Founder | One-shot Q&A works; no chat UI.                                                                         |
| W24    | Phase 2 review                                                                                      | —            | Founder | All Phase 2 KPIs (agent adoption, Mind Map opens, Personality opt-in, cost ceiling) measured.           |

### Mobile track (parallel to Phase 2.5, ~3 weeks)

Added 2026-05-30 per [development plan WS-9](../2026-05-30-development-plan.md#13-ws-9--mobile-a-b-hybrid-pwa-native-share-extensions). Hybrid PWA + native share extensions so capture works from any native iOS / Android app, not just Chromium browsers.

| Week         | Milestone                                           | Files / Components                                                      | Owner   | Exit criterion                                                                                |
| ------------ | --------------------------------------------------- | ----------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------- |
| M-1 (~2d)    | PWA manifest + share-target wired to `/paste`       | `web/public/manifest.webmanifest`, `web/src/app/sw.ts`                  | Founder | Install `recome.app` as PWA on Android Chrome; share from any app → capture lands in `/inbox` |
| M-2 (~5d)    | iOS Share Extension (native Swift in `mobile/`)     | `mobile/ios/RecomeShare/`, JWT keychain group, `recome://auth` deeplink | Founder | Share from Reddit iOS app → signal POSTs to cloud with valid JWT                              |
| M-3 (~3d)    | Android Share Intent receiver (Kotlin in `mobile/`) | `mobile/android/app/src/main/`, `AndroidManifest.xml` intent filters    | Founder | Share from YouTube Android app → signal lands in cloud                                        |
| M-4 (buffer) | Expo host app shell (login + inbox stub + settings) | `mobile/app/`, Expo Router                                              | Founder | Internal TestFlight + Play Console internal track                                             |

### Phase 3 — IaaS (Nov 2 → Feb 7)

| Week   | Milestone                                                         | Features     | Owner   | Exit criterion                                                            |
| ------ | ----------------------------------------------------------------- | ------------ | ------- | ------------------------------------------------------------------------- |
| W25–26 | Self-serve onboarding: signup → API key → first signal in <30 min | F-401, F-402 | Founder | Activation funnel instrumented and tested with 3 external devs            |
| W27    | API docs site at docs.recome.app                                  | F-403        | Founder | Every /v1 endpoint documented with curl + JS + Python examples            |
| W28    | Quickstart SDKs: JS (npm) + Python (pip)                          | F-404        | Founder | Hello-world in <50 LOC each                                               |
| W29    | Customer dashboard: usage, keys, billing                          | F-405        | Founder | Tenant can rotate keys, see usage, upgrade plan                           |
| W30    | Stripe metered billing                                            | F-406        | Founder | Tier upgrade triggers Stripe subscription; usage metering reports monthly |
| W31    | Launch on Hacker News + Indie Hackers + dev forums                | —            | Founder | Launch posts live; collect signups                                        |
| W32–34 | First 10 customer onboarding & support                            | —            | Founder | 10 paying tenants live                                                    |
| W35    | gRPC API + webhook events for ingest completion                   | F-407        | Founder | Two enterprise-track features shipped                                     |
| W36    | Phase 3 review                                                    | —            | Founder | All Phase 3 KPIs measured; go/no-go meeting                               |

---

## 4. Cross-cutting tracks (always-on)

Not phases — continuous obligations that span every phase.

| Track                     | Cadence                                                                   | Owner   | Doc                                        |
| ------------------------- | ------------------------------------------------------------------------- | ------- | ------------------------------------------ |
| **Reliability / on-call** | Every incident → blameless post-mortem within 48h                         | Founder | [0010](0010-security-privacy-ops.md)       |
| **Cost watch**            | Weekly review of cloud spend; alert at +20% week-over-week                | Founder | [0011](0011-cost-and-iaas-gtm.md)          |
| **Security**              | Dependabot every Monday; secret-scan in CI; quarterly threat-model review | Founder | [0010](0010-security-privacy-ops.md)       |
| **User research**         | 1 user interview per week minimum, recorded in `research/`                | Founder | n/a                                        |
| **Telemetry hygiene**     | Every new surface ships with at least 3 events before launch              | Founder | [0010](0010-security-privacy-ops.md) §SLOs |
| **Doc currency**          | Every PR that changes scope or schema updates the relevant doc            | Founder | this doc                                   |

---

## 5. Hiring triggers

Premature hiring kills small teams. These are the **only** triggers
that justify making the first hire:

- **Engineering hire (full-stack):** Triggered by Phase 1 going green
  AND P2 chat work blocking on capacity. Specifically: 2+ chat features
  delayed by >1 week each due to founder bandwidth.
- **Founding designer / DX hire:** Triggered by IaaS reaching 25+ paying
  tenants AND a dev-experience NPS <40.
- **First sales hire:** Triggered by ≥3 inbound enterprise leads /
  month for 2 consecutive months. Until then, founder owns sales.
- **Ops / SRE hire:** Triggered by ≥2 P1 incidents per quarter or
  on-call burden >5hrs / week sustained over 6 weeks.

Do not hire ahead of these triggers. Each hire adds management overhead
that destroys output for the next 3 months.

---

## 6. Funding milestones (informative — not required to execute)

If raising:

- **Pre-seed ($300k–$750k)** — justified after Phase 1 hits its KPIs.
  Story: "20%+ week-2 retention on a memory product, here's the data."
- **Seed ($1.5M–$3M)** — after Phase 3 IaaS validation. Story: "Two
  proven monetizable surfaces, 10+ paying tenants, here's revenue."

Until then, the company is cash-efficient enough to run on founder
runway + AWS/Fly free credits + the small SaaS bill (Postgres, Neo4j
AuraDB free tier, Qdrant free tier, OpenAI usage).

---

## 7. Decisions explicitly deferred

Listed so they don't drift into scope under the radar. Each has an
implicit trigger that will force a decision.

| Decision                              | Defer until                                                      | Where it goes                               |
| ------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------- |
| Final brand for IaaS product          | P3 start                                                         | new ADR                                     |
| Native iOS/Android app                | After P3 + ≥5,000 MAU on PWA                                     | new ADR                                     |
| Telegram / iMessage / WhatsApp bots   | After P2 chat wins                                               | new ADR                                     |
| EU data residency                     | First EU enterprise deal                                         | [0010](0010-security-privacy-ops.md) update |
| Multi-region (latency)                | After p95 read latency exceeds 800ms for ≥30% of users           | [0011](0011-cost-and-iaas-gtm.md) update    |
| SOC 2 Type I                          | First enterprise customer asks                                   | new ADR                                     |
| Replace OpenAI embeddings with Voyage | If embedding cost >15% of revenue OR quality regression measured | [0005](0005-tech-stack.md) §embeddings      |

---

## 8. What we are NOT doing in the next 12 months

Explicit non-goals stop scope creep more effectively than priorities.

- Building a generic LLM chat product. We are personal memory + decision support.
- Acquiring users via paid ads before Phase 1 retention KPIs are green.
- Onboarding enterprise IaaS customers with custom contracts. Self-serve only.
- Supporting Slack / Discord / Notion / Linear integrations. Not the wedge.
- Investing in the extension beyond bug-fix maintenance.
- Building a recommendation API for commerce. The graph is general; the GTM is personal-memory.
- Federated learning / cross-tenant analytics. Single-tenant data only.
- On-premise / VPC-isolated deployments. Cloud-only.
