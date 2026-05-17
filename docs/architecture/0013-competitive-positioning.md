# ADR-0013 — Competitive Positioning & Category Definition

**Status:** Accepted
**Date:** 2026-05-17
**Decider:** Founder + Principal Engineering
**Supersedes:** ad-hoc positioning language scattered across [0003](0003-pivot-web-first-with-iaas.md), [0004](0004-production-roadmap.md), [0007](0007-feature-catalog.md), [0012](0012-active-agents-and-personality-mirror.md). Those docs should reference this one for the canonical positioning.

---

## 1. Context — the May 2026 landscape

Specific, dated, sourced. Positioning that uses stale claims about competitors is worse than no positioning at all because it gets you laughed out of rooms.

### 1.1 Personal-memory category is in flux

- **Rewind → Limitless → Meta acquisition.** Rewind AI rebranded to Limitless in April 2024 and was acquired by Meta in December 2025. Capture functionality was disabled December 19, 2025. The local-first personal-screen-capture category lost its biggest player. ([Skywork: Rewind & Limitless guide](https://skywork.ai/skypage/en/Rewind-AI-&-Limitless:-The-Ultimate-Guide-to-Your-Digital-Memory/1976181260991655936))
- **Perplexity Memory** launched for consumer subscribers in late 2025 and went enterprise-wide in early 2026. It remembers threads, preferences, and priorities across models. In Comet (their browser) it can pull context from open tabs. ([Perplexity Hub: Introducing AI assistants with memory](https://www.perplexity.ai/hub/blog/introducing-ai-assistants-with-memory), [IntraBlog: Perplexity Memory](https://blog.intramind-srl.com/en/home/post/perplexity-ai-memory-feature-personalized-contextual-ai-across-models))
- **Anthropic Claude** added Memory + a "Dreaming" research-preview to Managed Agents in May 2026. Dreaming is a scheduled process that reviews past sessions and curates memories between runs. Memory is per-managed-agent, scoped to a job. ([SD Times: Anthropic adds memory to Claude Managed Agents](https://sdtimes.com/anthropic/anthropic-adds-memory-to-claude-managed-agents/), [Technobezz: Dreaming feature](https://www.technobezz.com/news/anthropic-introduces-dreaming-feature-for-claude-agents-to-self-improve-overnight))
- **Mem.ai** continues to be the option for prolific note-takers — useful proportional to how much you write. ([Dume.ai: Top 10 AI Assistants with Memory in 2026](https://www.dume.ai/blog/top-10-ai-assistants-with-memory-in-2026))

### 1.2 Enterprise knowledge-graph is consolidated

- **Glean** crossed $200M ARR at a $7.2B valuation with their Series F in June 2025. Their Enterprise Graph connects 100+ SaaS apps and incorporates personal graphs alongside the organisational graph. Strictly enterprise B2B. ([Glean Series F announcement](https://www.glean.com/press/glean-raises-150m-series-f-at-7-2b-valuation-to-accelerate-enterprise-ai-agent-innovation-globally), [Futurum: Glean Doubles ARR](https://futurumgroup.com/insights/glean-doubles-arr-to-200m-can-its-knowledge-graph-beat-copilot/))

### 1.3 Shopping-agent category is single-vertical

- **Karma** shipped an "intelligent shopping agent" in April 2026: real-time price tracking, automated coupon application, universal wishlist. Karma explicitly does not collect browsing history — accesses the current page URL only to identify supported merchants. ([Yahoo Finance: Karma shopping agent launch](https://finance.yahoo.com/sectors/technology/articles/karma-announces-launch-intelligent-shopping-100200536.html), [MarketersMedia: Karma's AI Shopping Agent](https://news.marketersmedia.com/karmas-ai-shopping-agent-is-shaping-the-next-era-of-e-commerce-innovation/89182246))
- **Honey** (PayPal) evolved beyond coupons into a "shopping companion" but remains shopping-only.

### 1.4 Personal-data API category does not exist yet

- Searches for "personal interest graph API" / "personal data API for developers" return: identity resolution (Outlit), B2B contact databases (People Data Labs), enterprise search (Glean). **No direct competitor sells a multi-tenant personal interest graph API for indie developers.** ([YC: API startups 2026](https://www.ycombinator.com/companies/industry/api))
- People Data Labs sells 1.5B+ person records — a privacy ANTI-pattern from our perspective. They are the wrong direction; they're not us.

### 1.5 Key implication

Three structural openings exist in May 2026:

1. **The local-first personal-memory vacuum** Meta created by sunsetting Rewind capture.
2. **The cross-platform attention layer** that nobody has built — every memory product captures from ONE source (Perplexity from chat, Anthropic Memory from chat, Glean from enterprise SaaS, Karma from shopping, Mem from manual notes).
3. **The personal-graph-as-IaaS category** that doesn't have a named player. Glean serves enterprises only; everyone else is B2C.

These three openings are the foundation of this positioning.

---

## 2. The category we are in

**Personal Attention Infrastructure.**

Not "AI chat" (Perplexity/ChatGPT own that).
Not "AI agent" (every product claims this; the word is dead).
Not "AI browser" (Comet, Arc Search, Atlas — crowded).
Not "second brain" (Mem/Roam/Obsidian/Reflect own that, and the framing implies manual note-taking, which is what we replace).
Not "enterprise knowledge graph" (Glean owns that).
Not "shopping agent" (Karma/Honey own that — single vertical).

The full category description, in one sentence:

> **Recome captures, structures, and serves what you actually paid attention to across every platform — and exposes that graph to you (consumer product) and to other developers (IaaS).**

Three nouns: **capture, graph, agents**. Three verbs: **remembers, surfaces, decides**. Two surfaces: **consumer** and **developer**.

This is a defensible category because no one else has organised themselves around exactly this set of decisions. They've each picked a different one.

---

## 3. Battle cards — head-to-head against every named competitor

For each competitor: what they do well, what they structurally cannot ship from where they sit today, and what we say when a user / investor mentions them. "Structurally cannot ship" is critical — it's not enough to say "we're better." A well-funded competitor can always ship features. The question is: can they ship the SAME ARCHITECTURE without invalidating their own core product?

### 3.1 vs Perplexity (Memory + Spaces + Comet)

**What they do well**

- World's-best web-search-grounded answers. We will lose head-to-head on "what is X?" forever.
- Comet's agentic browser ([perplexity.ai/comet](https://www.perplexity.ai/comet)) acts on your behalf in the live browser, currently with Max-subscriber model choice (Opus 4.6 default, Sonnet 4.5).
- Spaces ([Perplexity Magazine guide](https://perplexityaimagazine.com/perplexity-hub/perplexity-ai-spaces-guide-2026/)) are persistent project workspaces with up to 50 files (Pro) / 500 (Enterprise) and custom AI instructions. Memory builds within each Space.
- Strong brand recall ("Perplexity that") and enterprise distribution.

**Where their architecture caps them**

- **Memory is chat-session-scoped.** Memory accumulates from what you ask Perplexity, not from what you actually do on the web. Capture from a Reddit thread you read for 15 minutes? Not there. Capture from a YouTube video you watched twice? Not there. Capture from your Amazon cart? Not there. Their memory only sees what flows through their chat.
- **Comet is reactive.** Comet acts when you ask it to. There's no Perplexity-side worker pulling threads while you sleep on topics you've never explicitly tasked it with. ([Beginners in AI: What's new in Perplexity 2026](https://beginnersinai.org/whats-new-perplexity-2026/))
- **Spaces are project containers.** Useful for "research this trip" but not for "everything I've cared about across all platforms over six months."
- **No public graph to the user.** Memory is opaque text retention. You can't see your own structure, you can't navigate it, you can't export it as a graph, you can't query it as an API.

**Our position**

> "Perplexity answers questions when you ask. Recome remembers what you actually did and brings you things when you don't ask. Different products, but only one of them owns the graph of your attention."

We never frame this as a competition on "answer quality" — we lose. We always frame as a different category.

### 3.2 vs Anthropic Claude (Memory + Dreaming + Managed Agents)

**What they do well**

- Best-in-class reasoning model — the model itself is the moat.
- Memory per Managed Agent, "Dreaming" reviews past sessions and curates memory between runs ([MindStudio: Claude Dreaming](https://www.mindstudio.ai/blog/what-is-claude-dreaming-anthropic-managed-agents)), Outcomes for rubric-graded evals ([MindStudio: New agent features](https://www.mindstudio.ai/blog/code-with-claude-2026-new-agent-features)).
- Claude for Excel/Word/PowerPoint GA, Outlook beta, Claude for Small Business (QuickBooks, HubSpot, Microsoft 365 integrations) ([Fazm.ai: Claude update May 2026](https://fazm.ai/t/anthropic-claude-update-may-2026)).
- Multi-agent orchestration via Managed Agents.

**Where their architecture caps them**

- **Memory is per-agent and job-scoped.** Each agent's memory is theirs. Not a cross-app personal graph of you.
- **Dreaming runs on agent sessions, not on your life.** "Dreaming" is about an agent improving at its job, not surfacing things back to you about what you've been doing.
- **Anthropic doesn't capture from your browser or your platforms.** Their integrations are enterprise productivity-app integrations (QuickBooks, Excel). They don't see your Reddit threads or your Amazon carts.
- **They build infrastructure for developers to build agents** — we build infrastructure for developers to build _interest-graph-aware_ products. Different dependency in the stack.

**Our position**

> "Anthropic gives developers the best LLM to build agents with. Recome gives developers the personal interest graph those agents need to actually know the user. We are a layer beneath the agent layer."

We actively use Claude (per [ADR-0005](0005-tech-stack.md) Sonnet for synthesis, Haiku for routing). We are Claude API customers. We are not Claude competitors. Our IaaS pitch to other developers is: "Bring your own LLM (probably Claude); we'll bring the user's graph."

### 3.3 vs Limitless (formerly Rewind) — the vacuum

**Current state**

- Acquired by Meta December 2025. Screen + audio capture functionality disabled December 19, 2025. Pendant hardware still being sold ([Skywork: Limitless analysis](https://skywork.ai/skypage/en/Limitless-AI-An-In-Depth-Review-and-Analysis/1976154402840047616)) but the original "second brain from your screen" use case is dead.

**Why it failed to win**

- Capture-everything was scary to users (cognitive surveillance feeling).
- Local-only meant no cross-device — defeated the value of "your second brain" once you owned more than one device.
- Wearable pivot diluted focus.

**Our position**

> "Limitless tried to capture everything you saw. Meta absorbed them. We capture only what you actively engaged with on platforms you already use — no recording, no pendant, no creep factor. The personal-memory vacuum they left is real and we're filling a saner version of it."

We don't sell ourselves as "Rewind, but cloud." We sell ourselves as the correction — capture engagement (which the user is doing publicly anyway), not the screen.

### 3.4 vs Mem.ai / Reflect / Roam / Obsidian — note-takers

**What they do well**

- The community of people who genuinely take a lot of notes will pay them for tools that make notes smarter.
- They have brand and category ownership over "second brain."
- Mem.ai's value scales linearly with how much you write.

**Where their architecture caps them**

- **Manual capture.** They depend on the user typing things down. The vast majority of people don't.
- **Notes are unstructured text.** They can search and link, but they can't show you that you've been comparing standing desks across YouTube and Reddit for three weeks because you never wrote it down.
- **No cross-platform attention model.** They have no concept of "you watched X on YouTube" because you'd have to type that observation in yourself.

**Our position**

> "Note-takers built the perfect second brain for people who already type everything. We built the second brain for what you actually _do_ — no typing required."

We don't try to import their users. We try to import their non-users (the 95% of people who don't take notes but still have research patterns).

### 3.5 vs Glean — enterprise knowledge graph

**What they do well**

- $7.2B valuation, $200M ARR, 100+ SaaS integrations. They own enterprise.
- "Personal graph alongside enterprise graph" inside an org's knowledge graph.
- GraphRAG architecture ([VentureBeat: GraphRAG fuels Glean](https://venturebeat.com/data-infrastructure/how-to-take-advantage-of-a-generative-tool-fueling-gleans-260m-raise-graph-rag)).

**Where their architecture caps them**

- **Enterprise-only.** Sold to IT/CIOs, deployed inside org boundary, paid for by the org. You can't sign up as an individual.
- **Org-scoped graph.** Personal graph lives inside the enterprise graph — when you leave the company, your personal graph stays with them.
- **Capture from work SaaS only.** Slack, Salesforce, Notion, Jira. Not YouTube, not Reddit, not Amazon, not your reading life.
- **No IaaS offering for indie developers.** Glean is a finished product, not infrastructure.

**Our position**

> "Glean built the knowledge graph for what you do at work. We build the interest graph for what you do everywhere else — and we let other developers build on top of it."

We are explicitly NOT the Glean of consumers. Glean is sold to CIOs; we are sold to individuals and to developers building consumer products. Different motion entirely.

### 3.6 vs Karma / Honey — shopping agents

**What they do well**

- Karma's shopping agent (April 2026) does price tracking, coupon application, universal wishlist across verticals ([Karma announcement](https://finance.yahoo.com/sectors/technology/articles/karma-announces-launch-intelligent-shopping-100200536.html)).
- Honey (PayPal) ships an "AI shopping companion."
- Massive distribution via browser extensions.

**Where their architecture caps them**

- **Single vertical: shopping.** That's their entire product surface.
- **Privacy-first stance excludes cross-context.** Karma explicitly does not collect browsing history. Their privacy stance is also their architectural ceiling — they cannot know what you watched on YouTube last week.
- **No persistent interest model of you.** Their "memory" is the wishlist you explicitly added items to.
- **No surface beyond commerce.** Can't help you remember a Verge review of a desk you read three weeks ago — they don't see content sites.

**Our position**

> "Karma is great at finding a coupon for a thing on your wishlist. Recome knows that you watched a 27-minute YouTube review last month that said this exact model has bad bearings, and tells you before you click buy. Different scopes."

Our Concierge agent (ADR-0012 §2.2 Tier 1) is the shopping surface — but it's a feature on top of the graph, not the whole product. Karma cannot replicate this without becoming a different company.

### 3.7 vs agentic browsers (Comet, Arc, Atlas, Dia)

**What they do well**

- Comet uses Anthropic models, can act in-browser on your behalf, integrates with Memory + Spaces.
- Arc Search and similar offer LLM-blended search results in a familiar Chromium chrome.

**Where their architecture caps them**

- **Browser-only capture.** They see what you do _in their browser_. The moment you switch to Safari on phone, the IG mobile app, the YouTube iOS app, the Amazon iOS app — they go blind.
- **Browser-bound capture is exactly the install friction we already rejected in [ADR-0003](0003-pivot-web-first-with-iaas.md).** Adoption requires switching browsers, which is a heavier lift than installing an extension was.
- **No graph surface to the user.** Comet acts; it does not show you your own attention pattern.

**Our position**

> "Comet/Arc/Atlas need you to switch browsers. We work with whatever browser you use, plus mobile, plus the PWA share-sheet, plus an IaaS API for any product to send signals. We don't compete for the browser slot."

---

## 4. Where everyone wins (the honest table)

| Need                                                                 | Best tool today              | Why we won't compete                                      |
| -------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------- |
| "What is X?" — world knowledge                                       | Perplexity                   | Their entire architecture is built for this. We'd lose.   |
| "Help me write this email" — generative drafting                     | Claude / ChatGPT             | LLM quality is their moat. We use them via API.           |
| "Find that thing my coworker shared in Slack" — enterprise knowledge | Glean                        | Enterprise sales motion + org-bound graph. Not our buyer. |
| "Apply a coupon code at checkout" — shopping vertical                | Karma / Honey                | Single-vertical depth we don't want to chase.             |
| "Take a note about this idea" — manual capture                       | Mem / Reflect / Obsidian     | Their users want to type. Ours don't.                     |
| "Act on my behalf in the browser right now" — agentic browser        | Comet (and increasingly Arc) | Browser-context is a different layer than ours.           |

Calling out what other tools do well is positioning ammo. "We don't replace X for Y; we add a layer X can't see" is a more credible pitch than "we beat X everywhere."

---

## 5. The three durable moats

A moat is something a competitor cannot replicate without invalidating their own core product. We have three.

### 5.1 The capture topology

We capture from **six independent surfaces feeding one graph:**

1. Browser extension (passive, power user)
2. PWA share-sheet (mobile, any site)
3. URL paste (any device with a browser)
4. Email forward (`save@recome.app` — future)
5. Bulk import (YouTube Takeout, Amazon orders, Reddit saved — future)
6. IaaS API (other products send signals on behalf of their users)

No competitor captures from this combination. Perplexity captures from chat. Anthropic captures from chat + enterprise apps. Glean captures from enterprise SaaS. Karma captures from current page only. Mem captures from manual entry. Comet captures from its browser only.

The set is the moat. Removing any one source would weaken the graph; adding all six requires building this set, which is what we did.

**Why a competitor can't copy:** each of these capture surfaces requires either trust (extension, share-sheet — we have to be the brand the user installs), distribution (PWA — we have to be the URL the user paste-installs), or different go-to-market (IaaS — different sales motion than their own product). Building six is years of work for someone whose current core is one.

### 5.2 The graph-as-a-product

We are the only product where **the graph itself is a user-facing surface.**

- Mind Map view ([ADR-0012 §2.4 F-318](0012-active-agents-and-personality-mirror.md#24-mind-map--personality-mirror)) shows the user their own topics, edges, and clusters
- Trails view shows cross-platform research arcs over time
- Inbox shows what agents found _for you_
- Export endpoint returns your graph as JSON / GraphML

Perplexity Memory is opaque text. Claude Memory is opaque text. Glean's graph is for the org's admin, not the individual employee. Karma has a wishlist, not a graph.

**Why a competitor can't copy:** Perplexity / Claude / ChatGPT specifically built memory to be invisible — the marketing pitch is "you don't have to manage memory." Showing the user their graph contradicts their UX premise. Glean would have to break their B2B-to-IT motion to ship a personal-graph product. Karma would have to expand to non-shopping signals — not their company.

### 5.3 The dual-sided business

Same backend powers:

- The consumer product at `recome.app` (B2C subscription)
- The IaaS API at `api.recome.app/v1` (B2D usage-based)

Per [ADR-0003 §2.3](0003-pivot-web-first-with-iaas.md#23-iaas-platform-play) and the existing implementation in [`cloud/src/iaas/`](../../cloud/src/iaas/).

Stripe-style: the consumer product is `recome.app`, the IaaS is for other developers to embed personal-interest-graph features in their products.

**Why a competitor can't copy:** Perplexity and Anthropic sell models / answers; their products use their infrastructure but the infrastructure isn't a third-party API surface for personal-interest graphs. Glean is enterprise-only; running a high-volume indie-developer SaaS surface is a different motion and would dilute their enterprise message. The IaaS surface and the consumer surface reinforce each other: more IaaS volume → more diverse signal types → better consumer graph → better marketing for IaaS.

This is the Stripe / Twilio playbook applied to personal-data infrastructure. No one else in this category is doing it.

---

## 6. The category-defining sentence

The one-liner everyone in the company memorizes. Re-test against this whenever scope creep is proposed.

> **Recome is the personal-attention infrastructure layer — for individuals, and for developers who want to build on the user's own interest graph.**

Three things in that sentence:

- **personal-attention** — not work, not knowledge, not search
- **infrastructure** — not an app, not a chat surface
- **layer** — others build on us, including ourselves

The follow-ups that flow from this sentence:

- _"Perplexity answers questions. Recome remembers what you actually did and brings you things."_
- _"Your second brain remembers what you actually did, not what you wrote down."_
- _"The interest graph that runs in the background of your life."_
- _"Stripe for personal interest data — for the developers, for the user."_

---

## 7. The list of things we will never say

Anti-positioning. Saying any of these makes us indistinguishable from a competitor we lose to.

- ❌ _"AI assistant"_ — Perplexity / ChatGPT / Claude / Gemini own this term. Saying it makes us comparable on dimensions we lose.
- ❌ _"AI agent"_ — Word is dead. Every product is shipping agents. We say "active agents working on your interest graph."
- ❌ _"Knowledge graph"_ — Glean's word. Enterprise resonance, B2B SaaS connotation. We say "interest graph."
- ❌ _"Second brain"_ — Mem/Roam/Obsidian own this. Implies manual capture. We say "the memory of what you've actually done."
- ❌ _"AI search"_ — Perplexity owns this. We don't search. We _remember_.
- ❌ _"Privacy-first"_ — Generic. Karma uses it, Apple uses it, everyone uses it. We instead say specifically: _"user-owned, GDPR-deletable, never trained on cross-user, opt-in for everything."_
- ❌ _"Browser"_ — Comet/Arc own this. We work with any browser. We don't ship one.
- ❌ _"Shopping assistant"_ — Karma/Honey own this. Concierge is a feature, not the product.
- ❌ _"Productivity"_ — Wide commodity term that lands us comparable to Notion / Linear / Asana. Not what we are.

---

## 8. Three-year defensibility argument

Will the moats described in §5 still be moats in 2029? Honest case for each:

### 8.1 Will Perplexity or Anthropic build cross-platform capture?

**Probably not.** Cross-platform capture means asking the user to install a browser extension, a mobile share-target, and email forwarding. That's a heavier ask than "use our chat." For Perplexity / Anthropic, the marginal user they want is the one who'd never install a productivity tool. Forcing them to install our combination is a churn engine, not a growth engine.

**If they do build it:** their existing brand (search / model provider) doesn't immediately translate to "I trust this with my browsing history." We have a credibility window before they ship that ours-first positioning matters most.

### 8.2 Will Glean go consumer?

**Almost certainly not within 3 years.** $200M ARR enterprise machine doesn't pivot. Boards don't allow it. The B2B and B2C motions are different sales orgs, support orgs, pricing models, product orgs. Glean has chosen.

**If they do:** they spin out a separate consumer product, which inherits zero of their enterprise contracts and starts at zero MAU. We have the same starting line and three years of head start.

### 8.3 Will someone else build the exact thing?

**Likely.** Given the Rewind vacuum, the agentic-browser hype, and the cheap LLM costs, several "memory product" startups will try the cross-platform graph approach. Our defenses against them:

1. **First-mover on the unique IaaS surface.** Six months of brand and docs trust matter on developer products.
2. **Our network effects in the IaaS layer.** Once 20+ products embed Recome signals, the underlying graph (over multiple apps the same user uses) becomes deeper for free.
3. **Honest privacy posture as defensible brand.** Most copycats will overreach (sell aggregate data, train on cross-user, lock to platform). We've already committed in writing (this doc + [ADR-0012 §5](0012-active-agents-and-personality-mirror.md#5-trust--safety-constraints-binding)) to not. That commitment compounds over time.

**Open risk:** if Apple or Google ship a system-level personal-memory API (iOS Intelligence Personal Context, Android Gemini Memory), we have a real problem. Mitigation: integrate with them as a capture source rather than fight. Our differentiation moves up the stack to "the graph + agents," they become input #7.

---

## 9. What this means for product, marketing, and engineering

### 9.1 Product implications

- Lead the marketing surface with what no one else can do (Mind Map, Recall, cross-platform Concierge). Never lead with chat — every visitor compares it to Perplexity.
- The onboarding sequence must hit "aha" within 5 minutes (the Recall surface from existing memory). Otherwise we are a worse Perplexity for a week.
- Bulk import (YouTube Takeout, Amazon orders) is load-bearing for cold-start defensibility — it's how we get the graph deep enough fast enough that week 1 isn't terrible.

### 9.2 Marketing implications

- Always lead with the user's own data ("we know what _you_ watched"), not the model ("we use Claude").
- Battle cards in §3 are the literal answers to "how is this different from X?" Don't improvise these.
- The category name we own is **personal attention infrastructure**. Use it consistently. Headlines, About page, investor decks, hiring posts.

### 9.3 Engineering implications

- The graph schema, the IaaS API, and the privacy controls are the moat. Code quality there matters more than feature breadth elsewhere. Bug there is a category exit; bug in a marketing page is fixable.
- Every new feature gets a one-line "why this is structurally hard for competitor X to copy" justification in its PR. If we can't write that, the feature is comparable, which means we're competing on table stakes, which means we lose to scale.
- The `/v1` API is the differentiator nobody else has — its docs, DX, and SLAs need to be best-in-class before we even worry about feature parity with consumer-side competitors.

---

## 10. Open questions

1. **Brand name for the IaaS surface.** Working name "Recome Intelligence API" is internal. Public launch needs a name. Candidates: Mnemos, Trailbase, Synapse API, Attention API, Wits. Decide before §M2 launch in [0004 roadmap](0004-production-roadmap.md).
2. **How aggressively to position against Glean for the "personal layer of enterprise" use case.** Some Glean enterprise customers might want a per-employee personal graph that follows them between jobs. That's our wedge into B2B but it's also a fight we may not want.
3. **Whether to explicitly mark a "Switch from Perplexity" page.** Tempting (high SEO intent) but invites direct comparison on dimensions we lose. Default: no, until our user retention numbers force the conversation.

---

## 11. Related

- [ADR-0001](0001-graph-vector-stack.md) — Graph + vector stack that makes §5.2 the graph-as-product possible.
- [ADR-0003](0003-pivot-web-first-with-iaas.md) — The pivot that made §5.3 the dual-sided business shape.
- [ADR-0012](0012-active-agents-and-personality-mirror.md) — Active agents direction; the proactive bring-you-things behaviour cited in §6.
- [0014-unique-product-surfaces.md](0014-unique-product-surfaces.md) — Concrete feature spec for the surfaces that make §5.2 visible.
- [0004 production roadmap](0004-production-roadmap.md) — Sequencing for shipping the above.

## Sources

May 2026 competitive data cited in §1:

- [Skywork — Rewind AI & Limitless: Ultimate Guide](https://skywork.ai/skypage/en/Rewind-AI-&-Limitless:-The-Ultimate-Guide-to-Your-Digital-Memory/1976181260991655936) — Rewind→Limitless rebrand, Meta acquisition, capture-disabled Dec 19 2025
- [Perplexity Hub — Introducing AI assistants with memory](https://www.perplexity.ai/hub/blog/introducing-ai-assistants-with-memory)
- [IntraBlog — Perplexity Memory feature deep-dive](https://blog.intramind-srl.com/en/home/post/perplexity-ai-memory-feature-personalized-contextual-ai-across-models)
- [Beginners in AI — What's New in Perplexity 2026](https://beginnersinai.org/whats-new-perplexity-2026/)
- [Perplexity Magazine — Spaces Guide 2026](https://perplexityaimagazine.com/perplexity-hub/perplexity-ai-spaces-guide-2026/)
- [Comet Browser product page](https://www.perplexity.ai/comet)
- [SD Times — Anthropic adds memory to Claude Managed Agents](https://sdtimes.com/anthropic/anthropic-adds-memory-to-claude-managed-agents/)
- [MindStudio — Claude Dreaming explainer](https://www.mindstudio.ai/blog/what-is-claude-dreaming-anthropic-managed-agents)
- [MindStudio — Five new Claude agent features May 2026](https://www.mindstudio.ai/blog/code-with-claude-2026-new-agent-features)
- [Technobezz — Anthropic Dreaming feature](https://www.technobezz.com/news/anthropic-introduces-dreaming-feature-for-claude-agents-to-self-improve-overnight)
- [Fazm.ai — Claude update May 2026](https://fazm.ai/t/anthropic-claude-update-may-2026)
- [Glean — Series F announcement, $7.2B valuation](https://www.glean.com/press/glean-raises-150m-series-f-at-7-2b-valuation-to-accelerate-enterprise-ai-agent-innovation-globally)
- [Futurum — Glean doubles ARR to $200M](https://futurumgroup.com/insights/glean-doubles-arr-to-200m-can-its-knowledge-graph-beat-copilot/)
- [VentureBeat — Glean GraphRAG architecture](https://venturebeat.com/data-infrastructure/how-to-take-advantage-of-a-generative-tool-fueling-gleans-260m-raise-graph-rag)
- [Yahoo Finance — Karma announces intelligent shopping agent (Apr 2026)](https://finance.yahoo.com/sectors/technology/articles/karma-announces-launch-intelligent-shopping-100200536.html)
- [MarketersMedia — Karma's AI Shopping Agent shaping next era](https://news.marketersmedia.com/karmas-ai-shopping-agent-is-shaping-the-next-era-of-e-commerce-innovation/89182246)
- [Dume.ai — Top 10 AI Assistants with Memory 2026](https://www.dume.ai/blog/top-10-ai-assistants-with-memory-in-2026)
- [Y Combinator — API startups 2026](https://www.ycombinator.com/companies/industry/api)
- [Skywork — Limitless AI in-depth review](https://skywork.ai/skypage/en/Limitless-AI-An-In-Depth-Review-and-Analysis/1976154402840047616)
