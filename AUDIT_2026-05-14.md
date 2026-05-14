# RecoMe — Principal-Engineer Audit & Reorg Plan

**Date:** 2026-05-14
**Author:** Synthesis from full-codebase audit (extension, brain, cloud, web, mobile, packages, agent, docs, build, git history)
**Status:** Working document — supersedes `PHASE_AUDIT_*`, `V2_PLAN.md`, `V3_PLAN.md`, `V4_PLAN.md`, `IMPROVED_ARCHITECTURE.md`, `new-docs/`, `old-docs/`
**Codebase:** 334 source files / ~65k LOC TS+TSX (excluding node_modules) across 7 sub-projects

---

## CORRECTIONS LOG

During the reorg-planning pass, deeper import-graph reconnaissance surfaced two material errors in the initial audit. Both are corrected inline below; flagging here for honesty:

1. **AgentRegistry IS populated.** `brain/src/orchestrator/index.ts:18-37` exposes `bootBrain()` which registers all six agents. The extension calls `bootBrain()` from `extension/src/background/messageHandler.ts` in four places. The orchestrator subsystem IS in the live execution path.

2. **`agent/` is load-bearing, not vaporware.** It's the _mobile_ layer that's vaporware. `agent/AgentFacade` (chat, retrieval, compare, watchlist) is consumed by the extension via `getAgent()` in seven places; `brain/` imports `@agent/llm/LLMClient` and `@agent/llm/PromptBuilder` from four files. Graveyarding `agent/` would break the live extension.

**What remains true:**

- **`ToolExecutor` is genuinely empty.** No `.register()` calls exist anywhere. Every agent's `useTool()` returns `success: false`. The agents are wired in but functionally inert — they execute, but their tool-mediated work is no-ops. This is worse than half-broken: it's _all_ six agents, not just Guardian/Scout/Social.
- All P0s from the April 7 audit remain open.
- Encryption, stats race, cloud production gaps, mobile vaporware — all still true.

The net effect on the reorg plan: **`agent/` and the brain agent classes cannot be graveyarded.** The safe-to-move set shrinks to `packages/ui/` (empty) and the `web/src/app/admin/*` sub-shells. Section 8.3 below has been corrected.

---

## 0. TL;DR

This is a **9-month solo prototype dressed as a multi-surface product**. One thing actually works end-to-end: the browser extension's local feed-filtering and scoring for a single user on a single device. Everything else — cloud backend, web dashboard, mobile app, multi-agent brain, taste twins, sync, billing, agent chat — is **wired up but not load-bearing**. The folders and method names exist; the tools, endpoints, agents, and tests that would make them real do not.

The single most important fact in this audit: **the four P0-CRITICAL items from your own April 7 self-audit are still open**, and every commit since has been cosmetic OAuth/UI polish.

The product can become real. The gap is not in skills or architecture taste — it is in scope discipline.

---

## 1. Scope/Execution Inversion

| Dimension     | Planned                                                                              | Delivered                                                                |
| ------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Sub-projects  | extension + brain + agent + cloud + web + mobile + packages                          | extension; landing page; auth shell                                      |
| Planning docs | V2/V3/V4/IMPROVED*ARCHITECTURE/PHASE_AUDIT*\*/new-docs/old-docs/ (10+ files, >250KB) | one CHANGELOG ending at v1.0.0 (Mar 16)                                  |
| LOC           | 64,920 across 334 files                                                              | ~30% of named agents/tools/endpoints are stubs                           |
| Commits       | 8 months elapsed                                                                     | 24 commits; post-Apr 7 cluster is cosmetic only                          |
| Tests         | 49 test files (looks rigorous)                                                       | content scripts + popup excluded from coverage in `jest.config.js:44-45` |
| Versioning    | package.json says v1.2.0                                                             | CHANGELOG hasn't been touched since v1.0.0                               |

**Pathology:** planning velocity ≫ execution velocity. Writing V2/V3/V4 while V1 P0s are open is the classic signal that planning has become a coping mechanism for unscoped work.

