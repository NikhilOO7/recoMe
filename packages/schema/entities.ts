// ── Commerce Entity types (from domain model) ───────────────────────────────

/** Entity types for commerce/recommendation domain. */
export type CommerceEntityType = 'product' | 'brand' | 'seller' | 'category' | 'offer';

export interface UserProfile {
  userId: string;
  profileVersion: number;
  createdAt: string;
  updatedAt: string;
  settings: {
    enableBadges: boolean;
    enableExplanations: boolean;
    enableLocalOnlyMode: boolean;
    supportedSites: string[];
  };
}

export interface Product {
  productId: string;
  title: string;
  normalizedTitle: string;
  brandId?: string;
  categoryIds: string[];
  attributes: Record<string, string | number | boolean>;
  canonicalTokens: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Brand {
  brandId: string;
  displayName: string;
  aliases: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Seller {
  sellerId: string;
  displayName: string;
  trustSignals: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Offer {
  offerId: string;
  productId: string;
  sellerId?: string;
  site: string;
  title: string;
  url: string;
  price?: number;
  currency?: string;
  shippingText?: string;
  availabilityText?: string;
  extractedAt: string;
}

export interface CandidateEntity {
  candidateId: string;
  entityType: CommerceEntityType;
  rawText: string;
  normalizedText: string;
  productId?: string;
  brandId?: string;
  sellerId?: string;
  offerId?: string;
  metadata: Record<string, unknown>;
}
