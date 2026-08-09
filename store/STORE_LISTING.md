# Chrome Web Store Listing — RecoMe v2.0.0

**Last verified:** 2026-05-30 against extension/src/manifest.json + docs/architecture/0014-unique-product-surfaces.md

## Extension Name

RecoMe — Your Personal Interest Graph

## Short Description (132 chars max)

Five background agents read your cross-platform research and bring you what you forgot, the deal you missed, the next thing to learn.

## Detailed Description

**Your browsing is research. RecoMe makes it work for you.**

RecoMe watches how you research across 15 sites — YouTube videos, Reddit threads, Amazon product pages, Substack posts, course catalogs, job boards — and builds your personal interest graph in the cloud. Five background agents work that graph for you while you browse:

- **Recall** surfaces the bookmark you forgot. You watched a Verge review three weeks ago — and you're back on Amazon looking at the same model. Recall reminds you.
- **Concierge** watches commerce pages for you. Land on a standing-desk PDP and Concierge cross-checks prices on Walmart, finds the cheaper alternative, surfaces the review that flagged bearing issues.
- **Curator** brings fresh content for topics you've been quiet on. Martin Kleppmann just published — you haven't touched distributed systems in three weeks.
- **Decision** is your on-demand advisor. Click "Ask Decision" on any page and chat with an agent that pulls your prior research as citations.
- **Curriculum** builds a four-week reading plan from "I want to learn X," bridged from what you already know.

**On every supported page you also see:**

- Per-card scoring badges on Amazon, YouTube, Reddit, eBay — ✓ Relevant, ⚠ Caution, × Filtered, or ~ Neutral. Hover any badge for the reasoning, grounded in your graph.
- A right-edge sidebar with your top interests, agent status, and one-click "Ask the agents."
- Proactive insight cards bottom-left when an agent has something for you.

**Built around four trust constraints (binding):**

1. **No agent takes irreversible action.** Concierge recommends; you click Buy. Curator surfaces; you click Share. Every action stays user-driven.
2. **Every agent cites its sources.** Inbox events link back to the captured signals they drew from.
3. **One-click pause per agent.** Or per platform. Or globally. Your call.
4. **You can see and delete everything.** The Audit Log of You shows every signal, every agent run, every decision the system surfaced. One-click export, one-click delete.

**Hard daily cost cap of $0.10/user/day** (the Guardian gate enforces it in code). Funded by your subscription — never your API key.

**Supported platforms (15):**

YouTube · Amazon · Reddit · eBay · Walmart · X/Twitter · Facebook · Instagram · TikTok · LinkedIn · Indeed · Glassdoor · Udemy · Coursera · edX

**Works in any Chromium browser:** Chrome, Brave, Edge, Arc, Vivaldi, Opera.

**Sign in once at recome.app.** Your interest graph lives in your cloud account; the extension picks it up via secure JWT. Nothing third-party in your browser — no LLM keys, no analytics SDKs.

---

## Category

Productivity

## Language

English

## Tags / Keywords

- interest graph
- personal AI agents
- cross-platform research
- price comparison
- shopping assistant
- recall
- knowledge management
- productivity

---

## What's New in v2.0.0

Complete rewrite. The previous version (v1.2.0) ran a local recommendation engine in your browser. v2.0.0 routes everything through a cloud graph backed by five real background agents, removes all third-party LLM API hosts from the extension's permissions, and adds the per-card scoring + Ask Decision chat surfaces. Sign-in via recome.app required.

---

## Store Assets Checklist

### Required

- [x] Icon 128×128 px — `public/icons/recome_logo_128.png`
- [ ] At least 1 screenshot, 1280×800 or 640×400
- [x] Detailed description (above)

### Recommended

- [ ] Promotional tile: 440×280 (small)
- [ ] Promotional tile: 920×680 (large) — for featured placement
- [ ] Marquee tile: 1400×560 — for top-of-store banners
- [ ] 4–5 screenshots showing different surfaces

### Screenshot Plan (v2.0.0)

**Screenshot 1: "Per-card scoring on Amazon"**

- Amazon search results page with colored badges (✓ Relevant 0.89, ⚠ Caution 0.52, × Filtered) on visible cards, reasoning callout revealed on one card.
- Caption: "Every card scored against your graph. Hover for the reasoning."

**Screenshot 2: "Right-sidebar — your graph at a glance"**

- Sidebar floating over any platform showing Interest Graph (top 5 topics with weight bars), Agents panel (5 agents with status), Ask the agents buttons.
- Caption: "See your interest graph anywhere you browse."

**Screenshot 3: "Concierge insight card on a product page"**

- Amazon PDP with the bottom-left Concierge insight card visible — "Walmart dropped this to $389, $200 below your baseline" with View / Dismiss CTAs.
- Caption: "Concierge price-checks across retailers and finds your prior research."

**Screenshot 4: "Ask Decision — multi-turn chat"**

- Overlay chat panel open on a YouTube watch page with a two-turn conversation about a purchase decision.
- Caption: "Ask Decision about what you're looking at. Multi-turn, cites your captured signals."

**Screenshot 5: "Popup inbox — every agent emission"**

- Extension popup open showing the inbox with 3 recent AgentEvents (Recall, Concierge, Curator) with Open / Dismiss / 👍 / 👎 buttons.
- Caption: "Every agent emission in one inbox. Useful or not? Tell RecoMe."

### How to Take Screenshots

1. Build: `npm run build` from repo root.
2. Load: `chrome://extensions` → Developer mode → Load unpacked → select `dist/`.
3. Sign in via popup → opens recome.app/login?return=extension&ext_id=...
4. Capture a few sessions of YouTube + Amazon + Reddit so the graph has data (10 seconds dwell per page).
5. Resize browser to 1280×800 (Chrome DevTools device toolbar).
6. Capture using macOS Cmd+Shift+4 (with the spacebar for window-aware framing) or Chrome's built-in screenshot via DevTools (Cmd+Shift+P → "Capture full size screenshot").
7. Replace any logo with the v2.0.0 brand if changed.
