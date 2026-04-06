import { TOAST_DURATION_MS } from '@shared/constants';
import { escapeHtml } from '@shared/utils';

type ToastType = 'success' | 'info' | 'warning' | 'error';

const TOAST_ICONS: Record<ToastType, string> = {
  success: '✨',
  info: 'ℹ️',
  warning: '⚠️',
  error: '❌',
};

export interface ToastOptions {
  onUndo?: () => void;
  /** Dedupe key — if a toast with this key is already visible, skip */
  dedupeKey?: string;
}

// ── Toast Queue ────────────────────────────────────────────────────────────

const MAX_VISIBLE_TOASTS = 3;
const TOAST_GAP = 8;
const TOAST_BASE_BOTTOM = 24;

interface ActiveToast {
  element: HTMLDivElement;
  dedupeKey?: string;
  dismiss: () => void;
}

const activeToasts: ActiveToast[] = [];

/** Reposition all active toasts so they stack upward without overlap */
function repositionToasts(): void {
  let bottom = TOAST_BASE_BOTTOM;
  for (const t of activeToasts) {
    t.element.style.bottom = `${bottom}px`;
    bottom += t.element.offsetHeight + TOAST_GAP;
  }
}

export function showToast(message: string, type: ToastType = 'info', options?: ToastOptions): void {
  ensureStyles();

  // Deduplicate: skip if a toast with the same key is already showing
  if (options?.dedupeKey && activeToasts.some((t) => t.dedupeKey === options.dedupeKey)) {
    return;
  }

  // Evict oldest toast if at capacity
  if (activeToasts.length >= MAX_VISIBLE_TOASTS) {
    activeToasts[0]?.dismiss();
  }

  const toast = document.createElement('div');
  toast.className = `recome-toast recome-toast-${type}`;

  let html = `
    <span class="recome-toast-icon">${TOAST_ICONS[type]}</span>
    <span class="recome-toast-message">${escapeHtml(message)}</span>
  `;

  if (options?.onUndo) {
    html += `<button class="recome-toast-undo" type="button">Undo</button>`;
    toast.style.pointerEvents = 'auto';
  }

  toast.innerHTML = html;
  document.body.appendChild(toast);

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    toast.classList.remove('recome-toast-visible');

    // Remove from active list and reposition remaining
    const idx = activeToasts.findIndex((t) => t.element === toast);
    if (idx !== -1) activeToasts.splice(idx, 1);
    repositionToasts();

    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 500);
  };

  const entry: ActiveToast = { element: toast, dedupeKey: options?.dedupeKey, dismiss };
  activeToasts.push(entry);

  // Trigger enter animation + position
  requestAnimationFrame(() => {
    repositionToasts();
    toast.classList.add('recome-toast-visible');
  });

  if (options?.onUndo) {
    toast.querySelector('.recome-toast-undo')?.addEventListener('click', (e) => {
      e.stopPropagation();
      options.onUndo!();
      dismiss();
    });
  }

  setTimeout(dismiss, options?.onUndo ? TOAST_DURATION_MS + 2000 : TOAST_DURATION_MS);
}

let stylesInjected = false;

function ensureStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .recome-toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 18px;
      border-radius: 10px;
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
      font-size: 14px;
      font-weight: 500;
      color: #fff;
      background: #1a2235;
      border: 1px solid rgba(99,102,241,0.4);
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      opacity: 0;
      transform: translateY(12px);
      transition: opacity 300ms ease, transform 300ms ease, bottom 300ms ease;
      pointer-events: none;
      max-width: 380px;
    }
    .recome-toast-visible {
      opacity: 1;
      transform: translateY(0);
    }
    .recome-toast-success { border-color: rgba(16,185,129,0.5); }
    .recome-toast-warning { border-color: rgba(245,158,11,0.5); }
    .recome-toast-error   { border-color: rgba(239,68,68,0.5); }
    .recome-toast-undo {
      margin-left: 8px;
      padding: 4px 10px;
      border: 1px solid rgba(129,140,248,0.5);
      border-radius: 6px;
      background: rgba(129,140,248,0.15);
      color: #a5b4fc;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background 150ms ease;
      white-space: nowrap;
    }
    .recome-toast-undo:hover {
      background: rgba(129,140,248,0.3);
    }
  `;
  document.head.appendChild(style);
}
