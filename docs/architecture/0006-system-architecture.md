# 0006 — System Architecture

**Status:** **Superseded by [0015 HLD](0015-hld.md)** (2026-05-17)
**Why this file still exists:** seven other docs link to `0006-system-architecture.md` and one to `#9`. A stub keeps those links resolving rather than rotting. The full 388-line original lives in git history.

---

## Where the content moved

| What you were looking for      | Now lives in                                                                                                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Component map / container view | [0015 HLD §2](0015-hld.md#2-container-view) + [0015 §6 Component-level views per container](0015-hld.md#6-component-level-views-per-container)                                                 |
| Data flow: capture path        | [0015 HLD §3](0015-hld.md#3-the-four-key-data-flows) + [0016 LLD §12 sequence diagrams](0016-lld.md#12-sequence-diagrams-for-the-four-flows)                                                   |
| Data flow: retrieval (trail)   | [0015 HLD §3](0015-hld.md#3-the-four-key-data-flows) + [0016 LLD §12](0016-lld.md#12-sequence-diagrams-for-the-four-flows)                                                                     |
| Data flow: bulk import         | [0015 HLD §3](0015-hld.md#3-the-four-key-data-flows) + [0016 LLD §12](0016-lld.md#12-sequence-diagrams-for-the-four-flows)                                                                     |
| Data flow: chat                | **Superseded** — chat replaced by active agents per [ADR-0012](0012-active-agents-and-personality-mirror.md); see [0015 HLD §5 active agents subsystem](0015-hld.md#5-active-agents-subsystem) |
| Deployment topology            | [0015 HLD §9](0015-hld.md#9-deployment-topology)                                                                                                                                               |
| Singletons & lifecycle         | [0016 LLD §2.3](0016-lld.md#23-public-api-cross-module-imports) + [0016 LLD §9.1](0016-lld.md#9-cross-cutting-modules)                                                                         |
| Environments                   | [0015 HLD §9.1](0015-hld.md#9-deployment-topology)                                                                                                                                             |
| Backups & DR                   | See "Backups & DR" snippet below + [0010 security/privacy/ops](0010-security-privacy-ops.md)                                                                                                   |
| Open architectural decisions   | [0015 HLD §11](0015-hld.md#11-open-architectural-questions)                                                                                                                                    |

---

## Backups & DR (preserved verbatim — the only operational content the HLD doesn't fully restate)

External docs link to `0006#9`. Anchor preserved.

### 9. Backups & DR

| Store                  | Backup strategy                                 | RPO                     | RTO |
| ---------------------- | ----------------------------------------------- | ----------------------- | --- |
| Postgres (Neon)        | Continuous WAL + PITR (Neon native)             | 1m                      | 15m |
| Neo4j AuraDB           | Automatic daily backup + 7-day PITR (paid tier) | 24h on free, 1h on paid | 1h  |
| Qdrant Cloud           | Snapshot daily to R2                            | 24h                     | 2h  |
| Redis                  | None — derived state only                       | n/a                     | n/a |
| R2 bulk-import uploads | Versioned objects, 90-day retention             | —                       | —   |

DR drill cadence: **quarterly**. Documented in [0010 §runbooks](0010-security-privacy-ops.md).

---

_This file should not grow. New architecture content belongs in 0015 (HLD) or 0016 (LLD)._
