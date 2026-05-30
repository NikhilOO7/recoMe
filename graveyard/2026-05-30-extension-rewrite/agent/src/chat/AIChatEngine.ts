import { createLogger } from '@utils/Logger';
import { getLLMClient } from '../llm/LLMClient';
import { PromptBuilder } from '../llm/PromptBuilder';
import { ConversationMemory } from './ConversationMemory';
import { RetrievalService } from '../retrieval';
import { AIExplainer } from '@brain/recommendation/AIExplainer';
import { getBrain } from '@brain/BrainFacade';
import type { AgentMessage, AgentAction } from './index';
import type { CandidateEntity } from '@schema/entities';
import type { PageContext } from '@schema/decisions';

const log = createLogger('AIChatEngine');

interface LLMChatResponse {
  message: string;
  actions?: Array<{
    action: string;
    label: string;
    targetUrl?: string;
    candidateIds?: string[];
  }>;
  suggestedFollowups?: string[];
}

/**
 * AI-powered chat engine that uses an LLM for natural conversation.
 * Falls back gracefully when the LLM is unavailable.
 */
// Patterns for detecting explain/compare intents (used for prompt enrichment)
const EXPLAIN_RE = /\b(why|explain|reason|how come|hidden|blocked|recommended|boosted)\b/i;
const COMPARE_RE = /\b(compare|vs|versus|differ|difference|better|which|should i buy)\b/i;

export class AIChatEngine {
  private readonly llm = getLLMClient();
  private readonly promptBuilder = new PromptBuilder();
  private readonly memory = new ConversationMemory();
  private readonly retrieval = new RetrievalService();
  private readonly aiExplainer = new AIExplainer();

  /**
   * Check if the AI chat engine is available (LLM configured).
   */
  async isAvailable(): Promise<boolean> {
    return this.llm.isConfigured();
  }

  /**
   * Get the LLM provider display name for the UI badge.
   */
  async getProviderName(): Promise<string | null> {
    return this.llm.getProviderName();
  }

  /**
   * Process a user message using the LLM.
   * Returns an AgentMessage with AI-generated content, actions, and follow-up suggestions.
   */
  async processMessage(
    userMessage: string,
    candidates?: CandidateEntity[],
    pageContext?: PageContext,
  ): Promise<AgentMessage & { suggestedFollowups?: string[] }> {
    // Gather context in parallel
    const [userContext, history, crossPlatformTopics] = await Promise.all([
      this.retrieval.getUserContext(),
      this.memory.getHistory(),
      this.retrieval.getCrossPlatformContext(),
    ]);

    // ── Specialized AI paths: explain & compare ──────────────────────────
    // When the user asks "why" or "compare", we gather real scoring data
    // and feed it into specialized prompts for richer, grounded responses.

    if (EXPLAIN_RE.test(userMessage) && candidates && candidates.length > 0) {
      const explained = await this.handleExplainWithAI(userMessage, candidates[0]!, userContext);
      if (explained) return explained;
    }

    if (COMPARE_RE.test(userMessage) && candidates && candidates.length >= 2) {
      const compared = await this.handleCompareWithAI(userMessage, candidates, userContext);
      if (compared) return compared;
    }

    // ── General AI chat path ─────────────────────────────────────────────

    // Build the prompt (includes cross-platform context when available)
    const { system, messages, prompt } = this.promptBuilder.buildChatPrompt(
      userMessage,
      userContext,
      history,
      candidates,
      pageContext,
      crossPlatformTopics.length > 0 ? crossPlatformTopics : undefined,
    );

    // Record the user message in conversation memory
    await this.memory.addUserMessage(userMessage);

    // Call the LLM
    const response = await this.llm.call(prompt, {
      system,
      messages,
      maxTokens: 500,
    });

    if (!response) {
      log.warn('LLM returned null — falling back');
      return {
        role: 'agent',
        content:
          "I'm having trouble connecting to the AI service. Please check your API key in settings.",
        timestamp: new Date().toISOString(),
      };
    }

    // Parse the structured response
    const parsed = this.parseResponse(response);

    // Record the assistant message
    await this.memory.addAssistantMessage(parsed.message);

    // Convert to AgentMessage
    const actions: AgentAction[] = (parsed.actions ?? []).map((a) => ({
      action: (a.action as AgentAction['action']) || 'open_product',
      label: a.label,
      targetUrl: a.targetUrl,
      candidateIds: a.candidateIds,
    }));

    return {
      role: 'agent',
      content: parsed.message,
      timestamp: new Date().toISOString(),
      actions: actions.length > 0 ? actions : undefined,
      suggestedFollowups: parsed.suggestedFollowups,
    };
  }

