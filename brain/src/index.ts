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
import type { ContentMetadata, RecommendationResult, FeedbackType } from '@shared/types';
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
