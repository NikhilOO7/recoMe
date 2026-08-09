import OpenAI from 'openai';
import { getConfig } from '../config.js';
import { logger } from '../observability/logger.js';

// ── Agent LLM layer ─────────────────────────────────────────────────────────
// One thin, cost-accounted streaming wrapper for every agent that earns an
// LLM upgrade (PRODUCT.md P3). Product law:
//
//   - OFF by default (AGENTS_LLM_ENABLED). Every agent keeps a deterministic
//     $0 mode; this layer only upgrades prose/synthesis.
//   - Every call reports exact token usage + costMicros so Guardian's
//     $0.10/user/day cap binds on real numbers, not estimates.
//   - Callers pass a hard maxOutputTokens; there is no unbounded generation.

export interface LlmUsage {
  llmTokens: number; // prompt + completion
  costMicros: number;
  model: string;
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Minimal interface agents depend on — lets tests inject a fake. */
export interface AgentLlmLike {
  /**
   * Stream a chat completion. Yields text chunks; after the stream is fully
   * consumed, `onUsage` fires exactly once with the measured usage.
   * Errors before the first chunk should be caught by the caller and used
   * to fall back to the agent's deterministic mode.
   */
  streamChat(
    messages: LlmMessage[],
    opts: { maxOutputTokens: number },
    onUsage: (usage: LlmUsage) => void,
  ): AsyncIterable<string>;
}

// $ per 1M tokens → micros per token. Keep in lockstep with the models we
// actually allow; an unknown model uses the most expensive known rate so a
// misconfig can only over-count (fail-safe for the cost cap).
const PRICE_MICROS_PER_TOKEN: Readonly<Record<string, { input: number; output: number }>> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
};
const FALLBACK_PRICE = { input: 2.5, output: 10 };

export function costMicrosFor(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const price = PRICE_MICROS_PER_TOKEN[model] ?? FALLBACK_PRICE;
  return Math.ceil(promptTokens * price.input + completionTokens * price.output);
}

export class AgentLlm implements AgentLlmLike {
  private client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async *streamChat(
    messages: LlmMessage[],
    opts: { maxOutputTokens: number },
    onUsage: (usage: LlmUsage) => void,
  ): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages,
      max_tokens: opts.maxOutputTokens,
      stream: true,
      stream_options: { include_usage: true },
    });

    let promptTokens = 0;
    let completionTokens = 0;
    let sawUsage = false;

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) yield delta;
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens ?? 0;
        completionTokens = chunk.usage.completion_tokens ?? 0;
        sawUsage = true;
      }
    }

    if (!sawUsage) {
      // Defensive: if the provider omitted usage, over-estimate from the
      // output cap so the Guardian ledger never under-counts.
      completionTokens = opts.maxOutputTokens;
      logger.warn({ model: this.model }, 'llm stream ended without usage; over-estimating cost');
    }
    onUsage({
      llmTokens: promptTokens + completionTokens,
      costMicros: costMicrosFor(this.model, promptTokens, completionTokens),
      model: this.model,
    });
  }
}

let cached: AgentLlm | null | undefined;

/**
 * The configured agent LLM, or null when the feature is off / unkeyed.
 * Agents treat null as "run deterministic mode" — never an error.
 */
export function maybeAgentLlm(): AgentLlmLike | null {
  if (cached !== undefined) return cached;
  const cfg = getConfig();
  if (!cfg.AGENTS_LLM_ENABLED || !cfg.OPENAI_API_KEY) {
    cached = null;
    return cached;
  }
  cached = new AgentLlm(cfg.OPENAI_API_KEY, cfg.AGENTS_LLM_MODEL);
  return cached;
}

/** Test hook. */
export function resetAgentLlmCache(): void {
  cached = undefined;
}
