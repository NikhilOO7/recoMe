# 0009 — Data Model

**Status:** Living document
**Last reviewed:** 2026-05-17
**Companion to:** [0001 graph+vector](0001-graph-vector-stack.md),
[0006 system architecture](0006-system-architecture.md)

Authoritative data shapes across all stores. Schema changes go through
PR review of this doc + corresponding migration.

---

## 1. Stores at a glance

| Store           | Role                    | Source of truth for                                                                       |
| --------------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| Postgres (Neon) | OLTP                    | Identity, billing, tenants, API keys, conversation/message history, audit logs, job state |
| Neo4j (AuraDB)  | Personal interest graph | User attention: topics, entities, pages, sessions, signals + typed relationships          |
| Qdrant (Cloud)  | Vector index            | Embeddings of topics, pages, entities — for semantic similarity                           |
| Redis (Upstash) | Cache + counters        | Embedding cache, rate-limit counters, session state, queue jobs                           |
| R2 (Cloudflare) | Blob storage            | Bulk-import uploads, digest email attachments, archived signals beyond hot-window         |

No store is the source of truth for state owned by another. Cross-store
references (e.g. Postgres `User.id` → Neo4j `(:User {id})`) are
**opaque strings** — neither side validates the other's existence; the
application code maintains referential integrity.

---

## 2. Postgres schema (Prisma)

Full schema lives in [cloud/prisma/schema.prisma](../../cloud/prisma/schema.prisma).
Highlights here, grouped by concern.

### 2.1 Identity & auth

```
User {
  id            cuid          @id
  email         String        @unique
  passwordHash  String?       // null for OAuth-only
  displayName   String?
  avatarUrl     String?
  googleId      String?       @unique
  githubId      String?       @unique
  facebookId    String?       @unique
  role          Role          @default(USER)        // USER | ADMIN | SUPER_ADMIN
  tier          Tier          @default(FREE)        // FREE | PRO | PREMIUM
  stripeCustomerId      String?  @unique
  stripeSubscriptionId  String?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
  lastSyncAt    DateTime?
}

Device {
  id           cuid    @id
  userId       String  // FK → User
  name         String
  fingerprint  String  @unique     // device-derived; opaque
  lastSeenAt   DateTime @default(now())
}

RefreshToken {
  id          cuid     @id
  userId      String
  tokenHash   String   @unique     // SHA-256 of raw token
  deviceId    String?
  expiresAt   DateTime
  createdAt   DateTime @default(now())
  revokedAt   DateTime?
}
```

Identity model is **stable** — adding fields is fine; renaming/removing
needs an ADR.

### 2.2 IaaS: tenants & API keys

(Added in `feat/iaas-and-pwa-pivot`.)

```
Tenant {
  id               cuid          @id
  name             String
  billingEmail     String?
  plan             TenantPlan    @default(FREE)     // FREE | STARTER | PRO | ENTERPRISE
  status           TenantStatus  @default(ACTIVE)   // ACTIVE | SUSPENDED | DELETED
  stripeCustomerId String?       @unique
  ownerUserId      String?
}

ApiKey {
  id           cuid       @id
  tenantId     String
  label        String
  keyHash      String     @unique      // SHA-256
  keyPrefix    String                  // first 12 chars for display
  environment  ApiKeyEnv  @default(LIVE)
  scopes       String[]   @default([])
  lastUsedAt   DateTime?
  expiresAt    DateTime?
  revokedAt    DateTime?
}

TenantUsage {
  id                cuid    @id
  tenantId          String
  period            String                       // "YYYY-MM"
  signalsIngested   Int     @default(0)
  queriesServed     Int     @default(0)
  embeddingsBilled  Int     @default(0)
  updatedAt         DateTime @updatedAt
  @@unique([tenantId, period])
}
```

### 2.3 Chat (P2)

Not yet in the schema; will be added in F-304.

```
Conversation {
  id          cuid     @id
  userId      String
  title       String?                          // auto-generated from first user msg
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  archivedAt  DateTime?
}

Message {
  id              cuid     @id
  conversationId  String
  role            MessageRole                   // USER | ASSISTANT | SYSTEM
  content         String                       // markdown
  createdAt       DateTime @default(now())
  // For assistant messages — captured for citation rendering
  toolInvocations Json?                        // array of { tool, input, output, latencyMs }
}
```

### 2.4 Background jobs (P1)

```
Job {
  id          cuid     @id
  kind        JobKind                          // IMPORT_YOUTUBE | IMPORT_AMAZON | DIGEST_SEND | …
  userId      String?
  tenantId    String?
  payload     Json
  status      JobStatus  @default(PENDING)     // PENDING | RUNNING | SUCCESS | FAILED
  attempts    Int        @default(0)
  lastError   String?
  startedAt   DateTime?
  completedAt DateTime?
  createdAt   DateTime   @default(now())
}
```

