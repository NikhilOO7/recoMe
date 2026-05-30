import type { UserContext } from '../retrieval';
import type { CandidateEntity } from '@schema/entities';
import type { PageContext } from '@schema/decisions';
import type { LLMMessage } from './LLMClient';
import type { CrossPlatformTopic } from '@brain/graph/CrossPlatformLinker';

// ── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are RecoMe, an AI shopping and browsing companion that lives in the user's browser. You help users make better decisions about what to buy, watch, and read by understanding their preferences.

Your capabilities:
- Compare products and explain tradeoffs
- Recommend the best option based on user preferences
- Explain why content was recommended or hidden
- Track user preferences (brands, topics, intents)
- Manage a watchlist of saved items

Respond conversationally but concisely. Use markdown for formatting when helpful.
When suggesting actions, include them in your JSON response.

IMPORTANT: Always respond with ONLY a JSON object in this exact format:
{"message":"your response text here","actions":[{"action":"action_type","label":"Button label","candidateIds":["id"]}],"suggestedFollowups":["Follow-up question 1","Follow-up question 2"]}

Action types: open_product, save_watchlist, record_intent
Keep suggestedFollowups to 2-3 short options.
If no actions are relevant, use an empty array for actions.`;

// ── Context compression ──────────────────────────────────────────────────────

export class PromptBuilder {
  /**
   * Build a complete chat prompt with compressed user context.
   */
  buildChatPrompt(
    userMessage: string,
    userContext: UserContext,
    conversationHistory: LLMMessage[],
    candidates?: CandidateEntity[],
    pageContext?: PageContext,
    crossPlatformTopics?: CrossPlatformTopic[],
  ): { system: string; messages: LLMMessage[]; prompt: string } {
    const contextBlock = this.compressUserContext(userContext);
    const candidateBlock = candidates?.length ? this.compressCandidates(candidates) : '';
    const pageBlock = pageContext ? this.compressPageContext(pageContext) : '';
    const crossPlatformBlock = crossPlatformTopics?.length
      ? this.compressCrossPlatformContext(crossPlatformTopics)
      : '';

    const system = [
      SYSTEM_PROMPT,
      '',
      '--- USER PROFILE ---',
      contextBlock,
      crossPlatformBlock ? `\n--- CROSS-PLATFORM INTERESTS ---\n${crossPlatformBlock}` : '',
      pageBlock ? `\n--- CURRENT PAGE ---\n${pageBlock}` : '',
      candidateBlock ? `\n--- PRODUCTS ON PAGE ---\n${candidateBlock}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return {
      system,
      messages: conversationHistory,
      prompt: userMessage,
    };
  }

  /**
   * Build a prompt for explaining a recommendation decision.
   */
  buildExplainPrompt(
    candidate: CandidateEntity,
    factors: Array<{ name: string; score: number; explanation: string }>,
    userContext: UserContext,
  ): { system: string; prompt: string } {
    const contextBlock = this.compressUserContext(userContext);
    const factorLines = factors
      .map((f) => `- ${f.name}: ${f.score.toFixed(2)} (${f.explanation})`)
      .join('\n');

    return {
      system: `You are RecoMe, explaining recommendation decisions. Be concise (2-3 sentences). Respond with plain text, no JSON.`,
      prompt: [
        `Explain why this product was scored this way:`,
        `Product: ${candidate.rawText}`,
        `Brand: ${candidate.metadata?.['brand'] ?? 'unknown'}`,
        `Price: ${candidate.metadata?.['price'] ? `$${candidate.metadata['price']}` : 'unknown'}`,
        '',
        'Scoring factors:',
        factorLines,
        '',
        'User profile:',
        contextBlock,
      ].join('\n'),
    };
  }

  /**
   * Build a prompt for comparing products with a narrative.
   */
  buildComparePrompt(
    candidates: CandidateEntity[],
    userContext: UserContext,
    scores?: Array<{ candidateId: string; score: number; decision: string; explanation: string }>,
  ): { system: string; prompt: string } {
    const contextBlock = this.compressUserContext(userContext);
    const candidateBlock = this.compressCandidates(candidates);

    const promptParts = ['Compare these products for the user:', candidateBlock];

    // Include scoring data when available (from brain scoring)
    if (scores && scores.length > 0) {
      promptParts.push('');
      promptParts.push('RecoMe scoring results (higher = better match for user):');
      for (const s of scores) {
        promptParts.push(
          `  ${s.candidateId}: ${s.score.toFixed(2)} (${s.decision}) — ${s.explanation}`,
        );
      }
    }

    promptParts.push('');
    promptParts.push('User profile:');
    promptParts.push(contextBlock);

    return {
      system: `You are RecoMe, helping the user compare products. Write a concise comparison (3-5 sentences) highlighting the key tradeoffs based on the user's preferences. Reference the scoring data to ground your comparison. Respond with plain text, no JSON.`,
      prompt: promptParts.join('\n'),
    };
  }

  // ── Compression helpers ────────────────────────────────────────────────────

  private compressUserContext(ctx: UserContext): string {
    const parts: string[] = [];

    // Brand preferences
    const liked = ctx.brandPreferences.filter((b) => b.sentiment === 'positive');
    const disliked = ctx.brandPreferences.filter((b) => b.sentiment === 'negative');
    if (liked.length > 0)
      parts.push(`Preferred brands: ${liked.map((b) => b.displayName).join(', ')}`);
    if (disliked.length > 0)
      parts.push(`Avoided brands: ${disliked.map((b) => b.displayName).join(', ')}`);

    // Seller preferences
    if (ctx.sellerPreferences.length > 0) {
      parts.push(`Avoided sellers: ${ctx.sellerPreferences.map((s) => s.displayName).join(', ')}`);
    }

    // Active intents
    const modeIntents = ctx.activeIntentTypes.filter((t) =>
      ['budget_sensitive', 'quality_first', 'researching'].includes(t),
    );
    if (modeIntents.length > 0) {
      parts.push(`Active modes: ${modeIntents.map((t) => t.replace(/_/g, ' ')).join(', ')}`);
    }

    // Watchlist summary
    if (ctx.watchlist.length > 0) {
      const items = ctx.watchlist.slice(0, 5).map((w) => w.note || w.entityId);
      parts.push(`Watchlist (${ctx.watchlist.length}): ${items.join(', ')}`);
    }

    // Recent activity
    if (ctx.recentIntents.length > 0) {
      parts.push(`Recent signals: ${ctx.recentIntents.length} preference events`);
    }

    return parts.length > 0 ? parts.join('\n') : 'No preference data yet.';
  }

  private compressCandidates(candidates: CandidateEntity[]): string {
    return candidates
      .slice(0, 8)
      .map((c, i) => {
        const brand = c.metadata?.['brand'] ?? '';
        const price = c.metadata?.['price'] ? `$${c.metadata['price']}` : '';
        const rating = c.metadata?.['rating'] ? `${c.metadata['rating']}★` : '';
        const parts = [brand, price, rating].filter(Boolean).join(', ');
        return `${i + 1}. ${c.rawText}${parts ? ` (${parts})` : ''}`;
      })
      .join('\n');
  }

  private compressPageContext(ctx: PageContext): string {
    const parts = [`Site: ${ctx.site}`, `Page: ${ctx.pageType}`];
    if (ctx.query) parts.push(`Search: "${ctx.query}"`);
    return parts.join(' | ');
  }

  private compressCrossPlatformContext(topics: CrossPlatformTopic[]): string {
    return topics
      .slice(0, 5)
      .map((t) => {
        const name = t.topicKey.replace(/^topic:/, '').replace(/_/g, ' ');
        return `${name} (active on ${t.platforms.join(', ')}, ${t.eventCount} events)`;
      })
      .join('\n');
  }
}
