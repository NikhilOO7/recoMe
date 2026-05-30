import {
  PlatformCapture,
  type PageExtract,
  extractCategoriesAndBrands,
  pickText,
  tokenizeTitle,
} from '../PlatformCapture';
import type { Platform, SignalEntity, SignalTopic } from '@shared/types';

const PDP_RE = /\/(dp|gp\/product)\//;

export class AmazonCapture extends PlatformCapture {
  readonly platform: Platform = 'amazon';

  override pageKind(): string {
    if (PDP_RE.test(location.pathname)) return 'pdp';
    if (location.pathname.startsWith('/s')) return 'search';
    return 'page';
  }

  extract(): PageExtract | null {
    if (PDP_RE.test(location.pathname)) return this.extractPdp();
    if (location.pathname.startsWith('/s')) return this.extractSearch();
    return null;
  }

  private extractPdp(): PageExtract | null {
    const title = pickText('#productTitle', 'h1#title');
    if (!title) return null;

    const brand = pickText('#bylineInfo', '#brand')
      .replace(/^(Visit the |Brand: )/i, '')
      .replace(/ Store$/, '')
      .trim();

    const categoryNodes = document.querySelectorAll('#wayfinding-breadcrumbs_feature_div a');
    const categories = Array.from(categoryNodes)
      .map((el) => el.textContent?.trim() ?? '')
      .filter(Boolean);

    const topics: SignalTopic[] = [];
    const entities: SignalEntity[] = [];

    const cb = extractCategoriesAndBrands(title, this.platform);
    topics.push(...cb.topics);
    entities.push(...cb.entities);

    for (const c of categories) {
      const lc = c.toLowerCase();
      if (!topics.some((t) => t.name === lc)) topics.push({ name: lc });
    }
    for (const tok of tokenizeTitle(title)) {
      if (!topics.some((t) => t.name === tok)) topics.push({ name: tok });
    }
    if (brand && !entities.some((e) => e.name.toLowerCase() === brand.toLowerCase())) {
      entities.push({ name: brand, kind: 'brand', platform: this.platform });
    }

    const asinMatch = location.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/);
    return {
      topics,
      entities,
      pageTitle: title,
      pageUrl: location.href,
      contentId: asinMatch?.[1],
      pageKind: 'pdp',
    };
  }

  private extractSearch(): PageExtract | null {
    const q = new URLSearchParams(location.search).get('k')?.trim();
    if (!q) return null;
    const { topics, entities } = extractCategoriesAndBrands(q, this.platform);
    for (const tok of tokenizeTitle(q, 3)) {
      if (!topics.some((t) => t.name === tok)) topics.push({ name: tok });
    }
    if (topics.length === 0) topics.push({ name: q.toLowerCase() });
    return {
      topics,
      entities,
      pageTitle: `Amazon search: ${q}`,
      pageUrl: location.href,
      pageKind: 'search',
    };
  }
}
