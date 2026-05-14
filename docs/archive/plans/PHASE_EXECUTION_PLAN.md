# RecoMe Phase Execution Plan

> Created: 2026-04-07
> Goal: Ship Phase 0 beta, then Phase 1 beta
> Principle: Ship a working thesis, not a perfect product

---

## Phase 0 Definition of Done

Phase 0 is done when ALL of the following are true:

- [ ] A new user installs the extension, browses YouTube headphone reviews for 5 minutes, reads 2 Reddit r/headphones threads, then visits an Amazon headphone product page — and sees a "Research Detected" card with YouTube and Reddit signals
- [ ] The Research Card shows at least 1 matched topic with correct platform attribution
- [ ] Reddit signals appear with `platform: 'reddit'` (not `'unknown'`)
- [ ] Extension icon click toggles overlay on supported pages, opens web app on unsupported pages
- [ ] No dead popup code ships in the build
- [ ] Extension description matches the thesis ("research connected" not "feed control")
- [ ] OAuth callback flow works end-to-end: web app signup → callback.html → extension authenticated
- [ ] Non-core platforms do not dominate the user-facing experience
- [ ] One developer has manually completed the full thesis flow start-to-finish

---

## Phase 1 Definition of Done

Phase 1 is done when ALL of the following are true:

- [ ] Everything in Phase 0 Definition of Done
- [ ] Web app dashboard shows real research topics (not placeholder text)
- [ ] At least 5 automated tests covering the critical signal pipeline
- [ ] Cloud backend builds without type errors
- [ ] Admin panel accessible by at least one SUPER_ADMIN account
- [ ] Privacy controls are interactive (export, delete) and prominently accessible
- [ ] Feature flags fetched by extension from server (at least 1 flag controls behavior)
- [ ] Plans/pricing page exists (even if Stripe checkout is stub)
- [ ] Extension has been used by the developer for 3+ days without crashes or data loss
- [ ] A non-developer can understand the product within 60 seconds of landing page + install

---

## Phase 0 Execution

### Sprint 0A — Fix the Data Pipeline (BLOCKS EVERYTHING)

These must be done first. Everything else depends on signals reaching the graph.

| Order | Ticket | Task                                                  | Size | Depends On               | Parallelizable           |
| ----- | ------ | ----------------------------------------------------- | ---- | ------------------------ | ------------------------ |
| 0A.1  | T-002  | Add `'reddit'` to IMPLICIT_SIGNAL platform union      | S    | —                        | Yes                      |
| 0A.2  | T-001  | Bridge `recordImplicitSignal` → KnowledgeGraph writes | M    | —                        | Yes (parallel with 0A.1) |
| 0A.3  | T-003  | Improve Research Card topic matching                  | M    | T-001 (needs graph data) | No — must follow T-001   |

**Sprint 0A delivery**: After completing these 3 tickets, manually test the thesis flow:

1. Browse YouTube "best noise cancelling headphones 2026" — dwell 30+ seconds
2. Browse Reddit r/headphones "Sony XM5 vs Bose 700" thread — scroll through
3. Visit Amazon "Sony WH-1000XM5" product page
4. **Expected**: Research Card appears with "headphones" topic, YouTube + Reddit platform badges

If the card does NOT appear, debug before moving to Sprint 0B.

### Sprint 0B — Clean Up and Align (CAN PARALLELIZE)

These are independent of each other. Do them all in parallel.

| Order | Ticket | Task                                            | Size | Depends On | Parallelizable |
| ----- | ------ | ----------------------------------------------- | ---- | ---------- | -------------- |
| 0B.1  | T-004  | Remove dead popup from webpack build            | S    | —          | Yes            |
| 0B.2  | T-005  | Update manifest description to thesis messaging | S    | —          | Yes            |
| 0B.3  | T-006  | Test OAuth callback flow end-to-end             | S    | —          | Yes            |
| 0B.4  | NEW    | Beta-label non-core platforms in overlay UI     | S    | —          | Yes            |

**Sprint 0B delivery**: Extension builds clean without popup, description matches thesis, OAuth works, non-core platforms labeled.

### Sprint 0B.4 Detail: Beta-label non-core platforms

This is not a full ticket from the audit but is needed for Phase 0 DoD. Quick implementation:

- In `SettingsPanel.tsx` platform toggles, add a "(Beta)" label after Walmart, eBay, X, Facebook, Instagram, LinkedIn, TikTok, Indeed, Glassdoor, Udemy, Coursera, EdX
- In the overlay Research Card and Dashboard, surface Amazon/YouTube/Reddit signals prominently, dim or deprioritize others
- In web app extension page, reorder platforms: Amazon, YouTube, Reddit first
- **Size**: S — cosmetic changes only

### Sprint 0C — Validate (GATE)

| Order | Task                                                                | Size | Depends On |
| ----- | ------------------------------------------------------------------- | ---- | ---------- |
| 0C.1  | Developer completes full thesis flow manually                       | —    | 0A + 0B    |
| 0C.2  | Load extension on 3 real Amazon product pages, verify Research Card | —    | 0C.1       |
| 0C.3  | Verify overlay toggle works on supported + unsupported pages        | —    | 0B.1       |
| 0C.4  | Verify web app signup → extension auth callback works               | —    | 0B.3       |

**Gate decision**: If 0C passes → Phase 0 is DONE. Push to Chrome Web Store, invite 5-10 testers.

---

## Phase 1 Execution

### Sprint 1A — Foundation (ORDERED)

