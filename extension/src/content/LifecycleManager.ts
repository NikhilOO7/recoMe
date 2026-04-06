/**
 * LifecycleManager — centralized cleanup for SPA navigation.
 *
 * Owns all disposable resources created during a page lifecycle:
 * adapters, observers, event listeners, timers, and trackers.
 * On SPA navigation, `teardown()` is called to destroy everything
 * before re-bootstrapping.
 */

import { createLogger } from '@shared/Logger';

const log = createLogger('Lifecycle');

type Disposable = { destroy(): void } | { disconnect(): void } | (() => void);

export class LifecycleManager {
  private timers: ReturnType<typeof setTimeout>[] = [];
  private disposables: Disposable[] = [];
  private eventCleanups: Array<() => void> = [];

  /** Track a setTimeout so it can be cleared on teardown */
  trackTimeout(fn: () => void, delay: number): ReturnType<typeof setTimeout> {
    const handle = setTimeout(fn, delay);
    this.timers.push(handle);
    return handle;
  }

  /** Register a disposable object (adapter, observer, tracker) */
  register(disposable: Disposable): void {
    this.disposables.push(disposable);
  }

  /** Register an event listener that should be removed on teardown */
  trackEventListener<K extends keyof WindowEventMap>(
    target: EventTarget,
    event: K | string,
    handler: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void {
    target.addEventListener(event, handler, options);
    this.eventCleanups.push(() => target.removeEventListener(event, handler, options));
  }

  /** Tear down all tracked resources — called on SPA navigation */
  teardown(): void {
    // Clear timers
    for (const h of this.timers) clearTimeout(h);
    this.timers.length = 0;

    // Remove tracked event listeners
    for (const cleanup of this.eventCleanups) {
      try {
        cleanup();
      } catch {
        /* listener already removed */
      }
    }
    this.eventCleanups.length = 0;

    // Destroy disposables (adapters, trackers, observers)
    for (const d of this.disposables) {
      try {
        if (typeof d === 'function') {
          d();
        } else if ('destroy' in d) {
          d.destroy();
        } else if ('disconnect' in d) {
          d.disconnect();
        }
      } catch (err) {
        log.warn('Disposable cleanup error', err);
      }
    }
    this.disposables.length = 0;

    log.debug('Lifecycle teardown complete');
  }
}

/** Singleton lifecycle manager for the current page */
let instance: LifecycleManager | null = null;

export function getLifecycle(): LifecycleManager {
  if (!instance) instance = new LifecycleManager();
  return instance;
}

/** Reset the lifecycle manager (creates a fresh instance after teardown) */
export function resetLifecycle(): LifecycleManager {
  if (instance) instance.teardown();
  instance = new LifecycleManager();
  return instance;
}
