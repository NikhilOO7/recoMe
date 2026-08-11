/**
 * Sidebar — right-edge floating panel with RecoMe status + Interest Graph + Agents.
 *
 * Lives in a shadow-DOM-isolated host so host-page CSS can't restyle it. The
 * visual is a port of pitch-site/demos/extension-demo.html into a smaller
 * floating column (~320px wide, scrollable).
 *
 * Render is plain DOM (no React) to keep content-script bundle small. State
 * mutates by targeted text replacement on a fixed structure.
 */

import { sendMessage, type GetIntentsPayload, type GetInboxPayload } from '@shared/messages';
import { getWebAppUrl } from '@shared/constants';
import type { IntentRow, AgentInfo } from '@shared/CloudClient';
import type { AgentEvent } from '@shared/types';
import type { Workflow } from './workflows';

export interface SidebarAction {
  label: string;
  onClick: () => void | Promise<void>;
}

interface SidebarRefs {
  host: HTMLDivElement;
  root: HTMLDivElement;
  statusDot: HTMLSpanElement;
  statusLabel: HTMLSpanElement;
  nodesLine: HTMLSpanElement;
  sessionLine: HTMLSpanElement;
  intentsList: HTMLDivElement;
  agentsList: HTMLDivElement;
  actionsPanel: HTMLDivElement;
  actionsList: HTMLDivElement;
  inboxBadge: HTMLSpanElement;
  collapseBtn: HTMLButtonElement;
  infoBtn: HTMLButtonElement;
  helpPanel: HTMLDivElement;
}

export class Sidebar {
  private refs: SidebarRefs | null = null;
  private collapsed = false;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  // ── Capture liveness (the invisible 10s dwell read as "not working") ──
  /** Show a ticking countdown while the dwell timer runs on this page. */
  onCaptureArmed(dwellMs: number): void {
    if (!this.refs) return;
    this.clearCountdown();
    let remaining = Math.round(dwellMs / 1000);
    const line = this.refs.nodesLine;
    const tick = () => {
      if (remaining <= 0) return this.clearCountdown();
      line.textContent = `Reading this page — capturing in ${remaining}s…`;
      remaining -= 1;
    };
    tick();
    this.countdownTimer = setInterval(tick, 1000);
  }

  /** Signal captured: pulse, name the topics, then refresh so the graph
   *  panel visibly gains the new topic within seconds. */
  onCaptureFired(topics: string[]): void {
    if (!this.refs) return;
    this.clearCountdown();
    const shown = topics.slice(0, 2).join(', ');
    this.refs.nodesLine.textContent = `✓ Captured: ${shown}${topics.length > 2 ? ` +${topics.length - 2}` : ''}`;
    this.refs.statusDot.classList.add('rcm-dot-pulse');
    setTimeout(() => this.refs?.statusDot.classList.remove('rcm-dot-pulse'), 2500);
    // Push the queue now and re-pull intents so the topic appears live.
    void sendMessage('FLUSH_NOW', undefined).then(() => {
      setTimeout(() => void this.refresh(), 1500);
    });
  }

  onCaptureSkipped(): void {
    if (!this.refs) return;
    this.clearCountdown();
    this.refs.nodesLine.textContent = 'Nothing to capture on this page.';
  }

  private clearCountdown(): void {
    if (this.countdownTimer !== null) clearInterval(this.countdownTimer);
    this.countdownTimer = null;
  }

  mount(): void {
    if (this.refs) return;
    this.refs = this.buildShell();
    document.body.appendChild(this.refs.host);
    this.refresh();
    this.refreshTimer = setInterval(() => this.refresh(), 60_000);
  }

  unmount(): void {
    if (this.refreshTimer !== null) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
    this.clearCountdown();
    this.refs?.host.remove();
    this.refs = null;
  }

