/**
 * RecallFlow — fires Recall on content pages (YouTube /watch, Reddit
 * /comments/) so the agent can surface forgotten captures on the same topic.
 *
 * Recall is event-triggered server-side (signalIngestTrigger). Firing it
 * on-demand here is a UX shortcut for "the user is looking at this NOW; check
 * if we have prior research". Dedup by pageUrl per session.
 */

import { sendMessage, type AgentRunOnDemandPayload } from '@shared/messages';
import { detectPlatform } from '../../capture/detect';
import { YouTubeCapture } from '../../capture/platforms/YouTubeCapture';
import { RedditCapture } from '../../capture/platforms/RedditCapture';
import type { Platform } from '@shared/types';
import { Workflow, type WorkflowAutoContext } from './Workflow';
import { createLogger } from '@shared/Logger';

const log = createLogger('RecallFlow');

export class RecallFlow extends Workflow {
  readonly name = 'recall';
  readonly platforms: ReadonlyArray<Platform> = ['youtube', 'reddit'];

  private fired = new Set<string>();

  override canFireAuto(ctx: WorkflowAutoContext): boolean {
    const p = detectPlatform();
    if (!this.platforms.includes(p)) return false;
    if (p === 'youtube' && ctx.pageKind !== 'watch') return false;
    if (p === 'reddit' && ctx.pageKind !== 'post') return false;
    if (this.fired.has(ctx.pageUrl)) return false;
    return true;
  }

  override async fireAuto(ctx: WorkflowAutoContext): Promise<void> {
    this.fired.add(ctx.pageUrl);

    const platform = detectPlatform();
    const ex =
      platform === 'youtube'
        ? new YouTubeCapture().extract()
        : platform === 'reddit'
          ? new RedditCapture().extract()
          : null;
    if (!ex || ex.topics.length === 0) return;

    const topic = ex.topics[0]!;
    const event = {
      signalId: `ext_${Date.now()}`,
      topicNormalizedName: topic.name.toLowerCase(),
      topicName: topic.name,
      ts: Date.now(),
      platform,
      pageUrl: ctx.pageUrl,
    };

    const res = await sendMessage<AgentRunOnDemandPayload, unknown>('AGENT_RUN_ONDEMAND', {
      agent: 'recall',
      event,
      trigger: 'event',
    });
    if (!res.success) log.warn('recall fire failed', res.error);
  }
}
