# 0010 — Security, Privacy & Operations

**Status:** Living document
**Last reviewed:** 2026-05-17
**On-call:** Founder (until first hire — see [0004](0004-production-roadmap.md) §5)
**Status page:** status.recome.app (F-903)

The production-readiness layer. Anything written here is enforceable
in CI or in deployment scripts unless explicitly marked **manual**.

---

## 1. Threat model

We are a consumer + IaaS product handling personal attention data
across multiple platforms. Realistic adversaries, in order of priority:

| Adversary                                    | Capability                                                                                                            | What they get if they win                           | Cost to defend                                                                             |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Opportunistic web attacker**               | Public internet, automated scanners                                                                                   | Account takeover via weak auth, credential stuffing | Low; standard hygiene                                                                      |
| **Malicious tenant (IaaS)**                  | Valid API key, motivated                                                                                              | Cross-tenant data, free quota abuse                 | Medium; tenant isolation is the load-bearing defense (see [0009 §6](0009-data-model.md#6)) |
| **Phishing → user account**                  | Email + password leaks                                                                                                | Single user's research history                      | Low; standard hygiene + 2FA roadmap                                                        |
| **Insider (founder = sole insider for now)** | Production DB access                                                                                                  | Everything                                          | Medium; mitigated by audit logs, future SoD                                                |
| **State-level / sophisticated APT**          | Out of scope. We are not high-value enough to warrant their effort; we say so explicitly and don't pretend otherwise. | n/a                                                 | We don't try to defend against this.                                                       |

What we do **not** protect against:

- Compromised end-user device. If their Mac is owned, their Recome
  data is owned. We do not promise device-level threat protection.
- Side-channel inference from public APIs. We rate-limit and require
  auth; we don't try to prevent traffic-analysis.
- Legal compulsion. We will comply with valid subpoenas; transparency
  report when there's enough data to warrant one.

---

## 2. AuthN / AuthZ

### 2.1 Consumer auth (web, extension, PWA)

- Email + password (bcrypt cost 12) OR Google / GitHub / Facebook OAuth.
- JWT access token (15min) + refresh token (30d, rotated on use).
- Refresh-token reuse detection: a re-used (already-rotated) refresh
  triggers revoke-all-tokens for the user + email alert.
- 2FA (TOTP): **deferred to P2 W22**. Trigger: 100+ DAU.

### 2.2 IaaS auth

- Bearer `rk_live_…` / `rk_test_…` API keys.
- Per-request validation: SHA-256 hash lookup + revoked/expired/status
  checks ([cloud/src/iaas/apiKeyMiddleware.ts](../../cloud/src/iaas/apiKeyMiddleware.ts)).
- Tenant + external user attribution on every authed call.
- Key issuance: shown exactly once at creation; never retrievable.
- Key rotation: instant; old key deactivated within ~1s of revoke.

### 2.3 Admin

- Role: `ADMIN` or `SUPER_ADMIN` on the User table.
- 2FA required for admin role. Not yet enforced — gap. Trigger: before
  first non-founder admin user.

---

## 3. Secrets & key management

| Secret class                                 | Where stored               | Who can read   |
| -------------------------------------------- | -------------------------- | -------------- |
| `JWT_SECRET`, `JWT_REFRESH_SECRET`           | Fly secrets                | App at runtime |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Fly secrets                | App at runtime |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`        | Fly secrets                | App at runtime |
| `NEO4J_PASSWORD`, `QDRANT_API_KEY`           | Fly secrets                | App at runtime |
| `DATABASE_URL`, `DIRECT_URL`                 | Fly secrets + local `.env` | App + founder  |
| OAuth client secrets                         | Fly secrets                | App at runtime |
| Resend API key                               | Fly secrets                | App at runtime |
| Sentry / Axiom / PostHog write tokens        | Fly secrets + Vercel envs  | App at runtime |

Rules:

- **Never commit secrets.** `.gitignore` + `gitleaks` in CI.
- **Never log secrets.** Pino redactors configured for `apiKey`,
  `password`, `token`, `secret`
  ([cloud/src/observability/logger.ts](../../cloud/src/observability/logger.ts)).
- **Rotate quarterly.** Calendar reminder; documented in §11 runbook.
- **Rotate immediately on suspected leak.** Runbook §11.4.
- **No secrets in URL query strings.** Headers only.

---

## 4. Input validation & abuse

### 4.1 Validation

- Every public endpoint validates body / query / params with Zod.
- Reject early with structured `{ error, details }` for `safeParse`
  failures.
- Field length caps documented in [intelligence/schemas.ts](../../cloud/src/intelligence/schemas.ts).

### 4.2 Rate limiting

- **Today:** in-memory token-bucket per tier — see
  [middleware/rateLimiter.ts](../../cloud/src/middleware/rateLimiter.ts).
  Limits in [config.ts](../../cloud/src/config.ts).
- **Gap:** in-memory means bypassable on >1 Fly machine. Documented
  as debt in [0005 §4](0005-tech-stack.md#4). Migrate to Upstash
  Redis sliding-window in P3 W26 alongside IaaS launch.

Per-tier limits (current; may tune):

| Tier                       | req / min | req / day | Burst |
| -------------------------- | --------- | --------- | ----- |
| anonymous (`/api/extract`) | 10        | 300       | 20    |
| FREE consumer              | 60        | 5,000     | 100   |
| PRO consumer               | 300       | 50,000    | 500   |
| PREMIUM consumer           | 600       | 200,000   | 1,000 |
| IaaS — see plan quotas     | per quota | per quota | —     |

### 4.3 Abuse signals

- Repeated 401 from one IP in 5 min → temporary IP block (15 min) +
  alert.
- One tenant exceeding free quota by >2× within 24h → manual review.
- SQL/Cypher injection attempts via filename/payload markers → log to
  Sentry as `security.attempt`.

---

## 5. SSRF, request smuggling, etc.

- `/api/extract` SSRF guard ([web/src/app/api/extract/route.ts](../../web/src/app/api/extract/route.ts)):
  blocks `localhost`, RFC1918, `169.254.0.0/16`, `0.0.0.0`. **Known
  gap:** DNS rebinding bypass possible. Mitigation: deploy on Vercel
  which uses egress proxies that don't have access to our private
  networks. Add proper DNS-resolution check in P2.
- All outbound HTTP from the cloud API uses native fetch (no `curl
-k`); CA-cert pinned to system store.
- Body size caps: 1MB on `/api/extract`, 100MB on `/import/*` (with
  streaming parse).
- No raw HTML rendering of any user-provided content. React escapes
  by default.

---

## 6. Privacy

### 6.1 What we store

Per user, by category:

- **PII required:** email, password hash, OAuth IDs, display name,
  avatar URL.
- **PII derived from product use:** captured URLs, page titles,
  extracted topics, signal timestamps.
- **Behavioral telemetry:** PostHog events with `userId` for cohort
  analysis.
- **NOT stored:** payment card details (Stripe), the literal page
  body of captured URLs (only metadata), browser cookies from
  captured sites.

### 6.2 GDPR / DPDP

| Right                  | How we honor                                                                                        | SLA                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Right to access        | `GET /user/export` returns JSON dump of all user-owned data                                         | <72h (currently sync; will be async > 100 MB) |
| Right to erasure       | `DELETE /intelligence/me` + `DELETE /user/me` purges Postgres + Neo4j namespace + Qdrant collection | <72h                                          |
| Right to portability   | Same export endpoint emits structured JSON + CSV                                                    | <72h                                          |
| Right to rectification | `/settings` lets user edit profile + delete individual signals                                      | Immediate                                     |
| Right to object        | Opt-out toggles for: telemetry, marketing email, cross-platform inference                           | Immediate                                     |
| Data minimization      | We only collect what serves a documented purpose in [0009](0009-data-model.md)                      | Reviewed quarterly                            |
| Privacy policy         | `/privacy` page; updated whenever data model changes                                                | 30 days notice for material changes           |

### 6.3 Tenant data (IaaS)

- Tenant data belongs to the tenant. We are processor; they are
  controller.
- DPA (Data Processing Agreement) template required before public IaaS
  launch (P3 W26). Standard SCCs for international transfers.
- Sub-processors list (Neon, Neo4j AuraDB, Qdrant Cloud, OpenAI,
  Cloudflare, Fly, Vercel, Stripe, Resend) published at
  `/legal/subprocessors`.

### 6.4 Children & vulnerable users

- Terms require 16+ (EU/UK) or 13+ (US) per applicable law.
- We do not knowingly accept users below those thresholds; account
  closed + deleted if discovered.

---

## 7. SLOs

Service-level objectives — what we commit to ourselves before we
commit to customers.

| Surface                           | Metric       | SLO           | Measurement                        |
| --------------------------------- | ------------ | ------------- | ---------------------------------- |
| Web (recome.app)                  | Availability | 99.5% monthly | Better Stack probe on `/` every 1m |
| Cloud API `/health`               | Availability | 99.9% monthly | Better Stack probe                 |
| Cloud API `/ready`                | Latency p95  | <500ms        | App metrics                        |
| `/intelligence/signals` POST      | Latency p95  | <600ms        | App metrics                        |
| `/intelligence/trails/:topic` GET | Latency p95  | <500ms        | App metrics                        |
| `/v1/signals` POST                | Latency p95  | <800ms        | App metrics                        |
| `/api/extract`                    | Latency p95  | <3.0s         | Vercel + app metrics               |
| Chat (`/ask`) TTFT                | p95          | <1.5s         | Server timing                      |
| Background jobs                   | Success rate | ≥99%          | BullMQ stats                       |
| Email delivery (transactional)    | Success rate | ≥99%          | Resend webhooks                    |
| Email delivery (digest)           | Success rate | ≥98%          | Resend webhooks                    |

Error budget: 0.1% / month = ~43 minutes per month for 99.9% SLOs.
Budget consumption triggers freeze on non-critical deploys for the
remainder of the window.

---

## 8. Observability

| Concern           | Tool                           | What flows in                             |
| ----------------- | ------------------------------ | ----------------------------------------- |
| Logs              | Axiom                          | All app logs (pino JSON)                  |
| Errors            | Sentry                         | All unhandled exceptions; client + server |
| Metrics           | OpenTelemetry → Honeycomb (P2) | RED metrics, custom counters              |
| Traces            | OpenTelemetry → Honeycomb (P2) | Tool-call chains in chat especially       |
| Uptime            | Better Stack                   | Synthetic probes                          |
| Product analytics | PostHog                        | Event taxonomy in F-901                   |
| LLM observability | Helicone (P2)                  | Prompt + response + tokens per request    |
| Status page       | Instatus                       | Public status                             |

Required for every PR that adds a feature:

1. At least one log line at info level on the success path.
2. At least one PostHog event documented in F-901.
3. If it has user-facing latency, a span name reserved for it.

---

## 9. Backups & DR

(Summary table in [0006 §9](0006-system-architecture.md#9).)

DR drills, quarterly:

- **Q1 of each year:** restore Postgres PITR to a point 1h ago in
  staging, verify app boots and reads data.
- **Q2:** restore Neo4j AuraDB from snapshot, verify intelligence
  service boots.
- **Q3:** restore Qdrant snapshot from R2, verify collections present
  and queryable.
- **Q4:** full table-top exercise — assume primary region offline,
  walk through cutover to secondary; document gaps.

Runbook §11.3 describes the actual steps.

---

## 10. Compliance posture

| Framework             | Posture                                                                     | Trigger to revisit                                                                                   |
| --------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| GDPR / UK-GDPR / DPDP | Compliant for processor + controller obligations relevant to us             | Material data-model changes                                                                          |
| CCPA                  | Compliant via same controls + a "Do Not Sell" toggle (we don't sell anyway) | First California enterprise customer                                                                 |
| SOC 2 Type I          | Not pursued. Cost > benefit pre-revenue.                                    | First enterprise customer that requires it; gated by ADR per [0004 §7](0004-production-roadmap.md#7) |
| SOC 2 Type II         | Not pursued. Requires SOC 2 Type I + 6mo evidence.                          | Same trigger + 6mo runway                                                                            |
| ISO 27001             | Not pursued. EU-only ask we don't have yet.                                 | First EU enterprise asking                                                                           |
| HIPAA / PCI           | Out of scope. We do not store PHI or PAN.                                   | Never; if asked, decline.                                                                            |

---

## 11. Runbooks

Each runbook lives here. Pasteable, not narrative.

### 11.1 Incident response

Severity definitions:

- **P0** — Site is down (return code 5xx for >5 min) OR data
  corruption / loss confirmed OR active exploit.
- **P1** — Major feature broken for >25% users OR latency >2× SLO
  budget for >15 min.
- **P2** — Minor feature broken OR single-user issue OR cosmetic.

Response flow:

```
1. Acknowledge in #incidents channel within 5 min for P0/P1.
2. Open Linear incident ticket; status page update for P0/P1.
3. Stop the bleeding (revert, kill traffic, scale down).
4. Diagnose root cause; document evidence in ticket.
5. Fix; deploy through normal CI (do not skip checks unless P0).
6. Status page resolved.
7. Within 48h: write blameless post-mortem. Save under
   `docs/post-mortems/YYYY-MM-DD-<slug>.md`.
8. Post-mortem must list: timeline, impact, contributing factors,
   action items with owner + date.
```

### 11.2 Deploy rollback

```
# Cloud API on Fly
fly releases list -a recome-api          # find prior good version
fly deploy --image registry.fly.io/recome-api:<good-version> -a recome-api
fly status -a recome-api                 # confirm healthy
# Web (Vercel)
# Use Vercel UI: Deployments → previous → Promote to Production.
```

If the rollback target predates a Postgres or Neo4j migration that
cannot be rolled forward, escalate to data-restore (§11.3).

### 11.3 Data restore

**Postgres PITR (Neon):**

1. Open Neon console → Branches → New branch from PITR.
2. Pick target timestamp (Neon shows recoverable windows).
3. Apply branch to a temp instance; verify data; promote when ready.
4. Update `DATABASE_URL` in Fly secrets; `fly deploy` (no-op deploy
   to pick up the env change).

**Neo4j AuraDB:**

1. Open AuraDB console → Database → Snapshots.
2. Pick snapshot; click Restore → creates a sibling DB.
3. Verify; update `NEO4J_URI` in Fly secrets; redeploy.

**Qdrant from R2 snapshot:**

1. `qdrant-cli` snapshot restore from R2 URL.
2. Verify collection lists match expected per [0009 §4](0009-data-model.md#4).

### 11.4 Suspected secret leak

```
1. Rotate the exposed secret in its source of truth:
   - Stripe: dashboard → API Keys → roll
   - OpenAI/Anthropic: console → API Keys → revoke + create new
   - JWT secrets: generate new with `openssl rand -base64 64`
   - DB passwords: provider console
2. Update Fly secret: fly secrets set NAME=newvalue -a recome-api
3. fly deploy (Fly does rolling deploy with new env automatically)
4. Audit logs for any anomalous activity since the leak window.
5. If user-affecting (e.g. JWT_SECRET): force-logout all users by
   bumping a `jwt_epoch` value in config; refresh tokens issued before
   the epoch are rejected.
6. Disclose to affected users within 72h if PII access likely.
```

### 11.5 Suspended tenant

```
1. Admin lookup → tenant → click Suspend (writes status=SUSPENDED).
2. apiKeyMiddleware will start returning 403 on next request (no
   propagation delay since it's a DB lookup per request — caching
   is not used on the auth path).
3. Notify tenant via billing email + dashboard banner.
4. Document reason in audit log.
5. Unsuspend: same flow, status → ACTIVE.
```

### 11.6 LLM provider outage

```
1. Sentry alerts on >10 LLM call failures in 5 min.
2. Flip feature flag `LLM_PROVIDER=fallback` to switch from
   Anthropic → OpenAI (or vice-versa). Both clients configured.
3. Status page degraded.
4. Cache existing results aggressively (extend Redis TTL).
5. Post-mortem documents the trigger threshold + fallback latency.
```

### 11.7 Quota dispute (IaaS)

```
1. Customer claims overcount.
2. Cross-check TenantUsage row against raw API access logs in Axiom
   (filter by tenantId).
3. If our count is wrong: issue credit via Stripe; fix
   instrumentation.
4. If usage is accurate: explain with screenshots from
   dashboard + Axiom.
```

---

## 12. Security hygiene checklist

Run on every PR via CI; manual quarterly review for the items marked.

- [x] `npm audit` in CI; fail on high/critical (auto-fix where possible)
- [x] `gitleaks` secret scan in CI
- [x] Dependabot enabled for npm
- [x] `osv-scanner` weekly cron in CI
- [ ] CodeQL workflow (P0 W5)
- [ ] Trivy container scan in CI (P0 W5)
- [ ] Penetration test by external firm (manual; P3 W30)
- [ ] Bug bounty program on Hackerone-style platform (manual; after P3)
- [ ] Quarterly access review of secrets + admins (manual)
- [ ] Quarterly threat-model review (manual; this doc)
