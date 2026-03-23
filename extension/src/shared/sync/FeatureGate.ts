import type { Tier } from './LicenseManager';

/**
 * FeatureGate — checks feature availability based on subscription tier.
 *
 * Usage:
 *   if (featureGate.canUse('cloud_sync')) { ... }
 *   if (featureGate.canUse('ai_discovery')) { ... }
 */

export type Feature =
  | 'cloud_sync'
  | 'multi_device'
  | 'ai_discovery'
  | 'ai_metadata'
  | 'brain_agents'
  | 'advanced_filters'
  | 'priority_support'
  | 'export_data'
  | 'custom_rules'
  | 'proactive_insights';

const FEATURE_TIERS: Record<Feature, Tier[]> = {
  cloud_sync: ['PRO', 'PREMIUM'],
  multi_device: ['PRO', 'PREMIUM'],
  ai_discovery: ['PRO', 'PREMIUM'],
  ai_metadata: ['PREMIUM'],
  brain_agents: ['FREE', 'PRO', 'PREMIUM'], // basic agents free, advanced pro+
  advanced_filters: ['PRO', 'PREMIUM'],
  priority_support: ['PREMIUM'],
  export_data: ['FREE', 'PRO', 'PREMIUM'],
  custom_rules: ['PRO', 'PREMIUM'],
  proactive_insights: ['FREE', 'PRO', 'PREMIUM'],
};

/** Per-tier numeric limits */
const FEATURE_LIMITS: Record<string, Record<Tier, number>> = {
  brain_queries_per_day: { FREE: 10, PRO: 100, PREMIUM: -1 },
  sync_data_types: { FREE: 1, PRO: 5, PREMIUM: 5 },
  custom_rules_count: { FREE: 0, PRO: 20, PREMIUM: -1 },
  filter_presets: { FREE: 3, PRO: 10, PREMIUM: -1 },
};

export class FeatureGate {
  constructor(private getTier: () => Tier) {}

  /** Check if a feature is available */
  canUse(feature: Feature): boolean {
    const allowed = FEATURE_TIERS[feature];
    return allowed?.includes(this.getTier()) ?? false;
  }

  /** Get numeric limit for a feature (-1 = unlimited) */
  getLimit(limitName: string): number {
    const limits = FEATURE_LIMITS[limitName];
    if (!limits) return -1;
    return limits[this.getTier()] ?? 0;
  }

  /** Get all features with their availability for the current tier */
  getAllFeatures(): Record<Feature, boolean> {
    const result = {} as Record<Feature, boolean>;
    for (const feature of Object.keys(FEATURE_TIERS) as Feature[]) {
      result[feature] = this.canUse(feature);
    }
    return result;
  }

  /** Get upgrade prompt for a locked feature */
  getUpgradePrompt(feature: Feature): { requiredTier: Tier; message: string } | null {
    if (this.canUse(feature)) return null;

    const allowed = FEATURE_TIERS[feature];
    if (!allowed || allowed.length === 0) return null;

    const requiredTier = allowed[0]!;
    const messages: Record<Feature, string> = {
      cloud_sync: 'Sync your preferences across devices',
      multi_device: 'Use RecoMe on multiple browsers',
      ai_discovery: 'AI-powered content discovery on any site',
      ai_metadata: 'Enhanced AI metadata extraction',
      brain_agents: 'Advanced AI brain agents',
      advanced_filters: 'Create advanced filtering rules',
      priority_support: 'Get priority support',
      export_data: 'Export your data',
      custom_rules: 'Create custom recommendation rules',
      proactive_insights: 'Proactive insights on all platforms',
    };

    return { requiredTier, message: messages[feature] };
  }
}
