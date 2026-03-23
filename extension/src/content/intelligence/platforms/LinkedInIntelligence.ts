import type { PlatformIntelligenceModule, PlatformProfile, RawOpportunity } from '../types';
import { safeText, safeTextAll, safeTextAny } from '../ProfileExtractor';

/**
 * LinkedInIntelligence — career & learning intelligence.
 *
 * Extracts: role, company, industry, skills, location, education.
 * Generates insights: courses, certifications, events, skill gaps, career trends.
 */
export class LinkedInIntelligence implements PlatformIntelligenceModule {
  readonly platform = 'linkedin' as const;

  extractProfile(doc: Document): PlatformProfile | null {
    const pageType = this.detectPageType();

    const role = safeTextAny(doc, [
      '.text-body-medium.break-words',
      '.pv-top-card--list .text-body-medium',
      'div.mt2 div.text-body-medium',
    ]);

    const company = safeTextAny(doc, [
      '.pv-text-details__right-panel-item-text',
      '.inline-show-more-text--is-collapsed',
      '[data-field="experience_company_logo"] + div span',
    ]);

    const location = safeTextAny(doc, [
      '.text-body-small.inline.t-black--light.break-words',
      '.pv-top-card--list-bullet li',
    ]);

    const skills = safeTextAll(
      doc,
      ['.skill-card-listitem span', '.pv-skill-categories-section li span'].join(', '),
    );

    const industry = safeTextAny(doc, [
      '.pv-top-card--experience-list-item',
      '.text-body-small[aria-label]',
    ]);

    const connections = safeText(doc, '.pv-top-card--list .t-bold');

    return {
      platform: 'linkedin',
      pageType,
      extractedAt: Date.now(),
      fields: {
        role,
        company,
        location,
        industry,
        skills,
        connections,
        pageType,
      },
    };
  }

  discoverOpportunities(profile: PlatformProfile, userInterests: string[]): RawOpportunity[] {
    const opportunities: RawOpportunity[] = [];
    const fields = profile.fields as {
      role: string;
      company: string;
      location: string;
      skills: string[];
      industry: string;
      pageType: string;
    };

    // Skill-based course recommendations
    if (fields.skills && fields.skills.length > 0) {
      const topSkills = fields.skills.slice(0, 3);
      opportunities.push({
        title: `Trending courses for ${topSkills[0] ?? 'your skills'}`,
        body: `Based on your skills in ${topSkills.join(', ')}, there are trending certifications that could boost your profile.`,
        benefit: 'Stay competitive with in-demand certifications',
        type: 'course',
        actionLabel: 'Explore courses',
        timeliness: 0.5,
        sourceSignals: [...topSkills, ...userInterests.slice(0, 3)],
        platformContext: { skills: topSkills, pageType: fields.pageType },
      });
    }

    // Career insight based on role
    if (fields.role) {
      opportunities.push({
        title: `Career insights for ${fields.role}`,
        body: `People in similar roles are focusing on new skills. See what's trending in your field.`,
        benefit: 'Understand market trends for your role',
        type: 'trend',
        actionLabel: 'View trends',
        timeliness: 0.4,
        sourceSignals: [fields.role, fields.industry].filter(Boolean),
        platformContext: { role: fields.role, company: fields.company },
      });
    }

    // Location-based events
    if (fields.location) {
      opportunities.push({
        title: `Tech events near ${fields.location}`,
        body: `Upcoming meetups and conferences in your area that match your interests.`,
        benefit: 'Network with professionals in your field',
        type: 'event',
        actionLabel: 'See events',
        timeliness: 0.7,
        sourceSignals: [fields.location, ...userInterests.slice(0, 3)],
        platformContext: { location: fields.location },
      });
    }

    // Cross-platform interest connections
    if (userInterests.length > 3) {
      const crossInterests = userInterests.slice(0, 5);
      opportunities.push({
        title: 'Your interests suggest a skill gap opportunity',
        body: `Based on your browsing patterns, you're exploring ${crossInterests.slice(0, 2).join(' and ')}. LinkedIn Learning has structured paths for this.`,
        benefit: 'Bridge the gap between interest and expertise',
        type: 'course',
        actionLabel: 'View learning path',
        timeliness: 0.3,
        sourceSignals: crossInterests,
        platformContext: { interests: crossInterests },
      });
    }

    return opportunities;
  }

  private detectPageType(): string {
    const path = location.pathname;
    if (path.startsWith('/in/')) return 'profile';
    if (path.startsWith('/jobs')) return 'jobs';
    if (path.startsWith('/learning')) return 'learning';
    if (path.startsWith('/feed') || path === '/') return 'feed';
    if (path.startsWith('/company')) return 'company';
    if (path.startsWith('/groups')) return 'groups';
    return 'other';
  }
}
