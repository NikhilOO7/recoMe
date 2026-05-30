import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { UsageTracker } from '../billing/UsageTracker.js';
import type { Tier } from '@prisma/client';

const chatSchema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().optional(),
});

// In-memory conversation store (upgrade to Redis for production)
const conversations = new Map<string, Array<{ role: string; content: string }>>();

export function createAgentRoutes(): Hono {
  const app = new Hono();
  const usage = new UsageTracker();

  app.use('*', authMiddleware);

  // POST /agent/chat
  app.post('/chat', async (c) => {
    const userId = c.get('userId') as string;
    const tier = c.get('tier') as Tier;

    const allowed = await usage.checkAndIncrement(userId, tier, 'brain_queries');
    if (!allowed) {
      return c.json({ error: 'Brain query limit reached for this billing period' }, 429);
    }

    const body = chatSchema.safeParse(await c.req.json());
    if (!body.success) return c.json({ error: 'Invalid input' }, 400);

    const { message, conversationId } = body.data;
    const convId = conversationId ?? `conv_${userId}_${Date.now()}`;

    // Get or create conversation history
    if (!conversations.has(convId)) {
      conversations.set(convId, []);
    }
    const history = conversations.get(convId)!;
    history.push({ role: 'user', content: message });

    // Trim to last 20 messages
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }

    // Generate response (placeholder — integrate with LLM provider)
    const reply = generateReply(message);
    history.push({ role: 'assistant', content: reply });

    return c.json({ reply, conversationId: convId });
  });

  return app;
}

function generateReply(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('recommend') || lower.includes('suggestion')) {
    return "Based on your preferences, I can help find recommendations. Could you tell me what category you're interested in? (e.g., electronics, books, entertainment)";
  }
  if (lower.includes('price') || lower.includes('deal') || lower.includes('cheap')) {
    return 'I can check your watchlist for price drops. Would you like me to review your tracked items for the best current deals?';
  }
  if (lower.includes('preference') || lower.includes('interest')) {
    return 'Your preference profile helps me tailor recommendations. You can view and manage your preferences in the Preferences tab.';
  }
  if (lower.includes('help') || lower.includes('what can you')) {
    return 'I can help you with:\n• Finding personalized recommendations\n• Tracking prices and deals\n• Managing your preferences\n• Discovering new content across platforms\n\nJust ask me anything!';
  }

  return "I'm your RecoMe assistant. I can help with recommendations, price tracking, and preference management. What would you like to know?";
}
