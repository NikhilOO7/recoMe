import { getDB } from '@data/db';
import { generateId, now } from '@shared/utils';
import type {
  MemoryEntry,
  MemoryEvent,
  MidTermCard,
  ContextBucket,
  MemoryType,
  MemoryStatus,
  Platform,
  FeedbackType,
} from '@shared/types';

// ── MemoryStore — thin repository over IndexedDB ──────────────────────────────

export class MemoryStore {
  // ── Memory Entries ──────────────────────────────────────────────────────────

  async upsertEntry(entry: MemoryEntry): Promise<void> {
    const db = await getDB();
    await db.put('memory_entries', { ...entry, updated_at: now() });
  }

  async getEntry(entryId: string): Promise<MemoryEntry | undefined> {
    const db = await getDB();
    return db.get('memory_entries', entryId);
  }

  async getEntriesByUserContext(userId: string, context: ContextBucket): Promise<MemoryEntry[]> {
    const db = await getDB();
    return db.getAllFromIndex('memory_entries', 'by_user_context', [userId, context]);
  }

  async getEntriesByUserType(userId: string, type: MemoryType): Promise<MemoryEntry[]> {
    const db = await getDB();
    return db.getAllFromIndex('memory_entries', 'by_user_type', [userId, type]);
  }

  async getEntriesByStatus(userId: string, status: MemoryStatus): Promise<MemoryEntry[]> {
    const db = await getDB();
    return db.getAllFromIndex('memory_entries', 'by_status', [userId, status]);
  }

  async getEntryByTopic(userId: string, topicKey: string): Promise<MemoryEntry | undefined> {
    const db = await getDB();
    const entries = await db.getAllFromIndex('memory_entries', 'by_topic', [userId, topicKey]);
    return entries.find((e) => !e.is_deleted);
  }

  async getAllActiveEntries(userId: string): Promise<MemoryEntry[]> {
    const db = await getDB();
    const core = await db.getAllFromIndex('memory_entries', 'by_status', [userId, 'core']);
    const dream = await db.getAllFromIndex('memory_entries', 'by_status', [userId, 'dream']);
    return [...core, ...dream].filter((e) => !e.is_deleted);
  }

  async softDeleteEntry(entryId: string): Promise<void> {
    const db = await getDB();
    const entry = await db.get('memory_entries', entryId);
    if (!entry) return;
    await db.put('memory_entries', {
      ...entry,
      is_deleted: true,
      status: 'deleted',
      updated_at: now(),
    });
  }

  async touchEntry(entryId: string): Promise<void> {
    const db = await getDB();
    const entry = await db.get('memory_entries', entryId);
    if (!entry) return;
    await db.put('memory_entries', {
      ...entry,
      last_accessed_at: now(),
      last_confirmed_at: now(),
      status: 'core', // Reactivation always goes back to CORE
      access_count: entry.access_count + 1,
      updated_at: now(),
    });
  }

  async countEntries(userId: string): Promise<number> {
    const entries = await this.getAllActiveEntries(userId);
    return entries.length;
  }

  // ── Memory Events ──────────────────────────────────────────────────────────

  async appendEvent(
    userId: string,
    topicKey: string,
    action: FeedbackType,
    platform: Platform,
    context: ContextBucket,
    contentId: string,
    contentTitle?: string,
  ): Promise<MemoryEvent> {
    const event: MemoryEvent = {
      event_id: generateId(),
      user_id: userId,
      occurred_at: now(),
      platform,
      context_bucket: context,
      topic_key: topicKey,
      action,
      content_id: contentId,
      content_title: contentTitle,
    };
    const db = await getDB();
    await db.add('memory_events', event);
    return event;
  }

  async getRecentEventsByTopic(topicKey: string, limit = 50): Promise<MemoryEvent[]> {
    const db = await getDB();
    const all = await db.getAllFromIndex('memory_events', 'by_topic', topicKey);
    return all.sort((a, b) => b.occurred_at - a.occurred_at).slice(0, limit);
  }

  async getEventsAfter(sinceMs: number): Promise<MemoryEvent[]> {
    const db = await getDB();
    const range = IDBKeyRange.lowerBound(sinceMs);
    return db.getAllFromIndex('memory_events', 'by_occurred', range);
  }

  // ── Mid-Term Cards ─────────────────────────────────────────────────────────

  async upsertCard(card: MidTermCard): Promise<void> {
    const db = await getDB();
    await db.put('mid_term_cards', { ...card, updated_at: now() });
  }

  async getCard(cardId: string): Promise<MidTermCard | undefined> {
    const db = await getDB();
    return db.get('mid_term_cards', cardId);
  }

  async getCardsByUserContext(userId: string, context: ContextBucket): Promise<MidTermCard[]> {
    const db = await getDB();
    return db.getAllFromIndex('mid_term_cards', 'by_user_context', [userId, context]);
  }

  async getActiveCards(userId: string): Promise<MidTermCard[]> {
    const allContextCards = await Promise.all(
      (
        ['work', 'learning', 'shopping', 'entertainment', 'social', 'general'] as ContextBucket[]
      ).map((ctx) => this.getCardsByUserContext(userId, ctx)),
    );
    return allContextCards.flat().filter((c) => c.status === 'core' || c.status === 'dream');
  }

  async findCardByTopic(
    userId: string,
    context: ContextBucket,
    topicKey: string,
  ): Promise<MidTermCard | undefined> {
    const cards = await this.getCardsByUserContext(userId, context);
    return cards.find((c) => c.topic_key === topicKey);
  }

  // ── Housekeeping ───────────────────────────────────────────────────────────

  async clearAll(): Promise<void> {
    const db = await getDB();
    await Promise.all([
      db.clear('memory_entries'),
      db.clear('memory_events'),
      db.clear('mid_term_cards'),
    ]);
  }

  async createBaseEntry(
    userId: string,
    topicKey: string,
    context: ContextBucket,
    type: MemoryType,
    overrides: Partial<MemoryEntry> = {},
  ): Promise<MemoryEntry> {
    const entry: MemoryEntry = {
      entry_id: generateId(),
      user_id: userId,
      context_bucket: context,
      memory_type: type,
      topic_key: topicKey,
      value: {},
      confidence: 1.0,
      status: 'core',
      valid_from: now(),
      valid_to: null,
      last_confirmed_at: now(),
      last_accessed_at: now(),
      access_count: 1,
      version: 1,
      is_deleted: false,
      created_at: now(),
      updated_at: now(),
      ...overrides,
    };
    await this.upsertEntry(entry);
    return entry;
  }
}
