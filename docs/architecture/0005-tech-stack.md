# 0005 — Tech Stack

**Status:** Living document
**Last reviewed:** 2026-05-17
**Companion to:** [0001 graph+vector](0001-graph-vector-stack.md),
[0006 system architecture](0006-system-architecture.md)

The **definitive** list of every dependency, with the alternative we
considered and the reason we chose this one. Before adding anything new
to `package.json`, open a PR that updates this doc.

---

## 0. Principles

1. **Boring tech, novel product.** Each layer is a load-bearing,
   well-supported, well-documented choice. Novelty lives in the data
   model and the product, not in build tooling.
2. **One language per layer.** TypeScript everywhere we can; SQL where
   the DB demands it; Cypher for Neo4j; small bash scripts for ops.
3. **Buy < self-host < build.** We only self-host where the bill or the
   lock-in dominates, and only build where the IP is differentiating.
4. **No vendor lock-in for data layers.** Everything we store can be
   exported and migrated to an alternative within a sprint.

---

## 1. Stack by layer

### 1.1 Runtime & languages

| Layer                 | Choice            | Version         | Alternatives considered      | Why this                                                                                              |
| --------------------- | ----------------- | --------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| Backend runtime       | Node.js           | 20 LTS          | Bun, Deno                    | Mature, every cloud supports it, Prisma + neo4j-driver mature.                                        |
| Backend framework     | Hono              | 4.x             | Fastify, Express, Elysia     | Edge-compatible, sub-ms overhead, TS-native, small surface. Fastify was a near tie.                   |
| Language (everywhere) | TypeScript        | 5.9 strict      | Plain JS, Rust               | Type safety is leverage for a small team. Rust is the right answer for data layers we don't have yet. |
| Web framework         | Next.js           | 16 (App Router) | Remix, SvelteKit             | App-router maturity, RSC support, Vercel + self-host both viable.                                     |
| UI lib                | React             | 19              | Solid, Svelte                | Hiring market + ecosystem; RSC requires React.                                                        |
| Styling               | Tailwind          | 4               | CSS Modules, vanilla-extract | Velocity, design-system consistency, JIT performance.                                                 |
| State (web)           | React state + URL | —               | Zustand, Jotai               | Most of our UI is server-rendered. Client state is small.                                             |
| Extension runtime     | Webpack 5 bundle  | —               | Vite                         | Already shipped; not worth migrating mid-pivot.                                                       |
| Mobile (PWA)          | Next.js PWA       | —               | Capacitor, Expo              | PWA is the v2 wedge per ADR-0003; Capacitor/Expo deferred to v3.                                      |

### 1.2 Data stores

| Store                  | Choice                                             | Used for                                                                                             | Why this                                                                                                                        |
| ---------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Relational**         | Postgres 16                                        | Users, billing, auth, sync metadata, tenants, API keys, usage counters, audit logs                   | Standard, transactional, every ORM supports it. RLS for tenant isolation at OLTP.                                               |
| **Graph**              | Neo4j 5 (Community for self-host, AuraDB for prod) | The personal interest graph: users, topics, entities, pages, sessions, signals + typed relationships | See [0001](0001-graph-vector-stack.md).                                                                                         |
| **Vector**             | Qdrant 1.x                                         | Semantic similarity over topics, pages, entities                                                     | OSS, self-hostable, no lock-in. Pinecone is the obvious alternative; we abstract behind `VectorClient` so swapping is one file. |
| **Cache / queue**      | Redis 7                                            | Embedding cache, rate-limit counters (distributed), session cache, future BullMQ jobs                | Industry default. Self-hosted now; Upstash if we go multi-region.                                                               |
| **Object storage**     | Cloudflare R2                                      | Bulk-import file uploads (YouTube history HTML, CSV exports), digest email attachments               | S3-compatible, no egress fees, cheap.                                                                                           |
| **Search (full-text)** | Postgres `tsvector` for now                        | Trail / topic full-text search                                                                       | Free, sufficient until ≥1M topics. Move to Typesense/Meilisearch when latency p95 >250ms.                                       |

### 1.3 ORM, drivers, query layers

