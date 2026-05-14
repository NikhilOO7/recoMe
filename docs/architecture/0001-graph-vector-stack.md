# ADR-0001 — Knowledge Graph + Vector Stack

**Status:** Accepted
**Date:** 2026-05-14
**Decider:** Principal Engineering
**Supersedes:** the in-extension IndexedDB-only `KnowledgeGraph` as authoritative store (it remains as a local cache)

---

## Context

RecoMe's core thesis is a **cross-platform research trail**: a user watches a YouTube video about a topic, discusses it on Reddit, and lands on Amazon — the product should connect those events into a single trail and surface relevant decisions. The April 7 audit and the May 14 audit (`AUDIT_2026-05-14.md`) both flagged the same root cause: signals don't flow into the `KnowledgeGraph`, the graph itself is a hand-coded DFS reachability scorer on top of IndexedDB, and there is no cross-device or cross-user signal at all. The "AI brain" is 95% heuristics.

We need a production-grade intelligence layer that:

1. Stores entities and typed relationships at scale, with real graph traversal.
2. Supports semantic similarity ("find content like this", "users with similar taste") via vector search.
3. Works across devices (so a Chrome signal can inform a mobile recommendation tomorrow).
4. Optionally pools anonymized signal across users (taste-twin matching, popularity priors).
5. Remains privacy-respecting (opt-in, namespaced, GDPR-deletable).
6. Is operationally tractable for a solo founder (managed services where they pay for themselves, self-host where the bill is the dominant constraint).

## Decision

### Graph store: **Neo4j**

- **Local dev:** `neo4j:5-community` via docker-compose.
- **Production:** Neo4j AuraDB Free → AuraDB Professional when limits hit (~200k nodes free).
- **Why not Postgres + Apache AGE / pgvector graph extensions?** Slower traversal at depth >2, less ergonomic Cypher, no managed AGE service, and we already use Postgres for OLTP (auth, billing, sync state) — separating workloads is healthier than collapsing them onto one box that will get paged for two unrelated reasons.
- **Driver:** official `neo4j-driver` JS client. It has native connection pooling, automatic retry on transient errors, and bookmark-based causal consistency.

### Vector store: **Qdrant** (with `VectorClient` interface to swap to Pinecone)

- **Local dev:** `qdrant/qdrant` via docker-compose.
- **Production:** Qdrant Cloud (free 1GB tier → paid).
- **Why Qdrant over Pinecone (the user-named default)?**
  - Pinecone Starter is $70/mo minimum; Qdrant Cloud has a free 1GB tier sufficient for early users.
  - Qdrant is OSS — we can self-host inside the same Fly.io region as the cloud backend (sub-ms latency, zero egress cost).
  - No vendor lock-in. The `VectorClient` interface in `cloud/src/vector/VectorClient.ts` keeps the surface narrow; swapping to Pinecone is a one-file change if scale or features demand it.
  - Qdrant supports hybrid (dense + sparse) search out of the box — we'll want this for keyword + semantic blending later.
- **When to revisit:** scale past 10M vectors, or if Pinecone ships a feature we genuinely need (e.g. sparse-dense rerankers). Track via a quarterly review, not a year-one preoccupation.

### Embedding model: **OpenAI `text-embedding-3-small`**

- 1536 dimensions, $0.02 per 1M tokens. Top-tier quality-to-cost for early-stage SaaS.
- `EmbeddingClient` interface in `cloud/src/vector/EmbeddingClient.ts` allows swap to:
  - **Voyage AI** (`voyage-3-large`, Anthropic-recommended) when quality bottlenecks justify the cost increase.
  - **`bge-base-en-v1.5`** self-hosted on a CPU pod if vendor risk becomes a board-level concern (unlikely at this stage).

### Topology: **hybrid local + cloud**

