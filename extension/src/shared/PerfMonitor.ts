import { createLogger } from './Logger';

const log = createLogger('PerfMonitor');
const STORAGE_KEY = 'recome_perf_metrics';

export interface PerfMetrics {
  popup_load_ms: number[]; // Last 10 popup load times
  content_inject_ms: number[]; // Last 10 content script injection times
  message_roundtrip_ms: number[]; // Last 10 message roundtrip times
  memory_usage_mb: number[]; // Last 10 memory snapshots
  last_updated: number;
}

const DEFAULT_METRICS: PerfMetrics = {
  popup_load_ms: [],
  content_inject_ms: [],
  message_roundtrip_ms: [],
  memory_usage_mb: [],
  last_updated: 0,
};

const MAX_SAMPLES = 10;

export class PerfMonitor {
  private static instance: PerfMonitor;

  static getInstance(): PerfMonitor {
    if (!PerfMonitor.instance) PerfMonitor.instance = new PerfMonitor();
    return PerfMonitor.instance;
  }

  async record(metric: keyof Omit<PerfMetrics, 'last_updated'>, value: number): Promise<void> {
    try {
      const metrics = await this.getMetrics();
      metrics[metric].push(Math.round(value * 100) / 100);
      if (metrics[metric].length > MAX_SAMPLES) {
        metrics[metric] = metrics[metric].slice(-MAX_SAMPLES);
      }
      metrics.last_updated = Date.now();
      await chrome.storage.local.set({ [STORAGE_KEY]: metrics });
    } catch (err) {
      log.debug('Failed to record metric', err);
    }
  }

  async getMetrics(): Promise<PerfMetrics> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      return (result[STORAGE_KEY] as PerfMetrics) ?? { ...DEFAULT_METRICS };
    } catch {
      return { ...DEFAULT_METRICS };
    }
  }

  async getAverages(): Promise<Record<string, number>> {
    const metrics = await this.getMetrics();
    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    return {
      popup_load_ms: avg(metrics.popup_load_ms),
      content_inject_ms: avg(metrics.content_inject_ms),
      message_roundtrip_ms: avg(metrics.message_roundtrip_ms),
      memory_usage_mb: avg(metrics.memory_usage_mb),
    };
  }

  async clear(): Promise<void> {
    await chrome.storage.local.remove(STORAGE_KEY);
  }
}
