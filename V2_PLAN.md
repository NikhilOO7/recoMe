# RecoMe V2 — Product Evolution Plan

## Vision

Transform RecoMe from a browser-specific extension into a cross-device, monetizable AI companion that understands users deeply through passive signals, platform imports, and collaborative intelligence — while maintaining the privacy-first architecture that defines v1.

---

## Phase 1: Floating Overlay + Smart Dwell Prompts

**Goal:** Make the agent feel native to web browsing and eliminate friction from active feedback mechanisms.

### 1A. Floating Agent Overlay

Replace popup-only access with an always-available floating overlay injected into every page.

**New file:** `extension/src/content/overlay/FloatingOverlay.tsx`

- Draggable pill icon (bottom-right default, user-repositionable)
- Click expands to a 400×500px chat panel anchored to the pill
- Panel states: collapsed (pill), mini (last message preview), expanded (full chat)
- Shadow DOM isolation to prevent page CSS conflicts
- Remembers position per-domain via `chrome.storage.local`

**New file:** `extension/src/content/overlay/OverlayManager.ts`

- Lifecycle management: inject on page load, destroy on navigation
- Z-index management (always on top, but respects fullscreen/video)
- Handles drag-and-drop repositioning with snap-to-edge
- Keyboard shortcut: `Alt+R` to toggle overlay

**New file:** `extension/src/content/overlay/OverlayChat.tsx`

- Reuses `AgentChat` component logic but adapted for overlay context
- Page-aware context: knows current URL, detected products, content type
- Quick actions bar: "Block this", "Save to watchlist", "Why am I seeing this?"
- Inline recommendation cards within chat responses
- Auto-minimizes during video playback (detected via MutationObserver on `<video>` elements)

**New file:** `extension/src/content/overlay/OverlayStyles.ts`

- CSS-in-JS (injected into shadow DOM) — no external stylesheet to avoid CORS issues
- Light/dark theme matching extension settings
- Responsive: smaller on mobile viewports, full panel on desktop
- Animations: spring-based expand/collapse, subtle breathing glow when insights pending

**Modify:** `extension/src/content/ContentOrchestrator.ts`

- Add overlay injection after adapter initialization
- Pass adapter context (platform, content type) to overlay

**Modify:** `extension/src/popup/PopupApp.tsx`

- Add "Open overlay" button that sends message to content script
- Settings option: "Always show floating overlay" (default: off)

**Modify:** `extension/manifest.json`

- Add `"all_urls"` to content script matches for overlay injection
- Content script needs React bundle — add overlay entry point to webpack

**Modify:** `webpack.config.js`

- New entry point: `overlay` → bundles overlay React components separately
- Tree-shake to keep overlay bundle small (~50KB target)

#### Overlay Architecture

```
Content Script
├── Platform Adapter (existing)
├── DwellTracker (existing)
├── FloatingOverlay (new)
│   ├── Shadow DOM root
│   ├── OverlayChat (React, mounted in shadow)
│   └── OverlayManager (position, lifecycle)
└── ContentOrchestrator (modified — manages all above)
```

#### Overlay ↔ Background Communication

```
OverlayChat → chrome.runtime.sendMessage({ type: 'AGENT_CHAT', ... })
           ← chrome.runtime.onMessage → { type: 'AGENT_RESPONSE', ... }
```

Same message protocol as popup chat — no new message types needed for basic chat. New messages:

| Message                 | Direction            | Purpose                                          |
| ----------------------- | -------------------- | ------------------------------------------------ |
| `OVERLAY_CONTEXT`       | content → background | Current page context for overlay-aware responses |
| `OVERLAY_POSITION_SAVE` | content → background | Persist pill position per-domain                 |
| `OVERLAY_QUICK_ACTION`  | content → background | Block/boost/watchlist from overlay               |

### 1B. Smart Dwell Prompts

Replace active like/dislike buttons with intelligent, contextual micro-prompts triggered by browsing behavior.

**New file:** `extension/src/content/prompts/SmartPromptEngine.ts`

Trigger conditions (all configurable):

| Trigger             | Threshold                                   | Prompt Type          | Example                                  |
| ------------------- | ------------------------------------------- | -------------------- | ---------------------------------------- |
| Extended dwell      | >15s on content item                        | Subtle toast         | "Enjoying this? 👍 👎"                   |
| Scroll-back         | User scrolls back to previously viewed item | Inline badge         | "Came back to this — interested?"        |
| Tab revisit         | Same content within 2h                      | Overlay notification | "You've visited this 3 times — save it?" |
| Comparison behavior | 3+ similar items in 5min                    | Comparison offer     | "Comparing headphones? Let me help"      |
| Cart/wishlist hover | Hover on add-to-cart >3s                    | Purchase intent      | "Want me to track this price?"           |
| Exit without action | Leave category page after viewing 5+ items  | Exit prompt          | "Found what you needed?"                 |

**New file:** `extension/src/content/prompts/PromptRenderer.ts`

- Renders prompts as non-intrusive micro-UIs injected near the content item
- Three styles: toast (bottom-right, auto-dismiss 5s), inline (next to content), overlay (in agent panel)
- Respects "prompt fatigue" — max 3 prompts per page, max 8 per hour, exponential backoff
- User can snooze all prompts for 1h/1d/forever from any prompt

**New file:** `extension/src/content/prompts/PromptFatigueManager.ts`

- Tracks prompt frequency per session and per day
- Adaptive frequency: reduces prompts for users who rarely respond, increases for engaged users
- Stores fatigue state in `chrome.storage.session`
- Cool-down periods: after dismissal, wait 5min before next prompt; after snooze, respect snooze duration

**Modify:** `extension/src/content/DwellTracker.ts`

- Add scroll-back detection (track scroll position history)
- Add comparison behavior detection (rapid viewing of similar items)
- Emit `SMART_PROMPT_TRIGGER` events with trigger type and content context

**Modify:** `extension/src/shared/messages.ts`

- Add `SMART_PROMPT_TRIGGER`, `SMART_PROMPT_RESPONSE`, `SMART_PROMPT_DISMISS`, `SMART_PROMPT_SNOOZE`

**Modify:** `extension/src/background/messageHandler.ts`

- Route prompt responses to MemoryService (positive → implicit signal, negative → soft block)

#### Prompt Response Flow

```
DwellTracker detects trigger
  → SmartPromptEngine evaluates (fatigue check, context check)
  → PromptRenderer shows micro-UI
  → User responds (👍/👎/dismiss/ignore)
  → Background: record implicit signal or soft preference
  → PromptFatigueManager updates frequency model
```

---

## Phase 1.5A: AI Brain & Multi-Agent Architecture

**Goal:** Build a modular AI brain with specialized agents and precision tools that orchestrate all intelligence — from feed filtering to proactive recommendations to conversational assistance. Every feature in V2+ is powered by this agent system.

### The Brain — Central Orchestrator

**New directory:** `brain/src/orchestrator/`

```
orchestrator/
├── Brain.ts                        # Central orchestrator — routes tasks to agents
├── AgentRegistry.ts                # Registers and manages all available agents
├── TaskRouter.ts                   # Determines which agent(s) handle a given task
├── ContextAssembler.ts             # Builds rich context for agents from all sources
├── ResponseMerger.ts               # Combines multi-agent outputs into coherent results
├── AgentMemory.ts                  # Shared memory layer agents can read/write
└── FeedbackLoop.ts                 # User actions feed back to improve routing & ranking
```

**Brain architecture:**

