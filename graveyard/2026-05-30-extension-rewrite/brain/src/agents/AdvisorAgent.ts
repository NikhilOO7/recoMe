import { BaseAgent } from './BaseAgent';
import type { TaskContext, BrainTask } from '../orchestrator/types';

export interface AdvisorResult {
  response: string;
  suggestions?: string[];
  actions?: Array<{ type: string; label: string; payload: unknown }>;
  insightType?:
    | 'preference_trend'
    | 'cross_platform'
    | 'recommendation'
    | 'explanation'
    | 'general';
}

/**
 * AdvisorAgent — the user's personal intelligence assistant.
 *
 * Handles chat conversations, answers questions about preferences,
 * provides guidance, and makes cross-platform connections.
 *
 * Tools:
 * - query_knowledge_graph: search interest graph for patterns
 * - analyze_preferences: deep preference trend analysis
 * - compare_items: side-by-side comparison
 * - explain_recommendation: explain why something was shown/hidden
 * - suggest_actions: recommend next steps
 * - update_preferences: modify preferences via conversation
 * - generate_insight: create personalized insight from accumulated data
 *
 * Performance budget: <3s (includes LLM call if needed).
 */
export class AdvisorAgent extends BaseAgent {
  readonly name = 'advisor' as const;
  readonly description = 'Personal intelligence — chat, insights, preference management';
  readonly budgetMs = 3000;

  protected async run(
    context: TaskContext,
    task: BrainTask,
  ): Promise<{ data: AdvisorResult; confidence: number; reasoning?: string }> {
    // Chat task — user sent a message
    if (task.type === 'chat' || task.type === 'advise') {
      return this.handleChat(context);
    }

    // Analyze task — generate proactive insight
    if (task.type === 'analyze') {
      return this.generateInsight(context);
    }

    // Default: provide general context
    return {
      data: { response: 'How can I help you?', insightType: 'general' },
      confidence: 0.3,
    };
  }

  private async handleChat(
    context: TaskContext,
  ): Promise<{ data: AdvisorResult; confidence: number; reasoning?: string }> {
    const lastMessage = context.conversationHistory?.slice(-1)[0];
    if (!lastMessage) {
      return {
        data: { response: 'What would you like to know?', insightType: 'general' },
        confidence: 0.3,
      };
    }

    // 1. Query knowledge graph for relevant context
    const graphResult = await this.useTool<{ preferences: string[]; trends: string[] }>(
      'query_knowledge_graph',
      { query: lastMessage.content, platform: context.platform },
    );

    // 2. Analyze preferences if the query is about user's interests
    const prefResult = await this.useTool<{ analysis: string; trends: string[] }>(
      'analyze_preferences',
      { query: lastMessage.content, platform: context.platform },
    );

    // 3. Build structured context for LLM reasoning (or heuristic fallback)
    const structuredContext: Record<string, unknown> = {
      userMessage: lastMessage.content,
      platform: context.platform,
      pageUrl: context.pageUrl,
    };

    if (graphResult.success) structuredContext['preferences'] = graphResult.data;
    if (prefResult.success) structuredContext['analysis'] = prefResult.data;

    // 4. Use LLM bridge for natural language response (via tool)
    const llmResult = await this.useTool<{ response: string; suggestions?: string[] }>(
      'advisor_reason',
      { context: structuredContext, conversationHistory: context.conversationHistory },
    );

    if (llmResult.success && llmResult.data) {
      return {
        data: {
          response: llmResult.data.response,
          suggestions: llmResult.data.suggestions,
          insightType: 'general',
        },
        confidence: 0.8,
        reasoning: 'Generated response using knowledge graph and LLM reasoning',
      };
    }

    // Fallback: use gathered data without LLM
    const response = this.buildFallbackResponse(graphResult.data, prefResult.data);
    return {
      data: { response, insightType: 'general' },
      confidence: 0.5,
      reasoning: 'Fallback response without LLM',
    };
  }

  private async generateInsight(
    context: TaskContext,
  ): Promise<{ data: AdvisorResult; confidence: number; reasoning?: string }> {
    const insightResult = await this.useTool<{
      insight: string;
      type: AdvisorResult['insightType'];
    }>('generate_insight', {
      platform: context.platform,
      recentActions: context.recentActions?.slice(-20),
    });

    if (insightResult.success && insightResult.data) {
      return {
        data: {
          response: insightResult.data.insight,
          insightType: insightResult.data.type,
        },
        confidence: 0.7,
        reasoning: 'Generated proactive insight from recent behavior',
      };
    }

    return {
      data: { response: '', insightType: 'general' },
      confidence: 0,
    };
  }

  private buildFallbackResponse(graphData: unknown, _prefData: unknown): string {
    if (graphData && typeof graphData === 'object' && 'preferences' in graphData) {
      const prefs = (graphData as { preferences: string[] }).preferences;
      if (prefs.length > 0) {
        return `Based on your interests, I can see you're into: ${prefs.slice(0, 3).join(', ')}. What would you like to explore?`;
      }
    }
    return "I'm here to help with your browsing. What would you like to know?";
  }
}
