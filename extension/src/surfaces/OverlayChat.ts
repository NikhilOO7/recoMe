/**
 * OverlayChat — in-page Decision chat panel.
 *
 * Opened by the sidebar's "Ask Decision" action. Slides up from the bottom-
 * right of the viewport. Multi-turn conversation kept in memory for the life
 * of the tab — refresh wipes it (intentional; chat history is not Recome's
 * primary surface per ADR-0012).
 *
 * Each user turn calls Decision agent on-demand with topicHint + entityHint
 * derived from the current page's capture extract. The assistant response
 * comes back as a single block; a typewriter animation gives it the feel
 * of streaming without requiring true SSE plumbing in v1.
 */

import { sendMessage, type AgentRunOnDemandPayload } from '@shared/messages';
import type { AgentRunResult } from '@shared/CloudClient';
import { getAccessToken } from '@shared/AuthClient';
import { getCloudUrl } from '@shared/constants';
import { detectPlatform } from '../capture/detect';
import { createCapture } from '../capture';

interface Turn {
  role: 'user' | 'agent';
  text: string;
  pending?: boolean;
}

let host: HTMLDivElement | null = null;
let shadow: ShadowRoot | null = null;
let messagesEl: HTMLDivElement | null = null;
let inputEl: HTMLTextAreaElement | null = null;
let history: Turn[] = [];

export function openChat(): void {
  if (host) {
    setVisible(true);
    inputEl?.focus();
    return;
  }
  build();
  setVisible(true);
  setTimeout(() => inputEl?.focus(), 50);
}

export function closeChat(): void {
  setVisible(false);
}

function setVisible(visible: boolean): void {
  if (!host) return;
  host.style.display = visible ? 'block' : 'none';
}

function build(): void {
  host = document.createElement('div');
  host.id = 'recome-chat-host';
  host.style.cssText = `
    position: fixed; bottom: 16px; right: 352px; z-index: 2147483645;
    width: 420px; max-width: calc(100vw - 380px); height: min(540px, calc(100vh - 32px));
  `;
  shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = CHAT_CSS;
  shadow.appendChild(style);

  const root = document.createElement('div');
  root.className = 'rcm-chat';
  root.innerHTML = `
    <header class="rcm-chat-head">
      <div class="rcm-chat-title">
        <span class="rcm-chat-dot"></span>
        <span>Decision</span>
        <span class="rcm-chat-sub">grounded in your graph</span>
      </div>
      <button class="rcm-chat-close" aria-label="Close">×</button>
    </header>
    <div class="rcm-chat-messages"></div>
    <footer class="rcm-chat-foot">
      <textarea class="rcm-chat-input" rows="1" placeholder="Ask Decision about this page…"></textarea>
      <button class="rcm-chat-send" aria-label="Send">↑</button>
    </footer>
  `;
  shadow.appendChild(root);

  messagesEl = root.querySelector('.rcm-chat-messages') as HTMLDivElement;
  inputEl = root.querySelector('.rcm-chat-input') as HTMLTextAreaElement;
  const sendBtn = root.querySelector('.rcm-chat-send') as HTMLButtonElement;
  const closeBtn = root.querySelector('.rcm-chat-close') as HTMLButtonElement;

  closeBtn.addEventListener('click', () => closeChat());
  sendBtn.addEventListener('click', () => void send());
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  });
  // Autosize the textarea up to 6 lines.
  inputEl.addEventListener('input', () => {
    inputEl!.style.height = 'auto';
    inputEl!.style.height = Math.min(inputEl!.scrollHeight, 6 * 18) + 'px';
  });

  document.body.appendChild(host);
  seedGreeting();
}

function seedGreeting(): void {
  const platform = detectPlatform();
  const ex = createCapture(platform).extract();
  const where = ex?.pageTitle ? `you're looking at "${ex.pageTitle.slice(0, 80)}".` : 'this page.';
  pushTurn({
    role: 'agent',
    text: `I can pull your prior research for ${where}\n\nAsk me about a decision, a comparison, or what your graph says about the topic.`,
  });
}

