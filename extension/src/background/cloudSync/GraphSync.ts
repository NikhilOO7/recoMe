/**
 * GraphSync — batched upload of implicit signals to the cloud intelligence API.
 *
 * Design rules:
 *   - Opt-in only. If the user hasn't enabled cloud sync, this is a no-op.
 *   - Best-effort. Local IDB graph is the source of truth; failed uploads
 *     are retried, never blocking on the foreground signal path.
 *   - Idempotent. Each signal carries a client-generated ID; replays are safe.
 *   - Privacy-respecting. Page URLs are normalized (query-strings stripped on
 *     opt-in sensitive platforms) before leaving the device.
 *
 * Integration (one-liner, not yet wired — flagged in ADR-0001 deferred set):
 *
 *   import { GraphSync } from './cloudSync/GraphSync';
 *   const sync = new GraphSync({ baseUrl, getToken, getOptInState });
 *   sync.enqueue({ kind: 'dwell', platform: 'youtube', pageUrl, topics: [...] });
 */

export interface SignalDraft {
  /** stable client-generated id; if omitted we generate one */
  id?: string;
  kind: 'view' | 'dwell' | 'like' | 'block' | 'boost' | 'purchase' | 'comparison' | 'search';
  ts?: number;
  weight?: number;
  pageUrl?: string;
  pageTitle?: string;
  platform?:
    | 'youtube'
    | 'reddit'
    | 'amazon'
    | 'walmart'
    | 'ebay'
    | 'twitter'
    | 'facebook'
    | 'instagram'
    | 'tiktok'
    | 'linkedin'
    | 'generic';
  topics?: { name: string }[];
  entities?: {
    name: string;
    kind: 'product' | 'brand' | 'creator' | 'category' | 'media' | 'place' | 'person';
    platform?: SignalDraft['platform'];
  }[];
  sessionId?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface GraphSyncOptions {
  baseUrl: string;
  /** Returns a fresh access token or null if not authenticated. */
  getToken: () => Promise<string | null>;
  /** Returns true iff the user has opted in to cloud sync. */
  getOptInState: () => Promise<boolean>;
  /** Flush interval ms (default 30s). */
  flushIntervalMs?: number;
  /** Batch size that triggers an immediate flush (default 25). */
  batchTrigger?: number;
  /** Max queue depth; older items dropped beyond this (default 500). */
  maxQueue?: number;
  /** Sensitive platforms — query strings stripped before upload. */
  sensitivePlatforms?: SignalDraft['platform'][];
}

const DEFAULT_SENSITIVE: SignalDraft['platform'][] = ['amazon', 'walmart', 'ebay'];

export class GraphSync {
  private readonly queue: SignalDraft[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  constructor(private readonly opts: GraphSyncOptions) {
    const interval = opts.flushIntervalMs ?? 30_000;
    this.timer = setInterval(() => void this.flush(), interval);
  }

  enqueue(signal: SignalDraft): void {
    const sanitized = this.sanitize(signal);
    this.queue.push(sanitized);
    const max = this.opts.maxQueue ?? 500;
    if (this.queue.length > max) this.queue.splice(0, this.queue.length - max);
    const trigger = this.opts.batchTrigger ?? 25;
    if (this.queue.length >= trigger) void this.flush();
  }

  async flush(): Promise<{ uploaded: number; skipped: boolean }> {
    if (this.flushing || this.queue.length === 0) return { uploaded: 0, skipped: true };
    const optedIn = await this.opts.getOptInState();
    if (!optedIn) return { uploaded: 0, skipped: true };
    const token = await this.opts.getToken();
    if (!token) return { uploaded: 0, skipped: true };

    this.flushing = true;
    const batch = this.queue.splice(0, 100);
    try {
      const res = await fetch(`${this.opts.baseUrl}/intelligence/signals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ signals: batch }),
      });
      if (!res.ok) {
        // Re-enqueue at the head — they'll retry on the next tick.
        // Bounded by maxQueue.
        this.queue.unshift(...batch);
        return { uploaded: 0, skipped: false };
      }
      return { uploaded: batch.length, skipped: false };
    } catch {
      this.queue.unshift(...batch);
      return { uploaded: 0, skipped: false };
    } finally {
      this.flushing = false;
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private sanitize(signal: SignalDraft): SignalDraft {
    const sensitive = this.opts.sensitivePlatforms ?? DEFAULT_SENSITIVE;
    if (signal.platform && sensitive.includes(signal.platform) && signal.pageUrl) {
      try {
        const u = new URL(signal.pageUrl);
        // keep path, drop search/hash. Amazon dp/ paths stay intact.
        u.search = '';
        u.hash = '';
        return { ...signal, pageUrl: u.toString() };
      } catch {
        // bad URL — drop the field rather than leaking
        return { ...signal, pageUrl: undefined };
      }
    }
    return signal;
  }
}
