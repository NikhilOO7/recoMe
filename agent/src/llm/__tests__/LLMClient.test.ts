import { LLMClient } from '../LLMClient';

// ── Chrome API mock ──────────────────────────────────────────────────────────

globalThis.chrome = {
  storage: {
    local: { get: jest.fn(), set: jest.fn() },
    session: { get: jest.fn(), set: jest.fn() },
    sync: { get: jest.fn(), set: jest.fn() },
  },
  runtime: { sendMessage: jest.fn() },
} as any;

// ── Fetch mock ───────────────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;
let mockFetch: jest.Mock;

beforeEach(() => {
  mockFetch = jest.fn();
  globalThis.fetch = mockFetch;
  jest.clearAllMocks();
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function configureProvider(provider: string, key: string) {
  const keyField = `${provider}_api_key`;
  (chrome.storage.sync.get as jest.Mock).mockResolvedValue({
    recome_settings: {
      llm_provider: provider,
      [keyField]: key,
    },
  });
}

function mockAnthropicSuccess(text: string) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ content: [{ text }] }),
  });
}

function mockFetchFailure(status = 500) {
  mockFetch.mockResolvedValue({
    ok: false,
    status,
    text: async () => 'Internal Server Error',
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('LLMClient', () => {
  describe('isConfigured', () => {
    it('returns false when no API key is set', async () => {
      (chrome.storage.sync.get as jest.Mock).mockResolvedValue({});
      const client = new LLMClient();
      expect(await client.isConfigured()).toBe(false);
    });

    it('returns false when provider is set but key is empty', async () => {
      (chrome.storage.sync.get as jest.Mock).mockResolvedValue({
        recome_settings: { llm_provider: 'anthropic', anthropic_api_key: '' },
      });
      const client = new LLMClient();
      expect(await client.isConfigured()).toBe(false);
    });

    it('returns true when API key exists', async () => {
      configureProvider('anthropic', 'sk-test-key');
      const client = new LLMClient();
      expect(await client.isConfigured()).toBe(true);
    });

    it('returns true for openai provider with key', async () => {
      configureProvider('openai', 'sk-openai-key');
      const client = new LLMClient();
      expect(await client.isConfigured()).toBe(true);
    });

    it('returns true for gemini provider with key', async () => {
      configureProvider('gemini', 'gemini-api-key');
      const client = new LLMClient();
      expect(await client.isConfigured()).toBe(true);
    });
  });

  describe('call()', () => {
    it('returns null when not configured', async () => {
      (chrome.storage.sync.get as jest.Mock).mockResolvedValue({});
      const client = new LLMClient();
      const result = await client.call('Hello');
      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns response text on success (Anthropic)', async () => {
      configureProvider('anthropic', 'sk-test');
      mockAnthropicSuccess('Hello from Claude');
      const client = new LLMClient();

      const result = await client.call('Say hello');
      expect(result).toBe('Hello from Claude');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'sk-test',
          }),
        }),
      );
    });

    it('returns response text on success (OpenAI)', async () => {
      configureProvider('openai', 'sk-openai');
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'Hello from GPT' } }] }),
      });
      const client = new LLMClient();

      const result = await client.call('Say hello');
      expect(result).toBe('Hello from GPT');
    });

    it('returns response text on success (Gemini)', async () => {
      configureProvider('gemini', 'gem-key');
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Hello from Gemini' }] } }],
        }),
      });
      const client = new LLMClient();

      const result = await client.call('Say hello');
      expect(result).toBe('Hello from Gemini');
    });

    it('respects maxTokens parameter', async () => {
      configureProvider('anthropic', 'sk-test');
      mockAnthropicSuccess('short');
      const client = new LLMClient();

      await client.call('prompt', { maxTokens: 100 });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.max_tokens).toBe(100);
    });

    it('uses default maxTokens of 500 when not specified', async () => {
      configureProvider('anthropic', 'sk-test');
      mockAnthropicSuccess('response');
      const client = new LLMClient();

      await client.call('prompt');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.max_tokens).toBe(500);
    });

    it('passes system prompt for Anthropic', async () => {
      configureProvider('anthropic', 'sk-test');
      mockAnthropicSuccess('response');
      const client = new LLMClient();

      await client.call('prompt', { system: 'You are helpful.' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.system).toBe('You are helpful.');
    });
  });

  describe('circuit breaker', () => {
    it('opens after 3 consecutive failures', async () => {
      configureProvider('anthropic', 'sk-test');
      mockFetchFailure(500);

      const client = new LLMClient();
      jest.useFakeTimers();

      // Each call() does up to 3 attempts (1 initial + 2 retries) then counts as 1 failure.
      // We need 3 call-level failures (9 fetch attempts total) to trip the breaker.
      const results: (string | null)[] = [];
      for (let i = 0; i < 3; i++) {
        const p = client.call(`attempt ${i}`);
        // Flush all pending timers so retry delays resolve
        await jest.runAllTimersAsync();
        results.push(await p);
      }

      expect(results).toEqual([null, null, null]);

      // Now the circuit should be open — next call returns null immediately without fetch
      mockFetch.mockClear();
      const result = await client.call('should be blocked');
      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();

      jest.useRealTimers();
    }, 15000);

    it('resets after timeout (5 min)', async () => {
      configureProvider('anthropic', 'sk-test');
      mockFetchFailure(500);

      const client = new LLMClient();
      jest.useFakeTimers();

      // Trip the breaker
      for (let i = 0; i < 3; i++) {
        const p = client.call(`fail ${i}`);
        await jest.runAllTimersAsync();
        await p;
      }

      // Advance past the 5 min circuit open window
      jest.advanceTimersByTime(5 * 60 * 1000 + 1);

      // Now configure a successful response
      mockAnthropicSuccess('recovered');

      const result = await client.call('after reset');
      expect(result).toBe('recovered');

      jest.useRealTimers();
    }, 15000);
  });

  describe('response caching', () => {
    it('returns cached result for same prompt without new fetch', async () => {
      configureProvider('anthropic', 'sk-test');
      mockAnthropicSuccess('cached response');
      const client = new LLMClient();

      // First call
      const result1 = await client.call('cache me');
      expect(result1).toBe('cached response');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call with same prompt — should use cache
      mockFetch.mockClear();
      const result2 = await client.call('cache me');
      expect(result2).toBe('cached response');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('differentiates cache by system prompt', async () => {
      configureProvider('anthropic', 'sk-test');
      mockAnthropicSuccess('response A');
      const client = new LLMClient();

      await client.call('prompt', { system: 'system A' });
      mockAnthropicSuccess('response B');
      await client.call('prompt', { system: 'system B' });

      // Two separate fetches because system prompt differs
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('does not use expired cache entries', async () => {
      configureProvider('anthropic', 'sk-test');
      mockAnthropicSuccess('fresh');
      const client = new LLMClient();

      jest.useFakeTimers();

      await client.call('prompt');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Advance past cache TTL (5 min)
      jest.advanceTimersByTime(5 * 60 * 1000 + 1);

      mockFetch.mockClear();
      mockAnthropicSuccess('refreshed');
      await client.call('prompt');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });
  });

  describe('invalidateConfig', () => {
    it('forces config re-read on next call', async () => {
      configureProvider('anthropic', 'sk-test');
      const client = new LLMClient();

      expect(await client.isConfigured()).toBe(true);

      // Invalidate and change config to empty
      client.invalidateConfig();
      (chrome.storage.sync.get as jest.Mock).mockResolvedValue({});

      expect(await client.isConfigured()).toBe(false);
    });
  });

  describe('getProviderName', () => {
    it('returns display name when configured', async () => {
      configureProvider('anthropic', 'sk-test');
      const client = new LLMClient();
      expect(await client.getProviderName()).toBe('Claude Sonnet 4.6');
    });

    it('returns null when not configured', async () => {
      (chrome.storage.sync.get as jest.Mock).mockResolvedValue({});
      const client = new LLMClient();
      expect(await client.getProviderName()).toBeNull();
    });
  });
});
