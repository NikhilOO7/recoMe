import type { Platform, ContextBucket } from '@schema/context';
import type { ContentMetadata } from '@schema/content';

// ── Brain Task Types ────────────────────────────────────────────────────────

export type TaskType = 'filter' | 'discover' | 'advise' | 'shop' | 'social' | 'chat' | 'analyze';
export type TaskTrigger = 'page_load' | 'user_action' | 'chat_message' | 'scheduled' | 'signal';
export type TaskPriority = 'immediate' | 'background' | 'deferred';

export interface BrainTask {
  id: string;
  type: TaskType;
  trigger: TaskTrigger;
  context: TaskContext;
  priority: TaskPriority;
  createdAt: number;
}

export interface TaskContext {
  platform: Platform;
  pageUrl: string;
  pageContent?: PageContext;
  recentActions?: UserAction[];
  activeGoals?: UserGoal[];
  conversationHistory?: ChatMessage[];
  content?: ContentMetadata;
  aggressiveness?: number;
}

export interface PageContext {
  title: string;
  feedItems: ContentMetadata[];
  contextBucket: ContextBucket;
}

export interface UserAction {
  type: string;
  platform: Platform;
  timestamp: number;
  contentId?: string;
  details?: Record<string, unknown>;
}

export interface UserGoal {
  description: string;
  confidence: number;
  firstSignal: number;
  supportingSignals: string[];
  status: 'active' | 'completed' | 'abandoned';
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// ── Agent Types ─────────────────────────────────────────────────────────────

export type AgentName = 'filter' | 'scout' | 'advisor' | 'shopper' | 'social' | 'guardian';

export interface AgentResult {
  agent: AgentName;
  success: boolean;
  data: unknown;
  confidence: number;
  reasoning?: string;
  toolsUsed: string[];
  latencyMs: number;
}

// ── Brain Result ────────────────────────────────────────────────────────────

export interface BrainResult {
  taskId: string;
  taskType: TaskType;
  agents: AgentResult[];
  merged: MergedResult;
  latencyMs: number;
}

export interface MergedResult {
  action?: string;
  explanation?: string;
  suggestions?: string[];
  data?: unknown;
  confidence: number;
}
