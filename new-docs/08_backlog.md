# RecoMe Initial Backlog

## Epic 1: Browser Extension Foundation

### Story 1.1
Set up Chrome Manifest V3 extension shell.

Acceptance criteria:
- extension loads in developer mode
- background worker starts successfully
- content scripts can be injected on supported pages
- popup UI shell renders

### Story 1.2
Create Amazon site adapter registry and page detection.

Acceptance criteria:
- adapter detects Amazon search pages
- adapter detects Amazon product pages
- unsupported pages fall back safely

### Story 1.3
Implement search results extraction pipeline.

Acceptance criteria:
- visible cards are parsed into candidate entities
- title, price, and url are captured when available
- extraction failures do not crash page UI

### Story 1.4
Implement product detail page extraction pipeline.

Acceptance criteria:
- product, brand, seller, and offer fields are extracted when present
- page context is generated correctly
- structured payload is sent to background worker

## Epic 2: Preference Memory and Brain MVP

### Story 2.1
Implement IndexedDB repositories for core domain objects.

Acceptance criteria:
- intents can be stored and retrieved
- decisions can be stored and retrieved
- products, brands, sellers, and offers can be persisted

### Story 2.2
Implement intent normalization service.

Acceptance criteria:
- product, brand, seller, and category scopes are supported
- normalized entity IDs are returned
- intent expiration can be attached

### Story 2.3
Implement scoring engine v1.

Acceptance criteria:
- score request accepts page context and candidates
- each candidate returns score, decision, confidence, and explanation
- decisions map to boost, neutral, caution, or suppress

### Story 2.4
Implement explanation engine v1.

Acceptance criteria:
- every non-neutral decision has a short explanation
- explanation text fits inline UI usage
- explanation factors come from actual decision inputs

## Epic 3: In-Page User Experience

### Story 3.1
Render badges on supported product cards.

Acceptance criteria:
- eligible cards show neutral or scored badge states
- badge styles are accessible
- badges do not block native shopping interactions

### Story 3.2
Implement action tray for intent capture.

Acceptance criteria:
- user can click Interested
- user can click Not interested
- user can click Already bought
- user can click Researching
- actions update UI state immediately

### Story 3.3
Implement explanation popovers.

Acceptance criteria:
- Why this opens a short explanation
- explanation text remains visible and readable
- popover closes safely on outside click

### Story 3.4
Implement intent reversal and edit flow.

Acceptance criteria:
- user can undo recent intent
- revised intent replaces or expires previous state correctly
- affected badges update after reversal

## Epic 4: Shared Contracts and Schema

### Story 4.1
Create shared schema package.

Acceptance criteria:
- extension and brain import the same type definitions
- schema package includes migrations or versioning support
- core entities are documented

### Story 4.2
Create typed message contracts.

Acceptance criteria:
- content-to-background messages are typed
- background-to-overlay messages are typed
- invalid messages fail safely

## Epic 5: Context and Preference Expansion

### Story 5.1
Add budget-sensitive and quality-first contexts.

Acceptance criteria:
- users can enable either mode
- scoring responds to active contexts
- explanations mention context when relevant

### Story 5.2
Add seller and brand memory.

Acceptance criteria:
- prefer brand updates future matching products
- avoid seller affects future offers
- brand and seller edges are persisted

## Epic 6: Agent MVP

### Story 6.1
Create ask-and-rank interface.

Acceptance criteria:
- user submits shopping question
- system returns ranked candidates
- each returned candidate includes explanation

### Story 6.2
Create compare workflow.

Acceptance criteria:
- user can compare multiple candidates
- response includes tradeoffs
- ranking reflects known preferences

### Story 6.3
Create watchlist flow.

Acceptance criteria:
- user can save a product or offer
- saved item persists locally
- watchlist can be viewed later

### Story 6.4
Implement extension-aware handoff.

Acceptance criteria:
- agent can open selected product URL
- extension recognizes opened page and applies current memory
- no autonomous action is taken

## Nice-to-Have After MVP
- Walmart adapter
- eBay adapter
- profile export/import UI
- YouTube preference bridge
- compare page view
- watchlist alerts

## Explicitly Out of Scope for Initial Build
- direct checkout
- payment handling
- retailer login automation
- cross-site autonomous purchase orchestration
- mandatory cloud account system
