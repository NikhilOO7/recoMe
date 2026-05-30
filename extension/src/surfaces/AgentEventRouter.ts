/**
 * AgentEventRouter — listens for INBOX_UPDATED broadcasts from background and
 * fans events out to:
 *   - the right-sidebar (badge + agent status update)
 *   - the in-page InsightCard renderer (proactive cards)
 *
 * On first install, pulls the cached inbox via GET_INBOX so the surfaces have
 * something to render before the first cloud poll completes.
 */

import { sendMessage, type GetInboxPayload, type InboxUpdatedPayload } from '@shared/messages';
import type { AgentEvent } from '@shared/types';
import { renderEvents, clearInsights } from './InsightCard';
import type { Sidebar } from './Sidebar';
import { createLogger } from '@shared/Logger';

const log = createLogger('AgentEventRouter');

export class AgentEventRouter {
  private listener: ((m: unknown) => void) | null = null;

  constructor(private sidebar: Sidebar) {}

  async start(): Promise<void> {
    // Hydrate immediately from the background cache.
    const res = await sendMessage<GetInboxPayload, { events: AgentEvent[] }>('GET_INBOX', {});
    if (res.success && res.data) {
      this.dispatch(res.data.events);
    }

    // Listen for pushes from background poller.
    this.listener = (message: unknown): void => {
      const m = message as { type?: string; payload?: InboxUpdatedPayload };
      if (m?.type === 'INBOX_UPDATED' && m.payload) {
        this.dispatch(m.payload.events, m.payload.unseenCount);
      }
    };
    chrome.runtime.onMessage.addListener(this.listener);
  }

  stop(): void {
    if (this.listener) {
      chrome.runtime.onMessage.removeListener(this.listener);
      this.listener = null;
    }
    clearInsights();
  }

  private dispatch(events: AgentEvent[], unseenCount?: number): void {
    log.debug(`dispatch ${events.length} events`);
    const filtered = this.filterForPage(events);
    void renderEvents(filtered);
    const unseen = unseenCount ?? events.filter((e) => !e.seenAt).length;
    this.sidebar.onInboxUpdate(unseen);
  }

  /**
   * Filter to events relevant to this page. v1 heuristic:
   *   - same host as actionUrl, OR
   *   - any source url matches the current host, OR
   *   - kind is platform-agnostic (weekly_summary, decision_nudge)
   * Anything that doesn't match still appears in the popup inbox.
   */
  private filterForPage(events: AgentEvent[]): AgentEvent[] {
    const host = location.hostname.replace(/^www\./, '');
    return events.filter((e) => {
      if (e.kind === 'weekly_summary' || e.kind === 'decision_nudge') return true;
      if (e.actionUrl && hostOf(e.actionUrl) === host) return true;
      return e.sources?.some((s) => s.url && hostOf(s.url) === host);
    });
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
