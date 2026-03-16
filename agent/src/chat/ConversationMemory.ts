import type { LLMMessage } from '../llm/LLMClient';

const STORAGE_KEY = 'recome_conversation';
const MAX_TURNS = 10;

interface StoredConversation {
  messages: LLMMessage[];
  updatedAt: string;
}

/**
 * Manages conversation history for the AI chat engine.
 * Uses chrome.storage.session to survive service worker restarts
 * within the same browser session.
 */
export class ConversationMemory {
  private messages: LLMMessage[] = [];
  private loaded = false;

  /** Load conversation history from storage. */
  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const result = await chrome.storage.session.get(STORAGE_KEY);
      const stored = result[STORAGE_KEY] as StoredConversation | undefined;
      if (stored?.messages) {
        this.messages = stored.messages.slice(-MAX_TURNS * 2); // keep last N turns (user+assistant pairs)
      }
    } catch {
      // session storage may not be available; fall back to in-memory
    }
    this.loaded = true;
  }

  /** Get the conversation history as LLM messages. */
  async getHistory(): Promise<LLMMessage[]> {
    await this.load();
    return [...this.messages];
  }

  /** Add a user message to the conversation. */
  async addUserMessage(content: string): Promise<void> {
    await this.load();
    this.messages.push({ role: 'user', content });
    this.trim();
    await this.persist();
  }

  /** Add an assistant response to the conversation. */
  async addAssistantMessage(content: string): Promise<void> {
    await this.load();
    this.messages.push({ role: 'assistant', content });
    this.trim();
    await this.persist();
  }

  /** Clear the conversation history. */
  async clear(): Promise<void> {
    this.messages = [];
    try {
      await chrome.storage.session.remove(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  private trim(): void {
    // Keep last MAX_TURNS * 2 messages (each turn = user + assistant)
    if (this.messages.length > MAX_TURNS * 2) {
      this.messages = this.messages.slice(-MAX_TURNS * 2);
    }
  }

  private async persist(): Promise<void> {
    try {
      const data: StoredConversation = {
        messages: this.messages,
        updatedAt: new Date().toISOString(),
      };
      await chrome.storage.session.set({ [STORAGE_KEY]: data });
    } catch {
      // session storage may not be available; conversation stays in-memory
    }
  }
}
