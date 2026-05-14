import type { GraphRepository } from '../graph/GraphRepository.js';
import type { EmbeddingClient } from '../vector/EmbeddingClient.js';
import type { VectorClient } from '../vector/VectorClient.js';
import type { Platform, ResearchTrail as Trail } from '../graph/types.js';
import { normalizeTopic } from './SignalIngestion.js';

export interface RelatedTopic {
  topicName: string;
  normalizedName: string;
  similarity: number;
}

/**
 * ResearchTrail answers the audit P0:
 *   "User watched YouTube about X → discussed on Reddit → landed on Amazon —
 *    show me that trail and what to do next."
 *
 * It composes:
 *   - GraphRepository.getResearchTrail   : the actual hop sequence
 *   - GraphRepository.getCrossPlatformTopics : trail candidates ranked by spread
 *   - VectorClient + EmbeddingClient     : semantic neighbors for "what else
 *                                          should I be researching?"
 */
export class ResearchTrailService {
  constructor(
    private readonly graph: GraphRepository,
    private readonly vectors: VectorClient,
    private readonly embedder: EmbeddingClient,
  ) {}

  /**
   * Top N research trails for a user — topics they've touched across 2+ platforms.
   * The audit's failing case (no trails ever surface) becomes: this returns
   * a non-empty list as soon as signals arrive on two platforms.
   */
  async listTrails(
    userId: string,
    opts: { minPlatforms?: number; limit?: number } = {},
  ): Promise<Trail[]> {
    const candidates = await this.graph.getCrossPlatformTopics(
      userId,
      opts.minPlatforms ?? 2,
      opts.limit ?? 10,
    );
    const trails: Trail[] = [];
    for (const c of candidates) {
      const trail = await this.graph.getResearchTrail(userId, c.topicNormalizedName);
      if (trail) trails.push(trail);
    }
    return trails;
  }

  /** Fetch one trail by topic. */
  async getTrail(userId: string, topic: string): Promise<Trail | null> {
    return this.graph.getResearchTrail(userId, normalizeTopic(topic));
  }

  /**
   * "What else should I look at?" — semantic neighbors of the trail's topic,
   * filtered to topics the user has not yet blocked.
   *
   * Returns empty array if vector search has no hits for this user (cold start).
   */
  async relatedTopics(userId: string, topicNormalizedName: string, k = 5): Promise<RelatedTopic[]> {
    const seedText = topicNormalizedName.replace(/-/g, ' ');
    const { vectors } = await this.embedder.embed({ inputs: [seedText] });
    const seedVector = vectors[0];
    if (!seedVector) return [];
    const hits = await this.vectors.search(seedVector, k + 1, { userId, kind: 'topic' });
    return hits
      .filter((h) => h.payload.refId !== topicNormalizedName)
      .slice(0, k)
      .map((h) => ({
        topicName: h.payload.text,
        normalizedName: h.payload.refId,
        similarity: h.score,
      }));
  }

  /**
   * Trail strength explainer — exposes the scoring so the UI can show
   * "this is your strongest trail because: 3 platforms × 12 hops × N minutes dwell".
   */
  explainStrength(trail: Trail): {
    platforms: Platform[];
    hops: number;
    totalDwellMs: number;
    strength: number;
  } {
    const totalDwellMs = trail.hops.reduce((s, h) => s + h.dwellMs, 0);
    return {
      platforms: trail.platformsTouched,
      hops: trail.hops.length,
      totalDwellMs,
      strength: trail.strength,
    };
  }
}
