import { createLogger } from '@shared/Logger';

const log = createLogger('InterestGraphSource');

/**
 * InterestGraphSource — queries user's knowledge graph via message passing.
 * Caches results for the page session to avoid repeated round-trips.
 */
export class InterestGraphSource {
  private cachedInterests: string[] | null = null;
  private cachedTopics: string[] | null = null;
  private cacheTimestamp = 0;
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Get the user's top interests from the knowledge graph.
   */
  async getTopInterests(limit = 20): Promise<string[]> {
    if (this.cachedInterests && this.isCacheValid()) {
      return this.cachedInterests;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_GRAPH_DATA',
        payload: null,
      });

      if (!response?.success || !response.data) return [];

      const data = response.data as {
        entities: Array<{ id: string; type: string; label?: string }>;
        relations: Array<{ from: string; to: string; type: string; weight: number }>;
      };

      // Find entities the user is interested in (has positive relations to)
      const userRelations = data.relations
        .filter(
          (r) =>
            r.from === 'local_user' &&
            (r.type === 'interested_in' || r.type === 'likes') &&
            r.weight > 0,
        )
        .sort((a, b) => b.weight - a.weight)
        .slice(0, limit);

      const interestIds = new Set(userRelations.map((r) => r.to));
      const interests = data.entities
        .filter((e) => interestIds.has(e.id))
        .map((e) => e.label ?? e.id);

      this.cachedInterests = interests;
      this.cacheTimestamp = Date.now();

      return interests;
    } catch (err) {
      log.warn('Failed to fetch interest graph', err);
      return [];
    }
  }

  /**
   * Get recently active topics from memory.
   */
  async getRecentTopics(): Promise<string[]> {
    if (this.cachedTopics && this.isCacheValid()) {
      return this.cachedTopics;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_MEMORY_PACK',
        payload: { context_bucket: 'general' },
      });

      if (!response?.success || !response.data) return [];

      const pack = response.data as {
        mid_term_cards?: Array<{ topic_key: string }>;
      };

      const topics = (pack.mid_term_cards ?? [])
        .map((c) => c.topic_key.replace(/^(blocked|interested):/, ''))
        .filter((t) => t.length > 0);

      this.cachedTopics = topics;
      return topics;
    } catch {
      return [];
    }
  }

  /** Invalidate the cache (e.g., after user feedback) */
  invalidate(): void {
    this.cachedInterests = null;
    this.cachedTopics = null;
    this.cacheTimestamp = 0;
  }

  private isCacheValid(): boolean {
    return Date.now() - this.cacheTimestamp < InterestGraphSource.CACHE_TTL_MS;
  }
}
