import { ALARM_NAMES, ALARM_INTERVALS, DEFAULT_USER_ID } from '@shared/constants';
import { createLogger } from '@shared/Logger';
import { getIntelligenceService } from '@intelligence/index';
import { PreferenceSynthesizer } from '@intelligence/memory/PreferenceSynthesizer';
import { MemoryStore } from '@intelligence/memory/storage/MemoryStore';
import { KnowledgeGraph } from '@brain/graph/KnowledgeGraph';
import { CrossPlatformLinker } from '@brain/graph/CrossPlatformLinker';
import { InsightDetector } from '@agent/insights';
import { eventBus } from '@shared/EventBus';

const log = createLogger('Alarms');

export function registerAlarms(): void {
  chrome.alarms.create(ALARM_NAMES.decay, {
    periodInMinutes: ALARM_INTERVALS.decay_minutes,
    delayInMinutes: 1,
  });

  chrome.alarms.create(ALARM_NAMES.stats, {
    periodInMinutes: ALARM_INTERVALS.stats_minutes,
    delayInMinutes: 5,
  });

  chrome.alarms.create(ALARM_NAMES.preference_synthesis, {
    periodInMinutes: ALARM_INTERVALS.preference_synthesis_minutes,
    delayInMinutes: 10, // first run 10 min after install/startup
  });

  chrome.alarms.create(ALARM_NAMES.insight_check, {
    periodInMinutes: ALARM_INTERVALS.insight_check_minutes,
    delayInMinutes: 5, // first run 5 min after startup
  });

  log.info('Alarms registered');
}

export function handleAlarm(alarm: chrome.alarms.Alarm): void {
  switch (alarm.name) {
    case ALARM_NAMES.decay:
      runDecay();
      break;
    case ALARM_NAMES.stats:
      aggregateStats();
      break;
    case ALARM_NAMES.preference_synthesis:
      runPreferenceSynthesis();
      break;
    case ALARM_NAMES.insight_check:
      runInsightCheck();
      break;
    default:
      log.warn(`Unknown alarm: ${alarm.name}`);
  }
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