/** Last N completed turns, oldest first — the multi-turn context the server
 *  actually receives (D5). Pending rows and the greeting are excluded;
 *  each turn is truncated so a pasted novel can't blow up the payload. */
const HISTORY_TURNS = 10;
const HISTORY_TURN_CHARS = 500;
function boundedHistory(): Array<{ role: 'user' | 'agent'; text: string }> {
  return history
    .filter((t) => !t.pending)
    .slice(1) // drop the canned greeting — it carries no user information
    .slice(-HISTORY_TURNS)
    .map((t) => ({ role: t.role, text: t.text.slice(0, HISTORY_TURN_CHARS) }));
}

async function send(): Promise<void> {
  const text = (inputEl?.value ?? '').trim();
  if (!text) return;
  inputEl!.value = '';
  inputEl!.style.height = 'auto';
  // Snapshot BEFORE pushing this turn: the new question travels as userQuery,
  // so history must contain only the turns that came before it.
  const priorTurns = boundedHistory();
  pushTurn({ role: 'user', text });
  const pending = pushTurn({ role: 'agent', text: 'Thinking…', pending: true });

  const platform = detectPlatform();
  const ex = createCapture(platform).extract();

  const event = {
    pageUrl: location.href,
    pageTitle: ex?.pageTitle ?? document.title,
    platform,
    topicHint: ex?.topics[0]?.name ?? text.toLowerCase(),
    entityHint: ex?.entities[0]?.name,
    userQuery: text,
    history: priorTurns,
  };

  // Try real SSE first; on any failure (older cloud / no auth / network)
  // fall back to the single-response AGENT_RUN_ONDEMAND + typewriter path.
  pending.row.classList.remove('pending');
  pending.textEl.textContent = '';

  const ok = await streamDecision(event, pending);
  if (ok) {
    finalizeTurn(pending);
    return;
  }

  // ── Fallback: non-streamed AGENT_RUN_ONDEMAND ─────────────────────────
  pending.textEl.textContent = 'Thinking…';
  pending.row.classList.add('pending');
  const res = await sendMessage<AgentRunOnDemandPayload, AgentRunResult>('AGENT_RUN_ONDEMAND', {
    agent: 'decision',
    trigger: 'on_demand',
    event,
  });

  if (!res.success) {
    pending.textEl.textContent = `(Decision couldn't run: ${res.error ?? 'unknown'})`;
    pending.row.classList.remove('pending');
    return;
  }
  const result = res.data!;
  if (result.status === 'skipped') {
    pending.textEl.textContent =
      result.reason === 'no_intents_for_user'
        ? 'Your graph is still empty. Capture a few pages and come back — Decision needs signals to ground a recommendation.'
        : `Skipped: ${result.reason ?? 'unknown'}`;
    pending.row.classList.remove('pending');
    return;
  }
  if (result.status !== 'succeeded' || !result.emission) {
    pending.textEl.textContent = `(no emission, status=${result.status})`;
    pending.row.classList.remove('pending');
    return;
  }

  const full = (result.emission.body ?? result.emission.title).trim();
  pending.row.classList.remove('pending');
  await typewriter(pending.textEl, full);
  renderSources(pending, result.emission.sources ?? []);
  finalizeTurn(pending);
}

/** Write the streamed/typed text back into the Turn object so the next
 *  question's history actually contains this answer (D5). */
function finalizeTurn(rt: RenderedTurn): void {
  rt.turn.text = rt.textEl.textContent ?? '';
  rt.turn.pending = false;
}

/** Citation chips under an agent answer — every emission cites its sources
 *  (ADR-0012 §5); the client now renders them instead of discarding (D5). */
