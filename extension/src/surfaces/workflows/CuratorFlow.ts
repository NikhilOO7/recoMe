/**
 * CuratorFlow — manual on YouTube/Reddit/LinkedIn/Indeed/Glassdoor: "Find
 * fresh content like this". Curator is normally scheduled (1×/day) — manual
 * mode lets the user trigger a sweep on demand from the sidebar.
 */

import { sendMessage, type AgentRunOnDemandPayload } from '@shared/messages';
import { detectPlatform } from '../../capture/detect';
import type { Platform } from '@shared/types';
import { Workflow } from './Workflow';
import { createLogger } from '@shared/Logger';

const log = createLogger('CuratorFlow');

export class CuratorFlow extends Workflow {
  readonly name = 'curator';
  readonly platforms: ReadonlyArray<Platform> = [
    'youtube',
    'reddit',
    'linkedin',
    'indeed',
    'glassdoor',
  ];

  override manualLabel(): string | null {
    return 'Find fresh content';
  }

  override async fireManual(): Promise<void> {
    const platform = detectPlatform();
    if (!this.platforms.includes(platform)) return;

    const res = await sendMessage<AgentRunOnDemandPayload, unknown>('AGENT_RUN_ONDEMAND', {
      agent: 'curator',
      trigger: 'scheduled',
      event: { source: 'manual', platform, pageUrl: location.href },
    });
    if (!res.success) log.warn('curator manual fire failed', res.error);
  }
}
