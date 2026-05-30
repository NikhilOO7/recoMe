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
}

export class Sidebar {
  private refs: SidebarRefs | null = null;
  private collapsed = false;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

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
    this.refs.nodesLine.textContent = `Interest Graph: ${intents.length} top topic${intents.length === 1 ? '' : 's'} loaded`;
    this.refs.sessionLine.textContent = `Session: cloud · ${latency}ms latency`;

    this.renderIntents(intents);
    this.renderAgents(agents, unseen);
    this.onInboxUpdate(unseen);
  }

  private renderSignedOut(): void {
    if (!this.refs) return;
    this.refs.statusDot.style.background = '#94a3b8';
    this.refs.statusLabel.textContent = 'Signed out';
    this.refs.nodesLine.textContent = '';
    this.refs.sessionLine.textContent = 'Sign in on recome.app';
    this.refs.intentsList.innerHTML = '';
    this.refs.agentsList.innerHTML = '';
  }

  private renderIntents(intents: IntentRow[]): void {
    if (!this.refs) return;
    this.refs.intentsList.innerHTML = '';
    if (intents.length === 0) {
      this.refs.intentsList.appendChild(emptyState('Capture a few pages to start your graph.'));
      return;
    }
    for (const i of intents.slice(0, 5)) {
      const row = document.createElement('div');
      row.className = 'rcm-row';
      const w = Math.min(1, Math.max(0, i.strength));
      row.innerHTML = `
        <div class="rcm-row-head">
          <span class="rcm-topic">${escapeHtml(i.topicName ?? i.topicNormalizedName)}</span>
          <span class="rcm-weight">${w.toFixed(2)}</span>
        </div>
        <div class="rcm-bar"><div class="rcm-bar-fill" style="width:${(w * 100).toFixed(0)}%"></div></div>
      `;
      this.refs.intentsList.appendChild(row);
    }
  }

  private renderAgents(agents: AgentInfo[], unseen: number): void {
    if (!this.refs) return;
    this.refs.agentsList.innerHTML = '';
    if (agents.length === 0) {
      this.refs.agentsList.appendChild(emptyState('No agents subscribed yet.'));
      return;
    }
    for (const a of agents) {
      const row = document.createElement('div');
      row.className = 'rcm-agent';
      const paused = !!a.subscription.pausedAt || !a.subscription.enabled;
      const dotColor = paused ? '#94a3b8' : '#10b981';
      const subText = paused
        ? 'Paused'
        : a.name === 'recall' && unseen > 0
          ? `${unseen} new insight${unseen === 1 ? '' : 's'} ready`
          : 'Watching your graph';
      row.innerHTML = `
        <span class="rcm-agent-dot" style="background:${dotColor}"></span>
        <div class="rcm-agent-body">
          <div class="rcm-agent-name">${escapeHtml(a.displayName)}</div>
          <div class="rcm-agent-sub">${escapeHtml(subText)}</div>
        </div>
      `;
      this.refs.agentsList.appendChild(row);
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
        <button class="rcm-collapse" title="Collapse">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
      <div class="rcm-body">
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

    collapseBtn.addEventListener('click', () => {
      this.collapsed = !this.collapsed;
      root.classList.toggle('rcm-collapsed', this.collapsed);
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
    };
  }
}

function emptyState(text: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = 'rcm-empty';
  d.textContent = text;
  return d;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;',
  );
}

const SIDEBAR_CSS = `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; padding: 0; }
.rcm {
  background: linear-gradient(180deg, #0d1a30 0%, #060d1a 100%);
  border: 1px solid rgba(94,234,212,0.18);
  border-radius: 14px;
  color: #fff;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
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
.rcm-bar-fill { height: 100%; background: linear-gradient(90deg, #5eead4 0%, #2356e8 100%); border-radius: 2px; }

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
  background: #5eead4; color: #060d1a;
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
`;
