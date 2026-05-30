import type { MemoryService } from './memory/MemoryService';
import { createMemoryService } from './memory/MemoryService';
import { KnowledgeGraph } from './graph/KnowledgeGraph';
import { AffinityCalculator } from './graph/AffinityCalculator';
import { EntityExtractor } from './extraction/EntityExtractor';
import { FactorCalculators } from './recommendation/FactorCalculators';
import { RecommendationEngine } from './recommendation/RecommendationEngine';
import { Explainer } from './recommendation/Explainer';
import { PatternDetector } from './memory/PatternDetector';
import { MemoryStore } from './memory/storage/MemoryStore';
import type { ContentMetadata, RecommendationResult, FeedbackType, Platform } from '@shared/types';
import { IMPLICIT_SIGNAL_WEIGHTS } from '@shared/constants';
import { createLogger } from '@shared/Logger';

const log = createLogger('IntelligenceService');

/**
 * IntelligenceService — the single entry point for all intelligence operations.
 * Owns the lifecycle of memory, graph, extraction, and recommendation.
 */
export class IntelligenceService {
  private readonly memory: MemoryService;
  private readonly graph: KnowledgeGraph;
  private readonly affinity: AffinityCalculator;
  private readonly extractor: EntityExtractor;
  private readonly engine: RecommendationEngine;
  private initialized = false;
  private settingsCache: { aggressiveness: number } | null = null;

  constructor() {
    this.memory = createMemoryService();
    this.graph = new KnowledgeGraph();
    this.affinity = new AffinityCalculator(this.graph);
    this.extractor = new EntityExtractor(this.graph);

    const store = new MemoryStore();
    const patterns = new PatternDetector(store);
    const factors = new FactorCalculators(this.memory, this.affinity, patterns);
    const explainer = new Explainer();

    this.engine = new RecommendationEngine(factors, explainer);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.graph.seedDefaults();
    this.initialized = true;
    log.info('IntelligenceService initialized');
  }

  /**
   * Force re-initialization on next call. Use after service worker wake
   * when IDB connections may have been terminated.
   */
  resetInitState(): void {
    this.initialized = false;
    this.settingsCache = null;
    log.info('IntelligenceService init state reset (SW wake)');
  }

  private async getAggressiveness(): Promise<number> {
    if (this.settingsCache) return this.settingsCache.aggressiveness;
    try {
      const result = await chrome.storage.sync.get('recome_settings');
      const s = result['recome_settings'] as { aggressiveness?: number } | undefined;
      this.settingsCache = { aggressiveness: s?.aggressiveness ?? 0.5 };
    } catch {
      this.settingsCache = { aggressiveness: 0.5 };
    }
    return this.settingsCache.aggressiveness;
  }

  invalidateSettingsCache(): void {
    this.settingsCache = null;
    this.extractor.invalidateApiKey();
  }

  /**
   * Process a content item: enrich it, score it, return a recommendation.
   */
  async processContent(raw: ContentMetadata): Promise<RecommendationResult> {
    await this.initialize();

    // Detect context fresh from the content's platform and URL
    const contextState = this.memory.detectContext(raw.platform, raw.url);
    const context = contextState.current;
    const enriched = await this.extractor.enrich(raw);

    const aggressiveness = await this.getAggressiveness();
    return this.engine.recommend(enriched, context, aggressiveness);
  }

  /**
   * Record user feedback on a content item and update memory + graph.
   */
  async learnFeedback(content: ContentMetadata, feedback: FeedbackType): Promise<void> {
    await this.initialize();

    const enriched = await this.extractor.enrich(content);
    await this.memory.writeTurn({ content: enriched, action: feedback });

    // Update graph relations based on feedback
    if (feedback === 'block_forever' || feedback === 'not_interested') {
      for (const entity of enriched.entities) {
        await this.graph.addRelation('local_user', entity, 'not_interested_in', 1.0);
        this.affinity.invalidateUser('local_user');
      }
    } else if (feedback === 'interested') {
      for (const entity of enriched.entities) {
        await this.graph.addRelation('local_user', entity, 'interested_in', 1.0);
        this.affinity.invalidateUser('local_user');
      }
    }

    log.debug(`Learned ${feedback} for "${content.title}"`);
  }

