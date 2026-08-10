/**
 * WelcomeCard — first-install insight card.
 *
 * Fires once per install: bottom-left of the viewport, same visual family as
 * the proactive AgentEvent insight cards (so users learn what those will
 * look like later). Dismisses on click and sets a chrome.storage flag so it
 * never shows again on this profile.
 *
 * Storage flag: STORAGE_KEYS.welcome_card_shown — written by background on
 * `onInstalled(reason='install')`; read here. Once shown, this module sets
 * the flag and self-suppresses for all future tabs.
 */

import { STORAGE_KEYS } from '@shared/constants';

const STYLE_ID = 'recome-welcome-style';

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    #recome-welcome-host {
      position: fixed;
      bottom: 16px;
      left: 16px;
      z-index: 2147483645;
      max-width: 440px;
      pointer-events: none;
    }
    .recome-welcome-card {
      pointer-events: auto;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 16px;
      background: linear-gradient(135deg, rgba(16,21,29,0.97) 0%, rgba(10,13,18,0.97) 100%);
      border: 1px solid rgba(94,234,212,0.35);
      border-radius: 12px;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      font-size: 13.5px;
      line-height: 1.5;
      backdrop-filter: blur(10px);
      box-shadow: 0 12px 36px rgba(0,0,0,0.5);
      transform: translateY(10px);
      opacity: 0;
      transition: opacity .3s ease, transform .3s ease;
    }
    .recome-welcome-card.visible { opacity: 1; transform: translateY(0); }
    .recome-welcome-icon {
      width: 36px; height: 36px; flex-shrink: 0;
      border-radius: 10px;
      background: rgba(94,234,212,0.18);
      color: #5eead4;
      border: 1px solid rgba(94,234,212,0.4);
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 18px;
    }
    .recome-welcome-body { flex: 1; min-width: 0; }
    .recome-welcome-label {
      font-size: 10.5px; font-weight: 700; color: #5eead4;
      text-transform: uppercase; letter-spacing: 0.7px; margin-bottom: 4px;
    }
    .recome-welcome-title {
      font-size: 14px; font-weight: 700; color: #fff; margin-bottom: 4px;
    }
    .recome-welcome-text {
      font-size: 12.5px; color: rgba(255,255,255,0.7); line-height: 1.55;
    }
    .recome-welcome-actions {
      display: flex; gap: 8px; align-items: center; margin-top: 2px;
    }
    .recome-welcome-btn {
      background: #5eead4; color: #0a0d12;
      border: 0; border-radius: 8px;
      padding: 8px 14px;
      font-family: inherit; font-size: 12.5px; font-weight: 700;
      cursor: pointer;
      transition: background .12s, transform .08s;
    }
    .recome-welcome-btn:hover { background: #7df0dc; }
    .recome-welcome-btn:active { transform: translateY(1px); }
    .recome-welcome-dismiss {
      background: transparent;
      color: rgba(255,255,255,0.55);
      border: 1px solid rgba(255,255,255,0.12);
      width: 28px; height: 28px;
      align-self: flex-start;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      transition: color .12s, border-color .12s;
    }
    .recome-welcome-dismiss:hover {
      color: #fff;
      border-color: rgba(255,255,255,0.3);
    }
  `;
  document.head.appendChild(s);
}

function build(): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'recome-welcome-card';

  const icon = document.createElement('div');
  icon.className = 'recome-welcome-icon';
  icon.textContent = '👋';
  card.appendChild(icon);

  const body = document.createElement('div');
  body.className = 'recome-welcome-body';
  const label = document.createElement('div');
  label.className = 'recome-welcome-label';
  label.textContent = 'Welcome to RecoMe';
  body.appendChild(label);
  const title = document.createElement('div');
  title.className = 'recome-welcome-title';
  title.textContent = 'This sidebar fills in as you browse.';
  body.appendChild(title);
  const text = document.createElement('div');
  text.className = 'recome-welcome-text';
  text.textContent =
    'Try a YouTube video or Amazon product page for 10 seconds — you’ll see your first signal captured and your topics start to populate.';
  body.appendChild(text);
  card.appendChild(body);

  const dismiss = document.createElement('button');
  dismiss.className = 'recome-welcome-dismiss';
  dismiss.textContent = '✕';
  dismiss.setAttribute('aria-label', 'Dismiss');
  card.appendChild(dismiss);

  return card;
}

/**
 * Show the welcome card if this is a fresh install. Idempotent + safe to call
 * on every content-script bootstrap; only the first call renders.
 */
export async function maybeShowWelcome(): Promise<void> {
  const flags = await chrome.storage.local.get(STORAGE_KEYS.welcome_card_shown);
  if (flags[STORAGE_KEYS.welcome_card_shown]) return;
  // Mark immediately so concurrent tabs don't double-render.
  await chrome.storage.local.set({ [STORAGE_KEYS.welcome_card_shown]: true });

  ensureStyles();
  const host = document.createElement('div');
  host.id = 'recome-welcome-host';
  document.body.appendChild(host);

  const card = build();
  host.appendChild(card);
  requestAnimationFrame(() => card.classList.add('visible'));

  const dismiss = (): void => {
    card.classList.remove('visible');
    setTimeout(() => host.remove(), 320);
  };
  card.querySelector('.recome-welcome-dismiss')?.addEventListener('click', dismiss);

  // Auto-dismiss after 30s so it doesn't linger forever if ignored.
  setTimeout(dismiss, 30_000);
}