---

## 2. Module-by-Module Status

### 2.1 `extension/` — **Real, fragile, unmaintainable as it grows**

**Status:** The only thing shipping. v1.2.0 in Chrome Web Store. Core feed filtering, scoring, dwell tracking, overlay UI all functional.

**Architecture verdict:** MV3 patterns broadly correct; messaging layer is fragile and inconsistent.

**Critical issues:**

| Severity | File:Line                                            | Issue                                                                                                                 |
| -------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 🔴 HIGH  | `extension/src/shared/encryption.ts:142`             | Encryption key derived from `chrome.runtime.id` — deterministic per install. "Encrypted at rest" is materially false. |
| 🔴 HIGH  | `extension/src/background/messageHandler.ts:425-434` | API keys fall back to plaintext `chrome.storage.local` if encryption silently fails.                                  |
| 🔴 HIGH  | `extension/src/background/stats.ts:45-62`            | Read-modify-write with no transaction. Concurrent `CONTENT_HIDDEN` events undercount. Stats are lying.                |
| 🔴 HIGH  | `extension/src/background/index.ts:155-157`          | `quick_block` command has no `.catch()` — silently fails on first navigation to most pages.                           |
| 🟡 MED   | `extension/src/content/adapters/BaseAdapter.ts`      | **1,634-line god class** (MutationObserver + scoring + decisions + feedback + selector health all in one).            |
| 🟡 MED   | `extension/src/background/messageHandler.ts`         | **1,217-line monolithic dispatcher**, single function with 100+ case branches.                                        |
| 🟡 MED   | `extension/src/background/decisionLog.ts:15`         | In-memory ring buffer — lost on every service-worker restart. Debugging illusion.                                     |
| 🟡 MED   | `extension/src/shared/EventBus.ts:49-53`             | Bare `catch {}` swallows rejections in achievement/content-hidden/sync paths.                                         |
| 🟡 MED   | extension overall                                    | 85 `any` casts; popup `Dashboard.tsx` is 546 lines with untyped `send()` helper.                                      |
| 🟢 LOW   | `extension/src/popup/components/Dashboard.tsx:67`    | `.catch(console.error)` left in production.                                                                           |

**Verdict:** Works for light usage. Will degrade under heavy use (concurrent events) and is unmaintainable past one engineer.

---

### 2.2 `brain/` — **Mostly theatre**

**Status:** The folder names sell a sophisticated multi-agent AI system. The execution is ~95% hand-coded heuristics with optional LLM hooks that don't fire in tests.

**Critical structural failures:**

1. **`AgentRegistry` IS populated, but `ToolExecutor` is empty — so all six agents are inert.** `brain/src/orchestrator/index.ts:18-37` exposes `bootBrain()`, which registers all six agents. The extension calls `bootBrain()` from `messageHandler.ts:719,743,750,967`. The orchestrator runs and routes tasks. **But** every agent's tool calls go through `getToolExecutor().execute()` (see `agents/BaseAgent.ts:79`), and `ToolExecutor` has zero registered tools — no caller in the entire codebase invokes `.register()` on it. Every `useTool()` returns `{ success: false }` silently. The orchestrator executes; its agents complete; their work is no-ops. This is the worst possible failure mode — looks healthy in logs, produces nothing.

2. **All six agents are functionally non-functional, not three:** the audit initially identified Guardian/Scout/Social as stubs because they call obviously-unimplemented tools. But Filter/Advisor/Shopper call `score_content` / `query_knowledge_graph` / `price_history` / `reviews` / `alternatives` — none of which are registered either. The asymmetry was an artifact of unimplemented-tool _names_, not unimplemented-tool _behavior_. **No agent works.**

3. **Two of six remain ceremonial even if tools were registered:**
   - `GuardianAgent` defaults to `approved: true` if no consent tool exists. **There is no actual privacy enforcement, despite the privacy-first marketing.**
   - `ScoutAgent` / `SocialAgent` return synthetic stub data with low confidence.

