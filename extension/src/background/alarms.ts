import { ALARM_NAMES, ALARM_INTERVALS, DEFAULT_USER_ID } from '@shared/constants';
import { createLogger } from '@shared/Logger';
import { getIntelligenceService } from '@intelligence/index';
import { PreferenceSynthesizer } from '@intelligence/memory/PreferenceSynthesizer';
import { MemoryStore } from '@intelligence/memory/storage/MemoryStore';
import { KnowledgeGraph } from '@brain/graph/KnowledgeGraph';
import { CrossPlatformLinker } from '@brain/graph/CrossPlatformLinker';
import { InsightDetector } from '@agent/insights';
import { PriceStore } from '@brain/commerce/tracking/PriceStore';
import { ImportScheduler } from '../importers/ImportScheduler';
import { eventBus } from '@shared/EventBus';
import { getMonitoringCollector } from './monitoring/MonitoringCollector';

const log = createLogger('Alarms');

export async function registerAlarms(): Promise<void> {
  // Idempotent: only create alarms that don't already exist
  const existing = await chrome.alarms.getAll();
  const existingNames = new Set(existing.map((a) => a.name));

  const alarmDefs: Array<{ name: string; periodInMinutes: number; delayInMinutes: number }> = [
    { name: ALARM_NAMES.decay, periodInMinutes: ALARM_INTERVALS.decay_minutes, delayInMinutes: 1 },
    { name: ALARM_NAMES.stats, periodInMinutes: ALARM_INTERVALS.stats_minutes, delayInMinutes: 5 },
    {
      name: ALARM_NAMES.preference_synthesis,
      periodInMinutes: ALARM_INTERVALS.preference_synthesis_minutes,
      delayInMinutes: 10,
    },
    {
      name: ALARM_NAMES.insight_check,
      periodInMinutes: ALARM_INTERVALS.insight_check_minutes,
      delayInMinutes: 5,
    },
    {
      name: ALARM_NAMES.selector_health,
      periodInMinutes: ALARM_INTERVALS.selector_health_minutes,
      delayInMinutes: 15,
    },
    {
      name: ALARM_NAMES.price_check,
      periodInMinutes: ALARM_INTERVALS.price_check_minutes,
      delayInMinutes: 30,
    },
    {
      name: ALARM_NAMES.import_check,
      periodInMinutes: ALARM_INTERVALS.import_check_minutes,
      delayInMinutes: 10,
    },
    {
      name: ALARM_NAMES.weekly_digest,
      periodInMinutes: ALARM_INTERVALS.weekly_digest_minutes,
      delayInMinutes: 60, // First digest 1h after install
    },
  ];

  let created = 0;
  for (const def of alarmDefs) {
    if (!existingNames.has(def.name)) {
      chrome.alarms.create(def.name, {
        periodInMinutes: def.periodInMinutes,
        delayInMinutes: def.delayInMinutes,
      });
      created++;
    }
  }

  log.info(`Alarms registered (${created} new, ${existingNames.size} existing)`);
}

