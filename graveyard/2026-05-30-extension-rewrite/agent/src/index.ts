import { createLogger } from '@utils/Logger';
import { ChatRouter, type AgentMessage, type AgentAction } from './chat';
import { RetrievalService, type UserContext } from './retrieval';
import { CompareService, type CompareResult, type RankedCandidate } from './compare';
import { WatchlistService, type AddToWatchlistRequest } from './watchlist';
import type { CandidateEntity } from '@schema/entities';
import type { PageContext } from '@schema/decisions';

const log = createLogger('AgentFacade');

export type {
  AgentMessage,
  AgentAction,
  UserContext,
  CompareResult,
  RankedCandidate,
  AddToWatchlistRequest,
};

/**
 * AgentFacade — unified entry point for the RecoMe agent layer.
 *
 * Provides:
 * - Chat: process user messages, route to capabilities, return structured responses
 * - Retrieval: gather user preference context from the brain
 * - Compare: rank and compare candidates with tradeoff analysis
 * - Watchlist: save and manage tracked products
 */
export class AgentFacade {
  readonly chat: ChatRouter;
  readonly retrieval: RetrievalService;
  readonly compare: CompareService;
  readonly watchlist: WatchlistService;

  constructor() {
    this.chat = new ChatRouter();
    this.retrieval = new RetrievalService();
    this.compare = new CompareService();
    this.watchlist = new WatchlistService();
  }

  /**
   * Process a user chat message and return a structured agent response.
   * This is the primary interface for the popup UI.
   */
  async chat_message(
    message: string,
    candidates?: CandidateEntity[],
    pageContext?: PageContext,
  ): Promise<AgentMessage> {
    log.info(`Agent received: "${message.slice(0, 60)}"`);
    return this.chat.processMessage(message, candidates, pageContext);
  }

  /**
   * Get the current user preference context.
   */
  async getContext(): Promise<UserContext> {
    return this.retrieval.getUserContext();
  }

  /**
   * Compare a set of candidates and return ranked results.
   */
  async compareProducts(
    candidates: CandidateEntity[],
    pageContext: PageContext,
  ): Promise<CompareResult> {
    const userContext = await this.retrieval.getUserContext();
    return this.compare.compareAndRank(candidates, pageContext, userContext);
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

let agentInstance: AgentFacade | null = null;

export function getAgent(): AgentFacade {
  if (!agentInstance) {
    agentInstance = new AgentFacade();
    log.info('AgentFacade initialized');
  }
  return agentInstance;
}
