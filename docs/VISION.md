# RecoMe — Vision & Canonical Ideology

**Status:** Canonical for ideology & positioning. Product direction, roadmap, and feature definitions live in [PRODUCT.md](PRODUCT.md) (the single source of truth). Written 2026-08-09. Supersedes the positioning in the root README (pre-2026-08-09 versions), `pitch-site/` (2026-05-18 "Preference Layer" narrative), and `recome_interview_prep.md` (v1 architecture). The authoritative positioning ADR remains [architecture/0013-competitive-positioning.md](architecture/0013-competitive-positioning.md); this document is the product-level statement built on it.

---

## The one-liner

**RecoMe is personal attention infrastructure: it captures what you actually paid attention to across the web, structures it into an interest graph you own, and puts that graph to work — for you through background agents, and for developers through an API.**

The compressed form: **"The chat isn't the product. The personal interest graph is."**

## The thesis

Every platform maintains a model of you — and every one of those models serves the platform. Your research, comparisons, half-finished decisions, and learning threads die at the tab. Meanwhile the AI era has made _personal context_ the scarcest input: every AI product cold-starts from zero on every user, and the labs are solving memory only inside their own walls (chat memory that never leaves the chat).

Nobody owns the cross-platform layer: a structured, typed, user-controlled record of attention that (a) works **for the user** proactively and (b) is **queryable by any product** the user permits. That layer is the product. Capture is commodity; chat is commodity; **the graph and the trust model around it are the company**.

## The two customers, one pipeline

| Side                 | Who                                                   | What they get                                                                                                                                                                                                                                   | How it's paid                                                                      |
| -------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Consumer**         | People who research across YouTube/Amazon/Reddit/etc. | Five background agents working their graph: Recall (resurfaces forgotten research), Concierge (watches commerce pages), Curator (feeds the thread you're on), Decision (on-demand advisor), Curriculum (learning plans) — all gated by Guardian | Free / Pro / Premium subscription                                                  |
| **Developer (IaaS)** | Apps that need to know their users                    | `api.recome.app/v1`: POST signals, GET trails/intents — cold-start solved by one API call                                                                                                                                                       | Metered per signal/query (Stripe Meters); FREE → STARTER → PRO → ENTERPRISE quotas |

This is not two products bolted together: in code, `/intelligence/signals` (consumer) and `/v1/signals` (IaaS) enter the **same ingestion pipeline** with tenant-namespaced user IDs. Consumer usage builds graph-engine quality; the developer API monetizes the engine. Each side compounds the other.

## The trust constraints (binding, product-defining)

These are features, not compliance. They are what lets a company hold attention data:

1. **Citation, always** — every agent output cites the signals it derived from.
2. **Recommend, never act** — no agent takes an irreversible action. Concierge never clicks Buy.
3. **One-click pause** — per agent, per user.
4. **The Audit Log of You** — every emission visible and deletable; full GDPR delete cascades graph + vectors + audit.
5. **Hard cost ceiling** — $0.10/user/**day** LLM spend, enforced by Guardian in code (`GuardianAgent.ts`, 100,000 micros), not by policy.

## Moats (in defensibility order)

1. **Cross-platform signal density** — 15 platforms of capture vs. competitors' 0–1. The graph gets denser with every session; switching cost is the graph itself.
2. **Sourced emissions** — citation-backed output is a structural trust advantage no black-box recommender can retrofit.
3. **Dual-sided distribution** — consumers generate density, developers pay for it; neither side alone is as defensible.

## Positioning vocabulary (from ADR-0013 — enforce everywhere)

Category name: **Personal Attention Infrastructure** ("personal memory as infrastructure" acceptable).
Never say: "AI assistant", "AI agent" (as category), "knowledge graph", "second brain", "AI search", "privacy-first", "browser" (as category), "shopping assistant", "productivity".
Competitive frame: _Perplexity searches the world. RecoMe searches your past attention._ Lab memory (Anthropic/OpenAI) is locked in the chat; Glean is enterprise; Limitless is meetings.

---

## State of the union (verified 2026-08-09 — keep this honest)

**Real and working:** thin capture extension (signals from 10 of 15 declared platforms), signal queue/upload, cloud graph (Neo4j + Qdrant) with EWMA intent edges, five registered agents + Guardian gate (opt-in, throttle, cost cap, quiet hours), SSE chat transport, web app (dashboard, mind map, ask, inbox, personality mirror, audit log), PWA share-target, developer dashboard + `rk_live_` key management, `/v1` API with OpenAPI + Swagger, tenant quotas, GDPR cascade delete, PageEligibility privacy gating, Stripe consumer subscriptions, BullMQ scheduled workers, deployable on Fly.

**Stub or inert (do not claim as live):**

- Agents run deterministic by default. **Decision now has real LLM synthesis** (2026-08-09) behind `AGENTS_LLM_ENABLED` — off until its eval set lands; the other four remain deterministic Cypher/templates.
- Curator's content source and Concierge's price vendor are **stub fixtures**; Concierge refuses to run in prod on the stub vendor.
- Topic extraction is regex + a 39-brand hardcoded list — "typed interest graph" is currently a weighted bag of title tokens.
- Qdrant embeddings are written but never queried (write-only vector store).
- **IaaS is revenue-inert**: no path sets a tenant's plan or Stripe customer; meter rollup skips unbilled tenants; `embeddingsBilled` never increments.
- Push notifications: subscriptions stored, delivery never wired (`notifyUser()` has no callers).
- Known defects (register: PRODUCT.md §6): ~~5-platform signal drop with batch poisoning~~ and ~~pre-auth rate limiting~~ fixed 2026-08-09 (per-item batch ingest + layered IP/user/tenant limits). Still open: shipped-but-unreachable React popup; orphaned `packages/schema`; sidebar renders invented demo topics in the same widget as real data; a "Synthesist" agent is referenced in UI but not registered; push delivery unwired; IaaS revenue-inert.

**Road to pitch-ready demo (build queue, in order):**

1. Fix the batch-poisoning signal drop + platform enum mismatch (data integrity).
2. Move rate limiting behind auth; key `/v1` limits by tenant (platform credibility).
3. Wire one real LLM path end-to-end behind Guardian: Decision agent streaming real synthesis with citations (the demo moment).
4. Real content source for Curator (RSS/YouTube API) and Keepa activation for Concierge.
5. Tenant plan upgrade + Stripe customer wiring (first billable developer).
6. Replace regex extraction with LLM entity extraction on ingest (the graph becomes real).
7. Retire or regenerate `pitch-site/` from the current narrative.
