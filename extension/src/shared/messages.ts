import type {
  ContentMetadata,
  ContextBucket,
  FeedbackType,
  MemoryPack,
  RecommendationResult,
  RecoMeStats,
} from './types';
import type { CandidateEntity } from '@schema/entities';
import type { PageContext } from '@schema/decisions';
import type { IntentType } from '@schema/intent';
import type { Insight } from '@agent/insights';

// ── Outbound message types (content/popup → background) ──────────────────────

export type MessageType =
  // Content script → Background
  | 'PROCESS_CONTENT'
  | 'LEARN_FEEDBACK'
  | 'TRACK_SEARCH'
  | 'IMPLICIT_SIGNAL'
  | 'GET_SETTINGS'
  // Commerce scoring (content script → brain)
  | 'SCORE_CANDIDATES'
  | 'RECORD_INTENT'
  | 'REVOKE_INTENT'
  // Agent (popup → background)
  | 'AGENT_CHAT'
  | 'AGENT_AI_STATUS'
  | 'AGENT_COMPARE'
  | 'AGENT_WATCHLIST_ADD'
  | 'AGENT_WATCHLIST_LIST'
  | 'AGENT_WATCHLIST_REMOVE'
  | 'AGENT_CONTEXT'
  // Insights
  | 'GET_PENDING_INSIGHTS'
  | 'INSIGHT_DISMISSED'
  | 'INSIGHT_SHOWN'
  // Popup → Background
  | 'GET_STATS'
  | 'GET_MEMORY_PACK'
  | 'GET_GRAPH_DATA'
  | 'BLOCK_TOPIC'
  | 'UNBLOCK_TOPIC'
  | 'LIKE_TOPIC'
  | 'UNLIKE_TOPIC'
  | 'SWITCH_CONTEXT'
  | 'CLEAR_ALL_DATA'
  | 'EXPORT_DATA'
  | 'GET_DECISION_LOG'
  | 'CLEAR_DECISION_LOG'
  | 'GET_RAW_STORAGE'
  | 'SAVE_SETTINGS'
  | 'SET_FOCUS'
  | 'GET_FOCUS'
  | 'CLEAR_FOCUS'
  | 'IMPORT_DATA'
  // Health check
  | 'PING'
  // Performance monitoring
  | 'GET_PERF_METRICS';

// ── Individual message shapes ─────────────────────────────────────────────────

export interface ProcessContentMessage {
  type: 'PROCESS_CONTENT';
  payload: ContentMetadata;
}

export interface LearnFeedbackMessage {
  type: 'LEARN_FEEDBACK';
  payload: {
    content: ContentMetadata;
    feedback: FeedbackType;
  };
}

export interface TrackSearchMessage {
  type: 'TRACK_SEARCH';
  payload: { query: string; platform: string };
}

export type ImplicitSignalType =
  | 'dwell_short' // 7s visible — mild interest
  | 'dwell_extended' // 30s visible — strong interest
  | 'click_through' // clicked a recommendation link
  | 'scroll_past' // scrolled past quickly — mild disinterest
  | 'revisit'; // revisited same content within 24h

export interface ImplicitSignalMessage {
  type: 'IMPLICIT_SIGNAL';
  payload: {
    topics: string[];
    entities: string[];
    platform: string;
    signalType: ImplicitSignalType;
    contentId: string;
    contentTitle?: string;
    /** Override confidence (0–1). If omitted, derived from signalType. */
    confidence?: number;
  };
}

export interface GetSettingsMessage {
  type: 'GET_SETTINGS';
  payload: null;
}

export interface GetStatsMessage {
  type: 'GET_STATS';
  payload: null;
}

export interface GetMemoryPackMessage {
  type: 'GET_MEMORY_PACK';
  payload: { context_bucket: ContextBucket };
}

export interface GetGraphDataMessage {
  type: 'GET_GRAPH_DATA';
  payload: null;
}

export interface BlockTopicMessage {
  type: 'BLOCK_TOPIC';
  payload: { topic: string; context?: ContextBucket };
}

export interface UnblockTopicMessage {
  type: 'UNBLOCK_TOPIC';
  payload: { topic: string; context?: ContextBucket };
}

export interface LikeTopicMessage {
  type: 'LIKE_TOPIC';
  payload: { topic: string };
}

export interface UnlikeTopicMessage {
  type: 'UNLIKE_TOPIC';
  payload: { topic: string };
}

export interface SwitchContextMessage {
  type: 'SWITCH_CONTEXT';
  payload: { context: ContextBucket };
}

export interface ClearAllDataMessage {
  type: 'CLEAR_ALL_DATA';
  payload: null;
}

export interface ExportDataMessage {
  type: 'EXPORT_DATA';
  payload: null;
}

export interface GetDecisionLogMessage {
  type: 'GET_DECISION_LOG';
  payload: null;
}

export interface ClearDecisionLogMessage {
  type: 'CLEAR_DECISION_LOG';
  payload: null;
}

export interface GetRawStorageMessage {
  type: 'GET_RAW_STORAGE';
  payload: null;
}

export interface GetDbStatsMessage {
  type: 'GET_DB_STATS';
  payload: null;
}

