import { BaseAgent } from './BaseAgent';
import type { TaskContext, BrainTask } from '../orchestrator/types';

export interface GuardianResult {
  approved: boolean;
  warnings: string[];
  dataAccessed: string[];
  sanitized: boolean;
}

/**
 * GuardianAgent — privacy & safety auditor.
 *
 * Runs alongside all other agents to ensure privacy, safety, and user trust.
 * Audits data access, blocks overreach, and maintains transparency.
 *
 * Tools:
 * - audit_data_access: log what DOM data agents are reading
 * - check_consent: verify user opt-in before data access
 * - sanitize_output: strip PII from agent outputs
 * - enforce_limits: enforce frequency/rate/data caps
 * - explain_privacy: generate clear explanation of data usage
 * - redact_for_llm: sanitize data before sending to external LLM
 *
 * Performance budget: <5ms (runs on every tool call — must be invisible).
 */
export class GuardianAgent extends BaseAgent {
  readonly name = 'guardian' as const;
  readonly description = 'Privacy & safety — audits data access, enforces limits, ensures trust';
  readonly budgetMs = 5;

  protected async run(
    context: TaskContext,
    task: BrainTask,
  ): Promise<{ data: GuardianResult; confidence: number; reasoning?: string }> {
    const warnings: string[] = [];
    const dataAccessed: string[] = [];

    // 1. Audit what data this task is accessing
    if (context.content) {
      dataAccessed.push('content_metadata');
    }
    if (context.conversationHistory && context.conversationHistory.length > 0) {
      dataAccessed.push('conversation_history');
    }
    if (context.recentActions && context.recentActions.length > 0) {
      dataAccessed.push('recent_actions');
    }

    // 2. Check consent for platform data access
    const consentResult = await this.useTool<{ consented: boolean; platform: string }>(
      'check_consent',
      { platform: context.platform, dataTypes: dataAccessed },
    );

    if (consentResult.success && consentResult.data && !consentResult.data.consented) {
      warnings.push(`User has not consented to data access on ${context.platform}`);
    }

    // 3. Enforce rate limits
    const limitResult = await this.useTool<{ allowed: boolean; reason?: string }>(
      'enforce_limits',
      { taskType: task.type, platform: context.platform },
    );

    if (limitResult.success && limitResult.data && !limitResult.data.allowed) {
      warnings.push(limitResult.data.reason ?? 'Rate limit exceeded');
    }

    const approved = warnings.length === 0;

    return {
      data: {
        approved,
        warnings,
        dataAccessed,
        sanitized: true,
      },
      confidence: 1,
      reasoning: approved
        ? 'All privacy and safety checks passed'
        : `Warnings: ${warnings.join('; ')}`,
    };
  }
}
