import { WORK_HOURS, WORK_DAYS, PLATFORM_CONTEXT_MAP, LEARNING_DOMAINS } from '@shared/constants';
import { extractDomain } from '@shared/utils';
import { createLogger } from '@shared/Logger';
import type { ContextBucket, ContextState, Platform } from '@shared/types';

const log = createLogger('ContextDetector');

interface DetectionSignal {
  context: ContextBucket;
  confidence: number;
  method: ContextState['detection_method'];
}

export class ContextDetector {
  /**
   * Detect the current context from time, active platform, and tab URL.
   */
  detect(platform: Platform, url?: string): ContextState {
    const signals: DetectionSignal[] = [];

    // Platform signal (strong)
    const platformCtx = PLATFORM_CONTEXT_MAP[platform];
    if (platform !== 'unknown') {
      signals.push({ context: platformCtx, confidence: 0.85, method: 'platform' });
    }

    // Time-based signal
    const timeCtx = this.detectFromTime();
    if (timeCtx) signals.push(timeCtx);

    // URL / domain signal
    if (url) {
      const urlCtx = this.detectFromUrl(url);
      if (urlCtx) signals.push(urlCtx);
    }

    if (signals.length === 0) {
      return this.makeState('general', 0.5, 'time');
    }

    // Pick highest-confidence signal
    const best = signals.reduce((a, b) => (a.confidence >= b.confidence ? a : b));

    log.debug(`Detected context: ${best.context} (${best.method}, ${best.confidence})`);
    return this.makeState(best.context, best.confidence, best.method);
  }

  private detectFromTime(): DetectionSignal | null {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0=Sun, 1=Mon … 6=Sat

    const isWorkDay = WORK_DAYS.includes(day);
    const isWorkHour = hour >= WORK_HOURS.start && hour < WORK_HOURS.end;

    if (isWorkDay && isWorkHour) {
      return { context: 'work', confidence: 0.7, method: 'time' };
    }

    // Evening / weekend → entertainment
    if (!isWorkDay || hour >= WORK_HOURS.end || hour < 8) {
      return { context: 'entertainment', confidence: 0.5, method: 'time' };
    }

    return null;
  }

  private detectFromUrl(url: string): DetectionSignal | null {
    try {
      const domain = extractDomain(url);
      const lowerUrl = url.toLowerCase();

      // Check for learning domains
      const isLearning = LEARNING_DOMAINS.some((d) => domain.includes(d) || lowerUrl.includes(d));
      if (isLearning) {
        return { context: 'learning', confidence: 0.8, method: 'content' };
      }

      return null;
    } catch {
      return null;
    }
  }

  private makeState(
    context: ContextBucket,
    confidence: number,
    method: ContextState['detection_method'],
  ): ContextState {
    return {
      current: context,
      detected_at: Date.now(),
      detection_method: method,
      confidence,
    };
  }
}