```
                         ┌──────────────────────┐
                         │      THE BRAIN        │
                         │   (Orchestrator)       │
                         │                        │
                         │  ┌──────────────────┐  │
                         │  │  Task Router     │  │
                         │  │  "What kind of   │  │
                         │  │   task is this?"  │  │
                         │  └────────┬─────────┘  │
                         │           │             │
                         │  ┌────────┴─────────┐  │
                         │  │ Context Assembler │  │
                         │  │ "What do we know  │  │
                         │  │  about this user  │  │
                         │  │  right now?"      │  │
                         │  └────────┬─────────┘  │
                         └───────────┼────────────┘
                                     │
              ┌──────────┬───────────┼───────────┬──────────┐
              │          │           │           │          │
         ┌────┴───┐ ┌───┴────┐ ┌───┴────┐ ┌───┴────┐ ┌──┴─────┐
         │ Filter │ │ Scout  │ │ Advisor│ │ Shopper│ │ Social │
         │ Agent  │ │ Agent  │ │ Agent  │ │ Agent  │ │ Agent  │
         └────┬───┘ └───┬────┘ └───┬────┘ └───┬────┘ └──┬─────┘
              │         │          │          │         │
         ┌────┴───┐ ┌──┴────┐ ┌──┴────┐ ┌──┴────┐ ┌──┴────┐
         │ Tools  │ │ Tools │ │ Tools │ │ Tools │ │ Tools │
         └────────┘ └───────┘ └───────┘ └───────┘ └───────┘
```

**Brain decision flow:**

```typescript
interface BrainTask {
  id: string;
  type: 'filter' | 'discover' | 'advise' | 'shop' | 'social' | 'chat' | 'analyze';
  trigger: 'page_load' | 'user_action' | 'chat_message' | 'scheduled' | 'signal';
  context: TaskContext;
  priority: 'immediate' | 'background' | 'deferred';
}

interface TaskContext {
  platform: Platform;
  page_url: string;
  page_content: PageContext; // DOM-extracted content
  user_profile: UserProfile; // From knowledge graph
  interest_graph: GraphSnapshot; // Relevant subgraph
  recent_actions: UserAction[]; // Last N actions across platforms
  active_goals: UserGoal[]; // "Looking for headphones", "Learning React"
  conversation_history?: Message[]; // If triggered from chat
}

// Brain routing logic
class Brain {
  async process(task: BrainTask): Promise<BrainResult> {
    // 1. Assemble full context
    const context = await this.contextAssembler.build(task);

    // 2. Route to appropriate agent(s) — may invoke multiple in parallel
    const agents = this.taskRouter.selectAgents(task, context);

    // 3. Execute agents with their tools
    const results = await Promise.all(agents.map((a) => a.execute(context, task)));

    // 4. Merge results into coherent output
    const merged = this.responseMerger.merge(results, task);

    // 5. Feed back to improve future routing
    this.feedbackLoop.record(task, merged);

    return merged;
  }
}
```

### Specialized Agents

Each agent is an expert in one domain, equipped with specific tools for its job.

#### 1. Filter Agent — Feed Quality Control

**New file:** `brain/src/agents/FilterAgent.ts`

**Role:** Decides what content to show, dim, or hide. Replaces V1's simple scoring with intelligent, context-aware filtering.

**Tools:**

| Tool                | What it does                                              | Example use                                                                 |
| ------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------- |
| `score_content`     | Run 5-factor scoring on a content item                    | Score each card in the feed                                                 |
| `match_topics`      | Match content text against interest graph                 | "Is this product related to user's blocked topics?"                         |
| `check_history`     | Query if user has seen similar content before             | "User already saw 5 robot vacuum listings today"                            |
| `analyze_sentiment` | Determine if content is positive/negative for user        | "This review mentions issues with a product user owns"                      |
| `apply_rules`       | Execute user-defined filter rules                         | "Hide all sponsored content on YouTube"                                     |
| `explain_decision`  | Generate human-readable explanation for a filter decision | "Hidden because: matches blocked topic 'crypto' + low relevance score 0.12" |

**Decision model:**

```typescript
interface FilterDecision {
  action: 'show' | 'dim' | 'hide' | 'boost';
  confidence: number;
  reasons: string[]; // Human-readable
  scoring_factors: ScoringBreakdown; // Detailed scores
  reversible: true; // User can always override
}
```

#### 2. Scout Agent — Opportunity Discovery

**New file:** `brain/src/agents/ScoutAgent.ts`

**Role:** Proactively finds opportunities, events, courses, and content the user would benefit from. This is the engine behind Phase 1.5B's platform intelligence.

**Tools:**

| Tool                     | What it does                                                  | Example use                                                  |
| ------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------ |
| `scan_page`              | Deep-scan current page for opportunities beyond the main feed | Find event links, course promotions, trending sections       |
| `cross_reference`        | Check an opportunity against user's full interest graph       | "Does this AWS course match user's career trajectory?"       |
| `assess_benefit`         | Evaluate and articulate concrete benefit to the user          | "This certification has a 40% salary premium in user's area" |
| `check_timeliness`       | Determine if opportunity is time-sensitive                    | "Event registration closes in 3 days"                        |
| `find_similar`           | Find similar opportunities the user might have missed         | "3 other React conferences happening this quarter"           |
| `research_topic`         | Use LLM to research a topic for deeper context                | "What's the job market outlook for MLOps engineers?"         |
| `generate_learning_path` | Create a structured learning sequence from available content  | "React beginner → intermediate: 12 videos in order"          |

**Scout behavior:**

```
On page load:
  1. scan_page → identify all potential opportunities on this page
  2. For each opportunity:
     a. cross_reference → does this match user's interests?
     b. assess_benefit → can we explain why this matters?
     c. check_timeliness → is this urgent?
  3. Rank by OpportunityRanker score
  4. Surface top 2-3 via InsightRenderer

On user browsing pattern detection:
  1. "User has viewed 5 similar items" → find_similar for alternatives
  2. "User keeps returning to learning content" → generate_learning_path
  3. "User's interest graph shows a skill gap" → research_topic → suggest courses
```

#### 3. Advisor Agent — Personal Intelligence

**New file:** `brain/src/agents/AdvisorAgent.ts`

**Role:** The user's personal advisor — handles chat conversations, answers questions about preferences, provides career/learning guidance, and makes cross-platform connections.

**Tools:**

| Tool                     | What it does                                                      | Example use                                                                                     |
| ------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `query_knowledge_graph`  | Search user's interest graph for patterns and connections         | "What are my top interests this month?"                                                         |
| `analyze_preferences`    | Deep analysis of preference patterns and trends                   | "Your interest in photography is growing — up 60% in 3 weeks"                                   |
| `compare_items`          | Side-by-side comparison of products/content using user's criteria | "Compare AirPods Pro vs Galaxy Buds based on what matters to you"                               |
| `explain_recommendation` | Explain why something was recommended or hidden                   | "This was hidden because it matches 3 blocked topics"                                           |
| `suggest_actions`        | Recommend next steps based on current context                     | "Based on your research, you might want to set a price alert"                                   |
| `update_preferences`     | Modify user preferences based on conversation                     | "Okay, I've boosted 'mechanical keyboards' and blocked 'membrane keyboards'"                    |
| `generate_insight`       | Create a personalized insight from accumulated data               | "You've been researching cameras for 2 weeks — here's what I've learned about your preferences" |
| `search_memory`          | Search across all stored memories and interactions                | "Last week you mentioned liking Sony — here's what else we know about your audio preferences"   |

**Advisor personality:**

```
The Advisor Agent is:
- Proactive but not pushy — surfaces insights when relevant, stays quiet otherwise
- Opinionated but transparent — "I'd recommend X because..." not just "Here are options"
- Memory-aware — references past conversations and evolving preferences
- Benefit-focused — always explains WHY something matters to this specific user
- Cross-platform aware — connects dots between YouTube viewing and Amazon shopping
```

#### 4. Shopper Agent — Commerce Intelligence

