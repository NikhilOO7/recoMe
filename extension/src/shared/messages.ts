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
  | 'GET_PERF_METRICS'
  // Selector health (V2)
  | 'GET_SELECTOR_HEALTH'
  // Smart prompts (V2 Phase 1)
  | 'SMART_PROMPT_RESPONSE'
  // Overlay (V2 Phase 1)
  | 'OVERLAY_POSITION_SAVE'
  // Brain orchestrator (V2 Phase 1.5A)
  | 'BRAIN_PROCESS'
  | 'BRAIN_INSIGHT'
  | 'BRAIN_STATUS'
  | 'BRAIN_FEEDBACK'
  // Platform imports (Phase 3A)
  | 'IMPORT_START'
  | 'IMPORT_PROGRESS'
  | 'IMPORT_HISTORY'
  | 'IMPORT_SCHEDULES'
  | 'IMPORT_SET_SCHEDULE'
  // Price tracking (Phase 3B)
  | 'PRICE_RECORD'
  | 'PRICE_TRACK'
  | 'PRICE_UNTRACK'
  | 'PRICE_GET_TRACKED'
  | 'PRICE_GET_HISTORY'
  | 'PRICE_ADD_RULE'
  | 'PRICE_REMOVE_RULE'
  | 'PRICE_GET_ALERTS'
  | 'PRICE_DISMISS_ALERT'
  // Monitoring (QA Tool)
  | 'GET_MONITOR_TIMELINE'
  | 'GET_MONITOR_HEALTH'
  | 'GET_MONITOR_TRACE'
  | 'GET_MONITOR_TRACES'
  | 'GET_MONITOR_AGENTS'
  | 'RUN_VALIDATORS'
  | 'SIMULATE_CONTENT'
  | 'SIMULATE_FLOW'
  | 'MONITOR_CLEAR'
  // Sprint 2: Dashboard experience
  | 'GET_GRAPH_SUMMARY'
  | 'GET_ACTION_HISTORY'
  // Sprint 4: Agent productization
  | 'GET_AGENT_ACTIVITY'
  // Sprint 5: Cloud sync & auth
  | 'CLOUD_REGISTER'
  | 'CLOUD_LOGIN'
  | 'CLOUD_LOGOUT'
  | 'CLOUD_GET_STATUS'
  | 'CLOUD_SYNC_NOW'
  | 'CLOUD_SET_PASSPHRASE'
  // Sprint 5: Taste Twin Network
  | 'TWIN_GET_STATUS'
  | 'TWIN_OPT_IN'
  | 'TWIN_OPT_OUT'
  | 'TWIN_UPLOAD_VECTOR'
  | 'TWIN_COMPUTE_MATCHES'
  | 'TWIN_GET_TWINS'
  | 'TWIN_GET_RECOMMENDATIONS'
  | 'TWIN_ACCEPT_MATCH'
  | 'TWIN_BLOCK_MATCH'
  | 'TWIN_DISMISS_RECOMMENDATION';

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

export interface GetSelectorHealthMessage {
  type: 'GET_SELECTOR_HEALTH';
}

export interface SmartPromptResponseMessage {
  type: 'SMART_PROMPT_RESPONSE';
  payload: {
    action: string;
    platform: string;
  };
}

export interface OverlayPositionSaveMessage {
  type: 'OVERLAY_POSITION_SAVE';
  payload: {
    domain: string;
    x: number;
    y: number;
  };
}

export interface BrainProcessMessage {
  type: 'BRAIN_PROCESS';
  payload: {
    taskType: 'filter' | 'discover' | 'advise' | 'shop' | 'social' | 'chat' | 'analyze';
    trigger: 'page_load' | 'user_action' | 'chat_message' | 'scheduled' | 'signal';
    platform: string;
    pageUrl: string;
    content?: ContentMetadata;
    message?: string;
    aggressiveness?: number;
  };
}

export interface BrainInsightMessage {
  type: 'BRAIN_INSIGHT';
  payload: {
    taskId: string;
    insight: string;
    agentName: string;
    confidence: number;
  };
}

export interface BrainStatusMessage {
  type: 'BRAIN_STATUS';
  payload: null;
}

export interface BrainFeedbackMessage {
  type: 'BRAIN_FEEDBACK';
  payload: {
    taskId: string;
    action: 'acted' | 'dismissed' | 'ignored';
  };
}

// ── Import messages (Phase 3A) ──────────────────────────────────────────────

export interface ImportStartMessage {
  type: 'IMPORT_START';
  payload: {
    platform: string;
    method: 'dom' | 'file' | 'api';
  };
}

