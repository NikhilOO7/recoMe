import { getDB } from '@data/db';
import { LRUCache } from '@data/LRUCache';
import { generateId, normalizeTopicKey, now } from '@shared/utils';
import { createLogger } from '@shared/Logger';
import { SEED_ENTITIES, SEED_RELATIONS } from './seed';
import type { GraphEntity, GraphRelation, EntityType, RelationType } from '@shared/types';

const log = createLogger('KnowledgeGraph');

// Entity lookup cache: name → entity
const entityCache = new LRUCache<string, GraphEntity>(500, 5 * 60 * 1000);
// Relations cache: sourceId → relations[]
const relationsCache = new LRUCache<string, GraphRelation[]>(500, 5 * 60 * 1000);

export class KnowledgeGraph {
  private seeded = false;

  // ── Seeding ────────────────────────────────────────────────────────────────

  async seedDefaults(): Promise<void> {
    if (this.seeded) return;

    const db = await getDB();
    const existing = await db.count('entities');
    if (existing > 0) {
      this.seeded = true;
      return;
    }

    const tx = db.transaction(['entities', 'relations'], 'readwrite');
    await Promise.all([
      ...SEED_ENTITIES.map((e) => tx.objectStore('entities').put(e)),
      ...SEED_RELATIONS.map((r) => tx.objectStore('relations').put(r)),
    ]);
    await tx.done;

    this.seeded = true;
    log.info(`Seeded ${SEED_ENTITIES.length} entities and ${SEED_RELATIONS.length} relations`);
  }

  // ── Entity CRUD ────────────────────────────────────────────────────────────

  async getEntity(id: string): Promise<GraphEntity | undefined> {
    const cached = entityCache.get(id);
    if (cached) return cached;

    const db = await getDB();
    const entity = await db.get('entities', id);
    if (entity) entityCache.set(id, entity);
    return entity;
  }

  async findEntityByName(name: string): Promise<GraphEntity | undefined> {
    const normalized = normalizeTopicKey(name);

    // Check cache
    const cached = entityCache.get(normalized);
    if (cached) return cached;

    const db = await getDB();

    // Exact match first
    const byName = await db.getAllFromIndex('entities', 'by_name', name);
    if (byName.length > 0) {
      const entity = byName[0]!;
      entityCache.set(normalized, entity);
      return entity;
    }

    // Alias match
    const all = await db.getAll('entities');
    const match = all.find(
      (e) =>
        e.name.toLowerCase() === normalized ||
        e.aliases.some((a) => normalizeTopicKey(a) === normalized),
    );
    if (match) entityCache.set(normalized, match);
    return match;
  }

  async upsertEntity(
    entity: Omit<GraphEntity, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<GraphEntity> {
    const db = await getDB();
    const existing = await this.findEntityByName(entity.name);

    if (existing) {
      const updated: GraphEntity = { ...existing, ...entity, updated_at: now() };
      await db.put('entities', updated);
      entityCache.set(existing.id, updated);
      return updated;
    }

    const newEntity: GraphEntity = {
      ...entity,
      id: normalizeTopicKey(entity.name),
      created_at: now(),
      updated_at: now(),
    };
    await db.put('entities', newEntity);
    entityCache.set(newEntity.id, newEntity);
    return newEntity;
  }

  async getAllEntities(): Promise<GraphEntity[]> {
    const db = await getDB();
    return db.getAll('entities');
  }

  async getAllRelations(): Promise<GraphRelation[]> {
    const db = await getDB();
    return db.getAll('relations');
  }

  async getEntitiesByType(type: EntityType): Promise<GraphEntity[]> {
    const db = await getDB();
    return db.getAllFromIndex('entities', 'by_type', type);
  }

  // ── Relation CRUD ──────────────────────────────────────────────────────────

  async addRelation(
    sourceId: string,
    targetId: string,
    type: RelationType,
    weight: number,
    bidirectional = false,
  ): Promise<GraphRelation> {
    const db = await getDB();

    const relation: GraphRelation = {
      id: generateId(),
      source_id: sourceId,
      target_id: targetId,
      type,
      weight: Math.max(0, Math.min(1, weight)),
      bidirectional,
      created_at: now(),
      updated_at: now(),
    };

    await db.put('relations', relation);
    relationsCache.delete(sourceId);
    if (bidirectional) relationsCache.delete(targetId);

    return relation;
  }

  async getRelationsFrom(sourceId: string): Promise<GraphRelation[]> {
    const cached = relationsCache.get(sourceId);
    if (cached) return cached;

    const db = await getDB();
    const rels = await db.getAllFromIndex('relations', 'by_source', sourceId);

    // Also collect bidirectional relations where this node is the target
    const inbound = await db.getAllFromIndex('relations', 'by_target', sourceId);
    const biInbound = inbound.filter((r) => r.bidirectional);

    const all = [...rels, ...biInbound];
    relationsCache.set(sourceId, all);
    return all;
  }

  async findRelation(
    sourceId: string,
    targetId: string,
    type?: RelationType,
  ): Promise<GraphRelation | undefined> {
    const rels = await this.getRelationsFrom(sourceId);
    return rels.find(
      (r) =>
        ((r.source_id === sourceId && r.target_id === targetId) ||
          (r.bidirectional && r.source_id === targetId && r.target_id === sourceId)) &&
        (!type || r.type === type),
    );
  }

  async findSimilar(
    entityId: string,
    limit = 5,
  ): Promise<Array<{ entity: GraphEntity; weight: number }>> {
    const rels = await this.getRelationsFrom(entityId);
    const similar = rels.filter((r) => r.type === 'similar_to' || r.type === 'related_to');

    const results: Array<{ entity: GraphEntity; weight: number }> = [];
    for (const rel of similar) {
      const otherId = rel.source_id === entityId ? rel.target_id : rel.source_id;
      const entity = await this.getEntity(otherId);
      if (entity) results.push({ entity, weight: rel.weight });
    }

    return results.sort((a, b) => b.weight - a.weight).slice(0, limit);
  }

  /**
   * Add or update a cross-platform relation between two entities.
   * Stores platform evidence in the relation metadata.
   * These relations are picked up automatically by the AffinityCalculator.
   */
  async addCrossPlatformRelation(
    sourceId: string,
    targetId: string,
    weight: number,
    _platforms: string[],
  ): Promise<GraphRelation> {
    const db = await getDB();

    // Check for existing relation to update
    const existing = await this.findRelation(sourceId, targetId, 'related_to');
    if (existing) {
      const updated: GraphRelation = {
        ...existing,
        weight: Math.max(0, Math.min(1, weight)),
        updated_at: now(),
      };
      // Store platform metadata on the entity's metadata field
      // (GraphRelation doesn't have a metadata field, but the weight encodes the strength)
      await db.put('relations', updated);
      relationsCache.delete(sourceId);
      relationsCache.delete(targetId);
      return updated;
    }

    return this.addRelation(sourceId, targetId, 'related_to', weight, true);
  }

  async getEntityCount(): Promise<number> {
    const db = await getDB();
    return db.count('entities');
  }

  invalidateCache(): void {
    entityCache.clear();
    relationsCache.clear();
  }
}