function renderSources(
  rt: RenderedTurn,
  sources: Array<{ kind?: string; id?: string; label?: string; url?: string }>,
): void {
  if (!sources.length) return;
  const wrap = document.createElement('div');
  wrap.className = 'rcm-chat-sources';
  const lead = document.createElement('span');
  lead.className = 'rcm-chat-sources-lead';
  lead.textContent = 'From your graph:';
  wrap.appendChild(lead);
  for (const s of sources.slice(0, 5)) {
    const label = (s.label ?? s.id ?? '').slice(0, 40);
    if (!label) continue;
    if (s.url) {
      const a = document.createElement('a');
      a.className = 'rcm-chat-src';
      a.textContent = label;
      a.href = s.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      wrap.appendChild(a);
    } else {
      const chip = document.createElement('span');
      chip.className = 'rcm-chat-src';
      chip.textContent = label;
      wrap.appendChild(chip);
    }
  }
  rt.row.appendChild(wrap);
  if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
}

/**
 * Stream the Decision agent's response token-by-token via SSE. Returns true
 * on success (chunks rendered into `el`), false to signal the caller to use
 * the non-streamed fallback path.
 *
 * Protocol mirrors cloud/src/agents/AgentController.ts `/decision/stream`:
 *   data: <text-chunk>
 *   data: __meta__:{"sources":…,"actionUrl":…}
 *   data: [DONE]
 */
async function streamDecision(event: Record<string, unknown>, rt: RenderedTurn): Promise<boolean> {
  const el = rt.textEl;
  try {
    const [base, token] = await Promise.all([getCloudUrl(), getAccessToken()]);
    if (!token) return false;

    const res = await fetch(`${base}/intelligence/agents/decision/stream`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        accept: 'text/event-stream',
      },
      body: JSON.stringify({ event }),
    });
    if (!res.ok || !res.body) return false;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let textRendered = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // SSE messages are split by "\n\n" terminators; each starts with "data:"
      let idx: number;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const line = raw.replace(/^data:\s?/, '');
        if (line === '[DONE]') {
          reader.cancel().catch(() => undefined);
          return textRendered;
        }
        if (line.startsWith('__meta__:')) {
          textRendered = handleStreamMeta(line.slice('__meta__:'.length), rt) || textRendered;
          continue;
        }
        el.textContent = (el.textContent ?? '') + line;
        textRendered = true;
        if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }
    return textRendered;
  } catch {
    return false;
  }
}

/**
 * Final `__meta__` envelope: citations, skip, or Guardian cap. Returns true
 * when it rendered something, so the caller doesn't double-run the fallback
 * path for an answer the server already gave.
 */
function handleStreamMeta(json: string, rt: RenderedTurn): boolean {
  let meta: {
    sources?: Array<{ kind?: string; id?: string; label?: string; url?: string }>;
    skipped?: boolean;
    reason?: string;
    capped?: boolean;
    error?: string;
  };
  try {
    meta = JSON.parse(json);
  } catch {
    return false;
  }

  if (meta.skipped) {
    rt.textEl.textContent =
      meta.reason === 'no_intents_for_user'
        ? 'Your graph is still empty. Capture a few pages and come back — Decision needs signals to ground a recommendation.'
        : `Decision skipped this one (${meta.reason ?? 'no reason given'}).`;
    return true;
  }
  if (meta.capped) {
    rt.textEl.textContent =
      "Decision is resting — today's agent budget for your account is used up. It resets within 24 hours.";
    return true;
  }
  if (meta.error) return false; // let the fallback path try
  if (meta.sources?.length) renderSources(rt, meta.sources);
  return false; // sources alone don't count as an answer
}

interface RenderedTurn {
  row: HTMLDivElement;
  textEl: HTMLDivElement;
  /** The live Turn in `history` — finalizeTurn() writes the answer back. */
  turn: Turn;
}

function pushTurn(turn: Turn): RenderedTurn {
  history.push(turn);
  if (!messagesEl) throw new Error('chat not built');
  const row = document.createElement('div');
  row.className = `rcm-chat-row rcm-${turn.role}${turn.pending ? ' pending' : ''}`;
  const text = document.createElement('div');
  text.className = 'rcm-chat-text';
  text.textContent = turn.text;
  row.appendChild(text);
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return { row, textEl: text, turn };
}

