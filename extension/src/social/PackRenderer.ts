import type { PreferencePack, PackPreference, PackPreview } from './types';

/**
 * PackRenderer — produces HTML/data for rendering pack cards and previews.
 *
 * Used by popup and overlay components to display pack information.
 */

export interface PackCardData {
  id: string;
  name: string;
  description: string;
  author: string;
  category: string;
  preferenceCount: number;
  positiveCount: number;
  negativeCount: number;
  topTopics: string[];
  downloads: number;
  rating: number;
  ratingStars: string;
  isInstalled: boolean;
}

export interface PackPreviewData {
  additionCount: number;
  reinforcementCount: number;
  conflictCount: number;
  additions: Array<{ topic: string; sentiment: string; strength: number }>;
  reinforcements: Array<{ topic: string; from: number; to: number }>;
  conflicts: Array<{ topic: string; packSentiment: string; yourSentiment: string }>;
  summary: string;
}

export class PackRenderer {
  /** Convert a pack into card display data */
  toCardData(pack: PreferencePack, isInstalled: boolean): PackCardData {
    const positiveCount = pack.preferences.filter((p) => p.sentiment === 'positive').length;
    const negativeCount = pack.preferences.filter((p) => p.sentiment === 'negative').length;

    return {
      id: pack.id,
      name: pack.name,
      description:
        pack.description.length > 120 ? pack.description.slice(0, 117) + '...' : pack.description,
      author: pack.author,
      category: this.formatCategory(pack.category),
      preferenceCount: pack.preferences.length,
      positiveCount,
      negativeCount,
      topTopics: pack.preferences
        .sort((a, b) => b.strength - a.strength)
        .slice(0, 5)
        .map((p) => p.topic),
      downloads: pack.downloads,
      rating: pack.rating,
      ratingStars: this.renderStars(pack.rating),
      isInstalled,
    };
  }

  /** Convert a preview into display data */
  toPreviewData(preview: PackPreview): PackPreviewData {
    const additions = preview.additions.map((p) => ({
      topic: p.topic,
      sentiment: p.sentiment,
      strength: p.strength,
    }));

    const reinforcements = preview.reinforcements.map((r) => ({
      topic: r.preference.topic,
      from: r.currentStrength,
      to: r.newStrength,
    }));

    const conflicts = preview.conflicts.map((c) => ({
      topic: c.preference.topic,
      packSentiment: c.preference.sentiment,
      yourSentiment: c.currentSentiment,
    }));

    const parts: string[] = [];
    if (additions.length > 0)
      parts.push(`${additions.length} new preference${additions.length !== 1 ? 's' : ''}`);
    if (reinforcements.length > 0) parts.push(`${reinforcements.length} strengthened`);
    if (conflicts.length > 0)
      parts.push(`${conflicts.length} conflict${conflicts.length !== 1 ? 's' : ''}`);
    const summary = parts.length > 0 ? parts.join(', ') : 'No changes';

    return {
      additionCount: additions.length,
      reinforcementCount: reinforcements.length,
      conflictCount: conflicts.length,
      additions,
      reinforcements,
      conflicts,
      summary,
    };
  }

  /** Render strength as a visual bar string */
  strengthBar(strength: number): string {
    const filled = Math.round(strength * 10);
    return '\u2588'.repeat(filled) + '\u2591'.repeat(10 - filled);
  }

  /** Format preference for display */
  formatPreference(pref: PackPreference): string {
    const icon = pref.sentiment === 'positive' ? '+' : '-';
    return `[${icon}] ${pref.topic} (${Math.round(pref.strength * 100)}%)${pref.explanation ? ` — ${pref.explanation}` : ''}`;
  }

  private renderStars(rating: number): string {
    const full = Math.floor(rating);
    const half = rating - full >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return '\u2605'.repeat(full) + (half ? '\u00BD' : '') + '\u2606'.repeat(empty);
  }

  private formatCategory(category: string): string {
    return category.charAt(0).toUpperCase() + category.slice(1);
  }
}