4. **KnowledgeGraph is a hand-coded DFS reachability scorer** (`graph/AffinityCalculator.ts:94-123`). Hardcoded depth, hardcoded relation weights. Not learned, not inferential.

5. **DecayManager is time-based only** (`memory/DecayManager.ts:108-132`). Hard-coded transitions. No personalization.

6. **PreferenceSynthesizer** falls back silently when no LLM is configured (`memory/PreferenceSynthesizer.ts:40-43`). In CI it never runs — critical functionality is untested.

7. **Two parallel brains** that don't talk: `BrainFacade` (commerce intents) and `IntelligenceService` (recommendations) live in the same package with separate graphs and memory.

**Bugs:**

| Severity | File:Line                                      | Issue                                                                            |
| -------- | ---------------------------------------------- | -------------------------------------------------------------------------------- |
| 🔴 HIGH  | `brain/src/orchestrator/Brain.ts:41-44`        | AgentRegistry never populated.                                                   |
| 🔴 HIGH  | `brain/src/tools/ToolExecutor.ts:50-65`        | Zero tools registered.                                                           |
| 🔴 HIGH  | `brain/src/agents/GuardianAgent.ts:51-68`      | "Privacy" agent is a no-op.                                                      |
| 🟡 MED   | `brain/src/memory/DecayManager.ts:46-83`       | Concurrent `runDecay()` calls double-count (no IDB transaction).                 |
| 🟡 MED   | `brain/src/graph/AffinityCalculator.ts:94-123` | No max-path limit; pathological graphs explode.                                  |
| 🟡 MED   | `brain/src/tools/ToolExecutor.ts:100`          | Cache key uses `JSON.stringify(params)` — unstable across object property order. |
| 🟡 MED   | `brain/src/memory/MemoryService.ts`            | 476-line file mixing context detection, write, read, and blocking.               |

**Test coverage:** 2 test files for ~80 source files. `BrainFacade.test.ts` mocks everything; `integration.test.ts` exercises ~20% of the brain. None of the agent execution paths, tool registry, or orchestration flows are tested.

---

### 2.3 `cloud/` — **Functional MVP, production-hostile**

**Status:** More real than expected. Hono + Prisma. Auth (email/password + JWT + OAuth Google/GitHub/Facebook), refresh token rotation, encrypted sync blobs, Stripe billing, taste-twin matching, admin endpoints, RLS on Postgres.

**What works:** Auth flow, sync engine, billing primitives, basic admin endpoints.

**What's stubbed:**

- `cloud/src/agent/AgentController.ts:59-76` — "AI agent" is **keyword-matching with canned responses**. There is no LLM here. The README sells "AI Agent Chat powered by Claude, GPT, or Gemini" — that capability does not exist in the backend.
- `cloud/src/agent/AgentController.ts:13` — conversation history is in-memory `Map`, no eviction, comment literally says "upgrade to Redis for production".
- `cloud/src/storage/UserDataStore.ts:79` — insights endpoint returns `insightCount: 0`. No analysis pipeline.

**Critical production blockers:**

