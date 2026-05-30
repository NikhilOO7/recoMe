/**
 * ConciergeFlow — auto-fires on commerce PDPs (Amazon/eBay/Walmart) ~1.5s
 * after page settle. Hands cloud the entity hint extracted from the PDP so
 * ConciergeAgent can price-check across retailers and surface deals.
 *
 * Dedup: per (origin + pathname); a session that revisits the same PDP
 * won't re-fire.
 */

import { sendMessage, type AgentRunOnDemandPayload } from '@shared/messages';
import { detectPlatform } from '../../capture/detect';
import { AmazonCapture } from '../../capture/platforms/AmazonCapture';
import type { Platform } from '@shared/types';
import { Workflow, type WorkflowAutoContext } from './Workflow';
import { createLogger } from '@shared/Logger';

const log = createLogger('ConciergeFlow');

export class ConciergeFlow extends Workflow {
  readonly name = 'concierge';
  readonly platforms: ReadonlyArray<Platform> = ['amazon', 'ebay', 'walmart'];

  private fired = new Set<string>();

  override canFireAuto(ctx: WorkflowAutoContext): boolean {
    if (!this.platforms.includes(detectPlatform())) return false;
    if (ctx.pageKind !== 'pdp') return false;
    if (this.fired.has(this.dedupeKey())) return false;
    return true;
  }

  override async fireAuto(ctx: WorkflowAutoContext): Promise<void> {
    const key = this.dedupeKey();
    this.fired.add(key);

    const platform = detectPlatform();
    const extract = platform === 'amazon' ? new AmazonCapture().extract() : null;
    const entityName =
      extract?.entities.find((e) => e.kind === 'product')?.name ??
      extract?.entities[0]?.name ??
      ctx.pageTitle.slice(0, 80);
    const topicName =
      extract?.topics[0]?.name ?? entityName.toLowerCase().split(/\s+/).slice(0, 3).join(' ');

    const event = {
      // The cloud's ConciergeAgent.canRun checks signalId + topicNormalizedName +
      // platform + entityNames. We synthesize a non-graph "synthetic" signal id
      // so server-side dedupe works; the real signal already got captured by
      // the dwell path 10s earlier (or will, shortly).
      signalId: `ext_${Date.now()}`,
      topicNormalizedName: topicName.toLowerCase(),
      topicName,
      ts: Date.now(),
      platform,
      entityNames: [entityName],
      pageUrl: ctx.pageUrl,
    };

    const res = await sendMessage<AgentRunOnDemandPayload, unknown>('AGENT_RUN_ONDEMAND', {
      agent: 'concierge',
      event,
      trigger: 'event',
    });
    if (!res.success) log.warn('concierge fire failed', res.error);
  }

  private dedupeKey(): string {
    return location.origin + location.pathname;
  }
}
