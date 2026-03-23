import { createLogger } from '@shared/Logger';

const log = createLogger('PromptRenderer');

export type PromptStyle = 'toast' | 'inline' | 'overlay';

export interface SmartPromptData {
  id: string;
  message: string;
  /** HTML-safe display string for the subject (topic, product name, etc.) */
  subject: string;
  style: PromptStyle;
  actions: PromptAction[];
  /** Optional: element to anchor inline prompts near */
  anchorElement?: Element;
}

export interface PromptAction {
  label: string;
  icon?: string;
  variant: 'positive' | 'negative' | 'neutral' | 'snooze';
  value: string;
}

export type PromptResponseHandler = (promptId: string, action: PromptAction) => void;

let stylesInjected = false;

/**
 * PromptRenderer — renders smart prompts as non-intrusive micro-UIs.
 *
 * Three styles:
 *  - toast: bottom-right, auto-dismiss 5s
 *  - inline: next to content item
 *  - overlay: sends to agent panel
 */
export function renderPrompt(
  data: SmartPromptData,
  onResponse: PromptResponseHandler,
): HTMLElement {
  ensureStyles();

  const container = document.createElement('div');
  container.className = `recome-smart-prompt recome-prompt-${data.style}`;
  container.setAttribute('data-prompt-id', data.id);
  container.setAttribute('role', 'alert');

  // Build content
  const messageEl = document.createElement('span');
  messageEl.className = 'recome-prompt-message';
  messageEl.innerHTML = data.message;
  container.appendChild(messageEl);

  // Action buttons
  const actionsEl = document.createElement('div');
  actionsEl.className = 'recome-prompt-actions';

  for (const action of data.actions) {
    const btn = document.createElement('button');
    btn.className = `recome-prompt-btn recome-prompt-btn-${action.variant}`;
    btn.type = 'button';
    btn.textContent = `${action.icon ? action.icon + ' ' : ''}${action.label}`;
    btn.addEventListener('click', () => {
      onResponse(data.id, action);
      dismiss(container);
    });
    actionsEl.appendChild(btn);
  }

  // Snooze dropdown
  const snoozeBtn = document.createElement('button');
  snoozeBtn.className = 'recome-prompt-snooze-trigger';
  snoozeBtn.type = 'button';
  snoozeBtn.textContent = '...';
  snoozeBtn.title = 'Snooze prompts';
  snoozeBtn.addEventListener('click', () => {
    const menu = container.querySelector('.recome-prompt-snooze-menu');
    if (menu) {
      menu.toggleAttribute('hidden');
    }
  });
  actionsEl.appendChild(snoozeBtn);

  container.appendChild(actionsEl);

  // Snooze menu
  const snoozeMenu = document.createElement('div');
  snoozeMenu.className = 'recome-prompt-snooze-menu';
  snoozeMenu.hidden = true;

  for (const opt of [
    { label: 'Snooze 1 hour', value: '1h' },
    { label: 'Snooze 1 day', value: '1d' },
    { label: 'Never show again', value: 'forever' },
  ]) {
    const item = document.createElement('button');
    item.className = 'recome-prompt-snooze-item';
    item.type = 'button';
    item.textContent = opt.label;
    item.addEventListener('click', () => {
      onResponse(data.id, {
        label: opt.label,
        variant: 'snooze',
        value: opt.value,
      });
      dismiss(container);
    });
    snoozeMenu.appendChild(item);
  }
  container.appendChild(snoozeMenu);

  // Position based on style
  if (data.style === 'toast') {
    document.body.appendChild(container);
    requestAnimationFrame(() => container.classList.add('recome-prompt-visible'));

    // Auto-dismiss after 8s
    setTimeout(() => dismiss(container), 8000);
  } else if (data.style === 'inline' && data.anchorElement) {
    // Position near the anchor element
    const anchor = data.anchorElement;
    const parent = anchor.parentElement;
    if (parent) {
      parent.style.position = parent.style.position || 'relative';
      container.style.position = 'absolute';
      container.style.top = '0';
      container.style.right = '0';
      parent.appendChild(container);
      requestAnimationFrame(() => container.classList.add('recome-prompt-visible'));
    }

    // Auto-dismiss after 12s for inline
    setTimeout(() => dismiss(container), 12000);
  } else {
    // Overlay style — just append as toast fallback
    document.body.appendChild(container);
    requestAnimationFrame(() => container.classList.add('recome-prompt-visible'));
    setTimeout(() => dismiss(container), 8000);
  }

  log.debug(`Rendered ${data.style} prompt: ${data.id}`);
  return container;
}

