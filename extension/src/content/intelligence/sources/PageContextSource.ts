import type { Platform } from '@schema/context';
import { safeText, safeTextAll, safeAttr } from '../ProfileExtractor';

/**
 * PageContextSource — extracts structured context from the current page DOM.
 * Platform-aware: knows how to read different page structures.
 */
export interface PageContextData {
  platform: Platform;
  url: string;
  title: string;
  pageType: string;
  topics: string[];
  entities: string[];
  metadata: Record<string, unknown>;
}

export function extractPageContext(platform: Platform, doc: Document): PageContextData {
  const base: PageContextData = {
    platform,
    url: location.href,
    title: doc.title,
    pageType: detectPageType(platform),
    topics: [],
    entities: [],
    metadata: {},
  };

  switch (platform) {
    case 'youtube':
      return extractYouTubeContext(doc, base);
    case 'amazon':
      return extractAmazonContext(doc, base);
    case 'linkedin':
      return extractLinkedInContext(doc, base);
    default:
      return extractGenericContext(doc, base);
  }
}

function detectPageType(platform: Platform): string {
  const path = location.pathname;

  switch (platform) {
    case 'youtube':
      if (path.startsWith('/watch')) return 'video';
      if (path.startsWith('/shorts')) return 'shorts';
      if (path.startsWith('/results')) return 'search';
      if (path.startsWith('/@') || path.startsWith('/c/')) return 'channel';
      return 'home';
    case 'amazon':
      if (path.startsWith('/dp/') || path.startsWith('/gp/product/')) return 'product';
      if (path.startsWith('/s')) return 'search';
      return 'browse';
    case 'linkedin':
      if (path.startsWith('/in/')) return 'profile';
      if (path.startsWith('/jobs')) return 'jobs';
      if (path.startsWith('/learning')) return 'learning';
      if (path.startsWith('/feed')) return 'feed';
      return 'other';
    default:
      return 'unknown';
  }
}

function extractYouTubeContext(doc: Document, base: PageContextData): PageContextData {
  base.metadata['videoTitle'] = safeText(doc, 'h1.ytd-watch-metadata, #title h1');
  base.metadata['channel'] = safeText(doc, '#channel-name a, ytd-channel-name a');
  base.metadata['category'] = safeAttr(doc, 'meta[itemprop="genre"]', 'content');
  base.metadata['description'] = safeText(doc, '#description-text, #description');

  const tags = safeTextAll(doc, 'yt-chip-cloud-chip-renderer');
  base.topics = tags.slice(0, 10);

  return base;
}

function extractAmazonContext(doc: Document, base: PageContextData): PageContextData {
  base.metadata['productTitle'] = safeText(doc, '#productTitle');
  base.metadata['price'] = safeText(doc, '.a-price .a-offscreen, #priceblock_ourprice');
  base.metadata['brand'] = safeText(doc, '#bylineInfo, .product-by-line a');
  base.metadata['category'] = safeText(doc, '#wayfinding-breadcrumbs_container li:last-child a');
  base.metadata['rating'] = safeAttr(doc, '#acrPopover', 'title');

  const breadcrumbs = safeTextAll(doc, '#wayfinding-breadcrumbs_container a');
  base.topics = breadcrumbs;

  return base;
}

function extractLinkedInContext(doc: Document, base: PageContextData): PageContextData {
  base.metadata['role'] = safeText(doc, '.text-body-medium.break-words');
  base.metadata['company'] = safeText(doc, '.inline-show-more-text--is-collapsed');
  base.metadata['location'] = safeText(doc, '.text-body-small.inline.t-black--light.break-words');

  const skills = safeTextAll(doc, '.skill-card-listitem span');
  base.topics = skills.slice(0, 10);

  return base;
}

function extractGenericContext(doc: Document, base: PageContextData): PageContextData {
  // Extract from meta tags
  const metaKeywords = safeAttr(doc, 'meta[name="keywords"]', 'content');
  if (metaKeywords) {
    base.topics = metaKeywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
  }

  const metaDescription = safeAttr(doc, 'meta[name="description"]', 'content');
  if (metaDescription) {
    base.metadata['description'] = metaDescription;
  }

  return base;
}