export interface ImportProgressMessage {
  type: 'IMPORT_PROGRESS';
  payload: null;
}

export interface ImportHistoryMessage {
  type: 'IMPORT_HISTORY';
  payload: null;
}

export interface ImportSchedulesMessage {
  type: 'IMPORT_SCHEDULES';
  payload: null;
}

export interface ImportSetScheduleMessage {
  type: 'IMPORT_SET_SCHEDULE';
  payload: {
    platform: string;
    frequency: 'daily' | 'weekly' | 'manual';
  };
}

// ── Price tracking messages (Phase 3B) ──────────────────────────────────────

export interface PriceRecordMessage {
  type: 'PRICE_RECORD';
  payload: {
    url: string;
    platform: string;
    title: string;
    price: number;
    currency: string;
    imageUrl?: string;
  };
}

export interface PriceTrackMessage {
  type: 'PRICE_TRACK';
  payload: {
    url: string;
    platform: string;
    title: string;
    price: number;
    currency: string;
    imageUrl?: string;
  };
}

export interface PriceUntrackMessage {
  type: 'PRICE_UNTRACK';
  payload: { productId: string };
}

export interface PriceGetTrackedMessage {
  type: 'PRICE_GET_TRACKED';
  payload: null;
}

export interface PriceGetHistoryMessage {
  type: 'PRICE_GET_HISTORY';
  payload: { productId: string };
}

export interface PriceAddRuleMessage {
  type: 'PRICE_ADD_RULE';
  payload: {
    productId: string;
    type: 'below_threshold' | 'percent_drop' | 'all_time_low' | 'price_increase';
    thresholdPrice?: number;
    percentDrop?: number;
  };
}

export interface PriceRemoveRuleMessage {
  type: 'PRICE_REMOVE_RULE';
  payload: { ruleId: string };
}

export interface PriceGetAlertsMessage {
  type: 'PRICE_GET_ALERTS';
  payload: null;
}

export interface PriceDismissAlertMessage {
  type: 'PRICE_DISMISS_ALERT';
  payload: { alertId: string };
}

// ── Monitoring messages (QA Tool) ─────────────────────────────────────────────

export interface GetMonitorTimelineMessage {
  type: 'GET_MONITOR_TIMELINE';
  payload: {
    categories?: string[];
    types?: string[];
    traceId?: string;
    since?: number;
    limit?: number;
  } | null;
}

export interface GetMonitorHealthMessage {
  type: 'GET_MONITOR_HEALTH';
  payload: null;
}

export interface GetMonitorTraceMessage {
  type: 'GET_MONITOR_TRACE';
  payload: { traceId: string };
}

export interface GetMonitorTracesMessage {
  type: 'GET_MONITOR_TRACES';
  payload: null;
}

export interface GetMonitorAgentsMessage {
  type: 'GET_MONITOR_AGENTS';
  payload: null;
}

export interface RunValidatorsMessage {
  type: 'RUN_VALIDATORS';
  payload: { category?: string } | null;
}

export interface SimulateContentMessage {
  type: 'SIMULATE_CONTENT';
  payload: ContentMetadata;
}

export interface SimulateFlowMessage {
  type: 'SIMULATE_FLOW';
  payload: { flowId: string };
}

export interface MonitorClearMessage {
  type: 'MONITOR_CLEAR';
  payload: null;
}

// ── Sprint 2: Dashboard experience messages ──────────────────────────────────

export interface GetGraphSummaryMessage {
  type: 'GET_GRAPH_SUMMARY';
  payload: null;
}

export interface GetActionHistoryMessage {
  type: 'GET_ACTION_HISTORY';
  payload: { limit?: number } | null;
}

// ── Sprint 4: Agent productization messages ──────────────────────────────────

export interface GetAgentActivityMessage {
  type: 'GET_AGENT_ACTIVITY';
  payload: null;
}

/** Agent activity entry returned by GET_AGENT_ACTIVITY */
export interface AgentActivityEntry {
  agent: string;
  label: string;
  description: string;
  lastRun: number | null;
  tasksHandled: number;
  avgConfidence: number;
  recentInsights: Array<{
    title: string;
    explanation: string;
    confidence: number;
    timestamp: number;
  }>;
}

// ── Sprint 5: Cloud sync & auth messages ────────────────────────────────────

export interface CloudRegisterMessage {
  type: 'CLOUD_REGISTER';
  payload: { email: string; password: string; displayName?: string };
}

export interface CloudLoginMessage {
  type: 'CLOUD_LOGIN';
  payload: { email: string; password: string };
}