  /** Clear conversation history (e.g. when user clicks "New conversation"). */
  async clearConversation(): Promise<void> {
    await this.memory.clear();
  }

  // ── Specialized AI handlers ──────────────────────────────────────────────

  /**
   * Score a product and have the LLM explain the decision in natural language.
   */
  private async handleExplainWithAI(
    userMessage: string,
    candidate: CandidateEntity,
    userContext: import('../retrieval').UserContext,
  ): Promise<(AgentMessage & { suggestedFollowups?: string[] }) | null> {
    try {
      // Score the candidate to get real factors
      const brain = getBrain();
      const scoreResponse = await brain.scoreEntities([candidate], {
        site: 'unknown',
        pageType: 'unknown',
        url: '',
        timestamp: new Date().toISOString(),
      });

      const scored = scoreResponse.items[0];
      if (!scored) return null;

      // Convert factor strings to ScoringFactor-like objects for the prompt
      const scoringFactors = (scored.factors ?? []).map((f) => ({
        name: f,
        score: scored.score,
        weight: 1,
        explanation: f,
      }));

      const explanation = await this.aiExplainer.explain(candidate, scoringFactors, userContext);

      await this.memory.addUserMessage(userMessage);
      await this.memory.addAssistantMessage(explanation);

      return {
        role: 'agent',
        content: explanation,
        timestamp: new Date().toISOString(),
        suggestedFollowups: [
          'Compare with alternatives?',
          'Save to watchlist',
          'What are my preferences?',
        ],
      };
    } catch (err) {
      log.warn('AI explain failed, falling back to general chat', err);
      return null;
    }
  }

  /**
   * Score multiple products and have the LLM write a comparison narrative.
   */
  private async handleCompareWithAI(
    userMessage: string,
    candidates: CandidateEntity[],
    userContext: import('../retrieval').UserContext,
  ): Promise<(AgentMessage & { suggestedFollowups?: string[] }) | null> {
    try {
      // Score candidates first so the LLM can reference real scores
      let scores:
        | Array<{ candidateId: string; score: number; decision: string; explanation: string }>
        | undefined;
      try {
        const brain = getBrain();
        const scoreResponse = await brain.scoreEntities(candidates, {
          site: 'unknown',
          pageType: 'unknown',
          url: '',
          timestamp: new Date().toISOString(),
        });
        scores = scoreResponse.items.map((item) => ({
          candidateId: item.candidateId,
          score: item.score,
          decision: item.decision,
          explanation: item.explanation,
        }));
      } catch {
        log.debug('Could not score candidates for compare — proceeding without scores');
      }

      const narrative = await this.aiExplainer.compareNarrative(candidates, userContext, scores);
      if (!narrative) return null;

      await this.memory.addUserMessage(userMessage);
      await this.memory.addAssistantMessage(narrative);

      // Build actions to open each product
      const actions: AgentAction[] = candidates.slice(0, 5).map((c, i) => ({
        action: 'open_product' as const,
        label: `Open #${i + 1}`,
        candidateIds: [c.candidateId],
        metadata: { url: c.metadata?.['url'] },
      }));

      return {
        role: 'agent',
        content: narrative,
        timestamp: new Date().toISOString(),
        actions,
        suggestedFollowups: [
          'Which one do you recommend?',
          'Save the best one to watchlist',
          'Tell me more about the top pick',
        ],
      };
    } catch (err) {
      log.warn('AI compare failed, falling back to general chat', err);
      return null;
    }
  }

  // ── Response parsing ───────────────────────────────────────────────────────

  private parseResponse(raw: string): LLMChatResponse {
    // Try to parse as JSON first
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as LLMChatResponse;
        if (parsed.message && typeof parsed.message === 'string') {
          return {
            message: parsed.message,
            actions: Array.isArray(parsed.actions) ? parsed.actions : [],
            suggestedFollowups: Array.isArray(parsed.suggestedFollowups)
              ? parsed.suggestedFollowups.filter((s): s is string => typeof s === 'string')
              : [],
          };
        }
      }
    } catch {
      // JSON parsing failed — treat as plain text
    }

    // Fallback: treat the entire response as the message
    return {
      message: raw.trim(),
      actions: [],
      suggestedFollowups: [],
    };
  }
}
