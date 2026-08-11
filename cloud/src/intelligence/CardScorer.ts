/**
 * CardScorer — per-card scoring for the extension's in-page badge surface.
 *
 * Two-stage pipeline:
 *
 *   1. **Deterministic pre-score** — topic-overlap math against the user's
 *      top intents (Cypher HAS_INTENT.strength). Cheap, runs for every
 *      card, never costs LLM tokens. Output: score 0-1, verdict, sources.
 *
 *   2. **LLM polish** (opt-in via CARDSCORER_LLM_ENABLED env) — re-writes
 *      the `reason` text for the top-N cards using GPT-4o-mini grounded in
 *      the matched topics. The verdict + score stay deterministic (the
 *      LLM only writes prose, not policy), so dishonesty and prompt
 *      injection can't flip a "relevant" badge to "filtered" or vice
 *      versa. Other cards keep their deterministic reason.
 *
 * Cost guard (v1): hard ceiling of MAX_LLM_CALLS_PER_REQUEST per /score
 * POST so a malicious or buggy client can't pile up tokens. Per-user
 * daily cap (Guardian-style AgentRun.costMicros) is dev-plan WS-5
 * follow-up; for now the env flag + per-request cap are enough.
 *
 * Eval set (dev-plan WS-5 P3.2): 50 hand-labelled tuples deferred —
 * needs production-shape page captures + manual judgement calls. Without
 * it we can't quantify "LLM beats deterministic on N% of cards", so
 * shipping the LLM path off-by-default is the honest move.
 *
 * Provider: OpenAI today (SDK + key already wired). Anthropic Haiku per
 * HLD §4 is a one-config swap when ANTHROPIC_API_KEY lands.
 */

import OpenAI from 'openai';
import { logger } from '../observability/logger.js';

export type CardVerdict = 'relevant' | 'caution' | 'filtered' | 'neutral';

export interface CardInput {
  id: string;
  title: string;
  brand?: string;
  url?: string;
}

export interface CardScore {
  id: string;
  score: number;
  verdict: CardVerdict;
  reason: string;
  /**
   * Graph topics this card matched, strongest first (≤3). The client's
   * feedback actions (More like this / Not for me) attach boost/block
   * signals to exactly these topics — never to invented ones.
   */
  matchedTopics: string[];
}

export interface IntentRow {
  topicName: string;
  strength: number;
}

/** Whole-word/phrase presence: "desk" matches "a desk!" but never "desktop". */
export function topicMatchesText(topic: string, text: string): boolean {
  const escaped = topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
}

export interface CardScorerOptions {
  /** Set true to enable the LLM-polish second stage. Default off in dev. */
  llmEnabled?: boolean;
  /** OpenAI key — required when llmEnabled. */
  openaiKey?: string;
  /** Model name (default 'gpt-4o-mini' — Haiku-equivalent cost band). */
  model?: string;
}

/** Hard ceiling per request — bounds cost even if a caller sends 50 cards. */
const MAX_LLM_CALLS_PER_REQUEST = 10;
/** Cards flagged with these words skip LLM polish (we don't fund clickbait). */
const FLAG_WORDS = /miracle|guaranteed cure|forbidden|secret formula|big pharma/i;

export class CardScorer {
  private llm: OpenAI | null = null;
  private model: string;
  private llmEnabled: boolean;

  constructor(opts: CardScorerOptions = {}) {
    this.llmEnabled = !!opts.llmEnabled && !!opts.openaiKey;
    this.model = opts.model ?? 'gpt-4o-mini';
    if (this.llmEnabled && opts.openaiKey) {
      this.llm = new OpenAI({ apiKey: opts.openaiKey });
    }
  }

  /**
   * Score a batch of cards against a user's intents.
   * Always returns one score per input card, in input order.
   */
  async score(input: { intents: IntentRow[]; cards: CardInput[] }): Promise<CardScore[]> {
    const topicWeight = new Map<string, number>();
    for (const i of input.intents) {
      topicWeight.set(i.topicName.toLowerCase(), Math.min(1, Math.max(0, i.strength)));
    }

    // Stage 1 — deterministic per-card score + verdict + cheap reason.
    const baseline = input.cards.map((card) => this.preScore(card, topicWeight));

    if (!this.llmEnabled || !this.llm) return baseline;

    // Stage 2 — pick LLM-eligible cards (skip filtered / no-matches), top N
    // by score, and polish their reasoning. Verdict stays untouched.
    const eligible = baseline
      .map((s, i) => ({ s, card: input.cards[i]! }))
      .filter(({ s }) => s.verdict !== 'filtered' && s.score > 0)
      .sort((a, b) => b.s.score - a.s.score)
      .slice(0, MAX_LLM_CALLS_PER_REQUEST);

    if (eligible.length === 0) return baseline;

    const polished = await this.polishMany(eligible, input.intents).catch((err) => {
      // LLM failures degrade silently to deterministic — never block the page.
      logger.warn({ err }, 'CardScorer LLM polish failed; using deterministic');
      return null;
    });

    if (!polished) return baseline;

    // Splice polished reasons back into the baseline result, preserving order.
    const byId = new Map(polished.map((p) => [p.id, p]));
    return baseline.map((s) => {
      const p = byId.get(s.id);
      return p ? { ...s, reason: p.reason } : s;
    });
  }

