/**
 * InsightCard — renders a proactive AgentEvent as a compact toast column
 * pinned bottom-left of the viewport (1-2 cards; the rest live in the popup
 * inbox).
 *
 * Isolation model (learned the hard way — see CardBadge's popover history):
 *   - The host element carries ALL of its geometry as inline styles, which
 *     host-page stylesheets cannot override. No stretchy left+right anchoring;
 *     the card column is a fixed 380px (viewport-capped).
 *   - Everything inside lives in a shadow root, so aggressive site CSS
 *     (resets, `!important` display rules) cannot collapse the flex layout.
 *     A classed <style> in document.head demonstrably lost that fight.
 *
 * Each card has a "Dismiss" action which sends MARK_SEEN, and a primary CTA
 * which opens actionUrl (or the web app inbox if not set).
 */

import { sendMessage, type MarkSeenPayload } from '@shared/messages';
import type { AgentEvent } from '@shared/types';
import { getWebAppUrl } from '@shared/constants';
import { createLogger } from '@shared/Logger';

const log = createLogger('InsightCard');

const HOST_ID = 'recome-insight-host';

const KIND_META: Record<string, { label: string; accent: string; icon: string; cta: string }> = {
  recall: { label: 'Recall', accent: '#5eead4', icon: '↻', cta: 'Open' },
  deal_drop: { label: 'Concierge', accent: '#10b981', icon: '$', cta: 'View deal' },
  new_alternative: { label: 'Concierge', accent: '#10b981', icon: '⇄', cta: 'View alternative' },
  fresh_content: { label: 'Curator', accent: '#8b5cf6', icon: '★', cta: 'View' },
  decision_nudge: { label: 'Decision', accent: '#60a5fa', icon: '?', cta: 'Decide' },
  weekly_summary: { label: 'Synthesist', accent: '#5eead4', icon: '∑', cta: 'Read summary' },
};

// Scoped to the shadow root — host-page CSS cannot reach any of this.
const CARD_CSS = `
  .stack { display: flex; flex-direction: column; gap: 8px; }
  .card {
    pointer-events: auto;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 13px 14px;
    background: linear-gradient(135deg, #10151d 0%, #0a0d12 100%);
    border: 1px solid rgba(94,234,212,0.22);
    border-radius: 12px;
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    font-size: 13px;
    line-height: 1.5;
    box-shadow: 0 10px 32px rgba(0,0,0,0.45);
    transform: translateY(8px);
    opacity: 0;
    transition: opacity .25s ease, transform .25s ease;
  }
  .card.visible { opacity: 1; transform: translateY(0); }
  .icon {
    width: 32px; height: 32px; flex-shrink: 0;
    border-radius: 9px;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 15px; font-weight: 700;
  }
  .body { flex: 1; min-width: 0; }
  .label {
    font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.7px;
    margin-bottom: 3px;
  }
  .title { font-weight: 600; font-size: 13.5px; color: #fff; margin-bottom: 2px; }
  .text { color: rgba(255,255,255,0.65); font-size: 12px; }
  .actions { display: flex; gap: 8px; align-items: center; margin-top: 10px; }
  .btn {
    padding: 6px 12px;
    border-radius: 7px;
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.4;
    cursor: pointer;
    border: 0;
    transition: transform .08s, background .15s;
  }
  .btn:active { transform: translateY(1px); }
  .primary { background: #fff; color: #0a0d12; }
  .primary:hover { background: #d6f5ee; }
  .dismiss {
    background: transparent;
    color: rgba(255,255,255,0.55);
    border: 1px solid rgba(255,255,255,0.12);
  }
  .dismiss:hover { color: #fff; border-color: rgba(255,255,255,0.3); }
`;

