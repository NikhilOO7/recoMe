import { createLogger } from '@shared/Logger';
import type { Platform } from '@schema/context';
import { ProfileExtractor } from './ProfileExtractor';
import { OpportunityRanker } from './OpportunityRanker';
import { InsightRenderer } from './InsightRenderer';
import { InterestGraphSource } from './sources/InterestGraphSource';
import { ExternalEnrichment } from './sources/ExternalEnrichment';
import { LinkedInIntelligence } from './platforms/LinkedInIntelligence';
import { YouTubeIntelligence } from './platforms/YouTubeIntelligence';
import { AmazonIntelligence } from './platforms/AmazonIntelligence';
import { TwitterIntelligence } from './platforms/TwitterIntelligence';
import { InstagramIntelligence } from './platforms/InstagramIntelligence';
import { EbayIntelligence } from './platforms/eBayIntelligence';
import { WalmartIntelligence } from './platforms/WalmartIntelligence';
import { FacebookIntelligence } from './platforms/FacebookIntelligence';
import type { PlatformIntelligenceModule, RawOpportunity } from './types';

const log = createLogger('PlatformIntelligence');

/**
 * PlatformIntelligenceEngine — orchestrates per-platform proactive recommendations.
 *
 * Flow:
 * 1. Detect platform & extract profile from DOM
 * 2. Query user's interest graph
 * 3. Run platform-specific opportunity discovery
 * 4. Optionally enrich with LLM
 * 5. Rank opportunities by relevance
 * 6. Render top insights via overlay/toast
 * 7. Record user feedback for learning
 */
export class PlatformIntelligenceEngine {
  private readonly extractor = new ProfileExtractor();
  private readonly ranker: OpportunityRanker;
  private readonly renderer = new InsightRenderer();
  private readonly interestGraph = new InterestGraphSource();
  private readonly enrichment = new ExternalEnrichment();
  private analyzed = false;

  constructor(private readonly platform: Platform) {
    this.ranker = new OpportunityRanker();

    // Register platform modules
    this.registerModules();
  }

  /** Set callback for overlay badge updates */
  onBadgeUpdate(cb: (count: number) => void): void {
    this.renderer.onBadgeUpdate(cb);
  }

  /**
   * Run the full intelligence pipeline for the current page.
   * Should be called once per page load, after adapter initialization.
   */
  async analyze(): Promise<void> {
    if (this.analyzed) return;
    this.analyzed = true;

    // Check if proactive insights are enabled
    if (!(await this.isEnabled())) {
      log.debug('Proactive insights disabled');
      return;
    }

    // Don't run on unsupported platforms
    if (!this.extractor.hasModule(this.platform)) {
      log.debug(`No intelligence module for ${this.platform}`);
      return;
    }

    const start = performance.now();

    try {
      // 1. Extract profile from DOM
      const profile = this.extractor.extract(this.platform, document);
      if (!profile) {
        log.debug('Profile extraction returned null');
        return;
      }

      // 2. Get user interests from knowledge graph
      const userInterests = await this.interestGraph.getTopInterests(20);

      // 3. Discover opportunities using the platform module
      const mod = this.getModule(this.platform);
      if (!mod) return;

      let opportunities: RawOpportunity[] = mod.discoverOpportunities(profile, userInterests);

      // 4. Also trigger Brain agents for deeper analysis
      const agentOpportunities = await this.queryBrainAgents(profile, userInterests);
      opportunities = [...opportunities, ...agentOpportunities];

      // 5. Optional LLM enrichment
      opportunities = await this.enrichment.enrich(opportunities, userInterests);

      // 6. Rank and filter
      const insights = this.ranker.rank(opportunities, this.platform, userInterests);

      if (insights.length === 0) {
        log.debug('No insights passed ranking threshold');
        return;
      }

      // 7. Render
      this.renderer.render(insights);

      const elapsed = performance.now() - start;
      log.info(
        `Intelligence pipeline completed in ${elapsed.toFixed(0)}ms, ${insights.length} insights`,
      );
    } catch (err) {
      log.error('Intelligence pipeline failed', err);
    }
  }

  /** Get pending insights (for overlay display) */
  getPendingInsights() {
    return this.renderer.getPending();
  }

  /** Reset for SPA navigation */
  reset(): void {
    this.analyzed = false;
    this.interestGraph.invalidate();
  }

  private registerModules(): void {
    this.extractor.registerModule(new LinkedInIntelligence());
    this.extractor.registerModule(new YouTubeIntelligence());
    this.extractor.registerModule(new AmazonIntelligence());
    this.extractor.registerModule(new TwitterIntelligence());
    this.extractor.registerModule(new InstagramIntelligence());
    this.extractor.registerModule(new EbayIntelligence());
    this.extractor.registerModule(new WalmartIntelligence());
    this.extractor.registerModule(new FacebookIntelligence());
  }

  private getModule(platform: Platform): PlatformIntelligenceModule | null {
    const modules: Record<string, PlatformIntelligenceModule> = {
      linkedin: new LinkedInIntelligence(),
      youtube: new YouTubeIntelligence(),
      amazon: new AmazonIntelligence(),
      twitter: new TwitterIntelligence(),
      instagram: new InstagramIntelligence(),
      ebay: new EbayIntelligence(),
      walmart: new WalmartIntelligence(),
      facebook: new FacebookIntelligence(),
    };
    return modules[platform] ?? null;
  }

  private async queryBrainAgents(
    _profile: { fields: Record<string, unknown> },
    _userInterests: string[],
  ): Promise<RawOpportunity[]> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'BRAIN_PROCESS',
        payload: {
          taskType: 'discover',
          trigger: 'page_load',
          platform: this.platform,
          pageUrl: location.href,
        },
      });

      if (!response?.success || !response.data) return [];

      const brainResult = response.data as {
        merged?: { data?: { opportunities?: RawOpportunity[] } };
      };

      return brainResult.merged?.data?.opportunities ?? [];
    } catch {
      return [];
    }
  }

  private async isEnabled(): Promise<boolean> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_SETTINGS',
        payload: null,
      });
      const settings = response?.data as
        | {
            proactive_insights?: boolean;
            platform_insights?: Record<string, boolean>;
          }
        | undefined;

      // Default to enabled if setting doesn't exist yet
      if (settings?.proactive_insights === false) return false;
      if (settings?.platform_insights?.[this.platform] === false) return false;

      return true;
    } catch {
      return true; // Default enabled
    }
  }
}
