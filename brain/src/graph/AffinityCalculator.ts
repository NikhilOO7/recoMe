import { GRAPH_AFFINITY_DECAY, GRAPH_MAX_DEPTH } from '@shared/constants';
import { LRUCache } from '@data/LRUCache';
import { clamp } from '@shared/utils';
import { createLogger } from '@shared/Logger';
import type { KnowledgeGraph } from './KnowledgeGraph';
import type { AffinityResult, AffinityPath, RelationType } from '@shared/types';

const log = createLogger('AffinityCalculator');

// Positive relation types: propagate positive affinity
const POSITIVE_RELATIONS = new Set<RelationType>([
  'interested_in',
  'follows',
  'similar_to',
  'related_to',
  'is_a',
  'part_of',
  'owned_by',
]);

// Negative relation types: propagate negative affinity
const NEGATIVE_RELATIONS = new Set<RelationType>(['not_interested_in', 'blocked', 'opposite_of']);

// Relations that carry weight but can flip sign
const NEUTRAL_RELATIONS = new Set<RelationType>([
  'belongs_to',
  'created_by',
  'about',
  'features',
  'competes_with',
  'related_to',
]);

// Cache: `${userId}:${entityId}` → score
const affinityCache = new LRUCache<string, number>(1000, 5 * 60 * 1000);

export class AffinityCalculator {
  constructor(private readonly graph: KnowledgeGraph) {}

  /**
   * Calculate the affinity between a user and an entity.
   * Considers direct relations and paths up to GRAPH_MAX_DEPTH hops,
   * with score decay of 0.7 per hop.
   *
   * Returns a score in [-1, +1].
   */
  async calculateEntityAffinity(userId: string, entityId: string): Promise<number> {
    const cacheKey = `${userId}:${entityId}`;
    const cached = affinityCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const result = await this.computeAffinity(userId, entityId);
    const score = clamp(result.score, -1, 1);

    affinityCache.set(cacheKey, score);
    return score;
  }

  /**
   * Calculate affinities for multiple entities at once (batched).
   */
  async batchCalculate(userId: string, entityIds: string[]): Promise<Map<string, number>> {
    const results = new Map<string, number>();
    await Promise.all(
      entityIds.map(async (id) => {
        const score = await this.calculateEntityAffinity(userId, id);
        results.set(id, score);
      }),
    );
    return results;
  }

  invalidateUser(userId: string): void {
    affinityCache.invalidate((k) => k.startsWith(`${userId}:`));
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async computeAffinity(userId: string, targetEntityId: string): Promise<AffinityResult> {
    const paths: AffinityPath[] = [];
    let totalScore = 0;

    await this.dfs(userId, targetEntityId, [userId], 1.0, paths);

    totalScore = paths.reduce((sum, p) => sum + p.score, 0);

    log.debug(
      `Affinity(${userId}, ${targetEntityId}) = ${totalScore.toFixed(3)} via ${paths.length} paths`,
    );

    return { entity_id: targetEntityId, score: totalScore, paths };
  }

  private async dfs(
    currentId: string,
    targetId: string,
    visited: string[],
    runningScore: number,
    paths: AffinityPath[],
  ): Promise<void> {
    if (visited.length > GRAPH_MAX_DEPTH + 1) return;

    const relations = await this.graph.getRelationsFrom(currentId);

    for (const rel of relations) {
      const nextId = rel.source_id === currentId ? rel.target_id : rel.source_id;

      if (visited.includes(nextId)) continue;

      const relScore = this.relationScore(rel.type, rel.weight);
      const hopScore = runningScore * relScore * GRAPH_AFFINITY_DECAY;

      if (nextId === targetId) {
        paths.push({
          nodes: [...visited, nextId],
          score: hopScore,
          depth: visited.length,
        });
      } else {
        await this.dfs(nextId, targetId, [...visited, nextId], hopScore, paths);
      }
    }
  }

  private relationScore(type: RelationType, weight: number): number {
    if (NEGATIVE_RELATIONS.has(type)) return -weight;
    if (POSITIVE_RELATIONS.has(type)) return weight;
    if (NEUTRAL_RELATIONS.has(type)) return weight * 0.5;
    return weight * 0.3;
  }
}