**New file:** `brain/src/agents/ShopperAgent.ts`

**Role:** Expert in shopping behavior — price tracking, deal finding, purchase timing, product research, and cross-platform price comparison.

**Tools:**

| Tool                  | What it does                                                      | Example use                                                         |
| --------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| `track_price`         | Add a product to price tracking with alert rules                  | "Track Sony WH-1000XM5 and alert if < $300"                         |
| `get_price_history`   | Retrieve price history for a tracked product                      | Show sparkline of price over last 30 days                           |
| `compare_prices`      | Compare same product across platforms (Amazon, eBay, Walmart)     | "This is $30 cheaper on eBay right now"                             |
| `analyze_reviews`     | Extract key themes from product reviews                           | "87% mention great noise cancellation, 12% report Bluetooth issues" |
| `find_alternatives`   | Find similar products at different price points                   | "Here are 3 alternatives under $200 with similar specs"             |
| `assess_deal`         | Evaluate if a current price is actually a good deal               | "This 'sale' price is the same as last month — not a real deal"     |
| `predict_price`       | Estimate future price movement based on history                   | "Prices for this category typically drop 20% during Prime Day"      |
| `check_compatibility` | Verify product compatibility with user's existing items           | "This lens is compatible with your Canon R6"                        |
| `calculate_value`     | Compute cost-per-use or value score based on user's usage pattern | "At $349 and your daily use pattern, that's $0.48/day for 2 years"  |

#### 5. Social Agent — Community & Trend Intelligence

**New file:** `brain/src/agents/SocialAgent.ts`

**Role:** Understands social signals — trending topics, community dynamics, influential voices, and social proof relevant to the user's interests.

**Tools:**

| Tool                 | What it does                                                      | Example use                                                       |
| -------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| `detect_trends`      | Identify trending topics in user's interest areas                 | "AI agents is trending in your tech circle this week"             |
| `find_communities`   | Discover groups/communities matching user's interests             | "15k-member espresso enthusiasts group on Facebook"               |
| `identify_voices`    | Find influential/relevant accounts in a topic area                | "Top 5 accounts for ML engineering content on Twitter"            |
| `analyze_discussion` | Summarize key points from a trending discussion                   | "The debate about X boils down to: team A says... team B says..." |
| `find_events`        | Discover events (online/local) matching interests + location      | "3 AI meetups this week within 10 miles"                          |
| `social_proof`       | Find social signals for a product/content (who liked it, reviews) | "4 people in your interest cluster rated this 5 stars"            |
| `content_calendar`   | Detect upcoming launches, releases, events in interest areas      | "New iPhone launches Tuesday — matches your tech interest"        |

#### 6. Guardian Agent — Privacy & Safety

**New file:** `brain/src/agents/GuardianAgent.ts`

**Role:** Runs alongside all other agents to ensure privacy, safety, and user trust. Audits what data is being accessed, blocks overreach, and maintains transparency.

**Tools:**

| Tool                | What it does                                               | Example use                                                          |
| ------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| `audit_data_access` | Log what DOM data each agent is reading                    | Ensure no agent reads sensitive form fields                          |
| `check_consent`     | Verify user has opted in before agent accesses data        | "User disabled profile reading on LinkedIn — block ProfileExtractor" |
| `sanitize_output`   | Strip any PII from agent outputs before display or storage | Remove email addresses from scraped content                          |
| `enforce_limits`    | Enforce frequency limits, rate limits, data caps           | "Scout Agent already surfaced 3 insights — block until tomorrow"     |
| `explain_privacy`   | Generate clear explanation of what data was used           | "This recommendation used: your interest in React + your location"   |
| `redact_for_llm`    | Sanitize data before sending to external LLM provider      | Strip personal details from the prompt sent to Claude/GPT            |

### Tool Execution Framework

**New file:** `brain/src/tools/ToolExecutor.ts`

All agent tools follow a unified execution pattern:

```typescript
interface Tool {
  name: string;
  description: string; // Used by LLM for tool selection
  parameters: JSONSchema; // Input schema
  requires_consent?: string[]; // Permissions needed
  data_sources: ('dom' | 'graph' | 'memory' | 'llm' | 'storage')[];
  max_latency_ms: number; // Performance budget
  cacheable: boolean; // Can results be cached?
  cache_ttl_ms?: number; // Cache duration
}

interface ToolResult {
  success: boolean;
  data: unknown;
  metadata: {
    latency_ms: number;
    data_sources_used: string[];
    cache_hit: boolean;
    consent_checked: boolean;
  };
}
```

**Tool execution pipeline:**

```
Agent requests tool execution
  → GuardianAgent.check_consent(tool.requires_consent)
  → ToolExecutor.checkCache(tool, params)
  → If cache miss: ToolExecutor.execute(tool, params)
      → If tool needs LLM: GuardianAgent.redact_for_llm(params)
      → Execute tool logic
      → GuardianAgent.sanitize_output(result)
      → ToolExecutor.cacheResult(tool, params, result)
  → GuardianAgent.audit_data_access(tool, params, result)
  → Return result to agent
```

### Agent Collaboration

Agents work together, not in isolation. The Brain orchestrates multi-agent tasks:

```
Example: User asks "Should I buy these headphones?"

Brain routes to:
  1. ShopperAgent.analyze_reviews()         → "Reviews are 87% positive, Bluetooth issues noted"
  2. ShopperAgent.compare_prices()          → "Cheapest on Amazon, $20 more on eBay"
  3. ShopperAgent.get_price_history()        → "Price has been stable, unlikely to drop soon"
  4. AdvisorAgent.query_knowledge_graph()    → "You prefer Sony, these are Bose — but you've been exploring"
  5. SocialAgent.social_proof()              → "3 accounts you follow recommend these"
  6. GuardianAgent.sanitize_output()         → Clean and merge

Brain.ResponseMerger combines into:
  "These Bose QC Ultra get strong reviews (87% positive). They're cheapest on Amazon right now
   at $329 — price has been stable so no point waiting. You usually prefer Sony, but the noise
   cancellation benchmarks are nearly identical. 3 audio accounts you follow rate these highly.
   One thing to watch: 12% of reviews mention Bluetooth connectivity issues.

   Want me to track the price or compare with the Sony XM5 instead?"
```

### Agent-LLM Integration

Agents use LLMs as a reasoning layer, not as the entire agent:

```
Agent logic:
  1. Gather data using tools (deterministic, fast, no LLM needed)
  2. Structure the gathered data into a clear context
  3. Ask LLM to reason over the structured data (if needed)
  4. Parse LLM response into structured output
  5. Validate and sanitize before returning

This means:
  - Most tool calls DON'T need an LLM (DOM scraping, graph queries, price lookups)
  - LLM is used for: natural language generation, complex reasoning, pattern synthesis
  - Agents work WITHOUT an LLM (regex/heuristic fallback) — LLM enhances, not enables
  - Cost is minimized: LLM calls only when reasoning is genuinely needed
```

**New file:** `brain/src/agents/AgentLLMBridge.ts`

```typescript
interface AgentLLMRequest {
  agent: string; // Which agent is asking
  task: string; // What reasoning is needed
  structured_context: Record<string, unknown>; // Pre-gathered tool data
  output_schema: JSONSchema; // Expected response format
  fallback: () => unknown; // What to return if LLM unavailable
  max_tokens: number; // Budget per call
}

// LLM call budget per agent per user per day
const LLM_BUDGETS: Record<string, { free: number; pro: number; premium: number }> = {
  filter: { free: 20, pro: 100, premium: 500 },
  scout: { free: 10, pro: 50, premium: 200 },
  advisor: { free: 10, pro: 100, premium: -1 }, // -1 = unlimited
  shopper: { free: 10, pro: 50, premium: 200 },
  social: { free: 5, pro: 30, premium: 100 },
  guardian: { free: -1, pro: -1, premium: -1 }, // Always available
};
```

