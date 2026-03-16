// Re-export all types from the shared schema package for backward compatibility.
// New code should import directly from '@schema' or '@schema/<module>'.
export type {
  ContextBucket,
  Platform,
  ContextState,
  BrowsingContextState,
  ShoppingContext,
} from '@schema/context';

export type {
  MemoryType,
  MemoryStatus,
  FeedbackType,
  MemoryEntry,
  MemoryValue,
  MemoryEvent,
  MidTermCard,
  MemoryPack,
} from '@schema/memory';

export type {
  EntityType,
  ContentEntityType,
  RelationType,
  GraphEntity,
  GraphRelation,
  AffinityResult,
  AffinityPath,
  PreferenceEdge,
} from '@schema/graph';

export type {
  ContentAction,
  ContentMetadata,
  ScoringFactor,
  RecommendationResult,
} from '@schema/content';

export type { RecoMeStats } from '@schema/stats';

// Also export the new commerce types for convenience
export type {
  CommerceEntityType,
  UserProfile,
  Product,
  Brand,
  Seller,
  Offer,
  CandidateEntity,
} from '@schema/entities';

export type { DecisionType, PageContext, DecisionRecord } from '@schema/decisions';

export type { IntentType, IntentEvent } from '@schema/intent';

export type { WatchlistItem } from '@schema/watchlist';
