/**
 * CloudClient — typed fetch over the cloud API.
 *
 * Every call attaches the bearer access token. On 401 the request is
 * retried exactly once after a refresh; a second 401 surfaces as a
 * non-retried error so the popup can show "logged out".
 *
 * Endpoints called by the extension are a subset of cloud/src/intelligence
 * + cloud/src/agents controllers. New endpoints get a typed method here;
 * raw fetch should not appear elsewhere in the extension.
 */

import { getCloudUrl } from './constants';
import { getAccessToken, refreshAccessToken } from './AuthClient';
import type { Signal, AgentEvent, AgentEventKind, Platform, SignalKind } from './types';
import { createLogger } from './Logger';

const log = createLogger('CloudClient');

export class CloudHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

async function authedFetch(
  path: string,
  init: RequestInit = {},
  retried = false,
): Promise<Response> {
  const base = await getCloudUrl();
  const token = await getAccessToken();

  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);

  const res = await fetch(`${base}${path}`, { ...init, headers });

  if (res.status === 401 && !retried) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return authedFetch(path, init, true);
  }
  return res;
}

async function parseOrThrow<T>(res: Response): Promise<T> {
  if (res.ok) return (await res.json()) as T;

  let code = `http_${res.status}`;
  let message: string | undefined;
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    if (body.error) code = body.error;
    message = body.message;
  } catch {
    /* non-json error body */
  }
  throw new CloudHttpError(res.status, code, message);
}

// ── Signals ──────────────────────────────────────────────────────────────────

export interface IngestResult {
  signalId: string;
  topicsCreated: number;
  entitiesCreated: number;
  embeddingsGenerated: number;
}

export interface BatchIngestResponse {
  results: IngestResult[];
}

export async function postSignals(signals: Signal[]): Promise<BatchIngestResponse> {
  if (signals.length === 0) return { results: [] };
  if (signals.length > 100) throw new Error('batch too large: max 100');
  const res = await authedFetch('/intelligence/signals', {
    method: 'POST',
    body: JSON.stringify({ signals }),
  });
  return parseOrThrow<BatchIngestResponse>(res);
}

// ── Inbox ────────────────────────────────────────────────────────────────────

export interface InboxResponse {
  events: AgentEvent[];
}

export async function getInbox(
  opts: {
    unseen?: boolean;
    limit?: number;
    since?: number;
  } = {},
): Promise<InboxResponse> {
  const params = new URLSearchParams();
  if (opts.unseen) params.set('unseen', '1');
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.since) params.set('since', String(opts.since));
  const q = params.toString();
  const res = await authedFetch(`/intelligence/inbox${q ? `?${q}` : ''}`, { method: 'GET' });
  return parseOrThrow<InboxResponse>(res);
}

export async function markInboxSeen(eventId: string): Promise<void> {
  const res = await authedFetch(`/intelligence/inbox/${encodeURIComponent(eventId)}/seen`, {
    method: 'POST',
  });
  await parseOrThrow<unknown>(res);
}

export async function postInboxFeedback(
  eventId: string,
  feedback: 'useful' | 'not_useful',
): Promise<void> {
  const res = await authedFetch(`/intelligence/inbox/${encodeURIComponent(eventId)}/feedback`, {
    method: 'POST',
    body: JSON.stringify({ feedback }),
  });
  await parseOrThrow<unknown>(res);
}

// ── Agents ───────────────────────────────────────────────────────────────────

export interface AgentInfo {
  name: string;
  displayName: string;
  triggers: string[];
  subscription: {
    enabled: boolean;
    pausedAt: string | null;
    lastEmittedAt: string | null;
  };
}

export async function listAgents(): Promise<{ agents: AgentInfo[] }> {
  const res = await authedFetch('/intelligence/agents', { method: 'GET' });
  return parseOrThrow<{ agents: AgentInfo[] }>(res);
}

export async function pauseAgent(name: string, reason?: string): Promise<void> {
  const res = await authedFetch(`/intelligence/agents/${encodeURIComponent(name)}/pause`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  await parseOrThrow<unknown>(res);
}

export async function resumeAgent(name: string): Promise<void> {
  const res = await authedFetch(`/intelligence/agents/${encodeURIComponent(name)}/resume`, {
    method: 'POST',
  });
  await parseOrThrow<unknown>(res);
}

export interface AgentRunResult {
  status: 'started' | 'succeeded' | 'skipped' | 'capped' | 'failed';
  eventId?: string | null;
  reason?: string;
  emission?: {
    kind: AgentEventKind;
    title: string;
    body?: string;
    actionUrl?: string;
  };
}

export interface OnDemandRunPayload {
  pageUrl?: string;
  pageTitle?: string;
  platform?: Platform;
  topicHint?: string;
  entityHint?: string;
  signalKind?: SignalKind;
  extra?: Record<string, unknown>;
}

// ── Scoring (Phase 2 in-page badges) ────────────────────────────────────────

export type CardVerdict = 'relevant' | 'caution' | 'filtered' | 'neutral';

export interface CardInput {
  id: string;
  title: string;
  brand?: string;
  url?: string;
}

export interface CardScore {
  id: string;
  score: number;
  verdict: CardVerdict;
  reason: string;
}

export async function scoreCards(input: {
  pageUrl: string;
  platform: Platform;
  cards: CardInput[];
}): Promise<{ scores: CardScore[] }> {
  if (input.cards.length === 0) return { scores: [] };
  if (input.cards.length > 50) throw new Error('too many cards: max 50');
  const res = await authedFetch('/intelligence/score/cards', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  // If the endpoint isn't deployed yet (older cloud), don't break the page.
  if (res.status === 404) {
    log.warn('score/cards not deployed; skipping badges');
    return { scores: [] };
  }
  return parseOrThrow<{ scores: CardScore[] }>(res);
}

// ── Intents (Phase 2 sidebar Interest Graph panel) ──────────────────────────

export interface IntentRow {
  topicNormalizedName: string;
  topicName?: string;
  strength: number;
  lastSeen?: number;
}

export async function getIntents(limit = 10): Promise<{ intents: IntentRow[] }> {
  const res = await authedFetch(`/intelligence/intents?limit=${limit}`, { method: 'GET' });
  return parseOrThrow<{ intents: IntentRow[] }>(res);
}

export type AgentTriggerOverride = 'scheduled' | 'event' | 'on_demand';

export async function runAgentOnDemand(
  agent: string,
  payload?: OnDemandRunPayload | Record<string, unknown>,
  trigger?: AgentTriggerOverride,
): Promise<AgentRunResult> {
  const qs = trigger ? `?trigger=${trigger}` : '';
  const res = await authedFetch(`/intelligence/agents/${encodeURIComponent(agent)}/run${qs}`, {
    method: 'POST',
    body: JSON.stringify({ event: payload ?? {} }),
  });
  // Gracefully degrade: the cloud may return 404 for unimplemented agents.
  if (res.status === 404) {
    log.warn(`agent ${agent} not implemented on cloud`);
    return { status: 'skipped', reason: 'agent_not_implemented' };
  }
  return parseOrThrow<AgentRunResult>(res);
}
