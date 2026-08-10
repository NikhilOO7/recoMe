/**
 * InsightCard — renders a proactive AgentEvent as a card below the page's
 * main content. The mockup shows two variants on the Amazon search demo:
 *   - "Proactive Insight from ScoutAgent" (kind: fresh_content, decision_nudge)
 *   - "Taste Twin Recommendation" (kind: new_alternative, weekly_summary)
 *
 * The container appends at the end of <body> as a fixed-position floating
 * column at the bottom of the viewport when there are 1-2 events. Larger
 * sets get a "View N more" link into the popup inbox.
 *
 * Each card has a "Dismiss" action which sends MARK_SEEN, and a primary CTA
 * which opens actionUrl (or recome.app/inbox if not set).
 */

import { sendMessage, type MarkSeenPayload } from '@shared/messages';
import type { AgentEvent } from '@shared/types';
import { getWebAppUrl } from '@shared/constants';
import { createLogger } from '@shared/Logger';

const log = createLogger('InsightCard');

const STYLE_ID = 'recome-insight-style';

const KIND_META: Record<string, { label: string; accent: string; icon: string; cta: string }> = {
  recall: { label: 'Recall', accent: '#5eead4', icon: '↻', cta: 'Open' },
  deal_drop: { label: 'Concierge', accent: '#10b981', icon: '$', cta: 'View deal' },
  new_alternative: { label: 'Concierge', accent: '#10b981', icon: '⇄', cta: 'View alternative' },
  fresh_content: { label: 'Curator', accent: '#8b5cf6', icon: '★', cta: 'View' },
  decision_nudge: { label: 'Decision', accent: '#60a5fa', icon: '?', cta: 'Decide' },
  weekly_summary: { label: 'Synthesist', accent: '#5eead4', icon: '∑', cta: 'Read summary' },
};

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    #recome-insight-host {
      position: fixed;
      bottom: 16px;
      left: 16px;
      right: 352px;
      z-index: 2147483645;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
      max-width: 800px;
    }
    .recome-insight-card {
      pointer-events: auto;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 16px;
      background: linear-gradient(135deg, rgba(16,21,29,0.97) 0%, rgba(10,13,18,0.97) 100%);
      border: 1px solid rgba(94,234,212,0.22);
      border-radius: 12px;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      font-size: 13.5px;
      line-height: 1.5;
      backdrop-filter: blur(10px);
      box-shadow: 0 10px 32px rgba(0,0,0,0.4);
      transform: translateY(8px);
      opacity: 0;
      transition: opacity .25s ease, transform .25s ease;
    }
    .recome-insight-card.visible { opacity: 1; transform: translateY(0); }
    .recome-insight-icon {
      width: 36px; height: 36px; flex-shrink: 0;
      border-radius: 10px;
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 16px; font-weight: 700;
    }
    .recome-insight-body { flex: 1; min-width: 0; }
    .recome-insight-label {
      font-size: 10.5px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.7px;
      margin-bottom: 4px;
    }
    .recome-insight-title {
      font-weight: 600; font-size: 14px; color: #fff;
      margin-bottom: 2px;
    }
    .recome-insight-text { color: rgba(255,255,255,0.65); font-size: 12.5px; }
    .recome-insight-actions { display: flex; gap: 8px; align-items: center; }
    .recome-insight-btn {
      padding: 8px 14px;
      border-radius: 8px;
      font-family: inherit;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      border: 0;
      transition: transform .08s, background .15s;
    }
    .recome-insight-btn:active { transform: translateY(1px); }
    .recome-insight-primary { background: #fff; color: #0a0d12; }
    .recome-insight-primary:hover { background: #d6f5ee; }
    .recome-insight-dismiss {
      background: transparent;
      color: rgba(255,255,255,0.55);
      border: 1px solid rgba(255,255,255,0.12);
    }
    .recome-insight-dismiss:hover { color: #fff; border-color: rgba(255,255,255,0.3); }
  `;
  document.head.appendChild(s);
}

function ensureHost(): HTMLDivElement {
  let host = document.getElementById('recome-insight-host') as HTMLDivElement | null;
  if (!host) {
    host = document.createElement('div');
    host.id = 'recome-insight-host';
    document.body.appendChild(host);
  }
  return host;
}

const rendered = new Map<string, HTMLDivElement>();

export async function renderEvents(events: AgentEvent[]): Promise<void> {
  ensureStyles();
  const host = ensureHost();
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
    host.appendChild(el);
    rendered.set(e.id, el);
    requestAnimationFrame(() => el.classList.add('visible'));

    el.querySelector('.recome-insight-primary')?.addEventListener('click', () => {
      const url = e.actionUrl ?? `${webUrl}/inbox`;
      if (chrome.tabs?.create) {
        chrome.tabs.create({ url });
      } else {
        window.open(url, '_blank', 'noopener');
      }
      void markSeen(e.id);
    });
    el.querySelector('.recome-insight-dismiss')?.addEventListener('click', () => {
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
  el.className = 'recome-insight-card';

  const icon = document.createElement('div');
  icon.className = 'recome-insight-icon';
  icon.style.background = `${meta.accent}22`;
  icon.style.color = meta.accent;
  icon.style.border = `1px solid ${meta.accent}44`;
  icon.textContent = meta.icon;
  el.appendChild(icon);

  const body = document.createElement('div');
  body.className = 'recome-insight-body';
  const label = document.createElement('div');
  label.className = 'recome-insight-label';
  label.style.color = meta.accent;
  label.textContent = meta.label;
  body.appendChild(label);
  const title = document.createElement('div');
  title.className = 'recome-insight-title';
  title.textContent = e.title;
  body.appendChild(title);
  if (e.body) {
    const text = document.createElement('div');
    text.className = 'recome-insight-text';
    text.textContent = e.body;
    body.appendChild(text);
  }
  el.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'recome-insight-actions';
  const primary = document.createElement('button');
  primary.className = 'recome-insight-btn recome-insight-primary';
  primary.textContent = meta.cta;
  actions.appendChild(primary);
  const dismiss = document.createElement('button');
  dismiss.className = 'recome-insight-btn recome-insight-dismiss';
  dismiss.setAttribute('aria-label', 'Dismiss');
  dismiss.textContent = '✕';
  actions.appendChild(dismiss);
  el.appendChild(actions);

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
  for (const el of rendered.values()) el.remove();
  rendered.clear();
  document.getElementById('recome-insight-host')?.remove();
}
