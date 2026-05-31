import * as Linking from 'expo-linking';
import { SyncService } from './SyncService';

/**
 * ShareReceiver — handles inbound URLs from the OS share-sheet.
 *
 * Two entry points feed this:
 *
 *   1. Android `android.intent.action.SEND` (text/plain) — declared in
 *      `app.json` under `expo.android.intentFilters`. The Expo runtime
 *      surfaces the shared text as the cold-start / warm-start URL via
 *      `Linking.getInitialURL()` + the 'url' event. No native code needed.
 *
 *   2. iOS Share Extension — a separate target that writes the shared URL
 *      to the App Group's shared `UserDefaults` (key "shared-payload") and
 *      then opens the host app via the `recome://share?url=...` URL scheme.
 *      The Share Extension Swift sources live under `ios-share-extension/`
 *      and require `expo prebuild` + adding the target in Xcode — managed
 *      Expo cannot declare a second target. See `ios-share-extension/README.md`.
 *
 * Once a URL reaches the host app the path is shared: parse, ingest as a
 * signal via the existing `/intelligence/signals` endpoint (same shape the
 * extension + PWA paste flow already use), then surface a confirmation.
 *
 * v1 keeps this dumb: every shared URL becomes a single page_view signal.
 * Topic / entity extraction is the cloud's job (SignalIngestion already
 * runs on the same input). The user gets a toast; the graph picks it up.
 */

export interface ShareInput {
  /** The URL or text the OS handed us. May be a bare URL, a tweet, an article excerpt, etc. */
  payload: string;
  /** Best-effort title; iOS surfaces NSExtensionItem.attributedContentText, Android rarely sends a title. */
  title?: string;
  /** ms epoch from the OS, falls back to Date.now(). */
  capturedAt?: number;
}

export interface ShareResult {
  ok: boolean;
  signalId?: string;
  /** When ok=false, a human-readable reason for the toast. */
  reason?: string;
}

