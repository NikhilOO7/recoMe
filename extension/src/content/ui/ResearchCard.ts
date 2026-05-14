/**
 * ResearchCard — injects a "Research Detected" insight card on Amazon product pages.
 *
 * Thesis: "RecoMe remembers what you researched across YouTube, Reddit, and Amazon —
 * then shows you why this product matches what you care about."
 *
 * The card is small, non-intrusive, and appears near the product title on PDP pages.
 * It shows: research summary, platform signals, match statement, and actions.
 */

import { createLogger } from '@shared/Logger';

const log = createLogger('ResearchCard');

export interface ResearchSignal {
  platform: string;
  topic: string;
  signalCount: number;
  lastSeen: number;
}

export interface ResearchCardData {
  productTitle: string;
  matchScore: number; // 0-1
  signals: ResearchSignal[];
  matchReason: string;
}

const PLATFORM_LABELS: Record<string, string> = {
  youtube: 'YouTube',
  reddit: 'Reddit',
  amazon: 'Amazon',
  twitter: 'X',
  facebook: 'Facebook',
  instagram: 'Instagram',
};

let stylesInjected = false;
let activeCard: HTMLElement | null = null;

function ensureStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .recome-research-card {
      margin: 12px 0;
      padding: 14px 16px;
      background: linear-gradient(135deg, rgba(99,102,241,0.06), rgba(139,92,246,0.06));
      border: 1px solid rgba(99,102,241,0.2);
      border-left: 3px solid #6366f1;
      border-radius: 10px;
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif;
      font-size: 13px;
      color: #1e293b;
      max-width: 600px;
      animation: recome-rc-in 300ms ease;
    }

    @keyframes recome-rc-in {
      from { opacity: 0; transform: translateY(-6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .recome-rc-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .recome-rc-logo {
      width: 18px;
      height: 18px;
      border-radius: 4px;
    }

    .recome-rc-title {
      font-size: 12px;
      font-weight: 700;
      color: #6366f1;
      letter-spacing: 0.3px;
      text-transform: uppercase;
    }

    .recome-rc-match {
      margin-left: auto;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 10px;
      background: rgba(16,185,129,0.12);
      color: #059669;
    }

    .recome-rc-match.low {
      background: rgba(245,158,11,0.12);
      color: #d97706;
    }

    .recome-rc-reason {
      font-size: 13px;
      color: #334155;
      line-height: 1.4;
      margin-bottom: 10px;
    }

    .recome-rc-signals {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 10px;
    }

    .recome-rc-signal {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 10px;
      background: rgba(99,102,241,0.08);
      border: 1px solid rgba(99,102,241,0.15);
      border-radius: 12px;
      font-size: 11px;
      color: #475569;
    }

    .recome-rc-signal-platform {
      font-weight: 600;
      color: #6366f1;
    }

    .recome-rc-signal-count {
      font-size: 10px;
      color: #94a3b8;
    }

    .recome-rc-actions {
      display: flex;
      gap: 8px;
    }

    .recome-rc-action {
      padding: 5px 12px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      border: 1px solid rgba(99,102,241,0.2);
      background: transparent;
      color: #6366f1;
      font-family: inherit;
      transition: all 150ms;
    }

    .recome-rc-action:hover {
      background: rgba(99,102,241,0.08);
    }

    .recome-rc-action.primary {
      background: #6366f1;
      color: #fff;
      border-color: #6366f1;
    }

    .recome-rc-action.primary:hover {
      background: #4f46e5;
    }

    .recome-rc-dismiss {
      padding: 5px 10px;
      border: none;
      background: none;
      color: #94a3b8;
      font-size: 11px;
      cursor: pointer;
      margin-left: auto;
      font-family: inherit;
    }

    .recome-rc-dismiss:hover {
      color: #64748b;
    }
  `;
  document.head.appendChild(style);
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/**
 * Inject the Research Detected card on an Amazon product detail page.
 * Finds the product title area and inserts the card below it.
 */
export function injectResearchCard(data: ResearchCardData): void {
  // Don't duplicate
  if (activeCard && document.contains(activeCard)) return;
  if (data.signals.length === 0) return;

  ensureStyles();

  const card = document.createElement('div');
  card.className = 'recome-research-card';
  card.setAttribute('data-recome-research', 'true');

  const matchLabel =
    data.matchScore >= 0.7
      ? 'Strong match'
      : data.matchScore >= 0.4
        ? 'Possible match'
        : 'Weak match';
  const matchClass = data.matchScore >= 0.7 ? '' : 'low';

  const logoUrl =
    typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('icons/recome_logo_48.png')
      : '';

  card.innerHTML = `
    <div class="recome-rc-header">
      ${logoUrl ? `<img class="recome-rc-logo" src="${logoUrl}" alt="RecoMe" />` : ''}
      <span class="recome-rc-title">Research Detected</span>
      <span class="recome-rc-match ${matchClass}">${matchLabel}</span>
    </div>
    <div class="recome-rc-reason">${escapeHtml(data.matchReason)}</div>
    <div class="recome-rc-signals">
      ${data.signals
        .map(
          (s) => `
        <span class="recome-rc-signal">
          <span class="recome-rc-signal-platform">${PLATFORM_LABELS[s.platform] ?? s.platform}</span>
          ${escapeHtml(s.topic)}
          <span class="recome-rc-signal-count">${s.signalCount} signal${s.signalCount !== 1 ? 's' : ''} · ${timeAgo(s.lastSeen)}</span>
        </span>
      `,
        )
        .join('')}
    </div>
    <div class="recome-rc-actions">
      <button class="recome-rc-action primary" data-action="trail">See full research trail</button>
      <button class="recome-rc-dismiss" data-action="dismiss">Not relevant</button>
    </div>
  `;

  // Wire actions
  card.querySelector('[data-action="trail"]')?.addEventListener('click', () => {
    // Open the overlay to the dashboard showing research trail
    chrome.runtime
      .sendMessage({ type: 'BRAIN_INSIGHT', payload: { action: 'open_trail' } })
      .catch(() => undefined);
    log.info('Research trail opened from PDP card');
  });

  card.querySelector('[data-action="dismiss"]')?.addEventListener('click', () => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(-6px)';
    card.style.transition = 'all 200ms ease';
    setTimeout(() => card.remove(), 200);
    activeCard = null;
    log.info('Research card dismissed');
  });

  // Find injection point — below product title on Amazon PDP
  const anchor =
    document.querySelector('#productTitle') ??
    document.querySelector('#title_feature_div') ??
    document.querySelector('#titleSection') ??
    document.querySelector('h1#title') ??
    document.querySelector('#centerCol h1');

  if (anchor) {
    const parent =
      anchor.closest('#title_feature_div, #titleSection, #centerCol') ?? anchor.parentElement;
    if (parent) {
      parent.insertAdjacentElement('afterend', card);
    } else {
      anchor.insertAdjacentElement('afterend', card);
    }
  } else {
    // Fallback: insert at top of center column
    const center = document.querySelector('#centerCol') ?? document.querySelector('#dp');
    if (center) {
      center.insertAdjacentElement('afterbegin', card);
    } else {
      log.warn('Could not find injection point for Research Card');
      return;
    }
  }

  activeCard = card;
  log.info(
    `Research card injected: ${data.signals.length} signals, match ${(data.matchScore * 100).toFixed(0)}%`,
  );
}

/** Remove the active research card (called on SPA navigation) */
export function removeResearchCard(): void {
  if (activeCard) {
    activeCard.remove();
    activeCard = null;
  }
  // Also remove any orphaned cards
  document.querySelectorAll('[data-recome-research]').forEach((el) => el.remove());
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
