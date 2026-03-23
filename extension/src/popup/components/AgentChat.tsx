import { useState, useRef, useEffect } from 'react';

interface AgentAction {
  action: string;
  label: string;
  targetUrl?: string;
  candidateIds?: string[];
  metadata?: Record<string, unknown>;
}

interface ChatMessage {
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
  actions?: AgentAction[];
  suggestedFollowups?: string[];
  aiPowered?: boolean;
}

interface AgentChatProps {
  onNavigateToSettings?: () => void;
}

export function AgentChat({ onNavigateToSettings }: AgentChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiMode, setAiMode] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
    // Check if AI is available on mount
    chrome.runtime
      .sendMessage({ type: 'AGENT_AI_STATUS' })
      .then((r) => {
        if (r?.success && r.data?.providerName) {
          setAiMode(r.data.providerName as string);
        }
      })
      .catch(() => undefined);
  }, []);

  async function handleSend(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: msg,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'AGENT_CHAT',
        payload: { message: msg },
      });

      if (response?.success && response.data) {
        const agentMsg = response.data as ChatMessage;
        setMessages((prev) => [...prev, agentMsg]);
      } else {
        const errorCode = response?.error as string | undefined;
        let errorContent = 'Sorry, something went wrong. Please try again.';
        if (errorCode === 'invalid_api_key') {
          errorContent =
            'Your API key appears to be invalid or expired. Check your key in Settings and try again.';
        } else if (errorCode === 'rate_limited') {
          errorContent =
            "You've been rate limited by the AI provider. Wait a moment and try again.";
        }
        setMessages((prev) => [
          ...prev,
          {
            role: 'agent',
            content: errorContent,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'agent',
          content: 'Unable to reach the background service. Please reload the extension.',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleAction(action: AgentAction) {
    if (action.action === 'open_product' && action.metadata?.['url']) {
      window.open(action.metadata['url'] as string, '_blank');
    } else if (action.action === 'save_watchlist' && action.candidateIds?.[0]) {
      chrome.runtime.sendMessage({
        type: 'AGENT_WATCHLIST_ADD',
        payload: {
          entityType: 'product',
          entityId: action.candidateIds[0],
        },
      });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function renderMessageContent(content: string) {
    // Simple markdown rendering: **bold**, *italic*, and line breaks
    return content.split('\n').map((line, i) => {
      const formatted = line
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>');
      return <p key={i} dangerouslySetInnerHTML={{ __html: formatted }} />;
    });
  }

  // Get the last agent message's follow-ups (for showing after the latest response)
  const lastAgentMsg = [...messages].reverse().find((m) => m.role === 'agent');
  const showFollowups =
    !loading && lastAgentMsg?.suggestedFollowups && lastAgentMsg.suggestedFollowups.length > 0;

  return (
    <div className="agent-chat">
      {/* AI mode badge */}
      <div className="agent-mode-badge">
        {aiMode ? (
          <span className="agent-badge agent-badge-ai">AI powered by {aiMode}</span>
        ) : (
          <span className="agent-badge agent-badge-quick">Quick mode</span>
        )}
      </div>

      <div className="agent-messages">
        {messages.length === 0 && (
          <div className="agent-welcome">
            <p className="agent-welcome-title">
              {aiMode ? 'AI Shopping Companion' : 'Shopping Companion'}
            </p>
            <p className="agent-welcome-hint">
              {aiMode
                ? 'I can have real conversations about products, compare options, explain recommendations, and learn your preferences.'
                : 'Ask me to compare products, explain recommendations, manage your watchlist, or declare preferences. I use pattern matching to respond.'}
            </p>

            {/* Quick mode setup prompt */}
            {!aiMode && (
              <div className="agent-setup-card">
                <p className="agent-setup-title">Want smarter, conversational responses?</p>
                <p className="agent-setup-body">
                  Add an API key from any supported provider to unlock AI-powered chat.
                </p>
                <div className="agent-setup-providers">
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="agent-provider-link"
                  >
                    Anthropic (Claude)
                  </a>
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="agent-provider-link"
                  >
                    OpenAI (GPT)
                  </a>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="agent-provider-link"
                  >
                    Google (Gemini)
                  </a>
                </div>
                {onNavigateToSettings && (
                  <button className="agent-setup-btn" onClick={onNavigateToSettings}>
                    Set up in Settings
                  </button>
                )}
              </div>
            )}

            <div className="agent-suggestions">
              {[
                'Which should I buy?',
                'Show my watchlist',
                'Why was this recommended?',
                ...(aiMode ? ['What are my preferences?'] : []),
              ].map((s) => (
                <button key={s} className="agent-suggestion" onClick={() => handleSend(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`agent-msg agent-msg-${msg.role}`}>
            <div className="agent-msg-content">
              {msg.role === 'agent' ? renderMessageContent(msg.content) : <p>{msg.content}</p>}
            </div>
            {msg.actions && msg.actions.length > 0 && (
              <div className="agent-msg-actions">
                {msg.actions.map((action, k) => (
                  <button key={k} className="agent-action-btn" onClick={() => handleAction(action)}>
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="agent-msg agent-msg-agent">
            <div className="agent-msg-content agent-typing">
              <span className="agent-thinking-text">
                {aiMode ? `Thinking with ${aiMode}` : 'Thinking'}...
              </span>
              <span className="agent-typing-dots">
                <span></span>
                <span></span>
                <span></span>
              </span>
            </div>
          </div>
        )}

        {/* Follow-up suggestions */}
        {showFollowups && (
          <div className="agent-followups">
            {lastAgentMsg!.suggestedFollowups!.map((followup, i) => (
              <button key={i} className="agent-followup-btn" onClick={() => handleSend(followup)}>
                {followup}
              </button>
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="agent-input-bar">
        <input
          ref={inputRef}
          type="text"
          className="agent-input"
          placeholder={aiMode ? 'Ask me anything...' : 'Ask about products...'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <button
          className="agent-send-btn"
          onClick={() => handleSend()}
          disabled={!input.trim() || loading}
          aria-label="Send message"
        >
          Send
        </button>
      </div>
    </div>
  );
}
