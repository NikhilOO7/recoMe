/**
 * Background message router. All cross-context calls go through here.
 *
 * The 1,217-line god dispatcher this replaces is gone. Each handler is
 * small, typed, and routes either to local stores (SignalBatcher, alarms)
 * or to cloud via CloudClient. The router itself does no business logic.
 */

import { ok, err, type RecoMeMessage, type MessageResponse } from '@shared/messages';
import type {
  CaptureSignalPayload,
  GetInboxPayload,
  MarkSeenPayload,
  InboxFeedbackPayload,
  AgentRunOnDemandPayload,
  PauseResumeAgentPayload,
  LoginWithTokenPayload,
  SetSettingsPayload,
  ScoreCardsPayload,
  GetIntentsPayload,
} from '@shared/messages';
import type { Platform } from '@shared/types';
import { enqueue, makeSignalId, queueSize } from '@shared/SignalBatcher';
import { flush } from './SignalUploader';
import { poll, getCachedInbox } from './InboxPoller';
import {
  markInboxSeen,
  postInboxFeedback,
  listAgents,
  pauseAgent,
  resumeAgent,
  runAgentOnDemand,
  scoreCards,
  getIntents,
  CloudHttpError,
} from '@shared/CloudClient';
import { getAuthState, storeTokens, clearTokens } from '@shared/AuthClient';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from '@shared/constants';
import type { Signal } from '@shared/types';
import { createLogger } from '@shared/Logger';

const log = createLogger('MessageHandler');

function reportCloudError(e: unknown): MessageResponse<never> {
  if (e instanceof CloudHttpError) return err(`${e.code}:${e.status}`);
  return err((e as Error)?.message ?? 'unknown');
}

async function handleCaptureSignal(payload: CaptureSignalPayload): Promise<MessageResponse> {
  const sig: Signal = {
    id: payload.signal.id ?? makeSignalId(),
    ts: payload.signal.ts ?? Date.now(),
    kind: payload.signal.kind,
    weight: payload.signal.weight,
    pageUrl: payload.signal.pageUrl,
    pageTitle: payload.signal.pageTitle,
    platform: payload.signal.platform,
    topics: payload.signal.topics,
    entities: payload.signal.entities,
    sessionId: payload.signal.sessionId,
    metadata: payload.signal.metadata,
  };
  await enqueue(sig);
  return ok({ id: sig.id, queueSize: await queueSize() });
}

async function handleFlushNow(): Promise<MessageResponse> {
  const res = await flush();
  return ok(res);
}

async function handleGetInbox(payload: GetInboxPayload | undefined): Promise<MessageResponse> {
  // Serve cache first for instant response, then refresh in background.
  const cached = await getCachedInbox();
  const filtered = payload?.unseen ? cached.filter((e) => !e.seenAt) : cached;
  void poll(); // refresh asynchronously
  return ok({ events: filtered.slice(0, payload?.limit ?? 30) });
}

async function handleMarkSeen(payload: MarkSeenPayload): Promise<MessageResponse> {
  try {
    await markInboxSeen(payload.eventId);
    // Reflect locally for the next render.
    const cached = await getCachedInbox();
    const next = cached.map((e) => (e.id === payload.eventId ? { ...e, seenAt: Date.now() } : e));
    await chrome.storage.local.set({ [STORAGE_KEYS.inbox_cache]: next });
    return ok();
  } catch (e) {
    return reportCloudError(e);
  }
}

async function handleInboxFeedback(payload: InboxFeedbackPayload): Promise<MessageResponse> {
  try {
    await postInboxFeedback(payload.eventId, payload.feedback);
    return ok();
  } catch (e) {
    return reportCloudError(e);
  }
}

async function handleAgentRunOnDemand(payload: AgentRunOnDemandPayload): Promise<MessageResponse> {
  try {
    const result = await runAgentOnDemand(payload.agent, payload.event, payload.trigger);
    void poll(); // result may have produced an inbox event
    return ok(result);
  } catch (e) {
    return reportCloudError(e);
  }
}

async function handleListAgents(): Promise<MessageResponse> {
  try {
    return ok(await listAgents());
  } catch (e) {
    return reportCloudError(e);
  }
}

async function handlePauseAgent(payload: PauseResumeAgentPayload): Promise<MessageResponse> {
  try {
    await pauseAgent(payload.agent, payload.reason);
    return ok();
  } catch (e) {
    return reportCloudError(e);
  }
}

