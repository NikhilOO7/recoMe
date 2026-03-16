# RecoMe Execution Plan

## Goal

Ship the smallest loop that proves RecoMe can own preference memory before expanding into broader commerce and content surfaces.

## Recommended Sequence

### Milestone 1
Amazon-first extension MVP

### Milestone 2
Shared brain hardening

### Milestone 3
RecoMe Agent MVP

### Milestone 4
Cross-platform and sync expansion

## Milestone Details

## Milestone 1: Amazon-first Extension MVP

### Outcomes
- RecoMe works on Amazon search and product pages
- users can express explicit intent in-page
- recommendation badges and explanations render in real time
- preference memory persists locally

### Scope
- Amazon adapter
- search results extraction
- PDP extraction
- intent capture model
- confidence scoring v1
- badge and action UI
- local IndexedDB storage

### Exit Criteria
- at least five intent types work end to end
- badges appear on extracted products
- explanations are visible and reversible
- memory affects future page states

## Milestone 2: Shared Brain Hardening

### Outcomes
- stable shared schema
- stronger canonicalization and graph logic
- brand and seller memory
- context modes are available

### Scope
- shared schema package
- preference graph repositories
- seller and brand edges
- budget and quality modes
- exportable profile bundle

### Exit Criteria
- extension uses shared schema package
- decisions are reproducible from stored inputs
- profile export works locally

## Milestone 3: RecoMe Agent MVP

### Outcomes
- users can ask for recommendations and comparisons
- agent uses graph memory rather than generic replies
- watchlists are saved and reused

### Scope
- ask-and-rank interface
- compare workflow
- watchlists
- Walmart integration if bandwidth exists
- explainability v2

### Exit Criteria
- agent can rank candidate sets
- explanations reference user preferences correctly
- handoff into extension-aware browsing works

## Milestone 4: Cross-Platform and Sync Expansion

### Outcomes
- more surfaces supported
- sync becomes optional
- content-commerce bridge starts to exist

### Scope
- eBay integration
- YouTube bridge
- encrypted sync
- cross-platform recommendation filters
- guarded action permissions

### Exit Criteria
- profile portability works across devices or exports
- at least one content surface is integrated
- action permissions are explicit and constrained

## Engineering Workstreams

### Workstream A: Extraction and Adapters
Tasks:
- Amazon search adapter
- Amazon PDP adapter
- selector resiliency tooling
- extraction test fixtures

### Workstream B: Local Brain and Storage
Tasks:
- IndexedDB repositories
- entity normalization
- graph edge storage
- score computation service
- explanation generator

### Workstream C: UI and Interaction
Tasks:
- badge system
- explanation popovers
- action tray
- popup dashboard
- preference editing surface

### Workstream D: Shared Contracts
Tasks:
- TypeScript schemas
- message contracts
- domain package publishing
- migration versioning

### Workstream E: Agent
Tasks:
- query UI
- compare-and-rank pipeline
- watchlists
- open-in-extension handoff

## Suggested Sprint Breakdown

### Sprint 1
- Chrome extension shell
- Amazon search adapter prototype
- extraction pipeline v1
- local storage foundation

### Sprint 2
- badge rendering
- basic scoring v1
- explanation templates
- intent actions on search cards

### Sprint 3
- PDP support
- already bought and not interested persistence
- popup UI
- context settings

### Sprint 4
- preference graph refactor
- brand and seller memory
- shared schema package
- export/import bundle

### Sprint 5
- agent query surface
- compare workflow
- watchlists
- extension handoff

## Key Risks

### DOM fragility
E-commerce DOMs change often.
Mitigation:
- adapter isolation
- extraction tests
- fallback selectors

### Overfitting weak signals
Single events can distort future recommendations.
Mitigation:
- policy decay
- confidence thresholds
- explicit user reversal paths

### Scope creep into automation
The product can drift into a full agent browser runtime too early.
Mitigation:
- keep checkout and automation out of MVP
- define non-goals in every milestone

### Entity resolution quality
Products across pages and retailers may not canonicalize cleanly.
Mitigation:
- begin with site-local memory
- use confidence fields
- avoid pretending weak matches are exact

## Success Metrics

### Leading metrics
- badge render rate on eligible product cards
- intent submission rate
- explanation open rate
- repeat usage on supported surfaces
- reversal rate after intent actions

### Product quality metrics
- extraction success rate
- scoring latency
- percentage of visible recommendations with valid explanations
- percentage of recommendation changes that users keep versus revert

### Strategic metrics
- percentage of sessions with explicit preference signals
- number of durable preference edges created per active user
- percentage of future recommendations influenced by prior memory
