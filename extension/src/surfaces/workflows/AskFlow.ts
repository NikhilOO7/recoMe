/**
 * AskFlow — manual everywhere: "Ask Decision about this page". Phase 3
 * surfaces the Decision agent as a one-shot insight emission grounded in the
 * user's graph; Phase 4 turns it into a streaming chat panel.
 *
 * Fires DecisionAgent.run() with the current page context so the agent can
 * pull the most-relevant trail and emit a decision_nudge event.
 */

import type { Platform } from '@shared/types';
import { Workflow } from './Workflow';
import { openChat } from '../OverlayChat';

/** All platforms — even ones without auto workflows can ask the Decision agent. */
const ALL: ReadonlyArray<Platform> = [
  'youtube',
  'amazon',
  'reddit',
  'twitter',
  'facebook',
  'instagram',
  'ebay',
  'walmart',
  'linkedin',
  'tiktok',
  'indeed',
  'glassdoor',
  'udemy',
  'coursera',
  'edx',
  'generic',
];

/**
 * AskFlow now opens the multi-turn OverlayChat panel rather than firing the
 * Decision agent once. Each user message inside the chat hits the agent
 * directly (see OverlayChat.send).
 */
export class AskFlow extends Workflow {
  readonly name = 'ask';
  readonly platforms: ReadonlyArray<Platform> = ALL;

  override manualLabel(): string | null {
    return 'Ask Decision';
  }

  override async fireManual(): Promise<void> {
    openChat();
  }
}
