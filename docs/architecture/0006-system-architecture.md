# 0006 — System Architecture

**Status:** Living document
**Last reviewed:** 2026-05-17
**Companion to:** [0005 tech stack](0005-tech-stack.md),
[0009 data model](0009-data-model.md)

This doc is the **shared mental model** of how Recome's systems fit
together. Whenever you're about to make a non-trivial change, look here
first. If the change makes this diagram wrong, update the diagram in
the same PR.

---

## 1. Component map

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                                     CLIENTS                                    │
│                                                                                │
│ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│ │ Web (Next 16)│  │  PWA (same   │  │  Extension   │  │ Third-party  │         │
│ │  recome.app  │  │   web app,   │  │  (Chrome MV3)│  │  IaaS callers│         │
│ │              │  │  share-sheet)│  │              │  │              │         │
│ └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
│        │ JWT             │ JWT             │ JWT             │ rk_live_…       │
│        │                 │                 │                 │ + X-User-Id     │
└────────┼─────────────────┼─────────────────┼─────────────────┼─────────────────┘
         │                 │                 │                 │
         ▼                 ▼                 ▼                 ▼
   ┌────────────────────────────────────────────────────────────────┐
   │            Cloudflare (DNS, CDN, WAF, TLS termination)         │
   └─────────────────────────┬──────────────────────────────────────┘
                             │
       ┌─────────────────────┴───────────────────────┐
       │                                             │
       ▼                                             ▼
