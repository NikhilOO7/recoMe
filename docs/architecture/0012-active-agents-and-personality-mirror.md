# ADR-0012 — Active Agents + Personality Mirror

**Status:** Accepted
**Date:** 2026-05-17
**Decider:** Founder + Principal Engineering
**Extends:** ADR-0003 (web-first pivot + IaaS)
**Supersedes (in part):** the Phase-2 chat surface described in
[0004 production roadmap](0004-production-roadmap.md) §3 and the
chat feature block (F-301 .. F-307) in
[0007 feature catalog](0007-feature-catalog.md).

---

## 1. Context

Two independent forces converged this week to invalidate the chat-UI
direction set in ADR-0003 §2.1:

1. **Perplexity shipped Memory, Comet, Computer, and Personal Computer
   between Feb and May 2026.** Memory now remembers brands, hobbies,
   active projects. Comet is the agentic browser on iOS / Android /
   Mac / Windows with ~3M MAU. Personal Computer is an always-on
   Mac-Mini agent with local file access. The "Perplexity has no
   memory of you" framing we built our differentiation on is now
   factually wrong. A chat surface at `recome.app/ask` cannot win a
   head-to-head against Perplexity Threads + Memory + Spaces +
   Model Council.

2. **The founder proposed an alternative direction with three
   concrete features:** active agents (shopping concierge, social
   curator, recommender), real-time cross-platform deals + price
   comparison, and a _Mind Map of yourself_ — a visualization of your
   interest graph that doubles as a personality mirror with optional
   personality-shaping suggestions.

The conclusion: **the chat is not the product; the agents working on
your interest graph are.** Perplexity is reactive (you ask, it
answers). Comet acts, but only when prompted. **Recome agents work in
the background and bring you things you didn't ask for.** That is the
category Perplexity does not occupy and structurally cannot occupy
from a chat UI — the moment they add background workers, every chat
session becomes a hidden cost-center for them.

This ADR also picks up the Mind Map / Personality Mirror idea because
it falls naturally out of the same data — once you've built the graph,
showing it back to the user is the surface that demonstrates
ownership, and the personality dimension is what gives the agents
their direction.

## 2. Decision

### 2.1 Recome is a personal interest graph + a team of agents that work it for you.

The chat interface is demoted from primary surface to one tool among
many. The Phase-2 deliverable becomes **Agents v1**, not chat.

### 2.2 Six agents, three priority tiers

Each agent is a **scheduled background worker** that runs against the
user's interest graph + the open web, with bounded LLM budget per
user per day. Each agent surfaces results via dashboard cards,
notifications, and (in P3) an `/v1/agents/*` API for IaaS callers.

**Tier 1 — Ship in Phase 2 (Aug 24 → Nov 1):**

| Agent         | What it does                                                                                                                                                                                                                | What it does NOT do                                                                                                   | Frequency                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Concierge** | Watches active purchase trails. Tracks prices on candidates across Amazon / eBay / Walmart / direct retailers. Surfaces new alternatives matching revealed criteria. Pulls fresh reviews. Drafts a decision when user asks. | Does NOT transact. Does NOT click "buy now". No affiliate-network entanglement until v2 (and only with explicit ADR). | Background pass: 4×/day per active purchase trail. Push notification on significant price drop or stock change. |
| **Curator**   | Pulls new content from RSS / YouTube uploads / Reddit / Substack / arXiv matching dormant + active interests. "Martin Kleppmann just published — you've not touched distributed systems in 3 weeks."                        | Does NOT post anywhere on user's behalf. No social-network write access.                                              | Background pass: 1×/day. Daily digest in PWA.                                                                   |
| **Recall**    | Most uniquely-Recome agent. Surfaces forgotten captures at the right moment. "You're about to buy a desk; you bookmarked a Verge review 3 weeks ago you never read."                                                        | Does NOT spam. Strict 2-notifications-per-week cap by default.                                                        | Triggered by capture events on related topics.                                                                  |

**Tier 2 — Ship in Phase 3 (Nov 2 → Feb 7), alongside IaaS:**

| Agent         | What it does                                                                                                                                                                        | What it does NOT do                  | Frequency                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------- |
| **Watchlist** | User-set explicit watch on a topic / entity / person. Notifies on graph changes — price, new mention, sentiment shift.                                                              | Same as Concierge re transactions.   | Real-time on signal arrival. |
| **Decision**  | On-demand, not background. Pulls full trail for one decision, summarizes options, calls out conflicts in revealed criteria, recommends with full citation back to captured signals. | Does NOT auto-trigger. User invokes. | On user request only.        |