| Order | Ticket | Task                                        | Size | Depends On          | Parallelizable            |
| ----- | ------ | ------------------------------------------- | ---- | ------------------- | ------------------------- |
| 1A.1  | T-013  | Sign up with GitHub, promote to SUPER_ADMIN | S    | —                   | Yes                       |
| 1A.2  | T-009  | Fix cloud TypeScript build errors           | M    | —                   | Yes (parallel with 1A.1)  |
| 1A.3  | T-008  | Add 5 critical path automated tests         | L    | T-001, T-002, T-003 | No — needs fixed pipeline |

### Sprint 1B — User-Facing Quality (CAN PARALLELIZE)

| Order | Ticket | Task                                              | Size | Depends On               | Parallelizable |
| ----- | ------ | ------------------------------------------------- | ---- | ------------------------ | -------------- |
| 1B.1  | T-007  | Build real web app dashboard with research topics | L    | T-001 (needs graph data) | Yes            |
| 1B.2  | T-012  | Move PrivacyReport to be prominently accessible   | S    | T-004 (popup removed)    | Yes            |
| 1B.3  | T-011  | Wire feature flags from server to extension       | M    | T-013 (needs admin)      | Yes            |
| 1B.4  | T-010  | Build plans/pricing page                          | M    | —                        | Yes            |

### Sprint 1C — Polish and Validate (GATE)

| Order | Task                                                                    | Size | Depends On |
| ----- | ----------------------------------------------------------------------- | ---- | ---------- |
| 1C.1  | Developer uses extension for 3+ days with real browsing                 | —    | 1A + 1B    |
| 1C.2  | Verify dashboard shows real research data                               | —    | 1B.1       |
| 1C.3  | Verify admin panel is functional with real data                         | —    | 1A.1       |
| 1C.4  | Ask 1 non-developer to try the product and narrate what they understand | —    | All        |

**Gate decision**: If 1C passes → Phase 1 is DONE. Invite 200 beta users.

---

## What to Hide / Beta-Label / Postpone

### Hide from Phase 0 beta users

- DevTools panel (already removed from build)
- Admin panel (separate route, RBAC-gated)
- Taste Twin network (exists but too early)
- Weekly digest notifications (untested)

### Beta-label in Phase 0

- Walmart, eBay, X, Facebook, Instagram, LinkedIn adapters — add "(Beta)" tag in settings
- Agent Chat — functional but not thesis-critical
- Commerce features (watchlist, price tracking) — nice-to-have, not thesis

### Postpone to Phase 2+

- Facebook OAuth (needs business verification)
- Extension demo page on web app
- Config schema versioning
- Multi-device sync dashboard
- Plans/Stripe checkout (stub is fine for Phase 1)

---

## Dependency Graph

```
T-002 (Reddit platform fix) ──┐
                               ├──> Sprint 0A validation ──> Sprint 0B (parallel) ──> Phase 0 DONE
T-001 (Graph bridge) ─────────┤
         │                     │
         └──> T-003 (Topic matching) ──┘

Phase 0 DONE ──> T-008 (Tests) ──> T-007 (Dashboard) ──┐
                                                         ├──> Phase 1 DONE
T-013 (Admin signup) ──> T-011 (Feature flags) ─────────┤
T-009 (Cloud TSC fix) ──────────────────────────────────┤
T-010 (Plans page) ─────────────────────────────────────┤
T-012 (PrivacyReport move) ─────────────────────────────┘
```

---

## Time Estimates

| Sprint                    | Estimated Hours | Calendar Days (solo)        |
| ------------------------- | --------------- | --------------------------- |
| Sprint 0A (data pipeline) | 8-12h           | 1-2 days                    |
| Sprint 0B (cleanup)       | 3-4h            | 0.5 days                    |
| Sprint 0C (validation)    | 2h              | 0.5 days                    |
| **Phase 0 Total**         | **13-18h**      | **2-3 days**                |
| Sprint 1A (foundation)    | 12-16h          | 2-3 days                    |
| Sprint 1B (user-facing)   | 16-24h          | 3-4 days                    |
| Sprint 1C (validation)    | 4-8h            | 3 days (includes soak time) |
| **Phase 1 Total**         | **32-48h**      | **8-10 days**               |
| **Total to Phase 1 Beta** | **45-66h**      | **10-13 days**              |

---

## Risk Register

| Risk                                                                 | Likelihood | Impact | Mitigation                                                         |
| -------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------ |
| Graph bridge creates too many entities (noise)                       | Medium     | High   | Add confidence threshold — only write entities with strength > 0.3 |
| Research Card still empty after fix (matching too strict)            | Medium     | High   | Fall back to MemoryStore query if graph returns 0 matches          |
| OAuth callback blocked by CORS                                       | Low        | High   | Test early in Sprint 0B.3; fix CORS headers if needed              |
| DwellTracker doesn't fire on Reddit (new Reddit uses web components) | Medium     | Medium | Manual test on reddit.com; fix selectors if needed                 |
| Non-developers can't understand the product                          | Medium     | Medium | Iterate on onboarding copy after Phase 0 feedback                  |

---

## Decision: What NOT to Build for Beta

To ship fast, explicitly do NOT build:

- Mobile app
- SDK
- Agents standalone API
- Real Stripe checkout (stub/free-only is fine)
- Multi-device sync dashboard
- A/B testing infrastructure
- Analytics/telemetry beyond admin error logs
- Performance benchmarks
- Cross-browser testing (Chrome-only for beta)
- Accessibility audit (address post-beta)
