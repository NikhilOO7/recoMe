import { RuleBasedExtractor } from './RuleBasedExtractor';
import { getLLMClient } from '@agent/llm/LLMClient';
import type { KnowledgeGraph } from '@intelligence/graph/KnowledgeGraph';
import type { ContentMetadata } from '@shared/types';
import { dedupe, normalizeTopicKey } from '@shared/utils';
import { createLogger } from '@shared/Logger';

const log = createLogger('EntityExtractor');

/** Reject topics that are prices, numbers, measurements, or too short to be meaningful. */
function isJunkTopic(s: string): boolean {
  const cleaned = s.replace(/[_$€£¥,]/g, '');
  // Purely numeric or price-like (e.g. "399.99", "$99", "15%")
  if (/^\d+(\.\d+)?(%|k|m|gb|tb|mb|lbs?|kg|oz|in|cm|mm|px)?$/i.test(cleaned)) return true;
  // Single character
  if (cleaned.length <= 1) return true;
  return false;
}

export class EntityExtractor {
  private readonly rules = new RuleBasedExtractor();

  constructor(private readonly graph: KnowledgeGraph) {}

  /**
   * Enrich ContentMetadata with extracted topics and entities.
   * Tries the configured LLM provider first (via shared LLMClient),
   * falls back to rule-based.
   */
  async enrich(content: ContentMetadata): Promise<ContentMetadata> {
    let result: ContentMetadata = await this.enrichInternal(content);

    // Sanitize: remove price-like, purely numeric, or too-short topics/entities
    result = {
      ...result,
      topics: result.topics.filter((t) => !isJunkTopic(t)),
      entities: result.entities.filter((e) => !isJunkTopic(e)),
    };
    return result;
  }

  /** Call when settings change so the LLM config is re-read on next enrich() call. */
  invalidateApiKey(): void {
    getLLMClient().invalidateConfig();
  }

  private async enrichInternal(content: ContentMetadata): Promise<ContentMetadata> {
    const llm = getLLMClient();
    if (await llm.isConfigured()) {
      try {
        return await this.enrichWithLLM(content);
      } catch (err) {
        log.debug('LLM enrichment failed, falling back to rules', err);
      }
    }
    return this.enrichWithRules(content);
  }

  // ── Rule-based ────────────────────────────────────────────────────────────

  private async enrichWithRules(content: ContentMetadata): Promise<ContentMetadata> {
    const text = [content.title, content.creator ?? ''].join(' ');

    const rawTopics = this.rules.extractTopics(text);
    const rawEntities = this.rules.extractEntities(text);

    const resolvedTopics = await this.resolveAliases(rawTopics);
    const resolvedEntities = await this.resolveAliases(rawEntities);

    const topics = dedupe([...content.topics.map(normalizeTopicKey), ...resolvedTopics]);

    const entities = dedupe([
      ...content.entities.map(normalizeTopicKey),
      ...resolvedEntities,
      ...(content.creator ? [normalizeTopicKey(content.creator)] : []),
    ]);

    return { ...content, topics, entities };
  }

  // ── LLM-based ─────────────────────────────────────────────────────────────

  private async enrichWithLLM(content: ContentMetadata): Promise<ContentMetadata> {
    const prompt = `Extract topics and entities from this social media/web content.

Platform: ${content.platform}
Title: ${content.title}
Creator: ${content.creator ?? 'unknown'}

Return ONLY a JSON object on one line, no explanation:
{"topics":["topic1","topic2"],"entities":["entity1"]}

Rules:
- topics: 1–5 general interest categories in lower_snake_case (e.g. crypto, fitness, politics, tech, gaming)
- entities: 0–3 specific names/brands/creators in lower_snake_case (e.g. mr_beast, amazon, bitcoin)
- Skip generic words; focus on what makes this content distinctive`;

    const llm = getLLMClient();
    const responseText = await llm.call(prompt, { maxTokens: 150 });
    if (!responseText) {
      return this.enrichWithRules(content);
    }

    const match = responseText.match(/\{[^{}]*\}/);
    if (!match) throw new Error('No JSON in LLM response');

    const parsed = JSON.parse(match[0]) as { topics?: unknown; entities?: unknown };
    const llmTopics = Array.isArray(parsed.topics)
      ? (parsed.topics as string[]).map(normalizeTopicKey)
      : [];
    const llmEntities = Array.isArray(parsed.entities)
      ? (parsed.entities as string[]).map(normalizeTopicKey)
      : [];

    const resolvedTopics = await this.resolveAliases(llmTopics);
    const resolvedEntities = await this.resolveAliases(llmEntities);

    const topics = dedupe([...content.topics.map(normalizeTopicKey), ...resolvedTopics]);
    const entities = dedupe([
      ...content.entities.map(normalizeTopicKey),
      ...resolvedEntities,
      ...(content.creator ? [normalizeTopicKey(content.creator)] : []),
    ]);

    log.debug(`LLM enriched "${content.title}": topics=${topics.join(',')}`);
    return { ...content, topics, entities };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async resolveAliases(terms: string[]): Promise<string[]> {
    const resolved: string[] = [];
    for (const term of terms) {
      const entity = await this.graph.findEntityByName(term);
      resolved.push(entity ? normalizeTopicKey(entity.name) : term);
    }
    return resolved;
  }
}
