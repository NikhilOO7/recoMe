import { ConversationMemory } from '../ConversationMemory';

// ── Chrome API mock ──────────────────────────────────────────────────────────

const mockSessionStorage: Record<string, any> = {};

globalThis.chrome = {
  storage: {
    local: { get: jest.fn(), set: jest.fn() },
    session: {
      get: jest.fn().mockImplementation(async (key: string) => {
        return { [key]: mockSessionStorage[key] };
      }),
      set: jest.fn().mockImplementation(async (data: Record<string, any>) => {
        Object.assign(mockSessionStorage, data);
      }),
      remove: jest.fn().mockImplementation(async (key: string) => {
        delete mockSessionStorage[key];
      }),
    },
    sync: { get: jest.fn(), set: jest.fn() },
  },
  runtime: { sendMessage: jest.fn() },
} as any;

beforeEach(() => {
  // Clear stored data
  for (const key of Object.keys(mockSessionStorage)) {
    delete mockSessionStorage[key];
  }
  jest.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ConversationMemory', () => {
  it('getHistory returns empty array initially', async () => {
    const memory = new ConversationMemory();
    const history = await memory.getHistory();
    expect(history).toEqual([]);
  });

  it('addUserMessage and addAssistantMessage store messages', async () => {
    const memory = new ConversationMemory();

    await memory.addUserMessage('Hello');
    await memory.addAssistantMessage('Hi there!');

    const history = await memory.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ role: 'user', content: 'Hello' });
    expect(history[1]).toEqual({ role: 'assistant', content: 'Hi there!' });
  });

  it('getHistory returns messages in order', async () => {
    const memory = new ConversationMemory();

    await memory.addUserMessage('First');
    await memory.addAssistantMessage('Response 1');
    await memory.addUserMessage('Second');
    await memory.addAssistantMessage('Response 2');
    await memory.addUserMessage('Third');
    await memory.addAssistantMessage('Response 3');

    const history = await memory.getHistory();
    expect(history).toHaveLength(6);
    expect(history[0]!.content).toBe('First');
    expect(history[1]!.content).toBe('Response 1');
    expect(history[2]!.content).toBe('Second');
    expect(history[3]!.content).toBe('Response 2');
    expect(history[4]!.content).toBe('Third');
    expect(history[5]!.content).toBe('Response 3');
  });

  it('respects max turns limit (10 turns = 20 messages)', async () => {
    const memory = new ConversationMemory();

    // Add 12 turns (24 messages) — should be trimmed to 10 turns (20)
    for (let i = 0; i < 12; i++) {
      await memory.addUserMessage(`User message ${i}`);
      await memory.addAssistantMessage(`Assistant message ${i}`);
    }

    const history = await memory.getHistory();
    expect(history).toHaveLength(20);
    // Oldest messages should be trimmed
    expect(history[0]!.content).toBe('User message 2');
    expect(history[1]!.content).toBe('Assistant message 2');
    // Most recent should still be there
    expect(history[history.length - 1]!.content).toBe('Assistant message 11');
  });

  it('clear() empties history', async () => {
    const memory = new ConversationMemory();

    await memory.addUserMessage('Hello');
    await memory.addAssistantMessage('Hi');

    let history = await memory.getHistory();
    expect(history).toHaveLength(2);

    await memory.clear();

    history = await memory.getHistory();
    expect(history).toEqual([]);
  });

  it('clear() calls chrome.storage.session.remove', async () => {
    const memory = new ConversationMemory();
    await memory.addUserMessage('test');
    await memory.clear();

    expect(chrome.storage.session.remove).toHaveBeenCalledWith('recome_conversation');
  });

  it('persists to chrome.storage.session on each message', async () => {
    const memory = new ConversationMemory();
    await memory.addUserMessage('Hello');

    expect(chrome.storage.session.set).toHaveBeenCalled();
    const setCall = (chrome.storage.session.set as jest.Mock).mock.calls[0][0];
    expect(setCall).toHaveProperty('recome_conversation');
    expect(setCall.recome_conversation.messages).toHaveLength(1);
    expect(setCall.recome_conversation).toHaveProperty('updatedAt');
  });

  it('load() restores from chrome.storage.session', async () => {
    // Pre-populate storage
    mockSessionStorage['recome_conversation'] = {
      messages: [
        { role: 'user', content: 'Previously saved' },
        { role: 'assistant', content: 'Yes, from storage' },
      ],
      updatedAt: new Date().toISOString(),
    };

    const memory = new ConversationMemory();
    const history = await memory.getHistory();

    expect(history).toHaveLength(2);
    expect(history[0]!.content).toBe('Previously saved');
    expect(history[1]!.content).toBe('Yes, from storage');
  });

  it('load() trims stored messages to max turns', async () => {
    // Store 25 messages (more than 20 max)
    const messages = [];
    for (let i = 0; i < 25; i++) {
      messages.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `msg-${i}` });
    }
    mockSessionStorage['recome_conversation'] = {
      messages,
      updatedAt: new Date().toISOString(),
    };

    const memory = new ConversationMemory();
    const history = await memory.getHistory();

    expect(history).toHaveLength(20);
    // Should keep the last 20 messages
    expect(history[0]!.content).toBe('msg-5');
  });

  it('getHistory returns a copy, not a reference', async () => {
    const memory = new ConversationMemory();
    await memory.addUserMessage('test');

    const history1 = await memory.getHistory();
    history1.push({ role: 'user', content: 'injected' });

    const history2 = await memory.getHistory();
    expect(history2).toHaveLength(1);
  });

  it('handles chrome.storage.session errors gracefully', async () => {
    (chrome.storage.session.get as jest.Mock).mockRejectedValueOnce(
      new Error('Storage unavailable'),
    );

    const memory = new ConversationMemory();
    const history = await memory.getHistory();
    expect(history).toEqual([]);
  });
});
