import { createLogger } from '@shared/Logger';
import type {
  ImportResult,
  ImportProgress,
  ImportPhase,
  PlatformImporter,
  RawImportData,
  RawImportItem,
  PreferenceInference,
} from './types';

const log = createLogger('ImportManager');

const IMPORT_HISTORY_KEY = 'recome_import_history';
const SEEN_IDS_KEY_PREFIX = 'recome_import_seen_';
const MAX_SEEN_IDS = 10_000;

export interface ImportHistoryEntry {
  platform: string;
  completedAt: number;
  itemsFound: number;
  itemsNew: number;
  preferencesInferred: number;
}

/**
 * ImportManager — orchestrates platform data imports.
 *
 * Flow:
 * 1. Select platform importer
 * 2. Extract raw data (DOM scrape, file upload, or API)
 * 3. Deduplicate against previously seen items
 * 4. Infer preferences from aggregated data
 * 5. Save to memory/knowledge graph via background message
 * 6. Record import history
 */
export class ImportManager {
  private readonly importers = new Map<string, PlatformImporter>();
  private activeImport: ImportProgress | null = null;
  private progressCallback: ((progress: ImportProgress) => void) | null = null;

  /** Register a platform importer */
  register(importer: PlatformImporter): void {
    this.importers.set(importer.platform, importer);
  }

  /** Get all registered importers */
  getImporters(): PlatformImporter[] {
    return Array.from(this.importers.values());
  }

  /** Get importer for a platform */
  getImporter(platform: string): PlatformImporter | null {
    return this.importers.get(platform) ?? null;
  }

  /** Set progress callback */
  onProgress(cb: (progress: ImportProgress) => void): void {
    this.progressCallback = cb;
  }

  /** Check if an import is currently running */
  isImporting(): boolean {
    return this.activeImport !== null;
  }

  /** Import from DOM scrape */
  async importFromDOM(platform: string, doc: Document): Promise<ImportResult> {
    const importer = this.importers.get(platform);
    if (!importer?.importFromDOM) {
      return this.errorResult(platform, 'DOM scrape not supported for this platform');
    }

    return this.runImport(platform, () => importer.importFromDOM!(doc));
  }

  /** Import from file upload */
  async importFromFile(platform: string, file: File): Promise<ImportResult> {
    const importer = this.importers.get(platform);
    if (!importer?.importFromFile) {
      return this.errorResult(platform, 'File import not supported for this platform');
    }

    return this.runImport(platform, () => importer.importFromFile!(file));
  }

  /** Import via API */
  async importFromAPI(platform: string): Promise<ImportResult> {
    const importer = this.importers.get(platform);
    if (!importer?.importFromAPI) {
      return this.errorResult(platform, 'API import not supported for this platform');
    }

    return this.runImport(platform, () => importer.importFromAPI!());
  }

  /** Get import history */
  async getHistory(): Promise<ImportHistoryEntry[]> {
    try {
      const stored = await chrome.storage.local.get(IMPORT_HISTORY_KEY);
      return (stored[IMPORT_HISTORY_KEY] as ImportHistoryEntry[] | undefined) ?? [];
    } catch {
      return [];
    }
  }

  // ── Core import pipeline ───────────────────────────────────────────────────

  private async runImport(
    platform: string,
    extractFn: () => Promise<RawImportData>,
  ): Promise<ImportResult> {
    if (this.activeImport) {
      return this.errorResult(platform, 'Another import is already running');
    }

    const start = performance.now();
    this.updateProgress(platform, 'extracting', 0, 0);

    try {
      // 1. Extract raw data
      const rawData = await extractFn();
      const total = rawData.items.length;
      this.updateProgress(platform, 'parsing', 0, total);

      if (total === 0) {
        this.updateProgress(platform, 'complete', 0, 0);
        return {
          platform,
          itemsFound: 0,
          itemsNew: 0,
          itemsDuplicate: 0,
          preferencesInferred: [],
          errors: [],
          duration: performance.now() - start,
        };
      }

      // 2. Deduplicate
      this.updateProgress(platform, 'deduplicating', 0, total);
      const { newItems, duplicateCount } = await this.deduplicate(platform, rawData.items);
      this.updateProgress(platform, 'deduplicating', total, total);

      // 3. Infer preferences
      this.updateProgress(platform, 'inferring', 0, newItems.length);
      const preferences = this.inferPreferences(platform, rawData.items);
      this.updateProgress(platform, 'inferring', newItems.length, newItems.length);

      // 4. Save to brain via background message
      this.updateProgress(platform, 'saving', 0, newItems.length);
      await this.saveImportedData(platform, newItems, preferences);
      this.updateProgress(platform, 'saving', newItems.length, newItems.length);

      // 5. Record history
      await this.recordHistory({
        platform,
        completedAt: Date.now(),
        itemsFound: total,
        itemsNew: newItems.length,
        preferencesInferred: preferences.length,
      });

      this.updateProgress(platform, 'complete', total, total);

      const result: ImportResult = {
        platform,
        itemsFound: total,
        itemsNew: newItems.length,
        itemsDuplicate: duplicateCount,
        preferencesInferred: preferences,
        errors: [],
        duration: performance.now() - start,
      };

      log.info(
        `Import complete: ${platform} — ${total} items, ${newItems.length} new, ${preferences.length} preferences`,
      );
      return result;
    } catch (err) {
      this.updateProgress(platform, 'error', 0, 0);
      log.error(`Import failed: ${platform}`, err);
      return this.errorResult(platform, err instanceof Error ? err.message : 'Unknown error');
    } finally {
      this.activeImport = null;
    }
  }