┌──────────────┐                          ┌──────────────────────────────┐
│   Vercel     │                          │           Fly.io             │
│  (Next 16,   │                          │     (Hono cloud API)         │
│  /api/extract│                          │                              │
│   /paste UI) │                          │  ┌──────────────────────┐    │
└──────┬───────┘                          │  │   Middleware stack   │    │
       │                                  │  │ • CORS               │    │
       │                                  │  │ • Rate limit (Redis) │    │
       │                                  │  │ • Auth (JWT) /       │    │
       │ same backend                     │  │   apiKey (Bearer)    │    │
       └─────────────┐                    │  │ • Request tracing    │    │
                     │                    │  └──────────┬───────────┘    │
                     ▼                    │             │                │
              ┌──────────────────────────────────────────────────────┐   │
              │   ROUTE GROUPS                                       │   │
              │ /auth /sync /billing /user /packs /agent /twins      │   │
              │ /admin                                               │   │
              │ /intelligence  (consumer; JWT)                       │   │
              │ /v1            (IaaS; API key)  ◀── ADR-0003 §2.3    │   │
              └──────────┬───────────────────────────────────────────┘   │
                         │                                               │
                         ▼                                               │
              ┌──────────────────────────────────────────────────────┐   │
              │   IntelligenceService (singleton, see bootstrap.ts)  │   │
              │                                                      │   │
              │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │   │
              │  │ Signal      │  │ Research    │  │ Graph       │   │   │
              │  │ Ingestion   │  │ Trail       │  │ Repository  │   │   │
              │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘   │   │
              │         │                │                 │         │   │
              │         └────────┬───────┴─────────────────┘         │   │
              │                  │                                   │   │
              │              ┌───┴────┐                              │   │
              │              ▼        ▼                              │   │
              │       ┌────────────────────┐                         │   │
              │       │ Vector  Embedding  │                         │   │
              │       │ Client  Client     │                         │   │
              │       └───┬──────────┬─────┘                         │   │
              └───────────┼──────────┼──────────────────────────────-┘   │
                          │          │                                   │
              ┌───────────┼──────────┼──────────┬────────────┬──────-┐   │
              ▼           ▼          ▼          ▼            ▼       ▼   │
           ┌──────┐  ┌────────┐  ┌──────┐  ┌─────────┐  ┌──────┐ ┌────┐ │
           │Postgres│ │ Neo4j  │  │Qdrant│  │  Redis  │  │OpenAI│ │  R2│ │
           │(Neon)  │ │(AuraDB)│  │(Cloud│  │(Upstash)│  │ API  │ │    │ │
           │OLTP    │ │ Graph  │  │vectors│ │ cache+  │  │embed/│ │bulk│ │
           │auth    │ │+ multi-│  │+ per- │ │rate-lim │  │ chat │ │imp │ │
           │billing │ │tenant  │  │tenant │ │         │  │      │ │uplds│ │
           │tenants │ │namespc │  │namesp │ │         │  │      │ │    │ │
           └────────┘ └────────┘  └──────┘  └─────────┘  └──────┘ └────┘ │
                                                                         │
                                  (managed services, multi-region        │
                                   reads later — see [0011])             │
                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

  Logs ─────► Axiom         Errors ─────► Sentry        Analytics ─────► PostHog
  Uptime ───► Better Stack  LLM obs ────► Helicone      Stripe events ──► webhook
```

---

## 2. Data flow: capture path

The path from "user pastes a URL" to "graph node and vector exists."

```
User (any browser)
   │
   │  POST /paste with URL  (web/src/app/paste)
   ▼
Next.js /api/extract  (web/src/app/api/extract/route.ts)
   │
   │  Fetches URL server-side, parses OG/meta, detects platform
   ▼
Returns { url, title, description, image, platform, topics } ───┐
                                                                │
Client POST /intelligence/signals  (with JWT)                   │
   │                                                            │
   ▼                                                            │
Hono cloud API ──► auth middleware ──► IntelligenceController   │
                                              │                 │
                                              ▼                 │
                                   IntelligenceService.ingestion│
                                              │                 │
                                  ┌───────────┼───────────┐     │
                                  ▼           ▼           ▼     │
                            GraphRepo    EmbeddingClient Vector │
                                  │           │           │     │
                          MERGE User /        │           │     │
                          MERGE Topic         │           │     │
                          MERGE Page          │           │     │
                          MERGE Signal        │           │     │
                          CREATE :VIEWED      │           │     │
                          CREATE :MENTIONS    │           │     │
                          INCREMENT HAS_INTENT│           │     │
                          (Cypher UNWIND      │           │     │
                          for batch)          │           │     │
                                              │           │     │
                                       text→embedding     │     │
                                              │           │     │
                                              └──► upsert │     │
                                                  in      │     │
                                                  Qdrant  │     │
                                                  collection    │
                                                  tenant-<tid>  │
                                                                │
Return signalId, topicsCreated, entitiesCreated ◄───────────────┘
```

Key invariants:

- **userId is the only place tenant isolation happens.** See
  [0009](0009-data-model.md) §multi-tenant + `composeTenantUserId()`.
- **Embedding cost is bounded by deduplication.** Same text → same Redis
  cache hit → no API call. Cache key is `sha256(model:text)`.
- **No write is acked until BOTH Neo4j and Qdrant succeed.** A partial
  write leaves the request as a 500 and the client retries with the
  same `signal.id` for idempotency. Neo4j MERGE on `signal.id` is the
  dedup guarantee.

---

## 3. Data flow: retrieval path (trail)

The path from "show me my trail for topic X" to "render the answer."

```
User clicks "trail" / chats "what was I researching about X?"
   │
   ▼
Client GET /intelligence/trails/X  (or /v1/users/:eid/trails/X)
   │
   ▼
auth/apiKey middleware ──► IntelligenceController/V1Controller
                                    │
                                    ▼
                          IntelligenceService.trails
                                    │
                            ┌───────┴───────┐
                            ▼               ▼
                       GraphRepo       VectorClient
                            │               │
                  MATCH (u:User)─[:VIEWED]→(:Page)─[:MENTIONS]→(:Topic {normalizedName: X})
                  WITH counts grouped by platform, time
                            │               │
                            │               └─► topic.embedding_id → top-K similar topics
                            │                                          (related panel)
                            ▼
                  Return Trail { signalCount, platforms[],
                                 strength, firstSeen, lastSeen }
                            │
                            ▼
                  ResearchTrail.explainStrength(trail)
                            │
                            ▼
                  Return { trail, related, explain }
                            │
                            ▼
                  Client renders /trails/[topic] or chat tool-result
```

Performance budget: **p50 < 200ms, p95 < 500ms** for trail GET. Hard
budget; if a query exceeds it, the query needs an index hint or the
graph schema needs revising.

---

## 4. Data flow: bulk import (P1)

The single most important onboarding flow. Solves the "empty week 1"
problem identified in ADR-0003 §2.2.

```
User uploads YouTube watch-history.html  (web/src/app/import/page.tsx)
   │
   │  multipart/form-data, capped at 100MB
   ▼
Next.js /api/import/youtube  (web)
   │
   │  Streams to R2 (object storage)
   │  Returns { jobId } immediately (HTTP 202)
   ▼
Cloud worker (BullMQ + Redis, added at P2)
   │
   │  Picks up job; streams from R2
   │  Parses HTML / JSON per importer (YouTube, Amazon, Reddit, Pocket)
   │  Chunks into 500-signal batches
   ▼
For each batch:
   │
   ├─► IntelligenceService.ingestion.ingest()  ×500 in parallel (limited by concurrency)
   │
   └─► Progress event → Redis pub/sub → SSE to client

Client (long-running page) shows live progress:
   "12,450 / 18,200 signals ingested · ETA 2m"
```

Why bulk import is in the architecture and not just "a feature": it
needs **its own dedicated path** because:

- Throughput requirements are 1000× the realtime path.
- Failure modes differ — a malformed CSV row should not 500 the import.
- The user is watching a progress bar; we need a job ID and SSE.
- Rate-limit handling for downstream APIs (OpenAI embeddings) needs
  back-pressure logic the realtime path doesn't have.

---

## 5. Data flow: chat (P2)

```
User in /ask sends a question
   │
   ▼
SSE-aware client opens stream to POST /chat
   │
   ▼
ChatController (P2 NEW)
   │
   │  Load conversation history from Postgres
   │  Build system prompt with: today's date, user's recent intents
   │
   ▼
Anthropic SDK (streaming) with tools:
   • search_graph(query: text) → topic / page hits
   • get_trail(topic: string) → trail object
   • get_intents(limit: int) → top intents
   • list_recent_captures(window: '7d'|'30d') → captures with metadata
   • compare(a: id, b: id) → side-by-side
   │
   │  Tool calls execute against IntelligenceService
   │  Tool results are streamed back to the model
   │
   ▼
Final response streamed token-by-token to client
   │
   ▼
On completion: persist user msg, assistant msg, tool-calls to Postgres
                  (table: Conversation, Message, ToolInvocation)
```

The chat surface is what makes Recome's data different from
Perplexity's data. The system prompt is short; the differentiator is
the **tools**, not the prompt.

---

## 6. Deployment topology

```
                          ┌──────────────────┐
                          │   Cloudflare     │
                          │ DNS + CDN + WAF  │
                          └──────────┬───────┘
                                     │
        ┌────────────────────────────┴────────────────────────────┐
        │                                                         │
        ▼                                                         ▼
┌───────────────────────┐                              ┌──────────────────────┐
│  vercel.app           │                              │  recome-api.fly.dev  │
│  recome.app (web)     │                              │  Fly.io regions:     │
│                       │                              │   • iad (primary)    │
│  Next 16 SSR + ISR    │                              │   • lhr (read-only)  │
│  Serverless Edge fns  │                              │     after P3 only    │
│                       │                              │                      │
│  /api/extract  ──────►│  cross-origin                │  Hono API            │
│  /api/import/* ──────►│  POST                        │  Singleton           │
│                       │                              │  IntelligenceService │
│  Vercel KV (sessions) │                              │  per machine         │
└───────────────────────┘                              └──────────┬───────────┘
                                                                  │
                                                                  ▼
        ┌─────────────────────────────────────────────────────────┐
        │                                                         │
        ▼                  ▼              ▼            ▼          ▼
   ┌─────────┐       ┌───────────┐  ┌──────────┐  ┌───────┐  ┌────────────┐
   │  Neon   │       │  Neo4j    │  │  Qdrant  │  │ Upstash│  │ OpenAI     │
   │ Postgres│       │  AuraDB   │  │  Cloud   │  │ Redis  │  │ embeddings │
   │ (serverless,    │ (managed, │  │ (managed,│  │ (pay-  │  │ + chat     │
   │  east-1)│       │  east-1)  │  │  east-1) │  │  per-req)│  │ (multi-region)│
   └─────────┘       └───────────┘  └──────────┘  └───────┘  └────────────┘
```

Why single-region right now: latency from a single iad cluster to most
US users is <50ms, and most EU users <120ms. Multi-region is a P3+ ask
gated by a real p95 latency violation (see [0011](0011-cost-and-iaas-gtm.md)).

---

## 7. Singletons and lifecycle

The cloud process holds these singletons. They are created at boot
([cloud/src/bootstrap.ts](../../cloud/src/bootstrap.ts)) and torn down
gracefully on SIGTERM ([cloud/src/observability/lifecycle.ts](../../cloud/src/observability/lifecycle.ts)).

| Singleton             | Constructed at       | Owned by                               | Failure semantics                                                                                     |
| --------------------- | -------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `PrismaClient`        | First import         | `cloud/src/db.ts`                      | Lazy connect; transient connection failures retried at query time.                                    |
| `Neo4jClient`         | `bootIntelligence()` | `cloud/src/graph/Neo4jClient.ts`       | Driver pool; verifies connectivity on boot; on transient errors uses the official retry-on-transient. |
| `QdrantClient`        | `bootIntelligence()` | `cloud/src/vector/QdrantClient.ts`     | Creates per-tenant collection on first use; warns + retries 3× on transient.                          |
| `OpenAIEmbeddings`    | `bootIntelligence()` | `cloud/src/vector/OpenAIEmbeddings.ts` | Retries 3× with exponential backoff.                                                                  |
| `IntelligenceService` | `bootIntelligence()` | `setIntelligence()` (singleton getter) | Boot fails fast if `INTELLIGENCE_ENABLED=true` and any dep is unreachable.                            |
| `RateLimiter`         | First request        | `cloud/src/middleware/rateLimiter.ts`  | In-memory; **debt item** — move to Redis at P3 ([0005](0005-tech-stack.md) §4).                       |

---

## 8. Environments

| Env       | Where                                                           | Data                                                                             | When deployed                                                 |
| --------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `local`   | `docker-compose up` in `cloud/`                                 | Postgres + Neo4j + Qdrant containers + cloud API + web `next dev`                | Always (laptop).                                              |
| `preview` | Vercel preview deployment per PR (web) + Fly review-app (cloud) | Shared preview Postgres + AuraDB free instance                                   | Every PR.                                                     |
| `staging` | Vercel + Fly                                                    | Real but separate prod-like data; daily refresh from prod-prod with PII scrubbed | After `main` merges; smoke tests run here.                    |
| `prod`    | Vercel + Fly + Neon + AuraDB + Qdrant Cloud                     | Real                                                                             | After staging green for ≥10 min; manual `fly deploy` from CI. |

---

## 9. Backups & DR

| Store                  | Backup strategy                                 | RPO                     | RTO |
| ---------------------- | ----------------------------------------------- | ----------------------- | --- |
| Postgres (Neon)        | Continuous WAL + PITR (Neon native)             | 1m                      | 15m |
| Neo4j AuraDB           | Automatic daily backup + 7-day PITR (paid tier) | 24h on free, 1h on paid | 1h  |
| Qdrant Cloud           | Snapshot daily to R2                            | 24h                     | 2h  |
| Redis                  | None — derived state only                       | n/a                     | n/a |
| R2 bulk-import uploads | Versioned objects, 90-day retention             | —                       | —   |

DR drill cadence: **quarterly**. Documented in [0010](0010-security-privacy-ops.md) §runbooks.

---

## 10. Open architectural decisions

These are written as **questions to revisit** at the named milestone.

- **Q: Vercel vs Fly for the Next.js web app?** Revisit at end of P1.
  Trigger: cumulative Vercel bandwidth >$200/mo OR cold-start latency
  > 1s. If triggered, move Next.js to Fly alongside the cloud API.
- **Q: Single-tenant Neo4j with userId namespacing OR Neo4j Enterprise
  database-per-tenant?** Revisit at IaaS 100+ tenants. Trigger: query
  performance hot-spot from cross-user MATCH scans.
- **Q: Adopt OpenTelemetry now or wait?** Revisit at P2 start.
  Trigger: more than 3 distinct LLM tool-call chains in production —
  log correlation becomes infeasible without traces.
- **Q: Adopt BullMQ for background jobs?** Revisit at P1 W6 — when
  bulk-import work starts. Until then, in-process cron is enough.
- **Q: Migrate cloud Postgres ORM from Prisma to Drizzle?** Revisit
  only if a Prisma bug or limitation blocks shipping. Otherwise keep
  Prisma.