| Severity | File:Line                                          | Issue                                                                                                                                                            |
| -------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🔴 HIGH  | `cloud/deploy.sh:40-63`                            | Deploy uses `prisma db push --skip-generate` with no migrations directory. First schema-breaking change in prod = self-inflicted outage.                         |
| 🔴 HIGH  | `cloud/fly.toml` / rate limiter                    | In-memory rate limiter; Fly auto-scales N machines, each with its own counter. Bypass is trivial.                                                                |
| 🔴 HIGH  | `cloud/src/agent/AgentController.ts`               | "AI" is hardcoded responses. README/landing page sells a feature that doesn't exist.                                                                             |
| 🔴 HIGH  | `cloud/src/index.ts`                               | All logging is `console.log` to stdout. No structured logs, no Sentry, no metrics, no traces. Silent failures = dominant failure mode.                           |
| 🔴 HIGH  | auth flow                                          | No email verification, no password reset, no 2FA, no session revocation endpoint. Anyone can sign up with anyone's email. Lost password = unrecoverable account. |
| 🟡 MED   | `cloud/src/index.ts:29`                            | CORS wildcard `chrome-extension://*` — any extension can call the API.                                                                                           |
| 🟡 MED   | Prisma client                                      | Default pool of 2; no pooling config. Eats itself under any real load.                                                                                           |
| 🟡 MED   | `cloud/src/index.ts`                               | No SIGTERM handler. Fly drops in-flight requests on deploy.                                                                                                      |
| 🟡 MED   | Stripe webhook                                     | No idempotency-key dedupe beyond unique constraint. Retry storms can double-process.                                                                             |
| 🟡 MED   | `cloud/src/tastetwin/TasteTwinController.ts:65,93` | `.parse()` not `.safeParse()` — uncaught throws on bad input.                                                                                                    |
| 🟡 MED   | OAuth endpoints                                    | No rate limiting — brute-force auth-code risk.                                                                                                                   |
| 🟢 LOW   | `docker-compose.yml:19`                            | Dev JWT secret hardcoded as example. Copy-paste-to-prod footgun.                                                                                                 |

**Verdict:** Demo backend that authenticates and bills. Not yet a service.

---

### 2.4 `web/` — **Beautiful landing + non-functional dashboard**

**Status:**

- Landing page is production-quality marketing.
- Dashboard, signup, admin all delegate to `recome-api.fly.dev`. Without that server running, the entire app is a login form.
- **No signup endpoint exists** in `cloud/` — the signup form posts to nothing.
- Admin pages (`users`, `flags`, `deployments`, `config`, `errors`, `audit`) are UI shells with no working backend routes.

**Critical issues:**

- Dashboard fetches `/user/profile` from `recome-api.fly.dev`. If the user lands without a session, they see "Could not load your profile" — there is no signup flow that creates one in the same UI.
- Admin Dashboard fetches `/admin/stats` which exists in cloud as a stub returning hardcoded shape.

**Verdict:** Ship-quality marketing surface attached to a non-functional product surface. The dual story (landing promises a product; dashboard delivers a placeholder) is the worst kind of trust deficit.

---

### 2.5 `mobile/` — **Vaporware against a non-existent host**

**Status:** Six screen files, two service files. **None of it can run.**

| Severity | Issue                                                                                                                                                                                                                                     |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🔴 HIGH  | `mobile/src/services/SyncService.ts` calls `https://api.recome.app` — **a host that is not defined anywhere in this repo, manifest, or cloud config**. The cloud is `recome-api.fly.dev`. Mobile is calling a server that does not exist. |
| 🔴 HIGH  | No login screen integrated. `AgentService` reads token from SecureStore; nothing populates it.                                                                                                                                            |
| 🔴 HIGH  | `NotificationService` is fully implemented but never initialized by any screen. Dead code.                                                                                                                                                |
| 🔴 HIGH  | No state management, no offline mode, no error retry, no loading boundaries. Every screen calls `SyncService.fetchProfile()` raw on mount.                                                                                                |

**Verdict:** Delete or graveyard until the cloud is real.

---

### 2.6 `agent/` — **Load-bearing for the extension; would break server-side reuse**

**Status:** Genuinely used. `AgentFacade` (chat / retrieval / compare / watchlist) is consumed by the extension via `getAgent()` in seven places (`extension/src/background/messageHandler.ts:590-641`). `brain/` imports `@agent/llm/LLMClient` and `@agent/llm/PromptBuilder` from four files (`AIExplainer`, `PreferenceSynthesizer`, `CrossPlatformLinker`, `EntityExtractor`). The package is **not vaporware** — it is the extension's chat / retrieval / comparison layer.

