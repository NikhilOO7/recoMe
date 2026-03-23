import * as SecureStore from 'expo-secure-store';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

const DEFAULT_CLOUD_URL = 'https://api.recome.app';

export class AgentService {
  private static instance: AgentService;
  private conversationId: string | null = null;

  private constructor() {}

  static getInstance(): AgentService {
    if (!AgentService.instance) {
      AgentService.instance = new AgentService();
    }
    return AgentService.instance;
  }

  async chat(message: string): Promise<string> {
    const accessToken = await SecureStore.getItemAsync('recome_access_token');
    const cloudUrl = (await SecureStore.getItemAsync('recome_cloud_url')) ?? DEFAULT_CLOUD_URL;

    const res = await fetch(`${cloudUrl}/agent/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        message,
        conversationId: this.conversationId,
      }),
    });

    if (!res.ok) {
      throw new Error(`Agent request failed: ${res.status}`);
    }

    const data = await res.json();
    this.conversationId = data.conversationId ?? this.conversationId;
    return data.reply;
  }

  resetConversation(): void {
    this.conversationId = null;
  }
}