async function typewriter(el: HTMLDivElement, full: string): Promise<void> {
  el.textContent = '';
  const STEP = 12; // chars per tick
  const DELAY = 18;
  for (let i = 0; i <= full.length; i += STEP) {
    el.textContent = full.slice(0, i);
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
    await new Promise((r) => setTimeout(r, DELAY));
  }
  el.textContent = full;
}

const CHAT_CSS = `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; padding: 0; }
.rcm-chat {
  background: linear-gradient(180deg, #0d1a30 0%, #060d1a 100%);
  border: 1px solid rgba(94,234,212,0.22);
  border-radius: 14px;
  color: #fff;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  font-size: 13px;
  line-height: 1.55;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-shadow: 0 16px 48px rgba(0,0,0,0.5);
  overflow: hidden;
}
.rcm-chat-head {
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  display: flex; align-items: center; justify-content: space-between;
  background: rgba(35, 86, 232, 0.06);
}
.rcm-chat-title { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px; }
.rcm-chat-dot {
  width: 8px; height: 8px; border-radius: 50%; background: #2356e8;
  box-shadow: 0 0 0 3px rgba(35, 86, 232, 0.18);
}
.rcm-chat-sub {
  font-weight: 500; font-size: 11px; color: rgba(255,255,255,0.45);
  margin-left: 4px;
}
.rcm-chat-close {
  appearance: none; background: transparent; border: 0;
  color: rgba(255,255,255,0.45); cursor: pointer;
  width: 28px; height: 28px; border-radius: 8px;
  font-size: 18px; line-height: 1;
  transition: background .12s, color .12s;
}
.rcm-chat-close:hover { background: rgba(255,255,255,0.06); color: #fff; }

.rcm-chat-messages {
  flex: 1; overflow-y: auto;
  padding: 14px;
  display: flex; flex-direction: column; gap: 10px;
}
.rcm-chat-row {
  display: flex;
}
.rcm-chat-row.rcm-user { justify-content: flex-end; }
.rcm-chat-row .rcm-chat-text {
  max-width: 86%;
  padding: 9px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-wrap: break-word;
}
.rcm-chat-sources {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  max-width: 86%;
  margin-top: 5px;
}
.rcm-chat-sources-lead {
  font-size: 10.5px;
  color: rgba(255,255,255,0.45);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.rcm-chat-src {
  font-size: 11px;
  color: #5eead4;
  background: rgba(94,234,212,0.09);
  border: 1px solid rgba(94,234,212,0.25);
  border-radius: 999px;
  padding: 2px 9px;
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}
a.rcm-chat-src:hover { background: rgba(94,234,212,0.18); }
.rcm-chat-row.rcm-user .rcm-chat-text {
  background: linear-gradient(135deg, #2356e8 0%, #4a73ed 100%);
  color: #fff;
  border-bottom-right-radius: 4px;
}
.rcm-chat-row.rcm-agent .rcm-chat-text {
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.92);
  border: 1px solid rgba(255,255,255,0.06);
  border-bottom-left-radius: 4px;
}
.rcm-chat-row.pending .rcm-chat-text {
  font-style: italic;
  color: rgba(255,255,255,0.5);
}

.rcm-chat-foot {
  display: flex; align-items: flex-end; gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.02);
}
.rcm-chat-input {
  flex: 1;
  appearance: none;
  resize: none;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.4;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.02);
  color: #fff;
  outline: none;
  transition: border-color .12s, background .12s;
}
.rcm-chat-input:focus {
  border-color: rgba(94,234,212,0.45);
  background: rgba(94,234,212,0.05);
}
.rcm-chat-send {
  width: 34px; height: 34px;
  border-radius: 8px;
  background: #5eead4;
  color: #060d1a;
  border: 0;
  font-size: 16px;
  font-weight: 800;
  cursor: pointer;
  transition: background .12s, transform .08s;
}
.rcm-chat-send:hover { background: #7df0dc; }
.rcm-chat-send:active { transform: translateY(1px); }
`;

export function resetChat(): void {
  history = [];
  if (messagesEl) {
    messagesEl.innerHTML = '';
    seedGreeting();
  }
}