export function handleAlarm(alarm: chrome.alarms.Alarm): void {
  const monitoring = getMonitoringCollector();
  monitoring.recordAlarmFired(alarm.name);

  // Wrap async alarm handlers so failures are logged and monitored
  const run = async (): Promise<void> => {
    switch (alarm.name) {
      case ALARM_NAMES.decay:
        await runDecay();
        break;
      case ALARM_NAMES.stats:
        await aggregateStats();
        break;
      case ALARM_NAMES.preference_synthesis:
        await runPreferenceSynthesis();
        break;
      case ALARM_NAMES.insight_check:
        await runInsightCheck();
        break;
      case ALARM_NAMES.selector_health:
        await broadcastSelectorHealthCheck();
        break;
      case ALARM_NAMES.price_check:
        await runPriceCheck();
        break;
      case ALARM_NAMES.import_check:
        await runImportCheck();
        break;
      case ALARM_NAMES.weekly_digest:
        await runWeeklyDigest();
        break;
      default:
        log.warn(`Unknown alarm: ${alarm.name}`);
    }
  };

  run().catch((err) => {
    log.error(`Alarm handler "${alarm.name}" threw uncaught error`, err);
    monitoring.recordError(
      'alarm',
      `${alarm.name}: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
}

async function runDecay(): Promise<void> {
  try {
    const svc = getIntelligenceService();
    const report = await svc.getMemoryService().runDecay();
    log.info(`Decay: ${report.entries_decayed} entries decayed, ${report.entries_deleted} deleted`);
  } catch (err) {
    log.error('Decay run failed', err);
  }
}

async function aggregateStats(): Promise<void> {
  try {
    const svc = getIntelligenceService();
    const memCount = await svc.getMemoryService().getMemoryCount();
    const graphCount = await svc.getGraph().getEntityCount();
    log.debug(`Stats — memory: ${memCount}, entities: ${graphCount}`);
  } catch (err) {
    log.error('Stats aggregation failed', err);
  }
}

async function runPreferenceSynthesis(): Promise<void> {
  try {
    const store = new MemoryStore();
    const synthesizer = new PreferenceSynthesizer(store);
    const didRun = await synthesizer.run(DEFAULT_USER_ID);
    if (didRun) {
      log.info('Daily preference synthesis completed');
    }

    // Run cross-platform linking alongside synthesis (same daily cadence)
    await runCrossPlatformLinking(store);
  } catch (err) {
    log.error('Preference synthesis failed', err);
  }
}

async function runCrossPlatformLinking(store: MemoryStore): Promise<void> {
  try {
    const graph = new KnowledgeGraph();
    const linker = new CrossPlatformLinker(store, graph);
    const relCount = await linker.run();
    if (relCount > 0) {
      log.info(`Cross-platform linker: ${relCount} relation(s) created/strengthened`);
    }
  } catch (err) {
    log.error('Cross-platform linking failed', err);
  }
}

async function broadcastSelectorHealthCheck(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'SELECTOR_HEALTH_CHECK' }).catch(() => undefined); // tab may not have content script
      }
    }
    log.debug('Selector health check broadcast sent');
  } catch (err) {
    log.error('Selector health broadcast failed', err);
  }
}

async function runInsightCheck(): Promise<void> {
  try {
    const detector = new InsightDetector();
    const newCount = await detector.detect();
    if (newCount > 0) {
      eventBus.emit('PROACTIVE_INSIGHT_READY', { insightCount: newCount });
      // Notify active tabs so they can show a toast
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs
            .sendMessage(tab.id, {
              type: 'INSIGHT_AVAILABLE',
              payload: { count: newCount },
            })
            .catch(() => undefined); // tab may not have content script
        }
      }
    }
  } catch (err) {
    log.error('Insight check failed', err);
  }
}

async function runPriceCheck(): Promise<void> {
  try {
    const store = new PriceStore();

    const staleProducts = await store.getStaleProducts(6 * 60 * 60 * 1000);
    if (staleProducts.length === 0) return;

    log.debug(`Price check: ${staleProducts.length} stale product(s) to check`);

    // Broadcast to active tabs to check prices on matching platforms
    const tabs = await chrome.tabs.query({});
    for (const product of staleProducts) {
      for (const tab of tabs) {
        if (tab.id && tab.url?.includes(new URL(product.url).hostname)) {
          chrome.tabs
            .sendMessage(tab.id, {
              type: 'PRICE_CHECK_REQUEST',
              payload: { productId: product.id, url: product.url },
            })
            .catch(() => undefined);
        }
      }
    }
  } catch (err) {
    log.error('Price check failed', err);
  }
}

async function runWeeklyDigest(): Promise<void> {
  try {
    const svc = getIntelligenceService();
    await svc.initialize();
    const graph = svc.getGraph();

    // Gather weekly research summary
    const entityCount = await graph.getEntityCount();
    const allEntities = await graph.getAllEntities();

    // Count signals from the past 7 days
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentEntities = allEntities.filter((e) => (e.updated_at ?? 0) > oneWeekAgo);
    const recentCount = recentEntities.length;

    // Get top interests by weight
    const relations = await graph.getAllRelations();
    const interestRelations = relations
      .filter((r) => r.type === 'interested_in')
      .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
      .slice(0, 5);

    const topTopicNames: string[] = [];
    for (const rel of interestRelations) {
      const entity = await graph.getEntity(rel.target_id);
      if (entity) topTopicNames.push(entity.name);
    }

    if (recentCount === 0 && entityCount === 0) {
      log.info('Weekly digest: no activity to report');
      return;
    }

    // Build digest message
    const digestTitle = 'Your weekly research digest';
    const digestBody =
      recentCount > 0
        ? `${recentCount} new research signal${recentCount !== 1 ? 's' : ''} this week. ` +
          (topTopicNames.length > 0
            ? `Top interests: ${topTopicNames.join(', ')}.`
            : `${entityCount} topics tracked across your platforms.`)
        : `${entityCount} research topics tracked. Browse Amazon, YouTube, or Reddit to build your research trail.`;

    // Show browser notification
    await chrome.notifications.create('recome_weekly_digest', {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/recome_logo_128.png'),
      title: digestTitle,
      message: digestBody,
      priority: 1,
    });

    // Store digest timestamp
    await chrome.storage.local.set({
      recome_last_digest: new Date().toISOString(),
      recome_last_digest_data: {
        recentCount,
        entityCount,
        topTopics: topTopicNames,
      },
    });

    log.info(`Weekly digest sent: ${recentCount} signals, ${entityCount} topics`);
  } catch (err) {
    log.error('Weekly digest generation failed', err);
  }
}

async function runImportCheck(): Promise<void> {
  try {
    const scheduler = new ImportScheduler();
    const due = await scheduler.onAlarm();

    if (due.length > 0) {
      log.info(`Imports due: ${due.join(', ')}`);
      // Notify active tabs to run the imports
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs
            .sendMessage(tab.id, {
              type: 'IMPORT_DUE',
              payload: { platforms: due },
            })
            .catch(() => undefined);
        }
      }
    }
  } catch (err) {
    log.error('Import check failed', err);
  }
}