**The architectural break is real but narrower than the initial audit claimed.** `agent/src/chat/ChatRouter.ts:7` imports `getBrain` from `@brain/BrainFacade`, which calls `chrome.storage.sync.get` at `brain/src/index.ts:65`. This works fine for the extension (chrome globals exist). It would break the moment anyone tries to reuse the agent in `cloud/` or any Node-only context.

**Verdict:**

- For the extension: shipping, do not move.
- For SaaS / cloud reuse: blocked until brain is abstracted behind a storage interface. The cloud agent endpoint currently sidesteps this by being keyword-matching theatre (`cloud/src/agent/AgentController.ts:59-76`) — i.e. the cloud avoids the problem by not actually using the agent package.

---

### 2.7 `packages/` — **Mixed**

- `packages/schema/` — **good.** Actually shared, actually imported (15+ files in agent, 20+ in brain, 5+ in extension). No type duplication detected.
- `packages/utils/` — Logger only. Thin but fine.
- `packages/ui/` — **empty directory.** Delete.

---

## 3. The Four P0s From Your Own Audit Are Still Open

Per `PHASE_AUDIT_SUMMARY.json` (April 7), four items are P0-CRITICAL:

1. **Research Card data is empty** — signals don't write to `KnowledgeGraph` (only `MemoryStore`), so the card shows nothing for new users.
2. **Reddit platform missing** from the `IMPLICIT_SIGNAL` union — Reddit signals lose platform attribution.
3. **No E2E test of the thesis** — YouTube → Reddit → Amazon flow has never been verified.
4. **Web dashboard is a placeholder** — shows "Research topics appear here once cloud sync is enabled" instead of actual data.

**Commits since Apr 7:**

- `0b287a2` Sprint 0A: Fix data pipeline (Mar 27 — actually pre-audit)
- `b2fb1d3` Admin panel: command center
- `2964aff` UI polish: auth-aware navbar, shared footer, mobile menu, OAuth token handling
- `879ee8b` Fix OAuth dashboard auth

**None of the four P0s were touched.** The thesis flow — the entire reason the product exists — is still broken five weeks after you flagged it.

---

## 4. Test Coverage Is A Lie

| Claim                                      | Reality                                                                                                                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 49 test files                              | 2 in brain for 80 source files; most are smoke tests against mocks                                                                                                     |
| 70% coverage threshold in `jest.config.js` | `jest.config.js:44-45` explicitly excludes `extension/src/content` and `extension/src/popup` from coverage. **The product surface is excluded by design.**             |
| Green `npm test`                           | Catches none of: the unregistered agent tools, the empty Reddit platform path, the empty Research Card, the broken `quick_block` command, or the stats race condition. |
| Integration tests                          | None for cross-platform flow. None for service-worker restart. None for OAuth callback. None for Stripe webhook.                                                       |

There is no Playwright. No Puppeteer. No extension E2E harness. Nothing simulates a real browser session.

---

## 5. Documentation Hygiene

Three competing source-of-truth surfaces, all stale:

| Doc                                        | State                                                                         |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| `old-docs/` (13 files)                     | Superseded v0 sketches. Should be deleted.                                    |
| `new-docs/` (8 numbered v1.0 plans)        | Probably authoritative but never marked as such.                              |
| `V2_PLAN.md` / `V3_PLAN.md` / `V4_PLAN.md` | Aspirational vision docs totaling ~150KB. Contradict each other.              |
| `IMPROVED_ARCHITECTURE.md` (46KB)          | Well-written, overlaps with V-plans.                                          |
| `PHASE_AUDIT_*` (4 files)                  | Most recent ground truth (Apr 7). All Phase 0 DoD checkboxes still unchecked. |
| `CHANGELOG.md`                             | Last entry v1.0.0 (Mar 16). No updates for 1.1.0 or 1.2.0.                    |
| `recome_interview_prep.md`                 | Personal interview prep file in repo root. Probably shouldn't be committed.   |

