import { createLogger } from '@utils/Logger';

const log = createLogger('LLMClient');

// ── Types ────────────────────────────────────────────────────────────────────

export type LLMProvider = 'anthropic' | 'openai' | 'gemini';

export interface LLMConfig {
  provider: LLMProvider;
  key: string;
}

export interface LLMCallOptions {
  /** Max output tokens (default: 500) */
  maxTokens?: number;
  /** System prompt (prepended before the user message) */
  system?: string;
  /** Conversation messages for multi-turn chat */
  messages?: LLMMessage[];
}

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ── Provider model configuration ─────────────────────────────────────────────

const PROVIDER_MODELS: Record<LLMProvider, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-5',
  gemini: 'gemini-2.5-flash',
};

export const PROVIDER_DISPLAY_NAMES: Record<LLMProvider, string> = {
  anthropic: 'Claude Sonnet 4.6',
  openai: 'GPT-5',
  gemini: 'Gemini 2.5 Flash',
};

// ── LLM Client ───────────────────────────────────────────────────────────────

export class LLMClient {
  private config: LLMConfig | null = null;
  private configLoaded = false;

  // Circuit breaker
  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;
  private static readonly MAX_FAILURES = 3;
  private static readonly CIRCUIT_OPEN_MS = 5 * 60 * 1000;
  private static readonly RETRY_DELAYS = [1000, 3000];

  // Response cache (simple LRU)
  private cache = new Map<string, { response: string; timestamp: number }>();
  private static readonly CACHE_MAX = 50;
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 min

  // Data minimization limits — cap content sent to external AI providers
  private static readonly MAX_PROMPT_CHARS = 4000;
  private static readonly MAX_MESSAGE_CHARS = 2000;
  private static readonly MAX_SYSTEM_CHARS = 1500;

  /** Check if an LLM provider is configured and available. */
  async isConfigured(): Promise<boolean> {
    const config = await this.getConfig();
    return config !== null;
  }

  /** Get the current provider display name, or null if not configured. */
  async getProviderName(): Promise<string | null> {
    const config = await this.getConfig();
    return config ? PROVIDER_DISPLAY_NAMES[config.provider] : null;
  }

  /** Force config re-read on next call (e.g. after settings change). */
  invalidateConfig(): void {
    this.configLoaded = false;
    this.config = null;
    // Reset circuit breaker so new config gets a fresh start
    this.consecutiveFailures = 0;
    this.circuitOpenUntil = 0;
  }

  /**
   * Call the configured LLM provider with a prompt.
   * Returns the text response, or null if no provider is configured or circuit is open.
   *
   * Data minimization: prompts and messages are truncated to limit data sent
   * to external AI providers.
   */
  async call(prompt: string, options: LLMCallOptions = {}): Promise<string | null> {
    const config = await this.getConfig();
    if (!config) return null;

    // Data minimization — truncate content before sending to external providers
    prompt = LLMClient.truncateText(prompt, LLMClient.MAX_PROMPT_CHARS);
    if (options.messages) {
      options = {
        ...options,
        messages: options.messages.map((m) => ({
          ...m,
          content: LLMClient.truncateText(m.content, LLMClient.MAX_MESSAGE_CHARS),
        })),
      };
    }
    if (options.system) {
      options = {
        ...options,
        system: LLMClient.truncateText(options.system, LLMClient.MAX_SYSTEM_CHARS),
      };
    }

    // Circuit breaker check
    if (Date.now() < this.circuitOpenUntil) {
      log.debug('Circuit breaker open — skipping LLM call');
      return null;
    }

    // Check cache
    const cacheKey = this.buildCacheKey(prompt, options);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < LLMClient.CACHE_TTL) {
      return cached.response;
    }

    // Retry loop with backoff
    for (let attempt = 0; attempt <= LLMClient.RETRY_DELAYS.length; attempt++) {
      try {
        const response = await this.callProvider(config, prompt, options);
        this.consecutiveFailures = 0;

        // Only cache non-empty responses — treat empty/whitespace as errors
        if (response && response.trim().length > 0) {
          this.cacheResponse(cacheKey, response);
        } else {
          log.debug('LLM returned empty response — not caching');
        }

        return response;
      } catch (err) {
        log.debug(`LLM attempt ${attempt + 1} failed (${config.provider})`, err);
        if (attempt < LLMClient.RETRY_DELAYS.length) {
          await this.sleep(LLMClient.RETRY_DELAYS[attempt]!);
        }
      }
    }

