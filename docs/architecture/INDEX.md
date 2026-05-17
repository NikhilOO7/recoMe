# Architecture Documents — Reading Order

Ordered for a new engineer joining the team. ADRs (0001–0003, 0012, 0013)
are **decisions** — short, dated, immutable except for `Status` updates.
Plans (0004–0011, 0014) are **living documents** — kept current as the
product evolves.

**Fast path for a new joiner who needs to pitch the product:** read
0013 → 0014 → 0003 → 0012. Forty minutes. That's everything you need
to explain what we are and why we win.

**Fast path for a new joiner who needs to write code:** read
0001 → 0005 → 0006 → 0009. Then dip into 0007 for what's planned.

| #    | Doc                                                                                | What it is                                                                                                                                          | Read when                                         |
| ---- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 0001 | [Graph + Vector Stack](0001-graph-vector-stack.md)                                 | ADR — why Neo4j + Qdrant + OpenAI embeddings                                                                                                        | First (engineering). Justifies the foundation.    |
| 0002 | [Deployment Notes](0002-deployment-notes.md)                                       | ADR — how to stand up Neo4j AuraDB + Qdrant Cloud locally and in prod                                                                               | Before touching infra.                            |
| 0003 | [Pivot to Web-First + IaaS](0003-pivot-web-first-with-iaas.md)                     | ADR — strategic re-positioning. Why we're not extension-led. _Phase-2 chat surface superseded by ADR-0012._                                         | Before product work.                              |
| 0004 | [Production Roadmap](0004-production-roadmap.md)                                   | Phased plan from now → 12 months, KPIs, milestones, kill criteria                                                                                   | Quarterly planning.                               |
| 0005 | [Tech Stack](0005-tech-stack.md)                                                   | Definitive choices per layer with rationale and alternatives considered                                                                             | Before adding a dependency.                       |
| 0006 | [System Architecture](0006-system-architecture.md)                                 | Components, data flow, deployment topology                                                                                                          | Onboarding + before non-trivial changes.          |
| 0007 | [Feature Catalog](0007-feature-catalog.md)                                         | Every feature with user story, acceptance criteria, effort estimate                                                                                 | Sprint planning.                                  |
| 0008 | [Workflows & Personas](0008-workflows-and-personas.md)                             | End-to-end user journeys per persona                                                                                                                | UX design and integration work.                   |
| 0009 | [Data Model](0009-data-model.md)                                                   | Neo4j graph schema, Postgres schema, Qdrant layout, multi-tenant isolation                                                                          | Before schema changes.                            |
| 0010 | [Security, Privacy & Operations](0010-security-privacy-ops.md)                     | Threat model, GDPR, SLOs, runbooks, on-call                                                                                                         | Before deploy + on incidents.                     |
| 0011 | [Cost, Scale & IaaS GTM](0011-cost-and-iaas-gtm.md)                                | Unit economics, capacity model, IaaS pricing & GTM                                                                                                  | Pricing changes + investor conversations.         |
| 0012 | [Active Agents + Personality Mirror](0012-active-agents-and-personality-mirror.md) | ADR — Phase-2 pivot from chat UI to background agents. Mind Map + Personality Mirror surfaces. Post-Perplexity-Memory positioning.                  | Before Phase-2 planning + any agent work.         |
| 0013 | [Competitive Positioning](0013-competitive-positioning.md)                         | ADR — battle cards vs Perplexity / Anthropic / Glean / Karma / Limitless (May 2026), three durable moats, category definition, what we'll never say | First (strategic). Before any pitch, hire, or PR. |
| 0014 | [Unique Product Surfaces](0014-unique-product-surfaces.md)                         | Living spec — F-401..F-408. The seven surfaces that are structurally unique to us and why. Maps each to existing code.                              | Before scoping any feature.                       |

## Conventions

- **ADRs are append-only.** A decision changes by writing a new ADR that
  supersedes the old one (mark the old one `Superseded by ADR-NNNN`).
- **Plans (0004+) are versioned by git.** Update in place; commit history
  is the changelog.
- **Every change to scope, dates, or KPIs goes in 0004**. Don't sprinkle
  status updates across docs — they go stale.
- **Numbers must be sourced or labeled as estimate.** No round numbers
  pulled from intuition without that label.
