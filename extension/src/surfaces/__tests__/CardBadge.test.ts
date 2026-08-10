/**
 * @jest-environment jsdom
 */
import { renderBadge, clearAllBadges } from '../renderers/CardBadge';

function host(): HTMLElement {
  const el = document.createElement('div');
  el.style.width = '200px';
  el.style.height = '200px';
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  clearAllBadges();
  document.body.innerHTML = '';
  document.getElementById('recome-badge-style')?.remove();
});

describe('CardBadge', () => {
  test('renders a relevant-verdict pill with the score', () => {
    const el = host();
    renderBadge({
      el,
      verdict: 'relevant',
      score: 0.89,
      reason: 'matches your standing-desk research',
    });
    const badge = el.querySelector('.recome-card-badge') as HTMLElement;
    expect(badge).not.toBeNull();
    expect(badge.textContent).toContain('Relevant');
    expect(badge.textContent).toContain('0.89');
    expect(el.querySelector('.recome-reasoning')?.textContent).toContain('standing-desk');
  });

  test('filtered verdict dims the card and omits the score', () => {
    const el = host();
    renderBadge({ el, verdict: 'filtered', score: 0, reason: 'guardian blocked' });
    expect(el.classList.contains('recome-filtered')).toBe(true);
    const badge = el.querySelector('.recome-card-badge') as HTMLElement;
    expect(badge.textContent).toContain('Filtered');
    expect(badge.textContent).not.toMatch(/0\.\d+/);
  });

  test('re-rendering replaces the previous badge and reasoning', () => {
    const el = host();
    renderBadge({ el, verdict: 'caution', score: 0.5, reason: 'first' });
    renderBadge({ el, verdict: 'relevant', score: 0.9, reason: 'second' });
    expect(el.querySelectorAll('.recome-card-badge')).toHaveLength(1);
    expect(el.querySelector('.recome-card-badge')?.textContent).toContain('Relevant');
    expect(el.querySelector('.recome-reasoning')?.textContent).toBe('second');
    expect(el.classList.contains('recome-filtered')).toBe(false);
  });

  test('alwaysShowReason adds the always-visible class', () => {
    const el = host();
    renderBadge({ el, verdict: 'neutral', score: 0.2, reason: 'nada', alwaysShowReason: true });
    expect(el.classList.contains('recome-show-reason')).toBe(true);
  });

  test('feedback actions render only with matched topics and a callback', () => {
    const el = host();
    renderBadge({ el, verdict: 'relevant', score: 0.8, reason: 'r', matchedTopics: [] });
    expect(el.querySelector('.recome-feedback')).toBeNull();

    const el2 = host();
    renderBadge({
      el: el2,
      verdict: 'relevant',
      score: 0.8,
      reason: 'r',
      matchedTopics: ['standing desks'],
      onFeedback: () => undefined,
    });
    expect(el2.querySelector('.recome-feedback')).not.toBeNull();
    expect(el2.querySelectorAll('.recome-fb-btn')).toHaveLength(2);
  });

  test('boost click fires the callback and swaps actions for a confirmation', () => {
    const el = host();
    const calls: string[] = [];
    renderBadge({
      el,
      verdict: 'relevant',
      score: 0.8,
      reason: 'r',
      matchedTopics: ['standing desks'],
      onFeedback: (k) => calls.push(k),
    });
    (el.querySelector('.recome-fb-btn') as HTMLButtonElement).click();
    expect(calls).toEqual(['boost']);
    expect(el.querySelector('.recome-feedback')).toBeNull();
    expect(el.querySelector('.recome-fb-done')?.textContent).toContain('standing desks');
  });

  test('block click fires the callback, dims the card, and confirms', () => {
    const el = host();
    const calls: string[] = [];
    renderBadge({
      el,
      verdict: 'neutral',
      score: 0.4,
      reason: 'r',
      matchedTopics: ['standing desks'],
      onFeedback: (k) => calls.push(k),
    });
    (el.querySelector('.recome-fb-block') as HTMLButtonElement).click();
    expect(calls).toEqual(['block']);
    expect(el.classList.contains('recome-filtered')).toBe(true);
    expect(el.querySelector('.recome-fb-done')?.textContent).toContain('won’t drive suggestions');
  });

  test('filtered verdict never shows feedback actions', () => {
    const el = host();
    renderBadge({
      el,
      verdict: 'filtered',
      score: 0,
      reason: 'claims',
      matchedTopics: ['x'],
      onFeedback: () => undefined,
    });
    expect(el.querySelector('.recome-feedback')).toBeNull();
  });

  test('clearAllBadges removes badges and host marker classes', () => {
    const el1 = host();
    const el2 = host();
    renderBadge({ el: el1, verdict: 'relevant', score: 0.7, reason: 'a' });
    renderBadge({ el: el2, verdict: 'filtered', score: 0, reason: 'b' });
    clearAllBadges();
    expect(document.querySelectorAll('.recome-card-badge')).toHaveLength(0);
    expect(document.querySelectorAll('.recome-reasoning')).toHaveLength(0);
    expect(el1.classList.contains('recome-card-host')).toBe(false);
    expect(el2.classList.contains('recome-filtered')).toBe(false);
  });
});