A newcomer cannot tell which document is authoritative. This audit document is the next attempt; everything above should be deleted or archived once you accept it.

---

## 6. Git Signal

24 commits across 8 months. Solo author. No PRs, no branches beyond `main`, no code review artifacts.

Visible architecture pivots in the log:

- Initial burst Mar 16–18 (12 commits) — agents, adapters, privacy, policies.
- Mar 27: "Sprint 0A: Fix data pipeline — thesis flow now works end-to-end" (claim).
- Mar 31: "Architecture revamp: overlay-first, no popup, web app control center" — contradicts earlier popup work.
- Apr 1–6: UI polish, admin panel scaffolding.
- Apr 7–29: OAuth fixes, navbar, footer, terms/privacy pages.

**Pattern:** Two-week sprint → audit → replan → two-week cosmetic cleanup. Not iteration; oscillation between building and re-planning.

---

## 7. Consolidated Bug List (Cite-and-Fix)

### 🔴 Production-blocking

- `brain/src/tools/ToolExecutor.ts:50-65` — **Zero tools registered anywhere in the codebase.** All six orchestrator agents are functionally inert despite being correctly registered via `bootBrain()`. Worst kind of broken: silently green in logs, produces nothing.
- `brain/src/agents/GuardianAgent.ts` — Privacy enforcement is a no-op even if its tools existed.
- `agent/src/chat/ChatRouter.ts:7` — Agent imports browser-only brain; blocks any future server-side reuse (extension itself is fine).
- `extension/src/shared/encryption.ts:142` — Deterministic key derivation.
- `extension/src/background/messageHandler.ts:425-434` — API keys plaintext fallback.
- `extension/src/background/stats.ts:45-62` — Concurrent stats corruption.
- `cloud/deploy.sh:40-63` — `prisma db push` with no migrations.
- `cloud/src/agent/AgentController.ts:59-76` — "AI" is keyword matching; README sells a feature that doesn't exist.
- `cloud/src/index.ts` — No structured logging, error tracking, metrics.
- `cloud/` auth flow — No email verification, password reset, 2FA, or session revocation.
- `mobile/src/services/SyncService.ts` — Calls `api.recome.app`, a host that doesn't exist.

### 🟡 Maintenance / scale risk

- `extension/src/content/adapters/BaseAdapter.ts` — 1,634-line god class.
- `extension/src/background/messageHandler.ts` — 1,217-line dispatcher.
- `extension/src/background/decisionLog.ts:15` — In-memory log lost on SW restart.
- `extension/src/shared/EventBus.ts:49-53` — Silent rejection swallow.
- `cloud/` rate limiter — In-memory, not distributed.
- `cloud/` Prisma pool — Default 2, no config.
- `cloud/src/index.ts` — No SIGTERM handler.
- `brain/src/memory/MemoryService.ts` — 476-line file, mixed concerns.
- `brain/src/memory/DecayManager.ts:46-83` — No IDB transaction on concurrent decay.
- `jest.config.js:44-45` — Excludes content scripts and popup from coverage.

### 🟢 Low

- `extension/src/popup/components/Dashboard.tsx:67` — `console.error` in production.
- `docker-compose.yml:19` — Dev JWT secret as example.
- `packages/ui/` — Empty directory.

---

## 8. Recommended Reorg Plan

The current layout is **5 separate projects sharing a folder**, not a monorepo. Real monorepos use pnpm workspaces / Turborepo / Nx. The fix is straightforward but requires commitment.

### 8.1 Proposed final layout

