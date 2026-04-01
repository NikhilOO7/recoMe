/**
 * PlatformFeedback — auto-clicks native "Not interested" / dismiss buttons
 * on supported platforms to train their recommendation algorithms.
 *
 * Triggered after RecoMe hides a card. The flow:
 * 1. Find the platform's menu trigger (three-dot button)
 * 2. Click it to open the menu
 * 3. Find and click "Not interested" / "Don't recommend" option
 * 4. Close the menu if it didn't auto-close
 *
 * Only runs when the user has opted in via settings (train_platform_algo).
 */

import type { Platform } from '@shared/types';
import { createLogger } from '@shared/Logger';
import { safeStorageSyncGet } from '@shared/storageSync';

const log = createLogger('PlatformFeedback');

// Cache the setting for the lifetime of the content script
let settingLoaded = false;
let enabled = false;

async function isEnabled(): Promise<boolean> {
  if (settingLoaded) return enabled;
  try {
    const r = await safeStorageSyncGet('recome_settings');
    const settings = r['recome_settings'] as { train_platform_algo?: boolean } | undefined;
    enabled = settings?.train_platform_algo === true;
  } catch {
    enabled = false;
  }
  settingLoaded = true;
  return enabled;
}

// Listen for setting changes so we pick up toggles without page reload
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes['recome_settings']) {
      const s = changes['recome_settings'].newValue as
        | { train_platform_algo?: boolean }
        | undefined;
      enabled = s?.train_platform_algo === true;
      settingLoaded = true;
    }
  });
} catch {
  // Content script may not have access in all contexts
}

// ── Per-platform strategies ────────────────────────────────────────────────

interface DismissStrategy {
  /** Find the menu trigger button inside/near the card */
  findMenuTrigger(card: HTMLElement): HTMLElement | null;
  /**
   * Find the "Not interested" option inside the opened menu.
   * The `menuTrigger` param is the element that was clicked to open the menu,
   * allowing strategies to scope their search to the menu owned by that trigger.
   */
  findDismissOption(menuTrigger: HTMLElement): HTMLElement | null;
  /** Delay before looking for the dismiss option (menu animation) */
  menuOpenDelay: number;
  /** Delay before closing any lingering undo toasts/dialogs */
  postClickDelay: number;
}

/**
 * Finds the most recently opened menu/popup/dropdown that appeared after
 * clicking a trigger. Scopes the search by checking which popup appeared
 * closest (temporally) to the trigger click, verified by DOM proximity
 * when possible.
 */
function findScopedMenu(
  menuTrigger: HTMLElement,
  containerSelectors: string,
  itemSelectors: string,
): { scope: ParentNode; items: NodeListOf<HTMLElement> } | null {
  // Strategy: find all matching containers, prefer the one that is a sibling
  // or descendant of the trigger's card, fall back to the last opened one.
  const containers = document.querySelectorAll<HTMLElement>(containerSelectors);
  if (containers.length === 0) return null;

  // Try to find a container that is controlled by / adjacent to the trigger
  const triggerCard = menuTrigger.closest('[data-recome-id]') ?? menuTrigger.parentElement;
  for (let i = containers.length - 1; i >= 0; i--) {
    const container = containers[i]!;
    // Check if this menu is inside the same card, or is the aria-controlled target
    const ariaControls = menuTrigger.getAttribute('aria-controls');
    if (ariaControls && container.id === ariaControls) {
      return { scope: container, items: container.querySelectorAll<HTMLElement>(itemSelectors) };
    }
    if (triggerCard?.contains(container)) {
      return { scope: container, items: container.querySelectorAll<HTMLElement>(itemSelectors) };
    }
  }

  // Fall back to the most recently added container (last in DOM order)
  const lastContainer = containers[containers.length - 1]!;
  return {
    scope: lastContainer,
    items: lastContainer.querySelectorAll<HTMLElement>(itemSelectors),
  };
}

const youtubeStrategy: DismissStrategy = {
  menuOpenDelay: 300,
  postClickDelay: 100,

  findMenuTrigger(card: HTMLElement): HTMLElement | null {
    return card.querySelector<HTMLElement>(
      'button.yt-icon-button#button[aria-label="Action menu"], ' +
        'yt-icon-button#button, ' +
        'ytd-menu-renderer button[aria-label], ' +
        'button[aria-label="More actions"], ' +
        'button[aria-label="Action menu"]',
    );
  },

  findDismissOption(menuTrigger: HTMLElement): HTMLElement | null {
    const result = findScopedMenu(
      menuTrigger,
      'ytd-popup-container tp-yt-iron-dropdown, tp-yt-iron-dropdown, ytd-menu-popup-renderer',
      'ytd-menu-service-item-renderer, tp-yt-paper-item',
    );
    if (!result) return null;
    for (const item of result.items) {
      const text = item.textContent?.trim().toLowerCase() ?? '';
      if (text.includes('not interested') || text.includes("don't recommend")) {
        return item;
      }
    }
    return null;
  },
};

const instagramStrategy: DismissStrategy = {
  menuOpenDelay: 400,
  postClickDelay: 200,

  findMenuTrigger(card: HTMLElement): HTMLElement | null {
    return (
      (card
        .querySelector<HTMLElement>(
          'button[aria-label="More options"], ' +
            'div[role="button"] svg[aria-label="More options"], ' +
            '[aria-label="More options"]',
        )
        ?.closest('button, div[role="button"]') as HTMLElement | null) ??
      (card
        .querySelector<HTMLElement>('svg[aria-label="More options"]')
        ?.closest('button, div[role="button"]') as HTMLElement | null)
    );
  },

  findDismissOption(menuTrigger: HTMLElement): HTMLElement | null {
    const result = findScopedMenu(
      menuTrigger,
      'div[role="dialog"]',
      'button, div[role="menuitem"]',
    );
    if (!result) return null;
    for (const item of result.items) {
      const text = item.textContent?.trim().toLowerCase() ?? '';
      if (text.includes('not interested') || text.includes('hide')) {
        return item;
      }
    }
    return null;
  },
};

