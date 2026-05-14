# Archive

Files here are **not the current source of truth**. They are preserved for
historical context — to explain how the project arrived at its current
shape, and to avoid losing the thinking behind decisions that have since
moved on.

## Policy

| Category              | What goes here                                                                             | What does NOT                                         |
| --------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `plans/`              | Vision docs, multi-version roadmaps, execution plans that were partially or never executed | The current ADRs (those live in `docs/architecture/`) |
| `2026-03-historical/` | Early architectural sketches, mood docs, prompt experiments                                | Current source-of-truth architecture (lives in ADRs)  |
| `2026-03-v1-spec/`    | The numbered v1.0 spec that informed the initial extension build                           | Specs for the current intelligence stack              |

If you find yourself reaching for a file here to answer a question about
_today's_ state of the project, that's the signal to either (a) check
whether `docs/audits/` or `docs/architecture/` has the current answer,
or (b) promote that part of the archived doc into a new ADR.

## Why archive instead of delete?

- **Git already keeps history.** True, but `git log` is hostile to
  discovery. A reader new to the codebase doesn't know what file used
  to exist or when it was retired.
- **The "why" outlasts the "what".** A V2 plan that didn't ship still
  encodes a problem statement and tradeoff analysis that may matter for
  V5.
- **Audit trail.** When the project pivots, future-you needs to be able
  to defend the pivot to investors / hires / yourself.

## When to actually delete

- The doc is so far out of date that anyone reading it would be misled,
  and the historical lesson is captured elsewhere.
- The doc contains secrets or PII that should not be in the repo
  history (in which case, also rewrite history).
- Legal asks you to remove it.

None of those apply to anything currently in this directory.

## Contents

### `plans/`

| File                          | Date written | What it is                                               |
| ----------------------------- | ------------ | -------------------------------------------------------- |
| `V2_PLAN.md`                  | ~Mar 2026    | Vision doc for V2 of the product.                        |
| `V3_PLAN.md`                  | ~Mar 2026    | Vision doc for V3.                                       |
| `V4_PLAN.md`                  | ~Mar 2026    | Vision doc for V4.                                       |
| `IMPROVED_ARCHITECTURE.md`    | ~Mar 2026    | Architectural reimagining; overlaps with V-plans.        |
| `PHASE_EXECUTION_PLAN.md`     | Apr 7 2026   | Phase 0 execution plan; DoD checkboxes mostly unchecked. |
| `PHASE_EXECUTION_TICKETS.csv` | Apr 7 2026   | Companion ticket export.                                 |

The current "what are we actually building right now" answer lives in
`docs/architecture/` (ADRs) and `docs/audits/2026-05-14-principal-audit.md`,
not here.

### `2026-03-historical/`

Early experimental docs from the first three weeks of the project — when
the product was still being shaped. Includes the original Knowledge Graph
sketch, the "Mnemosyne" naming era, product-design mood doc, and several
Claude Code prompt files.

### `2026-03-v1-spec/`

The numbered v1.0 execution spec (`00_overview.md` through `08_backlog.md`
plus a manual QA checklist). Informed the initial extension build but
predates the cloud + intelligence stack.