### Brain State & Learning

The Brain gets smarter over time by learning from user behavior:

**New file:** `brain/src/orchestrator/BrainState.ts`

```typescript
interface BrainState {
  // Which agents produce results the user actually acts on?
  agent_effectiveness: Record<
    string,
    {
      insights_surfaced: number;
      insights_acted_on: number;
      insights_dismissed: number;
      effectiveness_rate: number; // acted / surfaced
    }
  >;

  // Which tools produce the most useful data?
  tool_effectiveness: Record<
    string,
    {
      calls: number;
      contributed_to_action: number; // Result was part of an insight user acted on
    }
  >;

  // User's active goals (inferred from behavior + explicit statements)
  active_goals: Array<{
    description: string; // "Looking for noise-cancelling headphones"
    confidence: number;
    first_signal: number; // Timestamp
    supporting_signals: string[]; // What evidence supports this goal
    status: 'active' | 'completed' | 'abandoned';
  }>;

  // Cross-platform context
  platform_visit_patterns: Record<
    Platform,
    {
      avg_visit_duration_ms: number;
      peak_hours: number[]; // Hours of day user is most active
      common_actions: string[]; // What user typically does on this platform
    }
  >;
}
```

**Learning loop:**

```
User acts on an insight → Brain records:
  - Which agent produced it
  - Which tools were used
  - What context was available
  - Time from insight to action

User dismisses an insight → Brain records:
  - Same metadata
  - Reduces agent confidence for similar future insights

Over time:
  - Brain routes more tasks to high-performing agents
  - Agents prioritize tools with high contribution rates
  - Scout focuses on insight types user acts on most
  - Filter calibrates aggressiveness to user's actual block/show ratio
```

### Modify existing files

**Modify:** `brain/src/recommendation/RecommendationEngine.ts`

- Replace direct scoring with FilterAgent-powered decisions
- FilterAgent uses existing 5-factor scoring as one of its tools
- Adds context-aware overrides (e.g., "user is in shopping mode, relax entertainment filters")

**Modify:** `extension/src/background/messageHandler.ts`

- Route `AGENT_CHAT` messages through Brain → AdvisorAgent (instead of direct LLM call)
- Route `PROCESS_CONTENT` through Brain → FilterAgent
- New message types: `BRAIN_INSIGHT` (proactive insight from Scout), `BRAIN_STATUS` (agent activity for UI)

**Modify:** `extension/src/popup/components/AgentChat.tsx`

- Show which agent is handling the user's query (subtle indicator)
- Show tool usage in real-time: "Checking prices... Analyzing reviews... Querying your preferences..."
- Agent can proactively start conversations: "I noticed you've been researching cameras — want help deciding?"

**Modify:** `extension/manifest.json`

- No new permissions needed — agents operate within existing content script and storage access

### Agent System Performance Budgets

| Operation                     | Budget | Notes                                        |
| ----------------------------- | ------ | -------------------------------------------- |
| Brain task routing            | <10ms  | Must be instant — user shouldn't feel delay  |
| FilterAgent per card          | <15ms  | Runs on every card in feed (50-100 per page) |
| ScoutAgent full scan          | <500ms | Runs once per page load, background          |
| AdvisorAgent chat response    | <3s    | Includes LLM call if needed                  |
| ShopperAgent price comparison | <2s    | May need to query stored data                |
| SocialAgent trend detection   | <200ms | Mostly graph queries                         |
| GuardianAgent audit           | <5ms   | Runs on every tool call — must be invisible  |
| Total brain boot time         | <100ms | Time from page load to agents ready          |

---

## Phase 1.5B: Proactive Platform Intelligence

**Goal:** Transform RecoMe from a passive filter into an active discovery engine — surfacing opportunities, events, courses, deals, and connections tailored to each platform's unique strengths and the user's interest graph. **Powered by the Scout Agent, Shopper Agent, and Social Agent working together.**

### Core Architecture

**New directory:** `extension/src/content/intelligence/`

```
intelligence/
├── PlatformIntelligenceEngine.ts    # Orchestrates per-platform recommendations
├── ProfileExtractor.ts              # Reads user's profile/context from the current page
├── OpportunityRanker.ts             # Scores opportunities against interest graph
├── InsightRenderer.ts               # Renders proactive cards in overlay or toast
├── platforms/
│   ├── LinkedInIntelligence.ts
│   ├── YouTubeIntelligence.ts
│   ├── AmazonIntelligence.ts
│   ├── TwitterIntelligence.ts
│   ├── InstagramIntelligence.ts
│   ├── eBayIntelligence.ts
│   ├── WalmartIntelligence.ts
│   └── FacebookIntelligence.ts
└── sources/
    ├── PageContextSource.ts         # Extract context from current page DOM
    ├── InterestGraphSource.ts       # Query user's knowledge graph
    └── ExternalEnrichment.ts        # Optional LLM enrichment for deeper insights
```

### How It Works (Agent-Powered)

```
User lands on a supported platform
  → Brain receives PAGE_LOAD task
  → Brain.ContextAssembler builds full context:
      - DOM context via ProfileExtractor (page content, profile data)
      - Interest graph via AdvisorAgent.query_knowledge_graph()
      - Active goals from BrainState
  → Brain.TaskRouter dispatches to agents in parallel:
      - ScoutAgent.scan_page()         → finds opportunities on this page
      - ShopperAgent (if commerce)     → finds deals, price drops, alternatives
      - SocialAgent (if social)        → finds trending topics, events, communities
  → Each agent uses its tools to gather + analyze data
  → GuardianAgent audits all data access in parallel
  → Brain.ResponseMerger combines agent outputs
  → OpportunityRanker scores each insight:
      - Interest match (0.35) — alignment with known preferences
      - Benefit clarity (0.25) — can we explain *why* this helps?
      - Timeliness (0.20) — is this urgent or time-sensitive?
      - Novelty (0.20) — is this something they haven't seen?
  → InsightRenderer shows top 2-3 recommendations via overlay or toast
  → User can act (open link, save, dismiss) or ask the Advisor Agent for more detail
  → Brain.FeedbackLoop records user action to improve future routing
```

### Platform-Specific Intelligence

#### LinkedIn — Career & Learning Intelligence

**New file:** `extension/src/content/intelligence/platforms/LinkedInIntelligence.ts`

**Profile extraction (from DOM):**

- Current role, company, industry (from profile page or sidebar)
- Skills and endorsements
- Location
- Education background
- Connection count and engagement patterns

**Proactive recommendations:**

| Signal                    | Insight Type             | Example                                                                                                     |
| ------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Role + skills + interests | Courses & certifications | "AWS Solutions Architect certification is trending among Cloud Engineers in Bangalore — 40% salary premium" |
| Location + industry       | Local events             | "TechCrunch Disrupt Bangalore is in 3 weeks — matches your AI/startup interests"                            |
| Skills gap detection      | Skill development        | "You have Python + ML skills but no MLOps — this free Coursera course bridges that gap"                     |
| Network analysis          | Connection suggestions   | "15 people in your network just joined the 'AI Product Managers' group — relevant to your interests"        |
| Job market signals        | Career insights          | "Demand for your skill set is up 23% this quarter in your area"                                             |
| Content engagement        | Content strategy         | "Posts about [topic] get 3x engagement in your network — you have expertise here"                           |

**Data sources:**

- DOM extraction from LinkedIn profile, feed, and sidebar
- RecoMe interest graph for cross-platform context
- LLM enrichment (optional) for deeper career path analysis

#### YouTube — Learning & Discovery Intelligence

