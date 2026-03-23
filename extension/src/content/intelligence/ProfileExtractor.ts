import type { Platform } from '@schema/context';
import type { PlatformProfile, PlatformIntelligenceModule } from './types';

/**
 * ProfileExtractor — reads user/page context from the current page DOM.
 *
 * All extraction is READ-ONLY and LOCAL-ONLY. No data is sent to any server
 * unless the user has AI enhancement enabled.
 */
export class ProfileExtractor {
  private readonly modules = new Map<Platform, PlatformIntelligenceModule>();

  registerModule(mod: PlatformIntelligenceModule): void {
    this.modules.set(mod.platform, mod);
  }

  /**
   * Extract profile data from the current page.
   * Returns null if no module is registered for this platform.
   */
  extract(platform: Platform, doc: Document): PlatformProfile | null {
    const mod = this.modules.get(platform);
    if (!mod) return null;

    try {
      return mod.extractProfile(doc);
    } catch {
      return null;
    }
  }

  hasModule(platform: Platform): boolean {
    return this.modules.has(platform);
  }
}

// ── DOM utility helpers (safe extraction) ───────────────────────────────────

/** Safely get text content from a selector */
export function safeText(root: Document | Element, selector: string): string {
  try {
    return root.querySelector(selector)?.textContent?.trim() ?? '';
  } catch {
    return '';
  }
}

/** Safely get text from multiple selectors, returns first non-empty */
export function safeTextAny(root: Document | Element, selectors: string[]): string {
  for (const sel of selectors) {
    const text = safeText(root, sel);
    if (text) return text;
  }
  return '';
}

/** Safely get attribute value */
export function safeAttr(root: Document | Element, selector: string, attr: string): string {
  try {
    return root.querySelector(selector)?.getAttribute(attr)?.trim() ?? '';
  } catch {
    return '';
  }
}

/** Get all text content from matching elements */
export function safeTextAll(root: Document | Element, selector: string): string[] {
  try {
    return Array.from(root.querySelectorAll(selector))
      .map((el) => el.textContent?.trim() ?? '')
      .filter((t) => t.length > 0);
  } catch {
    return [];
  }
}