  /** Replace the Actions panel contents. Called by content/index.ts on page nav. */
  setActions(actions: SidebarAction[]): void {
    if (!this.refs) return;
    if (actions.length === 0) {
      this.refs.actionsPanel.style.display = 'none';
      this.refs.actionsList.innerHTML = '';
      return;
    }
    this.refs.actionsPanel.style.display = '';
    this.refs.actionsList.innerHTML = '';
    for (const a of actions) {
      const btn = document.createElement('button');
      btn.className = 'rcm-action';
      btn.textContent = a.label;
      btn.addEventListener('click', () => {
        void a.onClick();
      });
      this.refs.actionsList.appendChild(btn);
    }
  }

  /** Bind manual flows from WorkflowOrchestrator. */
  setManualFlows(flows: Workflow[]): void {
    this.setActions(
      flows.map((f) => ({
        label: f.manualLabel() ?? f.name,
        onClick: () => f.fireManual(),
      })),
    );
  }

  /** Called when bg pushes an INBOX_UPDATED message (Phase 0 broadcast). */
  onInboxUpdate(unseenCount: number): void {
    if (!this.refs) return;
    this.refs.inboxBadge.textContent = unseenCount > 0 ? String(unseenCount) : '';
    this.refs.inboxBadge.style.display = unseenCount > 0 ? 'inline-flex' : 'none';
  }

  private async refresh(): Promise<void> {
    if (!this.refs) return;
    const t0 = performance.now();
    const [intentsRes, agentsRes, inboxRes] = await Promise.all([
      sendMessage<GetIntentsPayload, { intents: IntentRow[] }>('GET_INTENTS', { limit: 5 }),
      sendMessage<undefined, { agents: AgentInfo[] }>('LIST_AGENTS'),
      sendMessage<GetInboxPayload, { events: AgentEvent[] }>('GET_INBOX', { unseen: true }),
    ]);
    const latency = Math.round(performance.now() - t0);

    if (!intentsRes.success && intentsRes.error?.includes('401')) {
      this.renderSignedOut();
      return;
    }

    const intents = intentsRes.data?.intents ?? [];
    const agents = agentsRes.data?.agents ?? [];
    const unseen = inboxRes.data?.events?.length ?? 0;

    this.refs.statusDot.style.background = '#10b981';
    this.refs.statusLabel.textContent = 'RecoMe Active';
    // Never clobber a live capture countdown/confirmation with telemetry.
    if (this.countdownTimer === null) {
      this.refs.nodesLine.textContent =
        intents.length === 0
          ? 'Your graph is warming up.'
          : `${intents.length} topic${intents.length === 1 ? '' : 's'} live in your graph`;
    }
    this.refs.sessionLine.textContent = `Synced · ${latency}ms`;

    this.renderIntents(intents);
    this.renderAgents(agents, unseen);
    this.onInboxUpdate(unseen);
  }

  private renderSignedOut(): void {
    if (!this.refs) return;
    this.refs.statusDot.style.background = '#94a3b8';
    this.refs.statusLabel.textContent = 'Signed out';
    this.refs.nodesLine.textContent = '';
    this.refs.sessionLine.textContent = 'One click connects your web session:';
    this.refs.agentsList.innerHTML = '';

    // A real sign-in button — previously this state was text-only, so there
    // was NO path from the extension into the login handoff at all.
    this.refs.intentsList.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'rcm-action';
    btn.textContent = 'Sign in to RecoMe';
    btn.addEventListener('click', () => {
      // After an extension reload, orphaned content scripts lose their
      // runtime id — interpolating undefined produced ext_id=undefined and
      // a chrome-extension://invalid/ dead end. Guard and ask for a refresh.
      const extId = chrome.runtime?.id;
      if (!extId) {
        btn.textContent = 'Extension updated — refresh this page first';
        return;
      }
      void getWebAppUrl().then((base) => {
        window.open(`${base}/login?return=extension&ext_id=${extId}`, '_blank');
      });
    });
    this.refs.intentsList.appendChild(btn);
  }

