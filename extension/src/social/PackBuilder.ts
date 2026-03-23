import { createLogger } from '@shared/Logger';
import type { PreferencePack, PackPreference, PackCategory } from './types';

const log = createLogger('PackBuilder');

/**
 * PackBuilder — creates preference packs from user's current preferences.
 *
 * Users select which preferences to include, give it a name/description,
 * and the builder produces a shareable pack.
 */
export class PackBuilder {
  private name = '';
  private description = '';
  private category: PackCategory = 'other';
  private tags: string[] = [];
  private preferences: PackPreference[] = [];
  private isPublic = true;

  /** Set pack metadata */
  setName(name: string): this {
    this.name = name.trim().slice(0, 100);
    return this;
  }

  setDescription(description: string): this {
    this.description = description.trim().slice(0, 500);
    return this;
  }

  setCategory(category: PackCategory): this {
    this.category = category;
    return this;
  }

  setTags(tags: string[]): this {
    this.tags = tags.slice(0, 10).map((t) => t.trim().toLowerCase().slice(0, 30));
    return this;
  }

  setPublic(isPublic: boolean): this {
    this.isPublic = isPublic;
    return this;
  }

  /** Add a preference to the pack */
  addPreference(pref: PackPreference): this {
    if (this.preferences.length >= 50) {
      log.warn('Max 50 preferences per pack');
      return this;
    }
    this.preferences.push({
      topic: pref.topic.trim().slice(0, 100),
      sentiment: pref.sentiment,
      strength: Math.max(0, Math.min(1, pref.strength)),
      explanation: pref.explanation.trim().slice(0, 200),
    });
    return this;
  }

  /** Add multiple preferences */
  addPreferences(prefs: PackPreference[]): this {
    for (const p of prefs) this.addPreference(p);
    return this;
  }

  /** Remove a preference by topic */
  removePreference(topic: string): this {
    this.preferences = this.preferences.filter((p) => p.topic !== topic);
    return this;
  }

  /** Clear all preferences */
  clearPreferences(): this {
    this.preferences = [];
    return this;
  }

  /** Get current preferences in the builder */
  getPreferences(): PackPreference[] {
    return [...this.preferences];
  }

  /** Validate the pack before building */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!this.name) errors.push('Pack name is required');
    if (this.name.length < 3) errors.push('Pack name must be at least 3 characters');
    if (!this.description) errors.push('Description is required');
    if (this.preferences.length === 0) errors.push('At least one preference is required');
    if (this.preferences.length > 50) errors.push('Maximum 50 preferences per pack');
    return { valid: errors.length === 0, errors };
  }

  /** Build the pack (local, not yet published) */
  build(authorName: string): PreferencePack | null {
    const { valid, errors } = this.validate();
    if (!valid) {
      log.warn('Pack validation failed:', errors);
      return null;
    }

    const pack: PreferencePack = {
      id: `pack_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: this.name,
      description: this.description,
      author: authorName,
      category: this.category,
      preferences: [...this.preferences],
      tags: [...this.tags],
      version: 1,
      downloads: 0,
      rating: 0,
      ratingCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPublic: this.isPublic,
    };

    log.info(`Pack built: "${pack.name}" with ${pack.preferences.length} preferences`);
    return pack;
  }

  /** Create a pack from user's knowledge graph data */
  static fromGraphEntities(
    entities: Array<{ name: string; type: string; weight: number }>,
    topN: number = 20,
  ): PackPreference[] {
    return entities
      .filter((e) => e.type === 'topic' || e.type === 'interest')
      .sort((a, b) => b.weight - a.weight)
      .slice(0, topN)
      .map((e) => ({
        topic: e.name,
        sentiment: 'positive' as const,
        strength: Math.min(1, e.weight),
        explanation: '',
      }));
  }

  /** Reset the builder */
  reset(): this {
    this.name = '';
    this.description = '';
    this.category = 'other';
    this.tags = [];
    this.preferences = [];
    this.isPublic = true;
    return this;
  }
}
