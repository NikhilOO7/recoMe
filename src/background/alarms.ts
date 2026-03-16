import { ALARM_NAMES, ALARM_INTERVALS } from '@shared/constants';
import { createLogger } from '@shared/Logger';
import { getIntelligenceService } from '@intelligence/index';

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
    default:
      log.warn(`Unknown alarm: ${alarm.name}`);
  }
}

async function runDecay(): Promise<void> {
  try {
    const svc = getIntelligenceService();
    const report = await svc.getMemoryService().runDecay();
    log.info(
      `Decay: ${report.entries_decayed} entries decayed, ${report.entries_deleted} deleted`,
    );
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
