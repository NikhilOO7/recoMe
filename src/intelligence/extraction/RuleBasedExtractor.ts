import { normalizeTopicKey } from '@shared/utils';

// ── Known entity patterns ─────────────────────────────────────────────────────

const CRYPTO_TERMS = new Set([
  'bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'cryptocurrency', 'nft', 'defi',
  'web3', 'blockchain', 'solana', 'sol', 'binance', 'bnb', 'dogecoin', 'doge',
  'altcoin', 'staking', 'mining', 'wallet', 'defi', 'airdrop', 'metaverse',
]);

const TECH_TERMS = new Set([
  'javascript', 'typescript', 'python', 'react', 'vue', 'angular', 'nodejs',
  'nextjs', 'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'devops', 'ci/cd',
  'machine learning', 'ai', 'openai', 'chatgpt', 'llm', 'neural network',
  'programming', 'coding', 'software', 'developer', 'api', 'database', 'sql',
]);

const FINANCE_TERMS = new Set([
  'stocks', 'trading', 'investing', 'forex', 'options', 'etf', 'bonds',
  'portfolio', 'dividend', 'nasdaq', 's&p', 'dow jones', 'recession', 'inflation',
]);

const POLITICAL_TERMS = new Set([
  'election', 'congress', 'senate', 'democrat', 'republican', 'political',
  'government', 'policy', 'vote', 'president', 'campaign',
]);

const ENTERTAINMENT_TERMS = new Set([
  'movie', 'film', 'series', 'netflix', 'streaming', 'music', 'album',
  'concert', 'gaming', 'esports', 'twitch', 'youtube',
]);

const HEALTH_TERMS = new Set([
  'fitness', 'workout', 'diet', 'nutrition', 'mental health', 'wellness',
  'meditation', 'yoga', 'exercise', 'supplement',
]);

// Regex for hashtags and @mentions
const HASHTAG_RE = /#([\w]+)/g;
const MENTION_RE = /@([\w.]+)/g;

// ── Rule-based entity extractor ───────────────────────────────────────────────

export class RuleBasedExtractor {
  /**
   * Extract normalized topic strings from a piece of text.
   */
  extractTopics(text: string): string[] {
    const normalized = text.toLowerCase();
    const topics = new Set<string>();

    this.matchTermSet(normalized, CRYPTO_TERMS, topics);
    this.matchTermSet(normalized, TECH_TERMS, topics);
    this.matchTermSet(normalized, FINANCE_TERMS, topics);
    this.matchTermSet(normalized, POLITICAL_TERMS, topics);
    this.matchTermSet(normalized, ENTERTAINMENT_TERMS, topics);
    this.matchTermSet(normalized, HEALTH_TERMS, topics);

    // Extract hashtags as topics
    for (const match of text.matchAll(HASHTAG_RE)) {
      const tag = match[1];
      if (tag) topics.add(normalizeTopicKey(tag));
    }

    return [...topics];
  }

  /**
   * Extract named entities (creators, brands) from text.
   */
  extractEntities(text: string): string[] {
    const entities = new Set<string>();

    // Extract @mentions as creator entities
    for (const match of text.matchAll(MENTION_RE)) {
      const mention = match[1];
      if (mention) entities.add(normalizeTopicKey(mention));
    }

    return [...entities];
  }

  /**
   * Check if text contains ad/sponsored signals.
   */
  isSponsored(text: string): boolean {
    const lower = text.toLowerCase();
    return (
      lower.includes('sponsored') ||
      lower.includes('promoted') ||
      lower.includes('advertisement') ||
      lower.includes('#ad') ||
      lower.includes('#sponsored')
    );
  }

  private matchTermSet(text: string, terms: Set<string>, result: Set<string>): void {
    for (const term of terms) {
      if (text.includes(term)) {
        result.add(normalizeTopicKey(term));
      }
    }
  }
}