export interface SaveSettingsMessage {
  type: 'SAVE_SETTINGS';
  payload: {
    enabled?: boolean;
    aggressiveness?: number;
    platforms?: Partial<Record<string, boolean>>;
    context_override?: string | null;
  };
}

export interface SetFocusMessage {
  type: 'SET_FOCUS';
  payload: { topic: string };
}

export interface GetFocusMessage {
  type: 'GET_FOCUS';
  payload: null;
}

export interface ClearFocusMessage {
  type: 'CLEAR_FOCUS';
  payload: null;
}

export interface ImportDataMessage {
  type: 'IMPORT_DATA';
  payload: {
    memory?: { entries?: Array<Record<string, unknown>> };
    graph?: { entities?: Array<Record<string, unknown>> };
    stats?: Record<string, unknown>;
  };
}

export interface ScoreCandidatesMessage {
  type: 'SCORE_CANDIDATES';
  payload: {
    candidates: CandidateEntity[];
    pageContext: PageContext;
  };
}

export interface RecordIntentMessage {
  type: 'RECORD_INTENT';
  payload: {
    source: 'overlay' | 'popup' | 'agent';
    entityType: 'product' | 'brand' | 'seller' | 'category';
    entityId: string;
    intentType: IntentType;
    metadata?: Record<string, unknown>;
  };
}

export interface RevokeIntentMessage {
  type: 'REVOKE_INTENT';
  payload: { intentId: string };
}

export interface AgentChatMessage {
  type: 'AGENT_CHAT';
  payload: {
    message: string;
    candidates?: CandidateEntity[];
    pageContext?: PageContext;
  };
}

export interface AgentAIStatusMessage {
  type: 'AGENT_AI_STATUS';
  payload: null;
}

export interface AgentCompareMessage {
  type: 'AGENT_COMPARE';
  payload: {
    candidates: CandidateEntity[];
    pageContext: PageContext;
  };
}

export interface AgentWatchlistAddMessage {
  type: 'AGENT_WATCHLIST_ADD';
  payload: {
    entityType: 'product' | 'offer' | 'category';
    entityId: string;
    note?: string;
  };
}

export interface AgentWatchlistListMessage {
  type: 'AGENT_WATCHLIST_LIST';
  payload: null;
}

export interface AgentWatchlistRemoveMessage {
  type: 'AGENT_WATCHLIST_REMOVE';
  payload: { watchlistItemId: string };
}

export interface AgentContextMessage {
  type: 'AGENT_CONTEXT';
  payload: null;
}

export interface GetPendingInsightsMessage {
  type: 'GET_PENDING_INSIGHTS';
  payload: null;
}

export interface InsightDismissedMessage {
  type: 'INSIGHT_DISMISSED';
  payload: { insightId: string };
}

export interface InsightShownMessage {
  type: 'INSIGHT_SHOWN';
  payload: { insightId: string };
}

export interface PingMessage {
  type: 'PING';
  payload: null;
}

export interface GetPerfMetricsMessage {
  type: 'GET_PERF_METRICS';
  payload: null;
}

// ── Union type for all messages ───────────────────────────────────────────────

export type RecoMeMessage =
  | ProcessContentMessage
  | LearnFeedbackMessage
  | TrackSearchMessage
  | ImplicitSignalMessage
  | GetSettingsMessage
  | ScoreCandidatesMessage
  | RecordIntentMessage
  | RevokeIntentMessage
  | AgentChatMessage
  | AgentAIStatusMessage
  | AgentCompareMessage
  | AgentWatchlistAddMessage
  | AgentWatchlistListMessage
  | AgentWatchlistRemoveMessage
  | AgentContextMessage
  | GetPendingInsightsMessage
  | InsightDismissedMessage
  | InsightShownMessage
  | GetStatsMessage
  | GetMemoryPackMessage
  | GetGraphDataMessage
  | BlockTopicMessage
  | UnblockTopicMessage
  | LikeTopicMessage
  | UnlikeTopicMessage
  | SwitchContextMessage
  | ClearAllDataMessage
  | ExportDataMessage
  | GetDecisionLogMessage
  | ClearDecisionLogMessage
  | GetRawStorageMessage
  | GetDbStatsMessage
  | SaveSettingsMessage
  | SetFocusMessage
  | GetFocusMessage
  | ClearFocusMessage
  | ImportDataMessage
  | PingMessage
  | GetPerfMetricsMessage;

// ── Response wrapper ──────────────────────────────────────────────────────────

export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ── Response types per message ────────────────────────────────────────────────

export type ProcessContentResponse = MessageResponse<RecommendationResult>;
export type LearnFeedbackResponse = MessageResponse<void>;
export type GetStatsResponse = MessageResponse<RecoMeStats>;
export type GetMemoryPackResponse = MessageResponse<MemoryPack>;
export type BlockTopicResponse = MessageResponse<void>;
export type SwitchContextResponse = MessageResponse<ContextBucket>;

// ── Type-safe send helper ─────────────────────────────────────────────────────

export function sendMessage<T>(message: RecoMeMessage): Promise<MessageResponse<T>> {
  return chrome.runtime.sendMessage(message);
}

export function ok<T>(data: T): MessageResponse<T> {
  return { success: true, data };
}

export function err(error: string): MessageResponse<never> {
  return { success: false, error };
}
