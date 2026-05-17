# 0007 — Feature Catalog

**Status:** Living document
**Last reviewed:** 2026-05-17
**Companion to:** [0004 roadmap](0004-production-roadmap.md),
[0008 workflows](0008-workflows-and-personas.md)

Every feature in scope for the 12-month roadmap. Each has:

- **ID** — referenced from the roadmap and from PR titles (e.g. `F-101: ...`)
- **User story** — one sentence
- **Acceptance criteria** — testable, falsifiable
- **Dependencies** — features that must ship first
- **Effort estimate** — t-shirt size (XS <1 day, S 1–3, M 4–8, L 9–15, XL 15+)
- **Risk** — Low / Med / High with one-line reason
- **Owner** — defaults to founder

Effort estimates are for a single experienced engineer. **No story-point
inflation.** If you discover an L is an XL mid-flight, that's a signal to
descope, not to push out.

---

## P0 — Capture (May 17 → Jun 28)

### F-101 — Server-side URL extractor

**Story:** As any visitor, I can paste a URL and the server fetches it,
parses OG/meta tags, detects platform, and returns structured metadata
so I never see CORS errors.

**Acceptance criteria:**

- POST `/api/extract` with `{ url }` returns `{ url, title, description, image, platform, topics }` for any public HTTPS URL.
- 30 URLs across YouTube / Reddit / Amazon / Substack / X / generic blog all extract a title in <2.5s p95.
- SSRF guard rejects `localhost`, RFC1918, `169.254.0.0/16`, and `0.0.0.0`.
- Body capped at 1MB; non-HTML content-types return 415.
- AbortSignal timeout at 8s; remote 4xx/5xx returns 502.

**Dependencies:** none.
**Effort:** S — already shipped.
**Risk:** Low — implemented and committed.

### F-102 — Paste UI

**Story:** I paste a URL into a simple form, see a confirmation card
with what was captured, and see my trail for the topic if one exists.

**Acceptance criteria:**

- `/paste` renders on mobile (≤375px) without horizontal scroll.
- Submit button disabled when URL is empty or busy.
- Errors render inline; no `alert()` calls.
- After capture, an "Extracted" card shows title, description (3-line
  clamp), platform chip, top topics.
- If a trail exists for the captured topic, a "Your trail" card shows
  signal count, platform count, strength, and related topics.

**Dependencies:** F-101.
**Effort:** S — shipped.
**Risk:** Low.

### F-103 — PWA manifest + theme

**Story:** I can install Recome to my home screen from any mobile
browser without an app store.

**Acceptance criteria:**

