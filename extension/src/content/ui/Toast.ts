import { TOAST_DURATION_MS } from '@shared/constants';

type ToastType = 'success' | 'info' | 'warning' | 'error';

const TOAST_ICONS: Record<ToastType, string> = {
  success: '✨',
  info: 'ℹ️',
  warning: '⚠️',
  error: '❌',
};

export interface ToastOptions {
  onUndo?: () => void;
}

export function showToast(message: string, type: ToastType = 'info', options?: ToastOptions): void {
  ensureStyles();

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

  // Trigger enter animation
  requestAnimationFrame(() => {
    toast.classList.add('recome-toast-visible');
  });

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    toast.classList.remove('recome-toast-visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    // Fallback removal if transitionend doesn't fire
    setTimeout(() => toast.remove(), 500);
  };

  if (options?.onUndo) {
    toast.querySelector('.recome-toast-undo')?.addEventListener('click', (e) => {
      e.stopPropagation();
      options.onUndo!();
      dismiss();
    });
  }

  setTimeout(dismiss, options?.onUndo ? TOAST_DURATION_MS + 2000 : TOAST_DURATION_MS);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
      transition: opacity 300ms ease, transform 300ms ease;
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
