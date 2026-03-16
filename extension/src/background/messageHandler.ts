import { ok, err } from '@shared/messages';
import { createLogger } from '@shared/Logger';
import { getIntelligenceService } from '@intelligence/index';
import { getBrain } from '@brain/BrainFacade';
import { getAgent } from '@agent/index';
import { InsightStore } from '@agent/insights';
import { PerfMonitor } from '@shared/PerfMonitor';
import { readStats } from './stats';
import { appendDecision, getDecisionLog, clearDecisionLog } from './decisionLog';
import { eventBus } from '@shared/EventBus';
import { trackProductsScored, trackWatchlistAdd } from './achievements';
import type { RecoMeMessage, MessageResponse } from '@shared/messages';

const log = createLogger('MessageHandler');

export function handleMessage(
  message: RecoMeMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: MessageResponse) => void,
): true {
  dispatch(message)
    .then(sendResponse)
    .catch((e: unknown) => {
      log.error('Message handler error', e);
      sendResponse(err(e instanceof Error ? e.message : 'Unknown error'));
    });
  return true;
}

async function dispatch(message: RecoMeMessage): Promise<MessageResponse> {
  const svc = getIntelligenceService();

  switch (message.type) {
    case 'PING': {
      return ok({ type: 'PONG' });
    }

    case 'PROCESS_CONTENT': {
      const result = await svc.processContent(message.payload);
      // Capture into decision log for devtools
      appendDecision(message.payload, result);
      // Emit domain events — listeners handle stats & achievements
      if (result.action === 'hide') {
        eventBus.emit('CONTENT_HIDDEN', {
          contentId: message.payload.id,
          topics: message.payload.topics ?? [],
        });
      } else if (result.action === 'boost') {
        eventBus.emit('CONTENT_BOOSTED', {
          contentId: message.payload.id,
          topics: message.payload.topics ?? [],
        });
      }
      return ok(result);
    }

    case 'LEARN_FEEDBACK': {
      await svc.learnFeedback(message.payload.content, message.payload.feedback);
      return ok(undefined);
    }

    case 'TRACK_SEARCH': {
      const { query, platform } = message.payload;
      log.info(`Search tracked on ${platform}: "${query}"`);
      await svc.getMemoryService().recordSearch(query, platform);
      eventBus.emit('SEARCH_TRACKED', { query, platform });
      return ok(undefined);
    }

    case 'IMPLICIT_SIGNAL': {
      const sig = message.payload;
      await svc.getMemoryService().recordImplicitSignal({
        topics: sig.topics,
        entities: sig.entities,
        platform: sig.platform as
          | 'youtube'
          | 'amazon'
          | 'twitter'
          | 'facebook'
          | 'instagram'
          | 'ebay'
          | 'walmart'
          | 'unknown',
        signalType: sig.signalType,
        contentId: sig.contentId,
        contentTitle: sig.contentTitle,
        confidenceOverride: sig.confidence,
      });
      eventBus.emit('MEMORY_WRITTEN', {
        topicKey: `implicit:${sig.signalType}`,
        type: sig.signalType,
      });
      return ok(undefined);
    }

    case 'GET_SETTINGS': {
      const settings = await chrome.storage.sync.get('recome_settings');
      return ok(settings['recome_settings'] ?? defaultSettings());
    }

    case 'GET_STATS': {
      const memory = svc.getMemoryService();
      const graph = svc.getGraph();
      const [memCount, graphCount, cards, stored] = await Promise.all([
        memory.getMemoryCount(),
        graph.getEntityCount(),
        memory.getMidTermCards(),
        readStats(),
      ]);
      const topBlocked = Object.entries(stored.blocked_topics)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([topic, count]) => ({ topic, count }));
      return ok({
        total_hidden: stored.total_hidden,
        hidden_today: stored.hidden_today,
        total_boosted: stored.total_boosted,
        active_patterns: cards.length,
        memory_entries: memCount,
        graph_entities: graphCount,
        top_blocked_topics: topBlocked,
        platform_breakdown: {},
      });
    }

    case 'GET_MEMORY_PACK': {
      const pack = await svc.getMemoryService().retrieve(message.payload.context_bucket);
      return ok(pack);
    }

    case 'GET_GRAPH_DATA': {
      const [entities, relations] = await Promise.all([
        svc.getGraph().getAllEntities(),
        svc.getGraph().getAllRelations(),
      ]);
      return ok({ entities, relations });
    }

    case 'BLOCK_TOPIC': {
      await svc.getMemoryService().blockForever(message.payload.topic);
      eventBus.emit('TOPIC_BLOCKED', { topic: message.payload.topic });
      return ok(undefined);
    }

    case 'UNBLOCK_TOPIC': {
      await svc.getMemoryService().unblockTopic(message.payload.topic);
      return ok(undefined);
    }

    case 'LIKE_TOPIC': {
      await svc.getMemoryService().likeForever(message.payload.topic);
      eventBus.emit('TOPIC_LIKED', { topic: message.payload.topic });
      return ok(undefined);
    }

    case 'UNLIKE_TOPIC': {
      await svc.getMemoryService().unlikeTopic(message.payload.topic);
      return ok(undefined);
    }

    case 'SWITCH_CONTEXT': {
      await svc.getMemoryService().switchContext(message.payload.context);
      eventBus.emit('CONTEXT_SWITCHED', { context: message.payload.context });
      return ok(message.payload.context);
    }

    case 'CLEAR_ALL_DATA': {
      await svc.getMemoryService().clearAll();
      await chrome.storage.local.remove('recome_stats');
      return ok(undefined);
    }

    case 'EXPORT_DATA': {
      const memory = svc.getMemoryService();
      const graph = svc.getGraph();
      const [pack, entities, stats] = await Promise.all([
        memory.retrieve('general'),
        graph.getAllEntities(),
        readStats(),
      ]);
      return ok({ memory: pack, graph: { entities }, stats, exported_at: Date.now() });
    }

    case 'GET_DECISION_LOG': {
      return ok(getDecisionLog());
    }

    case 'CLEAR_DECISION_LOG': {
      clearDecisionLog();
      return ok(undefined);
    }

    case 'GET_RAW_STORAGE': {
      const [local, sync] = await Promise.all([
        chrome.storage.local.get(null),
        chrome.storage.sync.get(null),
      ]);
      return ok({ local, sync });
    }

    case 'SAVE_SETTINGS': {
      const current = await chrome.storage.sync.get('recome_settings');
      const existing = current['recome_settings'] ?? defaultSettings();
      const merged = { ...existing, ...message.payload };
      await chrome.storage.sync.set({ recome_settings: merged });
      svc.invalidateSettingsCache();
      return ok(merged);
    }

    case 'SET_FOCUS': {
      const { topic } = message.payload;
      const focusData = { topic, set_at: Date.now() };
      await chrome.storage.local.set({ recome_focus: focusData });
      // Also record as a working_set memory entry for boosting
      await svc.getMemoryService().recordSearch(topic, 'focus');
      return ok(focusData);
    }

    case 'GET_FOCUS': {
      const result = await chrome.storage.local.get('recome_focus');
      const focus = result['recome_focus'] as { topic: string; set_at: number } | undefined;
      // Auto-expire after 7 days
      if (focus && Date.now() - focus.set_at > 7 * 24 * 60 * 60 * 1000) {
        await chrome.storage.local.remove('recome_focus');
        return ok(null);
      }
      return ok(focus ?? null);
    }

    case 'CLEAR_FOCUS': {
      await chrome.storage.local.remove('recome_focus');
      return ok(undefined);
    }

    case 'IMPORT_DATA': {
      const { getDB } = await import('@data/db');
      const db = await getDB();
      const importData = message.payload;

      // Import memory entries
      if (
        importData.memory &&
        Array.isArray((importData.memory as { entries?: unknown[] }).entries)
      ) {
        const entries = (importData.memory as { entries: Array<Record<string, unknown>> }).entries;
        const tx = db.transaction('memory_entries', 'readwrite');
        for (const entry of entries) {
          if (entry.entry_id) await tx.store.put(entry as never);
        }
        await tx.done;
      }

      // Import graph entities
      if (
        importData.graph &&
        Array.isArray((importData.graph as { entities?: unknown[] }).entities)
      ) {
        const entities = (importData.graph as { entities: Array<Record<string, unknown>> })
          .entities;
        const tx = db.transaction('entities', 'readwrite');
        for (const entity of entities) {
          if (entity.id) await tx.store.put(entity as never);
        }
        await tx.done;
      }

      // Import stats (merge counters)
      if (importData.stats) {
        const existing = await readStats();
        const imported = importData.stats as {
          total_hidden?: number;
          total_boosted?: number;
          blocked_topics?: Record<string, number>;
        };
        existing.total_hidden = Math.max(existing.total_hidden, imported.total_hidden ?? 0);
        existing.total_boosted = Math.max(existing.total_boosted, imported.total_boosted ?? 0);
        if (imported.blocked_topics) {
          for (const [topic, count] of Object.entries(imported.blocked_topics)) {
            existing.blocked_topics[topic] = Math.max(existing.blocked_topics[topic] ?? 0, count);
          }
        }
        await chrome.storage.local.set({ recome_stats: existing });
      }

      return ok({ imported: true });
    }

    case 'SCORE_CANDIDATES': {
      const brain = getBrain();
      const { candidates, pageContext } = message.payload;
      const scoreResponse = await brain.scoreEntities(candidates, pageContext);
      log.info(
        `Scored ${scoreResponse.items.length} candidates for ${pageContext.site}:${pageContext.pageType}`,
      );
      trackProductsScored(scoreResponse.items.length).catch(() => undefined);
      return ok(scoreResponse);
    }

    case 'RECORD_INTENT': {
      const brain = getBrain();
      const { source, entityType, entityId, intentType, metadata } = message.payload;
      const resolution = await brain.recordIntent(
        source,
        entityType,
        entityId,
        intentType,
        metadata,
      );
      eventBus.emit('MEMORY_WRITTEN', { topicKey: `intent:${entityId}`, type: intentType });
      return ok(resolution);
    }

    case 'REVOKE_INTENT': {
      const brain = getBrain();
      await brain.revokeIntent(message.payload.intentId);
      return ok(undefined);
    }

    case 'AGENT_CHAT': {
      const agent = getAgent();
      const { message: userMsg, candidates, pageContext } = message.payload;
      const response = await agent.chat_message(userMsg, candidates, pageContext);
      return ok(response);
    }

    case 'AGENT_AI_STATUS': {
      const agent = getAgent();
      const providerName = await agent.chat.getAIProviderName();
      return ok({ providerName, aiPowered: !!providerName });
    }

    case 'AGENT_COMPARE': {
      const agent = getAgent();
      const result = await agent.compareProducts(
        message.payload.candidates,
        message.payload.pageContext,
      );
      return ok(result);
    }

    case 'AGENT_WATCHLIST_ADD': {
      const agent = getAgent();
      const item = await agent.watchlist.add(message.payload);
      trackWatchlistAdd().catch(() => undefined);
      return ok(item);
    }

    case 'AGENT_WATCHLIST_LIST': {
      const agent = getAgent();
      const items = await agent.watchlist.getAll();
      return ok(items);
    }

    case 'AGENT_WATCHLIST_REMOVE': {
      const agent = getAgent();
      await agent.watchlist.remove(message.payload.watchlistItemId);
      return ok(undefined);
    }

    case 'AGENT_CONTEXT': {
      const agent = getAgent();
      const ctx = await agent.getContext();
      return ok(ctx);
    }

    case 'GET_PENDING_INSIGHTS': {
      const insightStore = new InsightStore();
      const pending = await insightStore.getPending();
      return ok(pending);
    }

    case 'INSIGHT_DISMISSED': {
      const insightStore2 = new InsightStore();
      await insightStore2.dismiss(message.payload.insightId);
      return ok(undefined);
    }

    case 'INSIGHT_SHOWN': {
      const insightStore3 = new InsightStore();
      await insightStore3.markShown(message.payload.insightId);
      return ok(undefined);
    }

    case 'GET_DB_STATS': {
      const { getDB } = await import('@data/db');
      const db = await getDB();
      const [memEntries, memEvents, cards, entities, relations] = await Promise.all([
        db.count('memory_entries'),
        db.count('memory_events'),
        db.count('mid_term_cards'),
        db.count('entities'),
        db.count('relations'),
      ]);
      const { MemoryStore } = await import('@intelligence/memory/storage/MemoryStore');
      const store = new MemoryStore();
      const DEFAULT_USER = 'local_user';
      const allEntries = await store.getAllActiveEntries(DEFAULT_USER);
      return ok({
        indexeddb: {
          memory_entries: memEntries,
          memory_events: memEvents,
          mid_term_cards: cards,
          graph_entities: entities,
          graph_relations: relations,
        },
        blocked: allEntries
          .filter((e) => e.topic_key.startsWith('blocked:'))
          .map((e) => e.topic_key),
        liked: allEntries
          .filter((e) => e.topic_key.startsWith('interested:'))
          .map((e) => e.topic_key),
        active_entries: allEntries,
      });
    }

    case 'GET_PERF_METRICS': {
      const averages = await PerfMonitor.getInstance().getAverages();
      return ok(averages);
    }

    default: {
      const _exhaustive: never = message;
      return err(`Unknown message type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function defaultSettings() {
  return {
    enabled: true,
    aggressiveness: 0.5,
    platforms: {
      youtube: true,
      amazon: true,
      twitter: true,
      facebook: true,
      instagram: true,
      ebay: true,
      walmart: true,
    },
  };
}