```
┌──────────────────────┐    batched signal upload     ┌────────────────────────┐
│  Extension (Chrome)  │ ───────────────────────────▶ │  Cloud (Hono on Fly)   │
│                      │                              │                        │
│  Local IDB graph     │ ◀────── consent gate ─────── │  ┌──────────────────┐  │
│  (fast, offline,     │                              │  │ Neo4j (AuraDB)   │  │
│   authoritative for  │                              │  │ • entities       │  │
│   single-user reads) │                              │  │ • relationships  │  │
└──────────────────────┘                              │  │ • traversal      │  │
                                                      │  └──────────────────┘  │
                                                      │  ┌──────────────────┐  │
                                                      │  │ Qdrant           │  │
                                                      │  │ • per-user ns    │  │
                                                      │  │ • semantic search│  │
                                                      │  └──────────────────┘  │
                                                      │  ┌──────────────────┐  │
                                                      │  │ OpenAI embeddings│  │
                                                      │  │ (server-only)    │  │
                                                      │  └──────────────────┘  │
                                                      └────────────────────────┘
```

**Why hybrid and not cloud-only:**

- The extension must work offline and feel instant. A 200ms cloud round-trip on every scroll kills the UX.
- Privacy claim: local-only is the default. Cloud is opt-in.
- Cross-device + cross-user requires cloud, so we need it eventually — better to build the path now.

**Why cloud at all, not local-only:**

- The thesis (cross-platform research trail) requires graph traversal across sessions and devices.
- Embeddings can't run client-side without shipping API keys or burning CPU on the user's machine.
- Taste-twin matching, popularity priors, and trend detection all require pooled signal.

### Privacy model

- **Default:** local-only. The extension works fully without ever talking to the cloud.
- **Opt-in:** explicit toggle in popup settings; granular (sync graph / sync embeddings can be separate).
- **Per-user namespacing:** Qdrant collections are partitioned by `user:{userId}` namespace; Neo4j entities are tagged with `userId` on all user-scoped nodes/edges.
- **GDPR delete:** `DELETE /intelligence/me` runs one Cypher delete + one Qdrant namespace drop. Atomic, idempotent.
- **No PII in vectors:** embedded text is topic/entity descriptions and dwell-summarized context, never raw page content or user identifiers.
- **No third-party SDK in extension:** OpenAI is only called from the cloud backend.

### Data model (Neo4j)

```cypher
// Constraints
CREATE CONSTRAINT user_id IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE;
CREATE CONSTRAINT topic_norm IF NOT EXISTS FOR (t:Topic) REQUIRE t.normalizedName IS UNIQUE;
CREATE CONSTRAINT entity_id IF NOT EXISTS FOR (e:Entity) REQUIRE e.id IS UNIQUE;
CREATE CONSTRAINT page_url IF NOT EXISTS FOR (p:Page) REQUIRE p.url IS UNIQUE;
CREATE CONSTRAINT session_id IF NOT EXISTS FOR (s:Session) REQUIRE s.id IS UNIQUE;

// Indexes
CREATE INDEX entity_kind IF NOT EXISTS FOR (e:Entity) ON (e.kind);
CREATE INDEX page_platform IF NOT EXISTS FOR (p:Page) ON (p.platform);
CREATE INDEX topic_name IF NOT EXISTS FOR (t:Topic) ON (t.name);

// Node shapes
(:User {id, tier, region, createdAt})
(:Topic {id, name, normalizedName, embeddingId, createdAt})
(:Entity {id, name, kind, platform, embeddingId, createdAt})
(:Page {url, title, platform, firstSeenAt, lastSeenAt})
(:Session {id, userId, startedAt, endedAt})
(:Signal {id, kind, weight, ts})  // immutable event log

// Edge shapes
(:User)-[:VIEWED {at, dwellMs, source}]->(:Page)
(:User)-[:HAS_INTENT {strength, lastSeen, decayedAt}]->(:Topic)
(:User)-[:BLOCKS]->(:Topic)
(:User)-[:BOOSTS]->(:Topic)
(:Page)-[:MENTIONS {confidence}]->(:Topic)
(:Page)-[:CONTAINS_ENTITY {confidence}]->(:Entity)
(:Topic)-[:RELATED_TO {weight, source}]->(:Topic)
(:Entity)-[:SIMILAR_TO {score}]->(:Entity)
(:Session)-[:CONTAINS {position}]->(:Page)
```

### Operational hygiene (production blockers from the audit, addressed here)