**Tier 3 — Folds into existing Phase 1 digest work:**

| Agent          | What it does                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Synthesist** | Weekly long-form "where you are on each active intent" report. Replaces the templated digest with an LLM-synthesized one. |

### 2.3 What we will NOT build (even if obvious)

These are explicit non-goals to stop scope creep:

- ❌ **Shopping execution agent.** Concierge is a recommender; it does
  not click "buy". Regulated mess: affiliate disclosure, returns,
  fraud, tax, FTC. Line is hard.
- ❌ **Social media posting agent.** Posting on user's behalf is a
  content-moderation and authentication nightmare. Curator reads only.
- ❌ **Email / calendar agents.** Comet owns this surface natively
  via Gmail + Calendar integration. We will lose. Stay in the interest
  graph lane.
- ❌ **Agents that take irreversible action.** Every agent output is
  a recommendation or a notification. The user is the only thing
  that clicks the buy / post / send button.

### 2.4 Mind Map / Personality Mirror

**Two-part feature, both visual:**

#### F-318 — Mind Map

A live render of the user's own interest graph. Same data as the
trails view, but spatial and explorable instead of list-based. The
existing graph visualization in
[recome-overview.html §graph](recome-overview.html) is the technical
template — we render the user's own data into that layout.

- Topic nodes sized by signal count
- Edge strength shown by line weight
- Cluster colors indicating topic communities (e.g. "work tools",
  "home setup", "books")
- Zoom / pan / click to drill into a topic
- "Time scrub" slider — see how the map evolved over the past
  N weeks
- Export as PNG / SVG (shareable)

**Why it matters:** the trails view is _consumption_. The Mind Map is
_reflection_. It's the surface that makes users feel "this is mine,
nobody else has this." Perplexity Memory cannot show you anything
equivalent because they have a flat fact-list, not a graph.

#### F-319 — Personality Mirror (opt-in)

Layered on top of the Mind Map. Uses LLM analysis of the user's graph
clusters + signal patterns to compute and surface:

- **Composition:** "Past 30 days: 38% career / craft, 22% home life,
  18% news + culture, 14% entertainment, 8% relationships."
- **Trajectory:** "Career / craft topics are growing 12% week-over-
  week; entertainment is declining."
- **Underrepresented dimensions:** "You haven't engaged with health
  / fitness / outdoor topics in 6 weeks."
