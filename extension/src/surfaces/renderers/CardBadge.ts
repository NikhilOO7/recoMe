/**
 * CardBadge — injects a scoring badge + reasoning callout onto a card element.
 *
 * Visual contract matches pitch-site/demos/extension-demo.html:
 *   ✓ Relevant 0.89   (green)
 *   ~ Neutral 0.41    (gray)
 *   ⚠ Caution 0.52    (amber)
 *   × Filtered        (red, dims the card)
 *
 * Reasoning callout: dark gradient overlay at the bottom edge of the card,
 * sliding up on hover (always-visible on PDP).
 *
 * One injected stylesheet per page; per-card mutations are absolute-positioned
 * children of the card element so host-page reflows don't break layout.
 */

import type { CardVerdict } from '@shared/CloudClient';

const STYLE_ID = 'recome-badge-style';

const VERDICT_META: Record<
  CardVerdict,
  { icon: string; label: string; bg: string; border: string; text: string }
> = {
  relevant: {
    icon: '✓',
    label: 'Relevant',
    bg: 'rgba(16,185,129,0.18)',
    border: 'rgba(16,185,129,0.55)',
    text: '#10b981',
  },
  neutral: {
    icon: '~',
    label: 'Neutral',
    bg: 'rgba(148,163,184,0.18)',
    border: 'rgba(148,163,184,0.45)',
    text: '#94a3b8',
  },
  caution: {
    icon: '⚠',
    label: 'Caution',
    bg: 'rgba(217,119,6,0.18)',
    border: 'rgba(217,119,6,0.55)',
    text: '#d97706',
  },
  filtered: {
    icon: '×',
    label: 'Filtered',
    bg: 'rgba(232,50,50,0.18)',
    border: 'rgba(232,50,50,0.5)',
    text: '#e83232',
  },
};

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .recome-card-badge {
      position: absolute;
      top: 8px;
      left: 8px;
      z-index: 999;
      padding: 4px 10px;
      border-radius: 999px;
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      font-size: 11.5px;
      font-weight: 700;
      letter-spacing: 0.2px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      pointer-events: none;
      backdrop-filter: blur(8px);
      box-shadow: 0 2px 8px rgba(0,0,0,0.18);
    }
    .recome-card-badge .recome-score {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 10.5px;
      opacity: 0.85;
      margin-left: 2px;
    }
    .recome-reasoning {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      padding: 10px 12px;
      background: linear-gradient(to bottom, rgba(6,13,26,0) 0%, rgba(6,13,26,0.92) 35%, rgba(6,13,26,0.97) 100%);
      color: rgba(255,255,255,0.92);
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      font-size: 12.5px;
      line-height: 1.5;
      pointer-events: none;
      opacity: 0;
      transform: translateY(6px);
      transition: opacity .18s ease, transform .18s ease;
      border-bottom-left-radius: inherit;
      border-bottom-right-radius: inherit;
      z-index: 998;
    }
    .recome-card-host:hover .recome-reasoning,
    .recome-card-host.recome-show-reason .recome-reasoning {
      opacity: 1;
      transform: translateY(0);
    }
    .recome-card-host.recome-filtered {
      opacity: 0.42;
      filter: grayscale(0.5);
      transition: opacity .2s, filter .2s;
    }
    .recome-card-host.recome-filtered:hover {
      opacity: 0.7;
      filter: grayscale(0.2);
    }
  `;
  document.head.appendChild(style);
}

export interface RenderInput {
  el: HTMLElement;
  verdict: CardVerdict;
  score: number;
  reason: string;
  /** Always show the reasoning bar (true for PDP-style single-card overlays). */
  alwaysShowReason?: boolean;
}

export function renderBadge({ el, verdict, score, reason, alwaysShowReason }: RenderInput): void {
  ensureStyles();

  // Make sure the card is the positioning anchor.
  const cs = getComputedStyle(el);
  if (cs.position === 'static') el.style.position = 'relative';
  el.classList.add('recome-card-host');
  if (alwaysShowReason) el.classList.add('recome-show-reason');
  el.classList.toggle('recome-filtered', verdict === 'filtered');

  // Replace existing badge + reasoning so subsequent calls update in place.
  el.querySelector(':scope > .recome-card-badge')?.remove();
  el.querySelector(':scope > .recome-reasoning')?.remove();

  const meta = VERDICT_META[verdict];
  const badge = document.createElement('div');
  badge.className = 'recome-card-badge';
  badge.style.background = meta.bg;
  badge.style.border = `1px solid ${meta.border}`;
  badge.style.color = meta.text;
  badge.innerHTML =
    verdict === 'filtered'
      ? `<span>${meta.icon} ${meta.label}</span>`
      : `<span>${meta.icon} ${meta.label}</span><span class="recome-score">${score.toFixed(2)}</span>`;
  el.appendChild(badge);

  if (reason) {
    const note = document.createElement('div');
    note.className = 'recome-reasoning';
    note.textContent = reason;
    el.appendChild(note);
  }
}

export function clearAllBadges(): void {
  for (const host of Array.from(document.querySelectorAll('.recome-card-host'))) {
    host.classList.remove('recome-card-host', 'recome-show-reason', 'recome-filtered');
    host.querySelector(':scope > .recome-card-badge')?.remove();
    host.querySelector(':scope > .recome-reasoning')?.remove();
  }
}
