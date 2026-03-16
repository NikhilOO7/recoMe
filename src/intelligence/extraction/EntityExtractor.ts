import { RuleBasedExtractor } from './RuleBasedExtractor';
import type { KnowledgeGraph } from '@intelligence/graph/KnowledgeGraph';
import type { ContentMetadata } from '@shared/types';
import { dedupe, normalizeTopicKey } from '@shared/utils';
import { createLogger } from '@shared/Logger';

const log = createLogger('EntityExtractor');

type LLMProvider = 'anthropic' | 'openai' | 'gemini';

interface LLMConfig {
  provider: LLMProvider;
  key: string;
}

export class EntityExtractor {
  private readonly rules = new RuleBasedExtractor();
  private llmConfig: LLMConfig | null = null;
  private llmConfigLoaded = false;

  // Circuit breaker: after 3 consecutive LLM failures, fall back to rules for 5 min
  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;
  private static readonly MAX_FAILURES = 3;
  private static readonly CIRCUIT_OPEN_MS = 5 * 60 * 1000; // 5 minutes
  private static readonly RETRY_DELAYS = [1000, 3000]; // backoff delays

  constructor(private readonly graph: KnowledgeGraph) {}

  /**
   * Enrich ContentMetadata with extracted topics and entities.
   * Tries the configured LLM provider first (with retry + circuit breaker),
   * falls back to rule-based.
   */
  async enrich(content: ContentMetadata): Promise<ContentMetadata> {
    const config = await this.getLLMConfig();
    if (config && Date.now() >= this.circuitOpenUntil) {
      for (let attempt = 0; attempt <= EntityExtractor.RETRY_DELAYS.length; attempt++) {
        try {
          const result = await this.enrichWithLLM(content, config);
          this.consecutiveFailures = 0; // reset on success
          return result;
        } catch (err) {
          log.debug(`LLM attempt ${attempt + 1} failed (${config.provider})`, err);
          if (attempt < EntityExtractor.RETRY_DELAYS.length) {
            await this.sleep(EntityExtractor.RETRY_DELAYS[attempt]!);
          }
        }
      }
      // All retries exhausted
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= EntityExtractor.MAX_FAILURES) {
        this.circuitOpenUntil = Date.now() + EntityExtractor.CIRCUIT_OPEN_MS;
        log.warn(`Circuit breaker open — falling back to rules for 5 minutes after ${this.consecutiveFailures} consecutive LLM failures`);
      }
    }
    return this.enrichWithRules(content);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Call when settings change so the LLM config is re-read on next enrich() call. */
  invalidateApiKey(): void {
    this.llmConfigLoaded = false;
    this.llmConfig = null;
  }

  // ── Rule-based ────────────────────────────────────────────────────────────

  private async enrichWithRules(content: ContentMetadata): Promise<ContentMetadata> {
    const text = [content.title, content.creator ?? ''].join(' ');

    const rawTopics = this.rules.extractTopics(text);
    const rawEntities = this.rules.extractEntities(text);

    const resolvedTopics = await this.resolveAliases(rawTopics);
    const resolvedEntities = await this.resolveAliases(rawEntities);

    const topics = dedupe([
      ...content.topics.map(normalizeTopicKey),
      ...resolvedTopics,
    ]);

    const entities = dedupe([
      ...content.entities.map(normalizeTopicKey),
      ...resolvedEntities,
      ...(content.creator ? [normalizeTopicKey(content.creator)] : []),
    ]);

    return { ...content, topics, entities };
  }

  // ── LLM-based ─────────────────────────────────────────────────────────────

  private async enrichWithLLM(content: ContentMetadata, config: LLMConfig): Promise<ContentMetadata> {
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

    let responseText: string;
    switch (config.provider) {
      case 'anthropic': responseText = await this.callAnthropic(prompt, config.key); break;
      case 'openai':    responseText = await this.callOpenAI(prompt, config.key);    break;
      case 'gemini':    responseText = await this.callGemini(prompt, config.key);    break;
    }

    const match = responseText.match(/\{[^{}]*\}/);
    if (!match) throw new Error('No JSON in LLM response');

    const parsed = JSON.parse(match[0]) as { topics?: unknown; entities?: unknown };
    const llmTopics = Array.isArray(parsed.topics) ? (parsed.topics as string[]).map(normalizeTopicKey) : [];
    const llmEntities = Array.isArray(parsed.entities) ? (parsed.entities as string[]).map(normalizeTopicKey) : [];

    const resolvedTopics = await this.resolveAliases(llmTopics);
    const resolvedEntities = await this.resolveAliases(llmEntities);

    const topics = dedupe([...content.topics.map(normalizeTopicKey), ...resolvedTopics]);
    const entities = dedupe([
      ...content.entities.map(normalizeTopicKey),
      ...resolvedEntities,
      ...(content.creator ? [normalizeTopicKey(content.creator)] : []),
    ]);

    log.debug(`[${config.provider}] enriched "${content.title}": topics=${topics.join(',')}`);
    return { ...content, topics, entities };
  }

  // ── Provider implementations ───────────────────────────────────────────────

  private async callAnthropic(prompt: string, key: string): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text().catch(() => '')).slice(0, 80)}`);
    const data = await res.json() as { content: Array<{ text: string }> };
    return data.content[0]?.text ?? '';
  }

  private async callOpenAI(prompt: string, key: string): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-5',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text().catch(() => '')).slice(0, 80)}`);
    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content ?? '';
  }

  private async callGemini(prompt: string, key: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 150 },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text().catch(() => '')).slice(0, 80)}`);
    const data = await res.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
    return data.candidates[0]?.content?.parts[0]?.text ?? '';
  }

  // ── Config helpers ────────────────────────────────────────────────────────

  private async getLLMConfig(): Promise<LLMConfig | null> {
    if (this.llmConfigLoaded) return this.llmConfig;

    try {
      const result = await chrome.storage.sync.get('recome_settings');
      const s = result['recome_settings'] as {
        llm_provider?: string;
        anthropic_api_key?: string;
        openai_api_key?: string;
        gemini_api_key?: string;
      } | undefined;

      const provider = s?.llm_provider as LLMProvider | undefined;
      if (provider) {
        const keyMap: Record<LLMProvider, string | undefined> = {
          anthropic: s?.anthropic_api_key,
          openai: s?.openai_api_key,
          gemini: s?.gemini_api_key,
        };
        const key = keyMap[provider]?.trim();
        this.llmConfig = key ? { provider, key } : null;
      } else {
        this.llmConfig = null;
      }
    } catch {
      this.llmConfig = null;
    }

    this.llmConfigLoaded = true;
    return this.llmConfig;
  }

  private async resolveAliases(terms: string[]): Promise<string[]> {
    const resolved: string[] = [];
    for (const term of terms) {
      const entity = await this.graph.findEntityByName(term);
      resolved.push(entity ? normalizeTopicKey(entity.name) : term);
    }
    return resolved;
  }
}