| Layer                     | Choice                    | Alternatives         | Why                                                                                                                                        |
| ------------------------- | ------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Postgres ORM              | Prisma 6                  | Drizzle, Kysely      | Already in use; type-safe; migrations done well; Drizzle is the alternative we'd pick from scratch but the migration cost isn't justified. |
| Neo4j driver              | `neo4j-driver` (official) | n/a                  | Only serious option. Native connection pool, retries on transient errors.                                                                  |
| Vector client             | `@qdrant/js-client-rest`  | —                    | Official Qdrant JS client.                                                                                                                 |
| Redis client              | `ioredis`                 | `redis` (node-redis) | Better cluster + pipelining support.                                                                                                       |
| HTTP client (server-side) | native `fetch`            | undici, axios        | Node 20 built-in; no extra dep.                                                                                                            |
| Validation                | Zod                       | yup, valibot         | Already in use; great DX with TS.                                                                                                          |
| Cron / scheduling         | node-cron in-process      | BullMQ + Redis       | In-process is enough until P1. Move to BullMQ at P2 for digest emails + bulk-import workers.                                               |

### 1.4 LLM, embeddings, AI

| Component              | Choice                                   | Alt                         | Why                                                                                                                    |
| ---------------------- | ---------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Chat LLM (primary)     | Claude Sonnet 4.6 (`claude-sonnet-4-6`)  | GPT-4o, Gemini              | Best tool-calling reliability, large context, predictable refusals on personal-data scenarios.                         |
| Chat LLM (fallback)    | OpenAI GPT-4o                            | Llama 3.1 405B via Together | Different vendor for failover.                                                                                         |
| Embeddings             | OpenAI text-embedding-3-small (1536 dim) | Voyage-3, BGE               | Cheap ($0.02/M tok), good enough. Voyage upgrade gated by §7 of [0004](0004-production-roadmap.md).                    |
| LLM SDK                | `@anthropic-ai/sdk` + `openai`           | LangChain, Vercel AI SDK    | Direct SDK; LangChain adds indirection we don't need. Vercel AI SDK considered for streaming — TBD when chat UI lands. |
| Prompt management      | Code + git                               | Promptlayer, Helicone       | Keep prompts in version control. Adopt observability layer when prompt count >20.                                      |
| Tool-calling framework | Native Anthropic + OpenAI tools APIs     | LangChain agents            | Native APIs do everything we need; LangChain adds 200KB+ and unclear abstractions.                                     |

### 1.5 Auth, payments

| Component       | Choice                                                 | Alt                         | Why                                                                                            |
| --------------- | ------------------------------------------------------ | --------------------------- | ---------------------------------------------------------------------------------------------- |
| Consumer auth   | Self-hosted (Prisma + bcrypt + JWT) — already in place | Clerk, Auth0, Supabase Auth | Already shipped; switching cost > benefit at this stage. Migrate to Clerk if we need SSO/SCIM. |
| OAuth providers | Google, GitHub, Facebook                               | Apple Sign-In               | Add Apple before PWA push notifications.                                                       |
| IaaS auth       | API keys (`rk_(live\|test)_<28>`) — already shipped    | OAuth client_credentials    | Simple, dev-friendly. OAuth client_credentials in v2 if enterprise demands.                    |
| Payments        | Stripe                                                 | Paddle, Lemon Squeezy       | Best dev experience; mature metering API for IaaS.                                             |
| Webhooks        | Native Stripe                                          | Svix                        | Native is enough until we have multi-tenant webhooks of our own.                               |

### 1.6 Email / messaging

| Component                            | Choice                                             | Alt                | Why                       |
| ------------------------------------ | -------------------------------------------------- | ------------------ | ------------------------- |
| Transactional email                  | Resend                                             | SendGrid, Postmark | DX + deliverability.      |
| Marketing email / digest             | Resend Audiences (initially) → Loops / Customer.io | —                  | Avoid premature MarTech.  |
| Inbound email (`save@recome.app` v2) | Postmark inbound                                   | SendGrid Parse     | Cleanest webhook payload. |

### 1.7 Frontend tooling

| Component       | Choice                                      | Alt              | Why                                                         |
| --------------- | ------------------------------------------- | ---------------- | ----------------------------------------------------------- |
| Linting         | ESLint 9 (flat config) + @typescript-eslint | Biome            | Existing setup. Biome on radar.                             |
| Formatting      | Prettier                                    | Biome            | Same — pre-commit hook already wired via husky+lint-staged. |
| Component dev   | None yet                                    | Storybook        | Add at P2 when chat UI complexity warrants.                 |
| Tailwind plugin | `@tailwindcss/postcss` (Tailwind 4 style)   | —                | Per current setup.                                          |
| Icons           | Lucide (via `lucide-react`)                 | Heroicons, Radix | Choose at first need.                                       |

### 1.8 Testing