**New file:** `extension/src/content/intelligence/platforms/YouTubeIntelligence.ts`

**Context extraction:**

- Current video topic, channel, category
- Watch history patterns (from RecoMe memory, not YouTube API)
- Subscription overlap with interest categories

**Proactive recommendations:**

| Signal                          | Insight Type        | Example                                                                                                         |
| ------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| Watching learning content       | Learning paths      | "You've watched 8 React videos this week — here's a structured learning path from beginner to advanced"         |
| Repeated topic viewing          | Deep-dive playlists | "You keep coming back to music production — this 20-part series covers everything from DAW basics to mastering" |
| Interest in a creator's niche   | Similar creators    | "You love TechReviewer's audio content — AudioScienceReview does deeper technical analysis"                     |
| Watching event/conference talks | Live events         | "React Conf 2026 is streaming live next week — matches your frontend interests"                                 |
| Entertainment pattern detection | Curated collections | "You watch cooking + travel content on weekends — here's a series combining both"                               |

#### Amazon — Shopping Intelligence

**New file:** `extension/src/content/intelligence/platforms/AmazonIntelligence.ts`

**Context extraction:**

- Current product category, price range, brand
- Browsing pattern (researching vs. impulse)
- Cart/wishlist signals from RecoMe memory

**Proactive recommendations:**

| Signal                        | Insight Type              | Example                                                                                                          |
| ----------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Browsing a product category   | Best-value picks          | "Based on your preference for audio quality over brand, the Moondrop Chu II outperforms headphones 3x its price" |
| Repeat visits to same product | Price & review analysis   | "This product dropped $30 since you first viewed it — reviews mention durability issues though"                  |
| Purchased a main product      | Accessories & complements | "You bought a DSLR last month — these memory cards have the fastest write speeds for your model"                 |
| Seasonal patterns             | Restock reminders         | "You buy protein powder every 6 weeks — your preferred brand is 15% off today"                                   |
| Comparison shopping behavior  | Decision helper           | "You've viewed 5 robot vacuums — want me to compare them side by side?"                                          |

#### Twitter/X — Conversation & Trend Intelligence

**New file:** `extension/src/content/intelligence/platforms/TwitterIntelligence.ts`

**Context extraction:**

- Topics in current feed/timeline
- Trending topics in user's interest areas
- Engagement patterns from RecoMe memory

**Proactive recommendations:**

| Signal                        | Insight Type            | Example                                                                                                         |
| ----------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| Interest in a trending topic  | Spaces & discussions    | "There's a live Space right now on 'AI in Healthcare' with 2.3k listeners — matches your AI + health interests" |
| Following people in a niche   | Community discovery     | "12 accounts you follow are in the 'IndieHackers' community — you'd probably enjoy these 5 accounts too"        |
| Reading about current events  | Context & threads       | "You're reading about the new EU AI Act — here's the best explanatory thread with 50k+ likes"                   |
| Interest overlap detection    | Cross-topic connections | "Your interest in both cooking and chemistry — this food science account bridges both"                          |
| Professional interest signals | Industry voices         | "These 3 accounts are the most cited in your field this week"                                                   |

#### Instagram — Creator & Experience Intelligence

**New file:** `extension/src/content/intelligence/platforms/InstagramIntelligence.ts`

**Proactive recommendations:**

| Signal                       | Insight Type           | Example                                                                                                 |
| ---------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------- |
| Engaging with travel content | Experience suggestions | "You've saved 15 Japan travel posts — cherry blossom season starts in 2 weeks, here's a planning guide" |
| Following fitness creators   | Program discovery      | "Based on your interest in calisthenics, this creator just launched a free 30-day program"              |
| Engaging with food content   | Local discovery        | "3 restaurants you'd love just opened in your area — they match your sushi and ramen interests"         |
| Shopping engagement          | Creator drops & sales  | "A creator you follow is launching a collab collection tomorrow — aligns with your streetwear interest" |

#### eBay — Deal & Collector Intelligence

**New file:** `extension/src/content/intelligence/platforms/eBayIntelligence.ts`

**Proactive recommendations:**

| Signal                       | Insight Type        | Example                                                                                                        |
| ---------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------- |
| Searching for specific items | Rare finds alert    | "A vintage 1978 Fender Stratocaster just listed — matches your guitar interest and is priced 20% below market" |
| Watching auctions            | Bidding strategy    | "This auction ends in 2 hours — similar items sold for $50-$80, current bid is $35"                            |
| Repeat category browsing     | Price trend insight | "Prices for mechanical keyboards have dropped 15% this month — good time to buy"                               |
| Purchase history patterns    | Complementary deals | "You collect vinyl — this seller has a lot of 50 jazz records ending today at $0.99 start"                     |

#### Walmart — Value & Household Intelligence

**New file:** `extension/src/content/intelligence/platforms/WalmartIntelligence.ts`

**Proactive recommendations:**

| Signal                   | Insight Type         | Example                                                                                      |
| ------------------------ | -------------------- | -------------------------------------------------------------------------------------------- |
| Regular grocery patterns | Weekly deals         | "5 items on your regular list are on rollback this week — save $12"                          |
| Browsing home categories | Seasonal suggestions | "Spring cleaning deals start tomorrow — based on your home improvement interests"            |
| Price-sensitive browsing | Store comparison     | "This item is $8 cheaper at Walmart than where you saw it on Amazon last week"               |
| Interest in a brand      | New arrivals         | "Great Value just launched an organic line — matches your interest in budget healthy eating" |

#### Facebook — Community & Event Intelligence

**New file:** `extension/src/content/intelligence/platforms/FacebookIntelligence.ts`

**Proactive recommendations:**

| Signal                      | Insight Type              | Example                                                                                                    |
| --------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Interest graph + location   | Local events              | "3 tech meetups this week in your city match your AI and startup interests"                                |
| Group engagement patterns   | Community discovery       | "There's a 15k-member group for 'Home Espresso Enthusiasts' — matches your coffee interest"                |
| Marketplace browsing        | Deal alerts               | "A Herman Miller chair just listed in your area for $200 — these usually go for $400+"                     |
| Interest in specific topics | Fundraiser/cause matching | "A local coding bootcamp for underrepresented groups is fundraising — aligns with your education interest" |

### Insight Delivery System

**New file:** `extension/src/content/intelligence/InsightRenderer.ts`

Insights are delivered through multiple channels:

| Channel                 | When                             | Format                                                   |
| ----------------------- | -------------------------------- | -------------------------------------------------------- |
| Overlay card            | User opens floating overlay      | Ranked list of top insights                              |
| Contextual toast        | Highly relevant + time-sensitive | Non-intrusive bottom-right toast, auto-dismiss 8s        |
| Agent proactive message | High-value insight detected      | Agent initiates: "I noticed something you might like..." |
| Badge on overlay pill   | New insights available           | Small dot/count badge on the floating pill               |

**Insight card structure:**

```typescript
interface ProactiveInsight {
  id: string;
  platform: Platform;
  type: 'event' | 'course' | 'deal' | 'connection' | 'content' | 'trend' | 'alert';
  title: string; // "AWS Certification trending in your area"
  body: string; // Brief description
  benefit: string; // "40% salary premium for certified engineers"
  relevance_score: number; // 0-1, from OpportunityRanker
  source_signals: string[]; // What user interests triggered this
  action_url?: string; // Direct link to the opportunity
  action_label?: string; // "View course" / "Join event" / "See deal"
  expires_at?: number; // Time-sensitive insights expire
  platform_context: Record<string, unknown>; // Platform-specific metadata
}
```

**Frequency controls:**

- Max 3 proactive insights per platform visit
- Max 8 insights per day across all platforms
- User can snooze per-platform or globally
- Insights must score > 0.6 relevance to surface
- Exponential backoff if user dismisses repeatedly

