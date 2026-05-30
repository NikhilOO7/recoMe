# 0014 — Unique Product Surfaces

**Status:** Living document — kept current as surfaces ship
**Date:** 2026-05-17 (originally), surface statuses verified 2026-05-30
**Owner:** Founder + Principal Engineering
**Reads with:** [ADR-0013 competitive positioning](0013-competitive-positioning.md), [ADR-0012 active agents](0012-active-agents-and-personality-mirror.md), [0007 feature catalog](0007-feature-catalog.md), [2026-05-30 full-project audit](../audits/2026-05-30-full-project-audit.md)

> **Last verified:** 2026-05-30. The §1 status column was refreshed against the cloud + web + extension trees. Section bodies (§2–§9) still describe each surface's design intent and may carry "what's still missing" claims that have shipped — section-level cleanup is a follow-up; the §1 table is authoritative for shipped vs not.

---

## 0. Purpose

ADR-0013 makes the strategic positioning argument. This doc makes the concrete-feature argument. For every product surface that is uniquely Recome (i.e. no competitor in [ADR-0013 §3](0013-competitive-positioning.md#3-battle-cards--head-to-head-against-every-named-competitor) can ship the same surface without invalidating their core product), we describe:

- **What the user sees** (UX in one paragraph)
- **Why it's structurally unique** (the comp-by-comp "structurally can't" argument)
- **What it requires from the system** (capture + storage + compute)
- **How it maps to existing code / what's still missing**
- **The PR-ready justification** ("we ship X because Y, and Perplexity/Glean/etc structurally can't")

If a proposed surface fails the structural-unique test, it goes in [0007 feature catalog](0007-feature-catalog.md) as a normal feature, not here. This doc is for the surfaces that define what we ARE.

Surfaces in this doc all have a feature ID `F-4xx`. The existing chat-replacement IDs `F-310–F-319` from ADR-0012 stay; this doc adds `F-401–F-408`.

---

## 1. The seven unique surfaces

| ID    | Surface                                                                                                                                              | Status (2026-05-30)                                                                                                                                                                                                                                                                 | Defends against                                                                         |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| F-401 | **Mind Map** — the user's own interest graph rendered as a navigable, time-scrubbable spatial visualisation                                          | **Shipped (v1, no time-scrub)** — `cloud/src/intelligence/MindMap.ts` + `GET /intelligence/mindmap?window=…` + `web/src/app/mind/page.tsx` (react-force-graph-2d). Time-scrub slider deferred (see plan §16.1). Cluster algorithm: Louvain via `graphology-communities-louvain`.    | All — nobody renders the user's graph back to them                                      |
| F-402 | **Recall** — surfaces the right forgotten capture at the right moment of re-engagement                                                               | **Shipped** — `cloud/src/agents/recall/RecallAgent.ts` (deterministic, 0 LLM tokens, ≤2/wk per user). Surfaces in extension sidebar + bottom-left InsightCard + popup inbox + web `/inbox` + web `/ask` audit.                                                                      | Perplexity Memory, Claude Memory, all chat-only memory products                         |
| F-403 | **Cross-platform Concierge** — knows your prior YouTube/Reddit research when you're on Amazon, surfaces it pre-purchase                              | **Shipped with stub vendor** — `cloud/src/agents/concierge/ConciergeAgent.ts` + `Watchlist.ts` (in-memory) + extension `ConciergeFlow.ts` (auto on PDP) + web `/ask` Watchlist column. **Production gated by `INTELLIGENCE_AGENTS_PRICE_VENDOR != stub`** — vendor pick = ADR-0017. | Karma, Honey, all single-vertical shopping agents                                       |
| F-404 | **Curriculum mode** — "I want to learn X" → agent bridges from your existing graph to a paced reading list anchored in things you already understand | **Shipped (deterministic v1)** — `cloud/src/agents/curriculum/CurriculumAgent.ts` + extension `CurriculumFlow.ts` (manual button on Udemy / Coursera / edX overlays). LLM-personalized version + EvalSet deferred.                                                                  | All — requires the user's prior graph, which no one else has                            |
| F-405 | **Interest-Graph-as-API** (`/v1`) — same graph, exposed to other developers with API keys, tenant isolation, usage-based billing                     | **Foundation shipped** — `cloud/src/iaas/` (ApiKeyService, tenantUserId, V1Controller, usageTracker). **Public launch pending** — developer dashboard, OpenAPI spec, Stripe Meters daily rollup (see plan §12 WS-8).                                                                | Glean (B2B-only), Perplexity (no IaaS), Anthropic (no graph), Karma (single vertical)   |
| F-406 | **Decision Completion** — proactively surfaces stalled decisions ("you've been comparing X for 23 days — decide?") with full prior context           | **On-demand v1 shipped** — `cloud/src/agents/decision/DecisionAgent.ts` + extension `OverlayChat.ts` (multi-turn) + web `/ask` Advisor column. Cites top intents matching topic/entity hints. **Proactive stalled-decision detection** still spec.                                  | All chat products (no temporal stall detection); all browsers (no cross-session memory) |
| F-407 | **Attention Composition Report** — descriptive weekly breakdown of your attention shape (not personality inference; framing matters)                 | **Composition shipped** — `cloud/src/intelligence/PersonalityMirror.ts` + web `/personality` (opt-in). 30-day breakdown live; **trajectory + underrepresented-dimensions surfaces deferred** (see plan §16.2).                                                                      | All — nobody has the underlying signal-level cross-platform data                        |
| F-408 | **The Audit Log of You** — full, exportable, deletable record of every signal we have on you, every agent run, every event we surfaced               | **Shipped (user-wide delete + export)** — `cloud/src/intelligence/AuditLog.ts` + `GET /intelligence/audit-log` + `/export` + `DELETE /intelligence/me` + web `/audit-log`. **Per-row Signal / AgentRun delete deferred** (plan §16.3).                                              | All — most competitors deliberately obscure this; we make it the loud feature           |

The rest of this doc is one section per surface.

---

## 2. F-401 — Mind Map

### 2.1 What the user sees

Opening `recome.app/mind` or the `/mind` route in the PWA, the user sees a force-directed graph of their own topics. Topic nodes are sized by signal count over the past 30 days, colored by cluster (semantic communities — "work tools", "home setup", "media diet"). Edges show co-occurrence within sessions or shared platforms.

A time-scrub slider at the bottom lets the user replay the past 90 days — watching topics emerge, grow, decay, and connect.

Click a topic node → drills into the trails view for that topic, showing every signal that contributed.

Mouse-hover an edge → shows the sessions or pages that connected the two topics.

Export buttons in the corner: PNG (sharable), SVG (vector), JSON (the underlying nodes + edges).

### 2.2 Why it's structurally unique

| Competitor               | Why they can't ship this                                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Perplexity Memory        | Memory is opaque text. There's no graph internally to render. Rebuilding their memory as a graph would invalidate the "you don't have to manage memory" pitch. |
| Claude Memory + Dreaming | Memory is per-agent and per-session. No cross-domain personal graph exists in the architecture to render.                                                      |
| Mem.ai / Roam / Obsidian | They render NOTE graphs. Different artefact — links between things YOU TYPED. They have nothing to render for the 95% of users who don't take notes.           |
| Glean                    | They render the org's graph. Personal graph inside it is for the IT admin's view of work patterns, not for the employee's own browsing across life.            |
| Karma / Honey            | They have a wishlist, not a graph. No nodes-and-edges artefact exists.                                                                                         |
| Comet / Arc              | They have browsing history (per browser instance). They don't have entity extraction or relations across topics.                                               |

### 2.3 What it requires from the system

- **Graph schema with edges between topics:** already present per [ADR-0001 / 0009 data model](0009-data-model.md). `(Topic)-[:RELATED_TO]->(Topic)` exists; we'll add `RELATED_TO` weighting from co-occurrence within `Session` and `Page` containment.
- **Cluster detection:** Louvain or Leiden community detection on the user's subgraph. Runs server-side, cached per user, recomputed nightly or on significant signal addition.
- **Time-windowed projection:** Cypher queries that project the graph for `(now - N days, now)` for the time-scrub.
- **Force-directed rendering:** D3-force or react-force-graph in the browser. Lazy-loaded, only on `/mind`.
- **Server endpoint:** `GET /intelligence/mindmap?window=90d` returning `{ nodes, edges, clusters, generatedAt }`.

### 2.4 What's missing from current code

- Cluster detection — new function in [cloud/src/intelligence/](../../cloud/src/intelligence/), uses `graphology` library for Louvain.
- Time-windowed graph projection method on [GraphRepository](../../cloud/src/graph/GraphRepository.ts).
- New endpoint on [IntelligenceController](../../cloud/src/intelligence/IntelligenceController.ts).
- Web route `web/src/app/mind/page.tsx` with react-force-graph.

Estimate: **5–7 engineering days**. Documented in [0004 production roadmap §Phase 2 W21](0004-production-roadmap.md).

### 2.5 PR-ready justification

> Ship Mind Map because the graph is our moat and we should make it visible. Perplexity / Claude / Mem / Karma / Comet structurally cannot show the user a graph of their own attention — Perplexity and Claude store opaque text memories, Mem renders note-graphs (different artefact), Karma has no graph, Comet has browsing history not entities. ADR-0013 §5.2 makes the durability case.

---

## 3. F-402 — Recall (already shipping)

### 3.1 What the user sees

User opens a YouTube video about standing desks. A few seconds later (or in the morning digest, depending on Guardian quiet hours), an inbox notification appears: "You looked at this 21 days ago — still relevant" with the Verge review the user bookmarked three weeks earlier but never returned to. Click → opens that review. Thumb up / down → improves ranking.

### 3.2 Why it's structurally unique

| Competitor                                 | Why they can't ship this                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Perplexity Memory                          | Their memory only includes things you told Perplexity. The Verge review you bookmarked silently isn't in their memory.  |
| Claude Memory                              | Same — captures from chat, not from your browsing.                                                                      |
| Mem.ai                                     | You'd have to have manually pasted the Verge review into Mem for it to surface it. Most users don't.                    |
| Karma                                      | Captures shopping intent only. Doesn't see content sites.                                                               |
| Comet                                      | Sees the YouTube view IF you watch in Comet. Doesn't see the Verge bookmark if you read it on Safari mobile.            |
| Limitless (Meta-absorbed, currently inert) | Even before sunset, screen-capture-everything was the wrong primitive. Recall reads our typed graph, not screen pixels. |

### 3.3 What it requires from the system

- Event-triggered agent runtime — built ([cloud/src/agents/](../../cloud/src/agents/)).
- Cypher query for "signals on topic T older than 14d, excluding the trigger signal" — built ([RecallAgent.queryForgotten](../../cloud/src/agents/recall/RecallAgent.ts)).
- Ranking math (triangular age-factor × weight) — built and tested ([RecallAgent test suite](../../cloud/src/agents/__tests__/RecallAgent.test.ts)).
- Guardian throttle ≤2/wk and quiet hours — built ([GuardianAgent](../../cloud/src/agents/GuardianAgent.ts)).
- Inbox surface in dashboard — endpoint built (`GET /intelligence/inbox`); UI needs to render it.

### 3.4 What's missing

- Web inbox UI at `recome.app/inbox` rendering AgentEvents from the new endpoint.
- Optional LLM copy-polish step (currently the title is templated: `"You looked at this N days ago — still relevant"`). Future work, kept within Recall's $0.05/user/mo budget per [ADR-0012 §4](0012-active-agents-and-personality-mirror.md#4-cost-model-impact).

Estimate to feature-complete: **2 engineering days** (UI work).

### 3.5 PR-ready justification

> Recall is the most uniquely-Recome surface — it requires the temporal cross-platform graph that no chat memory product has. Per ADR-0013 §3.1–3.6, every named competitor structurally cannot surface a forgotten Verge bookmark when the user opens YouTube on the same topic.

---

## 4. F-403 — Cross-platform Concierge

### 4.1 What the user sees

User lands on the Amazon page for a standing desk. PWA push notification (or inbox card, depending on quiet hours): "Three weeks ago this YouTube reviewer said this exact model has bad bearings. There's a $200-cheaper alternative on Wayfair you also viewed."

Action buttons: "Open the YouTube review" / "Compare on Wayfair" / "Snooze this product."

Concierge does NOT click "buy now" for the user. Recommend only — see [ADR-0012 §5](0012-active-agents-and-personality-mirror.md#5-trust--safety-constraints-binding).

### 4.2 Why it's structurally unique

> **Re-audited 2026-05-17** — Comet Assistant + Personal Computer can now BROWSE and shop autonomously. The differentiator narrows to "we have the user's cross-platform prior research; they don't." Updated table.

| Competitor                   | Why they can't ship this                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Karma                        | Karma explicitly does not collect browsing history ([ADR-0013 §3.6](0013-competitive-positioning.md#36-vs-karma--honey--shopping-agents)). Without knowing the user watched a YouTube review three weeks ago, this surface is impossible.                                                                                   |
| Honey                        | Same architectural constraint.                                                                                                                                                                                                                                                                                              |
| Perplexity Comet             | Comet Assistant can shop autonomously (book, fill forms, manage cart). But it captures only what happens IN Comet — the iOS YouTube app review, the Android Reddit thread, the Substack post you read on Safari are invisible. They can act on commerce; they can't ground recommendations in your cross-platform research. |
| Perplexity Personal Computer | Reads your Mac (browser history, calendar, files). Doesn't read your phone YouTube or your work-laptop Amazon comparisons. Same cross-platform gap.                                                                                                                                                                         |
| Amazon's own recommendations | Optimised for purchase conversion. Negative-signal surfacing ("don't buy this; bearings are bad") is antithetical to Amazon's business model.                                                                                                                                                                               |
| Reviews aggregators          | They have reviews but not the user's prior research. Generic "best of" lists.                                                                                                                                                                                                                                               |

### 4.3 What it requires from the system

- The graph (existing).
- An adapter for live price + availability data — Keepa, RainforestAPI, or Amazon Affiliate API. Make-vs-buy decision: **buy.** Scraping at scale is a legal/ops nightmare per [ADR-0012 open question 4](0012-active-agents-and-personality-mirror.md#10-open-questions).
- Concierge agent in [cloud/src/agents/concierge/](../../cloud/src/agents/) — same runtime as Recall, scheduled instead of event-triggered, with the price-check tool.
- `compareOffers(entity)` tool that orchestrates price-check across all retailers for one entity.
- Privacy: cross-context surfacing only with explicit consent (separate from the base capture consent).

### 4.4 What's missing

- Price-API vendor decision (separate ADR — likely **0015-price-data-vendor**).
- Concierge agent implementation. The runtime is built; the agent class isn't.
- Tools: `priceCheck`, `compareOffers`, `findAlternatives`.
- Notification delivery channel (PWA push needs VAPID — also a [0004 Phase 2 W18 item](0004-production-roadmap.md)).

Estimate to ship: **2 weeks** (1 week for vendor selection + integration, 1 week for agent + UI).

### 4.5 PR-ready justification

> Ship cross-platform Concierge because we are the only product positioned to surface "you watched a YouTube review that said this model has bad bearings" at the moment of Amazon purchase intent. Karma can't (privacy stance), Honey can't (no content visibility), Comet can't (browser-bound capture). The capture topology in ADR-0013 §5.1 is the moat that makes this surface possible.

---

## 5. F-404 — Curriculum mode

### 5.1 What the user sees

User opens `recome.app/grow`, types: "I want to understand climate adaptation policy."

System reads the user's graph:

- Detects related topics already in the graph (e.g. "renewable energy", "carbon pricing", "urban planning") with HAS_INTENT > some threshold.
- Generates a 4-week reading list where each week's content bridges from a known anchor to a new concept:
  - Week 1: a long-form essay from a Substack the user reads, on a topic adjacent to climate-adaptation.
  - Week 2: a 30-minute YouTube interview the user is likely to engage with based on past creator preferences.
  - Week 3: a paper or report, framed in terms of concepts from weeks 1–2.
  - Week 4: synthesis — Synthesist agent ([ADR-0012 §2.2 Tier 3](0012-active-agents-and-personality-mirror.md#22-six-agents-three-priority-tiers)) writes a personalized weekly summary.

The user marks items as "read", which feeds back into the graph as signals.

Importantly: the curriculum frames the new topic in language and references the user already knows. **The bridge is personalised, not just the destination.**

### 5.2 Why it's structurally unique

| Competitor                  | Why they can't ship this                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Perplexity                  | Can answer "what should I read about climate adaptation?" — generic top-10 lists. Cannot bridge from your specific prior interests. |
| Claude / ChatGPT            | Same. Even with Memory, the bridge requires the cross-platform interest graph, which they don't have.                               |
| Coursera / Khan / Brilliant | Sell their own content. They optimise for completion-of-their-course, not for connecting your prior life to a new topic.            |
| Newsletters / RSS readers   | Push content; don't personalise the _bridge_.                                                                                       |
| Mem.ai                      | Can suggest related notes — but only if you've already typed notes on the topic.                                                    |

### 5.3 What it requires from the system

- Graph traversal: find topics with high HAS_INTENT.strength that are graph-adjacent (within 2 hops via RELATED_TO) to the target topic.
- Content discovery via Curator-agent tools — RSS, YouTube uploads check, Substack feeds.
- LLM ranking: given user's revealed reading patterns (long-form vs short, video vs text, creator preferences) score candidate content items.
- Conversation persistence so the user can iterate ("show me a more advanced week 2").

### 5.4 What's missing

- Curator agent ([ADR-0012 §2.2 Tier 1](0012-active-agents-and-personality-mirror.md#22-six-agents-three-priority-tiers)) — not yet built. RSS / YouTube tools needed.
- `/grow` route in web.
- Topic-bridging prompt design + eval set.

Estimate: **2–3 weeks** (Curator first, then the curriculum UX layer).

### 5.5 PR-ready justification

> Ship Curriculum mode because we can personalise the BRIDGE between what you know and what you want to learn — not just the destination. Perplexity / Claude / Coursera / Khan can only personalise the destination. The bridge requires the user's existing cross-platform graph, which is our moat per ADR-0013 §5.1.

---

## 6. F-405 — Interest-Graph-as-API

### 6.1 What the user sees (the user here is a developer)

A developer signs up at `developer.recome.app`, creates a tenant ("My Notes App"), mints an API key, hits:

```bash
curl -X POST https://api.recome.app/v1/signals \
  -H "Authorization: Bearer rk_live_..." \
  -H "X-User-Id: their-internal-user-42" \
  -d '{"signals":[{"kind":"view","platform":"youtube","pageUrl":"...","topics":[{"name":"standing desks"}]}]}'
```

Then later:

```bash
curl https://api.recome.app/v1/users/their-internal-user-42/trails \
  -H "Authorization: Bearer rk_live_..." \
  -H "X-User-Id: their-internal-user-42"
```

Returns the user's cross-platform trails. The developer can embed this in their own product — a note app, a learning platform, a commerce site — and give their users "personal interest memory" without building any of the underlying graph + vector + capture infrastructure.

Billed via Stripe Meters: usage-based. Free tier 1K signals + 10K queries/mo; tiers up to Enterprise.

### 6.2 Why it's structurally unique

| Competitor       | Why they can't ship this                                                                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Glean            | Enterprise-only sales motion. $7.2B valuation built on selling to CIOs. Adding an indie-developer IaaS would dilute their pitch and require a different sales org.          |
| Perplexity       | Sells answers, not a graph. Their Memory is per-user and proprietary; opening it up as an API would invalidate the "you don't have to manage memory" UX.                    |
| Anthropic        | Sells LLM API and Claude Managed Agents. Doesn't have a personal-interest-graph layer — would have to build it from scratch. (And they have richer revenue lines to chase.) |
| People Data Labs | Sells contact-data records — different category. Privacy ANTI-pattern from our perspective.                                                                                 |
| Karma            | No API, single vertical.                                                                                                                                                    |
| OpenAI / Google  | Not in this category at all. Could enter, but the platform-distrust friction would be massive ("Google's API knows everything you read?").                                  |

### 6.3 What it requires from the system

- Tenant + API key model — built ([cloud/src/iaas/ApiKeyService.ts](../../cloud/src/iaas/ApiKeyService.ts)).
- API key middleware + tenant scoping — built ([cloud/src/iaas/apiKeyMiddleware.ts](../../cloud/src/iaas/apiKeyMiddleware.ts), [tenantUserId.ts](../../cloud/src/iaas/tenantUserId.ts)).
- V1 controller — built ([cloud/src/iaas/V1Controller.ts](../../cloud/src/iaas/V1Controller.ts)).
- Per-tenant per-period usage counters — built ([cloud/src/iaas/usageTracker.ts](../../cloud/src/iaas/usageTracker.ts)).
- Stripe Meters integration — pending ([0004 roadmap Phase 3](0004-production-roadmap.md)).
- Developer dashboard UI — pending.
- Public docs site `docs.recome.app` — pending.
- OpenAPI spec generated from Zod schemas — pending.

### 6.4 PR-ready justification

> Ship the Interest-Graph-as-API because no one in the personal-attention category has done it and the work to enable it is largely behind us. The dual-sided model (consumer + IaaS sharing one backend) is the third durable moat per ADR-0013 §5.3. Stripe / Twilio playbook applied here.

---

## 7. F-406 — Decision Completion

### 7.1 What the user sees

The user has been comparing standing desks for 23 days — multiple YouTube videos, three Reddit threads, four Amazon page views. They haven't bought one. The graph shows an HAS_INTENT relation with strength growing, no `purchase` signal terminating it.

After day 21 (configurable threshold), Continuity agent fires:

> "You've been on the fence about standing desks for 23 days. You've evaluated three: [Uplift V2, Branch, Vari]. The Reddit consensus you saw said Uplift is the safer choice for >5 years of use. Want me to walk through your evidence and recommend?"

If user says yes → opens Decision agent ([ADR-0012 §2.2 Tier 2](0012-active-agents-and-personality-mirror.md#22-six-agents-three-priority-tiers)) which produces a citation-grounded recommendation: full trail, revealed criteria from past signals, recommendation with reasoning, links back to source content.

If user says "snooze 30 days" → Continuity respects that.

### 7.2 Why it's structurally unique

| Competitor       | Why they can't ship this                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| Perplexity       | Doesn't have your purchase intent or your prior comparisons. Can answer "best standing desks" generically.        |
| Claude / ChatGPT | Same. Memory has facts about you, not the temporal arc of an unfinished decision.                                 |
| Amazon           | Optimised for conversion. Would never tell you "you've been overthinking this; here's the evidence."              |
| Karma            | Has wishlist intent but no content-research context. Can tell you about price drops, not about stalled decisions. |
| Comet            | Could in principle, but browser-bound capture misses signals from mobile YouTube app, Reddit mobile app, etc.     |

### 7.3 What it requires from the system

- Detection: scheduled query for `HAS_INTENT` edges with `strength > threshold AND lastSeen > 21d AND no purchase signal on the entity`.
- Continuity agent + Decision agent (both spec'd in [ADR-0012 §2.2](0012-active-agents-and-personality-mirror.md#22-six-agents-three-priority-tiers)).
- Confidence in the user's evaluation set (the three desks they're considering) — requires entity extraction on the captured signals to identify product candidates.
- Notification + on-demand path (user opens the Decision agent from the inbox card).

### 7.4 What's missing

- Both Continuity and Decision agents not yet implemented. Runtime is built.
- Entity-level intent strength on the graph (currently we have HAS_INTENT on Topic; product-level intent on Entity needs schema addition).
- "Almost bought" telemetry — derived from repeated views of the same Page node without a downstream purchase signal.

Estimate: **3 weeks** (entity-intent schema + agent + UX).

### 7.5 PR-ready justification

> Ship Decision Completion because we are the only product with the temporal cross-platform graph that can detect a stalled decision and ground a recommendation in YOUR prior evidence. Amazon won't, Perplexity can't, Karma doesn't see the YouTube research, Comet only sees what's in its browser.

---

## 8. F-407 — Attention Composition Report

### 8.1 What the user sees

Every Sunday morning, the user gets an email and an inbox card:

> Your week in attention
>
> - 38% career & craft (peaks: Tuesday evening, Saturday morning)
> - 22% home setup (drove 12 signals; still researching the desk)
> - 18% news & culture (dropping from 24% last week)
> - 14% entertainment
> - 8% relationships
>
> Trends: career/craft up 12% week-over-week. You haven't touched outdoor / fitness in 6 weeks. Want to set a target?

If user wants to set a target ("I want to spend more attention on writing"), the system records that as an `aspiration` on the graph. Curator agent prioritizes writing-related content; Recall demotes things that fight the target.

**Hard framing constraints** ([ADR-0012 §2.4 F-319](0012-active-agents-and-personality-mirror.md#24-mind-map--personality-mirror)):

- This is **opt-in**. Default off.
- **Mirror, not judgment.** Never "you should." Always "here's what your attention looks like."
- **Single-button wipe.** Deletes all derived composition + trend inferences without touching the underlying graph.
- **Never shown to anyone but the user.** Not in IaaS responses. Not in admin tools.
- **No psychometric labels.** No Big Five. No MBTI. No "type." Descriptive composition only.

### 8.2 Why it's structurally unique

| Competitor                               | Why they can't ship this                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Perplexity / Claude                      | No cross-platform signal-level data to compute composition from.                                                                      |
| Limitless (sunset)                       | Even before, screen-capture didn't have the entity-level structure to compute thematic composition.                                   |
| Mem.ai                                   | Could in principle on the notes you've typed — but that's the composition of your written output, not your attention.                 |
| Personality apps (16Personalities, etc.) | Self-report quizzes, not behavioural data. We are categorically not that.                                                             |
| Google / Apple                           | Have the data in principle but blocked by their own scale (regulatory + reputational risk of telling 4B users their attention shape). |

### 8.3 Why we'll be careful

This is the highest-privacy-blast-radius feature we'll ever ship. Done badly = press disaster. Done well = the surface that converts free users into evangelists.

Mitigations encoded in [ADR-0012 §2.4 F-319](0012-active-agents-and-personality-mirror.md#24-mind-map--personality-mirror) constraints. They are non-negotiable.

### 8.4 What it requires from the system

- Topic clustering (same primitive as Mind Map F-401).
- Weekly digest cron — Synthesist agent ([ADR-0012 §2.2 Tier 3](0012-active-agents-and-personality-mirror.md#22-six-agents-three-priority-tiers)).
- `aspiration` schema on the graph (`(:User)-[:HAS_ASPIRATION { strength, createdAt, targetTopicId }]->(:Topic)`).
- Per-user opt-in flag with explicit consent flow.

### 8.5 What's missing

- Synthesist agent.
- Topic clustering (shared with F-401).
- Aspiration schema + UI to set/clear/wipe.
- Email template + delivery.

Estimate: **2 weeks after F-401 (Mind Map) ships** (much of the analytics infrastructure is shared).

### 8.6 PR-ready justification

> Ship Composition Report (opt-in) because we can show the user something nobody else can — the descriptive shape of their own attention, with optional aspiration-led nudging. The opt-in framing and "mirror not judgment" constraints make this defensible. Personality apps are self-report quizzes; we are behavioural and uncopyable from any non-Recome dataset.

---

## 9. F-408 — The Audit Log of You

### 9.1 What the user sees

At `recome.app/audit`, a chronological list of:

- Every signal we have (date, source, topic, page) — with delete buttons per row
- Every agent run (when, why, what tools were called, what was emitted, what was suppressed by Guardian and why)
- Every IaaS tenant that has accessed signals you've contributed to (if any)
- Every export and deletion event

One button: "Export everything as JSON." Another: "Delete everything." A third: "Delete only the past N days." A fourth (per-row): "Delete just this."

The export is comprehensive — graph nodes, relations, agent runs, agent events. The format is documented so other tools can ingest it.

### 9.2 Why this is the brand feature

> **Re-audited 2026-05-17.** Anthropic Memory now ships with audit log + rollback + redact + export. Differentiation narrows to audience (end user vs developer) — clarified below.

Every other **end-user** personal-memory product obscures this. Perplexity Memory shows you a settings-page list of "remembered facts" you can edit, but doesn't show you the full graph, the full provenance, or the agent decision audit trail. Claude Memory (consumer): similar. Limitless: was opaque. Apple: never. **Anthropic Claude Managed Agents Memory ships with audit + rollback + export — but that's for the DEVELOPER managing the agent's memory, not the end user.** Different audience.

We make this the loud END-USER feature. Marketing it isn't extra trust theatre; it's the design. The Mind Map (F-401) is the friendly view; the Audit Log is the unfiltered view. Both are first-class.

### 9.3 Why it's structurally unique

| Competitor                             | Why they can't / won't ship this                                                                                                                                                                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Perplexity / Claude consumer / ChatGPT | They could, but the marketing pitch ("just talk; we remember") is in tension with showing 10,000 rows of audit. They'll do partial — never full.                                                                                          |
| Anthropic Claude Managed Agents Memory | **Has** audit log + rollback + redact + export — but the audience is developers managing agents, not end users inspecting their own personal-attention data. The audit log lives in `claude.ai` developer console, not in a consumer app. |
| Karma                                  | Doesn't store enough to have an audit log worth showing.                                                                                                                                                                                  |
| Glean                                  | The audit log is for the IT admin, not the employee. Different stakeholder.                                                                                                                                                               |
| Limitless                              | Pre-acquisition, was opaque. Post-acquisition, captures are off entirely.                                                                                                                                                                 |
| Pin AI                                 | Decentralized on-device, so audit is implicit (data never leaves device). Doesn't apply same way for cross-tenant IaaS scenarios where third-party developers access your signals via our `/v1` — we surface those accesses; they can't.  |

### 9.4 What it requires from the system

- AgentRun audit log — built ([cloud/src/agents/AgentRunner.ts](../../cloud/src/agents/AgentRunner.ts) writes every run).
- AgentEvent log — built ([cloud/src/agents/AgentEventStore.ts](../../cloud/src/agents/AgentEventStore.ts)).
- Signal export endpoint — partially built (forgetUser is the delete side; export endpoint needs adding).
- Tenant-access disclosure — when IaaS tenant Y queries on behalf of your external_user_id, we surface that in your audit log. **Critical for trust**: if your data contributes to an IaaS-driven recommendation in another product, you should see it.
- Web route `/audit` rendering all of it.

### 9.5 What's missing

- Per-signal delete UI + endpoint (we have user-wide delete; not per-signal).
- IaaS tenant disclosure logging — when a `/v1/users/:externalUserId/*` endpoint is called and that external user has a consumer Recome account, log to their AuditLog.
- Export endpoint + format docs.
- The `/audit` route in web.

Estimate: **1 week** (mostly UI; the data is already structured).

### 9.6 PR-ready justification

> Ship the Audit Log loud because most of the category obscures it. We make user-controllable provenance + deletion the brand feature. Single largest investment in trust we can make for the marginal cost of a UI page over data we already store.

---

## 10. Anti-features

For completeness — surfaces we will not build, written down so they don't sneak back in.

- ❌ **Personality type quiz / Big Five / MBTI inference.** ADR-0012 §2.4 F-319 explicit non-goal. Scientifically weak, privacy-hostile, attracts the wrong regulatory attention.
- ❌ **Auto-purchase / auto-post / auto-anything irreversible.** Concierge recommends; user clicks buy. Curator surfaces; user shares. ADR-0012 §5 binding constraint.
- ❌ **Selling aggregate user data.** Even anonymised. Not the business. Closes the IaaS conversation forever if we ever do.
- ❌ **Engagement-optimised recommendation feed.** We are explicitly NOT building a feed product. Recall, Concierge, Curator all surface specific cited items, not infinite scrolls.
- ❌ **Email replacement / calendar replacement.** Comet, Claude, and the OS providers (Gmail integrations, Apple Intelligence) own this surface. We stay in the interest-graph lane.
- ❌ **A chat-only competitor to Perplexity.** ADR-0012 superseded the chat surface for exactly this reason.
- ❌ **A browser.** ADR-0013 §3.7 explicit. We work with any browser, including no browser (PWA, IaaS).
- ❌ **Always-on screen / audio capture.** Limitless tried; was acquired; functionality disabled. Different value model from ours.

---

## 11. Sequencing — what ships in what order

Reads with [0004 production roadmap](0004-production-roadmap.md) §7 milestones. This is the surface-priority view.

| Phase            | Surface                                                                               | Why this order                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1 (Memory) | Bulk import (F— part of capture topology, prereq for everything else)                 | The graph has to be dense before any agent surface is worth shipping.                                                                    |
| Phase 2 (Agents) | F-402 Recall (DONE), F-401 Mind Map, F-403 Concierge                                  | Recall is the cheapest unique-surface to ship; Mind Map is the visceral demo artefact; Concierge is the highest-revenue-potential agent. |
| Phase 2 (Agents) | F-408 Audit Log                                                                       | The trust feature ships alongside the proactive features so users see the symmetry.                                                      |
| Phase 3 (IaaS)   | F-405 Interest-Graph-as-API (foundation DONE, needs Stripe Meters + dashboard + docs) | The dual-sided business needs the public IaaS surface live.                                                                              |
| Phase 3 (IaaS)   | F-406 Decision Completion                                                             | Once IaaS is live, this becomes both a consumer feature AND a billable IaaS endpoint.                                                    |
| Phase 4 (Scale)  | F-404 Curriculum, F-407 Composition Report                                            | Lower-priority but highest-evangelism surfaces; ship after the core is hardened.                                                         |

---

## 12. Maintenance — when to update this doc

- A new surface is proposed → ask "is it structurally unique per the test in §0?" If yes, add F-4xx entry. If no, add to [0007 feature catalog](0007-feature-catalog.md).
- A surface ships → flip Status in the §1 table.
- A competitor ships something that matches one of our surfaces → revise the "why structurally unique" subsection honestly. If the surface is no longer unique, demote it to a regular feature in 0007 and possibly remove it from this doc.
- Major architectural change (e.g. we lose Neo4j and move to native pgvector graph) → re-validate each surface's requirements.

This doc is alive. Its accuracy directly affects how we describe ourselves to investors, hires, and press.

## 13. Related

- [ADR-0013 competitive positioning](0013-competitive-positioning.md) — strategic foundation
- [ADR-0012 active agents](0012-active-agents-and-personality-mirror.md) — what powers F-402 through F-407
- [ADR-0001 graph stack](0001-graph-vector-stack.md) — what makes F-401 the graph view possible
- [ADR-0003 web-first pivot + IaaS](0003-pivot-web-first-with-iaas.md) — what makes F-405 dual-sided
- [0004 production roadmap](0004-production-roadmap.md) — when each ships
- [0007 feature catalog](0007-feature-catalog.md) — features that aren't strategically differentiating