- **Optional aspiration:** user can set targets ("I want to spend
  more attention on writing"); Curator then prioritizes content
  matching the target while Recall demotes content fighting it.

**Hard constraints on this feature:**

1. **Opt-in only.** Default off. Onboarding never auto-shows it.
2. **Framed as mirror, not judgment.** No "you should" copy. Always
   "here's what your attention looks like; here's what you can do
   with that information."
3. **User-deletable.** Single button wipes all derived personality
   inferences while leaving the underlying graph intact.
4. **Never shown to anyone but the user.** Not in IaaS responses. Not
   in admin tools. Not in support views.
5. **No psychometric labels.** No "Big Five", no "MBTI-style",
   no "your personality type is X." Just descriptive composition over
   real signal — observational, not diagnostic.

The Personality Mirror is the one feature that, done badly, will
become the headline reason a privacy-focused product gets dropped.
Done well, it's the surface that converts free users into evangelists.

### 2.5 Real-time deals + cross-platform comparison

These are tools the Concierge calls, not separate features. Implemented
as `cloud/src/tools/registered/`:

- `price_check(entity, retailers[])` — scrapes Amazon / Walmart / eBay
  / direct retailer pages for current price + stock + shipping.
  Cached 15min per (entity, retailer) tuple.
- `compare_offers(entity)` — orchestrates `price_check` across all
  retailers, returns sorted table with confidence flags (counterfeit
  detection, seller reputation).
- `find_alternatives(entity, criteria)` — semantic search over the
  user's graph + LLM-generated alternative candidates, then
  `price_check` on each.
- `deal_watch(entity, threshold_pct)` — scheduled job; fires Concierge
  notification when price drops by `threshold_pct` or more from baseline.

These tools become first-class IaaS endpoints in `/v1/agents/concierge/*`
in Phase 3.

## 3. How this maps to existing code

The work is mostly **activation, not architecture**. The existing
multi-agent scaffolding in `brain/src/agents/` was inert per the
[2026-05-14 audit](../../AUDIT_2026-05-14.md) because `ToolExecutor`
has zero registered tools. This pivot is what activates it.

| Existing artifact                       | Status today                | Role in this pivot                                                                                     |
| --------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `brain/src/agents/ShopperAgent.ts`      | Inert                       | Becomes **Concierge**. Wire to real tools (price_check, find_alternatives).                            |
| `brain/src/agents/ScoutAgent.ts`        | Inert                       | Becomes **Curator**. Tools: rss_fetch, youtube_uploads_check, graph_query.                             |
| `brain/src/agents/AdvisorAgent.ts`      | Has LLM fallback            | Becomes **Decision** agent. Already partial.                                                           |
| `brain/src/agents/SocialAgent.ts`       | Inert                       | **Repurpose as Recall.** Reuses scoring + retrieval logic.                                             |
| `brain/src/agents/GuardianAgent.ts`     | No-op                       | **Becomes the agent-runtime privacy guard.** Enforces per-user cost caps + opt-in flags + quiet hours. |
| `brain/src/agents/FilterAgent.ts`       | Inert                       | Stays as a graph utility used by other agents (filter signals by recency/source/etc).                  |
| `brain/src/orchestrator/Brain.ts`       | Wired but agents are no-ops | Stays. Now actually orchestrates real work.                                                            |
| `brain/src/tools/ToolExecutor.ts`       | Empty registry              | This is what we register against. New `brain/src/tools/registered/` dir with one file per tool.        |
| BullMQ background jobs (planned for P1) | Not built                   | **Becomes the runtime for agent scheduled passes.** Each agent has a recurring job per active user.    |

## 4. Cost model impact

Each agent has a strict per-user-per-day LLM budget. Defaults:

| Agent                                    | LLM calls / user / day         | Approx $ / user / mo |
| ---------------------------------------- | ------------------------------ | -------------------- |
| Concierge                                | 4 passes × (~0.5K out tokens)  | ~$0.30               |
| Curator                                  | 1 pass × (~1K out tokens)      | ~$0.06               |
| Recall                                   | event-triggered, ~5/day × tiny | ~$0.05               |
| Synthesist                               | weekly digest                  | ~$0.10               |
| Watchlist                                | event-triggered                | ~$0.05               |
| Decision                                 | on-demand                      | ~$0.10 avg           |
| Personality Mirror (opt-in)              | 1 weekly LLM recompute         | ~$0.08               |
| **Total agent budget per consumer / mo** |                                | **~$0.74**           |

That's on top of the ~$1.00/mo baseline from
[0011 §1.1](0011-cost-and-iaas-gtm.md#11). Updated baseline:
~**$1.74 per active consumer / mo**, with personality mirror adding
~$0.08 only for the opt-in cohort.

Still below the $5/mo Plus tier with healthy margin.

For IaaS Pro tenants ($499/mo), agent runs are billed as additional
queries — same `queriesServed` counter; one agent pass = N queries
depending on tool calls. No agent budget per tenant; quotas govern.

## 5. Trust + safety constraints (binding)

These are enforced in code via `GuardianAgent` (now actually useful):

1. **No agent takes irreversible action.** Recommend only. Buy / post /
   send / archive / delete all stay user-driven.
2. **Every agent output cites its sources** — both the captured
   signals it drew from AND any web fetches the tools performed.
   Citations are mandatory, not optional.
3. **One-click pause per agent.** Pause persists. No re-enable
   without explicit user action.
4. **Quiet hours respected** for all push notifications. Default
   22:00 – 08:00 local time.
5. **Daily cost ceiling per user.** Hard cap, not soft. Default $0.10
   total LLM spend across all agents. Cap configurable up to $1.00
   on Plus tier, unlimited on Pro.
6. **Personality Mirror = opt-in.** Default off. Wipeable in one click.
7. **Agent action log** stored in Postgres `AgentRun` table; user
   can view + audit every agent decision.
8. **No agent has open-ended web execution.** Tools are an
   allowlist: `price_check`, `rss_fetch`, `youtube_uploads_check`,
   `graph_query`, `compare_offers`, `find_alternatives`,
   `deal_watch`, `summarize_topic`. To add a new tool: PR + ADR
   reference + GuardianAgent review.

## 6. Positioning

The category claim becomes:

> **Recome is your personal interest graph plus a team of background
> agents that work it for you while you sleep.**
> Perplexity answers when asked. Recome brings you things.

Marketing copy follows from that — "Concierge watched 14 standing
desks last night and found a $200 price drop." "Curator surfaced 3
distributed-systems posts you'd care about." "Mind Map: this is
what your attention looked like this week."

This is the positioning that survives Perplexity Memory + Personal
Computer because Perplexity's background agents act on **your Mac**
(files, apps, calendar). Recome's background agents act on **your
interest graph** (cross-platform attention — YouTube + Reddit +
Amazon + Substack + whatever else). Different substrates. Personal
Computer is OS-bound to a $599 Mac Mini; our agents work from any
device with a browser because the substrate they read is a cloud
graph, not local files.

(The earlier version of this paragraph claimed Perplexity
structurally couldn't run always-on agents per user. That claim was
invalidated by Personal Computer in March 2026 — see
[`AUDIT_PERPLEXITY_2026-05-17.md`](../../AUDIT_PERPLEXITY_2026-05-17.md)
§2.1. The agent layer is no longer the moat; the graph layer is.)

## 7. Roadmap impact

See [0004 production roadmap](0004-production-roadmap.md) for the
updated phase definitions. Summary:

- **Phase 0 (Capture)** — unchanged.
- **Phase 1 (Memory)** — unchanged; bulk import becomes more critical,
  not less, because agents need data density to be useful.
- **Phase 2** — **was: Chat. now: Agents v1.** Ship Concierge +
  Curator + Recall + agent dashboard + Mind Map. The `/ask` route
  still exists but is a thin invocation of the Decision + Synthesist
  agents on demand; not a streaming chat product.
- **Phase 3** — **was: IaaS. now: IaaS + Agents-as-a-Service.** Same
  IaaS launch, but the public API surface includes
  `/v1/agents/*` endpoints so tenants can ship agents to their
  own users.

## 8. Decisions explicitly deferred

| Decision                                                                            | Defer until                                           | Where the answer goes                                  |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| Personality Mirror: include or skip the "trajectory" surface                        | After F-318 Mind Map ships and we see how users react | new ADR                                                |
| Affiliate-link revenue from Concierge                                               | After ≥1000 DAU with Concierge enabled                | new ADR + legal review                                 |
| Agent telemetry — what's logged for product improvement vs what's pure user-only    | Before Phase 2 launch                                 | extension of [0010 §6](0010-security-privacy-ops.md#6) |
| Per-tenant agent customization (IaaS) — can Maya customize Concierge for her users? | After 10 paying IaaS tenants are live                 | new ADR                                                |
| Voice notification for agents on PWA mobile                                         | After P2 ships, only if asked for                     | new ADR                                                |

## 9. Consequences

### Positive

- Real differentiation that survives Perplexity Memory + Comet.
- Reuses the existing `brain/` agent scaffolding the audit called out
  as "academic architecture" — activating it pays back the past work.
- Two-sided product: both consumer and IaaS scale the same agents.
- Mind Map is a visceral, demo-able artifact that converts.
- Personality Mirror creates evangelism among users who feel seen
  (provided we ship the trust constraints).

### Negative / risks

- **Agents that don't deliver value silently waste LLM spend.**
  Mitigation: GuardianAgent enforces hard daily caps; weekly cost
  review in [0011 §3](0011-cost-and-iaas-gtm.md#3).
- **Personality Mirror is the highest privacy-blast-radius feature
  we've ever specced.** A leak or a bad framing decision could be
  category-defining bad press. Mitigation: opt-in, mirror-not-judgment
  framing, single-click wipe, no third-party access.
- **Recommender agents look identical to recommendation engines that
  have failed (Pinterest spirals, Facebook feed manipulation).** The
  user-owned graph + the explicit constraint "no engagement
  optimization" must be the loud, repeated positioning.
- **Tool authoring becomes the main engineering bottleneck.** Each
  new tool needs an allowlist entry, rate limiting, error handling,
  cost accounting. Don't add tools faster than we can monitor them.
- **Agents that recommend the wrong thing erode trust faster than
  good recommendations build it.** Synthesist + Decision are the
  highest-LLM-quality agents and need eval sets before launch.

### Neutral

- This pivot does not invalidate anything in ADR-0001 (graph + vector
  stack) or ADR-0002 (deployment). The foundation is the same; the
  application layer is what changes.

## 10. Open questions

1. **Should agents be per-user or per-purchase-trail / per-topic?**
   First instinct: per-user (one Concierge per user, working all
   active trails). Revisit if cost balloons.
2. **Notification channel mix** — email, PWA push, in-app banner.
   PWA push needs VAPID setup (deferred in [0003 §3.2](0003-pivot-web-first-with-iaas.md#32)).
   Email is shipped; PWA push by P2 W3.
3. **Mind Map "time scrub" — how far back do we render?** Hard
   ceiling on 12 months until we see compute cost. Maybe just last
   90 days for the v1 render.
4. **Cross-platform price comparison: scrape, official APIs, or
   third-party deal feeds (Honey, RetailMeNot)?** Mix. Start with
   ethical scrape + cache, add affiliate-network feeds in v2 if
   coverage is poor.
