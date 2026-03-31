/**
 * PageEligibility — strict gating logic that determines whether RecoMe
 * should activate on the current page.
 *
 * Prevents injection on:
 *  - CAPTCHA / anti-bot challenge pages
 *  - Login / signup / authentication pages
 *  - Interstitial / redirect pages
 *  - Error pages (404, 500, etc.)
 *  - Pages with no meaningful content (blank shells)
 *  - Logged-out social platform landing pages
 *
 * QA ref: P0 — "Over-broad page injection" & "Activation without usable controls"
 */

import { createLogger } from '@shared/Logger';

const log = createLogger('PageEligibility');

export interface EligibilityResult {
  eligible: boolean;
  reason: string;
}

// ── CAPTCHA / Anti-bot detection ─────────────────────────────────────────────

const CAPTCHA_SIGNALS = [
  // Google reCAPTCHA
  'g-recaptcha',
  'recaptcha-checkbox',
  'rc-anchor-container',
  // Cloudflare challenge
  'cf-challenge-running',
  'cf-turnstile',
  'challenge-form',
  'challenge-running',
  // hCaptcha
  'h-captcha',
  'hcaptcha-box',
  // Generic anti-bot
  'captcha',
  'bot-check',
  'verify-human',
];

const CAPTCHA_TITLE_PATTERNS = [
  /captcha/i,
  /verify.*human/i,
  /robot/i,
  /bot.*detected/i,
  /challenge/i,
  /security.*check/i,
  /just a moment/i, // Cloudflare
  /attention required/i, // Cloudflare
  /checking.*browser/i,
  /please wait/i,
];

function isCaptchaPage(): boolean {
  // Check title
  const title = document.title;
  if (CAPTCHA_TITLE_PATTERNS.some((p) => p.test(title))) return true;

  // Check for CAPTCHA elements in the DOM
  for (const signal of CAPTCHA_SIGNALS) {
    if (
      document.querySelector(`#${signal}`) ||
      document.querySelector(`.${signal}`) ||
      document.querySelector(`[data-${signal}]`)
    ) {
      return true;
    }
  }

  // Check meta tags for Cloudflare challenge
  const metaRefresh = document.querySelector('meta[http-equiv="refresh"]');
  if (metaRefresh) {
    const content = metaRefresh.getAttribute('content') ?? '';
    if (/challenge|captcha|verify/i.test(content)) return true;
  }

  // Check body class / id
  const bodyClasses = document.body?.className ?? '';
  const bodyId = document.body?.id ?? '';
  if (/captcha|challenge|anti-?bot/i.test(bodyClasses + ' ' + bodyId)) return true;

  return false;
}

// ── Login / Signup / Auth page detection ─────────────────────────────────────

const AUTH_URL_PATTERNS = [
  /\/login/i,
  /\/signin/i,
  /\/sign-in/i,
  /\/signup/i,
  /\/sign-up/i,
  /\/register/i,
  /\/auth\//i,
  /\/oauth/i,
  /\/sso\//i,
  /\/account\/create/i,
  /\/accounts\/login/i,
  /\/accounts\/signup/i,
  /\/session\/new/i,
  /\/forgot[-_]?password/i,
  /\/reset[-_]?password/i,
  /\/verify[-_]?email/i,
  /\/confirm[-_]?email/i,
  /\/2fa/i,
  /\/mfa/i,
];

const AUTH_FORM_SELECTORS = [
  'form[action*="login"]',
  'form[action*="signin"]',
  'form[action*="sign_in"]',
  'form[action*="signup"]',
  'form[action*="register"]',
  'form[action*="auth"]',
  'form[action*="session"]',
  'input[name="password"]',
  'input[type="password"]',
];

/**
 * Weighted classifier for auth page detection.
 * Uses a scoring system to distinguish between login pages and pages
 * that merely have a sidebar login widget (e.g., eBay, news sites).
 *
 * Signals and weights:
 *  - URL pattern match:     +5 (strong signal)
 *  - Password field exists: +2
 *  - Auth form selector:    +2
 *  - Minimal visible inputs (<=5): +3 (few inputs = likely just a login form)
 *  - Page has feed/article content: -4 (real content = sidebar widget, not auth page)
 *  - Page title contains auth keywords: +2
 *  - Sidebar/aside contains the password field: -3 (widget, not main auth)
 *
 * Threshold: >= 6 = auth page
 */