export interface CloudLogoutMessage {
  type: 'CLOUD_LOGOUT';
  payload: null;
}

export interface CloudGetStatusMessage {
  type: 'CLOUD_GET_STATUS';
  payload: null;
}

export interface CloudSyncNowMessage {
  type: 'CLOUD_SYNC_NOW';
  payload: null;
}

export interface CloudSetPassphraseMessage {
  type: 'CLOUD_SET_PASSPHRASE';
  payload: { passphrase: string };
}

/** Cloud account status returned by CLOUD_GET_STATUS */
export interface CloudAccountStatus {
  authenticated: boolean;
  email: string | null;
  tier: string;
  syncAvailable: boolean;
  lastSync: number | null;
}

// ── Sprint 5: Taste Twin Network messages ───────────────────────────────────

export interface TwinGetStatusMessage {
  type: 'TWIN_GET_STATUS';
  payload: null;
}

export interface TwinOptInMessage {
  type: 'TWIN_OPT_IN';
  payload: null;
}

export interface TwinOptOutMessage {
  type: 'TWIN_OPT_OUT';
  payload: null;
}

export interface TwinUploadVectorMessage {
  type: 'TWIN_UPLOAD_VECTOR';
  payload: { vector: string[] };
}

export interface TwinComputeMatchesMessage {
  type: 'TWIN_COMPUTE_MATCHES';
  payload: null;
}

export interface TwinGetTwinsMessage {
  type: 'TWIN_GET_TWINS';
  payload: null;
}

export interface TwinGetRecommendationsMessage {
  type: 'TWIN_GET_RECOMMENDATIONS';
  payload: null;
}

export interface TwinAcceptMatchMessage {
  type: 'TWIN_ACCEPT_MATCH';
  payload: { matchId: string };
}

export interface TwinBlockMatchMessage {
  type: 'TWIN_BLOCK_MATCH';
  payload: { matchId: string };
}

export interface TwinDismissRecommendationMessage {
  type: 'TWIN_DISMISS_RECOMMENDATION';
  payload: { recommendationId: string };
}

/** Taste Twin status returned by TWIN_GET_STATUS */
export interface TwinStatus {
  optedIn: boolean;
  isDiscoverable?: boolean;
  twinCount: number;
  recommendationCount: number;
  lastUpdated?: string;
}

/** A twin match (anonymized — no identity) */
export interface TwinMatchInfo {
  matchId: string;
  similarityScore: number;
  sharedBuckets: number;
  accepted: boolean;
  computedAt: string;
}

/** A twin recommendation */
export interface TwinRecommendationInfo {
  id: string;
  title: string;
  body: string;
  platform: string | null;
  relevanceScore: number;
  createdAt: string;
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
  | GetPerfMetricsMessage
  | GetSelectorHealthMessage
  | SmartPromptResponseMessage
  | OverlayPositionSaveMessage
  | BrainProcessMessage
  | BrainInsightMessage
  | BrainStatusMessage
  | BrainFeedbackMessage
  | ImportStartMessage
  | ImportProgressMessage
  | ImportHistoryMessage
  | ImportSchedulesMessage
  | ImportSetScheduleMessage
  | PriceRecordMessage
  | PriceTrackMessage
  | PriceUntrackMessage
  | PriceGetTrackedMessage
  | PriceGetHistoryMessage
  | PriceAddRuleMessage
  | PriceRemoveRuleMessage
  | PriceGetAlertsMessage
  | PriceDismissAlertMessage
  | GetMonitorTimelineMessage
  | GetMonitorHealthMessage
  | GetMonitorTraceMessage
  | GetMonitorTracesMessage
  | GetMonitorAgentsMessage
  | RunValidatorsMessage
  | SimulateContentMessage
  | SimulateFlowMessage
  | MonitorClearMessage
  | GetGraphSummaryMessage
  | GetActionHistoryMessage
  | GetAgentActivityMessage
  | CloudRegisterMessage
  | CloudLoginMessage
  | CloudLogoutMessage
  | CloudGetStatusMessage
  | CloudSyncNowMessage
  | CloudSetPassphraseMessage
  | TwinGetStatusMessage
  | TwinOptInMessage
  | TwinOptOutMessage
  | TwinUploadVectorMessage
  | TwinComputeMatchesMessage
  | TwinGetTwinsMessage
  | TwinGetRecommendationsMessage
  | TwinAcceptMatchMessage
  | TwinBlockMatchMessage
  | TwinDismissRecommendationMessage;

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
