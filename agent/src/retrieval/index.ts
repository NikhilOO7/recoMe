import { createLogger } from '@utils/Logger';
import { getBrain } from '@brain/BrainFacade';
import { MemoryStore } from '@intelligence/memory/storage/MemoryStore';
import { KnowledgeGraph } from '@brain/graph/KnowledgeGraph';
import { CrossPlatformLinker, type CrossPlatformTopic } from '@brain/graph/CrossPlatformLinker';
import type { IntentEvent, IntentType } from '@schema/intent';
import type { Product, Brand, Seller, CandidateEntity } from '@schema/entities';
import type { WatchlistItem } from '@schema/watchlist';
import type { DecisionRecord } from '@schema/decisions';
import { DecisionRepo, ProductRepo, BrandRepo } from '@brain/storage/CommerceRepo';

const log = createLogger('RetrievalService');

/** Aggregated user context for agent reasoning */
export interface UserContext {
  recentIntents: IntentEvent[];
  brandPreferences: Array<{
    brandId: string;
    displayName: string;
    sentiment: 'positive' | 'negative';
  }>;
  sellerPreferences: Array<{ sellerId: string; displayName: string; sentiment: 'negative' }>;
  activeIntentTypes: IntentType[];
  watchlist: WatchlistItem[];
  recentDecisions: DecisionRecord[];
  knownProducts: Product[];
}

/** Context relevant to a specific query */
export interface QueryContext {
  query: string;
  categoryHints: string[];
  priceRange?: { min?: number; max?: number };
}

export class RetrievalService {
  private readonly decisions = new DecisionRepo();
  private readonly products = new ProductRepo();
  private readonly brands = new BrandRepo();

  /**
   * Gather the full user preference context from the brain.
   * This gives the agent everything it needs to personalize responses.
   */
  async getUserContext(limit = 20): Promise<UserContext> {
    const brain = getBrain();

    const [recentIntents, watchlist, recentDecisions, allProducts] = await Promise.all([
      brain.getRecentIntents(limit),
      brain.getWatchlist(),
      this.decisions.getRecent(limit),
      this.products.getAll(),
    ]);

    // Extract brand preferences from intent history
    const brandPreferences = await this.extractBrandPreferences(recentIntents);

    // Extract seller avoidance from intent history
    const sellerPreferences = this.extractSellerPreferences(recentIntents);

    // Identify currently active intent types
    const activeIntentTypes = [...new Set(recentIntents.map((i) => i.intentType))];

    log.debug(
      `Retrieved context: ${recentIntents.length} intents, ${watchlist.length} watchlist items, ${recentDecisions.length} decisions`,
    );

    return {
      recentIntents,
      brandPreferences,
      sellerPreferences,
      activeIntentTypes,
      watchlist,
      recentDecisions,
      knownProducts: allProducts.slice(0, 50),
    };
  }

  /**
   * Retrieve intents and decisions relevant to a specific product or category query.
   */
  async getQueryRelevantIntents(query: QueryContext): Promise<IntentEvent[]> {
    const brain = getBrain();
    const allRecent = await brain.getRecentIntents(50);

    // Filter intents that match query category hints or product keywords
    const queryLower = query.query.toLowerCase();
    const categorySet = new Set(query.categoryHints.map((c) => c.toLowerCase()));

    return allRecent.filter((intent) => {
      // Match by entity ID containing query terms
      if (intent.entityId.toLowerCase().includes(queryLower)) return true;

      // Match by category overlap
      if (intent.scope === 'category' && categorySet.has(intent.entityId.toLowerCase()))
        return true;

      // Match brand/session intents (always relevant)
      if (intent.scope === 'session') return true;

      return false;
    });
  }

  /**
   * Retrieve decisions previously made for a set of candidate IDs.
   * Useful for "have I seen this before?" context.
   */
  async getPriorDecisions(candidateIds: string[]): Promise<Map<string, DecisionRecord[]>> {
    const result = new Map<string, DecisionRecord[]>();
    const promises = candidateIds.map(async (id) => {
      const decisions = await this.decisions.getByCandidate(id);
      if (decisions.length > 0) result.set(id, decisions);
    });
    await Promise.all(promises);
    return result;
  }

  /**
   * Retrieve cross-platform intelligence: topics that appear across 2+ platforms.
   * Used by the chat system prompt to give the LLM awareness of cross-platform patterns.
   */
  async getCrossPlatformContext(): Promise<CrossPlatformTopic[]> {
    try {
      const store = new MemoryStore();
      const graph = new KnowledgeGraph();
      const linker = new CrossPlatformLinker(store, graph);
      return await linker.getCrossPlatformTopics();
    } catch (err) {
      log.warn('Failed to get cross-platform context', err);
      return [];
    }
  }

  /**
   * Look up full product details for a set of candidate IDs.
   */
  async getProductDetails(productIds: string[]): Promise<Map<string, Product>> {
    const result = new Map<string, Product>();
    const brain = getBrain();
    const promises = productIds.map(async (id) => {
      const product = await brain.getProduct(id);
      if (product) result.set(id, product);
    });
    await Promise.all(promises);
    return result;
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private async extractBrandPreferences(
    intents: IntentEvent[],
  ): Promise<UserContext['brandPreferences']> {
    const brandMap = new Map<string, 'positive' | 'negative'>();

    for (const intent of intents) {
      if (intent.intentType === 'prefer_brand' && intent.scope === 'brand') {
        brandMap.set(intent.entityId, 'positive');
      }
      // "not_interested" on a brand entity implies negative brand sentiment
      if (intent.intentType === 'not_interested' && intent.entityType === 'brand') {
        brandMap.set(intent.entityId, 'negative');
      }
    }

    const prefs: UserContext['brandPreferences'] = [];
    for (const [brandId, sentiment] of brandMap) {
      const brand = await this.brands.get(brandId);
      prefs.push({
        brandId,
        displayName: brand?.displayName ?? brandId.replace('brand:', '').replace(/_/g, ' '),
        sentiment,
      });
    }
    return prefs;
  }

  private extractSellerPreferences(intents: IntentEvent[]): UserContext['sellerPreferences'] {
    const sellers: UserContext['sellerPreferences'] = [];
    const seen = new Set<string>();

    for (const intent of intents) {
      if (intent.intentType === 'avoid_seller' && !seen.has(intent.entityId)) {
        seen.add(intent.entityId);
        sellers.push({
          sellerId: intent.entityId,
          displayName: intent.entityId.replace('seller:', '').replace(/_/g, ' '),
          sentiment: 'negative',
        });
      }
    }
    return sellers;
  }
}
