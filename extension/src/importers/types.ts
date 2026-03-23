import type { Platform } from '@schema/context';

// ── Raw Import Data ──────────────────────────────────────────────────────────

export interface RawImportItem {
  /** Platform-specific unique identifier */
  externalId: string;
  title: string;
  /** URL to the original content */
  url?: string;
  /** When the user interacted with this item */
  timestamp?: number;
  /** Type of interaction */
  interactionType: ImportInteractionType;
  /** Additional platform-specific metadata */
  metadata: Record<string, unknown>;
}

export type ImportInteractionType =
  | 'watched'
  | 'liked'
  | 'saved'
  | 'purchased'
  | 'reviewed'
  | 'subscribed'
  | 'followed'
  | 'upvoted'
  | 'bookmarked'
  | 'listened'
  | 'rated'
  | 'wishlisted';

export interface RawImportData {
  platform: Platform | string;
  source: 'dom_scrape' | 'file_upload' | 'api';
  items: RawImportItem[];
  scrapedAt: number;
  /** Pagination: more pages available */
  hasMore?: boolean;
  /** Cursor for next page */
  cursor?: string;
}

// ── Import Result ────────────────────────────────────────────────────────────

export interface ImportResult {
  platform: string;
  itemsFound: number;
  itemsNew: number;
  itemsDuplicate: number;
  preferencesInferred: PreferenceInference[];
  errors: ImportError[];
  duration: number;
}

export interface PreferenceInference {
  topic: string;
  confidence: number;
  source: string;
  evidence: string[];
}

export interface ImportError {
  code: string;
  message: string;
  recoverable: boolean;
}

// ── Import Progress ──────────────────────────────────────────────────────────

export type ImportPhase =
  | 'extracting'
  | 'parsing'
  | 'deduplicating'
  | 'inferring'
  | 'saving'
  | 'complete'
  | 'error';

export interface ImportProgress {
  platform: string;
  phase: ImportPhase;
  itemsProcessed: number;
  itemsTotal: number;
  percentage: number;
  startedAt: number;
}

// ── Import Schedule ──────────────────────────────────────────────────────────

export interface ImportSchedule {
  platform: string;
  frequency: 'daily' | 'weekly' | 'manual';
  lastRun: number | null;
  nextRun: number | null;
  enabled: boolean;
}

// ── Platform Importer Interface ──────────────────────────────────────────────

export interface PlatformImporter {
  readonly platform: string;
  readonly supportsDOMScrape: boolean;
  readonly supportsFileUpload: boolean;
  readonly supportsAPI: boolean;

  /** Extract data by scraping the DOM of the logged-in platform page */
  importFromDOM?(doc: Document): Promise<RawImportData>;

  /** Parse a data export file (Google Takeout, Meta export, etc.) */
  importFromFile?(file: File): Promise<RawImportData>;

  /** Import via platform API (OAuth required) */
  importFromAPI?(): Promise<RawImportData>;

  /** Get the URL the user should navigate to for DOM scraping */
  getScrapeUrl(): string;

  /** Check if the current page is the right one for scraping */
  canScrapeCurrentPage(url: string): boolean;
}
