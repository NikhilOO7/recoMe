# RecoMe Markdown Spec Package

This package converts the current RecoMe architecture and product direction into working Markdown specs.

## Files

- `00_overview.md` — product thesis, scope, build order, and guardrails
- `01_architecture.md` — system architecture, runtime boundaries, and core interfaces
- `02_extension_spec.md` — browser extension product and technical spec
- `03_brain_spec.md` — shared preference graph, scoring, policy, and explanation logic
- `04_agent_spec.md` — agent product boundary, workflows, and safety model
- `05_flows_and_diagrams.md` — key product and system flows with Mermaid diagrams
- `06_domain_model.md` — shared domain model and API contracts
- `07_execution_plan.md` — milestone plan, workstreams, and metrics
- `08_backlog.md` — initial backlog and acceptance criteria

## Recommended Next Steps

1. Convert `08_backlog.md` into engineering tickets
2. Turn `06_domain_model.md` into a shared TypeScript package
3. Build the Chrome MV3 extension shell first
4. Implement Amazon search and PDP adapters
5. Add the local-first brain behind typed message contracts
6. Delay agent implementation until the extension loop is useful and stable