  private renderIntents(intents: IntentRow[]): void {
    if (!this.refs) return;
    this.refs.intentsList.innerHTML = '';
    if (intents.length === 0) {
      this.refs.intentsList.appendChild(buildIntentsEmptyState());
      return;
    }
    for (const i of intents.slice(0, 5)) {
      const w = Math.min(1, Math.max(0, i.strength));
      const name = i.topicName ?? i.topicNormalizedName;
      this.refs.intentsList.appendChild(buildIntentRow(name, w));
    }
  }

  private renderAgents(agents: AgentInfo[], unseen: number): void {
    if (!this.refs) return;
    this.refs.agentsList.innerHTML = '';
    if (agents.length === 0) {
      this.refs.agentsList.appendChild(buildAgentsEmptyState());
      return;
    }
    for (const a of agents) {
      const paused = a.paused || !a.enabled;
      const dotColor = paused ? '#94a3b8' : '#10b981';
      const subText = paused
        ? 'Paused'
        : a.name === 'recall' && unseen > 0
          ? `${unseen} new insight${unseen === 1 ? '' : 's'} ready`
          : 'Watching your graph';
      this.refs.agentsList.appendChild(buildAgentRow(a.displayName, subText, dotColor));
    }
  }

  private buildShell(): SidebarRefs {
    const host = document.createElement('div');
    host.id = 'recome-sidebar-host';
    host.style.cssText = `
      position: fixed; top: 16px; right: 16px; z-index: 2147483646;
      width: 320px; max-height: calc(100vh - 32px); pointer-events: auto;
    `;
    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = SIDEBAR_CSS;
    shadow.appendChild(style);

    const root = document.createElement('div');
    root.className = 'rcm';
    root.innerHTML = `
      <div class="rcm-header">
        <div class="rcm-status">
          <span class="rcm-dot"></span>
          <span class="rcm-status-label">Connecting…</span>
        </div>
        <div class="rcm-head-actions">
          <button class="rcm-info" title="How RecoMe works" aria-label="How RecoMe works">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/>
              <line x1="12" y1="10" x2="12" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <circle cx="12" cy="7.5" r="1.1" fill="currentColor"/>
            </svg>
          </button>
          <button class="rcm-collapse" title="Collapse">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="rcm-body">
        <div class="rcm-help" hidden>
          <div class="rcm-help-title">How RecoMe works</div>
          <ol class="rcm-help-steps">
            <li><b>Capture.</b> Dwell + search across 15 sites.</li>
            <li><b>Graph.</b> Topics and entities feed your personal interest graph in cloud.</li>
            <li><b>Agents.</b> Recall, Concierge, Curator, Decision, and Curriculum work the graph.</li>
            <li><b>Surfaces.</b> They speak to you here — badges on cards, insight cards bottom-left, chat via Ask Decision.</li>
          </ol>
          <a class="rcm-help-link" href="#" target="_blank" rel="noopener">
            Learn more: how RecoMe works →
          </a>
        </div>
        <div class="rcm-status-lines">
          <div class="rcm-nodes"></div>
          <div class="rcm-session"></div>
        </div>
        <div class="rcm-panel">
          <div class="rcm-panel-title">Interest Graph</div>
          <div class="rcm-panel-sub">Built from your browsing behavior</div>
          <div class="rcm-intents"></div>
        </div>
        <div class="rcm-panel rcm-actions-panel" style="display:none">
          <div class="rcm-panel-title">Ask the agents</div>
          <div class="rcm-actions"></div>
        </div>
        <div class="rcm-panel">
          <div class="rcm-panel-title">Agents <span class="rcm-inbox-badge"></span></div>
          <div class="rcm-agents"></div>
        </div>
      </div>
    `;
    shadow.appendChild(root);

    const statusDot = root.querySelector('.rcm-dot') as HTMLSpanElement;
    const statusLabel = root.querySelector('.rcm-status-label') as HTMLSpanElement;
    const nodesLine = root.querySelector('.rcm-nodes') as HTMLSpanElement;
    const sessionLine = root.querySelector('.rcm-session') as HTMLSpanElement;
    const intentsList = root.querySelector('.rcm-intents') as HTMLDivElement;
    const agentsList = root.querySelector('.rcm-agents') as HTMLDivElement;
    const actionsPanel = root.querySelector('.rcm-actions-panel') as HTMLDivElement;
    const actionsList = root.querySelector('.rcm-actions') as HTMLDivElement;
    const inboxBadge = root.querySelector('.rcm-inbox-badge') as HTMLSpanElement;
    const collapseBtn = root.querySelector('.rcm-collapse') as HTMLButtonElement;
    const infoBtn = root.querySelector('.rcm-info') as HTMLButtonElement;
    const helpPanel = root.querySelector('.rcm-help') as HTMLDivElement;

    // The web-app base is config (storage-overridable), so the help link is
    // resolved at mount rather than hardcoded in the template.
    const helpLink = root.querySelector('.rcm-help-link') as HTMLAnchorElement;
    void getWebAppUrl().then((base) => {
      helpLink.href = `${base}/how-it-works`;
    });

    collapseBtn.addEventListener('click', () => {
      this.collapsed = !this.collapsed;
      root.classList.toggle('rcm-collapsed', this.collapsed);
    });

    infoBtn.addEventListener('click', () => {
      const isOpen = !helpPanel.hasAttribute('hidden');
      if (isOpen) helpPanel.setAttribute('hidden', '');
      else helpPanel.removeAttribute('hidden');
      infoBtn.classList.toggle('rcm-info-active', !isOpen);
    });

    return {
      host,
      root,
      statusDot,
      statusLabel,
      nodesLine,
      sessionLine,
      intentsList,
      agentsList,
      actionsPanel,
      actionsList,
      inboxBadge,
      collapseBtn,
      infoBtn,
      helpPanel,
    };
  }
}

