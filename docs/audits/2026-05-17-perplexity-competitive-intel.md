# Perplexity (+ Adjacent) Competitive Re-Audit — 2026-05-17

**Trigger:** Founder asked, post ADR-0013 / 0014 landing, for a fresh comparison against Perplexity's full product line (Comet, Personal Computer, Spaces, Memory, Threads) and adjacent agentic-AI products. Some of our positioning claims may have aged in days, not months — fresh check warranted.

**Author:** Principal Engineering, after May 17 2026 web research.
**Format:** matches `AUDIT_2026-05-14.md` — findings, what survives, what needs surgical change.

---

## 1. What I researched

Five live searches, May 17 2026:

1. Perplexity Comet browser + Personal Computer features
2. Perplexity Spaces + Memory + Threads (enterprise)
3. Anthropic Claude Skills + Managed Agents + Memory
4. OpenAI ChatGPT Operator + Computer-Use + Codex Background
5. "Personal interest graph" + "attention graph" cross-platform startup

Sources cited inline in §6.

---

## 2. What I found that materially changes our position

### 2.1 Perplexity Personal Computer (March 2026) — 24/7 background agent on Mac Mini

Per [Technology.org](https://www.technology.org/2026/03/13/perplexity-personal-computer-ai/) and [TamilTech](https://www.tamiltech.in/article/perplexity-pc-ai-comet-browser-ai-agent):

- Runs on Mac Mini with 24/7 uptime
- Direct access to local files + apps
- Voice orchestration
- Goal-based: user says "create an interactive educational guide" → system figures out apps + files
- Connected to Perplexity cloud

**Implication:** our ADR-0012 §6 statement —

> _"Perplexity's chat-centric architecture structurally can't run always-on agents per user without their unit economics collapsing."_

— is now factually wrong. They ship exactly that on a $599 Mac Mini, which they bundle. The "always-on agents" framing in our positioning is no longer differentiating by itself. **The differentiator narrows to WHAT THE AGENT READS.** Their agent reads your Mac (files, apps). Ours reads your interest graph (cross-platform attention).

### 2.2 Spaces now build memory from interactions

Per [Perplexity Magazine Spaces guide](https://perplexityaimagazine.com/perplexity-hub/perplexity-ai-spaces-guide-2026/):

> "Spaces now build and maintain memories from your interactions, making each Space more personalized and useful the more you work in it."

Plus Space SKILLS — packageable + shareable specialized capabilities. Enterprise: up to 500 files per Space, SSO, files excluded from training by default.

**Implication:** our ADR-0013 §3.1 claim —

> _"Spaces are project containers. Useful for 'research this trip' but not for 'everything I've cared about across all platforms over six months.'"_

— is **partially still true** (the per-Space scope is real; users would have to set up a Space per topic), but it weakens because users could approximate cross-platform memory by feeding signals into a Space deliberately. Our framing needs to sharpen: it's not just about HAVING memory, it's about WHO does the capture work.

### 2.3 Anthropic Memory + Dreaming + Multiagent (May 2026)

Per [9to5Mac](https://9to5mac.com/2026/05/07/anthropic-updates-claude-managed-agents-with-three-new-features/) and [SD Times](https://sdtimes.com/anthropic/anthropic-adds-memory-to-claude-managed-agents/):

- Memory is now public beta on Managed Agents
- File-system mounted (Claude uses bash + code execution against it)
- Audit log per memory file: which agent + session created it
- **Rollback** to earlier versions
- **Redact** from history
- Exportable via API

**Implication:** our F-408 "Audit Log of You" claim that "most competitors deliberately obscure this; we make it the loud feature" — needs qualification. Anthropic NOW has audit logs for Memory. The differentiator is now:

- **Anthropic Memory audit log = for the developer managing the agent's memory.**
- **Our F-408 = for the end user inspecting their own personal-attention data.**

Different audience. Different framing required. Both are real audit logs. Saying "we make it the loud feature" is honest only if we contrast with end-user-facing memory products (Perplexity Memory, ChatGPT Memory), not with developer-facing infrastructure (Claude API Memory).

### 2.4 OpenAI Operator shut down (August 2025)

Per [Coasty review](https://coasty.ai/blog/openai-operator-review-2026-20260405) and [No Hacks landscape guide](https://nohacks.co/blog/agentic-browser-landscape-2026):

> "Operator itself was shut down on August 31, 2025, after failing to reliably complete purchases on websites with complex JavaScript flows, CAPTCHAs, and session management."

OpenAI evolved Operator into ChatGPT Agent Mode + Codex Background Computer Use (April 2026).

**Implication:** **strengthens our position.** ADR-0012 §5 binding constraint —

> _"No agent takes irreversible action. Recommend only. Buy / post / send all stay user-driven."_

— is now MARKET-VALIDATED. The product that tried to do auto-purchase died. Our trust constraint is positioning AND insurance. Worth amplifying.

### 2.5 Pin AI — direct competitor in our space

Per [StartUs Insights startups guide 2026](https://www.startus-insights.com/innovators-guide/american-ai-companies/):

> "Pin AI builds a decentralized on-device personal intelligence platform that turns each person's digital footprints into personalized executive assistance. Its large language model and knowledge graph organize and analyze information to find insights and actions relevant to the situation."

This is the closest direct competitor to our space we've found. **Decentralized + on-device + knowledge graph + digital footprints** overlaps with our "personal interest graph" positioning significantly.

**Differences (our advantage):**

- They are decentralized on-device; we are cloud + sync, which makes cross-device + IaaS viable
- They don't appear to have an IaaS / API offering (decentralized model precludes it)
- They don't have multi-surface capture (extension + PWA share + paste + email + bulk import + IaaS)

**Differences (their advantage):**

- "Decentralized on-device" is a stronger privacy posture than cloud-with-encryption
- They presumably get OS-level capture access on Pin's own devices/pendants

**This competitor needs to appear in ADR-0013.**

### 2.6 The category is being named publicly

Per [AgenticTrust analysis](https://agentictrust.com/blog/context-graphs-are-a-trillion-dollar-opportunity-but-who-captures-it):

> "Context Graphs Are a Trillion-Dollar Opportunity. But Who Actually Captures It?"

The thesis is real beyond us. Other people are writing about "context graphs" / "interest graphs" / "memory graphs" as the next infrastructure layer. We are not alone in seeing it — which is good (validates the category) and dangerous (race for the category).

---

## 3. What still holds (cleanly)

After all the above, these claims survive:

| Claim                                                              | Status                  | Why                                                                                                                                                                                                       |
| ------------------------------------------------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Cross-platform capture topology" is unique                        | **Holds**               | Perplexity Personal Computer reads your Mac files; doesn't read your phone YouTube. Comet reads what's in Comet. Claude Memory reads chat. None reads YouTube + Reddit + Amazon + Substack the way we do. |
| "Graph-as-product (Mind Map F-401) renders YOUR graph back to YOU" | **Holds**               | None of Perplexity Memory / Claude Memory / Pin AI surfaces the graph as a navigable UI. Memory is opaque text / files.                                                                                   |
| "Personal-interest-graph as IaaS API"                              | **Holds**               | Pin AI is decentralized on-device — architecturally cannot ship a tenant-keyed multi-customer API. Glean is enterprise-only. Anthropic is LLM infra, not graph infra.                                     |
| "No agent takes irreversible action"                               | **Holds, strengthened** | Operator death validates the constraint.                                                                                                                                                                  |
| "User-owned, GDPR-deletable, never trained cross-user"             | **Holds**               | The honest privacy posture remains differentiating, especially as Anthropic Memory ships with default-on cross-session learning.                                                                          |
| "Recall surfaces forgotten captures on re-engagement"              | **Holds**               | Requires temporal cross-platform graph; nobody has the inputs.                                                                                                                                            |
| "Curriculum bridges from existing graph to learning goal"          | **Holds**               | Same — requires the cross-platform footprint as starting point.                                                                                                                                           |

---

## 4. What needs surgical change

Specific edits, with file + section:

### 4.1 ADR-0013 § "Perplexity" battle card

Update §3.1 "Where their architecture caps them" to:

- **REMOVE** "Comet is reactive. Comet acts when you ask it to. There's no Perplexity-side worker pulling threads while you sleep on topics you've never explicitly tasked it with." This is wrong — Personal Computer does exactly that.
- **REPLACE** with: "Personal Computer is a 24/7 background agent — but it sees your Mac files, not your cross-platform attention. Reading email is not the same as reading your graph of what you've researched across YouTube + Reddit + Amazon. The agent layer is no longer a moat; the graph layer is."
- **WEAKEN** "Memory is chat-session-scoped" with the Spaces-build-memory caveat — but keep the underlying point that users have to actively organise their captures vs our automatic graph build.

### 4.2 ADR-0013 § "Anthropic" battle card

Update §3.2:

- **NOTE** Anthropic Memory now persistent + file-mounted + audit-logged + rollback-able + exportable.
- **REFRAME** the "no personal graph in their architecture" point to: "their memory is per-developer-managed-agent. We are the layer beneath the agent layer — the personal graph the developer's agents read from."

### 4.3 ADR-0013 § agentic browsers

Update §3.7:

- **ADD** Personal Computer to the comparison.
- **KEEP** the "browser-bound capture" critique — Personal Computer is Mac-only and OS-bound; Comet is browser-bound; neither sees iPhone Safari + iOS YouTube + Android Reddit the way our PWA share-sheet + extension does.

### 4.4 ADR-0013 — NEW §3.8 vs Pin AI

Add a new battle card:

- What they do well: decentralized, on-device, privacy-pure
- Where they cap: no IaaS API (decentralized model), no multi-platform-account capture across devices
- Our position: "Pin AI bets on full local-device privacy. We bet on cross-device sync + an IaaS API for other products. Different bets. Same insight that the personal graph is the moat."

### 4.5 ADR-0013 § "Three durable moats"

Update §5 — the third moat description:

- The "dual-sided business" framing is still right.
- Add: "Two-sided MEANS we keep both surfaces honest. The IaaS API surface forces clean tenant isolation. The consumer surface forces user-facing trust. Each disciplines the other."

### 4.6 ADR-0013 § "Three-year defensibility"

Update §8:

- **REMOVE** "Will Perplexity / Anthropic build cross-platform capture? Probably not." This was too confident. Personal Computer is a step in that direction.
- **REPLACE** with: "Will they build cross-platform capture from non-Apple platforms? Probably not in 24 months — Personal Computer is Mac-bundled and they'd need to ship cross-device + cross-OS, which is years of work for an LLM-first company."
- **ADD** Pin AI to the contingency: "If Pin AI ships an IaaS API or starts cross-device cloud sync, our moat compresses."

### 4.7 0014 — F-403 Concierge

Update §4.2 "Why structurally unique":

- Karma critique HOLDS.
- **ADD** that Comet Assistant can shop autonomously — but it doesn't have your prior research footprint to ground "this model has bad bearings per a YouTube reviewer you watched 3 weeks ago."
- **ADD** Personal Computer can browse your local Mac for cart history but not your cross-platform research.

### 4.8 0014 — F-408 Audit Log

Update §9.3 "Why it's structurally unique":

- **NUANCE** Anthropic now has audit log on Memory — but that's for the developer, not the end user. Add Anthropic to the table with that distinction.
- Strengthen the user-facing framing: "Perplexity Memory shows you settings-page list of remembered facts you can edit. Claude Memory shows the developer file history. We show the user the full provenance, agent decisions, IaaS-tenant data access, and per-row delete."

### 4.9 recome-overview.html — vs-landscape section

Update the comparison:

- Add Personal Computer to Perplexity row.
- Add Anthropic to comparison (was implicit before).
- Add Pin AI to comparison.
- Sharpen "we don't compete with Perplexity, we complement it" with the agent-layer vs graph-layer reframe.

### 4.10 ADR-0012 §6 "Positioning" paragraph

The claim:

> _"This is the positioning that survives Perplexity Memory because Perplexity's chat-centric architecture structurally can't run always-on agents per user without their unit economics collapsing."_

Is now wrong. **Either delete or re-frame** as "...survives Perplexity Memory because Perplexity's agents act on YOUR MAC's files. Recome's agents act on YOUR INTEREST GRAPH."

---

## 5. What I am explicitly NOT changing

Sticking to the principal-engineer principle of "additions over rewrites." None of these need wholesale rewrites:

- **HLD ([0015](docs/architecture/0015-hld.md))** — system design is unaffected by competitor moves. Untouched.
- **LLD ([0016](docs/architecture/0016-lld.md))** — same. Untouched.
- **Tech-stack ADRs** (0001, 0005, 0002) — technical correctness, not positioning. Untouched.
- **Data model ([0009](docs/architecture/0009-data-model.md))** — unaffected. Untouched.
- **Security / privacy ([0010](docs/architecture/0010-security-privacy-ops.md))** — unaffected. Untouched.
- **Cost / GTM ([0011](docs/architecture/0011-cost-and-iaas-gtm.md))** — pricing math doesn't change with competitor news. Untouched.
- **Active agents ADR ([0012](docs/architecture/0012-active-agents-and-personality-mirror.md))** — apart from the one §6 sentence above, the agents architecture is sound. The six agents still make sense. Concierge gains tighter framing (vs Comet-can-shop) but the agent itself doesn't change. Mostly untouched.
- **Unique surfaces ([0014](docs/architecture/0014-unique-product-surfaces.md))** — F-401 / F-402 / F-404 / F-405 / F-406 / F-407 are unaffected. Only F-403 and F-408 need framing tweaks per §4 above.
- **Production roadmap ([0004](docs/architecture/0004-production-roadmap.md))** — phase ordering and KPIs are unaffected. Untouched.
- **Feature catalog ([0007](docs/architecture/0007-feature-catalog.md))** — unaffected. Untouched.

If the founder still wants wholesale rewrites of these after reviewing this audit, that's a deliberate decision; this audit gives them the evidence to make it. But the default answer is "the docs largely hold; here are the specific places that don't."

---

## 6. Sources

All facts in this audit are sourced. May 17 2026 web search.

### Perplexity

- [Perplexity Release Notes — May 2026 (Releasebot)](https://releasebot.io/updates/perplexity-ai)
- [Comet Browser product page](https://www.perplexity.ai/comet)
- [What's New in Perplexity 2026 — Beginners in AI](https://beginnersinai.org/whats-new-perplexity-2026/)
- [IBM Think — Comet: Perplexity's AI browser gets personal](https://www.ibm.com/think/news/comet-perplexity-take-agentic-browser)
- [Wikipedia — Comet (browser)](<https://en.wikipedia.org/wiki/Comet_(browser)>)
- [Perplexity Launches Personal Computer AI with Comet Browser — TamilTech](https://www.tamiltech.in/article/perplexity-pc-ai-comet-browser-ai-agent)
- [Perplexity's Personal Computer AI on your Desktop — Technology.org](https://www.technology.org/2026/03/13/perplexity-personal-computer-ai/)
- [Improved Computer Models and Enterprise Updates — Perplexity changelog May 4 2026](https://www.perplexity.ai/changelog/improved-computer-models-and-enterprise-updates---may-4-2026)
- [Perplexity Spaces Ultimate Guide — Perplexity AI Magazine](https://perplexityaimagazine.com/perplexity-hub/perplexity-ai-spaces-guide-2026/)
- [Perplexity Pricing 2026 — Suprmind](https://suprmind.ai/hub/perplexity/pricing/)

### Anthropic

- [Anthropic updates Claude Managed Agents with three new features — 9to5Mac](https://9to5mac.com/2026/05/07/anthropic-updates-claude-managed-agents-with-three-new-features/)
- [Anthropic adds memory to Claude Managed Agents — SD Times](https://sdtimes.com/anthropic/anthropic-adds-memory-to-claude-managed-agents/)
- [What Is Claude Dreaming? — MindStudio](https://www.mindstudio.ai/blog/what-is-claude-dreaming-anthropic-managed-agents)
- [Code with Claude 2026: 5 New Agent Features — MindStudio](https://www.mindstudio.ai/blog/code-with-claude-2026-new-agent-features)
- [Anthropic debuts Dreams for Claude Managed Agents — Testing Catalog](https://www.testingcatalog.com/anthropic-debuts-reaming-for-claude-managed-agents-in-new-preview/)
- [Anthropic Claude May 2026 update — Fazm.ai](https://fazm.ai/t/anthropic-claude-update-may-2026)

### OpenAI

- [Introducing Operator — OpenAI](https://openai.com/index/introducing-operator/)
- [Computer-Using Agent — OpenAI](https://openai.com/index/computer-using-agent/)
- [Introducing ChatGPT agent — OpenAI](https://openai.com/index/introducing-chatgpt-agent/)
- [OpenAI Operator Review 2026 — Coasty](https://coasty.ai/blog/openai-operator-review-2026-20260405)
- [The Agentic Browser Landscape 2026 — No Hacks](https://nohacks.co/blog/agentic-browser-landscape-2026)
- [Computer Use Agents 2026: Claude vs OpenAI vs Gemini — Digital Applied](https://www.digitalapplied.com/blog/computer-use-agents-2026-claude-openai-gemini-matrix)

### Adjacent / category

- [StartUs Insights — Top 30 American AI Companies 2026 (Pin AI listing)](https://www.startus-insights.com/innovators-guide/american-ai-companies/)
- [Context Graphs Are a Trillion-Dollar Opportunity — AgenticTrust](https://agentictrust.com/blog/context-graphs-are-a-trillion-dollar-opportunity-but-who-captures-it)
- [Context Graphs Are a Trillion-Dollar Opportunity — Subramanya N](https://subramanya.ai/2026/01/14/context-graphs-are-a-trillion-dollar-opportunity-but-who-captures-it)

---

## 7. Net delta — what this audit recommends

| Action                      | Files touched                                                  | Reason                                                                                                                                |
| --------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Audit doc                   | this file (new)                                                | Source of truth for the May 17 competitive findings.                                                                                  |
| ADR-0013 surgical updates   | docs/architecture/0013-competitive-positioning.md              | §3.1 Perplexity, §3.2 Anthropic, §3.7 agentic browsers, new §3.8 Pin AI, §5 third-moat refresh, §8 defensibility refresh, §11 sources |
| 0014 surgical updates       | docs/architecture/0014-unique-product-surfaces.md              | F-403 §4.2 framing, F-408 §9.3 nuance                                                                                                 |
| ADR-0012 one-line fix       | docs/architecture/0012-active-agents-and-personality-mirror.md | §6 paragraph re Perplexity unit economics — the claim is now false                                                                    |
| recome-overview.html update | docs/architecture/recome-overview.html                         | vs-landscape section comparison update                                                                                                |

**Files explicitly NOT changed:** 0001, 0002, 0004, 0005, 0006, 0007, 0008, 0009, 0010, 0011, 0015 (HLD), 0016 (LLD).

This is surgical, not wholesale. The architecture stack holds. The positioning needs targeted sharpening. We do that. We don't churn the rest.
