# RecoMe Knowledge Graph System

> Entity relationships that enable intelligent preference propagation.

---

## Table of Contents

1. [Overview](#overview)
2. [Core Concepts](#core-concepts)
3. [Entity Types](#entity-types)
4. [Relation Types](#relation-types)
5. [Affinity Calculation](#affinity-calculation)
6. [Graph Operations](#graph-operations)
7. [Seed Data](#seed-data)
8. [Implementation](#implementation)
9. [Visual Examples](#visual-examples)

---

## Overview

### The Problem

Traditional content filtering is literal:

- Block "crypto" → Only blocks content with exact word "crypto"
- Bitcoin videos still appear
- Ethereum content still shows
- NFT recommendations continue

### The Solution

RecoMe's Knowledge Graph understands relationships:

- Block "crypto" → Also blocks bitcoin, ethereum, NFT, DeFi, Web3
- Like "Apple" → Boosts iPhone, MacBook, related tech content
- Relationships propagate with decay over distance

```
USER blocks CRYPTO
       │
       ├── similar_to → BITCOIN (propagate: -0.7)
       ├── similar_to → ETHEREUM (propagate: -0.63)
       ├── similar_to → NFT (propagate: -0.6)
       └── similar_to → DEFI (propagate: -0.56)
```

---

## Core Concepts

### Entities

Entities are nodes in the graph representing concepts, people, brands, etc.

```typescript
interface Entity {
  id: string; // Unique identifier
  type: EntityType; // Category of entity
  name: string; // Display name
  aliases: string[]; // Alternative names for matching
  properties: Record<string, unknown>; // Additional metadata
  embedding?: number[]; // Optional vector embedding
  created_at: number;
  updated_at: number;
}
```

### Relations

Relations are edges connecting entities with typed, weighted connections.

```typescript
interface Relation {
  id: string; // Unique identifier
  source_id: string; // From entity
  target_id: string; // To entity
  type: RelationType; // Type of relationship
  weight: number; // Strength (0.0 - 1.0)
  confidence: number; // How sure we are (0.0 - 1.0)
  bidirectional: boolean; // Applies both ways?
  properties: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}
```

### Affinity

Affinity is the calculated preference score between user and entity.

```
Affinity Range: -1.0 to +1.0

-1.0        -0.5        0         +0.5       +1.0
  │           │         │           │          │
  ▼           ▼         ▼           ▼          ▼
BLOCKED    DISLIKE   NEUTRAL     LIKE      FAVORITE
```

---

## Entity Types

### User Entities

```typescript
type UserEntityType = 'user';

// Example
{
  id: 'user_local',
  type: 'user',
  name: 'Local User',
  aliases: [],
  properties: {
    created_at: 1704067200000,
    preferences_version: 1
  }
}
```

### Content Entities

```typescript
type ContentEntityType =
  | 'creator'      // Content creators (channels, authors)
  | 'brand'        // Companies, brands
  | 'product'      // Specific products
  | 'topic'        // Topics, subjects
  | 'category'     // Categories, genres
  | 'content_type' // Video, article, review, etc.
  | 'content';     // Individual content items

// Examples
{ id: 'creator_mkbhd', type: 'creator', name: 'MKBHD', aliases: ['Marques Brownlee'] }
{ id: 'brand_apple', type: 'brand', name: 'Apple', aliases: ['Apple Inc.'] }
{ id: 'product_iphone', type: 'product', name: 'iPhone', aliases: ['iPhone 15', 'Apple iPhone'] }
{ id: 'topic_crypto', type: 'topic', name: 'crypto', aliases: ['cryptocurrency', 'cryptocurrencies'] }
{ id: 'category_tech', type: 'category', name: 'technology', aliases: ['tech'] }
{ id: 'content_type_review', type: 'content_type', name: 'review', aliases: ['reviews'] }
```

### Context Entities

```typescript
type ContextEntityType =
  | 'sentiment'    // Positive, negative, neutral
  | 'audience'     // Beginner, expert, general
  | 'format';      // Long-form, short, tutorial

// Examples
{ id: 'sentiment_positive', type: 'sentiment', name: 'positive' }
{ id: 'audience_beginner', type: 'audience', name: 'beginner' }
{ id: 'format_tutorial', type: 'format', name: 'tutorial' }
```

---

## Relation Types

### User Preference Relations

These connect the user to entities expressing preferences.

| Type                | Direction      | Description          | Weight Meaning        |
| ------------------- | -------------- | -------------------- | --------------------- |
| `interested_in`     | user → entity  | User likes this      | 0.5-1.0 = strength    |
| `not_interested_in` | user → entity  | User dislikes        | 0.5-1.0 = strength    |
| `one_time_interest` | user → entity  | Temporary interest   | 1.0 = full strength   |
| `follows`           | user → creator | User follows creator | 1.0 = following       |
| `blocked`           | user → entity  | Permanent block      | 1.0 = blocked forever |

```typescript
// User blocks crypto
{
  source_id: 'user_local',
  target_id: 'topic_crypto',
  type: 'blocked',
  weight: 1.0,
  confidence: 1.0,
  bidirectional: false
}
```

### Content Relations

These describe how content relates to other entities.

| Type         | Direction              | Description               |
| ------------ | ---------------------- | ------------------------- |
| `created_by` | content → creator      | Who made this content     |
| `about`      | content → topic        | What the content is about |
| `features`   | content → product      | Products shown/discussed  |
| `belongs_to` | content → category     | Content category          |
| `has_type`   | content → content_type | Type of content           |
| `targets`    | content → audience     | Intended audience         |
| `has_format` | content → format       | Content format            |

### Entity-Entity Relations

These define relationships between non-user entities.

| Type            | Bidirectional | Description                              |
| --------------- | ------------- | ---------------------------------------- |
| `is_a`          | No            | Hierarchy (iPhone is_a smartphone)       |
| `part_of`       | No            | Composition (DeFi part_of crypto)        |
| `owned_by`      | No            | Ownership (iPhone owned_by Apple)        |
| `similar_to`    | Yes           | Similarity (bitcoin similar_to ethereum) |
| `opposite_of`   | Yes           | Opposition (AMD opposite_of Intel)       |
| `related_to`    | Yes           | Generic relation                         |
| `competes_with` | Yes           | Competition                              |

---

## Affinity Calculation

### Direct Relations

For direct user-entity relations:

```typescript
function getDirectAffinity(userId: string, entityId: string): number {
  const relation = getRelation(userId, entityId);

  if (!relation) return 0;

  switch (relation.type) {
    case 'blocked':
      return -1.0 * relation.weight;
    case 'not_interested_in':
      return -1.0 * relation.weight * relation.confidence;
    case 'interested_in':
    case 'follows':
      return 1.0 * relation.weight * relation.confidence;
    case 'one_time_interest':
      return 0; // No permanent effect
    default:
      return 0;
  }
}
```

### Path-Based Propagation

For indirect relations, affinity propagates with decay:

```
DECAY_FACTOR = 0.7 per hop
MAX_DEPTH = 3

Path Score = Base Score × (DECAY_FACTOR ^ depth)
```

**Example: User blocked crypto**

```
Depth 0: crypto          → affinity = -1.0
Depth 1: bitcoin         → affinity = -1.0 × 0.7 = -0.70
Depth 1: ethereum        → affinity = -1.0 × 0.7 = -0.70
Depth 2: altcoin         → affinity = -0.7 × 0.7 = -0.49
Depth 2: smart contracts → affinity = -0.7 × 0.7 = -0.49
Depth 3: Solana          → affinity = -0.49 × 0.7 = -0.34
```

### Aggregation

When multiple paths exist, aggregate with max-magnitude:

```typescript
function calculateEntityAffinity(userId: string, entityId: string): number {
  const scores: number[] = [];

  // Direct relation
  const direct = getDirectAffinity(userId, entityId);
  if (direct !== 0) scores.push(direct);

  // Path-based (BFS with depth limit)
  const paths = findAllPaths(userId, entityId, MAX_DEPTH);
  for (const path of paths) {
    const pathScore = calculatePathScore(path);
    scores.push(pathScore);
  }

  if (scores.length === 0) return 0;

  // Take max magnitude (most extreme wins)
  return scores.reduce((max, score) => (Math.abs(score) > Math.abs(max) ? score : max), 0);
}
```

### Weighting by Relation Type

Different relation types have different propagation weights:

```typescript
const RELATION_WEIGHTS = {
  similar_to: 0.9, // High propagation
  is_a: 0.8, // Strong inheritance
  part_of: 0.7, // Good propagation
  owned_by: 0.6, // Moderate
  related_to: 0.5, // Weak propagation
  competes_with: 0.3, // Opposite effect
  opposite_of: -0.8, // Inverts affinity
};
```

---

## Graph Operations

### Adding Entities

```typescript
interface IKnowledgeGraph {
  addEntity(entity: Omit<Entity, 'id' | 'created_at' | 'updated_at'>): Entity;
}

// Example
const crypto = graph.addEntity({
  type: 'topic',
  name: 'crypto',
  aliases: ['cryptocurrency', 'cryptocurrencies'],
  properties: {},
});
// Returns: { id: 'topic_crypto', type: 'topic', name: 'crypto', ... }
```

### Adding Relations

```typescript
interface IKnowledgeGraph {
  addRelation(relation: Omit<Relation, 'id' | 'created_at' | 'updated_at'>): Relation;
}

// Example
graph.addRelation({
  source_id: 'topic_crypto',
  target_id: 'topic_bitcoin',
  type: 'similar_to',
  weight: 0.95,
  confidence: 1.0,
  bidirectional: true,
  properties: {},
});
```

### Querying

```typescript
interface IKnowledgeGraph {
  // Get entity by ID or alias
  getEntity(idOrAlias: string): Entity | null;

  // Get all entities of a type
  getEntitiesByType(type: EntityType): Entity[];

  // Get relations for an entity
  getRelations(
    entityId: string,
    direction?: 'outgoing' | 'incoming' | 'both',
    type?: RelationType,
  ): Relation[];

  // Find similar entities
  findSimilar(entityId: string, limit?: number): Array<{ entity: Entity; score: number }>;

  // Find path between entities
  findPath(sourceId: string, targetId: string, maxDepth?: number): string[] | null;
}
```

### Traversal

```typescript
interface TraverseOptions {
  maxDepth?: number; // Default: 3
  relationTypes?: RelationType[]; // Filter by relation type
  decayFactor?: number; // Default: 0.7
}

interface TraversalResult {
  entity: Entity;
  depth: number;
  path: string[];
  score: number;
}

function traverse(sourceId: string, options?: TraverseOptions): TraversalResult[] {
  // BFS traversal with score decay
}
```

---

## Seed Data

### Pre-loaded Knowledge

RecoMe comes with pre-seeded knowledge for common domains:

#### Crypto Cluster

```typescript
const CRYPTO_SEED = [
  // Entities
  { type: 'topic', name: 'crypto', aliases: ['cryptocurrency'] },
  { type: 'topic', name: 'bitcoin', aliases: ['btc'] },
  { type: 'topic', name: 'ethereum', aliases: ['eth'] },
  { type: 'topic', name: 'NFT', aliases: ['nfts', 'non-fungible token'] },
  { type: 'topic', name: 'DeFi', aliases: ['decentralized finance'] },
  { type: 'topic', name: 'Web3' },
  { type: 'topic', name: 'blockchain' },

  // Relations
  { source: 'crypto', target: 'bitcoin', type: 'similar_to', weight: 0.95 },
  { source: 'crypto', target: 'ethereum', type: 'similar_to', weight: 0.9 },
  { source: 'crypto', target: 'NFT', type: 'similar_to', weight: 0.85 },
  { source: 'crypto', target: 'DeFi', type: 'similar_to', weight: 0.8 },
  { source: 'crypto', target: 'Web3', type: 'similar_to', weight: 0.75 },
  { source: 'NFT', target: 'DeFi', type: 'part_of', weight: 0.6 },
  { source: 'bitcoin', target: 'blockchain', type: 'part_of', weight: 0.9 },
];
```

#### Tech Brands

```typescript
const TECH_BRANDS_SEED = [
  // Entities
  { type: 'brand', name: 'Apple', aliases: ['Apple Inc.'] },
  { type: 'brand', name: 'Google', aliases: ['Alphabet'] },
  { type: 'brand', name: 'Microsoft' },
  { type: 'brand', name: 'Samsung' },
  { type: 'product', name: 'iPhone' },
  { type: 'product', name: 'MacBook' },
  { type: 'product', name: 'Pixel' },
  { type: 'product', name: 'Galaxy' },
  { type: 'category', name: 'smartphone' },
  { type: 'category', name: 'laptop' },

  // Relations
  { source: 'iPhone', target: 'Apple', type: 'owned_by', weight: 1.0 },
  { source: 'MacBook', target: 'Apple', type: 'owned_by', weight: 1.0 },
  { source: 'Pixel', target: 'Google', type: 'owned_by', weight: 1.0 },
  { source: 'Galaxy', target: 'Samsung', type: 'owned_by', weight: 1.0 },
  { source: 'iPhone', target: 'smartphone', type: 'is_a', weight: 1.0 },
  { source: 'Pixel', target: 'smartphone', type: 'is_a', weight: 1.0 },
  { source: 'Galaxy', target: 'smartphone', type: 'is_a', weight: 1.0 },
  { source: 'MacBook', target: 'laptop', type: 'is_a', weight: 1.0 },
  { source: 'iPhone', target: 'Galaxy', type: 'competes_with', weight: 0.9 },
  { source: 'Apple', target: 'Samsung', type: 'competes_with', weight: 0.8 },
];
```

#### Categories

```typescript
const CATEGORIES_SEED = [
  // Entertainment
  { type: 'category', name: 'entertainment' },
  { type: 'category', name: 'gaming' },
  { type: 'category', name: 'movies' },
  { type: 'category', name: 'music' },

  { source: 'gaming', target: 'entertainment', type: 'belongs_to', weight: 1.0 },
  { source: 'movies', target: 'entertainment', type: 'belongs_to', weight: 1.0 },
  { source: 'music', target: 'entertainment', type: 'belongs_to', weight: 1.0 },

  // Education
  { type: 'category', name: 'education' },
  { type: 'category', name: 'tutorial' },
  { type: 'category', name: 'how-to' },

  { source: 'tutorial', target: 'education', type: 'belongs_to', weight: 1.0 },
  { source: 'how-to', target: 'education', type: 'belongs_to', weight: 1.0 },
  { source: 'tutorial', target: 'how-to', type: 'similar_to', weight: 0.9 },
];
```

---

## Implementation

### KnowledgeGraph Class

```typescript
// src/intelligence/graph/KnowledgeGraph.ts

export class KnowledgeGraph implements IKnowledgeGraph {
  private entities: Map<string, Entity> = new Map();
  private relations: Map<string, Relation> = new Map();
  private aliasIndex: Map<string, string> = new Map(); // alias → entityId
  private outgoingIndex: Map<string, Set<string>> = new Map(); // entityId → relationIds
  private incomingIndex: Map<string, Set<string>> = new Map(); // entityId → relationIds

  constructor(private store: IGraphStore) {}

  async initialize(): Promise<void> {
    // Load from IndexedDB
    const entities = await this.store.getAllEntities();
    const relations = await this.store.getAllRelations();

    for (const entity of entities) {
      this.indexEntity(entity);
    }

    for (const relation of relations) {
      this.indexRelation(relation);
    }
  }

  addEntity(data: Omit<Entity, 'id' | 'created_at' | 'updated_at'>): Entity {
    const entity: Entity = {
      ...data,
      id: this.generateEntityId(data.type, data.name),
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    this.indexEntity(entity);
    this.store.saveEntity(entity); // Async, fire-and-forget

    return entity;
  }

  getEntity(idOrAlias: string): Entity | null {
    // Check direct ID
    if (this.entities.has(idOrAlias)) {
      return this.entities.get(idOrAlias)!;
    }

    // Check alias
    const normalized = idOrAlias.toLowerCase().trim();
    const entityId = this.aliasIndex.get(normalized);
    if (entityId) {
      return this.entities.get(entityId) || null;
    }

    return null;
  }

  addRelation(data: Omit<Relation, 'id' | 'created_at' | 'updated_at'>): Relation {
    const relation: Relation = {
      ...data,
      id: `rel_${data.source_id}_${data.type}_${data.target_id}`,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    this.indexRelation(relation);
    this.store.saveRelation(relation);

    // Handle bidirectional
    if (data.bidirectional) {
      const reverseRelation: Relation = {
        ...relation,
        id: `rel_${data.target_id}_${data.type}_${data.source_id}`,
        source_id: data.target_id,
        target_id: data.source_id,
      };
      this.indexRelation(reverseRelation);
      this.store.saveRelation(reverseRelation);
    }

    return relation;
  }

  getRelations(
    entityId: string,
    direction: 'outgoing' | 'incoming' | 'both' = 'both',
    type?: RelationType,
  ): Relation[] {
    const relations: Relation[] = [];

    if (direction === 'outgoing' || direction === 'both') {
      const outgoing = this.outgoingIndex.get(entityId) || new Set();
      for (const relId of outgoing) {
        const rel = this.relations.get(relId);
        if (rel && (!type || rel.type === type)) {
          relations.push(rel);
        }
      }
    }

    if (direction === 'incoming' || direction === 'both') {
      const incoming = this.incomingIndex.get(entityId) || new Set();
      for (const relId of incoming) {
        const rel = this.relations.get(relId);
        if (rel && (!type || rel.type === type)) {
          relations.push(rel);
        }
      }
    }

    return relations;
  }

  findSimilar(entityId: string, limit: number = 10): Array<{ entity: Entity; score: number }> {
    const visited = new Set<string>([entityId]);
    const scores = new Map<string, number>();

    // BFS with score decay
    const queue: Array<{ id: string; score: number; depth: number }> = [
      { id: entityId, score: 1.0, depth: 0 },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.depth >= 3) continue; // Max depth

      const relations = this.getRelations(current.id, 'outgoing');

      for (const rel of relations) {
        if (visited.has(rel.target_id)) continue;

        const weight = RELATION_WEIGHTS[rel.type] || 0.5;
        const newScore = current.score * weight * rel.weight * 0.7; // 0.7 decay

        if (newScore > 0.1) {
          // Minimum threshold
          visited.add(rel.target_id);
          scores.set(rel.target_id, Math.max(scores.get(rel.target_id) || 0, newScore));
          queue.push({ id: rel.target_id, score: newScore, depth: current.depth + 1 });
        }
      }
    }

    // Sort by score and limit
    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, score]) => ({
        entity: this.entities.get(id)!,
        score,
      }));
  }

  // ... private helper methods

  private indexEntity(entity: Entity): void {
    this.entities.set(entity.id, entity);

    // Index name and aliases
    this.aliasIndex.set(entity.name.toLowerCase(), entity.id);
    for (const alias of entity.aliases) {
      this.aliasIndex.set(alias.toLowerCase(), entity.id);
    }
  }

  private indexRelation(relation: Relation): void {
    this.relations.set(relation.id, relation);

    // Outgoing index
    if (!this.outgoingIndex.has(relation.source_id)) {
      this.outgoingIndex.set(relation.source_id, new Set());
    }
    this.outgoingIndex.get(relation.source_id)!.add(relation.id);

    // Incoming index
    if (!this.incomingIndex.has(relation.target_id)) {
      this.incomingIndex.set(relation.target_id, new Set());
    }
    this.incomingIndex.get(relation.target_id)!.add(relation.id);
  }

  private generateEntityId(type: EntityType, name: string): string {
    const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `${type}_${normalized}`;
  }
}
```

### AffinityCalculator Class

```typescript
// src/intelligence/graph/AffinityCalculator.ts

export class AffinityCalculator {
  private readonly DECAY_FACTOR = 0.7;
  private readonly MAX_DEPTH = 3;

  constructor(private graph: IKnowledgeGraph) {}

  calculateEntityAffinity(userId: string, entityId: string): number {
    const scores: number[] = [];

    // 1. Check direct relation
    const directRelations = this.graph.getRelations(userId, 'outgoing');
    for (const rel of directRelations) {
      if (rel.target_id === entityId) {
        scores.push(this.getRelationScore(rel));
      }
    }

    // 2. Check indirect paths via BFS
    const paths = this.findPaths(userId, entityId);
    for (const path of paths) {
      scores.push(this.calculatePathScore(path));
    }

    if (scores.length === 0) return 0;

    // Return max magnitude
    return scores.reduce((max, score) => (Math.abs(score) > Math.abs(max) ? score : max), 0);
  }

  calculateContentAffinity(
    userId: string,
    entities: string[],
  ): { score: number; factors: AffinityFactor[] } {
    const factors: AffinityFactor[] = [];

    for (const entityId of entities) {
      const affinity = this.calculateEntityAffinity(userId, entityId);
      if (affinity !== 0) {
        factors.push({
          entityId,
          affinity,
          path: this.getAffinityExplanation(userId, entityId),
        });
      }
    }

    if (factors.length === 0) {
      return { score: 0, factors: [] };
    }

    // Aggregate: use max magnitude but consider count
    const maxFactor = factors.reduce((max, f) =>
      Math.abs(f.affinity) > Math.abs(max.affinity) ? f : max,
    );

    return {
      score: maxFactor.affinity,
      factors,
    };
  }

  private getRelationScore(relation: Relation): number {
    const baseScore =
      relation.type === 'blocked' || relation.type === 'not_interested_in'
        ? -1
        : relation.type === 'interested_in' || relation.type === 'follows'
          ? 1
          : 0;

    return baseScore * relation.weight * relation.confidence;
  }

  private findPaths(sourceId: string, targetId: string): RelationPath[] {
    const paths: RelationPath[] = [];
    const visited = new Set<string>();

    const dfs = (currentId: string, path: Relation[], depth: number): void => {
      if (depth > this.MAX_DEPTH) return;
      if (currentId === targetId && path.length > 0) {
        paths.push([...path]);
        return;
      }

      visited.add(currentId);

      const relations = this.graph.getRelations(currentId, 'outgoing');
      for (const rel of relations) {
        if (!visited.has(rel.target_id)) {
          path.push(rel);
          dfs(rel.target_id, path, depth + 1);
          path.pop();
        }
      }

      visited.delete(currentId);
    };

    dfs(sourceId, [], 0);
    return paths;
  }

  private calculatePathScore(path: Relation[]): number {
    let score = 1.0;

    for (let i = 0; i < path.length; i++) {
      const rel = path[i];
      const typeWeight = RELATION_WEIGHTS[rel.type] || 0.5;

      // Handle opposite_of which inverts
      if (rel.type === 'opposite_of') {
        score *= -1 * rel.weight * this.DECAY_FACTOR;
      } else {
        score *= typeWeight * rel.weight * this.DECAY_FACTOR;
      }
    }

    // Apply sign based on first relation (user preference)
    if (path.length > 0) {
      const firstRel = path[0];
      if (firstRel.type === 'blocked' || firstRel.type === 'not_interested_in') {
        score = -Math.abs(score);
      }
    }

    return score;
  }

  private getAffinityExplanation(userId: string, entityId: string): string {
    const paths = this.findPaths(userId, entityId);
    if (paths.length === 0) return 'No path found';

    // Use shortest path for explanation
    const shortestPath = paths.reduce((shortest, path) =>
      path.length < shortest.length ? path : shortest,
    );

    const steps = shortestPath.map((rel) => {
      const source = this.graph.getEntity(rel.source_id);
      const target = this.graph.getEntity(rel.target_id);
      return `${source?.name} ${rel.type.replace('_', ' ')} ${target?.name}`;
    });

    return steps.join(' → ');
  }
}

type RelationPath = Relation[];

interface AffinityFactor {
  entityId: string;
  affinity: number;
  path: string;
}

const RELATION_WEIGHTS: Record<RelationType, number> = {
  similar_to: 0.9,
  is_a: 0.8,
  part_of: 0.7,
  owned_by: 0.6,
  related_to: 0.5,
  belongs_to: 0.5,
  competes_with: 0.3,
  opposite_of: 0.8, // High weight but inverts
  // User relations have special handling
  interested_in: 1.0,
  not_interested_in: 1.0,
  blocked: 1.0,
  follows: 1.0,
  one_time_interest: 0,
  // Content relations
  created_by: 0.8,
  about: 0.7,
  features: 0.6,
  has_type: 0.5,
  targets: 0.4,
  has_format: 0.3,
};
```

---

## Visual Examples

### Crypto Blocking Propagation

```
                                USER
                                  │
                                  │ blocked (1.0)
                                  ▼
                              ┌───────┐
                              │ CRYPTO │ affinity: -1.00
                              └───┬───┘
            ┌─────────┬─────────┬─┴───────┬─────────┐
            │         │         │         │         │
       similar   similar   similar   similar    part_of
        (0.95)    (0.90)    (0.85)    (0.80)     (0.70)
            │         │         │         │         │
            ▼         ▼         ▼         ▼         ▼
       ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
       │ BITCOIN│ │ETHEREUM│ │  NFT   │ │  DEFI  │ │  WEB3  │
       │ -0.67  │ │ -0.63  │ │ -0.60  │ │ -0.56  │ │ -0.49  │
       └───┬────┘ └────────┘ └───┬────┘ └────────┘ └────────┘
           │                     │
      similar (0.80)        part_of (0.60)
           │                     │
           ▼                     ▼
      ┌────────┐            ┌────────┐
      │ALTCOIN │            │OPENSEA │
      │ -0.38  │            │ -0.25  │
      └────────┘            └────────┘

Legend:
- Affinity values show propagated negative sentiment
- Decay factor: 0.7 per hop
- All values below -0.2 will suppress content
- All values below -0.5 will hide content
```

### Interest Propagation

```
                                USER
                                  │
                                  │ interested_in (0.9)
                                  ▼
                              ┌───────┐
                              │ APPLE │ affinity: +0.90
                              └───┬───┘
            ┌─────────┬─────────┬─┴───────┐
            │         │         │         │
        owned_by  owned_by  competes   similar
         (1.0)     (1.0)     (0.8)     (0.6)
            │         │         │         │
            ▼         ▼         ▼         ▼
       ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
       │ IPHONE │ │MACBOOK │ │ SAMSUNG│ │  TECH  │
       │ +0.63  │ │ +0.63  │ │ +0.15* │ │ +0.38  │
       └───┬────┘ └────────┘ └────────┘ └────────┘
           │
       is_a (1.0)
           │
           ▼
      ┌───────────┐
      │SMARTPHONE │
      │   +0.44   │
      └───────────┘

* Samsung gets reduced positive because competes_with
  has lower weight (0.3) - competing brands get mild boost
```

---

## Integration with Memory

### When User Blocks Topic

```typescript
async function onUserBlock(topic: string): Promise<void> {
  // 1. Memory: Create facts_prefs entry
  await memoryService.blockForever(topic);

  // 2. Graph: Get or create entity
  let entity = knowledgeGraph.getEntity(topic);
  if (!entity) {
    entity = knowledgeGraph.addEntity({
      type: 'topic',
      name: topic,
      aliases: [],
      properties: { source: 'user_created' },
    });
  }

  // 3. Graph: Add blocked relation
  knowledgeGraph.addRelation({
    source_id: 'user_local',
    target_id: entity.id,
    type: 'blocked',
    weight: 1.0,
    confidence: 1.0,
    bidirectional: false,
    properties: { created_by: 'explicit_action' },
  });

  // 4. Emit event
  eventBus.emit(Events.ENTITY_BLOCKED, { entityId: entity.id });
}
```

### Recommendation Integration

```typescript
async function shouldHideContent(content: AnalyzedContent): Promise<boolean> {
  // 1. Extract entities from content
  const entities = await extractor.extract(content);

  // 2. Check memory for direct blocks
  const memoryResult = await memoryService.shouldHide(entities.topics);
  if (memoryResult.hide) return true;

  // 3. Check graph affinity for propagated blocks
  for (const entityName of entities.topics) {
    const entity = knowledgeGraph.getEntity(entityName);
    if (!entity) continue;

    const affinity = affinityCalculator.calculateEntityAffinity('user_local', entity.id);

    if (affinity < -0.5) {
      return true; // Strong negative affinity → hide
    }
  }

  return false;
}
```

---

## Next Steps

1. **Read**: [Smriti_IMPLEMENTATION.md](Smriti_IMPLEMENTATION.md) - Memory system
2. **Read**: [ARCHITECTURE_VISUAL.md](ARCHITECTURE_VISUAL.md) - Full system diagrams
3. **Implement**: Use [CLAUDE_CODE_PROMPT.md](CLAUDE_CODE_PROMPT.md) for development