// ── DOM builders (use createElement to satisfy the no-raw-innerHTML rule) ───

function buildIntentRow(name: string, weight: number, demo = false): HTMLDivElement {
  const row = document.createElement('div');
  row.className = demo ? 'rcm-row rcm-row-demo' : 'rcm-row';
  const head = document.createElement('div');
  head.className = 'rcm-row-head';
  const topic = document.createElement('span');
  topic.className = 'rcm-topic';
  topic.textContent = name;
  const w = document.createElement('span');
  w.className = 'rcm-weight';
  w.textContent = weight.toFixed(2);
  head.appendChild(topic);
  head.appendChild(w);
  const bar = document.createElement('div');
  bar.className = 'rcm-bar';
  const fill = document.createElement('div');
  fill.className = 'rcm-bar-fill';
  fill.style.width = `${(weight * 100).toFixed(0)}%`;
  bar.appendChild(fill);
  row.appendChild(head);
  row.appendChild(bar);
  return row;
}

function buildAgentRow(name: string, sub: string, dotColor: string): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'rcm-agent';
  const dot = document.createElement('span');
  dot.className = 'rcm-agent-dot';
  dot.style.background = dotColor;
  row.appendChild(dot);
  const body = document.createElement('div');
  body.className = 'rcm-agent-body';
  const nm = document.createElement('div');
  nm.className = 'rcm-agent-name';
  nm.textContent = name;
  const sb = document.createElement('div');
  sb.className = 'rcm-agent-sub';
  sb.textContent = sub;
  body.appendChild(nm);
  body.appendChild(sb);
  row.appendChild(body);
  return row;
}

const DEMO_INTENTS: Array<[string, number]> = [
  ['standing desks', 0.85],
  ['distributed systems', 0.72],
  ['italian cooking', 0.58],
];

function buildIntentsEmptyState(): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'rcm-intents-empty';
  // Invented data must never render unlabeled next to real data (PRODUCT.md
  // principle 7 / D4): the example rows carry an explicit badge.
  const badge = document.createElement('div');
  badge.className = 'rcm-intents-demo-badge';
  badge.textContent = 'Example preview — not your data';
  wrap.appendChild(badge);
  const demos = document.createElement('div');
  demos.className = 'rcm-intents-demos';
  demos.setAttribute('aria-hidden', 'true');
  for (const [name, weight] of DEMO_INTENTS) {
    demos.appendChild(buildIntentRow(name, weight, true));
  }
  wrap.appendChild(demos);
  const hint = document.createElement('div');
  hint.className = 'rcm-intents-hint';
  hint.textContent =
    'Your topics will appear here as you browse YouTube, Amazon, Reddit, and 12 other sites. Dwell on a page for 10 seconds to capture your first signal.';
  wrap.appendChild(hint);
  return wrap;
}

