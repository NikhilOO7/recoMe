# Launch Checklist — the road from here to the Chrome Web Store

**Status:** Operational checklist, created 2026-08-11. Direction lives in [PRODUCT.md](PRODUCT.md) (R2 — Launch); this doc is the actionable breakdown. Check things off in place — this file is meant to be edited.

**Where we are:** R1 (Truthful Core) is complete. The full stack is live in production (Fly: API + Postgres + Neo4j + Qdrant + Redis), CI and auto-deploy are green, and the end-to-end loop — capture → graph → scoring → feedback → agents — works for a real signed-in user. Everything below is R2.

---

## 1 · Founder actions (≈30 minutes total + one Xcode hour)

Ordered by value-per-minute. Each unblocks work I can then finish unattended.

- [ ] **Add OpenAI credits** — [platform.openai.com → Billing](https://platform.openai.com/settings/organization/billing/). $5–10 is months of runway (Guardian caps each user at $0.10/day regardless).
      _Unblocks:_ the Decision LLM live-model spot check → flipping `AGENTS_LLM_ENABLED` in prod (genuinely intelligent chat); production embeddings (foundation for R3 semantic work).
      _Then:_ tell Claude "credits added" — spot check + flag flip happen the same session.

- [ ] **Register `recome.app`** (~$15/yr, any registrar; Cloudflare recommended).
      DNS once registered: `api` → CNAME `recome-api.fly.dev` (then `fly certs add api.recome.app`), apex/`www` → Vercel per their dashboard.
      _Why now:_ Chrome Web Store review pins the URLs it sees; listings, OAuth redirects, and the manifest all want the permanent domain before submission, not after.
      _Then:_ Claude flips `CLOUD_URL_DEFAULT` / `WEB_APP_URL_DEFAULT` back and updates manifest + listing.

- [ ] **The Xcode hour** — iOS share extension. The Swift code is complete; it needs the one-time manual wiring:
      follow `mobile/SHARE_EXTENSIONS.md` (expo prebuild → add Share Extension target → App Group `group.app.recome.shared` → drop in `ShareViewController.swift`). Ship to TestFlight when it builds.
      _Unblocks:_ the launch-time mobile story (share-sheet capture, tier 3 of the capture pyramid).

- [ ] **Stripe keys into Fly** (when ready to sell Pro): create a Pro price in the Stripe dashboard, then
      `flyctl secrets set STRIPE_SECRET_KEY=… STRIPE_WEBHOOK_SECRET=… STRIPE_PRO_PRICE_ID=… -a recome-api`.
      _Unblocks:_ build-queue item 4 (Consumer Pro purchasable). Recommended pricing per PRODUCT.md §7: Pro $8/mo.

- [ ] **Resend API key** (free tier, [resend.com](https://resend.com); verify a sender) →
      `flyctl secrets set RESEND_API_KEY=… -a recome-api`.
      _Unblocks:_ build-queue item 3 (weekly digest email — the worker already runs Sundays and silently no-ops today without the key).

- [ ] **Keepa API key** (when ready to light up Concierge — [keepa.com/#!api](https://keepa.com/#!api), ~€19/mo basic tier) →
      `flyctl secrets set KEEPA_API_KEY=… INTELLIGENCE_AGENTS_PRICE_VENDOR=keepa -a recome-api`.
      _State:_ the agent is fully built (event-triggered PDP checks + 6-hourly watchlist sweeps + ASIN resolution from Amazon URLs, shipped 2026-08-13) but deliberately dark in prod — the stub price vendor is hard-blocked there so we never show a user an illustrative price (principle 7). Keepa is Amazon-only; Walmart/eBay quotes need a second vendor later.
      _Then:_ Claude verifies a live deal_drop end-to-end and flips the landing page's Concierge card from "coming soon" to live.

## 2 · Claude's build queue (in order)

1. - [ ] **Store submission package** — produce the screenshots (surfaces are ready and show real data), final listing-copy audit against the shipped product, submit `recome-extension-2.0.0.zip`. Days-not-weeks from "in review."
2. - [x] **Onboarding polish** _(done 2026-08-13)_ — sidebar "Getting started" walkthrough: Sign in → Capture your first page → Meet your first insight. Steps check off live; first capture auto-fires a Synthesist on-demand run (a real, cited "New this week" — honest substitute for Recall, which needs ≥14-day-old signals), surfaced through the normal inbox → InsightCard path. Panel celebrates once, then retires permanently (`recome_onboarding` in chrome.storage.local).
3. - [x] **Push delivery + digest + preference center** (D6) — ✅ 2026-08-13. VAPID keys live, delivery wired into every emission, pref center verified (digest toggle + push toggle in Settings, per-agent pause on /agents). Email half still waits on the Resend key above.
4. - [ ] **Consumer Pro purchasable** — wire the existing Stripe checkout end-to-end in prod. (Needs Stripe keys above.)
5. - [x] **Hygiene pair** — ✅ 2026-08-13. Taste Twins removed end-to-end (D10); wire-contract harness live in `contracts/` (cloud regenerates fixtures from real handlers, extension type-checks the same fixtures — both fail CI on drift). Bonus: /ready now probes Postgres, so a dead-DB deploy can no longer report green. Known deferral: per-instance rate limits across 2 machines (Redis-backed store when traffic warrants).
6. - [ ] **Then R3 opens:** semantic ingest (LLM entity extraction — the structural fix for junk topics like `men`), vector read path, cross-platform linking (YouTube↔Amazon), mobile connectors v1 (Spotify + Reddit OAuth, security design doc first) + Takeout imports.

## 3 · Watchpoints this week (eyes only, no action)

- [ ] **Sunday 13:00 UTC** — first-ever scheduled Synthesist run. A weekly summary appearing in the inbox surface proves the background-agent loop in the wild. (Email version stays silent until the Resend key exists — by design.)
- [ ] **Daily 12:00 UTC** — Curator's tick now pulls real Google News RSS per topic; inbox should accumulate cited fresh-content events.
- [ ] **Redis bill** — BullMQ polls; if pay-as-you-go creeps past a few dollars, switch to a fixed plan (`fly redis` dashboard).
- [ ] **Fly spend overall** — currently ~$15–20/mo across API/Postgres/Neo4j/Qdrant/Redis.

## 4 · Definition of launched (R2 exit, from PRODUCT.md)

Installable by a stranger from the Chrome Web Store · onboarding delivers first capture + first Recall within 10 minutes · push + digest live with preference center · Pro purchasable · iOS share extension in TestFlight · first 100 external weekly actives · RAR baseline measured.
