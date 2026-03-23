import { createLogger } from '@shared/Logger';
import type { ImportSchedule } from './types';

const log = createLogger('ImportScheduler');

const SCHEDULES_KEY = 'recome_import_schedules';
const ALARM_NAME = 'recome_import_check';
const ALARM_INTERVAL_MINUTES = 60; // Check every hour

/**
 * ImportScheduler — manages periodic re-imports.
 *
 * Checks hourly if any scheduled imports are due.
 * The actual import is triggered via a message to the active content script.
 */
export class ImportScheduler {
  /** Initialize the alarm for periodic checks */
  async init(): Promise<void> {
    const existing = await chrome.alarms.get(ALARM_NAME);
    if (!existing) {
      await chrome.alarms.create(ALARM_NAME, {
        periodInMinutes: ALARM_INTERVAL_MINUTES,
        delayInMinutes: 5, // First check after 5 minutes
      });
      log.debug('Import check alarm created');
    }
  }

  /** Handle the alarm — check for due imports */
  async onAlarm(): Promise<string[]> {
    const schedules = await this.getSchedules();
    const now = Date.now();
    const due: string[] = [];

    for (const schedule of schedules) {
      if (!schedule.enabled) continue;
      if (!schedule.nextRun || schedule.nextRun > now) continue;
      due.push(schedule.platform);
    }

    if (due.length > 0) {
      log.info(`Imports due: ${due.join(', ')}`);
    }

    return due;
  }

  /** Get all schedules */
  async getSchedules(): Promise<ImportSchedule[]> {
    try {
      const stored = await chrome.storage.local.get(SCHEDULES_KEY);
      return (stored[SCHEDULES_KEY] as ImportSchedule[] | undefined) ?? [];
    } catch {
      return [];
    }
  }

  /** Set schedule for a platform */
  async setSchedule(platform: string, frequency: ImportSchedule['frequency']): Promise<void> {
    const schedules = await this.getSchedules();
    const existing = schedules.find((s) => s.platform === platform);

    const nextRun = frequency === 'manual' ? null : this.computeNextRun(frequency);

    if (existing) {
      existing.frequency = frequency;
      existing.nextRun = nextRun;
      existing.enabled = frequency !== 'manual';
    } else {
      schedules.push({
        platform,
        frequency,
        lastRun: null,
        nextRun,
        enabled: frequency !== 'manual',
      });
    }

    await chrome.storage.local.set({ [SCHEDULES_KEY]: schedules });
    log.debug(`Schedule set: ${platform} = ${frequency}`);
  }

  /** Record that an import completed */
  async recordRun(platform: string): Promise<void> {
    const schedules = await this.getSchedules();
    const schedule = schedules.find((s) => s.platform === platform);

    if (schedule) {
      schedule.lastRun = Date.now();
      schedule.nextRun =
        schedule.frequency === 'manual' ? null : this.computeNextRun(schedule.frequency);
      await chrome.storage.local.set({ [SCHEDULES_KEY]: schedules });
    }
  }

  /** Remove schedule for a platform */
  async removeSchedule(platform: string): Promise<void> {
    const schedules = await this.getSchedules();
    const filtered = schedules.filter((s) => s.platform !== platform);
    await chrome.storage.local.set({ [SCHEDULES_KEY]: filtered });
  }

  private computeNextRun(frequency: 'daily' | 'weekly'): number {
    const now = Date.now();
    if (frequency === 'daily') return now + 24 * 60 * 60 * 1000;
    return now + 7 * 24 * 60 * 60 * 1000;
  }
}
