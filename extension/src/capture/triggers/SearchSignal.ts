/**
 * Search trigger. Watches:
 *   - URL query params (q, query, k, search_query, keyword, field-keywords…)
 *   - form submits on inputs with type=search / name in {q, query, …}
 *   - SPA navigation (pushState / replaceState / popstate)
 *
 * On a new query, emits a `search` signal with the raw query as a topic.
 */

import { sendMessage, type CaptureSignalPayload } from '@shared/messages';
import { getSessionId } from '../SessionId';
import type { Platform } from '@shared/types';

const SEARCH_PARAMS = [
  'q',
  'query',
  'search_query',
  'k',
  'search',
  'keyword',
  'keywords',
  'term',
  'text',
  'field-keywords',
];

function readQueryFromUrl(): string {
  const p = new URLSearchParams(location.search);
  for (const key of SEARCH_PARAMS) {
    const v = p.get(key)?.trim();
    if (v && v.length >= 2) return v;
  }
  return '';
}

export class SearchSignal {
  private last = '';
  private installed = false;

  constructor(private platform: Platform) {}

  start(): void {
    if (this.installed) return;
    this.installed = true;

    void this.check();

    // SPA nav hooks
    const origPush = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);
    history.pushState = (...args: Parameters<typeof history.pushState>) => {
      origPush(...args);
      setTimeout(() => void this.check(), 250);
    };
    history.replaceState = (...args: Parameters<typeof history.replaceState>) => {
      origReplace(...args);
      setTimeout(() => void this.check(), 250);
    };
    window.addEventListener('popstate', () => setTimeout(() => void this.check(), 250));

    // Form submit hook
    document.addEventListener(
      'submit',
      (e) => {
        const form = e.target as HTMLFormElement | null;
        if (!form?.querySelector) return;
        const input = form.querySelector(
          'input[type="search"], input[name="q"], input[name="query"], input[name="search_query"], input[name="k"], input[name="keyword"]',
        ) as HTMLInputElement | null;
        const v = input?.value?.trim();
        if (v && v.length >= 2) void this.emit(v);
      },
      true,
    );
  }

  private async check(): Promise<void> {
    const q = readQueryFromUrl();
    if (q) await this.emit(q);
  }

  private async emit(query: string): Promise<void> {
    if (query === this.last) return;
    this.last = query;
    await sendMessage<CaptureSignalPayload, unknown>('CAPTURE_SIGNAL', {
      signal: {
        kind: 'search',
        platform: this.platform,
        pageUrl: location.href,
        pageTitle: document.title,
        topics: [{ name: query.toLowerCase() }],
        sessionId: getSessionId(),
        metadata: { source: 'search' },
      },
    });
  }
}
