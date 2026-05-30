/**
 * CurriculumFlow — manual on Udemy/Coursera/edX: "Build curriculum from your
 * graph". Prompts for the target topic (defaults to the course title on
 * page) and fires the Curriculum agent.
 */

import { sendMessage, type AgentRunOnDemandPayload } from '@shared/messages';
import { detectPlatform } from '../../capture/detect';
import { createCapture } from '../../capture';
import type { Platform } from '@shared/types';
import { Workflow } from './Workflow';
import { createLogger } from '@shared/Logger';

const log = createLogger('CurriculumFlow');

export class CurriculumFlow extends Workflow {
  readonly name = 'curriculum';
  readonly platforms: ReadonlyArray<Platform> = ['udemy', 'coursera', 'edx'];

  override manualLabel(): string | null {
    return 'Build curriculum';
  }

  override async fireManual(): Promise<void> {
    const platform = detectPlatform();
    if (!this.platforms.includes(platform)) return;

    const capture = createCapture(platform);
    const ex = capture.extract();
    const defaultTarget = ex?.pageTitle?.split(/[—|·]/, 1)[0]?.trim() ?? document.title;

    const target = window.prompt('What do you want to learn?', defaultTarget);
    if (!target || target.trim().length < 3) return;

    const res = await sendMessage<AgentRunOnDemandPayload, unknown>('AGENT_RUN_ONDEMAND', {
      agent: 'curriculum',
      trigger: 'on_demand',
      event: { target: target.trim(), platform, pageUrl: location.href },
    });
    if (!res.success) log.warn('curriculum fire failed', res.error);
  }
}
