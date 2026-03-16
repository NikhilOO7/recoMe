// ── Intent types (from domain model) ─────────────────────────────────────────

export type IntentType =
  | 'interested'
  | 'not_interested'
  | 'already_bought'
  | 'one_time_need'
  | 'researching'
  | 'prefer_brand'
  | 'avoid_seller'
  | 'quality_first'
  | 'budget_sensitive';

export interface IntentEvent {
  id: string;
  createdAt: string;
  source: 'overlay' | 'popup' | 'agent';
  entityType: 'product' | 'brand' | 'seller' | 'category';
  entityId: string;
  intentType: IntentType;
  scope: 'entity' | 'brand' | 'category' | 'session';
  confidence?: number;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}
