/**
 * EventBus — typed publish/subscribe for decoupled background messaging.
 *
 * Components emit domain events (e.g. CONTENT_HIDDEN) and other components
 * react without direct coupling. This replaces the manual "fire-and-forget"
 * calls scattered across the message handler.
 */

// ── Event definitions ───────────────────────────────────────────────────────

export interface EventMap {
  CONTENT_HIDDEN:       { contentId: string; topics: string[] };
  CONTENT_BOOSTED:      { contentId: string; topics: string[] };
  TOPIC_BLOCKED:        { topic: string };
  TOPIC_LIKED:          { topic: string };
  MEMORY_WRITTEN:       { topicKey: string; type: string };
  PATTERN_CREATED:      { patternId: string; topic: string };
  CONTEXT_SWITCHED:     { context: string };
  ACHIEVEMENT_UNLOCKED: { id: string; label: string; icon: string };
  SEARCH_TRACKED:       { query: string; platform: string };
}

export type EventName = keyof EventMap;
type Listener<E extends EventName> = (payload: EventMap[E]) => void | Promise<void>;

// ── Bus implementation ──────────────────────────────────────────────────────

class EventBusImpl {
  private readonly listeners = new Map<EventName, Set<Listener<never>>>();

  on<E extends EventName>(event: E, listener: Listener<E>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(listener as Listener<never>);

    // Return unsubscribe function
    return () => { set.delete(listener as Listener<never>); };
  }

  emit<E extends EventName>(event: E, payload: EventMap[E]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try {
        (fn as Listener<E>)(payload);
      } catch {
        // Listeners must not crash the emitter
      }
    }
  }

  /** Remove all listeners (useful for tests). */
  clear(): void {
    this.listeners.clear();
  }
}

/** Singleton event bus shared across the background service worker. */
export const eventBus = new EventBusImpl();
