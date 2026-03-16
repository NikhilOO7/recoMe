import { createLogger } from '@shared/Logger';
import { getLLMClient } from '@agent/llm/LLMClient';
import { PromptBuilder } from '@agent/llm/PromptBuilder';
import type { UserContext } from '@agent/retrieval';
import type { CandidateEntity } from '@schema/entities';
import type { ScoringFactor } from '@shared/types';

const log = createLogger('AIExplainer');

/**
 * AI-powered explanation service for agent chat.
 *
 * When a user asks "Why was this recommended?" or "Why was this hidden?",
 * gathers scoring factors and sends them to the LLM for a natural language
 * explanation.
 *
 * IMPORTANT: This is ONLY used in the agent chat (user-initiated).
 * The per-card scoring pipeline uses the rule-based Explainer for performance.
 */
export class AIExplainer {
  private readonly llm = getLLMClient();
  private readonly promptBuilder = new PromptBuilder();

  /**
   * Generate an AI-powered explanation for a product's score.
   * Falls back to a template explanation if LLM is unavailable.
   */
  async explain(
    candidate: CandidateEntity,
    factors: ScoringFactor[],
    userContext: UserContext,
  ): Promise<string> {
    if (!(await this.llm.isConfigured())) {
      return this.templateExplanation(candidate, factors);
    }

    try {
      const { system, prompt } = this.promptBuilder.buildExplainPrompt(
        candidate,
        factors,
        userContext,
      );

      const response = await this.llm.call(prompt, {
        system,
        maxTokens: 200,
      });

      if (response) {
        log.debug(`AI explanation generated for ${candidate.candidateId}`);
        return response.trim();
      }
    } catch (err) {
      log.warn('AI explanation failed, using template', err);
    }

    return this.templateExplanation(candidate, factors);
  }

  /**
   * Generate an AI-powered comparison narrative for ranked products.
   * Falls back to template if LLM unavailable.
   */
  async compareNarrative(
    candidates: CandidateEntity[],
    userContext: UserContext,
    scores?: Array<{ candidateId: string; score: number; decision: string; explanation: string }>,
  ): Promise<string | null> {
    if (!(await this.llm.isConfigured())) {
      return null; // caller uses existing template
    }

    try {
      const { system, prompt } = this.promptBuilder.buildComparePrompt(
        candidates,
        userContext,
        scores,
      );

      const response = await this.llm.call(prompt, {
        system,
        maxTokens: 300,
      });

      if (response) {
        log.debug(`AI comparison narrative generated for ${candidates.length} products`);
        return response.trim();
      }
    } catch (err) {
      log.warn('AI comparison narrative failed', err);
    }

    return null;
  }

  // ── Template fallback ──────────────────────────────────────────────────────

  private templateExplanation(candidate: CandidateEntity, factors: ScoringFactor[]): string {
    const sorted = [...factors].sort(
      (a, b) => Math.abs(b.score * b.weight) - Math.abs(a.score * a.weight),
    );
    const top = sorted[0];

    if (!top || top.score === 0) {
      return `No strong signals for this product yet. Browse more and I'll learn your preferences.`;
    }

    const brand = candidate.metadata?.['brand'] ?? 'This product';
    const direction = top.score > 0 ? 'boosted' : 'downranked';

    return (
      `**${brand}** was ${direction} primarily because: ${top.explanation}. ` +
      `Score: ${(sorted.reduce((sum, f) => sum + f.score * f.weight, 0) / sorted.reduce((sum, f) => sum + f.weight, 0)).toFixed(2)}, ` +
      `based on ${factors.filter((f) => f.score !== 0).length} active scoring factors.`
    );
  }
}
