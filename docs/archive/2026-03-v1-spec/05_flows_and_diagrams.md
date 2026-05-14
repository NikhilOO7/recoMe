# RecoMe Flows and Diagrams

## Shopping Recommendation Flow

This is the extension-first loop and should define the first Amazon MVP.

```mermaid
flowchart LR
    A[User opens Amazon page] --> B[Adapter extracts products]
    B --> C[Extension sends entities]
    C --> D[Brain resolves preferences]
    D --> E[Score and policy]
    E --> F[UI state]
    F --> G[Badge and explanation]
    G --> H[User feedback]
    H --> I[Memory update]
```

## Intent Declaration Flow

RecoMe becomes defensible when users can explicitly correct the internet instead of only being inferred.

```mermaid
flowchart LR
    A[User clicks intent] --> B[Extension records event]
    B --> C[Normalize entity and scope]
    C --> D[Policy sets time horizon]
    D --> E[Graph update]
    E --> F[Brand and seller edges]
    E --> G[Category and product edges]
    F --> H[Future recommendations adapt]
    G --> H
```

## Agent Flow

The agent should start as a recommendation and planning companion, not as an autonomous buyer.

```mermaid
flowchart LR
    A[User asks the agent] --> B[Agent retrieves contexts]
    B --> C[Preference graph lookup]
    C --> D[Gather retailer candidates]
    D --> E[Brain reranks options]
    E --> F[Explain best matches]
    F --> G[Save watchlist or intent]
    G --> H[Open in extension-aware tab]
```

## System Sequence for Search Results Page

```mermaid
sequenceDiagram
    participant P as Page
    participant C as Content Script
    participant B as Background Worker
    participant R as RecoMe Brain
    participant O as Overlay UI

    P->>C: Page content available
    C->>C: Extract visible entities
    C->>B: Send extracted entities
    B->>R: Request scoring
    R-->>B: Return decisions and explanations
    B-->>C: Overlay state payload
    C->>O: Render badges and controls
    O->>C: User intent click
    C->>B: Intent event
    B->>R: Persist memory update
    R-->>B: Updated preference state
    B-->>C: Refresh affected entities
```

## System Sequence for Product Detail Page

```mermaid
sequenceDiagram
    participant P as PDP
    participant C as Content Script
    participant B as Background Worker
    participant R as RecoMe Brain
    participant U as User

    P->>C: Product page loads
    C->>C: Extract product, brand, seller, offer
    C->>B: Product context payload
    B->>R: Score product and retrieve history
    R-->>B: Decision and explanation
    B-->>C: Assessment UI payload
    U->>C: Clicks already bought or researching
    C->>B: Intent event
    B->>R: Normalize and persist
    R-->>B: Graph update confirmation
    B-->>C: Refresh explanation and state
```

## Event Taxonomy

### Page Events

- page_loaded
- page_type_detected
- visible_entities_extracted
- extraction_failed

### Scoring Events

- score_requested
- score_completed
- score_failed
- explanation_generated

### User Intent Events

- intent_clicked
- intent_resolved
- intent_persisted
- intent_reverted

### Agent Events

- agent_query_submitted
- agent_candidates_gathered
- agent_rank_completed
- agent_watchlist_saved
- agent_open_action_triggered

## Decision State Machine

```mermaid
stateDiagram-v2
    [*] --> Unknown
    Unknown --> Neutral : insufficient signal
    Unknown --> Boost : positive confidence
    Unknown --> Caution : negative confidence
    Unknown --> Suppress : strong negative confidence
    Neutral --> Boost : positive signal added
    Neutral --> Caution : negative signal added
    Caution --> Neutral : signal decays or user reverses
    Boost --> Neutral : signal decays or context changes
    Suppress --> Neutral : policy expiry or reversal
```

## Intent Scope Model

### Entity-level

Examples:

- this exact product
- this seller
- this brand

### Category-level

Examples:

- running shoes
- gaming headsets
- baby products

### Session-level

Examples:

- gift shopping
- researching
- budget sensitive today

## Testing Flows

### Happy Path

- user opens Amazon search page
- extension extracts products
- at least one badge appears
- user clicks not interested
- future similar products downgrade appropriately

### Reversal Path

- user marks product as already bought
- user later reverts or changes to interested
- scoring and explanations update cleanly

### Low-confidence Path

- extraction quality is partial
- extension renders neutral state
- user can still submit explicit intent

### Agent Handoff Path

- user asks for best option
- agent ranks products
- user opens top result
- extension recognizes product page and shows aligned reasoning
