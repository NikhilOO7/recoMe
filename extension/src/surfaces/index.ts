import type { Platform } from '@shared/types';
import type { PlatformSurface } from './PlatformSurface';
import { AmazonSearchSurface } from './platforms/AmazonSearchSurface';
import { YouTubeSurface } from './platforms/YouTubeSurface';
import { RedditSurface } from './platforms/RedditSurface';
import { EbaySurface } from './platforms/EbaySurface';
import { WalmartSurface } from './platforms/WalmartSurface';
import { CourseraSurface } from './platforms/CourseraSurface';

/**
 * Returns a PlatformSurface for the given platform, or null if this platform
 * doesn't have a card-scoring surface yet (e.g. LinkedIn jobs, Udemy courses —
 * those use the proactive insight cards, not the per-card badges).
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
    case 'walmart':
      return new WalmartSurface();
    case 'coursera':
      return new CourseraSurface();
    default:
      return null;
  }
}

export { PlatformSurface } from './PlatformSurface';
export type { CardCandidate } from './PlatformSurface';
