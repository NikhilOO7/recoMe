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
      /* Never letter-wrap: absolute boxes shrink-to-fit their containing
         block, and a narrow host (Reddit vote gutter) turned the badge into
         a vertical character strip. */
      width: max-content;
      max-width: 260px;
      white-space: nowrap;
      padding: 4px 10px;
      border-radius: 999px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
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
      /* Compact opaque popover anchored under the badge — never a translucent
         band over the host's content or its action row. Fixed width makes it
         geometry-proof regardless of the anchor's box. */
      position: absolute;
      top: 36px;
      left: 8px;
      width: 280px;
      max-width: 85vw;
      padding: 10px 12px;
      background: #0f141b;
      border: 1px solid rgba(94,234,212,0.30);
      border-radius: 10px;
      box-shadow: 0 10px 32px rgba(0,0,0,0.5);
      color: rgba(255,255,255,0.92);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      font-size: 12.5px;
      line-height: 1.5;
      pointer-events: auto;
      opacity: 0;
      visibility: hidden;
      transform: translateY(-4px);
      transition: opacity .15s ease, transform .15s ease, visibility .15s;
      z-index: 2147483000;
    }
    .recome-card-host:hover .recome-reasoning,
    .recome-reasoning:hover,
    .recome-card-host.recome-show-reason .recome-reasoning {
      opacity: 1;
      visibility: visible;
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
    .recome-feedback {
      display: flex;
      gap: 6px;
      margin-top: 8px;
      pointer-events: auto;
    }
    .recome-fb-btn {
      appearance: none;
      font-family: inherit;
      font-size: 11px;
      font-weight: 600;
      padding: 3px 9px;
      border-radius: 999px;
      cursor: pointer;
      border: 1px solid rgba(94,234,212,0.35);
      background: rgba(94,234,212,0.10);
      color: #5eead4;
      transition: background .12s, border-color .12s;
    }
    .recome-fb-btn:hover { background: rgba(94,234,212,0.22); }
    .recome-fb-btn.recome-fb-block {
      border-color: rgba(255,255,255,0.18);
      background: rgba(255,255,255,0.05);
      color: rgba(255,255,255,0.65);
    }
    .recome-fb-btn.recome-fb-block:hover {
      border-color: rgba(251,113,133,0.45);
      color: #fb7185;
      background: rgba(251,113,133,0.08);
    }
    .recome-fb-done {
      font-size: 11px;
      color: rgba(255,255,255,0.65);
      margin-top: 8px;
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
  /** Graph topics the card matched — the targets of the feedback actions. */
  matchedTopics?: string[];
  /** When set (and matchedTopics is non-empty), the reasoning bar grows
   *  "More like this" / "Not for me" actions emitting boost/block signals. */
  onFeedback?: (kind: 'boost' | 'block') => void;
}

/**
 * Some card elements are layout ghosts — e.g. Reddit's <shreddit-post> is
 * `display: contents`, which generates NO box: position:relative on it is a
 * no-op and absolute children anchor to some unrelated (often narrow)
 * ancestor. Resolve to the first descendant that actually has a usable box.
 */
function resolveAnchor(el: HTMLElement): HTMLElement {
  const cs = getComputedStyle(el);
  const width = el.getBoundingClientRect().width;
  if (cs.display !== 'contents' && width >= 160) return el;
  for (const child of Array.from(el.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (getComputedStyle(child).display === 'contents') continue;
    if (child.getBoundingClientRect().width >= 160) return child;
  }
  return el;
}

export function renderBadge({
  el: cardEl,
  verdict,
  score,
  reason,
  alwaysShowReason,
  matchedTopics,
  onFeedback,
}: RenderInput): void {
  ensureStyles();

  const el = resolveAnchor(cardEl);

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
    const text = document.createElement('div');
    text.textContent = reason;
    note.appendChild(text);

    // Explicit-feedback actions: only when we know which graph topics this
    // card matched — feedback always targets real topics, never guesses.
    if (onFeedback && matchedTopics && matchedTopics.length > 0 && verdict !== 'filtered') {
      const topicLabel = matchedTopics[0]!;
      const actions = document.createElement('div');
      actions.className = 'recome-feedback';

      const boost = document.createElement('button');
      boost.className = 'recome-fb-btn';
      boost.textContent = '＋ More like this';
      boost.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onFeedback('boost');
        confirmFeedback(actions, `Noted — boosted “${topicLabel}” in your graph.`);
      });

      const block = document.createElement('button');
      block.className = 'recome-fb-btn recome-fb-block';
      block.textContent = '－ Not for me';
      block.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onFeedback('block');
        el.classList.add('recome-filtered');
        confirmFeedback(actions, `Got it — “${topicLabel}” won’t drive suggestions anymore.`);
      });

      actions.appendChild(boost);
      actions.appendChild(block);
      note.appendChild(actions);
    }

    el.appendChild(note);
  }
}

/** Swap the action buttons for a one-line confirmation. */
function confirmFeedback(actionsEl: HTMLElement, message: string): void {
  const done = document.createElement('div');
  done.className = 'recome-fb-done';
  done.textContent = message;
  actionsEl.replaceWith(done);
}

export function clearAllBadges(): void {
  for (const host of Array.from(document.querySelectorAll('.recome-card-host'))) {
    host.classList.remove('recome-card-host', 'recome-show-reason', 'recome-filtered');
    host.querySelector(':scope > .recome-card-badge')?.remove();
    host.querySelector(':scope > .recome-reasoning')?.remove();
  }
}
