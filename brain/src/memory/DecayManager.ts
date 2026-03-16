import { DECAY_MS, IMPLICIT_DECAY_MS, STATUS_STRENGTH } from '@shared/constants';
import { olderThan, now } from '@shared/utils';
import { createLogger } from '@shared/Logger';
import type { MemoryStore } from './storage/MemoryStore';
import type { MemoryEntry, MemoryStatus, MidTermCard } from '@shared/types';

const log = createLogger('DecayManager');

export interface DecayReport {
  entries_processed: number;
  entries_decayed: number;
  entries_deleted: number;
  cards_processed: number;
  cards_decayed: number;
  ran_at: number;
}

export class DecayManager {
  constructor(private readonly store: MemoryStore) {}

  /**
   * Run one full decay pass over all entries and cards for a user.
   * Called periodically by chrome.alarms.
   */
  async runDecay(userId: string): Promise<DecayReport> {
    log.info('Starting decay run...');

    const report: DecayReport = {
      entries_processed: 0,
      entries_decayed: 0,
      entries_deleted: 0,
      cards_processed: 0,
      cards_decayed: 0,
      ran_at: now(),
    };

    await this.decayEntries(userId, report);
    await this.decayCards(userId, report);

    log.info(
      `Decay complete — ${report.entries_decayed} entries decayed, ${report.entries_deleted} deleted`,
    );
    return report;
  }

  private async decayEntries(userId: string, report: DecayReport): Promise<void> {
    const entries = await this.store.getAllActiveEntries(userId);

    for (const entry of entries) {
      report.entries_processed++;

      // facts_prefs never auto-decay
      if (entry.memory_type === 'facts_prefs') continue;

      // Implicit signals decay faster than explicit ones
      const isImplicit = entry.value?.source_type === 'implicit';
      const policy = isImplicit
        ? IMPLICIT_DECAY_MS
        : DECAY_MS[entry.memory_type as keyof typeof DECAY_MS];
      if (!policy) continue;

      const newStatus = this.computeNextStatus(entry, policy);
      if (newStatus === entry.status) continue;

      report.entries_decayed++;

      if (newStatus === 'deleted') {
        report.entries_deleted++;
        await this.store.softDeleteEntry(entry.entry_id);
      } else {
        const updated: MemoryEntry = {
          ...entry,
          status: newStatus,
          value: {
            ...entry.value,
            strength: STATUS_STRENGTH[newStatus] ?? 0,
          },
          updated_at: now(),
        };
        await this.store.upsertEntry(updated);
        log.debug(`Entry ${entry.entry_id} → ${newStatus}`);
      }
    }
  }

  private async decayCards(userId: string, report: DecayReport): Promise<void> {
    const cards = await this.store.getActiveCards(userId);

    for (const card of cards) {
      report.cards_processed++;

      // Cards use the mid_term policy
      const policy = DECAY_MS.mid_term;
      const newStatus = this.computeNextStatusFromTimestamp(card.last_seen_at, card.status, policy);
      if (newStatus === card.status) continue;

      report.cards_decayed++;

      const updated: MidTermCard = {
        ...card,
        status: newStatus as MemoryStatus,
        updated_at: now(),
      };
      await this.store.upsertCard(updated);
    }
  }

  private computeNextStatus(
    entry: MemoryEntry,
    policy: (typeof DECAY_MS)[keyof typeof DECAY_MS],
  ): MemoryStatus {
    return this.computeNextStatusFromTimestamp(entry.last_confirmed_at, entry.status, policy);
  }

  private computeNextStatusFromTimestamp(
    lastConfirmed: number,
    currentStatus: string,
    policy: (typeof DECAY_MS)[keyof typeof DECAY_MS],
  ): MemoryStatus {
    switch (currentStatus) {
      case 'core':
        if (olderThan(lastConfirmed, policy.core_to_dream)) return 'dream';
        break;
      case 'dream':
        if (olderThan(lastConfirmed, policy.dream_to_forgotten)) return 'forgotten';
        break;
      case 'forgotten':
        if (olderThan(lastConfirmed, policy.forgotten_to_deleted)) return 'deleted';
        break;
    }
    return currentStatus as MemoryStatus;
  }
}
