// ── Persistent Stats ──────────────────────────────────────────────────────────
// All counters are stored in chrome.storage.local so they survive SW restarts.

const STATS_KEY = 'recome_stats';

interface StoredStats {
  total_hidden: number;
  hidden_today: number;
  today_date: string;
  total_boosted: number;
  blocked_topics: Record<string, number>;
}

function todayStr(): string {
  return new Date().toDateString();
}

async function load(): Promise<StoredStats> {
  const result = await chrome.storage.local.get(STATS_KEY);
  const stored = result[STATS_KEY] as StoredStats | undefined;
  const today = todayStr();

  if (!stored) {
    return {
      total_hidden: 0,
      hidden_today: 0,
      today_date: today,
      total_boosted: 0,
      blocked_topics: {},
    };
  }

  // Reset daily count on new day
  if (stored.today_date !== today) {
    return { ...stored, hidden_today: 0, today_date: today };
  }

  return stored;
}

async function save(stats: StoredStats): Promise<void> {
  await chrome.storage.local.set({ [STATS_KEY]: stats });
}

export async function incrementHidden(): Promise<void> {
  const s = await load();
  s.total_hidden++;
  s.hidden_today++;
  await save(s);
}

export async function incrementBoosted(): Promise<void> {
  const s = await load();
  s.total_boosted++;
  await save(s);
}

export async function recordBlockedTopic(topic: string): Promise<void> {
  const s = await load();
  s.blocked_topics[topic] = (s.blocked_topics[topic] ?? 0) + 1;
  await save(s);
}

export async function readStats(): Promise<StoredStats> {
  return load();
}