    // All retries exhausted
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= LLMClient.MAX_FAILURES) {
      this.circuitOpenUntil = Date.now() + LLMClient.CIRCUIT_OPEN_MS;
      log.warn(`Circuit breaker open — ${this.consecutiveFailures} consecutive failures`);
    }
    return null;
  }

  // ── Provider implementations ───────────────────────────────────────────────

  private async callProvider(
    config: LLMConfig,
    prompt: string,
    options: LLMCallOptions,
  ): Promise<string> {
    const maxTokens = options.maxTokens ?? 500;

    switch (config.provider) {
      case 'anthropic':
        return this.callAnthropic(config.key, prompt, maxTokens, options);
      case 'openai':
        return this.callOpenAI(config.key, prompt, maxTokens, options);
      case 'gemini':
        return this.callGemini(config.key, prompt, maxTokens, options);
    }
  }

  async callAnthropic(
    key: string,
    prompt: string,
    maxTokens: number,
    options: LLMCallOptions,
  ): Promise<string> {
    const messages: Array<{ role: string; content: string }> = [];

    // Add conversation history if provided
    if (options.messages) {
      for (const msg of options.messages) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    // Add current prompt as user message
    messages.push({ role: 'user', content: prompt });

    const body: Record<string, unknown> = {
      model: PROVIDER_MODELS.anthropic,
      max_tokens: maxTokens,
      messages,
    };
    if (options.system) {
      body['system'] = options.system;
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok)
      throw new Error(
        `Anthropic ${res.status}: ${(await res.text().catch(() => '')).slice(0, 80)}`,
      );
    const data = (await res.json()) as { content: Array<{ text: string }> };
    return data.content[0]?.text ?? '';
  }

  async callOpenAI(
    key: string,
    prompt: string,
    maxTokens: number,
    options: LLMCallOptions,
  ): Promise<string> {
    const messages: Array<{ role: string; content: string }> = [];

    if (options.system) {
      messages.push({ role: 'system', content: options.system });
    }
    if (options.messages) {
      for (const msg of options.messages) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    messages.push({ role: 'user', content: prompt });

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: PROVIDER_MODELS.openai,
        max_tokens: maxTokens,
        messages,
      }),
    });
    if (!res.ok)
      throw new Error(`OpenAI ${res.status}: ${(await res.text().catch(() => '')).slice(0, 80)}`);
    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content ?? '';
  }

  async callGemini(
    key: string,
    prompt: string,
    maxTokens: number,
    options: LLMCallOptions,
  ): Promise<string> {
    // Gemini uses a different format — combine system + history + prompt into contents
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    if (options.system) {
      contents.push({
        role: 'user',
        parts: [{ text: `[System instructions]\n${options.system}` }],
      });
      contents.push({
        role: 'model',
        parts: [{ text: 'Understood. I will follow these instructions.' }],
      });
    }
    if (options.messages) {
      for (const msg of options.messages) {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
    }
    contents.push({ role: 'user', parts: [{ text: prompt }] });

    const model = PROVIDER_MODELS.gemini;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    });
    if (!res.ok)
      throw new Error(`Gemini ${res.status}: ${(await res.text().catch(() => '')).slice(0, 80)}`);
    const data = (await res.json()) as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    };
    return data.candidates[0]?.content?.parts[0]?.text ?? '';
  }

  // ── Config ─────────────────────────────────────────────────────────────────

  async getConfig(): Promise<LLMConfig | null> {
    if (this.configLoaded) return this.config;

    try {
      const result = await chrome.storage.sync.get('recome_settings');
      const s = result['recome_settings'] as
        | {
            llm_provider?: string;
            anthropic_api_key?: string;
            openai_api_key?: string;
            gemini_api_key?: string;
          }
        | undefined;

      const provider = s?.llm_provider as LLMProvider | undefined;
      if (provider) {
        const keyMap: Record<LLMProvider, string | undefined> = {
          anthropic: s?.anthropic_api_key,
          openai: s?.openai_api_key,
          gemini: s?.gemini_api_key,
        };
        const key = keyMap[provider]?.trim();
        this.config = key ? { provider, key } : null;
      } else {
        this.config = null;
      }
    } catch (e) {
      log.debug('Failed to load LLM config from storage', e);
      this.config = null;
    }

    this.configLoaded = true;
    return this.config;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Truncate text to a max character count, appending ellipsis if trimmed */
  private static truncateText(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars) + '\n…[truncated for data minimization]';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private buildCacheKey(prompt: string, options: LLMCallOptions): string {
    // DJB2 hash to avoid collision from truncation
    const raw = [
      prompt,
      options.system ?? '',
      String(options.messages?.length ?? 0),
      options.messages?.map((m) => m.content).join('|') ?? '',
    ].join('\x00');
    let hash = 5381;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) + hash + raw.charCodeAt(i)) | 0; // hash * 33 + c
    }
    return `llm:${hash >>> 0}`;
  }

  private cacheResponse(key: string, response: string): void {
    // Evict oldest if at capacity
    if (this.cache.size >= LLMClient.CACHE_MAX) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, { response, timestamp: Date.now() });
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

let clientInstance: LLMClient | null = null;

export function getLLMClient(): LLMClient {
  if (!clientInstance) {
    clientInstance = new LLMClient();
  }
  return clientInstance;
}
