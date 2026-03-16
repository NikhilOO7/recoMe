/**
 * EventBus listeners — react to domain events for stats, achievements, etc.
 *
 * This module is imported once at startup to register all listeners.
 * It replaces the manual fire-and-forget calls that were scattered across
 * messageHandler.ts.
 */

import { eventBus } from '@shared/EventBus';
import { incrementHidden, incrementBoosted, recordBlockedTopic, readStats } from './stats';
import { checkAchievements, unlockFirstBlock } from './achievements';
import { getIntelligenceService } from '@intelligence/index';
import { createLogger } from '@shared/Logger';

const log = createLogger('EventListeners');

export function registerEventListeners(): void {
  // ── CONTENT_HIDDEN → update stats + check achievements ──────────────────
  eventBus.on('CONTENT_HIDDEN', async () => {
    try {
      await incrementHidden();
      const stats = await readStats();
      const svc = getIntelligenceService();
      const cards = await svc.getMemoryService().getMidTermCards();
      await checkAchievements({
        totalHidden: stats.total_hidden,
        blockedCount: Object.keys(stats.blocked_topics).length,
        patternCount: cards.length,
      });
    } catch (e) {
      log.error('CONTENT_HIDDEN listener failed', e);
    }
  });

  // ── CONTENT_BOOSTED → update stats ──────────────────────────────────────
  eventBus.on('CONTENT_BOOSTED', async () => {
    try {
      await incrementBoosted();
    } catch (e) {
      log.error('CONTENT_BOOSTED listener failed', e);
    }
  });

  // ── TOPIC_BLOCKED → record stat + unlock first-block achievement ────────
  eventBus.on('TOPIC_BLOCKED', async ({ topic }) => {
    try {
      await recordBlockedTopic(topic);
      await unlockFirstBlock();
      const stats = await readStats();
      const svc = getIntelligenceService();
      const cards = await svc.getMemoryService().getMidTermCards();
      await checkAchievements({
        totalHidden: stats.total_hidden,
        blockedCount: Object.keys(stats.blocked_topics).length,
        patternCount: cards.length,
      });
    } catch (e) {
      log.error('TOPIC_BLOCKED listener failed', e);
    }
  });

  log.info('Event listeners registered');
}
