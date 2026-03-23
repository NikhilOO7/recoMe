import { createLogger } from '@shared/Logger';
import type { PreferencePack, PackPreference, PackPreview, PackApplyMode } from './types';

const log = createLogger('PackImporter');

/**
 * PackImporter — applies preference packs to the user's profile.
 *
 * Supports three modes:
 * - preview: Dry run showing what would change
 * - merge: Combine pack with existing preferences (non-destructive)
 * - replace: Replace matching preferences with pack values
 */
export class PackImporter {
  /**
   * Preview what would happen if a pack is applied.
   * Compares pack preferences against user's current preferences.
   */
  async preview(
    pack: PreferencePack,
    currentPreferences: Array<{ topic: string; sentiment: string; strength: number }>,
  ): Promise<PackPreview> {
    const additions: PackPreference[] = [];
    const reinforcements: PackPreview['reinforcements'] = [];
    const conflicts: PackPreview['conflicts'] = [];

    const currentMap = new Map(currentPreferences.map((p) => [p.topic.toLowerCase(), p]));

    for (const pref of pack.preferences) {
      const existing = currentMap.get(pref.topic.toLowerCase());

      if (!existing) {
        additions.push(pref);
      } else if (existing.sentiment === pref.sentiment) {
        reinforcements.push({
          preference: pref,
          currentStrength: existing.strength,
          newStrength: Math.min(1, (existing.strength + pref.strength) / 2 + 0.1),
        });
      } else {
        conflicts.push({
          preference: pref,
          currentSentiment: existing.sentiment as 'positive' | 'negative',
          currentStrength: existing.strength,
        });
      }
    }

    return { additions, reinforcements, conflicts };
  }

  /**
   * Apply a pack to the user's profile.
   * Returns the preferences that were actually applied.
   */
  async apply(
    pack: PreferencePack,
    mode: PackApplyMode,
    currentPreferences: Array<{ topic: string; sentiment: string; strength: number }>,
  ): Promise<{ applied: PackPreference[]; skipped: PackPreference[] }> {
    if (mode === 'preview') {
      return { applied: [], skipped: pack.preferences };
    }

    const preview = await this.preview(pack, currentPreferences);
    const applied: PackPreference[] = [];
    const skipped: PackPreference[] = [];

    // Always apply additions
    for (const pref of preview.additions) {
      applied.push(pref);
    }

    // Apply reinforcements
    for (const r of preview.reinforcements) {
      applied.push({
        ...r.preference,
        strength: r.newStrength,
      });
    }

    // Handle conflicts based on mode
    for (const c of preview.conflicts) {
      if (mode === 'replace') {
        applied.push(c.preference);
      } else {
        // merge mode: skip conflicts
        skipped.push(c.preference);
      }
    }

    // Save applied preferences via background message
    if (applied.length > 0) {
      await this.savePreferences(applied, pack.id);
    }

    log.info(`Pack "${pack.name}" applied: ${applied.length} applied, ${skipped.length} skipped`);
    return { applied, skipped };
  }

  private async savePreferences(preferences: PackPreference[], packId: string): Promise<void> {
    try {
      await chrome.runtime.sendMessage({
        type: 'IMPORT_DATA',
        payload: {
          graph: {
            entities: preferences.map((p) => ({
              name: p.topic,
              type: 'topic',
              confidence: p.strength,
              source: `pack_${packId}`,
              sentiment: p.sentiment,
            })),
          },
        },
      });
    } catch (err) {
      log.error('Failed to save pack preferences', err);
    }
  }
}