  private async deduplicate(
    platform: string,
    items: RawImportItem[],
  ): Promise<{ newItems: RawImportItem[]; duplicateCount: number }> {
    const seenKey = `${SEEN_IDS_KEY_PREFIX}${platform}`;
    const stored = await chrome.storage.local.get(seenKey);
    const seenIds = new Set<string>((stored[seenKey] as string[] | undefined) ?? []);

    const newItems: RawImportItem[] = [];
    let duplicateCount = 0;

    for (const item of items) {
      if (seenIds.has(item.externalId)) {
        duplicateCount++;
      } else {
        newItems.push(item);
        seenIds.add(item.externalId);
      }
    }

    // Persist seen IDs (cap to prevent unbounded growth)
    const idsArray = Array.from(seenIds);
    const trimmed =
      idsArray.length > MAX_SEEN_IDS ? idsArray.slice(idsArray.length - MAX_SEEN_IDS) : idsArray;
    await chrome.storage.local.set({ [seenKey]: trimmed });

    return { newItems, duplicateCount };
  }

  private inferPreferences(platform: string, items: RawImportItem[]): PreferenceInference[] {
    // Count topic occurrences across all items
    const topicCounts = new Map<string, { count: number; evidence: string[] }>();

    for (const item of items) {
      // Extract topics from title words (simplified — Brain agents will do deeper analysis)
      const words = item.title
        .toLowerCase()
        .split(/[\s\-_|:,]+/)
        .filter((w) => w.length > 3);

      for (const word of words) {
        const existing = topicCounts.get(word);
        if (existing) {
          existing.count++;
          if (existing.evidence.length < 5) existing.evidence.push(item.title);
        } else {
          topicCounts.set(word, { count: 1, evidence: [item.title] });
        }
      }
    }

    // Convert high-frequency topics to preferences
    const minCount = Math.max(3, Math.floor(items.length * 0.05));
    const preferences: PreferenceInference[] = [];

    for (const [topic, { count, evidence }] of topicCounts) {
      if (count >= minCount) {
        preferences.push({
          topic,
          confidence: Math.min(0.9, count / items.length),
          source: `${platform}_import`,
          evidence,
        });
      }
    }

    // Sort by confidence and take top 20
    return preferences.sort((a, b) => b.confidence - a.confidence).slice(0, 20);
  }

  private async saveImportedData(
    platform: string,
    items: RawImportItem[],
    preferences: PreferenceInference[],
  ): Promise<void> {
    try {
      await chrome.runtime.sendMessage({
        type: 'IMPORT_DATA',
        payload: {
          memory: {
            entries: items.map((item) => ({
              title: item.title,
              url: item.url,
              timestamp: item.timestamp ?? Date.now(),
              source_type: 'platform_import',
              source_platform: platform,
              interaction_type: item.interactionType,
              external_id: item.externalId,
              metadata: item.metadata,
            })),
          },
          graph: {
            entities: preferences.map((p) => ({
              name: p.topic,
              type: 'topic',
              confidence: p.confidence,
              source: p.source,
            })),
          },
        },
      });
    } catch (err) {
      log.warn('Failed to save imported data to background', err);
    }
  }

  private async recordHistory(entry: ImportHistoryEntry): Promise<void> {
    try {
      const history = await this.getHistory();
      history.unshift(entry);
      // Keep last 50 entries
      const trimmed = history.slice(0, 50);
      await chrome.storage.local.set({ [IMPORT_HISTORY_KEY]: trimmed });
    } catch {
      // Non-critical
    }
  }

  private updateProgress(
    platform: string,
    phase: ImportPhase,
    processed: number,
    total: number,
  ): void {
    const progress: ImportProgress = {
      platform,
      phase,
      itemsProcessed: processed,
      itemsTotal: total,
      percentage: total > 0 ? Math.round((processed / total) * 100) : 0,
      startedAt: this.activeImport?.startedAt ?? Date.now(),
    };
    this.activeImport = progress;
    this.progressCallback?.(progress);
  }

  private errorResult(platform: string, message: string): ImportResult {
    return {
      platform,
      itemsFound: 0,
      itemsNew: 0,
      itemsDuplicate: 0,
      preferencesInferred: [],
      errors: [{ code: 'IMPORT_FAILED', message, recoverable: true }],
      duration: 0,
    };
  }
}
