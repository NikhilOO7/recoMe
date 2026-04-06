import { useEffect, useState } from 'react';

interface ResearchTopic {
  name: string;
  type: string;
  platforms: string[];
  signalCount: number;
  lastSeen: number;
  weight: number;
}

function send(
  type: string,
  payload: unknown = null,
): Promise<{ success: boolean; data?: unknown }> {
  return chrome.runtime.sendMessage({ type, payload });
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const PLATFORM_ICONS: Record<string, string> = {
  youtube: '▶',
  amazon: '📦',
  twitter: '𝕏',
  facebook: '𝔽',
  instagram: '📸',
  ebay: '🛍',
  walmart: 'W',
  linkedin: 'in',
  reddit: 'R',
  unknown: '?',
};

export function ResearchTopics() {
  const [topics, setTopics] = useState<ResearchTopic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTopics();
  }, []);

  async function loadTopics() {
    setLoading(true);
    try {
      const graphRes = await send('GET_GRAPH_SUMMARY');
      const graph = graphRes.data as
        | {
            topInterests?: Array<{ name: string; type: string; weight: number }>;
            recentEntities?: Array<{ name: string; type: string; updated_at: number }>;
          }
        | undefined;

      if (!graph) {
        setLoading(false);
        return;
      }

      // Build research topics from top interests + recent entities
      const topicMap = new Map<string, ResearchTopic>();

      // Add top interests
      for (const interest of graph.topInterests ?? []) {
        const key = interest.name.toLowerCase();
        if (!topicMap.has(key)) {
          topicMap.set(key, {
            name: interest.name,
            type: interest.type,
            platforms: [],
            signalCount: 0,
            lastSeen: 0,
            weight: interest.weight,
          });
        }
      }

      // Enrich with recency from recent entities
      for (const entity of graph.recentEntities ?? []) {
        const key = entity.name.toLowerCase();
        const existing = topicMap.get(key);
        if (existing) {
          existing.lastSeen = Math.max(existing.lastSeen, entity.updated_at);
          existing.signalCount++;
        } else {
          topicMap.set(key, {
            name: entity.name,
            type: entity.type,
            platforms: [],
            signalCount: 1,
            lastSeen: entity.updated_at,
            weight: 0.3,
          });
        }
      }

      // Get platform data from stats
      const statsRes = await send('GET_DB_STATS');
      const dbStats = statsRes.data as
        | {
            active_entries?: Array<{
              topic_key: string;
              context_bucket: string;
              value: { strength?: number };
            }>;
          }
        | undefined;

      // Map context buckets to platforms for each topic
      for (const entry of dbStats?.active_entries ?? []) {
        const topicName = entry.topic_key
          .replace(/^(blocked|interested|entity):/, '')
          .toLowerCase();
        const topic = topicMap.get(topicName);
        if (topic && entry.context_bucket) {
          const platform = entry.context_bucket.split(':')[0] ?? 'unknown';
          if (!topic.platforms.includes(platform)) {
            topic.platforms.push(platform);
          }
          topic.signalCount++;
        }
      }

      // Sort by weight (relevance) then recency
      const sorted = [...topicMap.values()]
        .sort((a, b) => b.weight - a.weight || b.lastSeen - a.lastSeen)
        .slice(0, 8);

      setTopics(sorted);
    } catch {
      // Silently fail
    }
    setLoading(false);
  }

  if (loading) return null;
  if (topics.length === 0) return null;

  return (
    <div className="research-topics">
      <h3 className="section-title">Active Research</h3>
      <div className="research-topics-list">
        {topics.map((topic) => (
          <div key={topic.name} className="research-topic-card">
            <div className="research-topic-main">
              <span className="research-topic-name">{topic.name}</span>
              <span className="research-topic-type">{topic.type}</span>
            </div>
            <div className="research-topic-meta">
              {topic.platforms.length > 0 && (
                <span className="research-topic-platforms">
                  {topic.platforms.map((p) => PLATFORM_ICONS[p] ?? '?').join(' ')}
                </span>
              )}
              {topic.signalCount > 0 && (
                <span className="research-topic-signals">
                  {topic.signalCount} signal{topic.signalCount !== 1 ? 's' : ''}
                </span>
              )}
              {topic.lastSeen > 0 && (
                <span className="research-topic-time">{timeAgo(topic.lastSeen)}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
