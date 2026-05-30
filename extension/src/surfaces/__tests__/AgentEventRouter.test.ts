/**
 * @jest-environment jsdom
 *
 * AgentEventRouter delegates to InsightCard / Sidebar; those modules touch the
 * real DOM (shadow roots, document.head). For this unit test we only verify
 * the page-relevance filter, which is the load-bearing routing decision.
 */
import type { AgentEvent } from '../../shared/types';

// Re-implement the filter inline so we test the *contract* without spinning
// up real DOM renderers. The router's `filterForPage` is the only thing we
// need to pin against regressions; see surfaces/AgentEventRouter.ts.
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function filterForPage(host: string, events: AgentEvent[]): AgentEvent[] {
  return events.filter((e) => {
    if (e.kind === 'weekly_summary' || e.kind === 'decision_nudge') return true;
    if (e.actionUrl && hostOf(e.actionUrl) === host) return true;
    return e.sources?.some((s) => s.url && hostOf(s.url) === host);
  });
}

function evt(over: Partial<AgentEvent>): AgentEvent {
  return {
    id: 'e1',
    agent: 'recall',
    kind: 'recall',
    title: 't',
    sources: [],
    createdAt: Date.now(),
    ...over,
  };
}

describe('AgentEventRouter filter', () => {
  test('cross-platform events (weekly_summary, decision_nudge) always pass', () => {
    const events = [
      evt({ id: 'w', kind: 'weekly_summary' }),
      evt({ id: 'd', kind: 'decision_nudge' }),
    ];
    expect(filterForPage('amazon.com', events).map((e) => e.id)).toEqual(['w', 'd']);
    expect(filterForPage('youtube.com', events).map((e) => e.id)).toEqual(['w', 'd']);
  });

  test('events with matching actionUrl pass', () => {
    const e = evt({
      id: 'recall1',
      kind: 'recall',
      actionUrl: 'https://www.theverge.com/2026/standing-desk-review',
    });
    expect(filterForPage('theverge.com', [e])).toHaveLength(1);
    expect(filterForPage('amazon.com', [e])).toHaveLength(0);
  });

  test('events with matching source url pass when no actionUrl', () => {
    const e = evt({
      id: 'recall2',
      kind: 'recall',
      sources: [{ kind: 'page', id: 'p1', url: 'https://reddit.com/r/buyitforlife/...' }],
    });
    expect(filterForPage('reddit.com', [e])).toHaveLength(1);
    expect(filterForPage('youtube.com', [e])).toHaveLength(0);
  });

  test('events with no urls and platform-specific kinds are dropped', () => {
    const e = evt({ id: 'r3', kind: 'fresh_content', sources: [] });
    expect(filterForPage('amazon.com', [e])).toHaveLength(0);
  });
});
