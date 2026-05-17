# 0008 — Workflows & Personas

**Status:** Living document
**Last reviewed:** 2026-05-17

End-to-end user journeys for the people we actually build for. If a
workflow is not here, we don't build features for it. New personas
require a doc update before any related work.

---

## 1. Personas

We build for **three** personas. Anyone else is a happy accident.

### 1.1 Riya — The decision-paralysed researcher (CONSUMER, primary)

- 28, designer in Bangalore, makes ~3 considered purchases/quarter (~$200+).
- Researches across YouTube, Reddit, Amazon for 1–3 weeks before deciding.
- Has 40+ open tabs; loses the YouTube reviewer she liked; ends up
  buying the wrong thing or not buying at all.
- Lives on her phone for 80% of attention; Mac only for design work.
- Uses Notion for some notes but not for purchase research.
- Will pay $5–10/mo if a product genuinely saves her from re-doing
  research.

**Riya's success metric:** week-2 retention. The product feels valuable
when she opens it on a Sunday and it shows her what she's been
researching that she'd half-forgotten.

### 1.2 Aman — The continuous learner (CONSUMER, secondary)

- 22, CS undergraduate, learns across Coursera, YouTube, blogs, Reddit,
  GitHub, ChatGPT.
- Loses track of which video explained which concept.
- Bookmarks 5+ items a day; never revisits.
- Tech-savvy, will install browser extension, would build their own
  workflow if Recome had an API.

**Aman's success metric:** density of capture. The product feels
valuable when his weekly digest surfaces "here are 3 things you saved
about distributed systems last week that you didn't revisit."

### 1.3 Maya — The product engineer (IaaS, primary)