function dismiss(el: HTMLElement): void {
  if (!el.parentElement) return;
  el.classList.remove('recome-prompt-visible');
  el.addEventListener('transitionend', () => el.remove(), { once: true });
  // Fallback removal
  setTimeout(() => el.remove(), 500);
}

function ensureStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .recome-smart-prompt {
      z-index: 2147483637;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      background: rgba(8, 11, 22, 0.97);
      border: 1px solid rgba(99, 102, 241, 0.35);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      backdrop-filter: blur(20px);
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
      font-size: 13px;
      color: #cbd5e1;
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 250ms ease, transform 250ms ease;
      pointer-events: auto;
    }

    .recome-prompt-visible {
      opacity: 1;
      transform: translateY(0);
    }

    .recome-prompt-toast {
      position: fixed;
      bottom: 80px;
      right: 24px;
      max-width: 420px;
    }

    .recome-prompt-inline {
      max-width: 360px;
      z-index: 9998;
    }

    .recome-prompt-message {
      flex: 1;
      min-width: 0;
    }

    .recome-prompt-message strong {
      color: #e2e8f0;
    }

    .recome-prompt-actions {
      display: flex;
      gap: 6px;
      align-items: center;
      flex-wrap: wrap;
    }

    .recome-prompt-btn {
      padding: 5px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 500;
      font-family: inherit;
      cursor: pointer;
      border: 1px solid rgba(99,102,241,0.3);
      background: rgba(99,102,241,0.08);
      color: #a5b4fc;
      transition: all 150ms;
      white-space: nowrap;
    }

    .recome-prompt-btn:hover {
      background: rgba(99,102,241,0.2);
      color: #fff;
    }

    .recome-prompt-btn-positive {
      border-color: rgba(16,185,129,0.4);
      background: rgba(16,185,129,0.08);
      color: #6ee7b7;
    }
    .recome-prompt-btn-positive:hover {
      background: rgba(16,185,129,0.2);
      color: #fff;
    }

    .recome-prompt-btn-negative {
      border-color: rgba(239,68,68,0.3);
      background: rgba(239,68,68,0.06);
      color: #fca5a5;
    }
    .recome-prompt-btn-negative:hover {
      background: rgba(239,68,68,0.15);
      color: #fff;
    }

    .recome-prompt-snooze-trigger {
      padding: 4px 8px;
      border: none;
      background: transparent;
      color: #475569;
      cursor: pointer;
      font-size: 16px;
      font-family: inherit;
      line-height: 1;
      letter-spacing: 2px;
    }
    .recome-prompt-snooze-trigger:hover {
      color: #94a3b8;
    }

    .recome-prompt-snooze-menu {
      width: 100%;
      display: flex;
      gap: 4px;
      padding-top: 6px;
      border-top: 1px solid rgba(99,102,241,0.12);
      margin-top: 2px;
    }

    .recome-prompt-snooze-menu[hidden] { display: none; }

    .recome-prompt-snooze-item {
      padding: 4px 8px;
      border: 1px solid rgba(99,102,241,0.15);
      border-radius: 6px;
      background: transparent;
      color: #64748b;
      font-size: 10px;
      font-family: inherit;
      cursor: pointer;
      transition: all 120ms;
    }
    .recome-prompt-snooze-item:hover {
      background: rgba(99,102,241,0.1);
      color: #94a3b8;
    }

    @media (prefers-reduced-motion: reduce) {
      .recome-smart-prompt {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
      }
    }
  `;
  document.head.appendChild(style);
}
