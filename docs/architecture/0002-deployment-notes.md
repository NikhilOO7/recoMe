# ADR-0002 — Intelligence Stack Deployment Notes

**Status:** Accepted (operational companion to ADR-0001)
**Date:** 2026-05-14
**Owner:** Platform / On-call

This is the operational complement to ADR-0001. It tells the operator (currently the founder) how to set up Neo4j AuraDB, Qdrant Cloud, and OpenAI for the cloud backend, and how to run schema migrations safely.

---

## 1. Local development

Everything needed lives in `cloud/docker-compose.yml`:

```bash
cd cloud
cp .env.example .env
# Fill in OPENAI_API_KEY in .env (other vars have docker defaults).
docker compose up -d
docker compose logs -f api
```

This brings up:

- Postgres (port 5432)
- Neo4j Community (port 7474 browser, 7687 bolt) — login `neo4j` / `recomeneo4jdev`
- Qdrant (port 6333 HTTP, 6334 gRPC) — dashboard at http://localhost:6333/dashboard
- API (port 3001) with `INTELLIGENCE_ENABLED=true` and `INTELLIGENCE_RUN_MIGRATIONS_ON_BOOT=true`

Schema migrations apply automatically at API boot in this configuration. The migration runner is idempotent; restart freely.

To run migrations manually (preferred for prod-like dev):

```bash
INTELLIGENCE_RUN_MIGRATIONS_ON_BOOT=false npm run graph:migrate
```

---

## 2. Production setup

### 2.1 Neo4j AuraDB

1. Create a free Aura instance: https://console.neo4j.io/ — pick the region closest to your Fly.io app.
2. On creation Aura gives you a one-time download with credentials. **Save the password to a secrets manager (1Password / Bitwarden / Fly secret) before closing the dialog.** It is not recoverable.
3. Note the bolt URI: `neo4j+s://<id>.databases.neo4j.io:7687`.
4. Set Fly secrets:
   ```bash
   fly secrets set \
     NEO4J_URI="neo4j+s://<id>.databases.neo4j.io:7687" \
     NEO4J_USERNAME="neo4j" \
     NEO4J_PASSWORD="<aura-password>" \
     NEO4J_DATABASE="neo4j"
   ```
5. AuraDB Free limits: 200k nodes / 400k relationships. Watch usage; AuraDB Pro starts at $65/mo with a 4GB instance.

### 2.2 Qdrant Cloud

1. Sign up: https://cloud.qdrant.io/ — same region as Aura and Fly app.
2. Create a free 1GB cluster.
3. Generate an API key from the cluster's Access Management screen.
4. Set Fly secrets:
   ```bash
   fly secrets set \
     QDRANT_URL="https://<cluster-id>.<region>.aws.cloud.qdrant.io" \
     QDRANT_API_KEY="<api-key>" \
     QDRANT_COLLECTION="recome_v1"
   ```
5. The collection is **created on first boot** by `QdrantClient.ensureCollection()` with cosine distance and the embedding-model dimension (1536 for `text-embedding-3-small`).

### 2.3 OpenAI

1. Create a project-scoped key (not the user-default key): https://platform.openai.com/api-keys
2. Restrict it to the `Embeddings` permission scope only.
3. Set:
   ```bash
   fly secrets set \
     OPENAI_API_KEY="sk-proj-..." \
     OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
   ```
4. Set a usage budget at https://platform.openai.com/settings/organization/limits — expected spend under $5/mo at expected signal volume.

### 2.4 Enable the stack

Final Fly secrets to flip the feature on:

```bash
fly secrets set \
  INTELLIGENCE_ENABLED=true \
  INTELLIGENCE_RUN_MIGRATIONS_ON_BOOT=false \
  LOG_LEVEL=info
```

Then deploy. The `/ready` endpoint will probe Neo4j and Qdrant before reporting ready.

---

## 3. Schema migrations in production

**Never** set `INTELLIGENCE_RUN_MIGRATIONS_ON_BOOT=true` in production. Reasons:

- It couples app deploy to schema change. A failed migration blocks a code rollback.
- Fly auto-scaling can boot N instances simultaneously; concurrent migration writes are safe (MERGE/IF NOT EXISTS) but produce noisy logs.

Run migrations as a one-shot job:

```bash
fly ssh console
cd /app
npm run graph:migrate
exit
```

