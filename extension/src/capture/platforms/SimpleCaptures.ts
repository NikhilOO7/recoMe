/**
 * Compact per-platform captures for surfaces where Phase 1 just needs the
 * page title + URL extract. Each is small enough to live together; if any
 * one grows non-trivial (e.g. eBay PDP entity scraping), split into its own
 * file.
 */

import {
  PlatformCapture,
  type PageExtract,
  extractCategoriesAndBrands,
  pickText,
  tokenizeTitle,
} from '../PlatformCapture';
import type { Platform, SignalEntity, SignalTopic } from '@shared/types';

function baseExtract(platform: Platform, title: string): PageExtract | null {
  if (!title) return null;
  const { topics, entities } = extractCategoriesAndBrands(title, platform);
  for (const tok of tokenizeTitle(title)) {
    if (!topics.some((t) => t.name === tok)) topics.push({ name: tok });
  }
  if (topics.length === 0 && entities.length === 0) return null;
  return { topics, entities, pageTitle: title, pageUrl: location.href, pageKind: 'page' };
}

// ── Shopping ────────────────────────────────────────────────────────────────

export class EbayCapture extends PlatformCapture {
  readonly platform: Platform = 'ebay';
  extract(): PageExtract | null {
    const title = pickText('h1.x-item-title__mainTitle span', 'h1#itemTitle', 'h1');
    return baseExtract(this.platform, title || document.title);
  }
}

export class WalmartCapture extends PlatformCapture {
  readonly platform: Platform = 'walmart';
  extract(): PageExtract | null {
    const title = pickText('h1[itemprop="name"]', 'h1');
    return baseExtract(this.platform, title || document.title);
  }
}

// ── Social ──────────────────────────────────────────────────────────────────

export class TwitterCapture extends PlatformCapture {
  readonly platform: Platform = 'twitter';
  override pageKind(): string {
    if (location.pathname.match(/\/status\/\d+/)) return 'tweet';
    if (location.pathname.match(/^\/[a-zA-Z0-9_]+\/?$/)) return 'profile';
    return 'page';
  }
  extract(): PageExtract | null {
    // Tweet pages: pull tweet text as topic source. Profile pages: handle as entity.
    const tweetEl = document.querySelector('article [data-testid="tweetText"]');
    const tweetText = tweetEl?.textContent?.trim() ?? '';
    const handleMatch = location.pathname.match(/^\/([a-zA-Z0-9_]+)/);
    const handle = handleMatch?.[1];

    const topics: SignalTopic[] = [];
    const entities: SignalEntity[] = [];
    if (tweetText) {
      const cb = extractCategoriesAndBrands(tweetText, this.platform);
      topics.push(...cb.topics);
      entities.push(...cb.entities);
      for (const tok of tokenizeTitle(tweetText, 4)) {
        if (!topics.some((t) => t.name === tok)) topics.push({ name: tok });
      }
    }
    if (handle && handle !== 'home' && handle !== 'explore' && handle !== 'notifications') {
      entities.push({ name: '@' + handle, kind: 'creator', platform: this.platform });
    }
    if (topics.length === 0 && entities.length === 0) return null;
    return { topics, entities, pageTitle: document.title, pageUrl: location.href };
  }
}

export class FacebookCapture extends PlatformCapture {
  readonly platform: Platform = 'facebook';
  extract(): PageExtract | null {
    // Conservative: only emit on a page with a clear story/post title.
    const heading = pickText('h2[dir="auto"]', 'h1');
    return baseExtract(this.platform, heading);
  }
}

export class InstagramCapture extends PlatformCapture {
  readonly platform: Platform = 'instagram';
  extract(): PageExtract | null {
    // Use captions when on a post; otherwise nothing.
    if (!location.pathname.startsWith('/p/') && !location.pathname.startsWith('/reel/'))
      return null;
    const caption = pickText('article [role="button"] + div span', 'h1');
    return baseExtract(this.platform, caption);
  }
}

export class TikTokCapture extends PlatformCapture {
  readonly platform: Platform = 'tiktok';
  extract(): PageExtract | null {
    const desc = pickText('[data-e2e="browse-video-desc"]', 'h1');
    return baseExtract(this.platform, desc);
  }
}

// ── Professional / careers ──────────────────────────────────────────────────

export class LinkedInCapture extends PlatformCapture {
  readonly platform: Platform = 'linkedin';
  override pageKind(): string {
    if (location.pathname.startsWith('/jobs/view/')) return 'job';
    if (location.pathname.startsWith('/company/')) return 'company';
    return 'page';
  }
  extract(): PageExtract | null {
    if (location.pathname.startsWith('/jobs/view/')) {
      const jobTitle = pickText('h1.t-24', 'h1.top-card-layout__title', 'h1');
      const company = pickText('.topcard__org-name-link', 'a[data-test-app-aware-link]');
      const ex = baseExtract(this.platform, jobTitle);
      if (ex && company)
        ex.entities.push({ name: company, kind: 'category', platform: this.platform });
      return ex;
    }
    if (location.pathname.startsWith('/company/')) {
      const company = pickText('h1.org-top-card-summary__title', 'h1');
      if (!company) return null;
      return {
        topics: [],
        entities: [{ name: company, kind: 'category', platform: this.platform }],
        pageTitle: company,
        pageUrl: location.href,
        pageKind: 'company',
      };
    }
    return null;
  }
}

export class IndeedCapture extends PlatformCapture {
  readonly platform: Platform = 'indeed';
  extract(): PageExtract | null {
    const jobTitle = pickText(
      'h1.jobsearch-JobInfoHeader-title',
      'h2.jobsearch-JobInfoHeader-title',
      'h1',
    );
    return baseExtract(this.platform, jobTitle);
  }
}

export class GlassdoorCapture extends PlatformCapture {
  readonly platform: Platform = 'glassdoor';
  extract(): PageExtract | null {
    const title = pickText('[data-test="job-title"]', '[data-test="employer-name"]', 'h1');
    return baseExtract(this.platform, title);
  }
}

// ── Learning ────────────────────────────────────────────────────────────────

export class UdemyCapture extends PlatformCapture {
  readonly platform: Platform = 'udemy';
  extract(): PageExtract | null {
    const title = pickText('h1[data-purpose="lead-title"]', 'h1');
    const ex = baseExtract(this.platform, title);
    if (ex) ex.pageKind = 'course';
    return ex;
  }
}

export class CourseraCapture extends PlatformCapture {
  readonly platform: Platform = 'coursera';
  extract(): PageExtract | null {
    const title = pickText('h1[data-track-component="hero_title"]', 'h1');
    const ex = baseExtract(this.platform, title);
    if (ex) ex.pageKind = 'course';
    return ex;
  }
}

export class EdxCapture extends PlatformCapture {
  readonly platform: Platform = 'edx';
  extract(): PageExtract | null {
    const title = pickText('h1.course-header__title', 'h1');
    const ex = baseExtract(this.platform, title);
    if (ex) ex.pageKind = 'course';
    return ex;
  }
}

// ── Fallback ────────────────────────────────────────────────────────────────

export class GenericCapture extends PlatformCapture {
  readonly platform: Platform = 'generic';
  extract(): PageExtract | null {
    // Use <meta name="description"> + <title> as topic source.
    const desc =
      (
        document.querySelector('meta[name="description"]') as HTMLMetaElement | null
      )?.content?.trim() ?? '';
    return baseExtract(this.platform, document.title + ' ' + desc);
  }
}
