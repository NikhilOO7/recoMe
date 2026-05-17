# ADR-0003 — Product Pivot to Web-First + IaaS Platform Play

**Status:** Accepted
**Date:** 2026-05-17
**Decider:** Founder + Principal Engineering
**Supersedes (positioning, not infrastructure):** the Chrome extension as the headline product surface
**Extends:** ADR-0001 (graph + vector stack), ADR-0002 (deployment)

---

## 1. Context

The extension shipped and works for the people who install it. The audit (`AUDIT_2026-05-14.md`) was honest about the limits: Chrome Web Store conversion is <1% from cold awareness, the extension can't reach mobile, can't reach IG/TikTok/mobile-YouTube, and the install intent ("install a sidebar to control my feeds") barely exists outside power users.

Two independent threads forced a re-think:

1. **Distribution reality** — extensions are the wrong front door for a consumer product in 2026. Attention lives on mobile and in chat. We have to meet users where they are, not ask them to install something to come to us.
2. **Differentiation pressure** — a chat-only front door competes head-on with Perplexity / ChatGPT / Google AI. We lose that fight on every axis except one: **we have the user's own attention history, captured at the signal level, that no LLM provider can replicate from public web data**. That's the moat.

The conclusion: **the chat interface is not the product; the personal interest graph is.** Chat is one surface that queries the graph. The extension is one capture mechanism that feeds it. Every other surface (web paste, share-sheet, email-forward, PWA, native, IaaS API) is another way to read from or write to the same graph.

That re-frames everything we built: the cloud intelligence stack from ADR-0001 (Neo4j + Qdrant + signal ingestion + research trail) is the actual product, and the extension was just one input.

This ADR codifies that re-positioning and a second decision the founder raised: **expose the same stack as an IaaS API for other companies to build on top of**, on the principle that infrastructure we built for ourselves can pay for itself by powering others.

## 2. Decision

### 2.1 Consumer product

**The front door becomes `recome.app` (web), not the extension.**

Three capture surfaces, ordered by build effort:

| Surface                             | Capture                                                                                                                                 | When                                                                          | Status                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------- |
| Web URL-paste at `recome.app/paste` | User pastes a YouTube / Reddit / Amazon / Substack / X URL → server extracts entities, writes signal, returns trail                     | Available on any device with a browser, including mobile                      | **Building this ADR cycle**                        |
| PWA wrapper                         | Same web app, installable to home screen, share-sheet integration on iOS 16+ / Android, push notifications                              | Mobile users who like the web app enough to "install" it without an app store | **Configuration this ADR cycle**                   |
| Browser extension                   | Auto-capture in background as users browse — passive, no friction once installed                                                        | Power users who want passive memory without paste-on-demand                   | **Already shipped, repositioned as advanced mode** |
| Native iOS/Android                  | Real app store apps, full share-sheet, background sync, push                                                                            | v3 — after web + PWA prove the demand                                         | **Deferred**                                       |
| Email-to-recome                     | Forward a tab/article to `save@recome.app` → ingested as signal                                                                         | v2 — incremental                                                              | **Deferred**                                       |
| Bulk import                         | YouTube watch history dump, Amazon order history, Reddit saved posts, Pocket, Readwise export → bootstrap a new user's graph in minutes | v2 critical — solves the "empty week 1" problem                               | **Deferred but high-priority**                     |

**Two retrieval surfaces:**

| Surface                     | What                                                                                                                                                       | Status                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Web dashboard               | The trails, intents, related-topics views that already exist from the May 14 work                                                                          | **Shipped**                                                |
| Web chat (`recome.app/ask`) | LLM-backed conversational interface with tool access to the user's graph. Answers questions like "what was I researching last Tuesday?" — not "what is X?" | **Foundation this ADR cycle; full chat UI is next sprint** |
| Telegram bot                | Same chat backend, different transport. Lowest-friction conversational surface.                                                                            | **Deferred, v2**                                           |

### 2.2 Differentiation against Perplexity / ChatGPT

We will not compete on world-knowledge search. We will compete on **personal memory and decision support**, and we will use the chat surface for queries no general-purpose LLM can answer:

- "What have I been researching lately?"
- "I'm about to buy this — does it conflict with anything I learned earlier?"
- "Summarize my [topic] research across all platforms from the last N weeks."
- "Find the YouTube reviewer who said brand X has bad bearings."
- "I've been on the fence about X for too long — decide for me, here's what you saw me consider."

