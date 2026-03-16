# RecoMe Overview

## Product Thesis

RecoMe should be built as one product with three coordinated parts:
- RecoMe Extension
- RecoMe Brain
- RecoMe Agent

The extension captures intent and reshapes recommendations in the browser. The brain stores durable preference memory, scoring logic, and explainability. The agent becomes a recommendation and planning companion that uses the same preference layer.

## Core Positioning

RecoMe is a consumer-controlled recommendation intelligence layer.

Its job is to help users:
- express explicit intent
- reduce unwanted recommendations
- improve shopping relevance
- connect content behavior and commerce behavior over time
- understand why something is being recommended

## Build Order

### Phase Order
1. Extension utility first
2. Shared brain second
3. Agent companion after trust is earned

### Why this order
- The extension creates immediate user value on real pages.
- The extension is the best place to capture explicit signals.
- The brain should be designed early but can begin as local-first data structures.
- The agent should not be forced into the extension runtime too early.
- Autonomous purchase behavior is not appropriate for v1.

## Product Boundaries

### RecoMe Extension
Responsibilities:
- Run on supported sites in the browser
- Extract products, brands, sellers, and contextual entities from pages
- Show overlays, badges, and explanation UI
- Capture explicit user intent
- Apply local recommendation adjustments in real time

Should not do in v1:
- act as a full autonomous browser automation system
- perform checkout automatically
- host heavy agent orchestration logic

### RecoMe Brain
Responsibilities:
- Maintain the preference graph
- Store user intents and contexts
- Score offers and recommendation candidates
- Apply policies and time horizons
- Generate short explanations for surfaced decisions
- Support import/export and future encrypted sync

Should not do in v1:
- depend on a complex cloud backend for the core MVP
- require cross-device sync to prove value

### RecoMe Agent
Responsibilities:
- answer recommendation questions
- compare options across retailers
- explain best matches
- save watchlists and future intents
- hand users back to extension-aware browsing contexts

Should not do in v1:
- autonomously purchase
- own the primary recommendation UX
- replace extension overlays for in-page interventions

## MVP Scope

### MVP Goal
Prove that RecoMe can own preference memory and improve shopping recommendations on one e-commerce surface.

### Recommended MVP Surface
- Amazon-first browsing workflow

### MVP Capabilities
- product and PDP extraction
- explicit intent capture
- confidence scoring v1
- badge and action UI
- visible one-sentence explanations
- local-first preference graph

## Key Guardrails

### Must do now
- Keep the extension useful on its own
- Make intent explicit and easy to edit
- Keep explanations short and visible
- Design a stable shared schema early

### Do not do yet
- Do not make the extension a full automation runtime
- Do not start with autonomous purchasing
- Do not mix heavy agent logic into page overlays

## North Star

RecoMe should become the personal preference layer for the algorithmic internet by keeping one memory system across what the user watches, reads, and buys.