```
recoME/
├── apps/
│   ├── extension/          ← current extension/
│   ├── web/                ← current web/
│   ├── cloud/              ← current cloud/
│   └── mobile/             ← MOVE TO graveyard until cloud is real
├── packages/
│   ├── schema/             ← keep (already well-shared)
│   ├── brain/              ← current brain/
│   ├── agent/              ← MOVE TO graveyard until chrome decoupling is done
│   └── utils/              ← keep
├── docs/
│   ├── ROADMAP.md          ← single source of truth, ≤200 lines
│   └── archive/            ← old V2/V3/V4/PHASE_*/IMPROVED_ARCHITECTURE/new-docs/old-docs/
├── graveyard/              ← agent/, mobile/, dead admin pages, unregistered brain agents
│                             (kept in git history; out of build)
├── .github/
├── pnpm-workspace.yaml     ← NEW
├── turbo.json              ← NEW (or nx.json)
├── package.json            ← root only, scripts delegate to workspaces
├── tsconfig.base.json      ← NEW, shared compiler options
└── README.md
```

### 8.2 Why this shape

- **`apps/` vs `packages/`** is the standard split. Apps are deployables (extension, web, cloud, mobile). Packages are libraries (schema, brain, agent, utils). The brain is genuinely a library used by the extension and (intended) cloud agent — `packages/` is correct.
- **`graveyard/`** is the most important folder. It's where you put things you cannot finish this quarter but don't want to lose. Out of build, out of tsconfig, but in git history. This is how you stop carrying weight.
- **`docs/archive/`** kills the three-source-of-truth problem in one move. One current doc. Everything else dated and archived.
- **pnpm workspaces + Turborepo** gives you `turbo run build` / `turbo run test` with proper task graph and caching — the right tool for this many sub-projects.

### 8.3 What is actually safe to remove (corrected)

After import-graph verification, the safe-to-move set is much smaller than the initial sketch suggested:

| Path                                                                         | Action                    | Reason                                                                                                                                                                                                                         | Safe?       |
| ---------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| `packages/ui/`                                                               | delete                    | Empty directory. No imports.                                                                                                                                                                                                   | ✅ verified |
| `web/src/app/admin/{users,flags,deployments,config,errors,audit}/`           | graveyard                 | UI shells. Only outside imports are react + next/link. **But** `web/src/app/admin/layout.tsx` and `web/src/app/admin/page.tsx` hardcode links to them — those links would 404 (compile is fine).                               | ⚠️ partial  |
| `agent/`                                                                     | **DO NOT MOVE**           | Load-bearing for the extension (7 call sites + 4 brain imports).                                                                                                                                                               | ❌ unsafe   |
| `brain/src/agents/{Guardian,Scout,Social}Agent.ts`                           | **DO NOT MOVE**           | Registered by `bootBrain()` which the extension calls. Compile error if moved without also editing `brain/src/orchestrator/index.ts:25-30`. Even then, the agents being inert is a runtime concern, not a "dead code" concern. | ❌ unsafe   |
| `brain/src/orchestrator/`                                                    | keep                      | In live extension path. Currently a no-op at the tool layer, not the orchestration layer.                                                                                                                                      | —           |
| `mobile/`                                                                    | preserved by user request | (Audit recommends graveyard; user opted to keep.)                                                                                                                                                                              | —           |
| Plan docs (V2/V3/V4, PHASE\_\*, IMPROVED_ARCHITECTURE, new-docs/, old-docs/) | preserved by user request | (Audit recommends archive; user opted to keep at root.)                                                                                                                                                                        | —           |
| `recome_interview_prep.md`, `dist/`, `dist.crx`, `dist.pem`                  | preserved by user request | —                                                                                                                                                                                                                              | —           |

**Real fix for the brain agents requires code work, not file moves:**

- Either register the missing tools (`score_content`, `query_knowledge_graph`, `price_history`, `reviews`, `alternatives`, etc.) so agents do real work, **or**
- Remove the `useTool()` indirection and have agents call their domain logic directly, **or**
- Stop calling `bootBrain()` from the extension and route the relevant message handlers to direct service calls (`recommendationEngine`, `memoryService`, etc.) instead.

Any of those is a 1–3 day task. None of it is "graveyard a file."

### 8.4 What stays and why