| Layer                        | Choice                       | Alt           | Why                                                                       |
| ---------------------------- | ---------------------------- | ------------- | ------------------------------------------------------------------------- |
| Cloud unit tests             | Vitest                       | Jest          | Already in cloud package, faster than Jest, native ESM.                   |
| Extension/Brain unit tests   | Jest 29                      | Vitest        | Existing; migrate to Vitest when we touch the suite anyway.               |
| E2E                          | Playwright                   | Cypress       | Better cross-browser + mobile emulation. Set up in P0 W5.                 |
| Integration (graph + vector) | Vitest + testcontainers-node | Manual docker | Add in P1; right now we mark integration tests `skip` if env unavailable. |
| Load test                    | k6                           | Artillery     | Used in P3 to validate IaaS quota / rate-limit math.                      |

### 1.9 Infra & deploy

| Layer                      | Choice                           | Alt                            | Why                                                                                                             |
| -------------------------- | -------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| App host (cloud API)       | Fly.io                           | Render, Railway, AWS Fargate   | Already deployed there; great geo + scale-to-zero.                                                              |
| App host (web)             | Vercel                           | Fly, Render                    | Best DX for Next 16; Vercel's bandwidth pricing is the cost watch trigger in [0011](0011-cost-and-iaas-gtm.md). |
| Postgres host              | Neon (or Supabase)               | RDS, Cloud SQL                 | Neon serverless + branching; Supabase if we want Auth/Storage bundled.                                          |
| Neo4j host                 | Neo4j AuraDB Free → Professional | self-hosted on Fly             | Managed; spec'd in [0002](0002-deployment-notes.md).                                                            |
| Qdrant host                | Qdrant Cloud Free → Standard     | self-hosted on Fly             | Managed; spec'd in [0002](0002-deployment-notes.md).                                                            |
| Redis                      | Upstash                          | self-hosted                    | Pay-per-request fits scale-to-zero.                                                                             |
| Object storage             | Cloudflare R2                    | S3, B2                         | No egress fees.                                                                                                 |
| CDN                        | Cloudflare                       | Vercel default                 | Already on Cloudflare for DNS; consolidate.                                                                     |
| Domain / DNS               | Cloudflare                       | Route53                        | Same.                                                                                                           |
| Email DNS (DKIM/SPF/DMARC) | Resend-provisioned               | Manual                         | Less footgun.                                                                                                   |
| CI/CD                      | GitHub Actions                   | Vercel auto-deploys (web only) | Standard. Cloud deploys via `fly deploy` triggered by Actions on `main`.                                        |
| Container registry         | GHCR (GitHub Container Registry) | Docker Hub                     | Free for private repos; integrates with Actions.                                                                |

### 1.10 Observability

| Concern            | Choice                         | Alt                  | Why                                                                     |
| ------------------ | ------------------------------ | -------------------- | ----------------------------------------------------------------------- |
| Structured logs    | pino (already in use)          | winston              | Fastest; JSON-first; ships well to Logflare/Axiom.                      |
| Log aggregation    | Axiom                          | Datadog, Logflare    | Generous free tier; pino integration.                                   |
| Error tracking     | Sentry                         | Bugsnag              | Standard; cheap at our scale.                                           |
| Metrics            | OpenTelemetry → Honeycomb      | Prometheus + Grafana | Pull when we hit Phase 2; until then, logs + uptime monitor are enough. |
| Uptime monitor     | Better Stack (or Hetrix)       | Pingdom, UptimeRobot | Cheap; sends Slack/PagerDuty.                                           |
| Frontend analytics | PostHog (self-hosted or cloud) | Mixpanel, Amplitude  | Open-source, owns the data, session replay included.                    |
| LLM observability  | Helicone                       | Langfuse             | Add at P2 with chat.                                                    |

### 1.11 Security tooling

| Concern                | Choice                               | Alt        | Why                                                          |
| ---------------------- | ------------------------------------ | ---------- | ------------------------------------------------------------ |
| Dependency scan        | Dependabot + npm audit + osv-scanner | Snyk       | Free, native.                                                |
| Secret scan in CI      | Gitleaks                             | trufflehog | Faster, fewer false positives.                               |
| SAST                   | CodeQL (GitHub)                      | Semgrep    | Free; covers OWASP top 10.                                   |
| Container scan         | Trivy                                | Anchore    | Free, fast.                                                  |
| Auth password hash     | bcrypt (cost 12) — already in use    | Argon2id   | bcrypt is fine; consider Argon2id at next major auth change. |
| TLS                    | Cloudflare-terminated + Fly upstream | Caddy      | Off-the-shelf.                                               |
| WAF                    | Cloudflare                           | —          | Default.                                                     |
| Backup encryption keys | AWS KMS (or Fly secrets)             | Vault      | KMS is enough until we have multiple environments.           |

