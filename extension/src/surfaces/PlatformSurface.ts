/**
 * PlatformSurface — per-platform card discovery for the in-page scoring overlay.
 *
 * Each surface knows:
 *   - which CSS selector matches "cards" on its platform's feed/search pages
 *   - how to derive a stable id for a card element (used as React-like key)
 *   - how to pull { title, brand?, url? } from a card element
 *   - where on the card to anchor the badge / reasoning callout
 *
 * The surface MUST NOT render anything — that's CardBadge's job. The surface
 * is pure DOM observation + extraction, so badge rendering and selector
 * mechanics live in different files.
 */

import type { Platform } from '@shared/types';

export interface CardCandidate {
  id: string;
  element: HTMLElement;
  title: string;
  brand?: string;
  url?: string;
}

export abstract class PlatformSurface {
  abstract readonly platform: Platform;

  /** CSS selector that returns one or more card elements on this page. */
  abstract cardSelector(): string;

  /** Returns true if this page is a scoreable feed/search; false to skip badges. */
  abstract isScoreablePage(): boolean;

  /**
   * Build a CardCandidate from an element. Return null if the element is a
   * sponsored row, an ad, or otherwise should not be scored.
   */
  abstract extract(el: HTMLElement): CardCandidate | null;

  /**
   * Derive a stable id for a card element. Default uses a `data-recome-id`
   * attribute (set by the runtime); override to use a more semantic id
   * (e.g. Amazon ASIN).
   */
  cardId(el: HTMLElement, fallbackIndex: number): string {
    const existing = el.getAttribute('data-recome-id');
    if (existing) return existing;
    const id = `card_${fallbackIndex}_${Math.random().toString(36).slice(2, 8)}`;
    el.setAttribute('data-recome-id', id);
    return id;
  }
}
