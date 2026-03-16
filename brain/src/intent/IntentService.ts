import { createLogger } from '@utils/Logger';
import { generateId } from '@utils/index';
import { IntentRepo, ProductRepo, BrandRepo, SellerRepo } from '../storage/CommerceRepo';
import type { IntentEvent, IntentType } from '@schema/intent';

const log = createLogger('IntentService');

export interface IntentResolution {
  intentId: string;
  canonicalEntityId: string;
  canonicalEntityType: 'product' | 'brand' | 'seller' | 'category';
  appliedScope: 'entity' | 'brand' | 'category' | 'session';
  expiresAt?: string;
}

/** Default expiration windows per intent type (in days). */
const EXPIRATION_DAYS: Partial<Record<IntentType, number>> = {
  one_time_need: 30,
  researching: 14,
  budget_sensitive: 7,
};

export class IntentService {
  private readonly intents = new IntentRepo();
  private readonly products = new ProductRepo();
  private readonly brands = new BrandRepo();
  private readonly sellers = new SellerRepo();

  /**
   * Record a new user intent, normalizing the entity and resolving scope.
   * Returns the resolution info for the caller to use.
   */
  async recordIntent(
    source: 'overlay' | 'popup' | 'agent',
    entityType: IntentEvent['entityType'],
    entityId: string,
    intentType: IntentType,
    metadata?: Record<string, unknown>,
  ): Promise<IntentResolution> {
    const scope = this.resolveScope(intentType, entityType);
    const expiresAt = this.computeExpiration(intentType);

    const event: IntentEvent = {
      id: generateId(),
      createdAt: new Date().toISOString(),
      source,
      entityType,
      entityId,
      intentType,
      scope,
      confidence: 1.0,
      expiresAt,
      metadata,
    };

    await this.intents.put(event);

    // Resolve canonical entity ID (may differ from raw entityId if we find a match)
    const canonicalId = await this.resolveCanonicalEntity(entityType, entityId);

    log.info(`Recorded intent: ${intentType} on ${entityType}:${canonicalId} (scope: ${scope})`);

    return {
      intentId: event.id,
      canonicalEntityId: canonicalId,
      canonicalEntityType: entityType,
      appliedScope: scope,
      expiresAt,
    };
  }

  /**
   * Get all active (non-expired) intents for a given entity.
   */
  async getActiveIntentsForEntity(entityId: string): Promise<IntentEvent[]> {
    const intents = await this.intents.getByEntity(entityId);
    const now = new Date().toISOString();
    return intents.filter((i) => !i.expiresAt || i.expiresAt > now);
  }

  /**
   * Get all active intents of a specific type.
   */
  async getActiveIntentsByType(intentType: IntentType): Promise<IntentEvent[]> {
    const intents = await this.intents.getByType(intentType);
    const now = new Date().toISOString();
    return intents.filter((i) => !i.expiresAt || i.expiresAt > now);
  }

  /**
   * Get the most recent intents (for context retrieval by agent).
   */
  async getRecentIntents(limit = 20): Promise<IntentEvent[]> {
    return this.intents.getRecent(limit);
  }

  /**
   * Revoke an intent (undo).
   */
  async revokeIntent(intentId: string): Promise<void> {
    await this.intents.delete(intentId);
    log.info(`Revoked intent: ${intentId}`);
  }

  /**
   * Determine the appropriate scope based on intent type and entity type.
   */
  private resolveScope(
    intentType: IntentType,
    entityType: IntentEvent['entityType'],
  ): IntentEvent['scope'] {
    switch (intentType) {
      case 'prefer_brand':
        return 'brand';
      case 'avoid_seller':
        return 'entity'; // scoped to the specific seller
      case 'budget_sensitive':
      case 'quality_first':
        return 'session'; // affects current shopping session
      case 'already_bought':
        return entityType === 'category' ? 'category' : 'entity';
      default:
        return entityType === 'category' ? 'category' : 'entity';
    }
  }

  /**
   * Compute expiration date for intents that should auto-expire.
   */
  private computeExpiration(intentType: IntentType): string | undefined {
    const days = EXPIRATION_DAYS[intentType];
    if (!days) return undefined;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);
    return expiresAt.toISOString();
  }

  /**
   * Attempt to resolve an entity ID to a canonical ID.
   * For now, returns the same ID (canonical resolution improves with more data).
   */
  private async resolveCanonicalEntity(
    entityType: IntentEvent['entityType'],
    entityId: string,
  ): Promise<string> {
    // Try to find existing entity to confirm it's canonical
    switch (entityType) {
      case 'product': {
        const product = await this.products.get(entityId);
        return product?.productId ?? entityId;
      }
      case 'brand': {
        const brand = await this.brands.get(entityId);
        return brand?.brandId ?? entityId;
      }
      case 'seller': {
        const seller = await this.sellers.get(entityId);
        return seller?.sellerId ?? entityId;
      }
      default:
        return entityId;
    }
  }
}