  /** Deterministic stage. Pure function; no I/O. */
  private preScore(card: CardInput, topicWeight: Map<string, number>): CardScore {
    const text = (card.title + ' ' + (card.brand ?? '')).toLowerCase();
    let matched = 0;
    const matches: Array<{ topic: string; w: number }> = [];
    for (const [topic, w] of topicWeight) {
      // Word-boundary matching, minimum 4 chars: plain substring matching
      // let the topic "men" match inside "replaceMENt" and told a user they'd
      // "been researching men across multiple platforms". Never again.
      if (topic.length < 4) continue;
      if (topicMatchesText(topic, text)) {
        matched += w;
        matches.push({ topic, w });
      }
    }
    const score = Math.min(1, matched);

    let verdict: CardVerdict;
    if (score >= 0.7) verdict = 'relevant';
    else if (score >= 0.4) verdict = 'neutral';
    else if (score > 0) verdict = 'caution';
    else verdict = 'neutral';

    if (FLAG_WORDS.test(card.title)) verdict = 'filtered';

    const topMatches = matches.sort((a, b) => b.w - a.w).slice(0, 3);
    let reason: string;
    if (verdict === 'filtered') {
      // Honest attribution: this is the deterministic claim filter, not an
      // agent run (the old copy credited GuardianAgent, which never ran here).
      reason = 'Unverified marketing claims detected — dimmed by the claim filter.';
    } else if (topMatches.length === 0) {
      reason = 'No signal from your graph yet — neutral.';
    } else if (verdict === 'relevant') {
      reason = `Strong match: you've been researching ${topMatches
        .map((m) => m.topic)
        .join(', ')} across multiple platforms.`;
    } else if (verdict === 'caution') {
      reason = `Conflicting signals in your research history for ${topMatches[0]!.topic}.`;
    } else {
      reason = `Limited evidence in your specific context for ${topMatches[0]!.topic}.`;
    }

    return {
      id: card.id,
      score: Number(score.toFixed(2)),
      verdict,
      reason,
      matchedTopics: topMatches.map((m) => m.topic),
    };
  }

  /**
   * Single LLM call that polishes N cards at once (cheaper than N separate
   * calls). The prompt grounds reasoning in the user's actual matched
   * topics so the LLM can't invent context — and we re-parse the response
   * back into {id → reason} mappings so a hallucinated id is dropped.
   */
  private async polishMany(
    items: Array<{ s: CardScore; card: CardInput }>,
    intents: IntentRow[],
  ): Promise<Array<{ id: string; reason: string }>> {
    if (!this.llm) return [];

    const topicSummary = intents
      .slice(0, 8)
      .map((i) => `- ${i.topicName} (weight ${i.strength.toFixed(2)})`)
      .join('\n');

    const cardSummary = items
      .map(
        ({ s, card }) =>
          `id=${s.id}  verdict=${s.verdict}  score=${s.score}\n  title: ${card.title}` +
          (card.brand ? `\n  brand: ${card.brand}` : ''),
      )
      .join('\n\n');

    const prompt = [
      "You write one-sentence reasoning strings for product / video / post cards based on a user's interest graph.",
      "You MUST NOT invent context the user didn't research.",
      'You MUST keep the verdict the system already assigned; only the reasoning is yours to write.',
      'Each reason is at most 28 words, in second-person ("you\'ve been researching…", "this aligns with…").',
      '',
      "User's top interest topics (with weights):",
      topicSummary || '(no topics yet)',
      '',
      'Cards to write reasons for:',
      cardSummary,
      '',
      'Respond as JSON: { "reasons": [{ "id": "...", "reason": "..." }, ...] }. Include exactly one entry per input id.',
    ].join('\n');

    const completion = await this.llm.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 600,
      temperature: 0.3,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return [];

    const parsed = JSON.parse(raw) as { reasons?: Array<{ id: string; reason: string }> };
    return Array.isArray(parsed.reasons) ? parsed.reasons : [];
  }
}