- 31, full-stack engineer at a 50-person Series A note-taking startup.
- Wants to add "memory" to her product (e.g. "summarize what this user
  has been researching this month").
- Won't build a graph DB + vector DB stack herself; will pay for
  managed.
- Decisions made by her, not procurement; budget up to $500/mo for an
  experimental feature, $5k+/mo if it ships.

**Maya's success metric:** time-to-first-API-call. The product feels
viable when she can ship a working integration in a single afternoon.

---

## 2. Workflows — Riya (Consumer)

### W-R-1: First visit → first capture (Phase 0)

```
Discovers Recome (HN / Twitter / friend / Product Hunt)
   │
   ▼
Lands at recome.app
   │  Sees one sentence: "Recome remembers what you research.
   │  Paste a YouTube / Reddit / Amazon link to begin."
   │  Single CTA: [Get started]
   ▼
Clicks → /signup (no /login fork in the CTA)
   │  3 fields: email, password, [or sign in with Google]
   │  No "what are you researching?" question — that's friction
   ▼
Account created → lands on /paste
   │  Empty form; placeholder shows a real example URL
   │  Side hint: "We'll remember what you paste and connect it
   │  to your other research"
   ▼
Pastes a YouTube URL she's been watching
   │  Capture button → loading 1–2s
   ▼
Sees the Extracted card with title, topics
   │  "First time you've looked at this topic" message
   │  Side CTA: "Paste 5 more to start seeing trails"
   ▼
Pastes 2–5 more URLs across YouTube, Reddit, maybe Amazon
   │
   ▼
At capture 6: first trail appears
   │  "Your trail: standing desks · 6 signals · 3 platforms"
   │  AHA MOMENT
   ▼
Looks at related-topics panel; closes laptop
   │  Day 0 done.
```

Telemetry checkpoints (F-901):

- `landing_view` → `signup_complete` (target: 30%)
- `signup_complete` → `first_capture_complete` (target: 80% within
  90s)
- `first_capture_complete` → `5_captures_complete` (target: 50%
  within session)

### W-R-2: Install to home screen (Phase 0)

```
On day 2, opens recome.app on iPhone Safari
   │  Banner at top: "Install Recome to your home screen for
   │  faster captures"
   │  CTA: [Install] (opens iOS's instruction sheet)
   ▼
Adds to home screen
   │
   ▼
Opens Recome from home screen → standalone mode (no Safari UI)
   │
   ▼
Browsing Instagram, sees a product she likes
   │  Tap Share → Recome icon (because of share-target)
   │  Drops into /paste with URL prefilled, just confirms
   ▼
First share-sheet capture done. The "no install needed" promise
held — she didn't install an extension, just a webpage.
```

### W-R-3: Bulk import (Phase 1)

```
Day 7 (after digest email): clicks "Add your existing history"
   │
   ▼
/import page lists 4 importer cards:
   │  YouTube watch history · Amazon orders · Reddit saved · Pocket
   │  Each card: "How to get this from Google/Amazon/Reddit/Pocket" link
   ▼
Clicks YouTube card → /import/youtube
   │  Step 1: instructions to download Google Takeout
   │     (with link)
   │  Step 2: drag the html file here
   │  Step 3: import runs (10 min for 6 months)
   ▼
Progress bar live-updates: "8,420 / 14,200 signals · ETA 4m"
   │  Can close tab; check back at /import/jobs/:id
   ▼
Done. Dashboard now shows 3× more trails, 5× more intents.
   │  "Trail of the week" card uses imported data
   │  AHA MOMENT 2
```

### W-R-4: Weekly digest (Phase 1)

```
Sunday 8am: email arrives
   │  Subject: "Your week, recalled — and 3 things you might have forgotten"
   ▼
Opens email (target: 35% open rate)
   │  Top: trail of the week (1 image + 2 lines)
   │  Middle: 3 forgotten-but-active intents
   │  Bottom: "What's new on standing desks since you last looked"
   │           (LLM-summary of cross-platform signal)
   ▼
Clicks "View full trail" CTA → recome.app/trails/standing-desks
   │
   ▼
Sees the trail page with everything she captured + related
   │  Re-engagement complete.
```

### W-R-5: Chat for a decision (Phase 2)

```
Tuesday evening: about to buy a standing desk
   │  Opens recome.app/ask on phone
   ▼
Types: "I've been comparing standing desks. Help me decide."
   │
   ▼
Agent (streaming):
   │  "You've looked at 12 standing-desk items across YouTube,
   │  Reddit, and Amazon over the last 19 days. The top
   │  candidates by your attention time are:
   │     1. Branch Standing Desk Pro (4 captures, 2 platforms)
   │     2. Uplift V2 (3 captures, 3 platforms)
   │     3. Fully Jarvis (2 captures, 2 platforms)
   │
   │  Two things you saw matter to you: bamboo top (mentioned
   │  in 3 of your Reddit captures), and a sub-$700 budget
   │  (you discarded 2 candidates above this).
   │
   │  [Side panel: 12 source links]
   │
   │  Want me to compare 1 and 2?"
   ▼
"Yes"
   │  Agent calls compare tool → returns side-by-side table.
   │
   ▼
"Log decision: Uplift V2"
   │  Decision logged. Next time she asks about standing desks,
   │  the agent knows she chose.
```

### W-R-6: 90 days in — habit formed

```
Recome is now the default place to "save for later" instead of
bookmarks. Riya:
   • Pastes 4–8 URLs per day across browser + share-sheet
   • Opens weekly digest 80% of weeks
   • Asks chat ~2× per week, mostly decision queries
   • Pays for the $5/mo tier after first decision query worked
     better than her own Google search
   • Tells a friend. (Word-of-mouth is the only growth channel
     that compounds.)
```

---

## 3. Workflows — Aman (Consumer, secondary)

### W-A-1: Power-user setup (Phase 0–1)

```
Day 0: signs up, captures 2 URLs to test
   │
   ▼
Day 1: discovers the Chrome extension at /extension
   │  Installs it
   │  Now passive-captures every YouTube watch, Reddit visit,
   │  Coursera page
   ▼
Day 7: graph has 200+ signals
   │  Dashboard shows densely populated trails immediately
   ▼
Day 14: starts using /ask for "what did I save about
   eventual consistency last month?"
   │  Becomes a chat-heavy user
   ▼
Day 30: discovers /developers
   │  Curious about the API; signs up for free tier
   │  Builds a personal Raycast extension that queries
   │  his own intents (developer ergonomics test)
```

### W-A-2: Friends of Aman

Aman shares trails publicly:

- Generates `/share/eventual-consistency-deep-dive` link
- Posts on Twitter; friends see the trail render with proper
  cross-platform credits
- Top of trail page: "Made on Recome — start your own" CTA
- 5–10% of share clicks convert to signup (acquisition loop)

---

## 4. Workflows — Maya (IaaS)

### W-M-1: First evaluation (Phase 3 W25–28)

```
Discovers via HN launch / docs.recome.app / friend
   │
   ▼
Lands at recome.app/developers
   │  Hero: "Personal memory as an API. ≤50 LOC to integrate."
   │  Code snippet front-and-center (copy-paste working hello world)
   ▼
Clicks [Get started] → existing account or new signup
   │
   ▼
Creates a tenant: "Acme Notes — test"
   │  Default tier: FREE
   │  Gets back rk_test_abc123def456ghi789...
   │  Copies to clipboard
   ▼
Goes to docs.recome.app, follows quickstart
   │  npm install @recome/intelligence
   │  Writes 7 LOC: ingest 3 signals from her own product
   │
   ▼
Calls GET /v1/users/u123/trails → gets back the trail JSON
   │  Time elapsed: ~25 minutes (target: <30)
   ▼
Closes laptop, comes back tomorrow with a real integration plan.
```

### W-M-2: Production rollout (Phase 3 W29–34)

```
Two weeks of integration work
   │
   ▼
Wires Acme Notes' user-action stream into POST /v1/signals
   │  Every note tagged with topics, every link saved as a signal
   ▼
Builds an in-product "what you've been thinking about"
   widget that calls GET /v1/users/:id/intents
   │
   ▼
Free tier blown through in week 2
   │  Hits 429 on /v1/signals
   │  Dashboard shows: "You've used 1,000/1,000 signals this month"
   │  [Upgrade to Starter — $49/mo]
   ▼
Clicks upgrade → Stripe checkout → tier switched
   │  Quota lifted within 30s of Stripe webhook
   ▼
Ships the feature to her users
   │
   ▼
Weekly: she logs into developer dashboard, checks usage trend.
   │  No support tickets needed.
```

### W-M-3: When Maya churns

If she stops using us, the most likely reasons are:

- Latency hot-spot — her users' p95 latency on trail queries exceeds
  her SLA. Mitigation: latency dashboards in the customer portal so
  she sees it before her users do.
- Pricing surprise — overage on a viral week. Mitigation: clear quota
  alerts before they bind; opt-in hard-cap toggle for cost control.
- Product pivot in her company — out of our hands; record reason on
  cancel.

---

## 5. Cross-persona: capture surfaces summary

| Surface                       | Riya               | Aman               | Maya's users                        |
| ----------------------------- | ------------------ | ------------------ | ----------------------------------- |
| Web paste                     | Primary            | Sometimes          | n/a                                 |
| PWA share-sheet               | Primary on mobile  | Secondary          | n/a                                 |
| Extension                     | Rare               | Primary (passive)  | n/a                                 |
| Bulk import                   | One-time bootstrap | One-time bootstrap | n/a                                 |
| `/v1/signals` from Acme Notes | n/a                | n/a                | Primary (Maya's product calls this) |

---

## 6. Chat eval set (used for F-301 acceptance)

These five canonical queries are the bar Recome chat must clear
before the side-by-side test (F-306). Each must return a useful
answer in <5s p95 against a populated user graph.

| #   | Query                                                                                | Why it matters                                                  |
| --- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| 1   | "What was I researching last Tuesday?"                                               | Tests time-window reasoning + reverse-chrono retrieval.         |
| 2   | "I'm about to buy this URL — does it conflict with anything I learned?" (with a URL) | Tests trail intersection + LLM judgment over captured opinions. |
| 3   | "Summarize my standing-desks research across all platforms in the last 3 weeks."     | Tests multi-source summarization + dwell weighting.             |
| 4   | "Find the YouTube reviewer who said brand X has bad bearings."                       | Tests fine-grained retrieval + entity-disambiguation.           |
| 5   | "I've been on the fence about [topic] for too long — decide for me."                 | Tests preference modeling + opinion synthesis.                  |

Each query has 3 graders (founder + 2 dogfooders) scoring on a 1–5
scale across: accuracy, faithfulness to captured sources, usefulness.
Pass bar: median ≥4 across all three.

---

## 7. Anti-workflows (what we will NOT optimize for)

Real workflows we choose not to support, to keep focus:

- **"What is X?"** general-knowledge questions. We route to Perplexity
  / Wikipedia and tell the user that.
- **"Help me write this email."** Not the product.
- **"Plan my day / manage my tasks."** Not the product. We are memory
  - decision support, not productivity.
- **"Suggest things I might like."** No cold recommendations from
  generic taste signal — the moat is YOUR data, not collaborative
  filtering. We may suggest from your own under-explored topics,
  never from cross-user inference. (Cross-tenant inference is also
  explicitly off the table — see [0004 §8](0004-production-roadmap.md#8).)
- **"Export to Notion / Obsidian / Roam."** We may add this in v2 if
  asked enough, but it's not a wedge. Don't build features that make
  Recome a feeder for other notes apps before Recome is sticky.
