/**
 * @jest-environment jsdom
 *
 * Pins the isolation invariants that keep InsightCard geometry-proof against
 * host-page CSS (the 2026-08-13 full-viewport-stretch regression):
 *   1. the host's geometry is inline (fixed position, fixed width, never
 *      anchored left AND right), and
 *   2. cards render inside a shadow root, out of reach of page stylesheets.
 */
import type { AgentEvent } from '../../shared/types';

jest.mock('@shared/messages', () => ({
  sendMessage: jest.fn(async () => ({ success: true, data: undefined })),
}));
jest.mock('@shared/constants', () => ({
  getWebAppUrl: jest.fn(async () => 'https://recome-web.vercel.app'),
}));

import { renderEvents, clearInsights } from '../InsightCard';
import { sendMessage } from '@shared/messages';

function evt(over: Partial<AgentEvent>): AgentEvent {
  return {
    id: 'e1',
    agent: 'synthesist',
    kind: 'weekly_summary',
    title: 'Your week in attention: 1 open thread',
    body: 'New this week: espresso.',
    sources: [],
    createdAt: 1755072000000,
    ...over,
  } as AgentEvent;
}

afterEach(() => {
  clearInsights();
  jest.clearAllMocks();
});

describe('InsightCard isolation', () => {
  test('host geometry is inline: fixed, width-capped, never left+right anchored', async () => {
    await renderEvents([evt({})]);
    const host = document.getElementById('recome-insight-host')!;
    expect(host.style.position).toBe('fixed');
    expect(host.style.width).toBe('380px');
    // The regression: left+right anchoring stretched the card across the page.
    expect(host.style.right).toBe('');
  });

  test('cards live inside a shadow root, not the light DOM', async () => {
    await renderEvents([evt({})]);
    const host = document.getElementById('recome-insight-host')!;
    expect(host.shadowRoot).not.toBeNull();
    const card = host.shadowRoot!.querySelector('.card')!;
    expect(card).not.toBeNull();
    expect(card.querySelector('.title')!.textContent).toContain('open thread');
    expect(card.querySelector('.primary')!.textContent).toBe('Read summary');
    // Light DOM stays empty — nothing for page CSS to grab.
    expect(host.childElementCount).toBe(0);
  });

  test('shows at most 2 unseen events; seen events never render', async () => {
    await renderEvents([
      evt({ id: 'a' }),
      evt({ id: 'b' }),
      evt({ id: 'c' }),
      evt({ id: 'seen', seenAt: 1755072000000 }),
    ]);
    const shadow = document.getElementById('recome-insight-host')!.shadowRoot!;
    expect(shadow.querySelectorAll('.card')).toHaveLength(2);
  });

  test('a host built without a shadow root (older version) is rebuilt', async () => {
    const stale = document.createElement('div');
    stale.id = 'recome-insight-host';
    document.body.appendChild(stale);
    await renderEvents([evt({})]);
    const host = document.getElementById('recome-insight-host')!;
    expect(host).not.toBe(stale);
    expect(host.shadowRoot).not.toBeNull();
  });

  test('dismiss sends MARK_SEEN for the event', async () => {
    await renderEvents([evt({ id: 'dismiss-me' })]);
    const shadow = document.getElementById('recome-insight-host')!.shadowRoot!;
    (shadow.querySelector('.dismiss') as HTMLButtonElement).click();
    await Promise.resolve();
    expect(sendMessage).toHaveBeenCalledWith('MARK_SEEN', { eventId: 'dismiss-me' });
  });
});
