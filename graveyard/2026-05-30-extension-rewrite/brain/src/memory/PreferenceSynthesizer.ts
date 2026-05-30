import { createLogger } from '@shared/Logger';
import { buildTopicKey, normalizeTopicKey, now } from '@shared/utils';
import { getLLMClient } from '@agent/llm/LLMClient';
import type { MemoryStore } from './storage/MemoryStore';
import type { MemoryEvent } from '@shared/types';

const log = createLogger('PreferenceSynthesizer');

const SYNTHESIS_STORAGE_KEY = 'recome_last_synthesis';

interface SynthesisResult {
  newInterests: string[];
  fadingInterests: string[];
  suggestedRelations: Array<{ from: string; to: string; reason: string }>;
}

/**
 * Once-daily AI-powered preference synthesis.
 *
 * Gathers the last 24h of implicit + explicit signals, sends a compressed
 * summary to the LLM, and writes inferred preferences back to memory.
 *
 * Falls back gracefully when no LLM is configured — simply skips the run.
 */
export class PreferenceSynthesizer {
  constructor(private readonly store: MemoryStore) {}

  /**
   * Run the daily synthesis pass. Should be called by chrome.alarms.
   * Returns true if synthesis ran, false if skipped (no LLM or no data).
   */
  async run(userId: string): Promise<boolean> {
    // Skip if already ran today
    if (await this.ranToday()) {
      log.debug('Synthesis already ran today — skipping');
      return false;
    }

    const llm = getLLMClient();
    if (!(await llm.isConfigured())) {
      log.debug('No LLM configured — skipping synthesis');
      return false;
    }

    // Gather last 24h of events
    const since = now() - 24 * 60 * 60 * 1000;
    const recentEvents = await this.store.getEventsAfter(since);

    if (recentEvents.length < 3) {
      log.debug(`Only ${recentEvents.length} events in last 24h — skipping synthesis`);
      await this.markRan();
      return false;
    }

    // Compress events into a summary for the LLM
    const summary = this.compressEvents(recentEvents);

    const prompt = `Analyze these browsing/shopping signals from the last 24 hours and identify preference patterns.

${summary}

Return ONLY a JSON object on one line, no explanation:
{"newInterests":["topic1","topic2"],"fadingInterests":["topic3"],"suggestedRelations":[{"from":"topic_a","to":"topic_b","reason":"brief reason"}]}

Rules:
- newInterests: topics the user seems newly interested in (2-5 items, lower_snake_case)
- fadingInterests: topics the user seems to be losing interest in (0-3 items)
- suggestedRelations: non-obvious connections between topics (0-2 items)
- Be conservative — only include patterns you're confident about
- Use lower_snake_case for all topic names`;

    try {
      const response = await llm.call(prompt, { maxTokens: 300 });
      if (!response) {
        log.warn('LLM returned null during synthesis — will retry next alarm');
        return false;
      }

      const parsed = this.parseResponse(response);
      if (!parsed) {
        log.warn('Failed to parse synthesis response — will retry next alarm');
        return false;
      }

      // Write new interests as soft memory entries
      for (const interest of parsed.newInterests) {
        const topicKey = buildTopicKey('interested', normalizeTopicKey(interest));
        const existing = await this.store.getEntryByTopic(userId, topicKey);
        if (existing) {
          await this.store.touchEntry(existing.entry_id);
        } else {
          await this.store.createBaseEntry(userId, topicKey, 'general', 'mid_term', {
            value: {
              sentiment: 'positive',
              strength: 0.5,
              feedback_type: 'interested',
              source_type: 'inferred',
            },
            confidence: 0.5,
          });
        }
      }

      log.info(
        `Synthesis complete — ${parsed.newInterests.length} new interests, ` +
          `${parsed.fadingInterests.length} fading, ${parsed.suggestedRelations.length} relations`,
      );

      await this.markRan();
      return true;
    } catch (err) {
      log.error('Preference synthesis failed — will retry next alarm', err);
      return false;
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private compressEvents(events: MemoryEvent[]): string {
    // Group by action and aggregate topics
    const interested: Map<string, number> = new Map();
    const notInterested: Map<string, number> = new Map();
    const platforms = new Set<string>();

    for (const event of events) {
      const topic = event.topic_key.split(':').pop() ?? event.topic_key;
      platforms.add(event.platform);

      if (event.action === 'interested' || event.action === 'one_time') {
        interested.set(topic, (interested.get(topic) ?? 0) + 1);
      } else {
        notInterested.set(topic, (notInterested.get(topic) ?? 0) + 1);
      }
    }

    const lines: string[] = [];
    lines.push(`Platforms active: ${[...platforms].join(', ')}`);
    lines.push(`Total signals: ${events.length}`);

    if (interested.size > 0) {
      const sorted = [...interested.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
      lines.push(`\nPositive signals:`);
      for (const [topic, count] of sorted) {
        lines.push(`  ${topic}: ${count}x`);
      }
    }

    if (notInterested.size > 0) {
      const sorted = [...notInterested.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      lines.push(`\nNegative signals:`);
      for (const [topic, count] of sorted) {
        lines.push(`  ${topic}: ${count}x`);
      }
    }

    return lines.join('\n');
  }

  private parseResponse(raw: string): SynthesisResult | null {
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return null;

      const parsed = JSON.parse(match[0]) as Partial<SynthesisResult>;
      return {
        newInterests: Array.isArray(parsed.newInterests)
          ? parsed.newInterests.filter((s): s is string => typeof s === 'string').slice(0, 5)
          : [],
        fadingInterests: Array.isArray(parsed.fadingInterests)
          ? parsed.fadingInterests.filter((s): s is string => typeof s === 'string').slice(0, 3)
          : [],
        suggestedRelations: Array.isArray(parsed.suggestedRelations)
          ? parsed.suggestedRelations.slice(0, 2)
          : [],
      };
    } catch {
      return null;
    }
  }

  private async ranToday(): Promise<boolean> {
    try {
      const result = await chrome.storage.local.get(SYNTHESIS_STORAGE_KEY);
      const lastRun = result[SYNTHESIS_STORAGE_KEY] as number | undefined;
      if (!lastRun) return false;
      // Check if last run was within the same calendar day
      const today = new Date().toDateString();
      const lastDate = new Date(lastRun).toDateString();
      return today === lastDate;
    } catch {
      return false;
    }
  }

  private async markRan(): Promise<void> {
    try {
      await chrome.storage.local.set({ [SYNTHESIS_STORAGE_KEY]: now() });
    } catch {
      // storage may not be available
    }
  }
}
