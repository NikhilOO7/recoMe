import type { GraphEntity, GraphRelation, EntityType, RelationType } from '@shared/types';
import { generateId, now } from '@shared/utils';

function entity(id: string, type: EntityType, name: string, aliases: string[] = []): GraphEntity {
  return { id, type, name, aliases, metadata: {}, created_at: now(), updated_at: now() };
}

function relation(
  sourceId: string,
  targetId: string,
  type: RelationType,
  weight: number,
  bidirectional = false,
): GraphRelation {
  return {
    id: generateId(),
    source_id: sourceId,
    target_id: targetId,
    type,
    weight,
    bidirectional,
    created_at: now(),
    updated_at: now(),
  };
}

// ── Seed Entities ──────────────────────────────────────────────────────────────

export const SEED_ENTITIES: GraphEntity[] = [
  // Crypto cluster
  entity('crypto', 'topic', 'Crypto', ['cryptocurrency', 'digital currency']),
  entity('bitcoin', 'topic', 'Bitcoin', ['BTC', 'btc', 'bitcoin']),
  entity('ethereum', 'topic', 'Ethereum', ['ETH', 'eth', 'ether']),
  entity('nft', 'topic', 'NFT', ['non-fungible token', 'nfts']),
  entity('defi', 'topic', 'DeFi', ['decentralized finance', 'defi']),
  entity('web3', 'topic', 'Web3', ['web 3', 'web3.0']),
  entity('blockchain', 'topic', 'Blockchain', ['block chain']),
  entity('solana', 'topic', 'Solana', ['SOL', 'sol']),
  entity('binance', 'topic', 'Binance', ['BNB', 'bnb']),

  // Tech brands
  entity('apple', 'brand', 'Apple', ['apple inc']),
  entity('google', 'brand', 'Google', ['alphabet']),
  entity('microsoft', 'brand', 'Microsoft', ['MSFT']),
  entity('meta', 'brand', 'Meta', ['facebook inc', 'meta platforms']),
  entity('amazon', 'brand', 'Amazon', ['AWS', 'AMZN']),

  // Apple products
  entity('iphone', 'product', 'iPhone', ['iphone']),
  entity('macbook', 'product', 'MacBook', ['mac book', 'macbook pro', 'macbook air']),
  entity('ipad', 'product', 'iPad', ['ipad']),

  // Tech categories
  entity('programming', 'category', 'Programming', ['coding', 'software development']),
  entity('webdev', 'category', 'Web Development', ['web dev', 'frontend', 'backend']),
  entity('ai_ml', 'category', 'AI & ML', ['artificial intelligence', 'machine learning']),
  entity('gaming', 'category', 'Gaming', ['video games', 'esports']),
  entity('finance', 'category', 'Finance', ['investing', 'stocks', 'trading']),
  entity('entertainment', 'category', 'Entertainment', ['movies', 'music', 'tv']),

  // Content formats
  entity('long_video', 'format', 'Long Video', ['long-form video']),
  entity('short_video', 'format', 'Short Video', ['shorts', 'reels', 'tiktok']),
  entity('article', 'format', 'Article', ['blog post', 'essay']),
  entity('ad', 'format', 'Advertisement', ['sponsored', 'promoted', 'ad']),
];

// ── Seed Relations ────────────────────────────────────────────────────────────

export const SEED_RELATIONS: GraphRelation[] = [
  // Crypto cluster — similar_to propagates affinity
  relation('bitcoin', 'crypto', 'similar_to', 0.95, true),
  relation('ethereum', 'crypto', 'similar_to', 0.90, true),
  relation('solana', 'crypto', 'similar_to', 0.88, true),
  relation('binance', 'crypto', 'similar_to', 0.85, true),
  relation('nft', 'crypto', 'related_to', 0.80, true),
  relation('defi', 'crypto', 'related_to', 0.80, true),
  relation('web3', 'crypto', 'related_to', 0.75, true),
  relation('blockchain', 'crypto', 'related_to', 0.70, true),
  relation('nft', 'web3', 'related_to', 0.85, true),
  relation('defi', 'blockchain', 'related_to', 0.75, true),

  // Apple product hierarchy
  relation('iphone', 'apple', 'owned_by', 1.0),
  relation('macbook', 'apple', 'owned_by', 1.0),
  relation('ipad', 'apple', 'owned_by', 1.0),

  // Tech brand relations
  relation('google', 'microsoft', 'competes_with', 0.7, true),
  relation('google', 'meta', 'competes_with', 0.5, true),
  relation('apple', 'google', 'competes_with', 0.6, true),

  // Category memberships
  relation('gaming', 'entertainment', 'belongs_to', 1.0),
  relation('finance', 'crypto', 'related_to', 0.6, true),

  // Ads are related to all topics (negative signal amplifier)
  relation('ad', 'entertainment', 'has_type', 0.5),
];
