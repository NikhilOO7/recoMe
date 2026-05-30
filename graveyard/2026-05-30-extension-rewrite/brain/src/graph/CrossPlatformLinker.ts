import { createLogger } from '@shared/Logger';
import type { MemoryStore } from '../memory/storage/MemoryStore';
import type { KnowledgeGraph } from './KnowledgeGraph';
import { getLLMClient } from '@agent/llm/LLMClient';
import type { Platform } from '@shared/types';

const log = createLogger('CrossPlatformLinker');

/** Minimum platforms for a topic to qualify as cross-platform */
const MIN_PLATFORMS = 2;
/** Look-back window for cross-platform detection */
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
/** Weight assigned to cross-platform relations */
const CROSS_PLATFORM_WEIGHT = 0.7;

/** A detected cross-platform topic with platform evidence */
export interface CrossPlatformTopic {
  topicKey: string;
  platforms: Platform[];
  eventCount: number;
}

/**
 * CrossPlatformLinker — runs daily alongside preference synthesis.
 *
 * Detects topics that appear across 2+ platforms and:
 * 1. Creates/strengthens `related_to` graph relations between those topics
 * 2. If LLM is available, identifies non-obvious connections
 *    (e.g., "machine_learning" on YouTube ↔ "ml_ops" on Twitter)
 *
 * The existing `graphAffinity` factor in FactorCalculators automatically
 * picks up these new relations, so cross-platform signals feed into
 * scoring without any scoring pipeline changes.
 */
export class CrossPlatformLinker {
  private readonly store: MemoryStore;
  private readonly graph: KnowledgeGraph;
  private readonly llm = getLLMClient();

  constructor(store: MemoryStore, graph: KnowledgeGraph) {
    this.store = store;
    this.graph = graph;
  }

  /**
   * Run the cross-platform linking pass.
   * Returns the number of new or strengthened relations created.
   */
  async run(): Promise<number> {
    const now = Date.now();
    const sinceMs = now - WINDOW_MS;
    const events = await this.store.getEventsAfter(sinceMs);

    if (events.length === 0) {
      log.debug('No recent events for cross-platform linking');
      return 0;
    }

    // 1. Detect cross-platform topics
    const crossTopics = this.detectCrossPlatformTopics(events);
    if (crossTopics.length === 0) {
      log.debug('No cross-platform topics found');
      return 0;
    }

    log.info(`Found ${crossTopics.length} cross-platform topic(s)`);

    // 2. Create/strengthen graph relations between cross-platform topics
    let relationsCreated = 0;
    relationsCreated += await this.linkCrossPlatformTopics(crossTopics);

    // 3. If LLM is available, try to identify non-obvious connections
    relationsCreated += await this.discoverHiddenConnections(crossTopics);

    if (relationsCreated > 0) {
      this.graph.invalidateCache();
      log.info(`Created/strengthened ${relationsCreated} cross-platform relation(s)`);
    }

    return relationsCreated;
  }

  /**
   * Get all currently detected cross-platform topics (for use in chat context).
   */
  async getCrossPlatformTopics(): Promise<CrossPlatformTopic[]> {
    const sinceMs = Date.now() - WINDOW_MS;
    const events = await this.store.getEventsAfter(sinceMs);
    return this.detectCrossPlatformTopics(events);
  }

  // ── Detection ─────────────────────────────────────────────────────────────

  private detectCrossPlatformTopics(
    events: Array<{ topic_key: string; platform: Platform }>,
  ): CrossPlatformTopic[] {
    const topicMap = new Map<string, { platforms: Set<Platform>; count: number }>();

    for (const event of events) {
      const key = event.topic_key;
      if (!key) continue;

      const entry = topicMap.get(key) ?? { platforms: new Set(), count: 0 };
      entry.platforms.add(event.platform);
      entry.count++;
      topicMap.set(key, entry);
    }

    const results: CrossPlatformTopic[] = [];
    for (const [topicKey, data] of topicMap) {
      if (data.platforms.size >= MIN_PLATFORMS) {
        results.push({
          topicKey,
          platforms: [...data.platforms],
          eventCount: data.count,
        });
      }
    }

    return results.sort((a, b) => b.eventCount - a.eventCount);
  }

  // ── Graph relation creation ───────────────────────────────────────────────

