import { createLogger } from '@utils/Logger';
import type { BrainTask, AgentResult, MergedResult } from './types';

const log = createLogger('ResponseMerger');

/**
 * ResponseMerger — combines multi-agent outputs into a coherent result.
 *
 * Strategy:
 * - For single-agent tasks (filter, chat): pass through the primary agent's result.
 * - For multi-agent tasks (shop, analyze): weighted merge by confidence.
 * - Guardian results are used for audit/warnings, not merged into the main output.
 */
export class ResponseMerger {
  merge(results: AgentResult[], task: BrainTask): MergedResult {
    // Separate guardian audit from main results
    const mainResults = results.filter((r) => r.agent !== 'guardian');
    const guardianResult = results.find((r) => r.agent === 'guardian');

    if (mainResults.length === 0) {
      log.warn(`No main agent results for task ${task.id}`);
      return { confidence: 0 };
    }

    // Single agent — pass through
    if (mainResults.length === 1) {
      const r = mainResults[0]!;
      return this.buildMergedResult(r, guardianResult);
    }

    // Multi-agent — pick highest confidence result as primary, include others as supplementary
    const sorted = [...mainResults].sort((a, b) => b.confidence - a.confidence);
    const primary = sorted[0]!;
    const supplementary = sorted.slice(1);

    const merged = this.buildMergedResult(primary, guardianResult);

    // Append supplementary suggestions
    for (const s of supplementary) {
      if (s.success && s.reasoning) {
        merged.suggestions = merged.suggestions ?? [];
        merged.suggestions.push(s.reasoning);
      }
    }

    // Average confidence across successful agents
    const successful = mainResults.filter((r) => r.success);
    if (successful.length > 1) {
      merged.confidence = successful.reduce((sum, r) => sum + r.confidence, 0) / successful.length;
    }

    return merged;
  }

  private buildMergedResult(primary: AgentResult, guardian: AgentResult | undefined): MergedResult {
    const result: MergedResult = {
      data: primary.data,
      explanation: primary.reasoning,
      confidence: primary.confidence,
    };

    // Attach guardian warnings if any
    if (guardian?.success && guardian.reasoning) {
      result.suggestions = [guardian.reasoning];
    }

    return result;
  }
}