### 2.5 Indexes (non-default)

Every `@index` declared in the schema. Worth calling out:

- `User.email` — login.
- `RefreshToken.tokenHash` — auth path.
- `RefreshToken.userId` — revoke-all-for-user.
- `Tenant.status`, `Tenant.ownerUserId` — admin queries.
- `ApiKey.keyHash`, `ApiKey.tenantId` — auth + dashboard.
- `TenantUsage(tenantId, period)` — unique composite (quota check).
- `Job(status, createdAt)` — worker poll.

---

## 3. Neo4j graph schema

Node labels and relationship types. **No node has free-form properties
beyond what's listed here.** Adding a property goes through a migration.

### 3.1 Node labels

| Label      | Properties                                                                                                                               | Notes                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `:User`    | `id` (PK), `tier`, `createdAt`                                                                                                           | id is either the Postgres `User.id` (consumer) OR `tenant_<tid>__<extUid>` (IaaS) — see §6. |
| `:Topic`   | `id` (PK), `name`, `normalizedName` (UK), `embeddingId`, `firstSeen`, `lastSignalAt`, `signalCount`                                      | Counts denormalized for fast trail queries.                                                 |
| `:Entity`  | `id` (PK), `name`, `kind` (`product` \| `brand` \| `creator` \| `category` \| `media` \| `place` \| `person`), `platform`, `embeddingId` |                                                                                             |
| `:Page`    | `url` (PK), `title`, `platform`, `firstSeen`, `lastSeen`                                                                                 | Pages are global across users; views are user-scoped via VIEWED edges.                      |
| `:Session` | `id` (PK), `userId`, `startedAt`, `endedAt`, `signalCount`                                                                               | Optional grouping — used by analytics, not by trail compute.                                |
| `:Signal`  | `id` (PK), `userId`, `kind`, `ts`, `weight`, `metadata`                                                                                  | Atomic ingestion record — kept for audit + idempotency.                                     |

### 3.2 Relationship types

Every relationship has direction and a small set of properties.

| Rel                | From → To           | Properties                                                    | Cardinality                                          |
| ------------------ | ------------------- | ------------------------------------------------------------- | ---------------------------------------------------- |
| `:VIEWED`          | (User) → (Page)     | `at`, `dwellMs`                                               | many-to-many; one per (user, page, at)               |
| `:HAS_INTENT`      | (User) → (Topic)    | `strength`, `lastSeen`, `state` (`intent` \| `dormant`)       | one per (user, topic) — strength accumulates         |
| `:BLOCKS`          | (User) → (Topic)    | `at`                                                          | rarely many                                          |
| `:BOOSTS`          | (User) → (Topic)    | `at`, `weight`                                                | rarely many                                          |
| `:MENTIONS`        | (Page) → (Topic)    | `confidence`                                                  | many-to-many                                         |
| `:CONTAINS_ENTITY` | (Page) → (Entity)   | —                                                             | many-to-many                                         |
| `:RELATED_TO`      | (Topic) → (Topic)   | `weight`, `source` (`cooccurrence` \| `semantic` \| `manual`) | undirected in practice; stored as bidirectional pair |
| `:SIMILAR_TO`      | (Entity) → (Entity) | `score`                                                       | symmetric                                            |
| `:CONTAINS`        | (Session) → (Page)  | `position`                                                    | ordered                                              |

### 3.3 Constraints & indexes

(Defined in [cloud/src/graph/migrations/001_initial_schema.cypher](../../cloud/src/graph/migrations/001_initial_schema.cypher).)

```
CREATE CONSTRAINT user_id              FOR (u:User)   REQUIRE u.id IS UNIQUE;
CREATE CONSTRAINT topic_normalized     FOR (t:Topic)  REQUIRE t.normalizedName IS UNIQUE;
CREATE CONSTRAINT entity_id            FOR (e:Entity) REQUIRE e.id IS UNIQUE;
CREATE CONSTRAINT page_url             FOR (p:Page)   REQUIRE p.url IS UNIQUE;
CREATE CONSTRAINT session_id           FOR (s:Session)  REQUIRE s.id IS UNIQUE;
CREATE CONSTRAINT signal_id            FOR (g:Signal) REQUIRE g.id IS UNIQUE;

CREATE INDEX entity_kind   FOR (e:Entity)  ON (e.kind);
CREATE INDEX page_platform FOR (p:Page)    ON (p.platform);
CREATE INDEX topic_name    FOR (t:Topic)   ON (t.name);
CREATE INDEX session_user  FOR (s:Session) ON (s.userId);
CREATE INDEX signal_user_ts FOR (g:Signal) ON (g.userId, g.ts);

// 002_recommendation_indexes
CREATE INDEX rel_viewed_at        FOR ()-[r:VIEWED]-()      ON (r.at);
CREATE INDEX rel_intent_strength  FOR ()-[r:HAS_INTENT]-()  ON (r.strength);
CREATE INDEX rel_mentions_conf    FOR ()-[r:MENTIONS]-()    ON (r.confidence);
```

