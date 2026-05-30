import type { PriceSnapshot } from './PriceStore';

/**
 * PriceChartData — prepares price history for sparkline chart rendering.
 */

export interface ChartPoint {
  x: number; // timestamp
  y: number; // price
  label: string; // formatted date
}

export interface ChartData {
  points: ChartPoint[];
  minPrice: number;
  maxPrice: number;
  currentPrice: number;
  currency: string;
  priceRange: number;
  /** Normalized Y values (0-1) for sparkline rendering */
  normalized: number[];
  /** SVG path string for sparkline */
  svgPath: string;
}

/**
 * Build chart data from price snapshots.
 *
 * @param snapshots - Raw price snapshots (chronological)
 * @param width - Chart width in px for SVG path
 * @param height - Chart height in px for SVG path
 */
export function buildChartData(
  snapshots: PriceSnapshot[],
  width: number = 200,
  height: number = 40,
): ChartData | null {
  if (snapshots.length === 0) return null;

  // Deduplicate by day (keep last snapshot per day)
  const byDay = new Map<string, PriceSnapshot>();
  for (const snap of snapshots) {
    const day = new Date(snap.timestamp).toISOString().slice(0, 10);
    byDay.set(day, snap);
  }

  const dailySnapshots = Array.from(byDay.values()).sort((a, b) => a.timestamp - b.timestamp);
  if (dailySnapshots.length === 0) return null;

  const prices = dailySnapshots.map((s) => s.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1; // Avoid division by zero
  const currentPrice = dailySnapshots[dailySnapshots.length - 1]!.price;
  const currency = dailySnapshots[dailySnapshots.length - 1]!.currency;

  const points: ChartPoint[] = dailySnapshots.map((s) => ({
    x: s.timestamp,
    y: s.price,
    label: formatDate(s.timestamp),
  }));

  const normalized = prices.map((p) => (p - minPrice) / priceRange);

  // Build SVG path
  const svgPath = buildSVGPath(normalized, width, height);

  return {
    points,
    minPrice,
    maxPrice,
    currentPrice,
    currency,
    priceRange,
    normalized,
    svgPath,
  };
}

/**
 * Build a summary string for a price history.
 */
export function priceSummary(snapshots: PriceSnapshot[]): string {
  if (snapshots.length === 0) return 'No price data';
  if (snapshots.length === 1) return `Current: ${formatPrice(snapshots[0]!)}`;

  const sorted = [...snapshots].sort((a, b) => a.timestamp - b.timestamp);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const min = sorted.reduce((m, s) => (s.price < m.price ? s : m), first);
  const max = sorted.reduce((m, s) => (s.price > m.price ? s : m), first);

  const change = last.price - first.price;
  const changePercent = (change / first.price) * 100;
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'unchanged';

  return [
    `Current: ${formatPrice(last)}`,
    `Low: ${formatPrice(min)} (${formatDate(min.timestamp)})`,
    `High: ${formatPrice(max)} (${formatDate(max.timestamp)})`,
    `Trend: ${direction} ${Math.abs(changePercent).toFixed(1)}% over ${sorted.length} observations`,
  ].join(' | ');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildSVGPath(normalized: number[], width: number, height: number): string {
  if (normalized.length === 0) return '';
  if (normalized.length === 1) {
    const y = height - normalized[0]! * height;
    return `M 0 ${y} L ${width} ${y}`;
  }

  const stepX = width / (normalized.length - 1);
  const parts: string[] = [];

  for (let i = 0; i < normalized.length; i++) {
    const x = i * stepX;
    const y = height - normalized[i]! * height; // Invert Y (SVG origin top-left)
    parts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }

  return parts.join(' ');
}

function formatPrice(snapshot: PriceSnapshot): string {
  return `${snapshot.currency}${snapshot.price.toFixed(2)}`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