  /**
   * Record an implicit browsing signal AND bridge it to the KnowledgeGraph.
   * This is the critical path for the Phase 0 thesis:
   * YouTube dwell → graph entity → Research Card on Amazon PDP.
   */
  async recordImplicitSignalWithGraphBridge(params: {
    topics: string[];
    entities: string[];
    platform: Platform;
    signalType: keyof typeof IMPLICIT_SIGNAL_WEIGHTS;
    contentId: string;
    contentTitle?: string;
    confidenceOverride?: number;
  }): Promise<void> {
    await this.initialize();

    // 1. Write to MemoryStore (existing behavior)
    await this.memory.recordImplicitSignal(params);

    // 2. Bridge to KnowledgeGraph — only for positive signals above threshold
    const weights = IMPLICIT_SIGNAL_WEIGHTS[params.signalType];
    if (!weights || weights.sentiment !== 'positive' || weights.strength < 0.3) return;

    const graphWeight = weights.strength * (params.confidenceOverride ?? weights.confidence);

    // Noise topics — too generic to be useful research signals
    const NOISE_TOPICS = new Set([
      'music',
      'tech',
      'news',
      'sports',
      'gaming',
      'entertainment',
      'finance',
      'politics',
      'science',
      'health',
      'food',
      'travel',
      'fashion',
      'art',
      'education',
      'business',
      'popular',
      'trending',
      'home',
      'live',
      'shorts',
      'videos',
      'posts',
      'comments',
      'submit',
      'search',
      'about',
      'wiki',
    ]);

    // Write raw topics as graph entities + relations
    for (let topic of params.topics) {
      if (!topic || topic.length < 2) continue;
      // Clean common anchor text noise: "Go to X", "Visit the X Store", "See all X"
      topic = topic
        .replace(/^(go to|visit the|see all|shop for|browse|view all|back to)\s+/i, '')
        .replace(/\s+(store|page|section|category|department)$/i, '')
        .replace(/^searched:/i, '')
        .trim();
      if (!topic || topic.length < 2) continue;
      // Skip overly generic topics
      if (NOISE_TOPICS.has(topic.toLowerCase())) continue;
      // Upsert entity (creates if new, updates timestamp if exists)
      await this.graph.upsertEntity({
        name: topic,
        type: 'topic',
        aliases: [],
        metadata: { source_platform: params.platform, signal_type: params.signalType },
      });
      // Upsert relation (reinforces if exists, creates if new)
      await this.graph.upsertRelation(
        'local_user',
        topic.toLowerCase().replace(/\s+/g, '_'),
        'interested_in',
        graphWeight,
      );
    }

    // Write entities (brands, products, creators) with higher weight.
    // Determine type per-entity: known product brands → 'brand', everything else → 'creator'.
    // This correctly handles YouTube where both brands (Sony) and channel names (SoundGuys)
    // arrive in the same entities[] array.
    const KNOWN_BRAND_NAMES = new Set([
      'sony',
      'bose',
      'apple',
      'samsung',
      'google',
      'microsoft',
      'amazon',
      'sennheiser',
      'jabra',
      'beats',
      'jbl',
      'anker',
      'soundcore',
      'shure',
      'audio-technica',
      'beyerdynamic',
      'hifiman',
      'audeze',
      'focal',
      'akg',
      'dell',
      'hp',
      'lenovo',
      'asus',
      'acer',
      'razer',
      'logitech',
      'corsair',
      'nvidia',
      'amd',
      'intel',
      'lg',
      'panasonic',
      'philips',
      'yamaha',
      'nike',
      'adidas',
      'dyson',
      'ikea',
      'nintendo',
      'playstation',
      'xbox',
    ]);
    for (let entity of params.entities) {
      if (!entity || entity.length < 2) continue;
      // Clean anchor text noise
      entity = entity
        .replace(/^(go to|visit the|see all|shop for|browse)\s+/i, '')
        .replace(/\s+(store|page|section)$/i, '')
        .trim();
      if (!entity || entity.length < 2) continue;
      const entityType = KNOWN_BRAND_NAMES.has(entity.toLowerCase()) ? 'brand' : 'creator';
      await this.graph.upsertEntity({
        name: entity,
        type: entityType,
        aliases: [],
        metadata: { source_platform: params.platform, signal_type: params.signalType },
      });
      await this.graph.upsertRelation(
        'local_user',
        entity.toLowerCase().replace(/\s+/g, '_'),
        'interested_in',
        Math.min(graphWeight * 1.2, 1.0), // entities get slightly higher weight
      );
    }

    this.affinity.invalidateUser('local_user');
    log.debug(
      `Graph bridge: ${params.topics.length} topics + ${params.entities.length} entities from ${params.platform} [${params.signalType}]`,
    );
  }

  getMemoryService(): MemoryService {
    return this.memory;
  }

  getGraph(): KnowledgeGraph {
    return this.graph;
  }
}

// Singleton for the service worker context
let instance: IntelligenceService | null = null;

export function getIntelligenceService(): IntelligenceService {
  if (!instance) instance = new IntelligenceService();
  return instance;
}
