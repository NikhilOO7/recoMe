import { v4 as uuidv4 } from 'uuid';

// ── IDs ───────────────────────────────────────────────────────────────────────

export function generateId(): string {
  return uuidv4();
}

export function now(): number {
  return Date.now();
}

// ── String normalisation ──────────────────────────────────────────────────────

export function normalizeTopicKey(raw: string): string {
  return raw.toLowerCase().trim().replace(/\s+/g, '_');
}

export function buildTopicKey(
  prefix: 'blocked' | 'interested' | 'one_time' | 'working' | 'searched',
  topic: string,
): string {
  return `${prefix}:${normalizeTopicKey(topic)}`;
}

export function parseTopicKey(key: string): { prefix: string; topic: string } {
  const idx = key.indexOf(':');
  if (idx === -1) return { prefix: '', topic: key };
  return { prefix: key.slice(0, idx), topic: key.slice(idx + 1) };
}

// ── Time helpers ──────────────────────────────────────────────────────────────

export function msAgo(ms: number): number {
  return Date.now() - ms;
}

export function olderThan(timestamp: number, durationMs: number): boolean {
  return Date.now() - timestamp > durationMs;
}

export function daysBetween(a: number, b: number): number {
  return Math.abs(a - b) / (1000 * 60 * 60 * 24);
}

export function startOfDay(timestamp: number = Date.now()): number {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// ── Math ──────────────────────────────────────────────────────────────────────

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function weightedAverage(pairs: Array<{ value: number; weight: number }>): number {
  const totalWeight = pairs.reduce((sum, p) => sum + Math.abs(p.weight), 0);
  if (totalWeight === 0) return 0;
  return pairs.reduce((sum, p) => sum + p.value * p.weight, 0) / totalWeight;
}

// ── Arrays ────────────────────────────────────────────────────────────────────

export function dedupe<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

export function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item);
    if (!acc[k]) acc[k] = [];
    acc[k]!.push(item);
    return acc;
  }, {});
}

export function topN<T>(arr: T[], n: number, score: (item: T) => number): T[] {
  return [...arr].sort((a, b) => score(b) - score(a)).slice(0, n);
}

// ── DOM helpers (content scripts only) ───────────────────────────────────────

export function waitForElement(selector: string, timeout = 5000): Promise<Element | null> {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

export function extractTextContent(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

// ── URL helpers ───────────────────────────────────────────────────────────────

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// ── Object helpers ────────────────────────────────────────────────────────────

export function omit<T extends object, K extends keyof T>(obj: T, ...keys: K[]): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) delete result[key];
  return result as Omit<T, K>;
}