### Privacy Considerations

```
CRITICAL: Profile data extraction is READ-ONLY and LOCAL-ONLY

- ProfileExtractor reads DOM elements that are already visible to the user
- No data is sent to any server (unless user has AI enhancement enabled — then
  only the insight generation prompt goes to the chosen LLM provider)
- Profile signals are stored in the local knowledge graph alongside other preferences
- Users can disable profile extraction per-platform in settings
- Users can disable proactive insights entirely
- Clear "Why this recommendation?" explanation on every insight
```

**Modify:** `extension/src/popup/components/SettingsPanel.tsx`

- Add "Proactive Insights" toggle (global on/off)
- Per-platform insight toggles
- Insight frequency control (low / medium / high)
- "Profile reading" toggle with explanation of what data is read

**Modify:** `extension/manifest.json`

- No new permissions needed — content scripts already have DOM access on supported sites

### Implementation Priority

```
Phase 1.5A:  Brain + Agent framework + Tool executor + Guardian Agent
             (foundation — everything else depends on this)

Phase 1.5B-a: FilterAgent + ScoutAgent + LinkedIn + YouTube + Amazon
              (highest value platforms, core agents)

Phase 1.5B-b: ShopperAgent + AdvisorAgent + Twitter + Instagram
              (commerce intelligence, social platforms)

Phase 1.5B-c: SocialAgent + eBay + Walmart + Facebook
              (community/marketplace, full agent suite)
```

**Why this order:**

1. Brain + Agent framework first — it's the foundation for everything in V2+
2. FilterAgent replaces V1's scoring with smarter, context-aware filtering
3. ScoutAgent powers proactive insights on the highest-value platforms (LinkedIn, YouTube, Amazon)
4. ShopperAgent + AdvisorAgent unlock the "personal assistant" experience
5. SocialAgent completes the suite for community platforms

LinkedIn is first for platform intelligence because the profile data is richest and the recommendations (career, courses, events) have the clearest ROI. YouTube and Amazon follow because they have the most active user bases.

---

## Phase 2: Cloud Sync + Tiered Pricing

**Goal:** Enable cross-device continuity and establish a sustainable revenue model.

### 2A. Cloud Sync Architecture

**New directory:** `cloud/` — Standalone sync backend

```
cloud/
├── src/
│   ├── server.ts              # Express/Hono API server
│   ├── auth/
│   │   ├── AuthController.ts  # Login/register/token refresh
│   │   ├── OAuthProvider.ts   # Google, GitHub OAuth
│   │   └── TokenService.ts    # JWT issuance + refresh tokens
│   ├── sync/
│   │   ├── SyncController.ts  # Push/pull/conflict resolution
│   │   ├── SyncEngine.ts      # CRDT-based merge logic
│   │   ├── DeltaCompressor.ts # Only sync changes since last sync
│   │   └── ConflictResolver.ts # Last-write-wins with manual override
│   ├── storage/
│   │   ├── UserDataStore.ts   # Per-user encrypted blob storage
│   │   └── EncryptionService.ts # Client-side E2E encryption keys
│   ├── billing/
│   │   ├── BillingController.ts
│   │   ├── StripeService.ts
│   │   └── UsageTracker.ts
│   └── middleware/
│       ├── rateLimiter.ts
│       └── authMiddleware.ts
├── prisma/
│   └── schema.prisma          # User, SyncState, Subscription tables
├── Dockerfile
├── docker-compose.yml
└── package.json
```

**Technology choices:**

- **Server:** Hono (lightweight, edge-deployable) on Cloudflare Workers or Node.js
- **Database:** PostgreSQL (users, subscriptions) + R2/S3 (encrypted data blobs)
- **Auth:** JWT with refresh tokens, OAuth (Google, GitHub)
- **Encryption:** AES-256-GCM, key derived from user password — server never sees plaintext data
- **Sync protocol:** Delta-based CRDT (Conflict-free Replicated Data Type) for eventual consistency

#### Sync Data Model

```typescript
interface SyncPayload {
  version: number; // Schema version for migration
  deviceId: string; // Unique per browser/device
  timestamp: number; // Last sync time
  deltas: SyncDelta[]; // Only changes since last sync
  checksum: string; // Integrity verification
}

interface SyncDelta {
  collection: 'memory' | 'graph' | 'preferences' | 'watchlist' | 'achievements';
  operation: 'upsert' | 'delete';
  key: string; // Entity ID
  value: EncryptedBlob; // E2E encrypted
  vectorClock: Record<string, number>; // Per-device logical clock
}
```

#### Conflict Resolution Strategy

| Conflict Type                        | Resolution                                                      | Rationale                                            |
| ------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------- |
| Same entity modified on 2 devices    | Vector clock comparison → latest wins                           | Simple, predictable                                  |
| Block on device A, boost on device B | Block wins (safety-first)                                       | Prefer user's restrictive intent                     |
| Achievement unlocked on both         | Union (keep both timestamps, earliest wins)                     | Achievements are additive                            |
| Settings conflict                    | Device-specific settings stay local, shared settings use latest | Some settings (overlay position) are device-specific |

**New file (extension):** `extension/src/sync/SyncClient.ts`

- Handles push/pull with cloud API
- Delta computation: diff current state against last-synced snapshot
- E2E encryption: encrypt before upload, decrypt after download
- Retry with exponential backoff on network failure
- Sync triggers: on settings change, every 15 minutes (configurable), on browser startup

**New file (extension):** `extension/src/sync/SyncManager.ts`

- Orchestrates sync lifecycle: auth → compute deltas → encrypt → push → pull → decrypt → merge
- Conflict resolution on client side
- Progress events for UI feedback

**New file (extension):** `extension/src/sync/EncryptionClient.ts`