function isAuthPage(): boolean {
  const path = location.pathname;
  let score = 0;

  // URL pattern match — strong signal
  if (AUTH_URL_PATTERNS.some((p) => p.test(path))) score += 5;

  const passwordFields = document.querySelectorAll('input[type="password"]');
  if (passwordFields.length > 0) score += 2;

  const hasAuthForm = AUTH_FORM_SELECTORS.some((sel) => document.querySelector(sel));
  if (hasAuthForm) score += 2;

  // Count visible form inputs
  const allInputs = document.querySelectorAll(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"])',
  );
  if (allInputs.length <= 5) score += 3;

  // Title contains auth keywords
  const title = document.title.toLowerCase();
  if (/log\s?in|sign\s?in|sign\s?up|register|create\s+account/i.test(title)) score += 2;

  // Negative signals: page has real content (feed, articles, products)
  const hasRealContent = !!(
    document.querySelector('[role="feed"]') ||
    document.querySelector('article') ||
    document.querySelector('[role="main"] [data-item-id]') ||
    document.querySelector('.search-result-gridview-item') ||
    document.querySelectorAll('a[href*="/itm/"], a[href*="/ip/"]').length > 3
  );
  if (hasRealContent) score -= 4;

  // If the password field is inside a sidebar/aside/nav, it's a widget, not the page
  if (passwordFields.length > 0) {
    const inSidebar = Array.from(passwordFields).every(
      (el) =>
        el.closest('aside') ||
        el.closest('nav') ||
        el.closest('[role="complementary"]') ||
        el.closest('[class*="sidebar"]') ||
        el.closest('[class*="widget"]'),
    );
    if (inSidebar) score -= 3;
  }

  return score >= 6;
}

// ── Interstitial / Redirect / Error detection ────────────────────────────────

const ERROR_TITLE_PATTERNS = [
  /^404\b/i,
  /not found/i,
  /^500\b/i,
  /internal server error/i,
  /^403\b/i,
  /forbidden/i,
  /access denied/i,
  /page not available/i,
  /something went wrong/i,
];

function isErrorOrInterstitialPage(): boolean {
  const title = document.title;

  // Error pages
  if (ERROR_TITLE_PATTERNS.some((p) => p.test(title))) return true;

  // Very sparse pages (likely interstitials or redirect stubs)
  const bodyText = document.body?.textContent?.trim() ?? '';
  if (bodyText.length < 50 && !document.querySelector('main, article, [role="main"]')) {
    // Very little content and no main content area — likely a redirect
    return true;
  }

  return false;
}

// ── Logged-out social platform detection ─────────────────────────────────────

interface PlatformGateCheck {
  /** Hostname fragments that identify this platform */
  hostPatterns: string[];
  /** Returns true if the page appears to be a logged-out / gated landing page */
  isLoggedOut: () => boolean;
}

const SOCIAL_GATE_CHECKS: PlatformGateCheck[] = [
  {
    // Twitter / X — logged-out landing page
    hostPatterns: ['twitter.com', 'x.com'],
    isLoggedOut: () => {
      // The logged-out page has prominent "Sign in" / "Create account" CTAs
      // and no feed content. Check for the sign-in dialog or landing hero.
      const hasLoginCtas =
        !!document.querySelector('[data-testid="loginButton"]') ||
        !!document.querySelector('[data-testid="signupButton"]') ||
        !!document.querySelector('[href="/login"]') ||
        !!document.querySelector('[href="/i/flow/signup"]');
      const hasFeed = !!document.querySelector('[data-testid="primaryColumn"] article');
      return hasLoginCtas && !hasFeed;
    },
  },
  {
    // Instagram — logged-out
    hostPatterns: ['instagram.com'],
    isLoggedOut: () => {
      // Instagram shows a full-screen login modal when logged out
      const hasLoginForm =
        !!document.querySelector('input[name="username"]') &&
        !!document.querySelector('input[name="password"]');
      const hasFeed = !!document.querySelector('article');
      return hasLoginForm && !hasFeed;
    },
  },
  {
    // Facebook — logged-out
    hostPatterns: ['facebook.com'],
    isLoggedOut: () => {
      const hasLoginForm = !!document.querySelector('#login_form, form[action*="login"]');
      const hasFeed = !!document.querySelector('[role="feed"]');
      return hasLoginForm && !hasFeed;
    },
  },
  {
    // LinkedIn — logged-out
    hostPatterns: ['linkedin.com'],
    isLoggedOut: () => {
      const hasLoginForm =
        !!document.querySelector('.login__form') ||
        !!document.querySelector('form.join-form') ||
        !!document.querySelector('[data-id="sign-in-form"]');
      const hasFeed = !!document.querySelector('.feed-shared-update-v2');
      return hasLoginForm && !hasFeed;
    },
  },
];

