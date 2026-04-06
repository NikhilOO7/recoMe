import { ok, err } from '@shared/messages';
import type { MessageResponse } from '@shared/messages';
import { getSyncManager } from './cloudServices';
import { CLOUD_URL } from '@shared/constants';

/**
 * Proxy a request to the cloud Taste Twin API.
 * Automatically attaches the stored access token.
 */
async function twinFetch(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' = 'GET',
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const sm = await getSyncManager();
  if (!sm.isAvailable()) {
    return { ok: false, status: 401, data: { error: 'Not authenticated' } };
  }

  // Get the access token from storage
  const stored = await chrome.storage.local.get('recome_cloud_access_token');
  const token = stored['recome_cloud_access_token'] as string | undefined;
  if (!token) {
    return { ok: false, status: 401, data: { error: 'No access token' } };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const res = await globalThis.fetch(`${CLOUD_URL}/twins${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

export async function handleTwinGetStatus(): Promise<MessageResponse> {
  const result = await twinFetch('/status');
  return result.ok ? ok(result.data) : err('Failed to get twin status');
}

export async function handleTwinOptIn(): Promise<MessageResponse> {
  const result = await twinFetch('/opt-in', 'POST', {});
  return result.ok ? ok(result.data) : err('Failed to opt in');
}

export async function handleTwinOptOut(): Promise<MessageResponse> {
  const result = await twinFetch('/opt-out', 'POST', {});
  return result.ok ? ok(result.data) : err('Failed to opt out');
}

export async function handleTwinUploadVector(vector: string[]): Promise<MessageResponse> {
  const result = await twinFetch('/vector', 'POST', { vector });
  return result.ok ? ok(result.data) : err('Failed to upload taste vector');
}

export async function handleTwinComputeMatches(): Promise<MessageResponse> {
  const result = await twinFetch('/compute-matches', 'POST', {});
  return result.ok ? ok(result.data) : err('Failed to compute matches');
}

export async function handleTwinGetTwins(): Promise<MessageResponse> {
  const result = await twinFetch('/twins');
  return result.ok ? ok(result.data) : err('Failed to get twins');
}

export async function handleTwinGetRecommendations(): Promise<MessageResponse> {
  const result = await twinFetch('/recommendations');
  return result.ok ? ok(result.data) : err('Failed to get recommendations');
}

export async function handleTwinAcceptMatch(matchId: string): Promise<MessageResponse> {
  const result = await twinFetch('/accept', 'POST', { matchId });
  return result.ok ? ok(result.data) : err('Failed to accept match');
}

export async function handleTwinBlockMatch(matchId: string): Promise<MessageResponse> {
  const result = await twinFetch('/block', 'POST', { matchId });
  return result.ok ? ok(result.data) : err('Failed to block match');
}

export async function handleTwinDismissRecommendation(
  recommendationId: string,
): Promise<MessageResponse> {
  const result = await twinFetch('/dismiss', 'POST', { recommendationId });
  return result.ok ? ok(result.data) : err('Failed to dismiss recommendation');
}