---

## 2. Repositories and packages (current)

This monorepo lives under `recoME/` and contains:

```
recoME/
├── extension/        # Chrome MV3 extension (shipped; maintenance only)
├── web/              # Next.js 16 app (recome.app)
├── cloud/            # Hono API + Prisma + intelligence stack
├── brain/            # Local intelligence library (used by extension + cloud)
├── agent/            # Agent / chat services (used by extension; cloud agent is TBD)
├── packages/
│   ├── schema/       # Shared Zod / TS types
│   └── utils/        # Shared logging, helpers
├── graveyard/        # Out-of-build experiments (see AUDIT_2026-05-14.md)
└── docs/
    └── architecture/
```

Tooling target: pnpm workspaces + Turborepo is the right end state
(noted in audit). Deferred until after Phase 1 — premature now.

---

## 3. Versions to pin (locked at runtime via lockfiles)

| Package                     | Current                      | Pin reason                                                               |
| --------------------------- | ---------------------------- | ------------------------------------------------------------------------ |
| `next`                      | 16.2.2                       | App Router contract; major bumps require ADR.                            |
| `react` / `react-dom`       | 19.2.x                       | Coupled to Next 16.                                                      |
| `@anthropic-ai/sdk`         | latest stable on each commit | We follow Anthropic SDK conventions, including their model-version pins. |
| `openai`                    | latest stable                | Same.                                                                    |
| `prisma` / `@prisma/client` | 6.19.x                       | Schema is the source of truth; bump in lockstep.                         |
| `neo4j-driver`              | 5.x                          | Coupled to AuraDB server version.                                        |
| `@qdrant/js-client-rest`    | latest                       | Loose coupling; client is thin.                                          |
| `hono`                      | 4.x                          | Watch for v5 breaking changes.                                           |
| `zod`                       | 3.x                          | v4 alpha; do not upgrade until stable + benefit justifies.               |

---

## 4. Stack debts (known and tracked)

These are the items the [audit 2026-05-14](../../AUDIT_2026-05-14.md)
called out that still apply. Each has an owner and a target phase.

| Debt                                                                 | Owner       | Target                                        | Cost if not paid                                 |
| -------------------------------------------------------------------- | ----------- | --------------------------------------------- | ------------------------------------------------ |
| `cloud/` Hono context typing errors workaround `tsc … \|\| true`     | Founder     | P1                                            | Lose type safety on every controller.            |
| `ToolExecutor` has zero registered tools — orchestrator agents inert | Founder     | P2 (when we wire LLM tools for chat)          | Carry dead-code that looks alive.                |
| Extension god-classes (`BaseAdapter`, `messageHandler`)              | Maintenance | not a blocker until we add ≥1 new contributor | —                                                |
| No Prisma migrations directory (`prisma db push` deploys)            | Founder     | P0 W5 (before P0 review)                      | Inevitable production data-loss incident.        |
| No structured request tracing                                        | Founder     | P1 W11                                        | Hard to debug LLM tool-call chains in P2.        |
| No distributed rate limiter (in-memory only)                         | Founder     | P3 W26                                        | Trivially bypassable when Fly scales >1 machine. |

---

## 5. Additions explicitly rejected

Documented so a future PR doesn't reintroduce them without a real reason.

| Rejected                                             | Reason                                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| LangChain / LlamaIndex                               | Indirection cost > value at our scale. Native SDKs do all we need.                                                 |
| GraphQL                                              | REST + tight Zod schemas is enough; GraphQL adds N+1 risk and tooling overhead.                                    |
| Kubernetes                                           | Fly + Vercel are right for solo-team ops. Revisit at ≥10 backend engineers.                                        |
| tRPC                                                 | Over-couples web ↔ cloud; we want web/extension/IaaS to all hit the same REST surface.                             |
| Monorepo build orchestrator (Nx/Turborepo) right now | Tooling is overhead until we have CI build-time pain. Add at P2.                                                   |
| Custom design system                                 | Tailwind + Radix primitives at need. Don't build a `packages/ui` until we have ≥3 surfaces with shared components. |
| Pinecone                                             | Cost & lock-in vs Qdrant. See ADR-0001.                                                                            |
| Voyage embeddings (now)                              | Gate by §7 of [0004](0004-production-roadmap.md).                                                                  |
| Self-hosted Postgres                                 | Operational tax exceeds Neon/Supabase price at our scale.                                                          |
| Notion-style block editor for trails                 | Out of scope; we are not a notes app.                                                                              |