- AES-256-GCM encryption using Web Crypto API
- Key derivation from user password via PBKDF2 (100k iterations)
- Key stored in `chrome.storage.local` (encrypted with browser's storage encryption)

**Modify:** `extension/src/popup/components/SettingsPanel.tsx`

- Add "Cloud Sync" section: sign in, sync status, last synced, sync now button
- Device management: list synced devices, remove devices

**Modify:** `extension/manifest.json`

- Add cloud API URL to CSP

### 2B. Tiered Pricing Model

#### Tier Structure

| Feature                 | Free         | Pro ($4.99/mo)  | Premium ($9.99/mo)         |
| ----------------------- | ------------ | --------------- | -------------------------- |
| Core recommendations    | Yes          | Yes             | Yes                        |
| Platform adapters       | 3            | 8 (all)         | 8 (all)                    |
| Agent chat (regex mode) | Yes          | Yes             | Yes                        |
| Agent chat (AI mode)    | 10/day       | 100/day         | Unlimited                  |
| Cloud sync              | No           | Yes (2 devices) | Yes (unlimited)            |
| Smart dwell prompts     | Basic        | Advanced        | Advanced + custom rules    |
| Proactive insights      | 3 types      | All types       | All + custom triggers      |
| Achievements            | Basic set    | Full set        | Full + custom achievements |
| Knowledge graph depth   | 100 entities | 1,000 entities  | Unlimited                  |
| Data export             | JSON only    | JSON + CSV      | JSON + CSV + API access    |
| Overlay themes          | Default      | 5 themes        | Custom themes              |
| Price tracking          | No           | 5 items         | Unlimited                  |
| Priority support        | No           | Email           | Email + Discord            |

#### Implementation

**New file (extension):** `extension/src/billing/LicenseManager.ts`

- Validates subscription status via cloud API
- Caches license locally (valid for 7 days offline)
- Feature gating: `LicenseManager.canUse('cloud_sync')` → boolean
- Grace period: 3 days after subscription expires before downgrading

**New file (extension):** `extension/src/billing/FeatureGate.ts`

- Wraps feature access checks
- Shows upgrade prompts when free users hit limits
- Tracks usage counters (AI chat calls/day, tracked prices, etc.)

**New file (cloud):** `cloud/src/billing/StripeService.ts`

- Stripe Checkout for subscription creation
- Webhook handler for payment events (success, failure, cancellation)
- Prorated upgrades/downgrades

**Modify:** `extension/src/popup/PopupApp.tsx`

- Add subscription badge in header
- Upgrade prompts integrated naturally (not aggressive)

**New page:** `website/pricing.html`

- Feature comparison table
- Stripe checkout integration
- FAQ about billing

---

## Phase 3: Platform Imports + Price Tracking

**Goal:** Deeply understand users through their existing platform data and provide actionable shopping intelligence.

### 3A. Platform Data Imports

Read users' existing likes, wishlists, watch history, and purchase history from supported platforms.

**New directory:** `extension/src/importers/`

```
importers/
├── ImportManager.ts           # Orchestrates imports, dedup, progress
├── ImportScheduler.ts         # Periodic re-imports (daily/weekly)
├── platforms/
│   ├── YouTubeImporter.ts     # Watch history, liked videos, subscriptions
│   ├── AmazonImporter.ts      # Purchase history, wishlists, reviews
│   ├── TwitterImporter.ts     # Likes, bookmarks, followed topics
│   ├── InstagramImporter.ts   # Saved posts, liked posts
│   ├── RedditImporter.ts      # Upvoted posts, saved, subscribed subreddits
│   ├── SpotifyImporter.ts     # Liked songs, playlists, top artists
│   └── NetflixImporter.ts     # Watch history, ratings, My List
└── parsers/
    ├── DataTakeoutParser.ts   # Google/Meta/Twitter data export parsing
    └── LiveScrapeParser.ts    # DOM-based extraction from logged-in pages
```

#### Import Methods (per platform)

| Platform  | Method 1 (Preferred)          | Method 2 (Fallback)          | Data Available                |
| --------- | ----------------------------- | ---------------------------- | ----------------------------- |
| YouTube   | DOM scrape (history page)     | Google Takeout JSON          | Watch history, likes, subs    |
| Amazon    | DOM scrape (order history)    | —                            | Purchases, wishlists, reviews |
| Twitter/X | API (if available)            | DOM scrape (likes/bookmarks) | Likes, bookmarks, follows     |
| Instagram | Meta data export JSON         | DOM scrape (saved)           | Saves, likes                  |
| Reddit    | Reddit API (OAuth)            | DOM scrape                   | Upvotes, saves, subs          |
| Spotify   | Spotify API (OAuth)           | Data export JSON             | Listens, likes, playlists     |
| Netflix   | DOM scrape (viewing activity) | —                            | Watch history, ratings        |

**New file:** `extension/src/importers/ImportManager.ts`

```typescript
interface ImportResult {
  platform: string;
  itemsFound: number;
  itemsNew: number; // Not already in memory
  itemsDuplicate: number; // Already known
  preferencesInferred: PreferenceInference[];
  errors: ImportError[];
}

interface PreferenceInference {
  topic: string;
  confidence: number; // Based on frequency/recency
  source: string; // "youtube_likes", "amazon_purchases"
  evidence: string[]; // Item titles that support this inference
}
```

**Import flow:**

1. User initiates import from settings or overlay
2. ImportManager checks current tab — if on target platform, uses DOM scrape
3. Otherwise, prompts for data export file upload
4. Parser extracts structured data
5. Entity extraction (existing pipeline) runs on imported items
6. Dedup against existing memory entries
7. Write new memory entries with `source_type: 'platform_import'`
8. Run preference inference: aggregate imported data into high-confidence preferences
9. Update knowledge graph with new entities and relationships

**New file:** `extension/src/importers/platforms/YouTubeImporter.ts`

```typescript
class YouTubeImporter {
  // Navigate to youtube.com/feed/history
  // Scroll and collect video entries (title, channel, date)
  // Parse liked videos from youtube.com/playlist?list=LL
  // Extract subscriptions from youtube.com/feed/channels

  async importFromDOM(): Promise<RawImportData> { ... }
  async importFromTakeout(file: File): Promise<RawImportData> { ... }
}
```

**Modify:** `extension/src/popup/components/SettingsPanel.tsx`

- Add "Import Data" section with platform cards
- Import progress indicator
- Import history (last imported, items count)

**Modify:** `brain/src/memory/MemoryService.ts`

- Add `recordImportedPreferences(items: ImportResult[])` method
- Batch write with source tracking

### 3B. Price Tracking & Alerts

**New directory:** `brain/src/commerce/tracking/`

```
tracking/
├── PriceTracker.ts         # Core tracking logic
├── PriceStore.ts           # IndexedDB storage for price history
├── PriceAlertEngine.ts     # Alert rules and notification dispatch
└── PriceChartData.ts       # Prepare data for sparkline charts
```

**New file:** `brain/src/commerce/tracking/PriceTracker.ts`

- Records price snapshots when user visits product pages
- Stores: `{ productId, url, title, price, currency, timestamp, platform }`
- Price extraction leverages existing platform adapters' DOM parsing
- Check interval: every visit + background check every 6 hours (via alarm)

**New file:** `brain/src/commerce/tracking/PriceAlertEngine.ts`

- Alert rules:
  - Price drops below user-set threshold
  - Price drops X% from highest recorded
  - Price reaches all-time low
  - Price increases (alert before it goes higher)
- Notifications via `chrome.notifications` API + overlay toast

**Modify:** `extension/src/popup/components/AgentChat.tsx`

- Agent can show price history sparklines inline
- "Track this price" quick action
- "Price dropped!" proactive insight integration

**Modify:** `extension/manifest.json`

- Add `notifications` permission
- Add alarm for periodic price checks

---

## Phase 4: Preference Packs + Mobile Companion

**Goal:** Enable social discovery and extend RecoMe beyond desktop browsers.

### 4A. Preference Packs (Shareable Profiles)

Allow users to create and share curated preference profiles.

**New directory:** `extension/src/social/`

```
social/
├── PackBuilder.ts          # Create preference packs
├── PackRenderer.ts         # Visual pack cards
├── PackImporter.ts         # Apply a pack to your profile
└── PackStore.ts            # Browse/discover packs
```

**Pack structure:**

```typescript
interface PreferencePack {
  id: string;
  name: string; // "Audiophile Essentials"
  description: string;
  author: string; // Anonymous or username
  category: string; // "Audio", "Gaming", "Cooking"
  preferences: PackPreference[];
  version: number;
  downloads: number;
  rating: number;
}

interface PackPreference {
  topic: string; // "open-back headphones"
  sentiment: 'positive' | 'negative';
  strength: number; // 0-1
  explanation: string; // "Open-back for home listening"
}
```

**Features:**

- Create packs from your preferences (select which to include)
- Share via link or QR code
- Browse community packs (stored on cloud, requires free account)
- Preview before applying (shows what would change)
- Merge mode: combine pack preferences with your own (doesn't overwrite)
- Pack categories: curated collections for new users to bootstrap quickly

**New page:** `website/packs.html`

- Browse community packs
- Featured/trending packs
- Category filtering

### 4B. Mobile Companion App

**New directory:** `mobile/` — React Native app

```
mobile/
├── src/
│   ├── App.tsx
│   ├── screens/
│   │   ├── DashboardScreen.tsx    # Stats, recent activity
│   │   ├── AgentScreen.tsx        # Chat with agent
│   │   ├── PreferencesScreen.tsx  # View/edit preferences
│   │   ├── WatchlistScreen.tsx    # Price tracking, wishlists
│   │   ├── InsightsScreen.tsx     # Proactive insights feed
│   │   └── SettingsScreen.tsx     # Sync, subscription, etc.
│   ├── components/
│   │   ├── RecommendationCard.tsx
│   │   ├── PriceChart.tsx
│   │   └── InsightBanner.tsx
│   ├── services/
│   │   ├── SyncService.ts        # Cloud sync (same protocol as extension)
│   │   ├── NotificationService.ts # Push notifications
│   │   └── AgentService.ts       # Agent chat via cloud API
│   └── hooks/
│       └── useSync.ts
├── ios/
├── android/
└── package.json
```

**Key decisions:**

- React Native for cross-platform (iOS + Android)
- Shares cloud sync protocol with extension
- Agent chat works via cloud API (not local — no service worker on mobile)
- Push notifications for: price alerts, insights, achievement unlocks
- Read-heavy: mainly viewing preferences, insights, watchlist — not for browsing
- Deep links: "View on Amazon" opens browser where extension takes over

**Cloud additions for mobile:**

- Push notification service (Firebase Cloud Messaging)
- Mobile-specific API endpoints for batched data retrieval
- WebSocket for real-time agent chat

---

## Phase 5: Collaborative Filtering + Developer API

**Goal:** Enable anonymous, privacy-preserving collective intelligence and open RecoMe as a platform.

### 5A. Privacy-Preserving Collaborative Filtering

Allow users to opt into anonymous preference sharing for better recommendations.

**New directory (cloud):** `cloud/src/collaborative/`

```
collaborative/
├── AnonymousAggregator.ts     # Collects anonymized preference vectors
├── SimilarityEngine.ts        # User-to-user similarity (cosine similarity)
├── CollaborativeRecommender.ts # "Users like you also liked..."
├── DifferentialPrivacy.ts     # Noise injection for privacy
└── FederatedLearning.ts       # Future: on-device model training
```

#### Privacy Architecture

```
User's device                          Cloud
┌─────────────┐                  ┌──────────────────┐
│ Preferences  │                  │ Aggregate only    │
│ (detailed)   │─── anonymize ──▶│ (no individual    │
│              │    + noise       │  profiles stored) │
│              │                  │                    │
│              │◀── similar ─────│ Similarity matches │
│              │    vectors       │ (anonymized)       │
└─────────────┘                  └──────────────────┘
```

**How it works:**

1. User opts in (explicit consent, off by default)
2. Extension computes a preference vector: 50-dimensional embedding of interests
3. Differential privacy: add calibrated noise (ε=1.0) before upload
4. Cloud stores only the noisy vector — no user ID, no individual preferences
5. Similarity computation: find clusters of similar vectors
6. Return: "Users with similar taste also showed interest in: [topics]"
7. Extension uses these as weak signals (confidence: 0.2) in the scoring pipeline

**Key constraint:** Individual preferences are NEVER uploaded. Only anonymized, noisy aggregate vectors. The cloud cannot reconstruct any individual's browsing history.

**Modify (extension):** `brain/src/recommendation/RecommendationEngine.ts`

- Add optional 6th scoring factor: `collaborativeAffinity` (weight: 0.1, lowest of all factors)
- Only active when user has opted in AND cloud returns similar-user data

### 5B. Developer API

**New directory (cloud):** `cloud/src/api/v1/`

```
api/v1/
├── recommendations.ts    # GET /api/v1/recommendations?context=...
├── preferences.ts        # GET/POST /api/v1/preferences
├── insights.ts           # GET /api/v1/insights
├── webhooks.ts           # POST /api/v1/webhooks (subscribe to events)
└── apiKeys.ts            # API key management
```

**API use cases:**

- Third-party apps integrating RecoMe recommendations
- Content creators understanding audience preferences (aggregated, anonymized)
- E-commerce sites personalizing based on RecoMe signals (with user consent)
- Research: anonymized recommendation quality metrics

**API tier limits:**

| Endpoint           | Free    | Pro     | Premium  |
| ------------------ | ------- | ------- | -------- |
| Recommendations    | 100/day | 10k/day | 100k/day |
| Preferences (read) | 50/day  | 5k/day  | 50k/day  |
| Webhooks           | 2       | 10      | 50       |
| Rate limit         | 10/min  | 100/min | 1000/min |

**Developer portal:** `website/developers.html`

- API documentation
- Interactive API explorer
- API key management
- Usage dashboard
- Code examples (JavaScript, Python, cURL)

---

## Cross-Cutting Concerns

### Migration Strategy (V1 → V2)

```
V1 User installs V2 update
  → Migration runner detects V1 data format
  → Automatically converts IndexedDB schema (additive, no data loss)
  → Existing preferences preserved as-is
  → New features disabled by default (opt-in)
  → Welcome modal explains what's new
```

### Performance Budgets

| Component                | Budget              | Notes                           |
| ------------------------ | ------------------- | ------------------------------- |
| Overlay bundle           | <50KB gzipped       | Loaded on every page            |
| Smart prompt check       | <5ms                | Runs per scroll event           |
| Sync delta computation   | <100ms              | Runs every 15min                |
| Price check (background) | <2s per item        | Rate-limited to avoid detection |
| Import parser            | <10s for 1000 items | Web Worker for large imports    |
| Collaborative vector     | <1KB upload         | 50 floats × 4 bytes + noise     |

### Security Model

| Concern                   | Mitigation                                                       |
| ------------------------- | ---------------------------------------------------------------- |
| Cloud data breach         | E2E encryption — server only stores encrypted blobs              |
| API key theft             | Per-key rate limits, key rotation, abuse detection               |
| Import scraping detection | Randomized delays, respectful rate limiting, user-initiated only |
| Collaborative privacy     | Differential privacy (ε=1.0), no individual profiles on server   |
| Payment security          | Stripe handles all payment data, no card numbers stored          |

### Testing Strategy

| Phase   | Test Focus                                                                               |
| ------- | ---------------------------------------------------------------------------------------- |
| Phase 1 | Overlay shadow DOM isolation, prompt fatigue limits, cross-page state                    |
| Phase 2 | Sync conflict resolution (simulate multi-device), encryption roundtrip, Stripe webhooks  |
| Phase 3 | Import parser accuracy per platform, price extraction reliability, DOM change resilience |
| Phase 4 | Pack merge correctness, mobile-cloud sync parity, push notification delivery             |
| Phase 5 | Differential privacy guarantees (statistical tests), API rate limiting under load        |

---

## Execution Timeline

```
Phase 1: Floating Overlay + Smart Dwell       → Foundation for V2 UX
Phase 2: Cloud Sync + Pricing                  → Revenue + cross-device
Phase 3: Platform Imports + Price Tracking     → Deep understanding + utility
Phase 4: Preference Packs + Mobile             → Social + mobile reach
Phase 5: Collaborative Filtering + API         → Platform play
```

Each phase is independently valuable and shippable. No phase depends on a later phase. Phases 1-2 are the critical path for monetization.

---

## Success Metrics

| Metric                     | V1 Baseline | V2 Target                              |
| -------------------------- | ----------- | -------------------------------------- |
| Daily active users         | —           | 10k (6 months post-launch)             |
| Overlay engagement         | N/A         | 40% of users interact daily            |
| Smart prompt response rate | N/A         | >25% (vs <5% for like/dislike buttons) |
| Cloud sync adoption        | N/A         | 60% of active users                    |
| Paid conversion            | N/A         | 5% free → Pro, 1% Pro → Premium        |
| Import completion rate     | N/A         | >70% start → finish                    |
| Price alert accuracy       | N/A         | >90% correct price extraction          |
| Mobile DAU / Extension DAU | N/A         | 30%                                    |
| API developer signups      | N/A         | 500 in first year                      |