/** Returns the shadow-isolated stack the cards mount into. */
function ensureStack(): HTMLElement {
  const existing = document.getElementById(HOST_ID) as HTMLDivElement | null;
  const stack = existing?.shadowRoot?.querySelector('.stack');
  if (stack) return stack as HTMLElement;
  // Missing or built by an older version without a shadow root — rebuild.
  existing?.remove();
  rendered.clear();

  const host = document.createElement('div');
  host.id = HOST_ID;
  // Inline geometry only: a fixed-width column bottom-left. Never anchor
  // left AND right — that stretched the card across the viewport.
  host.style.cssText =
    'position:fixed;bottom:16px;left:16px;' +
    'width:380px;max-width:calc(100vw - 32px);' +
    'z-index:2147483645;pointer-events:none;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CARD_CSS;
  shadow.appendChild(style);
  const newStack = document.createElement('div');
  newStack.className = 'stack';
  shadow.appendChild(newStack);
  document.body.appendChild(host);
  return newStack;
}

const rendered = new Map<string, HTMLDivElement>();

export async function renderEvents(events: AgentEvent[]): Promise<void> {
  const stack = ensureStack();
  const webUrl = await getWebAppUrl();

  // Show only the top 2 unseen events here; the rest live in popup inbox.
  const unseen = events.filter((e) => !e.seenAt).slice(0, 2);
  const showIds = new Set(unseen.map((e) => e.id));

  // Remove cards no longer in the show set.
  for (const [id, el] of rendered) {
    if (!showIds.has(id)) {
      el.classList.remove('visible');
      setTimeout(() => el.remove(), 260);
      rendered.delete(id);
    }
  }

  for (const e of unseen) {
    if (rendered.has(e.id)) continue;
    const meta = KIND_META[e.kind] ?? {
      label: e.agent ?? 'Agent',
      accent: '#5eead4',
      icon: '●',
      cta: 'Open',
    };
    const el = buildCard(e, meta);
    stack.appendChild(el);
    rendered.set(e.id, el);
    requestAnimationFrame(() => el.classList.add('visible'));

    el.querySelector('.primary')?.addEventListener('click', () => {
      const url = e.actionUrl ?? `${webUrl}/inbox`;
      if (chrome.tabs?.create) {
        chrome.tabs.create({ url });
      } else {
        window.open(url, '_blank', 'noopener');
      }
      void markSeen(e.id);
    });
    el.querySelector('.dismiss')?.addEventListener('click', () => {
      void markSeen(e.id);
    });
  }
}

/** Build the insight card DOM without using innerHTML (per repo lint rule). */
function buildCard(
  e: AgentEvent,
  meta: { label: string; accent: string; icon: string; cta: string },
): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'card';

  const icon = document.createElement('div');
  icon.className = 'icon';
  icon.style.background = `${meta.accent}22`;
  icon.style.color = meta.accent;
  icon.style.border = `1px solid ${meta.accent}44`;
  icon.textContent = meta.icon;
  el.appendChild(icon);

  const body = document.createElement('div');
  body.className = 'body';
  const label = document.createElement('div');
  label.className = 'label';
  label.style.color = meta.accent;
  label.textContent = meta.label;
  body.appendChild(label);
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = e.title;
  body.appendChild(title);
  if (e.body) {
    const text = document.createElement('div');
    text.className = 'text';
    text.textContent = e.body;
    body.appendChild(text);
  }

  // Actions live inside the body column so the card reads label → title →
  // text → buttons at its fixed 380px width.
  const actions = document.createElement('div');
  actions.className = 'actions';
  const primary = document.createElement('button');
  primary.className = 'btn primary';
  primary.textContent = meta.cta;
  actions.appendChild(primary);
  const dismiss = document.createElement('button');
  dismiss.className = 'btn dismiss';
  dismiss.setAttribute('aria-label', 'Dismiss');
  dismiss.textContent = '✕';
  actions.appendChild(dismiss);
  body.appendChild(actions);
  el.appendChild(body);

  return el;
}

async function markSeen(eventId: string): Promise<void> {
  const res = await sendMessage<MarkSeenPayload, void>('MARK_SEEN', { eventId });
  if (!res.success) log.warn('mark seen failed', res.error);
  const el = rendered.get(eventId);
  if (el) {
    el.classList.remove('visible');
    setTimeout(() => el.remove(), 260);
    rendered.delete(eventId);
  }
}

export function clearInsights(): void {
  rendered.clear();
  document.getElementById(HOST_ID)?.remove();
}