Perplexity literally cannot answer those — they have no data on the user. We do, once capture is working.

The risk is real: with weak capture, we ARE a worse Perplexity in week one. The product only feels magical in week 2–3 when the graph is dense. Two consequences:

1. **Bulk-import on day 1** is not a nice-to-have, it's load-bearing. The user must be able to import existing footprint (YouTube history dump, Amazon orders, Reddit saved, browser history) during onboarding. That is the difference between churn and retention.
2. **Marketing message leads with memory features, not search features.** "Perplexity for what you've already looked at." Or sharper: "Your second brain remembers what you actually did, not what you wrote down."

### 2.3 IaaS platform play

The cloud intelligence stack is general-purpose. The same code that powers Recome can power any product that needs a personal interest graph — note-taking apps, learning platforms, commerce sites, agentic AI products, content aggregators.

**Decision: expose `/v1/` as a public, tenant-scoped IaaS API from day one** under a working name of **Recome Intelligence API** (final brand TBD; "Mnemos", "Trailbase", "Synapse API" are candidates).

#### Product shape

A REST + (later) gRPC API that lets other developers:

- **Ingest signals** for their users (`POST /v1/signals`)
- **Query the graph** — semantic similarity, traversal, hybrid (`POST /v1/query`)
- **Get research trails** (`GET /v1/users/:external_user_id/trails`)
- **Get recommendations** based on a user's attention history (`POST /v1/recommend`)
- **Delete a user's data** for GDPR (`DELETE /v1/users/:external_user_id`)

Authentication: API key on the `Authorization: Bearer rk_live_xxx` header. Per-tenant rate limits, usage metering, and quotas.

#### Multi-tenancy approach

Decided in implementation: use **userId namespacing** (`tenant_<tid>__<external_user_id>`) on graph and vector nodes rather than a `tenantId` property + composite index. Reasons:

- Zero schema migration cost.
- Strict isolation by construction (you cannot query across tenants without doing it explicitly).
- Works on Neo4j Community Edition (no need for database-per-tenant Enterprise feature).
- Trade-off: cross-tenant analytics (e.g., training a base recommender on anonymized union signal) becomes an offline ETL job, not a runtime query. Acceptable for this stage.

Qdrant: namespace per tenant (`tenant-<tid>`). Native multi-tenancy. GDPR delete = drop namespace.

#### Pricing sketch (not committed; for sizing only)

| Tier       | $/mo   | Signals/mo | Queries/mo | Notes                       |
| ---------- | ------ | ---------- | ---------- | --------------------------- |
| Free       | $0     | 1K         | 10K        | Hobby projects, evaluation  |
| Starter    | $49    | 100K       | 1M         | Indie devs, side projects   |
| Pro        | $499   | 1M         | 10M        | Startups in production      |
| Enterprise | custom | unlimited  | unlimited  | SSO, dedicated cluster, SLA |

Embedding costs are passed through transparently — we do not mark up OpenAI/Voyage; we make our margin on graph + vector compute.

#### Why this is a sensible secondary bet

- The hard infra work is done. The marginal cost of exposing the existing service to one more caller is small.
- It creates a second revenue stream that doesn't depend on the consumer product reaching consumer scale.
- Other companies' integrations become **distribution** for the underlying tech — if Mem-clone or learning platforms standardize on Recome Intelligence, we have a moat _and_ a category.
- Worst case: nobody signs up for the API. Cost is the multi-tenancy work in this ADR cycle (~2 days). Cost-to-fail is bounded.

The honest risk: building IaaS pulls focus from the consumer product. Mitigation — **the consumer product uses the same `/v1/` API internally**. There is no duplicate stack to maintain. Recome's own web app calls its own public API. This is the same pattern Stripe uses (the Stripe dashboard talks to the public Stripe API).

### 2.4 What this ADR explicitly does NOT decide

- **Final brand for the IaaS product** — needs naming research. Working name "Recome Intelligence API" is internal-only.
- **Chat UI architecture** — streaming vs polling, message persistence, tool-call rendering, attachment support. Substantial enough to deserve its own ADR.
- **Telegram / iMessage / WhatsApp transports** — deferred until web chat proves the value.
- **Native mobile** — deferred to v3.
- **Cross-tenant analytics / federated learning** — explicitly out of scope; possible v2+ if customer demand emerges.
- **GDPR data residency for EU tenants** — single region (Fly.io `iad`) for v1; EU region added when first EU enterprise customer asks.

