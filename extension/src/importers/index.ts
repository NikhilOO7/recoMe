export { ImportManager, type ImportHistoryEntry } from './ImportManager';
export { ImportScheduler } from './ImportScheduler';
export type {
  PlatformImporter,
  RawImportData,
  RawImportItem,
  ImportResult,
  ImportProgress,
  ImportSchedule,
  PreferenceInference,
  ImportInteractionType,
} from './types';

// Platform importers
export { YouTubeImporter } from './platforms/YouTubeImporter';
export { AmazonImporter } from './platforms/AmazonImporter';
export { TwitterImporter } from './platforms/TwitterImporter';
export { InstagramImporter } from './platforms/InstagramImporter';
export { RedditImporter } from './platforms/RedditImporter';
export { SpotifyImporter } from './platforms/SpotifyImporter';
export { NetflixImporter } from './platforms/NetflixImporter';

// Parsers
export {
  parseGenericTakeout,
  parseGoogleTakeout,
  parseMetaExport,
  detectTakeoutFormat,
} from './parsers/DataTakeoutParser';
export {
  scrapeText,
  scrapeAttr,
  scrapeAllText,
  scrapeAllLinks,
  scrollToLoadMore,
  scrapeItemList,
} from './parsers/LiveScrapeParser';