const URL_REGEX = /\bhttps?:\/\/[^\s<>"']+/i;

export class ShareReceiver {
  private static listenerAttached = false;
  private static onShareCb: ((input: ShareInput) => void) | null = null;

  /**
   * Wire up the OS URL listener. Idempotent; safe to call from App.tsx on
   * every mount (e.g. after a navigation reset).
   */
  static attach(onShare: (input: ShareInput) => void): () => void {
    this.onShareCb = onShare;

    // Cold-start: the app was launched by the share. getInitialURL returns
    // the URL once, then null forever.
    Linking.getInitialURL()
      .then((url: string | null) => {
        if (url) this.handleIncomingUrl(url);
      })
      .catch(() => {
        /* nothing to do; user opened the app normally */
      });

    // Warm-start: the app was already running; the OS routed the share to us.
    if (!this.listenerAttached) {
      this.listenerAttached = true;
      Linking.addEventListener('url', ({ url }: { url: string }) => {
        this.handleIncomingUrl(url);
      });
    }

    return () => {
      this.onShareCb = null;
    };
  }

  /**
   * Parse one of the recognised inbound URL shapes:
   *   recome://share?url=<URL>&title=<TITLE>
   *   recome://share?text=<TEXT>
   *   https://recome.app/paste?url=<URL>&title=<TITLE>   (Android app link)
   *   <bare URL>                                          (Android SEND text/plain)
   */
  private static handleIncomingUrl(raw: string): void {
    if (!this.onShareCb) return;
    const parsed = parseShareUrl(raw);
    if (parsed) this.onShareCb(parsed);
  }

  /**
   * Ingest a shared payload as a page_view signal. The cloud's
   * SignalIngestion will run topic + entity extraction on the title; we
   * don't try to enrich on-device.
   */
  static async ingest(input: ShareInput): Promise<ShareResult> {
    const urlMatch = input.payload.match(URL_REGEX);
    const url = urlMatch ? urlMatch[0] : null;
    if (!url) {
      return { ok: false, reason: 'no_url_in_share' };
    }

    const sync = SyncService.getInstance();
    if (!(await sync.isAuthenticated())) {
      return { ok: false, reason: 'not_signed_in' };
    }

    // Build the signal payload using the same shape the extension sends.
    // SignalIngestion's schema accepts page_view with title + capturedAt;
    // we don't have dwellMs from a share, so omit it (server treats absent
    // as 0 and weights accordingly).
    const signal = {
      id: `share_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      kind: 'page_view' as const,
      platform: detectPlatform(url),
      url,
      title: input.title ?? deriveTitleFromPayload(input.payload, url),
      capturedAt: input.capturedAt ?? Date.now(),
    };

    try {
      // SyncService doesn't expose a generic POST today, so we go through
      // the cloud directly. A small ingestSignal() helper on SyncService
      // is the obvious follow-up if more entry points need this.
      const result = await postSignal(sync, signal);
      return result;
    } catch {
      return { ok: false, reason: 'ingest_failed' };
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function parseShareUrl(raw: string): ShareInput | null {
  // Bare URL (Android SEND text/plain often delivers this directly).
  if (/^https?:\/\//i.test(raw)) {
    return { payload: raw, capturedAt: Date.now() };
  }

  // recome:// scheme or https://recome.app/paste — same query param shape.
  try {
    const parsed = Linking.parse(raw);
    const q = (parsed.queryParams ?? {}) as Record<string, string | string[] | undefined>;
    const url = pickString(q.url);
    const text = pickString(q.text);
    const title = pickString(q.title);

    if (url) return { payload: url, ...(title ? { title } : {}), capturedAt: Date.now() };
    if (text) return { payload: text, ...(title ? { title } : {}), capturedAt: Date.now() };
  } catch {
    // Not a parseable URL; fall through.
  }
  return null;
}

function pickString(v: string | string[] | undefined): string | undefined {
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return undefined;
}

function detectPlatform(url: string): string {
  const host = safeHost(url);
  if (!host) return 'generic';
  if (host.includes('youtube.com') || host === 'youtu.be') return 'youtube';
  if (host.includes('reddit.com')) return 'reddit';
  if (host.includes('amazon.')) return 'amazon';
  if (host.includes('walmart.com')) return 'walmart';
  if (host.includes('ebay.')) return 'ebay';
  if (host.includes('twitter.com') || host === 'x.com') return 'twitter';
  if (host.includes('linkedin.com')) return 'linkedin';
  if (host.includes('tiktok.com')) return 'tiktok';
  if (host.includes('instagram.com')) return 'instagram';
  if (host.includes('facebook.com')) return 'facebook';
  return 'generic';
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function deriveTitleFromPayload(payload: string, url: string): string {
  // If the share text wraps the URL with surrounding context (e.g. a tweet
  // body), use the non-URL portion as a best-effort title.
  const stripped = payload.replace(url, '').trim();
  if (stripped && stripped.length <= 200) return stripped;
  return safeHost(url) ?? 'Shared link';
}

/**
 * Post a single signal via the /intelligence/signals batched endpoint.
 * Kept here (vs SyncService) because shares are the only mobile entry
 * point ingesting today — promotes when a second caller appears.
 */
async function postSignal(
  sync: SyncService,
  signal: {
    id: string;
    kind: 'page_view';
    platform: string;
    url: string;
    title: string;
    capturedAt: number;
  },
): Promise<ShareResult> {
  // We re-use the SyncService request internals by going through fetch +
  // the same access token. This avoids changing SyncService until a second
  // caller materialises (see comment above).
  const sync_ = sync as unknown as {
    accessToken: string | null;
    cloudUrl: string;
  };
  const token = sync_.accessToken;
  const cloud = sync_.cloudUrl;
  if (!token) return { ok: false, reason: 'not_signed_in' };

  const res = await fetch(`${cloud}/intelligence/signals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ signals: [signal] }),
  });
  if (!res.ok) return { ok: false, reason: `http_${res.status}` };
  const data = (await res.json()) as { results?: Array<{ signalId: string }> };
  const signalId = data.results?.[0]?.signalId;
  return signalId ? { ok: true, signalId } : { ok: false, reason: 'no_signal_returned' };
}