- `manifest.webmanifest` validates against Web App Manifest spec at
  [manifest-validator.appspot.com](https://manifest-validator.appspot.com).
- Lighthouse PWA audit passes "Installable" check on Chrome desktop
  and mobile.
- Apple touch icon shows correctly on iOS 16+ Safari "Add to Home
  Screen."
- App opens in `standalone` display mode on Android.

**Dependencies:** F-101, F-102.
**Effort:** S — manifest shipped; PNG icons documented in
[web/public/README-icons.md](../../web/public/README-icons.md).
**Risk:** Low — pending icon files for full Lighthouse green.

### F-104 — PWA share-target

**Story:** From any iOS/Android app, I can tap Share → Recome and have
the URL prefilled in the paste form.

**Acceptance criteria:**

- Manifest declares `share_target` with `action: /paste`, `method: GET`.
- /paste hydrates `?url`, `?title`, `?text` query params on load.
- Android share-sheet test: sharing a URL from Chrome → Recome lands
  in /paste with URL filled.
- iOS test (after installing PWA): same.

**Dependencies:** F-103.
**Effort:** XS — shipped.
**Risk:** Low.

### F-105 — Signup → first-capture flow (<90s)

**Story:** From the landing page, I can sign up and complete my first
URL capture in under 90 seconds.

**Acceptance criteria:**

- Landing page CTA goes straight to `/signup` (not `/login`).
- After signup, user lands at `/paste` with an empty form and a
  pre-baked example URL in placeholder.
- PostHog event `first_capture_complete` fires; timer instrumentation
  reports p50 <90s in the dogfood cohort.
- Email verification is **not** blocking — user can capture before
  clicking the verify link. Email-only features (digest in P1) check
  verification status.

**Dependencies:** F-102. Existing auth (consumer JWT).
**Effort:** M — requires auth UX tweaks + telemetry wiring.
**Risk:** Med — auth UX changes risk regressions in existing login flow.

### F-106 — LLM topic enrichment

**Story:** Instead of regex/keyword topic guessing, the server uses an
LLM to extract 2–5 high-quality topics from page metadata, so my graph
isn't full of "html5", "best", and other URL slug garbage.

**Acceptance criteria:**

- New `cloud/src/extraction/LLMExtractor.ts` calls
  `claude-sonnet-4-6` with a tight system prompt and JSON-mode output.
- Cost cap: max 1500 input tokens, 200 output tokens per extraction
  (~$0.005 / extraction with Sonnet).
- 50-URL audit set: topic quality scored ≥4/5 by founder on a blind
  side-by-side vs the keyword extractor.
- Falls back to regex extractor on LLM failure / timeout (3s).
- Result cached in Redis with `sha256(html_head)` key; TTL 7 days.

**Dependencies:** F-101.
**Effort:** M — prompt + caching + audit harness.
**Risk:** Med — LLM cost could spike if not properly cached.

### F-107 — Prisma migrations directory

**Story:** As an operator I can deploy a schema change without
`prisma db push` data-loss roulette.

**Acceptance criteria:**

- `cloud/prisma/migrations/` directory exists with all schema history.
- `npm run db:migrate` creates a new migration; `npm run db:deploy`
  applies pending in prod.
- `deploy.sh` runs `prisma migrate deploy` (not `db push`) on every
  deploy.
- Rollback procedure documented in [0010](0010-security-privacy-ops.md).

**Dependencies:** none.
**Effort:** S — one-time setup + baseline migration.
**Risk:** High in cost-of-not-doing-it, low in execution. Must ship
before P0 review (W5).

---

## P1 — Memory (Jun 29 → Aug 23)

### F-201 — YouTube watch-history importer

**Story:** I upload my Google Takeout YouTube watch-history.html and
6 months of viewing history populates my graph in <10 minutes.

**Acceptance criteria:**

- New `/import/youtube` page: drag-drop the html file, capped at 100MB.
- Server streams parse (don't load all in memory).
- Each entry → 1 signal: kind=`view`, platform=`youtube`, pageUrl,
  pageTitle, ts.
- Topics extracted via F-106 LLM enrichment (rate-limited).
- Progress bar: SSE stream from server reports `{ done, total, eta }`.
- Resumable: closing the tab mid-import doesn't lose progress; user can
  return to `/import/youtube/jobs/:id` to see status.

**Dependencies:** F-106, F-202 (job queue infra).
**Effort:** L.
**Risk:** Med — YouTube HTML format changes; need a fallback parser.

### F-202 — Background job queue (BullMQ)

**Story:** As an engineer I can enqueue long-running jobs (imports,
embedding backfills, digest sends) without holding HTTP connections
open.

**Acceptance criteria:**

- BullMQ + ioredis added to `cloud/`.
- One `JobQueue` per concern: `import`, `embedding-backfill`, `digest`.
- Worker process runs in same Fly machine as API in dev; separate
  worker machine in prod.
- Failed jobs retried 3× with exp backoff; permanent failures
  written to Postgres `failed_jobs` table with full payload.
- Admin endpoint `GET /admin/jobs` lists pending + failed.

**Dependencies:** Upstash Redis provisioned.
**Effort:** M.
**Risk:** Low.

### F-203 — Additional importers: Amazon orders, Reddit saved, Pocket

**Story:** I can also bulk-import my Amazon order history, Reddit saved
posts, and Pocket export.

**Acceptance criteria:**

- Each importer matches F-201 acceptance criteria.
- Amazon: parse the Order History Reports CSV (Amazon-provided).
- Reddit: parse the saved.json from Reddit's data download.
- Pocket: parse the Pocket export HTML.
- All three live behind a unified `/import` UI with importer cards.

**Dependencies:** F-201 (importer infrastructure).
**Effort:** L (3 importers × M each).
**Risk:** Med per importer — third-party format drift.

### F-204 — Dashboard v2: "trail of the week"

**Story:** When I open the dashboard, I see one curated trail that
surfaces something I've been researching that I might have forgotten
about.

**Acceptance criteria:**

- Top card shows: trail name, platforms involved, last-seen date,
  signal count, a one-sentence LLM-generated summary ("You've been
  comparing standing desks across Reddit and YouTube for 3 weeks").
- "Trail of the week" picked by: (recent activity × cross-platform
  count × not-acted-on flag). Algorithm documented in
  [0009](0009-data-model.md) §scoring.
- "Refresh trail" button picks another candidate.
- Empty state: shown if user has <3 trails (week-1 user).

**Dependencies:** F-101..F-106, F-201.
**Effort:** M.
**Risk:** Low.

### F-205 — Intent surfacing on dashboard

**Story:** Dashboard surfaces my top 5 intents (topics I'm actively
researching) ranked by recency × volume.

**Acceptance criteria:**

- Renders top 5 intent chips with strength bars.
- Click → drills into trail page for that intent.
- Already-acted-on intents (purchased / blocked / dismissed) demoted.

**Dependencies:** existing `GraphRepository.getTopIntents`.
**Effort:** S.
**Risk:** Low.

### F-206 — Weekly digest email

**Story:** Every Sunday morning I get an email with: top trail of the
week, 3 things I might have forgotten, and a "what's new on a topic
you care about" section.

**Acceptance criteria:**

- Send time: configurable per user; default Sunday 08:00 local.
- Email rendered server-side (React Email).
- One-click unsubscribe; preference page at `/settings/email`.
- Resend integration; bounce-handling auto-pauses delivery.
- Telemetry: `digest_sent`, `digest_opened` (via tracking pixel),
  `digest_clicked` per CTA.

**Dependencies:** F-202 (job queue), F-204 (trail picker), Resend
account.
**Effort:** L.
**Risk:** Med — email deliverability is a craft.

### F-207 — "Did you mean…" memory recall

**Story:** When I capture a URL, if I have prior captures on a related
topic I haven't named yet, the UI says "did you also mean: X?" so I can
link them.

**Acceptance criteria:**

- After capture, runs `findSimilarTopics(topicEmbedding)` over my own
  topics in Qdrant (within my namespace).
- Returns top 3 with similarity > 0.78 threshold.
- UI shows: "Already in your graph: [topic chips]" — click to merge
  the new capture under the existing topic.

**Dependencies:** F-101..F-106.
**Effort:** M.
**Risk:** Low.

### F-208 — Cross-platform related-topics panel

**Story:** Trail page shows "you also looked at this on Reddit /
YouTube" panels — content related to the current trail seen on other
platforms.

**Acceptance criteria:**

- Per-platform panels (up to 5) showing pages from each platform that
  share topic edges with the current trail.
- Sorted by signal weight × recency.
- Each item is clickable → opens the captured URL.

**Dependencies:** existing graph + vector data.
**Effort:** M.
**Risk:** Low.

### F-209 — Decay & freshness tuning

**Story:** Old topics fade from "current intents"; recently active
topics surface first.

**Acceptance criteria:**

- Per-topic `lastSignalAt` updated on every signal.
- Intent strength formula adds an exponential decay term:
  `strength = base × exp(-Δt / τ)` where τ = 14 days.
- A topic with no signal for >90 days transitions from `intent` to
  `dormant` (label change in graph).
- Configurable per user (default τ + cutoffs); settings page exposes
  "decay speed" slider.

**Dependencies:** none (touches `GraphRepository.getTopIntents`).
**Effort:** M.
**Risk:** Low.

---

## P2 — Chat (Aug 24 → Nov 1) — **SUPERSEDED BY ADR-0012**

> **All features in this block (F-301 through F-307) are superseded** by
> [ADR-0012](0012-active-agents-and-personality-mirror.md), which replaced
> the chat surface with active background agents. The canonical Phase-2
> deliverables are now the six agents (Recall / Concierge / Curator /
> Decision / Watchlist / Synthesist) described in ADR-0012 §2.2, plus the
> Mind Map (F-401) and other unique surfaces in
> [0014 unique product surfaces](0014-unique-product-surfaces.md)
> (F-401..F-408).
>
> **Specifically:**
>
> - F-301 (Replace AgentController keyword theatre) → real agent runtime
>   shipped in `cloud/src/agents/` (see [0016 LLD §5](0016-lld.md#5-cloudsrcagents)).
>   The chat surface itself is deferred; the Decision agent (F-316 in
>   ADR-0012 §2.2 Tier 2) covers the "ask me about my own research"
>   use case on-demand.
> - F-302..F-305 (chat UI, tool library, conversation persistence,
>   citations) → not built; obviated by agents-replace-chat.
> - F-306 (side-by-side test vs Perplexity) → superseded by
>   [AUDIT_PERPLEXITY_2026-05-17.md](../../AUDIT_PERPLEXITY_2026-05-17.md)
>   methodology (sourced live research vs build-our-own-eval-harness).
> - F-307 (chat-to-action) → covered by per-agent action surfaces in
>   ADR-0012; no separate chat UX needed.
>
> **The dead F-301..F-307 spec bodies (~140 lines) were removed 2026-05-17
> after the agents pivot.** Full spec preserved in git history at commit
> immediately preceding `audit: surgical positioning fixes` (the pre-prune
> tag). Phase 2 is now: six agents from ADR-0012 §2.2 + Mind Map (F-401)
>
> - the unique surfaces F-401..F-408 from 0014.

<!-- F-301..F-307 chat-feature bodies pruned 2026-05-17. See git history. -->
<!-- The replacement reading order: ADR-0012 → 0014 → 0004 Phase 2. -->

---

## P3 — IaaS (Nov 2 → Feb 7)

### F-401 — Self-serve tenant signup

**Story:** As a developer, I can sign up at `recome.app/developers`,
get an API key, and call /v1 in under 5 minutes.

**Acceptance criteria:**

- New `/developers` route: sign in with existing account, create a
  tenant, see a freshly-issued `rk_test_…` key, copy with one click.
- Free tier auto-applied; no card required.
- Key shown exactly once, then masked; rotation flow re-issues.

**Dependencies:** existing Tenant/ApiKey models, `/v1/*` routes.
**Effort:** M.
**Risk:** Low.

### F-402 — Activation funnel instrumentation

**Story:** As a founder I can see exactly where new IaaS users get
stuck.

**Acceptance criteria:**

- Funnel events: `dev_signup`, `dev_tenant_created`, `dev_key_issued`,
  `dev_first_request_200`, `dev_first_signal_ingested`, `dev_first_query`.
- PostHog funnel report shipped at admin URL.
- Each step shows median + p95 time-from-previous.

**Dependencies:** F-401.
**Effort:** S.
**Risk:** Low.

### F-403 — Docs site at `docs.recome.app`

**Story:** Every public endpoint is documented with code samples that
work when copy-pasted.

**Acceptance criteria:**

- Built with [Mintlify](https://mintlify.com) or
  [Fumadocs](https://fumadocs.dev) — pick at start of P3.
- All `/v1/*` endpoints documented (auto-generated from Zod schemas
  via `zod-to-openapi`).
- Each endpoint has working curl, JavaScript, and Python examples.
- Quickstart guide ≤200 words gets a hello-world working.
- Hosted at `docs.recome.app` (Cloudflare-fronted).

**Dependencies:** F-401.
**Effort:** L.
**Risk:** Low.

### F-404 — Quickstart SDKs (JS + Python)

**Story:** As a developer I can `npm install @recome/intelligence` or
`pip install recome-intelligence` and have a typed client.

**Acceptance criteria:**

- `packages/sdk-js/` and `packages/sdk-py/` in the monorepo.
- Generated from OpenAPI spec (single source of truth: Zod → OpenAPI).
- Hello-world: 5–7 LOC ingests one signal and queries a trail.
- Published to npm + PyPI under MIT license.
- CI publishes on `release/sdk-vX.Y.Z` tag push.

**Dependencies:** F-403 (OpenAPI spec).
**Effort:** L.
**Risk:** Med — packaging + publishing pipelines.

### F-405 — Customer dashboard

**Story:** As an IaaS customer I can see my usage, rotate keys,
upgrade my plan, and download invoices — without emailing support.

**Acceptance criteria:**

- `/developers/dashboard` shows: current period usage (signals,
  queries) with quota bar, all keys with prefix + last-used,
  Rotate / Revoke actions.
- Plan selector with checkout for upgrade.
- Invoice list (last 12 months) with PDF download.

**Dependencies:** F-401, F-406 (Stripe).
**Effort:** L.
**Risk:** Low.

### F-406 — Stripe metered billing

**Story:** Tenants pay automatically every month based on tier subscription;
overage is billed per signal/query above quota.

**Acceptance criteria:**

- Stripe subscription per tenant; tier change ↔ subscription change.
- Stripe Meters reports usage daily at midnight UTC.
- Webhook handlers idempotent (dedupe by Stripe event ID).
- Failed payments → tenant `status = SUSPENDED` after 3 retries over
  7 days; API key auth returns 402 Payment Required.
- Email notifications for: trial ending, payment failed, plan changed.

**Dependencies:** existing Stripe setup, F-401, F-405.
**Effort:** L.
**Risk:** Med — Stripe webhook + subscription lifecycle is delicate.

### F-407 — gRPC API + webhooks

**Story:** Enterprise-track features for customers with throughput or
real-time needs beyond REST.

**Acceptance criteria:**

- gRPC service over HTTP/2 exposing the same operations as `/v1/`.
  Generated from a single `.proto`.
- Webhook events: `signal.ingested`, `trail.updated`,
  `intent.discovered`. POST to tenant-configured URL with HMAC
  signature (`X-Recome-Signature` header).
- Webhook delivery retried with exp backoff up to 24h.
- Dashboard surface to configure URLs and view delivery logs.

**Dependencies:** F-403.
**Effort:** XL.
**Risk:** Med — gRPC tooling + webhook reliability are real engineering.

---

## Cross-cutting

### F-901 — Telemetry event taxonomy

**Story:** Every product event is captured with a consistent name and
payload, so PostHog reports stay sane.

**Acceptance criteria:**

- `web/src/lib/telemetry.ts` exports a typed `track(event, props)` fn.
- Event names follow `noun_verb` (e.g. `signal_ingested`,
  `chat_message_sent`).
- Every new feature ships with ≥3 events documented in this file.

**Dependencies:** none.
**Effort:** S.
**Risk:** Low.

### F-902 — Onboarding email sequence

**Story:** New consumer users get a 4-email sequence over 14 days
helping them build the habit and see the week-2 magic.

**Acceptance criteria:**

- Day 0: welcome + "your first paste was X — keep going."
- Day 3: "your trails so far" with current best trail.
- Day 7: "did you know you can install Recome to home screen?"
- Day 14: "your week-2 highlights" digest preview.
- Unsubscribe link in every mail; tracked in PostHog.

**Dependencies:** F-206 infra.
**Effort:** S.
**Risk:** Low.

### F-903 — Status page

**Story:** I can check status.recome.app to see if the API is up.

**Acceptance criteria:**

- Hosted on [Instatus](https://instatus.com/) free tier (or similar).
- Automated probes on `/live`, `/ready`, key /v1 endpoint, web home.
- Incident posting integrated with on-call runbook
  ([0010](0010-security-privacy-ops.md)).

**Dependencies:** none.
**Effort:** XS.
**Risk:** Low.

### F-904 — Admin: support inbox + tenant suspension

**Story:** As founder I can look up any user/tenant, see their last
errors, message them, and suspend if abusive.

**Acceptance criteria:**

- Admin pages re-built (currently graveyard'd; see audit) with real
  backend.
- Suspend/unsuspend toggles; suspension takes effect immediately on
  next auth call.
- Search by email, user id, tenant id.

**Dependencies:** none.
**Effort:** M.
**Risk:** Low.

---

## Out of scope (12 months)

Listed here to prevent scope creep — see [0004 §8](0004-production-roadmap.md#8).

- Generic chat product (we are personal memory only).
- Slack / Discord / Notion / Linear integrations.
- Federated learning across tenants.
- On-premise / VPC isolation deployments.
- Native iOS / Android apps.
- Commerce recommendation API as a separate product.
- Voice input on chat (defer to v2 of P2 if asked for repeatedly).