## 3. Implementation Plan (this ADR cycle)

### 3.1 In scope for this cycle

1. **Tenant + ApiKey Prisma models** with token hashing and per-tenant quota fields.
2. **API key middleware** that validates `Authorization: Bearer rk_xxx` and sets tenant context.
3. **`TenantService`** for creating tenants, minting keys, rotating, revoking.
4. **`/v1/` route group** in `cloud/src/iaas/V1Controller.ts` mirroring `/intelligence/*` semantics but tenant-scoped via API key.
5. **`GraphRepository` userId composition** — every IaaS write uses `tenant_<tid>__<external_user_id>`. Consumer (JWT) writes use the raw Prisma `user.id`, which is also a unique prefix-free string.
6. **`/paste` page in web app** — the first consumer surface of the pivot.
7. **PWA manifest + `next.config.ts` PWA support** — installable web app.
8. **Updated `cloud/src/index.ts`** to mount `/v1/` routes when intelligence is enabled.
9. **Smoke test** for the `/v1/signals` → `/v1/users/:id/trails` round trip.

### 3.2 Explicitly out of scope (next cycles)

- **Real chat UI** — `recome.app/ask` with streaming, tool-calling, message history persistence. Foundation only this cycle (the existing `cloud/src/agent/AgentController.ts` is keyword theatre; replacing it is its own project).
- **Bulk import flow** — YouTube watch history, Amazon orders, Reddit saved. Highest-priority next bet.
- **PWA push notifications** — service worker push hooks, VAPID keys, server-side push triggers.
- **Tenant dashboard / customer portal** — for IaaS customers to see usage, rotate keys, set quotas. v1.5.
- **Stripe metering for IaaS** — usage-based billing through Stripe Meters API. v1.5.
- **Detailed API documentation site** (`docs.recome.app`). v1.5.

## 4. Consequences

### Positive

- Distribution unbounded by Chrome Web Store conversion. Anyone with a browser can use the product.
- The consumer surface and the IaaS surface share one stack — no duplicate maintenance.
- The personal interest graph is now positioned as the moat, not the chat UI. Defensible against well-funded LLM incumbents.
- The extension lives as a high-value capture mechanism for the small but devoted segment that wants passive tracking, without depending on it as the only front door.
- New revenue surface (IaaS) that doesn't compete with the consumer product for attention — they reinforce each other.

### Negative / risks

- **Cold-start UX risk.** A new user's graph is empty for the first week. Without bulk-import as a fast follow-up, retention will be poor. This is the #1 risk and is explicitly tagged as the next-cycle priority.
- **Chat UX investment debt.** A web chat surface that competes (even sideways) with Perplexity needs to be well-built. Half-finished chat is worse than no chat. This ADR consciously defers chat UI in favor of capture surfaces.
- **IaaS attracts an enterprise sales motion** if it works. The founder is one person. If signups happen, we have a happy problem that needs hiring.
- **Tenant isolation is by convention (userId prefix), not by physical separation.** A bug in the userId construction could leak data across tenants. Mitigated by: a single `composeUserId` helper used everywhere, plus a test that asserts cross-tenant queries return nothing.
- **The extension repositioning needs to be communicated carefully** — existing users shouldn't feel like the extension is being abandoned. It is not; it remains a first-class input. Marketing copy needs updating.

## 5. Open questions

1. **Naming for the IaaS product.** Not blocking implementation; ship with internal name and rename before public launch.
2. **Embedding cost pass-through model.** Pass at cost? Markup 20%? Bundle into tier price? Decide before public launch.
3. **Free tier abuse.** What stops someone from creating 100 tenants to get 100× the free quota? Mitigation: tie tenants to billing-verified accounts at signup, or require Stripe customer attachment before key issuance.
4. **PWA on iOS** — Apple has historically constrained PWAs. iOS 17.4+ in EU has full PWA support; iOS in the rest of the world still has add-to-homescreen but limited push. Acceptable for v1; revisit if iOS US adoption is critical.
5. **Onboarding flow for the consumer product.** The web app currently lands at a dashboard. After this cycle it should land at `/paste` (or a paste-first onboarding) — TBD in design.

## 6. Related

- ADR-0001 — Knowledge Graph + Vector Stack (foundation this builds on)
- ADR-0002 — Intelligence Stack Deployment Notes (ops)
- `AUDIT_2026-05-14.md` — the audit that forced the re-think
