import { TOAST_DURATION_MS } from '@shared/constants';

type ToastType = 'success' | 'info' | 'warning' | 'error';

const TOAST_ICONS: Record<ToastType, string> = {
  success: '✨',
  info: 'ℹ️',
  warning: '⚠️',
  error: '❌',
};

export function showToast(message: string, type: ToastType = 'info'): void {
  ensureStyles();

  const toast = document.createElement('div');
  toast.className = `recome-toast recome-toast-${type}`;
  toast.innerHTML = `
    <span class="recome-toast-icon">${TOAST_ICONS[type]}</span>
    <span class="recome-toast-message">${escapeHtml(message)}</span>
  `;

  document.body.appendChild(toast);

  // Trigger enter animation
  requestAnimationFrame(() => {
    toast.classList.add('recome-toast-visible');
  });

  setTimeout(() => {
    toast.classList.remove('recome-toast-visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, TOAST_DURATION_MS);
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
      max-width: 320px;
    }
    .recome-toast-visible {
      opacity: 1;
      transform: translateY(0);
    }
    .recome-toast-success { border-color: rgba(16,185,129,0.5); }
    .recome-toast-warning { border-color: rgba(245,158,11,0.5); }
    .recome-toast-error   { border-color: rgba(239,68,68,0.5); }
  `;
  document.head.appendChild(style);
}