Or locally against the production Aura instance:

```bash
NEO4J_URI=neo4j+s://<id>.databases.neo4j.io:7687 \
NEO4J_USERNAME=neo4j \
NEO4J_PASSWORD=$(fly secrets list | grep NEO4J_PASSWORD) \
npm run graph:migrate
```

The runner records applied migrations in `(:Migration {id, appliedAt})` nodes; re-runs are idempotent.

---

## 4. Operational characteristics

### 4.1 Health probes

| Endpoint      | Purpose        | Probe target                              |
| ------------- | -------------- | ----------------------------------------- |
| `GET /live`   | process alive  | Fly liveness check                        |
| `GET /ready`  | deps reachable | Fly readiness gate before routing traffic |
| `GET /health` | legacy alias   | existing monitors                         |

`/ready` does a single `RETURN 1` to Neo4j and a `getCollections()` to Qdrant. Both have a ~500ms timeout via the `withRetry` wrapper's first-attempt budget.

### 4.2 Graceful shutdown

`installSignalHandlers()` (in `cloud/src/observability/lifecycle.ts`) registers SIGTERM/SIGINT handlers that drain registered `onShutdown` hooks in reverse-registration order. Currently:

1. Qdrant client (no-op — REST)
2. Neo4j driver (`driver.close()` waits for in-flight sessions)

Fly sends SIGTERM with a default 30-second grace period, which is enough for our largest expected transaction (signal ingest, <100ms).

### 4.3 Cost ceiling (year 1)

| Service                    | Monthly                       |
| -------------------------- | ----------------------------- |
| Fly.io (existing)          | ~$5                           |
| Neo4j AuraDB Free          | $0                            |
| Qdrant Cloud Free 1GB      | $0                            |
| OpenAI embeddings          | <$5 at expected signal volume |
| **Total intelligence add** | **<$10/mo**                   |

When you outgrow free tiers:

- Aura Pro: $65/mo at 4GB. Migration is a backup-restore.
- Qdrant Cloud paid: ~$25/mo at 2GB.
- Switching embeddings to Voyage AI: ~3x current OpenAI cost.

### 4.4 GDPR

`DELETE /intelligence/me` (auth required) calls `IntelligenceService.forgetUser(userId)` which:

1. Detaches and deletes the `(:User {id: $userId})` node and all incident relationships.
2. Deletes all `(:Session {userId: $userId})` and `(:Signal {userId: $userId})` nodes.
3. Deletes the user's namespace in Qdrant (`payload.userId == $userId`).

`Topic` and `Page` nodes are intentionally preserved — they are shared infrastructure, contain no PII, and dropping them would break other users' graphs.

---

## 5. Failure modes & runbook

| Symptom                                         | Likely cause                                | Fix                                                                                                                               |
| ----------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `/ready` returns 503                            | Aura or Qdrant unreachable                  | Check Aura console + Qdrant cluster status; restart pod if both healthy.                                                          |
| API boots but signals 500                       | OpenAI 429/quota                            | Bump usage limit; embedding step is best-effort — graph signals still land.                                                       |
| `Neo.ClientError.Security.AuthorizationExpired` | Aura password rotated                       | Update Fly secret; restart.                                                                                                       |
| Qdrant `dim mismatch` on upsert                 | Embedding model changed                     | Re-create collection (`QDRANT_COLLECTION=recome_v2`) and re-embed; old vectors are not migrated automatically.                    |
| Migration stuck                                 | Cypher syntax error in new migration file   | Drop the `(:Migration {id: 'NNN'})` node, fix the file, re-run. Each migration is a single tx; partial application is impossible. |
| Stats undercounting                             | (See audit) extension stats race, unrelated | Out of scope for this stack.                                                                                                      |

---

## 6. What this ADR does **not** cover

- Bulk import of existing users' IndexedDB graphs. The shape of `recordSignal()` accepts historical timestamps, so a one-shot script can replay each user's local graph through the ingest API. To be implemented as `cloud/scripts/import-legacy.ts`.
- Cross-region read replicas. Single-region until measured latency complaints.
- Embedding cache (Redis). Add when OpenAI bill or P95 latency demands it.
- Replacing `brain/src/tools/ToolExecutor` so the orchestrator agents actually call the new intelligence endpoints. Tracked in audit; orthogonal.
