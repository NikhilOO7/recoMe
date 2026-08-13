/**
 * Message contract between content/popup and background.
 *
 * Background is the only place that talks to cloud. Every message is
 * dispatched by handleMessage() in background/messageHandler.ts; every
 * response follows the { success, data?, error? } envelope.
 */

import type { Signal, AgentEvent } from './types';

export type MessageType =
  // Capture (content → bg)
  | 'CAPTURE_SIGNAL'
  | 'FLUSH_NOW'
  // Inbox (popup, content → bg)
  | 'GET_INBOX'
  | 'MARK_SEEN'
  | 'INBOX_FEEDBACK'
  // Agent (popup, content → bg)
  | 'AGENT_RUN_ONDEMAND'
  | 'LIST_AGENTS'
  | 'PAUSE_AGENT'
  | 'RESUME_AGENT'
  // Scoring + intents (content → bg → cloud)
  | 'SCORE_CARDS'
  | 'GET_INTENTS'
  // Auth (popup → bg)
  | 'GET_AUTH_STATE'
  | 'LOGIN_WITH_TOKEN'
  | 'LOGOUT'
  // Settings (popup, content → bg)
  | 'GET_SETTINGS'
  | 'SET_SETTINGS'
  // Inbox push (bg → content/popup)
  | 'INBOX_UPDATED';

export interface RecoMeMessage<P = unknown> {
  type: MessageType;
  payload?: P;
}

export interface MessageResponse<D = unknown> {
  success: boolean;
  data?: D;
  error?: string;
}

export const ok = <T>(data?: T): MessageResponse<T> => ({ success: true, data });
export const err = (error: string): MessageResponse<never> => ({ success: false, error });

// ── Payload shapes ───────────────────────────────────────────────────────────

export interface CaptureSignalPayload {
  signal: Omit<Signal, 'id' | 'ts'> & Partial<Pick<Signal, 'id' | 'ts'>>;
}

export interface GetInboxPayload {
  unseen?: boolean;
  limit?: number;
}

export interface MarkSeenPayload {
  eventId: string;
}

export interface InboxFeedbackPayload {
  eventId: string;
  feedback: 'useful' | 'not_useful';
}

export interface AgentRunOnDemandPayload {
  agent: 'concierge' | 'recall' | 'curator' | 'decision' | 'curriculum' | 'synthesist';
  event?: Record<string, unknown>;
  trigger?: 'scheduled' | 'event' | 'on_demand';
}

export interface PauseResumeAgentPayload {
  agent: string;
  reason?: string;
}

export interface LoginWithTokenPayload {
  accessToken: string;
  refreshToken: string;
  user?: { id: string; email?: string };
}

export interface SetSettingsPayload {
  settings: {
    enabled?: boolean;
    platforms?: Partial<Record<string, boolean>>;
  };
}

export interface InboxUpdatedPayload {
  events: AgentEvent[];
  unseenCount: number;
}

export interface ScoreCardsPayload {
  pageUrl: string;
  platform: string;
  cards: Array<{ id: string; title: string; brand?: string; url?: string }>;
}

export interface GetIntentsPayload {
  limit?: number;
}

// Helper: typed send from popup/content into background.
export async function sendMessage<P, D>(
  type: MessageType,
  payload?: P,
): Promise<MessageResponse<D>> {
  try {
    const res = (await chrome.runtime.sendMessage({ type, payload })) as MessageResponse<D>;
    return res ?? err('no_response');
  } catch (e) {
    return err((e as Error).message ?? 'send_failed');
  }
}
