<p align="center">
  <img src="website/logo.png" alt="RecoMe Logo" width="128" />
</p>

<h1 align="center">RecoMe</h1>
<p align="center"><strong>Personal attention infrastructure</strong></p>

<p align="center">
  RecoMe captures what you research across the web, builds it into a personal interest graph in the cloud,
  and runs background agents on it — for you (consumer app) and for developers (the <code>/v1</code> API).
</p>

---

**The thesis:** every platform keeps a model of you that serves the platform. RecoMe builds the model of you that works _for_ you — and, with your permission, for any product you use. The chat isn't the product; the personal interest graph is. Canonical positioning lives in [docs/VISION.md](docs/VISION.md) and [docs/architecture/0013-competitive-positioning.md](docs/architecture/0013-competitive-positioning.md).

## How it works (v2 architecture)

```
Extension / PWA share-target / mobile   →   POST /intelligence/signals
        (thin capture clients)                       │
                                          Cloud (Hono + Prisma)
                                          Neo4j graph + Qdrant vectors
                                                     │
                              Five agents + Guardian gate (cost cap, pause, quiet hours)
                                                     │
                    In-page surfaces · Web app (recome.app) · Inbox · /v1 developer API
```

- **Capture** ([extension/](extension/)) — Manifest V3 thin client: per-platform extractors emit `view`/`search` signals (10s dwell), queue in IndexedDB, batch-upload every 30s. No LLM keys, no graph, no analytics SDKs in the browser.
- **Graph** ([cloud/src/graph/](cloud/src/graph/)) — typed interest graph in Neo4j (User/Topic/Entity/Page/Session/Signal, EWMA-weighted intents) + Qdrant embeddings.
- **Agents** ([cloud/src/agents/](cloud/src/agents/)) — Recall, Concierge, Curator, Decision, Curriculum; all gated by [GuardianAgent](cloud/src/agents/GuardianAgent.ts): opt-in, throttle, quiet hours, and a hard $0.10/user/day LLM cost ceiling.
- **Surfaces** ([web/](web/)) — Next.js app: dashboard, mind map, ask (SSE chat), inbox, personality mirror, audit log; installable PWA with share-target.
- **Developer platform** ([cloud/src/iaas/](cloud/src/iaas/)) — `api.recome.app/v1`: POST signals, GET trails/intents per external user, GDPR delete, OpenAPI at `/v1/docs`, metered quotas.

## Trust constraints (binding)

1. Every agent output cites its source signals. 2. Agents recommend, never act — Concierge never clicks Buy. 3. One-click pause per agent. 4. The Audit Log of You: see and delete everything. 5. Hard daily LLM cost cap enforced in code.

## Quick start

### Extension (build from source)

```bash
npm install
npm run build       # outputs dist/ — load as unpacked extension at chrome://extensions
```

Sign in once at recome.app; the extension picks up the session (no local accounts).

### Cloud + web (local dev)

```bash
./scripts/dev-local.sh    # boots Postgres/Neo4j/Qdrant via docker-compose + cloud API
cd web && npm run dev     # Next.js app
```

The intelligence surface (`/intelligence`, `/v1`, `/developer`) requires `INTELLIGENCE_ENABLED=true` plus Neo4j, Qdrant, and an OpenAI key — see [cloud/src/config.ts](cloud/src/config.ts). Secrets go in `cloud/.env.local` (gitignored sidecar).

### Repo checks

```bash
npm run validate    # typecheck + lint + jest (extension/packages)
```

## Repo map

| Path                     | What it is                                                           |
| ------------------------ | -------------------------------------------------------------------- |
| [extension/](extension/) | Thin capture + render Chrome extension (MV3)                         |
| [cloud/](cloud/)         | API, graph, agents, billing, IaaS `/v1` (deployable to Fly)          |
| [web/](web/)             | Consumer web app + developer dashboard (Next.js PWA)                 |
| [mobile/](mobile/)       | Expo share-sheet clients (Android intent filters live; iOS scaffold) |
| [docs/](docs/)           | ADRs, HLD/LLD, audits, [VISION.md](docs/VISION.md)                   |
| [graveyard/](graveyard/) | v1 local-first implementation (reference only — do not build on it)  |

## Privacy, honestly

v1 was local-first; **v2 is not**, by design ([CHANGELOG](CHANGELOG.md) 2.0.0). Signals — page URLs, titles, extracted topics — upload to your cloud account, where the graph lives. What holds instead of "100% local": no third-party telemetry in the extension, no LLM keys in the browser, capture blocked on auth/CAPTCHA/error pages and a chat-app denylist ([PageEligibility.ts](extension/src/content/PageEligibility.ts)), incognito skipped, per-platform toggles, and full GDPR delete cascading graph + vectors + audit log.

## License

[MIT](LICENSE)
