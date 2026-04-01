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
import { bootBrain } from '@brain/orchestrator/index';
import { getDB } from '@data/db';
import { MemoryStore } from '@intelligence/memory/storage/MemoryStore';
import { getAllCacheEntries } from '../content/adapters/PathPatternCache';
import { ImportScheduler } from '../importers/ImportScheduler';
import { PriceTracker } from '@brain/commerce/tracking/PriceTracker';
import { PriceAlertEngine } from '@brain/commerce/tracking/PriceAlertEngine';
import { getMonitoringCollector } from './monitoring/MonitoringCollector';
import { handleMonitoringMessage } from './monitoring/monitoringHandlers';
import type { Platform } from '@schema/context';
import type { RecoMeMessage, MessageResponse } from '@shared/messages';
import { safeStorageSyncGet, safeStorageSyncSet } from '@shared/storageSync';

const log = createLogger('MessageHandler');

export function handleMessage(
  message: RecoMeMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: MessageResponse) => void,
): true {
  // Capability-scope: only accept messages from this extension's own contexts
  if (sender.id !== chrome.runtime.id) {
    log.warn(`Rejected message from unknown sender: ${sender.id}`);
    sendResponse(err('Unauthorized sender'));
    return true;
  }

  dispatch(message)
    .then(sendResponse)
    .catch((e: unknown) => {
      log.error('Message handler error', e);
      getMonitoringCollector().recordError(
        'messageHandler',
        e instanceof Error ? e.message : String(e),
      );
      sendResponse(err(e instanceof Error ? e.message : 'Unknown error'));
    });
  return true;
}