### 3.4 Sample Cypher patterns

Trail query (`getResearchTrail`):

```cypher
MATCH (u:User {id: $userId})-[:VIEWED]->(p:Page)-[:MENTIONS]->(t:Topic {normalizedName: $topic})
WITH t, p, u
OPTIONAL MATCH (u)-[i:HAS_INTENT]->(t)
RETURN
  t.name             AS topic,
  t.normalizedName   AS topicNormalizedName,
  collect(DISTINCT p.platform) AS platforms,
  count(DISTINCT p)            AS signalCount,
  coalesce(i.strength, 0)      AS strength,
  min(p.firstSeen)             AS firstSeen,
  max(p.lastSeen)              AS lastSeen
```

Top intents:

```cypher
MATCH (u:User {id: $userId})-[i:HAS_INTENT]->(t:Topic)
WHERE i.state = 'intent'
RETURN t.name AS topic, i.strength AS strength, i.lastSeen AS lastSeen
ORDER BY i.strength * exp(-(timestamp() - i.lastSeen) / $tau) DESC
LIMIT $limit
```

### 3.5 Scoring formulas

Intent strength:

```
strength_t+1 = strength_t × decay + Δ
  where:
    decay = exp(-Δt / τ),  τ default 14 days
    Δ     = kind_weight × user_action_weight × source_trust
```

`kind_weight`:

| kind                | weight                              |
| ------------------- | ----------------------------------- |
| `view`              | 1.0                                 |
| `dwell` (≥10s)      | 1.5                                 |
| `like` / `bookmark` | 3.0                                 |
| `purchase`          | 5.0                                 |
| `block`             | 0 (and sets intent state → blocked) |
| `boost`             | manual; user-specified              |

