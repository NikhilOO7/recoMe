# 0011 — Cost, Scale & IaaS Go-To-Market

**Status:** Living document
**Last reviewed:** 2026-05-17
**Owner:** Founder / CTO + Founder / CEO

Two concerns that frequently get confused: **what the system costs us
to run** and **what we charge for it**. Kept in one doc because they
must be reasoned about together — pricing decoupled from cost is how
you go bankrupt.

---

## 1. Unit cost model (current)

Estimates per active user, per month. Numbers should be sourced from
provider pricing pages; review monthly.

### 1.1 Consumer user (typical Riya — 100 captures/mo, 30 chat queries/mo)

| Layer                                | Quantity                                 | Cost               |
| ------------------------------------ | ---------------------------------------- | ------------------ |
| OpenAI embeddings                    | ~100 captures × ~50 tokens avg × $0.02/M | **~$0.0001**       |
| OpenAI LLM (topic enrichment, F-106) | 100 × ~1500 in / 200 out tokens          | **~$0.50**         |
| Anthropic chat                       | 30 chats × ~2K in / 500 out tokens       | **~$0.18**         |
| Neo4j AuraDB Free → Pro share        | 1/<active users on tier>                 | <$0.10 at 1K users |
| Qdrant Cloud share                   | 1/<active users on tier>                 | <$0.05 at 1K users |
| Neon Postgres compute share          | —                                        | <$0.05             |
| Upstash Redis share                  | —                                        | <$0.05             |
| Fly.io compute share                 | —                                        | <$0.05             |
| Vercel bandwidth share               | —                                        | <$0.05             |
| Email (Resend) — 1 digest/wk = 4/mo  | —                                        | $0.001             |
| **TOTAL per consumer / mo**          |                                          | **~$1.00**         |

Driver of consumer cost: **LLM topic enrichment.** If usage spikes
(power-user with extension capturing 1000+ items/mo), cost can hit
$5/mo. Mitigations:

- Aggressive Redis cache (same URL never re-extracts).
- Batch extraction for bulk-import (one LLM call per 5 pages of
  similar context).
- Switch to GPT-4o-mini or Haiku for extraction (we use Sonnet today
  for quality). Quality reassessed quarterly.

### 1.2 IaaS tenant (typical Starter — 100k signals/mo, 1M queries/mo)

