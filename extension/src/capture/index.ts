import type { Platform } from '@shared/types';
import type { PlatformCapture } from './PlatformCapture';
import { YouTubeCapture } from './platforms/YouTubeCapture';
import { AmazonCapture } from './platforms/AmazonCapture';
import { RedditCapture } from './platforms/RedditCapture';
import {
  EbayCapture,
  WalmartCapture,
  TwitterCapture,
  FacebookCapture,
  InstagramCapture,
  TikTokCapture,
  LinkedInCapture,
  IndeedCapture,
  GlassdoorCapture,
  UdemyCapture,
  CourseraCapture,
  EdxCapture,
  GenericCapture,
} from './platforms/SimpleCaptures';

export function createCapture(platform: Platform): PlatformCapture {
  switch (platform) {
    case 'youtube':
      return new YouTubeCapture();
    case 'amazon':
      return new AmazonCapture();
    case 'reddit':
      return new RedditCapture();
    case 'ebay':
      return new EbayCapture();
    case 'walmart':
      return new WalmartCapture();
    case 'twitter':
      return new TwitterCapture();
    case 'facebook':
      return new FacebookCapture();
    case 'instagram':
      return new InstagramCapture();
    case 'tiktok':
      return new TikTokCapture();
    case 'linkedin':
      return new LinkedInCapture();
    case 'indeed':
      return new IndeedCapture();
    case 'glassdoor':
      return new GlassdoorCapture();
    case 'udemy':
      return new UdemyCapture();
    case 'coursera':
      return new CourseraCapture();
    case 'edx':
      return new EdxCapture();
    default:
      return new GenericCapture();
  }
}

export { PlatformCapture } from './PlatformCapture';
export { detectPlatform } from './detect';
export { DwellSignal } from './triggers/DwellSignal';
export { SearchSignal } from './triggers/SearchSignal';
