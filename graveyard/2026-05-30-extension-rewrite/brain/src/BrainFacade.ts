import { createLogger } from '@utils/Logger';
import { IntentService, type IntentResolution } from './intent/IntentService';
import { CommerceScorer, type ScoreResponse } from './scoring/CommerceScorer';
import { PolicyEngine } from './policy/PolicyEngine';
import {
  ProductRepo,
  BrandRepo,
  SellerRepo,
  OfferRepo,
  WatchlistRepo,
} from './storage/CommerceRepo';
import type { CandidateEntity, Product, Brand, Seller, Offer } from '@schema/entities';
import type { WatchlistItem } from '@schema/watchlist';
import type { PageContext } from '@schema/decisions';
import type { ShoppingContext } from '@schema/context';
import type { IntentType, IntentEvent } from '@schema/intent';

const log = createLogger('BrainFacade');

/**
 * BrainFacade — the unified API for the brain layer.
 * Used by both the extension (via message handler) and the agent (via retrieval).
 *
 * Provides:
 * - Commerce scoring (score candidates, get decisions)
 * - Intent management (record, revoke, query)
 * - Entity management (products, brands, sellers, offers)
 * - Watchlist management
 */
export class BrainFacade {
  readonly intents: IntentService;
  readonly scorer: CommerceScorer;
  readonly policy: PolicyEngine;

  private readonly products = new ProductRepo();
  private readonly brands = new BrandRepo();
  private readonly sellers = new SellerRepo();
  private readonly offers = new OfferRepo();
  private readonly watchlists = new WatchlistRepo();

  constructor() {
    this.intents = new IntentService();
    this.scorer = new CommerceScorer();
    this.policy = new PolicyEngine();
  }

  // ── Scoring ──────────────────────────────────────────────────────────────

  /**
   * Score a batch of candidate entities.
   */
  async scoreEntities(
    candidates: CandidateEntity[],
    pageContext: PageContext,
    activeContexts?: ShoppingContext[],
  ): Promise<ScoreResponse> {
    return this.scorer.score(candidates, pageContext, activeContexts);
  }

  // ── Intents ──────────────────────────────────────────────────────────────

  /**
   * Record a user intent.
   */
  async recordIntent(
    source: 'overlay' | 'popup' | 'agent',
    entityType: IntentEvent['entityType'],
    entityId: string,
    intentType: IntentType,
    metadata?: Record<string, unknown>,
  ): Promise<IntentResolution> {
    return this.intents.recordIntent(source, entityType, entityId, intentType, metadata);
  }

  /**
   * Revoke (undo) a previously recorded intent.
   */
  async revokeIntent(intentId: string): Promise<void> {
    return this.intents.revokeIntent(intentId);
  }

  /**
   * Get all active intents for a specific entity.
   */
  async getIntentsForEntity(entityId: string): Promise<IntentEvent[]> {
    return this.intents.getActiveIntentsForEntity(entityId);
  }

  /**
   * Get recent intents (for agent retrieval context).
   */
  async getRecentIntents(limit = 20): Promise<IntentEvent[]> {
    return this.intents.getRecentIntents(limit);
  }

  // ── Entity Management ────────────────────────────────────────────────────

  async putProduct(product: Product): Promise<void> {
    await this.products.put(product);
  }

  async getProduct(id: string): Promise<Product | undefined> {
    return this.products.get(id);
  }

  async putBrand(brand: Brand): Promise<void> {
    await this.brands.put(brand);
  }

  async getBrand(id: string): Promise<Brand | undefined> {
    return this.brands.get(id);
  }

  async findBrandByName(name: string): Promise<Brand[]> {
    return this.brands.findByName(name);
  }

  async putSeller(seller: Seller): Promise<void> {
    await this.sellers.put(seller);
  }

  async getSeller(id: string): Promise<Seller | undefined> {
    return this.sellers.get(id);
  }

  async putOffer(offer: Offer): Promise<void> {
    await this.offers.put(offer);
  }

  async getOffersForProduct(productId: string): Promise<Offer[]> {
    return this.offers.getByProduct(productId);
  }

  // ── Watchlist ────────────────────────────────────────────────────────────

  async addToWatchlist(item: WatchlistItem): Promise<void> {
    await this.watchlists.put(item);
  }

  async removeFromWatchlist(id: string): Promise<void> {
    await this.watchlists.delete(id);
  }

  async getWatchlist(): Promise<WatchlistItem[]> {
    return this.watchlists.getAll();
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

let brainInstance: BrainFacade | null = null;

export function getBrain(): BrainFacade {
  if (!brainInstance) {
    brainInstance = new BrainFacade();
    log.info('BrainFacade initialized');
  }
  return brainInstance;
}
