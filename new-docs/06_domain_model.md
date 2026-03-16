# RecoMe Domain Model

## Shared Principles

- Domain models must be shared across extension, brain, and agent.
- IDs should be stable where possible.
- UI state must be separate from durable recommendation memory.
- All decision outputs must be reproducible from stored inputs.

## Core Types

```ts
type EntityType = 'product' | 'brand' | 'seller' | 'category' | 'offer'

type DecisionType = 'boost' | 'neutral' | 'caution' | 'suppress'

type IntentType =
  | 'interested'
  | 'not_interested'
  | 'already_bought'
  | 'one_time_need'
  | 'researching'
  | 'prefer_brand'
  | 'avoid_seller'
  | 'quality_first'
  | 'budget_sensitive'
```

## UserProfile

```ts
type UserProfile = {
  userId: string
  profileVersion: number
  createdAt: string
  updatedAt: string
  settings: {
    enableBadges: boolean
    enableExplanations: boolean
    enableLocalOnlyMode: boolean
    supportedSites: string[]
  }
}
```

## Product

```ts
type Product = {
  productId: string
  title: string
  normalizedTitle: string
  brandId?: string
  categoryIds: string[]
  attributes: Record<string, string | number | boolean>
  canonicalTokens: string[]
  createdAt: string
  updatedAt: string
}
```

## Brand

```ts
type Brand = {
  brandId: string
  displayName: string
  aliases: string[]
  createdAt: string
  updatedAt: string
}
```

## Seller

```ts
type Seller = {
  sellerId: string
  displayName: string
  trustSignals: string[]
  createdAt: string
  updatedAt: string
}
```

## Offer

```ts
type Offer = {
  offerId: string
  productId: string
  sellerId?: string
  site: string
  title: string
  url: string
  price?: number
  currency?: string
  shippingText?: string
  availabilityText?: string
  extractedAt: string
}
```

## ContextState

```ts
type ContextState = {
  contextId: string
  type: 'budget' | 'quality' | 'research' | 'gift' | 'seasonal'
  label: string
  isActive: boolean
  source: 'user' | 'policy' | 'agent'
  createdAt: string
  expiresAt?: string
}
```

## IntentEvent

```ts
type IntentEvent = {
  id: string
  createdAt: string
  source: 'overlay' | 'popup' | 'agent'
  entityType: 'product' | 'brand' | 'seller' | 'category'
  entityId: string
  intentType: IntentType
  scope: 'entity' | 'brand' | 'category' | 'session'
  confidence?: number
  expiresAt?: string
  metadata?: Record<string, unknown>
}
```

## PreferenceEdge

```ts
type PreferenceEdge = {
  edgeId: string
  fromType: 'user' | 'intent' | 'context' | 'product' | 'brand' | 'seller' | 'offer'
  fromId: string
  toType: 'intent' | 'context' | 'product' | 'brand' | 'seller' | 'offer' | 'decision'
  toId: string
  relation: string
  weight: number
  confidence: number
  source: 'explicit' | 'derived' | 'policy'
  createdAt: string
  updatedAt: string
  expiresAt?: string
}
```

## DecisionRecord

```ts
type DecisionRecord = {
  decisionId: string
  candidateId: string
  candidateType: EntityType
  score: number
  confidence: number
  decision: DecisionType
  explanation: string
  factors: string[]
  pageContext: PageContext
  createdAt: string
}
```

## PageContext

```ts
type PageContext = {
  site: 'amazon' | 'walmart' | 'ebay' | 'youtube' | 'unknown'
  pageType: 'search' | 'product' | 'feed' | 'unknown'
  url: string
  query?: string
  categoryPath?: string[]
  timestamp: string
}
```

## CandidateEntity

```ts
type CandidateEntity = {
  candidateId: string
  entityType: EntityType
  rawText: string
  normalizedText: string
  productId?: string
  brandId?: string
  sellerId?: string
  offerId?: string
  metadata: Record<string, unknown>
}
```

## WatchlistItem

```ts
type WatchlistItem = {
  watchlistItemId: string
  entityType: 'product' | 'offer' | 'category'
  entityId: string
  note?: string
  createdAt: string
  updatedAt: string
}
```

## Storage Tables

Recommended logical stores:
- users
- products
- brands
- sellers
- offers
- contexts
- intents
- edges
- decisions
- watchlists
- settings

## API Contracts

### Get Recommendations
```ts
type GetRecommendationsRequest = {
  pageContext: PageContext
  candidates: CandidateEntity[]
}

type GetRecommendationsResponse = {
  items: Array<{
    candidateId: string
    decision: DecisionType
    score: number
    confidence: number
    explanation: string
  }>
}
```

### Record Intent
```ts
type RecordIntentRequest = {
  event: IntentEvent
  pageContext?: PageContext
}

type RecordIntentResponse = {
  success: boolean
  normalizedEntityId: string
  affectedScopes: string[]
}
```

### Compare Candidates
```ts
type CompareCandidatesRequest = {
  candidateIds: string[]
  activeContexts: ContextState[]
}

type CompareCandidatesResponse = {
  ranked: Array<{
    candidateId: string
    rank: number
    explanation: string
    tradeoffs: string[]
  }>
}
```
