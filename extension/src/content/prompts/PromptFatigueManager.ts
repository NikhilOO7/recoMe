import { createLogger } from '@shared/Logger';

const log = createLogger('PromptFatigue');

/**
 * PromptFatigueManager — tracks prompt frequency and adapts delivery rate.
 *
 * Rules:
 * - Max 3 prompts per page load
 * - Max 8 prompts per hour
 * - 5min cool-down after a dismissal
 * - Exponential back-off: doubles cool-down for consecutive dismissals
 * - Snooze: 1h / 1d / forever
 * - Adaptive: reduces frequency for users who rarely respond
 */

interface FatigueState {
  /** Prompts shown on this page load */
  pageCount: number;
  /** Timestamps of prompts shown in current session */
  hourTimestamps: number[];
  /** Last dismissal timestamp */
  lastDismissedAt: number;
  /** Consecutive dismissals (resets on positive response) */
  consecutiveDismissals: number;
  /** Snooze until (0 = not snoozed, -1 = forever) */
  snoozeUntil: number;
  /** User responsiveness score: positive responses / total shown (0-1) */
  responseRate: number;
  /** Total prompts shown in this session */
  totalShown: number;
  /** Total positive responses in this session */
  totalResponded: number;
}

const MAX_PER_PAGE = 3;
const MAX_PER_HOUR = 8;
const BASE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const MAX_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes cap
const LOW_RESPONSE_THRESHOLD = 0.15; // below this, halve frequency

export class PromptFatigueManager {
  private state: FatigueState;

  constructor() {
    this.state = {
      pageCount: 0,
      hourTimestamps: [],
      lastDismissedAt: 0,
      consecutiveDismissals: 0,
      snoozeUntil: 0,
      responseRate: 0.5, // assume 50% initially
      totalShown: 0,
      totalResponded: 0,
    };

    // Load persisted fatigue data from session storage
    this.loadFromSession();
  }

  /** Check if a prompt can be shown right now */
  canShowPrompt(): boolean {
    const now = Date.now();

    // Snoozed forever
    if (this.state.snoozeUntil === -1) {
      log.debug('Prompts snoozed forever');
      return false;
    }

    // Snoozed temporarily
    if (this.state.snoozeUntil > 0 && now < this.state.snoozeUntil) {
      log.debug(`Prompts snoozed until ${new Date(this.state.snoozeUntil).toISOString()}`);
      return false;
    }

    // Per-page limit
    if (this.state.pageCount >= MAX_PER_PAGE) {
      log.debug('Page prompt limit reached');
      return false;
    }

    // Per-hour limit (prune old timestamps)
    const oneHourAgo = now - 60 * 60 * 1000;
    this.state.hourTimestamps = this.state.hourTimestamps.filter((t) => t > oneHourAgo);
    if (this.state.hourTimestamps.length >= MAX_PER_HOUR) {
      log.debug('Hourly prompt limit reached');
      return false;
    }

    // Cool-down after dismissal
    if (this.state.lastDismissedAt > 0) {
      const cooldown = Math.min(
        BASE_COOLDOWN_MS * Math.pow(2, this.state.consecutiveDismissals - 1),
        MAX_COOLDOWN_MS,
      );
      if (now - this.state.lastDismissedAt < cooldown) {
        log.debug(`In cool-down period (${Math.round(cooldown / 1000)}s)`);
        return false;
      }
    }

    // Adaptive: if user rarely responds, halve the effective limit
    if (this.state.totalShown > 5 && this.state.responseRate < LOW_RESPONSE_THRESHOLD) {
      const adaptiveMax = Math.max(1, Math.floor(MAX_PER_PAGE / 2));
      if (this.state.pageCount >= adaptiveMax) {
        log.debug('Adaptive limit reached (low response rate)');
        return false;
      }
    }

    return true;
  }

  /** Record that a prompt was shown */
  recordShown(): void {
    this.state.pageCount++;
    this.state.hourTimestamps.push(Date.now());
    this.state.totalShown++;
    this.saveToSession();
  }

  /** Record a positive user response (thumbs up, save, etc.) */
  recordPositiveResponse(): void {
    this.state.consecutiveDismissals = 0;
    this.state.totalResponded++;
    this.updateResponseRate();
    this.saveToSession();
  }

  /** Record a dismissal (close, ignore) */
  recordDismissal(): void {
    this.state.lastDismissedAt = Date.now();
    this.state.consecutiveDismissals++;
    this.updateResponseRate();
    this.saveToSession();
  }

  /** Snooze prompts for a duration */
  snooze(duration: '1h' | '1d' | 'forever'): void {
    const now = Date.now();
    switch (duration) {
      case '1h':
        this.state.snoozeUntil = now + 60 * 60 * 1000;
        break;
      case '1d':
        this.state.snoozeUntil = now + 24 * 60 * 60 * 1000;
        break;
      case 'forever':
        this.state.snoozeUntil = -1;
        break;
    }
    this.saveToSession();
    this.persistSnooze();
    log.info(`Prompts snoozed: ${duration}`);
  }

  private updateResponseRate(): void {
    if (this.state.totalShown > 0) {
      this.state.responseRate = this.state.totalResponded / this.state.totalShown;
    }
  }

  private loadFromSession(): void {
    try {
      // Load snooze state from chrome.storage (persists across sessions)
      chrome.storage.local
        .get('recome_prompt_snooze')
        .then((r) => {
          const snooze = r['recome_prompt_snooze'] as number | undefined;
          if (typeof snooze === 'number') {
            this.state.snoozeUntil = snooze;
          }
        })
        .catch(() => undefined);

      // Load session-level data
      chrome.storage.session
        ?.get('recome_prompt_fatigue')
        .then((r) => {
          const saved = r['recome_prompt_fatigue'] as Partial<FatigueState> | undefined;
          if (saved) {
            this.state.hourTimestamps = saved.hourTimestamps ?? [];
            this.state.consecutiveDismissals = saved.consecutiveDismissals ?? 0;
            this.state.lastDismissedAt = saved.lastDismissedAt ?? 0;
            this.state.totalShown = saved.totalShown ?? 0;
            this.state.totalResponded = saved.totalResponded ?? 0;
            this.state.responseRate = saved.responseRate ?? 0.5;
          }
        })
        .catch(() => undefined);
    } catch {
      // Session storage may not be available
    }
  }

  private saveToSession(): void {
    try {
      chrome.storage.session
        ?.set({
          recome_prompt_fatigue: {
            hourTimestamps: this.state.hourTimestamps,
            consecutiveDismissals: this.state.consecutiveDismissals,
            lastDismissedAt: this.state.lastDismissedAt,
            totalShown: this.state.totalShown,
            totalResponded: this.state.totalResponded,
            responseRate: this.state.responseRate,
          },
        })
        .catch(() => undefined);
    } catch {
      // Non-critical
    }
  }

  private persistSnooze(): void {
    try {
      chrome.storage.local
        .set({ recome_prompt_snooze: this.state.snoozeUntil })
        .catch(() => undefined);
    } catch {
      // Non-critical
    }
  }
}