`source_trust`: 1.0 default; can be downweighted per-source if quality
drops (extension flagged as noisy in some user's data — TBD).

Trail-of-the-week selection (F-204):

```
score = recency × cross_platform_count × unresolved_signal
  recency             = exp(-Δt_since_last_signal / 7d)
  cross_platform_count = number of distinct platforms in trail
  unresolved_signal   = 1 if no purchase/decision logged, 0.3 otherwise
```

Documented here so any change goes through PR review of this doc.

---

## 4. Qdrant vector layout

### 4.1 Collections

One collection per **tenant**:

```
collection name:  tenant-<tid>            // for IaaS
                   tenant-recome-app       // for consumer (built-in tenant)
vector dim:        1536                    // OpenAI text-embedding-3-small
distance:          Cosine
quantization:      Scalar (int8) — saves ~75% RAM
on-disk:           true above 100k points
```

Per-tenant collections give us:

- **Strict isolation by construction** — no cross-tenant query possible.
- **Cheap GDPR delete** — drop collection on tenant delete.
- **Independent scaling** — large tenants can be moved to a dedicated
  Qdrant cluster without touching others.

### 4.2 Point payloads

Every vector has structured payload for filtering:

```json
{
  "id": "topic_<uuid>", // also stored as Neo4j Topic.embeddingId
  "userId": "tenant_t1__user42", // for filtering inside tenant collection
  "type": "topic", // "topic" | "page" | "entity"
  "name": "standing desks",
  "normalizedName": "standing-desks",
  "platforms": ["youtube", "reddit"],
  "createdAt": 1747526400000
}
```

Filter for "topics similar to X for this user":

```
filter: { must: [
  { key: "userId", match: { value: "tenant_t1__user42" } },
  { key: "type", match: { value: "topic" } }
] }
```

### 4.3 Index lifecycle

| Event                          | Action                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| New tenant created             | Lazy: collection created on first ingest.                                                                                      |
| New topic/page/entity in Neo4j | Embedding generated server-side, upserted to Qdrant with the Neo4j `embeddingId`.                                              |
| Tenant deleted                 | Collection dropped (synchronous, part of `DELETE /v1/users/:id`).                                                              |
| Embedding model upgrade        | New collection `tenant-<tid>-v2` populated by backfill job; cutover when complete; old collection deleted after 7-day burn-in. |

---

## 5. Redis layout

| Key pattern                           | Purpose                           | TTL     |
| ------------------------------------- | --------------------------------- | ------- |
| `embed:cache:<sha256>`                | Embedding result for `model:text` | 7d      |
| `ratelimit:<tier>:<keyOrIp>:<window>` | Sliding-window counter            | rolling |
| `session:<sid>`                       | Web session (future)              | 30d     |
| `bull:<queue>:*`                      | BullMQ internal                   | varies  |
| `extract:cache:<sha256(html_head)>`   | LLM topic-extraction cache        | 7d      |
| `idempotency:<key>`                   | Idempotent POST replay            | 24h     |

Eviction: `allkeys-lru` policy. Cache, not source of truth.

---

## 6. Multi-tenant isolation

Single most important data invariant — bugs here are cross-tenant data
leaks.

### 6.1 The composed userId

(See [cloud/src/iaas/tenantUserId.ts](../../cloud/src/iaas/tenantUserId.ts).)

Every node in Neo4j and every point in Qdrant carries a `userId` that
is one of:

- **Consumer:** raw Postgres `User.id` (a CUID like `cm123abc`). Never
  starts with `tenant_`.
- **IaaS:** `tenant_<tenantId>__<externalUserId>` — composed by the
  single helper `composeTenantUserId()`.

The `tenant_` prefix is reserved; consumer CUIDs cannot collide.

The `__` separator must not appear in either input; enforced by
`composeTenantUserId()` and `apiKeyMiddleware()` (both reject inputs
containing `__`). A unit test pins this invariant
([tenantUserId.test.ts](../../cloud/src/iaas/__tests__/tenantUserId.test.ts)).

### 6.2 Qdrant per-tenant collections

Even with userId namespacing in Neo4j, Qdrant uses a stronger
guarantee: separate collections. A SQL-injection-style query that
walks past Neo4j's userId filter cannot reach another tenant's
vectors at all — the collection name is the boundary.

### 6.3 Postgres row-level access

For tables with cross-tenant queries (Tenant, ApiKey, TenantUsage,
audit logs), application code always filters by `tenantId`. Postgres
RLS is not currently enabled on these tables (existing RLS is for
sync tables); added in P3 W30 as a defense-in-depth.

### 6.4 What is NOT in the model (deliberately)

- **No federated cross-tenant graph.** Cross-tenant aggregation
  becomes an offline ETL with explicit anonymization; never a runtime
  query.
- **No global topic taxonomy.** Topics are per-user; we never
  collaborate-filter across users. (Anti-workflow §7 of [0008](0008-workflows-and-personas.md).)
- **No PII in Qdrant payload.** Only structural metadata; the text
  embedded is the topic name or normalized page summary.

---

## 7. Data retention

| Class                                        | Retention                                          | Justification                                            |
| -------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| Active user data (Postgres + Neo4j + Qdrant) | Indefinite while account active                    | Product depends on long-term memory.                     |
| Deleted user data                            | Hard-deleted within 72h                            | GDPR Right to Erasure.                                   |
| Signals beyond 18 months                     | Archived to R2 cold storage; summary kept in Neo4j | Active graph small; archive recoverable for digest/chat. |
| Bulk-import uploads                          | 30 days then deleted                               | Just intermediate.                                       |
| Logs (Axiom)                                 | 30 days hot, 1 year cold                           | Standard.                                                |
| Error tracking (Sentry)                      | 90 days                                            | Standard.                                                |
| Audit log (Postgres)                         | 7 years                                            | Compliance default.                                      |
| Stripe data                                  | Per Stripe retention                               | They own it.                                             |

---

## 8. Migration approach

| Store    | Tool                                                                                            | Cadence                                       |
| -------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Postgres | Prisma migrations (versioned in `cloud/prisma/migrations/`)                                     | Per PR; deployed via `prisma migrate deploy`. |
| Neo4j    | Cypher files in `cloud/src/graph/migrations/`, runner applies pending on boot when env flag set | Per PR.                                       |
| Qdrant   | Lazy collection creation; payload schema is implicit, version via collection name suffix (`v2`) | Only on model/dim change.                     |
| Redis    | None (cache).                                                                                   | Flush on incompatible schema change.          |

Migration safety rules:

1. **Never delete a column / property until ≥1 release after the code
   that wrote to it is gone.**
2. **Backfill jobs run before the read code that depends on the new
   shape lands in prod.**
3. **All migrations idempotent and re-runnable.**
4. **Schema changes that touch >1 store coordinate via a feature
   flag.** Old store written; new store dual-written; reads cut over;
   old store deletion last.