function isLoggedOutSocialPage(): boolean {
  const host = location.hostname.replace(/^www\./, '');
  for (const check of SOCIAL_GATE_CHECKS) {
    if (check.hostPatterns.some((p) => host.includes(p))) {
      return check.isLoggedOut();
    }
  }
  return false;
}

// ── Walmart / aggressive anti-bot detection ──────────────────────────────────

function isDefensivePage(): boolean {
  const host = location.hostname.replace(/^www\./, '');

  // Walmart robot/verification pages
  if (host.includes('walmart.com')) {
    const title = document.title.toLowerCase();
    if (
      title.includes('robot') ||
      title.includes('verify') ||
      title.includes('blocked') ||
      title.includes('access denied')
    ) {
      return true;
    }
    // Check for the robot challenge page
    if (document.querySelector('#px-captcha, .px-captcha, [data-px]')) return true;
  }

  return false;
}

// ── Main eligibility check ───────────────────────────────────────────────────

export function checkPageEligibility(): EligibilityResult {
  // Check each gate in priority order

  if (isCaptchaPage()) {
    log.info('Page blocked: CAPTCHA / anti-bot challenge detected');
    return { eligible: false, reason: 'captcha' };
  }

  if (isDefensivePage()) {
    log.info('Page blocked: defensive / robot verification page');
    return { eligible: false, reason: 'defensive' };
  }

  if (isAuthPage()) {
    log.info('Page blocked: login / signup / auth page');
    return { eligible: false, reason: 'auth' };
  }

  if (isLoggedOutSocialPage()) {
    log.info('Page blocked: logged-out social platform landing page');
    return { eligible: false, reason: 'logged-out' };
  }

  if (isErrorOrInterstitialPage()) {
    log.info('Page blocked: error / interstitial / redirect page');
    return { eligible: false, reason: 'error' };
  }

  return { eligible: true, reason: 'ok' };
}

// ── Per-platform minimum card thresholds ─────────────────────────────────────
// If the adapter finds fewer cards than this, the UI should stay suppressed.

const PLATFORM_MIN_CARDS: Record<string, number> = {
  amazon: 2,
  youtube: 2,
  ebay: 2,
  walmart: 2,
  twitter: 1,
  facebook: 1,
  instagram: 1,
  linkedin: 1,
  tiktok: 1,
  indeed: 2,
  glassdoor: 2,
  udemy: 2,
  coursera: 2,
  edx: 2,
  unknown: 1,
};

export function getMinCardThreshold(platform: string): number {
  return PLATFORM_MIN_CARDS[platform] ?? 1;
}

// ── Debug report — dev-only diagnostics ──────────────────────────────────────
// Exposes a structured debug snapshot on `window.__RECOME_DEBUG` so the DevTools
// panel (or a developer inspecting in console) can see exactly why RecoMe did
// or did not activate on the current page.

export interface DebugSnapshot {
  url: string;
  timestamp: string;
  eligibility: EligibilityResult;
  platform: string;
  pageType: string;
  activeCardSelector: string;
  detectedCards: number;
  minCardThreshold: number;
  overlayInjected: boolean;
  checks: Record<string, boolean>;
}

declare global {
  interface Window {
    __RECOME_DEBUG?: DebugSnapshot;
  }
}

/**
 * Publish a debug snapshot to `window.__RECOME_DEBUG`.
 * Only runs when the `recome_debug` flag is set in chrome.storage.local.
 */
export async function publishDebugSnapshot(snapshot: DebugSnapshot): Promise<void> {
  try {
    const r = await chrome.storage.local.get('recome_debug');
    if (!r['recome_debug']) return;
  } catch {
    return;
  }

  window.__RECOME_DEBUG = snapshot;
  log.info('Debug snapshot published to window.__RECOME_DEBUG', snapshot);
}