async function dispatch(message: RecoMeMessage): Promise<MessageResponse> {
  // Monitoring messages handled separately to avoid touching the type-checked switch
  const monResult = handleMonitoringMessage(
    message.type,
    (message as unknown as Record<string, unknown>).payload,
  );
  if (monResult) return monResult;

  const svc = getIntelligenceService();

  switch (message.type) {
    case 'PING': {
      return ok({ type: 'PONG' });
    }

    case 'PROCESS_CONTENT': {
      const t0 = performance.now();
      const result = await svc.processContent(message.payload);
      const durationMs = performance.now() - t0;
      // Capture into decision log for devtools
      appendDecision(message.payload, result);
      // Record to monitoring collector
      getMonitoringCollector().recordPipelineEvent(message.payload, result, durationMs);
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
      getMonitoringCollector().recordFeedback(message.payload.content, message.payload.feedback);
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
      const [syncResult, localResult] = await Promise.all([
        safeStorageSyncGet('recome_settings'),
        chrome.storage.local.get('recome_api_keys'),
      ]);
      const base = (syncResult['recome_settings'] ?? defaultSettings()) as Record<string, unknown>;
      const keys = localResult['recome_api_keys'] as Record<string, string> | undefined;
      // Merge masked API key indicators — the popup only needs to know
      // whether a key is configured and show a preview, not the full secret.
      // LLMClient reads keys directly from local storage.
      if (keys) {
        for (const [k, v] of Object.entries(keys)) {
          if (k.endsWith('_api_key') && typeof v === 'string' && v.trim()) {
            base[k] = v.slice(0, 8) + '...';
          }
        }
      }
      return ok(base);
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
      try {
        await svc.getMemoryService().likeForever(message.payload.topic);
        eventBus.emit('TOPIC_LIKED', { topic: message.payload.topic });
      } catch (e) {
        log.warn('Rejected topic like', e);
        return err(e instanceof Error ? e.message : 'Invalid topic');
      }
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
      // Clear all IDB stores (commerce, graph, etc.)
      try {
        const db = await getDB();
        const storeNames = Array.from(db.objectStoreNames);
        for (const storeName of storeNames) {
          const tx = db.transaction(storeName, 'readwrite');
          await tx.store.clear();
          await tx.done;
        }
      } catch (e) {
        log.warn('Failed to clear some IDB stores', e);
      }
      await chrome.storage.local.remove(['recome_stats', 'recome_api_keys', 'recome_focus']);
      return ok(undefined);
    }

    case 'EXPORT_DATA': {
      const memory = svc.getMemoryService();
      const graph = svc.getGraph();
      const contexts = [
        'general',
        'work',
        'shopping',
        'entertainment',
        'learning',
        'social',
      ] as const;
      const packPromises = contexts.map((ctx) =>
        memory.retrieve(ctx).then((p) => [ctx, p] as const),
      );
      const [packs, entities, relations, stats] = await Promise.all([
        Promise.all(packPromises),
        graph.getAllEntities(),
        graph.getAllRelations(),
        readStats(),
      ]);
      const memoryByContext: Record<string, unknown> = {};
      for (const [ctx, pack] of packs) memoryByContext[ctx] = pack;
      return ok({
        memory: memoryByContext,
        graph: { entities, relations },
        stats,
        exported_at: Date.now(),
      });
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
        safeStorageSyncGet(null),
      ]);
      // Redact API keys from the response to prevent leaking secrets
      const redactedLocal = { ...local };
      delete redactedLocal['recome_api_keys'];
      const redactedSync = { ...sync };
      if (redactedSync['recome_settings']) {
        const s = { ...(redactedSync['recome_settings'] as Record<string, unknown>) };
        for (const k of Object.keys(s)) {
          if (k.endsWith('_api_key')) s[k] = '***REDACTED***';
        }
        redactedSync['recome_settings'] = s;
      }
      return ok({ local: redactedLocal, sync: redactedSync });
    }

    case 'SAVE_SETTINGS': {
      const current = await safeStorageSyncGet('recome_settings');
      const existing = current['recome_settings'] ?? defaultSettings();
      const patch = { ...message.payload } as Record<string, unknown>;

      // Extract API keys — store them in local storage only (never sync)
      const apiKeys: Record<string, string> = {};
      let hasKeys = false;
      for (const k of Object.keys(patch)) {
        if (k.endsWith('_api_key')) {
          if (typeof patch[k] === 'string') {
            apiKeys[k] = patch[k] as string;
            hasKeys = true;
          }
          delete patch[k];
        }
      }
      if (hasKeys) {
        const existingKeys =
          (await chrome.storage.local.get('recome_api_keys'))['recome_api_keys'] ?? {};
        await chrome.storage.local.set({ recome_api_keys: { ...existingKeys, ...apiKeys } });
      }

      const merged = { ...existing, ...patch };
      await safeStorageSyncSet({ recome_settings: merged });
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
      const db = await getDB();
      const importData = message.payload;

      // Schema validation — reject malformed imports
      if (typeof importData !== 'object' || importData === null) {
        return err('Invalid import: expected an object');
      }
      if (!importData.memory && !importData.graph && !importData.stats) {
        return err('Invalid import: must contain at least one of memory, graph, or stats');
      }
      if (
        (importData as Record<string, unknown>).exported_at !== undefined &&
        typeof (importData as Record<string, unknown>).exported_at !== 'number'
      ) {
        return err('Invalid import: exported_at must be a number');
      }

      // Import memory entries
      if (
        importData.memory &&
        Array.isArray((importData.memory as { entries?: unknown[] }).entries)
      ) {
        const entries = (importData.memory as { entries: Array<Record<string, unknown>> }).entries;
        const tx = db.transaction('memory_entries', 'readwrite');
        for (const entry of entries) {
          if (entry.entry_id && typeof entry.entry_id === 'string')
            await tx.store.put(entry as never);
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
          if (entity.id && typeof entity.id === 'string') await tx.store.put(entity as never);
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
      try {
        const agent = getAgent();
        const { message: userMsg, candidates, pageContext } = message.payload;
        const response = await agent.chat_message(userMsg, candidates, pageContext);
        return ok(response);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : '';
        if (/401|403|invalid.*key|authentication|unauthorized/i.test(msg)) {
          return { success: false, error: 'invalid_api_key' } as MessageResponse;
        }
        if (/429|rate.?limit/i.test(msg)) {
          return { success: false, error: 'rate_limited' } as MessageResponse;
        }
        throw e;
      }
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
      const db = await getDB();
      const [memEntries, memEvents, cards, entities, relations] = await Promise.all([
        db.count('memory_entries'),
        db.count('memory_events'),
        db.count('mid_term_cards'),
        db.count('entities'),
        db.count('relations'),
      ]);
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

    case 'GET_SELECTOR_HEALTH': {
      // Health records live in chrome.storage.local — read all V2 entries
      const entries = await getAllCacheEntries();
      return ok(entries);
    }

    case 'SMART_PROMPT_RESPONSE': {
      const { action, platform } = message.payload;
      log.info(`Smart prompt response: ${action} on ${platform}`);
      // Prompt responses are handled client-side; this is for logging/analytics
      return ok(undefined);
    }

    case 'OVERLAY_POSITION_SAVE': {
      const { domain, x, y } = message.payload;
      await chrome.storage.local.set({ [`recome_pill_pos_${domain}`]: { x, y } });
      return ok(undefined);
    }

    case 'BRAIN_PROCESS': {
      const brain = bootBrain();
      const {
        taskType,
        trigger,
        platform,
        pageUrl,
        content,
        message: msg,
        aggressiveness,
      } = message.payload;
      const task = brain.createTask(taskType, trigger, {
        platform: platform as Platform,
        pageUrl,
        content: content ?? undefined,
        aggressiveness,
        conversationHistory: msg
          ? [{ role: 'user', content: msg, timestamp: Date.now() }]
          : undefined,
      });
      const brainResult = await brain.process(task);
      return ok(brainResult);
    }

    case 'BRAIN_STATUS': {
      const brain = bootBrain();
      const stats = brain.getAgentStats();
      const agents = brain.registry.getNames();
      return ok({ agents, stats });
    }

    case 'BRAIN_FEEDBACK': {
      const brain = bootBrain();
      brain.recordFeedback(message.payload.taskId, message.payload.action);
      return ok(undefined);
    }

    case 'BRAIN_INSIGHT': {
      // Insight messages are typically sent FROM the background TO content scripts.
      // When received here, just log and acknowledge.
      log.info(`Brain insight received: ${message.payload.insight}`);
      return ok(undefined);
    }

    // ── Platform Imports (Phase 3A) ──────────────────────────────────────────

    case 'IMPORT_START': {
      log.info(`Import requested: ${message.payload.platform} via ${message.payload.method}`);
      return ok(undefined);
    }

    case 'IMPORT_PROGRESS': {
      return ok(undefined);
    }

    case 'IMPORT_HISTORY': {
      try {
        const key = 'recome_import_history';
        const stored = await chrome.storage.local.get(key);
        return ok(stored[key] ?? []);
      } catch {
        return ok([]);
      }
    }

    case 'IMPORT_SCHEDULES': {
      try {
        const key = 'recome_import_schedules';
        const stored = await chrome.storage.local.get(key);
        return ok(stored[key] ?? []);
      } catch {
        return ok([]);
      }
    }

    case 'IMPORT_SET_SCHEDULE': {
      const scheduler = new ImportScheduler();
      await scheduler.setSchedule(message.payload.platform, message.payload.frequency);
      return ok(undefined);
    }

    // ── Price Tracking (Phase 3B) ────────────────────────────────────────────

    case 'PRICE_RECORD': {
      const tracker = new PriceTracker();
      const { url, platform, title, price, currency, imageUrl } = message.payload;
      const change = await tracker.recordPrice(url, platform, title, price, currency, imageUrl);
      if (change) {
        const alertEngine = new PriceAlertEngine();
        const alerts = await alertEngine.evaluatePriceChange(change);
        for (const alert of alerts) {
          await alertEngine.sendNotification(alert);
        }
      }
      return ok(change);
    }

    case 'PRICE_TRACK': {
      const tracker = new PriceTracker();
      const { url, platform, title, price, currency, imageUrl } = message.payload;
      const productId = await tracker.trackProduct(url, platform, title, price, currency, imageUrl);
      return ok({ productId });
    }

    case 'PRICE_UNTRACK': {
      const tracker = new PriceTracker();
      await tracker.untrackProduct(message.payload.productId);
      return ok(undefined);
    }

    case 'PRICE_GET_TRACKED': {
      const tracker = new PriceTracker();
      const products = await tracker.getTrackedProducts();
      return ok(products);
    }

    case 'PRICE_GET_HISTORY': {
      const tracker = new PriceTracker();
      const history = await tracker.getPriceHistory(message.payload.productId);
      return ok(history);
    }

    case 'PRICE_ADD_RULE': {
      const engine = new PriceAlertEngine();
      const rule = await engine.addRule({
        productId: message.payload.productId,
        type: message.payload.type,
        thresholdPrice: message.payload.thresholdPrice,
        percentDrop: message.payload.percentDrop,
        enabled: true,
      });
      return ok(rule);
    }

    case 'PRICE_REMOVE_RULE': {
      const engine = new PriceAlertEngine();
      await engine.removeRule(message.payload.ruleId);
      return ok(undefined);
    }

    case 'PRICE_GET_ALERTS': {
      const engine = new PriceAlertEngine();
      const alerts = await engine.getAlertHistory();
      return ok(alerts);
    }

    case 'PRICE_DISMISS_ALERT': {
      const engine = new PriceAlertEngine();
      await engine.dismissAlert(message.payload.alertId);
      return ok(undefined);
    }

    // ── Sprint 2: Dashboard experience ──────────────────────────────────────

    case 'GET_GRAPH_SUMMARY': {
      const graph = svc.getGraph();
      const memory = svc.getMemoryService();
      const [entities, relations, memCount] = await Promise.all([
        graph.getAllEntities(),
        graph.getAllRelations(),
        memory.getMemoryCount(),
      ]);

      // Group entities by type
      const byType: Record<string, number> = {};
      for (const e of entities) {
        byType[e.type] = (byType[e.type] ?? 0) + 1;
      }

      // Top interests (positive relations sorted by weight)
      const positiveRels = relations
        .filter((r) => r.type === 'interested_in' || r.type === 'follows')
        .sort((a, b) => b.weight - a.weight);
      const topInterests = positiveRels.slice(0, 10).map((r) => {
        const entity = entities.find((e) => e.id === r.target_id);
        return {
          id: r.target_id,
          name: entity?.name ?? r.target_id,
          type: entity?.type ?? 'unknown',
          weight: r.weight,
          relation: r.type,
        };
      });

      // Top blocks (negative relations)
      const negativeRels = relations
        .filter((r) => r.type === 'not_interested_in' || r.type === 'blocked')
        .sort((a, b) => b.weight - a.weight);
      const topBlocks = negativeRels.slice(0, 10).map((r) => {
        const entity = entities.find((e) => e.id === r.target_id);
        return {
          id: r.target_id,
          name: entity?.name ?? r.target_id,
          type: entity?.type ?? 'unknown',
          weight: r.weight,
          relation: r.type,
        };
      });

      // Relation type counts
      const relationCounts: Record<string, number> = {};
      for (const r of relations) {
        relationCounts[r.type] = (relationCounts[r.type] ?? 0) + 1;
      }

      return ok({
        entityCount: entities.length,
        relationCount: relations.length,
        memoryCount: memCount,
        entitiesByType: byType,
        relationsByType: relationCounts,
        topInterests,
        topBlocks,
        recentEntities: entities
          .sort((a, b) => b.updated_at - a.updated_at)
          .slice(0, 5)
          .map((e) => ({ id: e.id, name: e.name, type: e.type, updated_at: e.updated_at })),
      });
    }

    case 'GET_ACTION_HISTORY': {
      const limit = message.payload?.limit ?? 50;
      const decisions = getDecisionLog().slice(0, limit);
      return ok(
        decisions.map((d) => ({
          id: d.id,
          timestamp: d.timestamp,
          action: d.result.action,
          score: d.result.score,
          title: d.content.title,
          platform: d.content.platform,
          type: d.content.type,
          creator: d.content.creator,
          reasons: d.result.factors?.map((f) => f.explanation) ?? [],
          factors: d.result.factors ?? [],
        })),
      );
    }

    // ── Sprint 4: Agent productization ─────────────────────────────────────

    case 'GET_AGENT_ACTIVITY': {
      const brain = bootBrain();
      const agents = brain.registry.getAll();
      const stats = brain.getAgentStats();

      const AGENT_META: Record<string, { label: string; description: string }> = {
        filter: {
          label: 'FilterAgent',
          description:
            'Controls feed quality by scoring and filtering content based on your preferences.',
        },
        scout: {
          label: 'ScoutAgent',
          description:
            'Discovers opportunities like events, courses, deals, and articles relevant to your interests.',
        },
        shopper: {
          label: 'ShopperAgent',
          description:
            'Provides shopping intelligence including price analysis, deal assessment, and product alternatives.',
        },
        advisor: {
          label: 'AdvisorAgent',
          description:
            'Your personal assistant for answering questions and providing tailored recommendations.',
        },
        social: {
          label: 'SocialAgent',
          description:
            'Tracks community trends, viral content, and social signals across platforms.',
        },
        guardian: {
          label: 'GuardianAgent',
          description:
            'Audits privacy and safety, checking data access patterns and consent requirements.',
        },
      };

      const activity = agents.map((agent) => {
        const agentStats = stats[agent.name];
        const meta = AGENT_META[agent.name] ?? {
          label: agent.name,
          description: agent.description,
        };
        return {
          agent: agent.name,
          label: meta.label,
          description: meta.description,
          lastRun: null as number | null,
          tasksHandled: agentStats?.insightsSurfaced ?? 0,
          avgConfidence: agentStats ? agentStats.effectivenessRate : 0.5,
          recentInsights: [],
        };
      });

      return ok(activity);
    }

    // Monitoring messages are handled before the switch via handleMonitoringMessage()
    case 'GET_MONITOR_TIMELINE':
    case 'GET_MONITOR_HEALTH':
    case 'GET_MONITOR_TRACE':
    case 'GET_MONITOR_TRACES':
    case 'GET_MONITOR_AGENTS':
    case 'RUN_VALIDATORS':
    case 'SIMULATE_CONTENT':
    case 'SIMULATE_FLOW':
    case 'MONITOR_CLEAR':
      return err('Monitoring message not handled');

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
      linkedin: true,
    },
  };
}
