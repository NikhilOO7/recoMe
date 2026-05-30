/**
 * Page-level dwell trigger. After DWELL_MS on a page, emit a `view` signal
 * with the current PageExtract. Cancels on:
 *   - tab hidden (visibilitychange)
 *   - navigation (caller restarts)
 *   - SW context invalidation
 */

import { sendMessage, type CaptureSignalPayload } from '@shared/messages';
import { getSessionId } from '../SessionId';
import type { PlatformCapture } from '../PlatformCapture';

const DWELL_MS = 10_000;

export class DwellSignal {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private fired = false;
  private visibilityListener: (() => void) | null = null;

  constructor(private capture: PlatformCapture) {}

  start(): void {
    this.cancel();
    if (document.hidden) {
      this.visibilityListener = () => {
        if (!document.hidden && !this.fired) this.arm();
      };
      document.addEventListener('visibilitychange', this.visibilityListener);
      return;
    }
    this.arm();
  }

  private arm(): void {
    this.timer = setTimeout(() => this.fire(), DWELL_MS);
  }

  cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.visibilityListener) {
      document.removeEventListener('visibilitychange', this.visibilityListener);
      this.visibilityListener = null;
    }
    this.fired = false;
  }

  private async fire(): Promise<void> {
    if (this.fired) return;
    this.fired = true;

    const ex = this.capture.extract();
    if (!ex || (ex.topics.length === 0 && ex.entities.length === 0)) return;

    await sendMessage<CaptureSignalPayload, unknown>('CAPTURE_SIGNAL', {
      signal: {
        kind: 'view',
        platform: this.capture.platform,
        pageUrl: ex.pageUrl,
        pageTitle: ex.pageTitle,
        topics: ex.topics,
        entities: ex.entities,
        sessionId: getSessionId(),
        metadata: {
          pageKind: ex.pageKind ?? this.capture.pageKind(),
          ...(ex.contentId ? { contentId: ex.contentId } : {}),
          source: 'dwell',
        },
      },
    });
  }
}