function buildAgentsEmptyState(): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'rcm-empty';
  // User-facing copy — server env details belong in ops docs, not in the UI.
  wrap.textContent =
    "Agents aren't switched on for your account yet. They activate automatically once your plan includes them — nothing to configure here.";
  return wrap;
}

const SIDEBAR_CSS = `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; padding: 0; }
.rcm {
  background: linear-gradient(180deg, #10151d 0%, #0a0d12 100%);
  border: 1px solid rgba(94,234,212,0.18);
  border-radius: 14px;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 13px;
  line-height: 1.5;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(0,0,0,0.45);
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 32px);
}
.rcm-header {
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  background: rgba(94,234,212,0.04);
}
.rcm-status { display: flex; align-items: center; gap: 8px; font-weight: 700; }
.rcm-dot { width: 8px; height: 8px; border-radius: 50%; background: #94a3b8;
  box-shadow: 0 0 0 3px rgba(255,255,255,0.05); transition: background .25s; }
@keyframes rcm-capture-pulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(94,234,212,0.15); }
  50% { box-shadow: 0 0 0 7px rgba(94,234,212,0.35); }
}
.rcm-dot-pulse { animation: rcm-capture-pulse 0.9s ease-in-out 3; background: #5eead4 !important; }
.rcm-status-label { letter-spacing: -0.2px; }
.rcm-collapse {
  width: 28px; height: 28px; border: 0; background: transparent;
  border-radius: 8px; color: rgba(255,255,255,0.55); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: background .15s, color .15s, transform .2s;
}
.rcm-collapse:hover { background: rgba(255,255,255,0.06); color: #fff; }
.rcm.rcm-collapsed .rcm-collapse { transform: rotate(180deg); }
.rcm.rcm-collapsed .rcm-body { display: none; }

.rcm-body { padding: 10px 12px 14px; overflow: auto; }
.rcm-status-lines {
  font-size: 11.5px; color: rgba(255,255,255,0.55);
  padding: 4px 4px 12px; line-height: 1.6;
}
.rcm-nodes, .rcm-session { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 11px; }

.rcm-panel {
  background: linear-gradient(135deg, rgba(13,148,136,0.10) 0%, rgba(94,234,212,0.04) 100%);
  border: 1px solid rgba(94,234,212,0.18);
  border-radius: 10px;
  padding: 12px 12px 10px;
  margin-bottom: 10px;
}
.rcm-panel-title {
  font-size: 10.5px; font-weight: 700; color: #5eead4;
  text-transform: uppercase; letter-spacing: 0.7px;
  display: flex; align-items: center; gap: 8px;
}
.rcm-panel-sub { font-size: 11px; color: rgba(255,255,255,0.45); margin: 4px 0 10px; }

.rcm-row { margin-bottom: 8px; }
.rcm-row:last-child { margin-bottom: 0; }
.rcm-row-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 3px; }
.rcm-topic { font-size: 12.5px; font-weight: 500; color: rgba(255,255,255,0.85); }
.rcm-weight { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 11px; color: rgba(255,255,255,0.55); }
.rcm-bar { height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; }
.rcm-bar-fill { height: 100%; background: linear-gradient(90deg, #5eead4 0%, #a78bfa 100%); border-radius: 2px; }

.rcm-agent {
  display: flex; align-items: flex-start; gap: 10px; padding: 8px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.rcm-agent:last-child { border-bottom: 0; }
.rcm-agent-dot { width: 6px; height: 6px; border-radius: 50%; margin-top: 7px; flex-shrink: 0; }
.rcm-agent-body { flex: 1; }
.rcm-agent-name { font-size: 12.5px; font-weight: 600; color: rgba(255,255,255,0.85); }
.rcm-agent-sub { font-size: 11.5px; color: rgba(255,255,255,0.5); margin-top: 1px; }

.rcm-inbox-badge {
  display: none; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 6px;
  background: #5eead4; color: #0a0d12;
  border-radius: 9px; font-size: 10.5px; font-weight: 800;
  margin-left: auto;
}

.rcm-empty { font-size: 12px; color: rgba(255,255,255,0.45); padding: 6px 0; }

.rcm-actions { display: flex; flex-direction: column; gap: 6px; }
.rcm-action {
  appearance: none;
  font-family: inherit;
  text-align: left;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(94,234,212,0.18);
  color: rgba(255,255,255,0.9);
  font-size: 12.5px;
  font-weight: 600;
  padding: 9px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background .14s, border-color .14s, transform .08s;
  display: flex; align-items: center; gap: 8px;
}
.rcm-action::before {
  content: '→';
  color: #5eead4;
  font-weight: 700;
  font-size: 13px;
  transition: transform .14s;
}
.rcm-action:hover {
  background: rgba(94,234,212,0.10);
  border-color: rgba(94,234,212,0.45);
}
.rcm-action:hover::before { transform: translateX(2px); }
.rcm-action:active { transform: translateY(1px); }

/* ── Header actions group (info + collapse) ─────────────────────── */
.rcm-head-actions { display: inline-flex; gap: 4px; align-items: center; }
.rcm-info {
  width: 28px; height: 28px; border: 0; background: transparent;
  border-radius: 8px; color: rgba(255,255,255,0.45); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: background .15s, color .15s;
}
.rcm-info:hover { background: rgba(255,255,255,0.06); color: #5eead4; }
.rcm-info.rcm-info-active { background: rgba(94,234,212,0.16); color: #5eead4; }

/* ── Help panel ─────────────────────────────────────────────────── */
.rcm-help {
  background: linear-gradient(135deg, rgba(167,139,250,0.12) 0%, rgba(94,234,212,0.05) 100%);
  border: 1px solid rgba(94,234,212,0.28);
  border-radius: 10px;
  padding: 14px 14px 12px;
  margin-bottom: 10px;
}
.rcm-help[hidden] { display: none; }
.rcm-help-title {
  font-size: 11px; font-weight: 700; color: #5eead4;
  text-transform: uppercase; letter-spacing: 0.7px; margin-bottom: 8px;
}
.rcm-help-steps {
  list-style: decimal inside;
  font-size: 12px;
  color: rgba(255,255,255,0.78);
  line-height: 1.55;
  padding-left: 4px;
  margin: 0 0 10px;
}
.rcm-help-steps li { margin-bottom: 5px; }
.rcm-help-steps li b { color: #fff; font-weight: 700; }
.rcm-help-link {
  display: inline-block;
  font-size: 11.5px;
  font-weight: 600;
  color: #5eead4;
  text-decoration: none;
  border-bottom: 1px dotted rgba(94,234,212,0.4);
  padding-bottom: 1px;
}
.rcm-help-link:hover { color: #7df0dc; border-bottom-color: #7df0dc; }

/* ── Intents empty state (demo rows + hint) ─────────────────────── */
.rcm-intents-empty { display: flex; flex-direction: column; gap: 10px; }
.rcm-intents-demos { display: flex; flex-direction: column; gap: 6px; opacity: 0.45; pointer-events: none; }
.rcm-row-demo .rcm-bar-fill {
  background: linear-gradient(90deg, rgba(94,234,212,0.7) 0%, rgba(167,139,250,0.7) 100%);
}
.rcm-intents-hint {
  font-size: 11.5px;
  color: rgba(255,255,255,0.5);
  font-style: italic;
  line-height: 1.55;
  padding: 2px 0;
}
.rcm-intents-demo-badge {
  display: inline-block;
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(240,180,41,0.9);
  border: 1px solid rgba(240,180,41,0.35);
  border-radius: 999px;
  padding: 2px 8px;
  margin-bottom: 6px;
}
`;
