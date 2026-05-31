import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import type { ShareInput, ShareResult } from '../services/ShareReceiver';

/**
 * ShareReceivedScreen — modal confirmation when content is shared in.
 *
 * Rendered as an overlay from App.tsx when ShareReceiver.attach() fires.
 * Three states:
 *
 *   • ingesting → spinner + the URL being captured (so the user sees
 *     something is happening immediately).
 *   • ok        → "Saved to your graph" + signalId for the curious.
 *   • error     → reason string + a "Try again" button.
 *
 * Kept intentionally dumb — no navigation, no graph fetches, no animation
 * library. The ingest path is what matters; this screen is just the
 * receipt.
 */

export interface ShareReceivedScreenProps {
  input: ShareInput;
  state: { kind: 'ingesting' } | { kind: 'done'; result: ShareResult };
  onDismiss: () => void;
  onRetry: () => void;
}

export function ShareReceivedScreen({
  input,
  state,
  onDismiss,
  onRetry,
}: ShareReceivedScreenProps) {
  const isOk = state.kind === 'done' && state.result.ok;
  const isError = state.kind === 'done' && !state.result.ok;

  return (
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <Text style={styles.kicker}>{labelForState(state)}</Text>
        <Text style={styles.payload} numberOfLines={3}>
          {input.title ?? input.payload}
        </Text>

        {state.kind === 'ingesting' && <ActivityIndicator style={styles.spinner} color="#5eead4" />}

        {isOk && state.kind === 'done' && (
          <Text style={styles.detail}>
            signalId: {state.result.signalId ?? '—'}
            {'\n'}Curator and Recall will pick it up on the next pass.
          </Text>
        )}
        {isError && state.kind === 'done' && (
          <Text style={[styles.detail, styles.errorDetail]}>
            {humanReason(state.result.reason ?? 'unknown')}
          </Text>
        )}

        <View style={styles.actions}>
          {isError && (
            <Pressable style={[styles.btn, styles.btnPrimary]} onPress={onRetry}>
              <Text style={styles.btnTextPrimary}>Try again</Text>
            </Pressable>
          )}
          <Pressable style={styles.btn} onPress={onDismiss}>
            <Text style={styles.btnText}>{isOk ? 'Done' : 'Close'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function labelForState(s: ShareReceivedScreenProps['state']): string {
  if (s.kind === 'ingesting') return 'Saving to your graph…';
  if (s.result.ok) return 'Saved.';
  return 'Could not save.';
}

function humanReason(code: string): string {
  switch (code) {
    case 'not_signed_in':
      return 'Sign in to start saving links from the share sheet.';
    case 'no_url_in_share':
      return "We couldn't find a URL in what you shared.";
    case 'ingest_failed':
    case 'no_signal_returned':
      return 'The cloud rejected the signal. Try again in a moment.';
    default:
      return code.startsWith('http_')
        ? `Cloud returned ${code.slice(5)}. Try again shortly.`
        : code;
  }
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 999,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#1a1a2e',
    borderColor: '#2a2a4e',
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
  },
  kicker: {
    color: '#5eead4',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  payload: {
    color: '#e0e0ff',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    marginBottom: 16,
  },
  detail: {
    color: 'rgba(224, 224, 255, 0.6)',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 16,
  },
  errorDetail: { color: '#f87171' },
  spinner: { marginVertical: 16, alignSelf: 'flex-start' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
  btn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  btnPrimary: { backgroundColor: '#7c6df0' },
  btnText: { color: '#e0e0ff', fontWeight: '600', fontSize: 14 },
  btnTextPrimary: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