  /**
   * For each cross-platform topic, ensure it exists as a graph entity
   * and create `related_to` edges between co-occurring cross-platform topics.
   */
  private async linkCrossPlatformTopics(topics: CrossPlatformTopic[]): Promise<number> {
    let count = 0;

    // Ensure all cross-platform topics have graph entities
    for (const topic of topics) {
      const displayName = topic.topicKey.replace(/^topic:/, '').replace(/_/g, ' ');
      await this.graph.upsertEntity({
        type: 'topic',
        name: displayName,
        aliases: [],
        metadata: {
          cross_platform: true,
          platforms: topic.platforms,
          event_count: topic.eventCount,
        },
      });
    }

    // Create relations between topics that share platforms
    for (let i = 0; i < topics.length; i++) {
      for (let j = i + 1; j < topics.length; j++) {
        const a = topics[i]!;
        const b = topics[j]!;

        // Check for overlapping platforms
        const sharedPlatforms = a.platforms.filter((p) => b.platforms.includes(p));
        if (sharedPlatforms.length === 0) continue;

        const sourceId = this.topicToEntityId(a.topicKey);
        const targetId = this.topicToEntityId(b.topicKey);

        // Check if relation already exists
        const existing = await this.graph.findRelation(sourceId, targetId, 'related_to');
        if (existing) {
          // Strengthen existing relation (cap at 1.0)
          if (existing.weight < 1.0) {
            await this.graph.addCrossPlatformRelation(
              sourceId,
              targetId,
              Math.min(1.0, existing.weight + 0.1),
              sharedPlatforms,
            );
            count++;
          }
        } else {
          // Weight based on shared platform count
          const weight = Math.min(CROSS_PLATFORM_WEIGHT, 0.3 + sharedPlatforms.length * 0.2);
          await this.graph.addCrossPlatformRelation(sourceId, targetId, weight, sharedPlatforms);
          count++;
        }
      }
    }

    return count;
  }

  // ── LLM-powered discovery ─────────────────────────────────────────────────

  /**
   * When LLM is available, identify non-obvious connections between topics.
   * e.g., "machine_learning" on YouTube ↔ "ml_ops" on Twitter
   */
  private async discoverHiddenConnections(topics: CrossPlatformTopic[]): Promise<number> {
    if (!(await this.llm.isConfigured())) return 0;
    if (topics.length < 2) return 0;

    try {
      const topicSummary = topics
        .slice(0, 10)
        .map((t) => {
          const name = t.topicKey.replace(/^topic:/, '').replace(/_/g, ' ');
          return `"${name}" (${t.platforms.join(', ')}, ${t.eventCount} events)`;
        })
        .join('\n');

      const prompt = [
        'The user has been exploring these topics across multiple platforms:',
        topicSummary,
        '',
        'Identify 1-3 non-obvious connections between these topics that the user might not realize.',
        'Respond as JSON array: [{"source": "topic_a", "target": "topic_b", "reason": "brief explanation"}]',
        'Only include connections that are genuinely useful. If none are non-obvious, return [].',
      ].join('\n');

      const response = await this.llm.call(prompt, {
        system:
          'You are a pattern recognition assistant. Identify non-obvious topic connections. Respond with only JSON.',
        maxTokens: 200,
      });

      if (!response) return 0;

      // Parse connections
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return 0;

      const connections = JSON.parse(jsonMatch[0]) as Array<{
        source: string;
        target: string;
        reason: string;
      }>;

      let count = 0;
      for (const conn of connections.slice(0, 3)) {
        const sourceEntity = await this.graph.findEntityByName(conn.source);
        const targetEntity = await this.graph.findEntityByName(conn.target);

        if (sourceEntity && targetEntity) {
          const existing = await this.graph.findRelation(sourceEntity.id, targetEntity.id);
          if (!existing) {
            await this.graph.addRelation(
              sourceEntity.id,
              targetEntity.id,
              'related_to',
              0.4, // moderate weight for AI-inferred connections
              true, // bidirectional
            );
            log.info(`AI-discovered connection: ${conn.source} ↔ ${conn.target} — ${conn.reason}`);
            count++;
          }
        }
      }

      return count;
    } catch (err) {
      log.warn('Hidden connection discovery failed', err);
      return 0;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private topicToEntityId(topicKey: string): string {
    return topicKey
      .replace(/^topic:/, '')
      .replace(/\s+/g, '_')
      .toLowerCase();
  }
}
