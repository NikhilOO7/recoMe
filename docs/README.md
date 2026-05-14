# RecoMe Documentation

> Single source of truth lives here. Anything not in this directory is either
> source code, a root-level convention file (`README.md`, `LICENSE`,
> `CHANGELOG.md`), or personal notes (`recome_interview_prep.md`).

## Layout

```
docs/
├── architecture/       Active ADRs — current and forward-looking
├── audits/             Dated, point-in-time critical analyses
└── archive/            Superseded plans + historical context; not current
```

## What to read first

| If you want to…                                               | Read                                                                               |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Understand the current production stack                       | [architecture/0001-graph-vector-stack.md](architecture/0001-graph-vector-stack.md) |
| Stand up the cloud locally or deploy it                       | [architecture/0002-deployment-notes.md](architecture/0002-deployment-notes.md)     |
| Get the honest state of the codebase                          | [audits/2026-05-14-principal-audit.md](audits/2026-05-14-principal-audit.md)       |
| See what the April 7 self-audit flagged (most P0s still open) | [audits/2026-04-07-phase-audit/](audits/2026-04-07-phase-audit/)                   |

## Architecture Decision Records (ADRs)

Numbered, dated, immutable once accepted. New decisions get a new ADR — we
do not edit old ones in place. Status field tracks lifecycle
(`Proposed` → `Accepted` → `Superseded by NNNN`).

- [0001 — Knowledge Graph + Vector Stack](architecture/0001-graph-vector-stack.md)
  Neo4j (graph) + Qdrant (vector) + OpenAI embeddings; hybrid local+cloud
  topology; privacy-first opt-in; GDPR delete path.
- [0002 — Intelligence Stack Deployment Notes](architecture/0002-deployment-notes.md)
  Operator runbook for AuraDB + Qdrant Cloud + OpenAI; migration strategy;
  failure modes; cost ceiling.

## Audits

- [2026-05-14 Principal Audit](audits/2026-05-14-principal-audit.md) —
  full-codebase critical review covering scope/execution inversion, module
  health, the still-open P0s, the empty `ToolExecutor`, test coverage theatre,
  and a corrected reorg plan. **Includes a corrections log** for two errors
  in the initial pass.
- [2026-04-07 Phase Audit](audits/2026-04-07-phase-audit/) — the self-audit
  that identified the four P0-CRITICAL items (Research Card empty, Reddit
  missing from `IMPLICIT_SIGNAL`, no E2E thesis test, web dashboard
  placeholder). All four remain open as of 2026-05-14.

## Archive

`archive/` holds documents that informed the project but are not the
current source of truth. They are kept for context, not guidance.

- `archive/plans/` — V2/V3/V4 vision docs, IMPROVED*ARCHITECTURE,
  PHASE_EXECUTION*\* — aspirational planning artifacts.
- `archive/2026-03-historical/` — early architectural sketches and
  experimental documents (formerly `old-docs/`).
- `archive/2026-03-v1-spec/` — the numbered v1.0 execution spec
  (formerly `new-docs/`).

See [archive/README.md](archive/README.md) for the policy on what gets
archived vs deleted.

## How to add docs

- **New architectural decision** → write `architecture/NNNN-slug.md`.
  Number is one more than the previous ADR. Don't edit accepted ADRs;
  supersede them with a new one.
- **New audit / critical review** → write `audits/YYYY-MM-DD-slug.md`.
  Filename leads with the date so chronological sort is the right
  default.
- **Sub-project notes** (extension/, brain/, cloud/, etc.) stay
  inside that sub-project as `CLAUDE.md` or a local `README.md`.
- **Personal notes / interview prep** → keep out of `docs/`. They
  belong at the repo root if anywhere, or outside the repo.

## What does **not** belong here

- API reference (auto-generated; not yet wired)
- User-facing product docs (live on the marketing site / Chrome Web Store)
- Runtime config (`.env.example`, `docker-compose.yml`) — lives next to
  the code it configures