| Audit gap                             | This stack's answer                                                                                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma db push` with no migrations   | Cypher migration runner with `:Migration` node tracking                                                                                             |
| In-memory rate limiter                | Per-user rate limiting still in `cloud/src/middleware/rateLimiter.ts` — out of scope for this ADR. Will be replaced with Upstash Redis in ADR-0002. |
| Console.log only                      | `pino` structured logger with request IDs; ready for log shipping                                                                                   |
| No SIGTERM handler                    | Graceful shutdown drains in-flight Neo4j sessions + Qdrant clients                                                                                  |
| No health checks for new dependencies | `/health` extended to probe Neo4j + Qdrant; `/ready` separate from `/live`                                                                          |
| No retry on transients                | `withRetry()` wrapper around all Neo4j and Qdrant calls (exponential backoff, 3 attempts)                                                           |
| No idempotency on signal ingestion    | Every `Signal` has a client-generated `id`; ingestion is `MERGE`, not `CREATE`                                                                      |

## Consequences

### Positive

- The cross-platform research trail finally has a real backend that can answer it.
- Vector + graph hybrid retrieval is a foundation we can extend (taste twins, popularity priors, semantic compare).
- Privacy story is honest: default local, opt-in cloud, one-call GDPR delete.
- Cost in year one: <$50/mo total (Fly app, AuraDB free, Qdrant Cloud free, OpenAI <$10/mo at expected volume).

### Negative

- Three new operational dependencies (Neo4j, Qdrant, OpenAI). Each is one more thing to monitor and pay for.
- Embedding generation is the slowest step in the ingest path (~100ms per call). We batch and cache aggressively.
- The extension now has to do consent UX and background sync, which it didn't before.
- The local IDB graph and the cloud Neo4j graph can diverge during offline periods — the sync protocol must handle this.

### Deferred (explicit non-goals for this milestone)

- Bulk migration of existing single-user IDB graphs into cloud Neo4j. Will need a separate one-shot job; sketched in `cloud/src/intelligence/SignalIngestion.ts` but not run.
- Replacing the empty `brain/src/tools/ToolExecutor` so the orchestrator agents actually do work. Tracked in audit; orthogonal to this ADR.
- Redis embedding cache. We rely on Qdrant's own dedupe + a local LRU. Add Redis when latency demands it.
- Multi-region Neo4j replication. Single-region until $100/mo of latency complaints.
- Read replicas, custom indexes beyond the initial set. Tune from measurement, not speculation.

## Implementation map

| Concern              | File                                                         |
| -------------------- | ------------------------------------------------------------ |
| Driver wrapper       | `cloud/src/graph/Neo4jClient.ts`                             |
| Typed graph API      | `cloud/src/graph/GraphRepository.ts`                         |
| Schema migrations    | `cloud/src/graph/migrations/*.cypher` + `runner.ts`          |
| Vector interface     | `cloud/src/vector/VectorClient.ts`                           |
| Qdrant impl          | `cloud/src/vector/QdrantClient.ts`                           |
| Embeddings           | `cloud/src/vector/EmbeddingClient.ts`, `OpenAIEmbeddings.ts` |
| Cross-platform trail | `cloud/src/intelligence/ResearchTrail.ts`                    |
| Signal ingestion     | `cloud/src/intelligence/SignalIngestion.ts`                  |
| Orchestrator         | `cloud/src/intelligence/IntelligenceService.ts`              |
| HTTP routes          | `cloud/src/intelligence/IntelligenceController.ts`           |
| Structured logging   | `cloud/src/observability/logger.ts`                          |
| Graceful shutdown    | `cloud/src/observability/lifecycle.ts`                       |
| Local dev            | `cloud/docker-compose.yml` (Neo4j + Qdrant services)         |
| Extension sync       | `extension/src/background/cloudSync/GraphSync.ts`            |

## Environment variables

Required in production:

```
NEO4J_URI=neo4j+s://<aura-host>:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=<secret>
NEO4J_DATABASE=neo4j

QDRANT_URL=https://<cluster>.qdrant.io
QDRANT_API_KEY=<secret>
QDRANT_COLLECTION=recome_v1

OPENAI_API_KEY=<secret>
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

INTELLIGENCE_ENABLED=true
INTELLIGENCE_RUN_MIGRATIONS_ON_BOOT=false  # true in dev only
```

Local development uses the docker-compose defaults; see `cloud/.env.example`.