async function handleResumeAgent(payload: PauseResumeAgentPayload): Promise<MessageResponse> {
  try {
    await resumeAgent(payload.agent);
    return ok();
  } catch (e) {
    return reportCloudError(e);
  }
}

async function handleScoreCards(payload: ScoreCardsPayload): Promise<MessageResponse> {
  try {
    const res = await scoreCards({
      pageUrl: payload.pageUrl,
      platform: payload.platform as Platform,
      cards: payload.cards,
    });
    return ok(res);
  } catch (e) {
    return reportCloudError(e);
  }
}

async function handleGetIntents(payload: GetIntentsPayload | undefined): Promise<MessageResponse> {
  try {
    const res = await getIntents(payload?.limit ?? 10);
    return ok(res);
  } catch (e) {
    return reportCloudError(e);
  }
}

async function handleGetAuthState(): Promise<MessageResponse> {
  return ok(await getAuthState());
}

async function handleLoginWithToken(payload: LoginWithTokenPayload): Promise<MessageResponse> {
  await storeTokens(payload.accessToken, payload.refreshToken, payload.user);
  // Kick the queue & inbox immediately so the user sees activity.
  void flush();
  void poll();
  return ok();
}

async function handleLogout(): Promise<MessageResponse> {
  await clearTokens();
  void chrome.action.setBadgeText({ text: '' });
  return ok();
}

async function handleGetSettings(): Promise<MessageResponse> {
  const r = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return ok(r[STORAGE_KEYS.settings] ?? DEFAULT_SETTINGS);
}

async function handleSetSettings(payload: SetSettingsPayload): Promise<MessageResponse> {
  const r = await chrome.storage.local.get(STORAGE_KEYS.settings);
  const cur = (r[STORAGE_KEYS.settings] as Record<string, unknown>) ?? DEFAULT_SETTINGS;
  const next = {
    ...cur,
    ...payload.settings,
    platforms: {
      ...((cur as { platforms?: Record<string, boolean> }).platforms ?? {}),
      ...(payload.settings.platforms ?? {}),
    },
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: next });
  return ok(next);
}

export function handleMessage(
  message: RecoMeMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: MessageResponse) => void,
): boolean {
  const respond = (p: Promise<MessageResponse>) => {
    p.then(sendResponse).catch((e) => {
      log.error(`handler ${message.type} threw`, e);
      sendResponse(err((e as Error).message ?? 'handler_threw'));
    });
    return true; // tell Chrome we'll respond async
  };

  switch (message.type) {
    case 'CAPTURE_SIGNAL':
      return respond(handleCaptureSignal(message.payload as CaptureSignalPayload));
    case 'FLUSH_NOW':
      return respond(handleFlushNow());
    case 'GET_INBOX':
      return respond(handleGetInbox(message.payload as GetInboxPayload | undefined));
    case 'MARK_SEEN':
      return respond(handleMarkSeen(message.payload as MarkSeenPayload));
    case 'INBOX_FEEDBACK':
      return respond(handleInboxFeedback(message.payload as InboxFeedbackPayload));
    case 'AGENT_RUN_ONDEMAND':
      return respond(handleAgentRunOnDemand(message.payload as AgentRunOnDemandPayload));
    case 'LIST_AGENTS':
      return respond(handleListAgents());
    case 'PAUSE_AGENT':
      return respond(handlePauseAgent(message.payload as PauseResumeAgentPayload));
    case 'RESUME_AGENT':
      return respond(handleResumeAgent(message.payload as PauseResumeAgentPayload));
    case 'SCORE_CARDS':
      return respond(handleScoreCards(message.payload as ScoreCardsPayload));
    case 'GET_INTENTS':
      return respond(handleGetIntents(message.payload as GetIntentsPayload | undefined));
    case 'GET_AUTH_STATE':
      return respond(handleGetAuthState());
    case 'LOGIN_WITH_TOKEN':
      return respond(handleLoginWithToken(message.payload as LoginWithTokenPayload));
    case 'LOGOUT':
      return respond(handleLogout());
    case 'GET_SETTINGS':
      return respond(handleGetSettings());
    case 'SET_SETTINGS':
      return respond(handleSetSettings(message.payload as SetSettingsPayload));
    case 'INBOX_UPDATED':
      // Outbound only; if we receive it, it's a no-op.
      sendResponse(ok());
      return false;
    default:
      sendResponse(err(`unknown_message_type:${(message as { type: string }).type}`));
      return false;
  }
}
