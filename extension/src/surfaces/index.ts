import type { Platform } from '@shared/types';
import type { PlatformSurface } from './PlatformSurface';
import { AmazonSearchSurface } from './platforms/AmazonSearchSurface';
import { YouTubeSurface } from './platforms/YouTubeSurface';
import { RedditSurface } from './platforms/RedditSurface';
import { EbaySurface } from './platforms/EbaySurface';

/**
 * Returns a PlatformSurface for the given platform, or null if this platform
 * doesn't have a card-scoring surface (e.g. LinkedIn jobs, Udemy courses —
 * those use the proactive insight cards in Phase 3, not the per-card badges).
 */
export function createSurface(platform: Platform): PlatformSurface | null {
  switch (platform) {
    case 'amazon':
      return new AmazonSearchSurface();
    case 'youtube':
      return new YouTubeSurface();
    case 'reddit':
      return new RedditSurface();
    case 'ebay':
      return new EbaySurface();
    default:
      return null;
  }
}

export { PlatformSurface } from './PlatformSurface';
export type { CardCandidate } from './PlatformSurface';
