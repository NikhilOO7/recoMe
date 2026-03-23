import { createLogger } from '@shared/Logger';
import type { RawOpportunity } from '../types';

const log = createLogger('ExternalEnrichment');

/**
 * ExternalEnrichment — optional LLM enrichment for deeper insights.
 *
 * Only used when user has AI enhancement enabled.
 * Graceful fallback: if LLM is unavailable, returns empty enrichment.
 */
export class ExternalEnrichment {
  private aiAvailable: boolean | null = null;

  /**
   * Check if AI enhancement is available (user has an API key configured).
   */
  async isAvailable(): Promise<boolean> {
    if (this.aiAvailable !== null) return this.aiAvailable;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'AGENT_AI_STATUS',
        payload: null,
      });
      this.aiAvailable = response?.data?.aiPowered === true;
    } catch {
      this.aiAvailable = false;
    }
    return this.aiAvailable;
  }

  /**
   * Enrich opportunities with LLM-generated insights.
   * Returns the original opportunities with enhanced descriptions if AI is available.
   */
  async enrich(
    opportunities: RawOpportunity[],
    userInterests: string[],
  ): Promise<RawOpportunity[]> {
    if (!(await this.isAvailable())) return opportunities;
    if (opportunities.length === 0) return opportunities;

    // Only enrich top 3 opportunities to manage LLM costs
    const toEnrich = opportunities.slice(0, 3);
    const rest = opportunities.slice(3);

    try {
      const enrichPrompt = `Given these opportunities and user interests, enhance the benefit descriptions to be more specific and actionable.

User interests: ${userInterests.slice(0, 10).join(', ')}

Opportunities:
${toEnrich.map((o, i) => `${i + 1}. ${o.title}: ${o.body}`).join('\n')}

For each, provide a one-sentence enhanced benefit. Respond as JSON array of strings.`;

      const response = await chrome.runtime.sendMessage({
        type: 'AGENT_CHAT',
        payload: { message: enrichPrompt },
      });

      if (response?.success && response.data?.response) {
        // Try to parse enhanced benefits from response
        const enhanced = this.parseEnhancedBenefits(response.data.response as string);
        if (enhanced.length > 0) {
          for (let i = 0; i < Math.min(enhanced.length, toEnrich.length); i++) {
            if (enhanced[i]) {
              toEnrich[i]!.benefit = enhanced[i]!;
            }
          }
        }
      }
    } catch (err) {
      log.debug('LLM enrichment failed, using original descriptions', err);
    }

    return [...toEnrich, ...rest];
  }

  private parseEnhancedBenefits(response: string): string[] {
    try {
      // Try JSON parse first
      const match = response.match(/\[[\s\S]*?\]/);
      if (match) {
        return JSON.parse(match[0]) as string[];
      }
    } catch {
      // Fall back to line-by-line parsing
    }

    // Parse numbered lines
    return response
      .split('\n')
      .filter((line) => /^\d+[\.\)]\s/.test(line.trim()))
      .map((line) => line.replace(/^\d+[\.\)]\s*/, '').trim());
  }
}
