# 0004 — Production Roadmap

**Owner:** Founder / CTO
**Status:** Living document
**Last reviewed:** 2026-05-17
**Cadence:** Reviewed monthly; updated whenever scope, dates, or KPIs change.

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
│                  Capture works      Memory feels        Chat that wins      IaaS lands
│                  │                  magical             a comparison        first 10 paying
│                  │                  │                   │                   tenants
└──> 2026-05      └──> 2026-06       └──> 2026-08        └──> 2026-11        └──> 2027-02
```

| Phase          | Window                       | Hypothesis                                                                                         | Surface tested                                   | Kill criterion                                                                                                                                                  |
| -------------- | ---------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0** Capture | weeks 1–6 (May 17 → Jun 28)  | A user can capture interesting attention into Recome from any device in <5s with no install        | `/paste` web + PWA share-sheet                   | If <20% of cohort captures ≥10 items in week 1, the friction model is broken — go re-design before building chat.                                               |
| **P1** Memory  | weeks 7–14 (Jun 29 → Aug 23) | Users come back in week 2 because the trail/dashboard surfaces things they forgot they cared about | Dashboard v2 + bulk import + weekly digest email | If week-2 retention <25% in the cohort that captured ≥10 items in P0, the graph isn't producing recall value — re-examine extraction & ranking before chat.     |
| **P2** Chat    | weeks 15–24 (Aug 24 → Nov 1) | Personal-memory chat beats Perplexity for "what did I look at" queries in a side-by-side user test | `/ask` chat with streaming + tool-calling        | If >40% of test users prefer Perplexity on personal-memory questions after seeing both, the differentiator is too weak to monetize against — pivot to bundling. |
| **P3** IaaS    | weeks 25–36 (Nov 2 → Feb 7)  | At least one independent developer signs up, ships an integration to prod, and pays                | Dev portal + API docs + first 10 customers       | If we don't have 10 paying tenants in 12 weeks of GTM, the API is too narrow or too expensive — review pricing and reposition.                                  |

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

### Phase 2 — Chat

| KPI                                                         | Target                | Source               | Why                                                                                           |
| ----------------------------------------------------------- | --------------------- | -------------------- | --------------------------------------------------------------------------------------------- |
| Chat session conversion (visit → ≥1 question)               | ≥50%                  | Posthog              | If the empty-state is intimidating, redesign.                                                 |
| Personal-memory query share                                 | ≥60% of all questions | LLM classification   | If users are mostly asking world-knowledge questions, we're losing the Perplexity comparison. |
| Side-by-side test: Recome preferred                         | ≥60%                  | Live user test, n=30 | The hard one.                                                                                 |
| Chat-to-action conversion (Q → bookmark / decision / share) | ≥20%                  | Server               | Chat that doesn't change behavior is theater.                                                 |
| Median chat response time (p50)                             | <2.5s                 | Server metric        | LLM streaming time-to-first-token.                                                            |

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

### Phase 2 — Chat (Aug 24 → Nov 1)

| Week   | Milestone                                                                 | Features | Owner   | Exit criterion                                                                   |
| ------ | ------------------------------------------------------------------------- | -------- | ------- | -------------------------------------------------------------------------------- |
| W15–16 | Real LLM agent: replace keyword-theatre AgentController                   | F-301    | Founder | Streaming responses; tool-calls to graph; 5 canonical queries answered correctly |
| W17    | Chat UI v1: message history, streaming, sources panel                     | F-302    | Founder | End-to-end chat works on mobile + desktop                                        |
| W18    | Tool library: search graph, get trail, get intents, compare items, decide | F-303    | Founder | All 5 tools wired and used by agent                                              |
| W19    | Chat persistence + conversation memory                                    | F-304    | Founder | Multi-turn coherence over 10 turns                                               |
| W20    | Source citations + "explain why" panel                                    | F-305    | Founder | Every claim traces back to a signal                                              |
| W21    | Side-by-side test instrumentation (Recome vs Perplexity)                  | F-306    | Founder | Test live, recruiting started                                                    |
| W22    | Test live with 30 users; collect results                                  | —        | Founder | Side-by-side preference number landed                                            |
| W23    | Chat-to-action: bookmark, share-trail, decision-log                       | F-307    | Founder | Each chat ends with at least one action surface                                  |
| W24    | Phase 2 review                                                            | —        | Founder | All Phase 2 KPIs measured; go/no-go meeting                                      |

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