- `extension/` — actually shipping. Refactor in place (split BaseAdapter, messageHandler).
- `brain/` — keep, but only the parts actually used by the extension (MemoryService, KnowledgeGraph, RecommendationEngine, scoring, IntentService). Orchestrator + agents = experimental.
- `cloud/` — keep. Either finish or strip back to what's used.
- `web/` — keep landing + signup + dashboard. Graveyard the admin shells.
- `packages/schema/` + `packages/utils/` — keep. Already healthy.

---

## 9. Execution Plan (5 Weeks)

This is the minimum to make the product real. Do not add features outside this list.

### Week 1 — Truth-tell & reorg

- Move dead surfaces to `graveyard/`. Update build configs to exclude.
- Move all stale docs to `docs/archive/`. Write `docs/ROADMAP.md` (≤200 lines).
- Adopt pnpm workspaces + Turborepo. Single `turbo run build` works.
- Update README to reflect what actually exists.

### Week 2 — Close the four P0s

1. Wire implicit signals into `KnowledgeGraph` (not just `MemoryStore`). Research Card non-empty.
2. Add `'reddit'` to `IMPLICIT_SIGNAL` union; add a test that asserts platform attribution.
3. Write **one Playwright test** that drives a real browser through YouTube → Reddit → Amazon and asserts Research Card content. This test is the product spec.
4. Replace the web dashboard placeholder with the data the test verifies.

### Week 3 — De-risk the extension

- Split `BaseAdapter` into ≤300-line modules (DOM observer, scoring, decisions, feedback overlay, selector health).
- Split `messageHandler` by domain (auth, sync, scoring, import, twin, billing) using a router pattern.
- Move stats from `storage.local` read-modify-write to IDB transactions.
- Fix encryption: random salt at first run stored in `storage.local`, optional user passphrase.
- One helper for every `chrome.runtime.sendMessage`/`tabs.sendMessage` with mandatory error handling. Replace all call sites.

### Week 4 — Cloud honesty decision

**Pick one, irreversibly:**

- **Option A — Commit to SaaS:** Add Prisma migrations directory, pino structured logging, Sentry, Upstash Redis for distributed rate limiting, SIGTERM handler, email verification, password reset endpoint. Three weeks of work.
- **Option B — Lean local-only:** Remove `recome-api.fly.dev` from manifest. Delete cloud/. Keep optional sync via user-provided server URL. Update marketing to match.

The current dual story is the worst of both worlds.

### Week 5 — Test what ships

- Remove the `extension/src/content` and `extension/src/popup` exclusions from `jest.config.js`.
- Three Playwright flows: feed-filter, signal-ingestion, research-card-render.
- CI gate: those three must pass on every commit.
- Update `CHANGELOG.md`.

---

## 10. What I Would NOT Do

- Build more agents (Scout, Social, Guardian — graveyard them).
- Write a V5 plan.
- Ship the mobile app.
- Add Stripe tiers.
- Scaffold more admin pages.
- Refactor `brain/orchestrator/`.
- Add observability to anything that isn't proven needed yet.

None of those move the product closer to a verified user benefit.

---

## 11. One-Line Verdicts

- **`extension/`** — Real, works, fragile. Refactor before scaling.
- **`brain/`** — 95% heuristics dressed as multi-agent AI. Half the agents can't execute. Strip to what's used.
- **`cloud/`** — Functional MVP. Unfit for production until logging, migrations, distributed rate limiting, email verification exist.
- **`web/`** — Beautiful landing + non-functional dashboard. Either build the backend or remove the dashboard. The dual story is a trust deficit.
- **`mobile/`** — Vaporware against a non-existent host. Graveyard.
- **`agent/`** — Architecturally broken. Graveyard until brain is decoupled from chrome.
- **`packages/`** — Schema is healthy. UI is empty. Utils are fine.
- **`docs/`** — Three competing sources of truth. Archive everything; keep one ROADMAP.

The product can become real. The gap is mostly in what you've chosen not to finish — not in what you don't know how to build.

---

_End of audit._
