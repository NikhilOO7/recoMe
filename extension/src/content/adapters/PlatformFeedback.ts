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

const log = createLogger('PlatformFeedback');

// Cache the setting for the lifetime of the content script
let settingLoaded = false;
let enabled = false;

async function isEnabled(): Promise<boolean> {
  if (settingLoaded) return enabled;
  try {
    const r = await chrome.storage.sync.get('recome_settings');
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
  /** Find the "Not interested" option inside the opened menu */
  findDismissOption(): HTMLElement | null;
  /** Delay before looking for the dismiss option (menu animation) */
  menuOpenDelay: number;
  /** Delay before closing any lingering undo toasts/dialogs */
  postClickDelay: number;
}

const youtubeStrategy: DismissStrategy = {
  menuOpenDelay: 300,
  postClickDelay: 100,

  findMenuTrigger(card: HTMLElement): HTMLElement | null {
    // YouTube uses a three-dot menu button inside the card
    return card.querySelector<HTMLElement>(
      'button.yt-icon-button#button[aria-label="Action menu"], ' +
        'yt-icon-button#button, ' +
        'ytd-menu-renderer button[aria-label], ' +
        'button[aria-label="More actions"], ' +
        'button[aria-label="Action menu"]',
    );
  },

  findDismissOption(): HTMLElement | null {
    // The menu renders as a popup outside the card
    const menuItems = document.querySelectorAll<HTMLElement>(
      'ytd-menu-service-item-renderer, tp-yt-paper-item',
    );
    for (const item of menuItems) {
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
    // Instagram's three-dot menu on posts
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

  findDismissOption(): HTMLElement | null {
    // Instagram menu renders as a dialog/modal
    const buttons = document.querySelectorAll<HTMLElement>(
      'div[role="dialog"] button, div[role="menu"] button, div[role="menuitem"]',
    );
    for (const btn of buttons) {
      const text = btn.textContent?.trim().toLowerCase() ?? '';
      if (text.includes('not interested') || text.includes('hide')) {
        return btn;
      }
    }
    return null;
  },
};

const twitterStrategy: DismissStrategy = {
  menuOpenDelay: 300,
  postClickDelay: 100,

  findMenuTrigger(card: HTMLElement): HTMLElement | null {
    // Twitter's caret/more menu on tweets
    return card.querySelector<HTMLElement>(
      '[data-testid="caret"], ' + 'button[aria-label="More"], ' + 'div[aria-label="More"]',
    );
  },

  findDismissOption(): HTMLElement | null {
    // Twitter menu renders as a dropdown
    const items = document.querySelectorAll<HTMLElement>(
      '[data-testid="Dropdown"] [role="menuitem"], ' + 'div[role="menu"] div[role="menuitem"]',
    );
    for (const item of items) {
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
    // Facebook's three-dot menu
    return card.querySelector<HTMLElement>(
      '[aria-label="Actions for this post"], ' +
        '[aria-label="More"], ' +
        'div[aria-haspopup="menu"]',
    );
  },

  findDismissOption(): HTMLElement | null {
    const items = document.querySelectorAll<HTMLElement>(
      'div[role="menu"] div[role="menuitem"], ' + 'div[role="dialog"] div[role="menuitem"]',
    );
    for (const item of items) {
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

  findDismissOption(): HTMLElement | null {
    const items = document.querySelectorAll<HTMLElement>(
      '.feed-shared-control-menu__content li, ' + 'div[role="menu"] li',
    );
    for (const item of items) {
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

  // Step 4: Find the dismiss option
  const dismissBtn = strategy.findDismissOption();
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