| Layer                                                                                                        | Quantity                               | Cost       |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------- | ---------- |
| OpenAI embeddings                                                                                            | 100k signals × ~30 tokens / 1M × $0.02 | **$0.06**  |
| OpenAI topic enrichment (none — IaaS callers send pre-extracted topics; we don't enrich for them by default) | —                                      | **$0**     |
| Anthropic chat (not applicable to IaaS — no chat in /v1)                                                     | —                                      | **$0**     |
| Neo4j compute share                                                                                          | 1/100 tenants on Pro tier              | **~$1**    |
| Qdrant compute share                                                                                         | 1/100 tenants on Standard tier         | **~$2.50** |
| Postgres compute share                                                                                       | —                                      | **~$0.10** |
| Fly bandwidth                                                                                                | 1M queries × ~1KB response             | **~$1**    |
| **TOTAL per Starter tenant / mo**                                                                            |                                        | **~$4.66** |

At $49/mo Starter pricing → **gross margin ~90%**. Healthy.

For PRO tier (1M signals, 10M queries): cost scales ~10× → ~$47/mo
cost vs $499/mo price → **gross margin ~90%**. Consistent because
costs are dominated by managed-service share, which scales sub-linearly
until tenant becomes large enough to need dedicated capacity.

Enterprise tier: priced on dedicated capacity + custom SLA; gross
margin target 70–80%.

### 1.3 Infra fixed costs (current baseline, even at 0 users)

| Item                                | Provider     | $/mo       |
| ----------------------------------- | ------------ | ---------- |
| Domain                              | Cloudflare   | $1         |
| Neo4j AuraDB Free                   | Neo4j        | $0         |
| Qdrant Free                         | Qdrant       | $0         |
| Neon Free                           | Neon         | $0         |
| Upstash Free                        | Upstash      | $0         |
| Fly Free (scale-to-zero)            | Fly          | $0         |
| Vercel Hobby                        | Vercel       | $0         |
| Resend Free (3k emails/mo)          | Resend       | $0         |
| PostHog Self-hosted (or Cloud free) | PostHog      | $0         |
| Sentry Developer                    | Sentry       | $0         |
| Better Stack Free                   | Better Stack | $0         |
| **TOTAL baseline**                  |              | **~$1/mo** |

Solo founder can run this indefinitely on free tiers. First paid step
likely around 200 DAU when Neon or Neo4j Free quotas bind.

---

## 2. Capacity planning

Triggers and what to do when each binds.

| Service           | Free-tier limit                 | Trigger to upgrade                        | First paid tier                       |
| ----------------- | ------------------------------- | ----------------------------------------- | ------------------------------------- |
| Neon Postgres     | 0.5 GB storage / 100 hr CPU     | 80% of either                             | Launch ($19/mo)                       |
| Neo4j AuraDB Free | 200k nodes / 400k relationships | 80% of either                             | Professional ($65/mo)                 |
| Qdrant Free       | 1 GB RAM, 1 vector cluster      | 80% RAM OR multi-tenant boundary          | Cloud Standard ($30/mo+)              |
| Upstash Redis     | 10k commands/day                | 80% of daily                              | Pay-as-you-go ($0.2/100k)             |
| Fly               | 3 shared CPU, 256MB             | Sustained high latency OR scale-up needed | Scale ($2/mo per machine + bandwidth) |
| Vercel            | 100GB bandwidth/mo              | 80% in any month                          | Pro ($20/mo)                          |
| Resend            | 3k emails/mo                    | 80%                                       | Pro ($20/mo for 50k)                  |
| OpenAI            | No free; pay-as-you-go          | n/a                                       | n/a                                   |
| Anthropic         | $5 free, then pay-as-you-go     | n/a                                       | n/a                                   |

Alert on each at 80% utilization; PR to upgrade auto-opened.

---

## 3. Cost watch

Spend tracker reviewed weekly by founder.

| Alert                           | Threshold                               | Action                                                                     |
| ------------------------------- | --------------------------------------- | -------------------------------------------------------------------------- |
| Total cloud spend WoW change    | +20% week-over-week                     | Investigate within 24h                                                     |
| Any single line item WoW change | +50%                                    | Investigate within 24h                                                     |
| Monthly spend vs forecast       | +15%                                    | Adjust budget; review pricing if persistent                                |
| OpenAI bill                     | >15% of MRR                             | Revisit embedding/extraction strategy ([0005 §1.4](0005-tech-stack.md#14)) |
| Per-user marginal cost          | >$1.50/mo consumer or >5% of IaaS price | Refactor hot paths                                                         |

---

## 4. IaaS pricing

Subject to change before public launch; current pricing model:

| Tier       | $/mo   | Signals/mo | Queries/mo | Embedding budget (incl.) | Overage                                  | Notes                                                      |
| ---------- | ------ | ---------- | ---------- | ------------------------ | ---------------------------------------- | ---------------------------------------------------------- |
| Free       | $0     | 1,000      | 10,000     | n/a                      | 429 — must upgrade                       | Hobby + evaluation only. No SLA.                           |
| Starter    | $49    | 100,000    | 1,000,000  | n/a                      | $0.50 / 10k signals, $0.10 / 10k queries | Self-serve. Email support.                                 |
| Pro        | $499   | 1,000,000  | 10,000,000 | n/a                      | $0.40 / 10k signals, $0.08 / 10k queries | Priority email + 24h SLA.                                  |
| Enterprise | Custom | Unlimited  | Unlimited  | Custom                   | —                                        | Dedicated capacity, SSO, DPA, 99.9% SLA. Volume discounts. |

Principles:

1. **No markup on pass-through embedding cost.** If a customer asks
   us to enrich (we don't today), we charge cost + 20% — transparent.
2. **Free tier is for evaluation, not for long-term hobby use.** No
   apologies for the 1K signal limit; serious users upgrade.
3. **Overage exists** so a tenant who has a viral week doesn't get
   429'd and lose their event. Soft default; can be hard-capped via
   dashboard toggle (for cost control).
4. **No usage cliffs in the dashboard.** Customers always see usage,
   quota, days remaining, projected overage.

### 4.1 Why these numbers

| Number                       | Source                                                                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| $49 Starter                  | Matches dev-tool norms (Hookdeck, Resend, Liveblocks at this tier). Affordable on a personal credit card; no procurement.                                 |
| $499 Pro                     | 10× Starter both in price and quota — keeps unit economics flat. Justifiable on a company credit card; below typical $10k enterprise approval thresholds. |
| 1K free signals              | Enough for "I tried it on 3 of my users" demo, not enough for a real prod integration. Forces the upgrade conversation.                                   |
| 10× queries-to-signals ratio | Typical IaaS workload: ingest is rare, query is hot.                                                                                                      |

---

## 5. IaaS go-to-market

### 5.1 Pre-launch (P3 W25–28)

- **Landing:** `recome.app/developers` — clean dev page, code snippet
  above the fold, "Get a free API key" CTA, 3 use cases (note apps,
  learning platforms, agentic AI products).
- **Docs:** Quickstart + reference at `docs.recome.app` (F-403).
- **Hello world:** ≤50 LOC in JS and Python. Embed in landing.
- **Pricing page:** the table above, with calculator widget.

### 5.2 Launch (P3 W31)

- **Hacker News:** "Show HN: We built a personal memory API — here's
  the architecture" — lead with the technical story, not the price.
  Founder available in comments all day.
- **Indie Hackers:** post in the API/Infra category.
- **r/MachineLearning, r/programming, r/webdev:** post where the
  conversation is honest and the framing is "interesting infra," not
  "you should buy this."
- **Twitter / X:** thread on the architecture choices (Neo4j +
  Qdrant decision, multi-tenant isolation, …). Show code.
- **Personal network outreach:** ~50 hand-written emails to people
  building products that could use personal memory. Personal, no
  template.
- **Status page + uptime history:** public from day one — credibility.

Target metric: **100 free signups in launch week**, of which 5–10
become paying within 30 days. Pareto: most paying will come from the
personal outreach, not the public posts.

### 5.3 Post-launch sales motion (P3 W32+)

- Self-serve only at the published tiers — no custom pricing without
  trigger.
- Inbound enterprise enquiries → 30-min call, qualify against three
  questions:
  1. Are you live in production today?
  2. Do you have a deployment of >10k end-users you'd integrate?
  3. Is decision-maker you (today) or procurement (months)?
     All three "yes" → enterprise pitch.
- Founder owns sales until [0004 §5](0004-production-roadmap.md#5)
  hiring trigger fires.

### 5.4 Content engine (continuous, starting P3 W26)

Two posts per month minimum, written by founder, on:

- Architecture deep-dives (`How we chose Neo4j + Qdrant over Pinecone`,
  `Multi-tenant graph isolation without database-per-tenant`).
- Customer integrations (with permission), framed as case studies.
- Benchmark posts (latency, cost vs alternatives).

Distribution: own blog at `recome.app/blog`, syndicated to dev.to,
HN submissions where genuine.

### 5.5 Anti-patterns

- No paid ads until organic CAC is measured for ≥3 months.
- No SDR-style cold email blast. Recome is not a procurement-pipeline
  product yet.
- No analyst briefings (Gartner / Forrester). Different category;
  we're not selling to those buyers.
- No conferences. Bad ROI at this stage.
- No "request a demo" — every prospect can self-serve a key.

---

## 6. Consumer pricing

Less developed than IaaS pricing; will be decided at end of P1 review
based on retention data. Working hypothesis:

| Tier | $/mo | What you get                                                                                     |
| ---- | ---- | ------------------------------------------------------------------------------------------------ |
| Free | $0   | Unlimited captures, dashboard, weekly digest, 50 chat queries / mo                               |
| Plus | $5   | Unlimited chat, bulk import unlimited, public trail sharing, custom decay settings               |
| Pro  | $12  | Plus + multi-device sync priority, email-forward inbox, API key for personal use, early features |

Drivers:

- Free has to be the daily-driver experience, otherwise we don't get
  the data density that makes it work.
- Plus is the natural upgrade for power users.
- Pro is the small bracket of users who treat Recome as serious
  infrastructure for their own workflow.

This is a hypothesis. Revisit with cohort revenue data at end of P2.

---

## 7. Unit economics targets (12-month)

| Metric                       | Target by Feb 2027 | Notes                                   |
| ---------------------------- | ------------------ | --------------------------------------- |
| Consumer MRR                 | $2,000             | ~400 Plus + 50 Pro subscribers          |
| IaaS MRR                     | $2,500             | 10 paying tenants, mix of Starter + Pro |
| Gross margin (blended)       | ≥80%               | Healthy for SaaS                        |
| CAC (consumer, organic only) | <$5                | Mostly word-of-mouth                    |
| LTV / CAC                    | >5                 | Healthy bar for early SaaS              |
| Burn rate                    | <$3k/mo            | Tracks against founder runway           |
| Months runway                | >12 at all times   | Conservative                            |

If these numbers are off by 3× to the bad side, we re-examine the
business; if off to the good side, we hire (per [0004 §5](0004-production-roadmap.md#5)).

---

## 8. Risks to unit economics

| Risk                                         | Probability                                | Impact | Mitigation                                                                           |
| -------------------------------------------- | ------------------------------------------ | ------ | ------------------------------------------------------------------------------------ |
| OpenAI/Anthropic price hike >2×              | Med                                        | Med    | Multi-provider; track per-call cost; switch to open models if necessary              |
| Neo4j AuraDB cost spike at scale             | Med                                        | High   | Cost watch; option to self-host on Fly at ~10× cheaper if Aurora bill exceeds $1k/mo |
| Qdrant Cloud cost spike                      | Med                                        | Med    | Self-host alternative documented; abstraction in place                               |
| Per-user cost > $1.50 consumer               | High if extension passive-capture is heavy | Med    | Cache + batch; rate-limit pathological cases                                         |
| IaaS price war (someone undercuts at $19/mo) | Low                                        | Med    | Don't compete on price; compete on graph quality + DX                                |
| Vercel bandwidth spike on launch             | Low                                        | Low    | CDN cache headers; static export of marketing routes                                 |
| Sudden free-tier abuse (1000 fake tenants)   | Med                                        | Low    | Require billing card on tenant > Free, OR cap tenants per user account at 1 free     |

---

## 9. Reporting cadence

| Report                   | Cadence                  | Audience          | Source                                              |
| ------------------------ | ------------------------ | ----------------- | --------------------------------------------------- |
| Weekly cost vs forecast  | Weekly Mon               | Founder           | Provider dashboards aggregated in a one-page Notion |
| Monthly P&L              | Monthly                  | Founder + advisor | Stripe + spend                                      |
| Quarterly KPI vs roadmap | Quarterly                | Founder + advisor | This doc + [0004](0004-production-roadmap.md)       |
| Public uptime / status   | Continuous               | Customers         | status.recome.app                                   |
| Public changelog         | On every meaningful ship | Customers         | recome.app/changelog                                |

---

## 10. When the model breaks

These are explicit "stop and re-evaluate" triggers:

- **Consumer retention KPIs miss in Phase 1 review.** Don't push to
  Phase 2 chat — first fix capture or memory.
- **IaaS launch acquires <5 paying tenants in 12 weeks.** Reposition
  product (chat-API instead of memory-API? sell to agent-frameworks?)
  before doubling down.
- **Per-user cost exceeds 30% of consumer ARPU.** Reprice or
  re-architect; do not absorb.
- **Founder burn rate >$3k/mo for 2 consecutive months without
  matching revenue growth.** Slow hiring; refocus on monetization.