const twitterStrategy: DismissStrategy = {
  menuOpenDelay: 300,
  postClickDelay: 100,

  findMenuTrigger(card: HTMLElement): HTMLElement | null {
    return card.querySelector<HTMLElement>(
      '[data-testid="caret"], ' + 'button[aria-label="More"], ' + 'div[aria-label="More"]',
    );
  },

  findDismissOption(menuTrigger: HTMLElement): HTMLElement | null {
    const result = findScopedMenu(
      menuTrigger,
      '[data-testid="Dropdown"], div[role="menu"]',
      '[role="menuitem"]',
    );
    if (!result) return null;
    for (const item of result.items) {
      const text = item.textContent?.trim().toLowerCase() ?? '';
      if (text.includes('not interested') || text.includes('this post isn')) {
        return item;
      }
    }
    return null;
  },
};

const facebookStrategy: DismissStrategy = {
  menuOpenDelay: 400,
  postClickDelay: 200,

  findMenuTrigger(card: HTMLElement): HTMLElement | null {
    return card.querySelector<HTMLElement>(
      '[aria-label="Actions for this post"], ' +
        '[aria-label="More"], ' +
        'div[aria-haspopup="menu"]',
    );
  },

  findDismissOption(menuTrigger: HTMLElement): HTMLElement | null {
    const result = findScopedMenu(
      menuTrigger,
      'div[role="menu"], div[role="dialog"]',
      'div[role="menuitem"]',
    );
    if (!result) return null;
    for (const item of result.items) {
      const text = item.textContent?.trim().toLowerCase() ?? '';
      if (
        text.includes('hide post') ||
        text.includes('not interested') ||
        text.includes('hide all from')
      ) {
        return item;
      }
    }
    return null;
  },
};

const linkedinStrategy: DismissStrategy = {
  menuOpenDelay: 300,
  postClickDelay: 100,

  findMenuTrigger(card: HTMLElement): HTMLElement | null {
    return card.querySelector<HTMLElement>(
      'button.feed-shared-control-menu__trigger, ' +
        'button[aria-label*="more actions"], ' +
        'button[aria-label*="More actions"]',
    );
  },

  findDismissOption(menuTrigger: HTMLElement): HTMLElement | null {
    const result = findScopedMenu(
      menuTrigger,
      '.feed-shared-control-menu__content, div[role="menu"]',
      'li',
    );
    if (!result) return null;
    for (const item of result.items) {
      const text = item.textContent?.trim().toLowerCase() ?? '';
      if (
        text.includes("i don't want to see this") ||
        text.includes('not interested') ||
        text.includes('hide this post')
      ) {
        return item;
      }
    }
    return null;
  },
};

const STRATEGIES: Partial<Record<Platform, DismissStrategy>> = {
  youtube: youtubeStrategy,
  instagram: instagramStrategy,
  twitter: twitterStrategy,
  facebook: facebookStrategy,
  linkedin: linkedinStrategy,
  // Amazon, eBay, Walmart don't have "not interested" buttons — they're e-commerce
};

// ── Throttling ─────────────────────────────────────────────────────────────

// Don't spam platform dismiss too fast — max 1 per 3 seconds
let lastDismissTime = 0;
const DISMISS_COOLDOWN_MS = 3000;

// Track cards we've already dismissed to avoid double-clicking
const dismissedCards = new WeakSet<HTMLElement>();

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Attempt to click the platform's native "Not interested" button for a card.
 * No-op if:
 * - Setting is disabled
 * - Platform doesn't have a strategy
 * - Card was already dismissed
 * - Cooldown hasn't elapsed
 */
export async function triggerPlatformDismiss(platform: Platform, card: HTMLElement): Promise<void> {
  if (!(await isEnabled())) return;

  const strategy = STRATEGIES[platform];
  if (!strategy) return;

  if (dismissedCards.has(card)) return;

  const now = Date.now();
  if (now - lastDismissTime < DISMISS_COOLDOWN_MS) {
    log.debug('Skipping platform dismiss — cooldown active');
    return;
  }

  dismissedCards.add(card);
  lastDismissTime = now;

  try {
    await executeDismiss(strategy, card, platform);
  } catch (err) {
    log.debug(`Platform dismiss failed for ${platform}:`, err);
  }
}

// ── Implementation ─────────────────────────────────────────────────────────

async function executeDismiss(
  strategy: DismissStrategy,
  card: HTMLElement,
  platform: Platform,
): Promise<void> {
  // Step 1: Find the menu trigger
  const trigger = strategy.findMenuTrigger(card);
  if (!trigger) {
    log.debug(`No menu trigger found for ${platform} card`);
    return;
  }

  // Step 2: Click the menu trigger
  trigger.click();

  // Step 3: Wait for menu to open
  await sleep(strategy.menuOpenDelay);

  // Step 4: Find the dismiss option — scoped to the menu opened from this trigger
  const dismissBtn = strategy.findDismissOption(trigger);
  if (!dismissBtn) {
    log.debug(`No dismiss option found for ${platform} — closing menu`);
    // Close the menu by pressing Escape or clicking elsewhere
    document.body.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return;
  }

  // Step 5: Click the dismiss option
  dismissBtn.click();
  log.info(`Platform dismiss triggered for ${platform}`);

  // Step 6: Brief delay, then dismiss any undo toast if needed
  await sleep(strategy.postClickDelay);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
