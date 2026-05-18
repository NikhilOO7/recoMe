# Smriti Memory System - Visual Guide

> Visual documentation of RecoMe's human-like memory architecture.

---

## Table of Contents

1. [Memory System Overview](#memory-system-overview)
2. [Context Buckets](#context-buckets)
3. [Memory Lanes](#memory-lanes)
4. [Forgetting Lifecycle](#forgetting-lifecycle)
5. [Pattern Detection](#pattern-detection)
6. [Memory Retrieval Flow](#memory-retrieval-flow)
7. [Data Model Diagrams](#data-model-diagrams)

---

## Memory System Overview

### The Big Picture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                     │
│                           Smriti MEMORY SYSTEM                                   │
│                                                                                     │
│   "Memory that works like yours - context-aware, pattern-forming, and forgetful"   │
│                                                                                     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│                                                                                     │
│    ┌───────────────────────────────────────────────────────────────────────────┐   │
│    │                          CONTEXT LAYER                                    │   │
│    │                                                                          │   │
│    │   ┌─────┐ ┌─────────┐ ┌──────────┐ ┌─────────────┐ ┌────────┐           │   │
│    │   │WORK │ │LEARNING │ │ SHOPPING │ │ENTERTAINMENT│ │ SOCIAL │           │   │
│    │   └──┬──┘ └────┬────┘ └────┬─────┘ └──────┬──────┘ └───┬────┘           │   │
│    │      │         │           │              │            │                 │   │
│    │      └─────────┴───────────┴──────────────┴────────────┘                 │   │
│    │                            │                                             │   │
│    │                            ▼                                             │   │
│    │                    ┌──────────────┐                                      │   │
│    │                    │   GENERAL    │  ◄── Always active overlay           │   │
│    │                    │  (forever)   │                                      │   │
│    │                    └──────────────┘                                      │   │
│    │                                                                          │   │
│    └───────────────────────────────────────────────────────────────────────────┘   │
│                                        │                                           │
│                                        ▼                                           │
│    ┌───────────────────────────────────────────────────────────────────────────┐   │
│    │                          MEMORY LANES                                     │   │
│    │                                                                          │   │
│    │   ┌─────────────────────────────────────────────────────────────────┐   │   │
│    │   │ SHORT-TERM                                                      │   │   │
│    │   │ [1][2][3][4][5][6][7][8][9][10]...[20] ◄── Ring buffer (20)    │   │   │
│    │   │ Session interactions, highest recency                           │   │   │
│    │   └─────────────────────────────────────────────────────────────────┘   │   │
│    │                                  │                                       │   │
│    │                                  ▼ eviction                              │   │
│    │   ┌─────────────────────────────────────────────────────────────────┐   │   │
│    │   │ MID-TERM (Pattern Cards)                                        │   │   │
│    │   │                                                                 │   │   │
│    │   │ ┌────────────────────────┐  ┌────────────────────────┐        │   │   │
│    │   │ │ Card: blocks crypto   │  │ Card: likes cameras    │        │   │   │
│    │   │ │ Status: CORE 100%     │  │ Status: DREAM 50%      │        │   │   │
│    │   │ │ Confidence: 0.95      │  │ Confidence: 0.75       │        │   │   │
│    │   │ └────────────────────────┘  └────────────────────────┘        │   │   │
│    │   │                                                                 │   │   │
│    │   │ Decays: 30d → Dream → 90d → Forgotten → 180d → Deleted          │   │   │
│    │   └─────────────────────────────────────────────────────────────────┘   │   │
│    │                                                                          │   │
│    │   ┌─────────────────────────────────────────────────────────────────┐   │   │
│    │   │ WORKING SET                                                     │   │   │
│    │   │                                                                 │   │   │
│    │   │ current_research: "mirrorless cameras"                          │   │   │
│    │   │ criteria: ["compact", "good video", "$1000-2000"]               │   │   │
│    │   │ candidates: ["Sony A7C II", "Fuji X-T5", "Canon R8"]            │   │   │
│    │   │                                                                 │   │   │
│    │   │ Faster decay: 7d → Dream → 30d → Forgotten → 90d → Deleted      │   │   │
│    │   └─────────────────────────────────────────────────────────────────┘   │   │
│    │                                                                          │   │
│    │   ┌─────────────────────────────────────────────────────────────────┐   │   │
│    │   │ FACTS & PREFERENCES (PERMANENT)                                 │   │   │
│    │   │                                                                 │   │   │
│    │   │ blocked_forever: [crypto, gambling, clickbait, drama]           │   │   │
│    │   │ always_interested: [technology, photography, productivity]      │   │   │
│    │   │ followed_creators: [MKBHD, LinusTechTips]                       │   │   │
│    │   │                                                                 │   │   │
│    │   │ NEVER DECAYS - Explicit removal only                            │   │   │
│    │   └─────────────────────────────────────────────────────────────────┘   │   │
│    │                                                                          │   │
│    │   ┌─────────────────────────────────────────────────────────────────┐   │   │
│    │   │ LONG-TERM TIMELINE (Append-Only Log)                            │   │   │
│    │   │                                                                 │   │   │
│    │   │ 2024-01-01 ─► blocked:crypto                                    │   │   │
│    │   │ 2024-01-05 ─► pattern_created:blocks_crypto                     │   │   │
│    │   │ 2024-02-15 ─► decay:gaming (core → dream)                       │   │   │
│    │   │ 2024-03-01 ─► reactivation:gaming (dream → core)                │   │   │
│    │   │ ...                                                             │   │   │
│    │   └─────────────────────────────────────────────────────────────────┘   │   │
│    │                                                                          │   │
│    └───────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Context Buckets

### Context Detection Logic

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CONTEXT DETECTION FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   INPUT SIGNALS                                                             │
│   ─────────────                                                             │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌──────────────┐  │
│   │    Time     │   │  Platform   │   │   Topics    │   │   Explicit   │  │
│   │             │   │             │   │             │   │              │  │
│   │ • Hour      │   │ • YouTube   │   │ • Detected  │   │ • User       │  │
│   │ • Day       │   │ • Amazon    │   │   entities  │   │   switched   │  │
│   │ • Weekend   │   │ • Twitter   │   │             │   │   context    │  │
│   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘   └──────┬───────┘  │
│          │                 │                 │                  │          │
│          └─────────────────┴─────────────────┴──────────────────┘          │
│                                      │                                      │
│                                      ▼                                      │
│                           ┌─────────────────────┐                           │
│                           │  CONTEXT DETECTOR   │                           │
│                           │                     │                           │
│                           │  Score each context │                           │
│                           │  Return highest     │                           │
│                           └──────────┬──────────┘                           │
│                                      │                                      │
│                                      ▼                                      │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                                                                     │  │
│   │  ┌─────────────────────────────────────────────────────────────┐   │  │
│   │  │ WORK                                                        │   │  │
│   │  │ • Monday-Friday, 9am-5pm                                    │   │  │
│   │  │ • Programming/productivity content                          │   │  │
│   │  │ • Business-related searches                                 │   │  │
│   │  │                                                             │   │  │
│   │  │ Boost: productivity, coding, business                       │   │  │
│   │  │ Suppress: gaming, entertainment, social drama               │   │  │
│   │  └─────────────────────────────────────────────────────────────┘   │  │
│   │                                                                     │  │
│   │  ┌─────────────────────────────────────────────────────────────┐   │  │
│   │  │ LEARNING                                                    │   │  │
│   │  │ • Tutorial/course content detected                          │   │  │
│   │  │ • Educational keywords in titles                            │   │  │
│   │  │                                                             │   │  │
│   │  │ Boost: how-to, educational, courses                         │   │  │
│   │  │ Suppress: distractions, clickbait                           │   │  │
│   │  └─────────────────────────────────────────────────────────────┘   │  │
│   │                                                                     │  │
│   │  ┌─────────────────────────────────────────────────────────────┐   │  │
│   │  │ SHOPPING                                                    │   │  │
│   │  │ • Amazon, eBay, Walmart detected                            │   │  │
│   │  │ • Product comparison content                                │   │  │
│   │  │                                                             │   │  │
│   │  │ Boost: reviews, comparisons, deals                          │   │  │
│   │  │ Suppress: off-topic recommendations                         │   │  │
│   │  └─────────────────────────────────────────────────────────────┘   │  │
│   │                                                                     │  │
│   │  ┌─────────────────────────────────────────────────────────────┐   │  │
│   │  │ ENTERTAINMENT                                               │   │  │
│   │  │ • Evening (after 6pm) / weekends                            │   │  │
│   │  │ • Gaming, movies, music content                             │   │  │
│   │  │                                                             │   │  │
│   │  │ Boost: gaming, movies, music, fun                           │   │  │
│   │  │ Suppress: work-related (if user preference)                 │   │  │
│   │  └─────────────────────────────────────────────────────────────┘   │  │
│   │                                                                     │  │
│   │  ┌─────────────────────────────────────────────────────────────┐   │  │
│   │  │ SOCIAL                                                      │   │  │
│   │  │ • Twitter, Facebook detected                                │   │  │
│   │  │ • Social/news content                                       │   │  │
│   │  │                                                             │   │  │
│   │  │ Boost: current events (if interested)                       │   │  │
│   │  │ Suppress: based on user blocks                              │   │  │
│   │  └─────────────────────────────────────────────────────────────┘   │  │
│   │                                                                     │  │
│   │  ┌─────────────────────────────────────────────────────────────┐   │  │
│   │  │ GENERAL ← ALWAYS ACTIVE                                     │   │  │
│   │  │ • blocked_forever items                                     │   │  │
│   │  │ • always_interested items                                   │   │  │
│   │  │ • Personal facts                                            │   │  │
│   │  │                                                             │   │  │
│   │  │ Applied as overlay on TOP of context-specific memory        │   │  │
│   │  └─────────────────────────────────────────────────────────────┘   │  │
│   │                                                                     │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Context Memory Retrieval

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MEMORY RETRIEVAL WITH CONTEXT                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   retrieve('entertainment')                                                 │
│   │                                                                         │
│   ▼                                                                         │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                                                                     │  │
│   │   STEP 1: Get context-specific memories                             │  │
│   │   ─────────────────────────────────────                             │  │
│   │   SELECT * FROM memory_entries                                      │  │
│   │   WHERE context_bucket = 'entertainment'                            │  │
│   │   AND status IN ('core', 'dream')                                   │  │
│   │                                                                     │  │
│   │   Result: Entertainment-specific preferences                        │  │
│   │                                                                     │  │
│   └───────────────────────────────┬─────────────────────────────────────┘  │
│                                   │                                         │
│                                   ▼                                         │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                                                                     │  │
│   │   STEP 2: Get GENERAL memories (ALWAYS)                             │  │
│   │   ─────────────────────────────────────                             │  │
│   │   SELECT * FROM memory_entries                                      │  │
│   │   WHERE context_bucket = 'general'                                  │  │
│   │   AND status IN ('core', 'dream')                                   │  │
│   │                                                                     │  │
│   │   Result: blocked_forever, always_interested, personal facts        │  │
│   │                                                                     │  │
│   └───────────────────────────────┬─────────────────────────────────────┘  │
│                                   │                                         │
│                                   ▼                                         │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                                                                     │  │
│   │   STEP 3: Merge into MemoryPack                                     │  │
│   │   ─────────────────────────────────────                             │  │
│   │                                                                     │  │
│   │   {                                                                 │  │
│   │     context: 'entertainment',                                       │  │
│   │     short_term: [...recent session items...],                       │  │
│   │     mid_term: [...pattern cards for entertainment...],              │  │
│   │     working_set: {...current research if any...},                   │  │
│   │     facts_prefs: {...entertainment-specific prefs...},              │  │
│   │                                                                     │  │
│   │     general_overlay: {  ← CRITICAL: Always included                 │  │
│   │       blocked_forever: ['crypto', 'gambling', ...],                 │  │
│   │       always_interested: ['technology', ...],                       │  │
│   │       personal_facts: {...}                                         │  │
│   │     }                                                               │  │
│   │   }                                                                 │  │
│   │                                                                     │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│   ⚠️  IMPORTANT: general_overlay is ALWAYS included regardless of context  │
│       This ensures blocked_forever items are hidden everywhere              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Memory Lanes

### Lane Characteristics

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MEMORY LANE COMPARISON                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Lane          │ Retention  │ Decay    │ Weight │ Purpose                  │
│  ──────────────┼────────────┼──────────┼────────┼───────────────────────── │
│                │            │          │        │                          │
│  SHORT_TERM    │ Session    │ Instant  │ HIGH   │ Recent context           │
│  [Ring buffer] │ (20 items) │ eviction │        │ Recency signals          │
│                │            │          │        │                          │
│  MID_TERM      │ Weeks to   │ 30/90/   │ MEDIUM │ Learned patterns         │
│  [Cards]       │ months     │ 180 days │        │ Behavioral insights      │
│                │            │          │        │                          │
│  WORKING_SET   │ Days to    │ 7/30/    │ HIGH   │ Current goals            │
│  [Research]    │ weeks      │ 90 days  │        │ Active research          │
│                │            │          │        │                          │
│  FACTS_PREFS   │ Forever    │ NEVER    │ MAX    │ Explicit preferences     │
│  [Permanent]   │            │          │        │ User declarations        │
│                │            │          │        │                          │
│  LONG_TERM     │ Forever    │ NEVER    │ N/A    │ History & audit          │
│  [Timeline]    │ (log only) │          │ (log)  │ Analytics source         │
│                │            │          │        │                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Short-Term Ring Buffer

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      SHORT-TERM RING BUFFER                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   MAX_SIZE = 20                                                             │
│                                                                             │
│   ┌────┬────┬────┬────┬────┬────┬────┬────┬────┬────┬────┬────┬────┐      │
│   │  1 │  2 │  3 │  4 │  5 │  6 │  7 │  8 │  9 │ 10 │ 11 │ 12 │... │      │
│   │hide│like│skip│hide│like│hide│skip│hide│like│like│hide│skip│    │      │
│   │game│tech│cook│game│phot│cryp│spor│game│tech│tech│cryp│news│    │      │
│   └────┴────┴────┴────┴────┴────┴────┴────┴────┴────┴────┴────┴────┘      │
│     ▲                                                                 ▲     │
│     │                                                                 │     │
│   Oldest                                                            Newest  │
│   (evicted                                                         (just   │
│    first)                                                           added)  │
│                                                                             │
│   ON EVICTION:                                                              │
│   ─────────────                                                             │
│   1. Count similar items in buffer                                          │
│   2. If count ≥ 3 for same topic → trigger pattern detection               │
│   3. Append to long-term timeline                                           │
│                                                                             │
│   USAGE:                                                                    │
│   ───────                                                                   │
│   • Provides recency context for recommendations                            │
│   • "You just hid 3 gaming videos" → suppress gaming                        │
│   • Fast lookup, no database queries needed                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Forgetting Lifecycle

### State Transitions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     FORGETTING LIFECYCLE STATE MACHINE                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                                                                             │
│                              ┌──────────────────┐                           │
│                              │                  │                           │
│                              │       CORE       │                           │
│                              │    (100% wt)     │                           │
│                              │                  │                           │
│           ┌──────────────────│  • Full weight   │                           │
│           │                  │  • Retrieved     │                           │
│           │                  │  • Considered    │                           │
│           │                  │                  │                           │
│           │                  └────────┬─────────┘                           │
│           │                           │                                     │
│           │                           │ No interaction                      │
│           │                           │ for 30 days (mid_term)              │
│           │                           │ or 7 days (working_set)             │
│           │                           │                                     │
│           │                           ▼                                     │
│           │                  ┌──────────────────┐                           │
│           │                  │                  │                           │
│           │                  │      DREAM       │                           │
│   REACTIVATION               │    (50% wt)      │                           │
│   ─────────────              │                  │                           │
│   User interacts             │  • Half weight   │                           │
│   with topic again           │  • Still shows   │                           │
│                              │  • May prompt    │                           │
│           │                  │    "still?"      │                           │
│           │                  └────────┬─────────┘                           │
│           │                           │                                     │
│           │                           │ No interaction                      │
│           │                           │ for 90 days (mid_term)              │
│           │                           │ or 30 days (working_set)            │
│           │                           │                                     │
│           │                           ▼                                     │
│           │                  ┌──────────────────┐                           │
│           │                  │                  │                           │
│           └─────────────────▶│    FORGOTTEN     │                           │
│                              │    (0% wt)       │                           │
│                              │                  │                           │
│                              │  • Zero weight   │                           │
│                              │  • NOT retrieved │                           │
│                              │  • Exists for    │                           │
│                              │    reactivation  │                           │
│                              └────────┬─────────┘                           │
│                                       │                                     │
│                                       │ No interaction                      │
│                                       │ for 180 days (mid_term)             │
│                                       │ or 90 days (working_set)            │
│                                       │                                     │
│                                       ▼                                     │
│                              ┌──────────────────┐                           │
│                              │                  │                           │
│                              │     DELETED      │                           │
│                              │   (removed)      │                           │
│                              │                  │                           │
│                              │  • Entry removed │                           │
│                              │  • Timeline kept │                           │
│                              │  • Can't recover │                           │
│                              │                  │                           │
│                              └──────────────────┘                           │
│                                                                             │
│                                                                             │
│   ⚠️  EXCEPTION: facts_prefs NEVER decay                                    │
│       Only explicit user action can remove them                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Decay Timeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DECAY TIMELINE BY TYPE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   MID_TERM (Pattern Cards)                                                  │
│   ════════════════════════                                                  │
│                                                                             │
│   Day 0          Day 30         Day 120        Day 300                      │
│   │              │              │              │                            │
│   ▼              ▼              ▼              ▼                            │
│   ┌──────────────┬──────────────┬──────────────┬─────────────┐             │
│   │     CORE     │    DREAM     │  FORGOTTEN   │   DELETED   │             │
│   │    100%      │     50%      │      0%      │   removed   │             │
│   └──────────────┴──────────────┴──────────────┴─────────────┘             │
│                                                                             │
│                                                                             │
│   WORKING_SET (Current Research)                                            │
│   ══════════════════════════════                                            │
│                                                                             │
│   Day 0          Day 7          Day 37         Day 127                      │
│   │              │              │              │                            │
│   ▼              ▼              ▼              ▼                            │
│   ┌──────────────┬──────────────┬──────────────┬─────────────┐             │
│   │     CORE     │    DREAM     │  FORGOTTEN   │   DELETED   │             │
│   │    100%      │     50%      │      0%      │   removed   │             │
│   └──────────────┴──────────────┴──────────────┴─────────────┘             │
│                                                                             │
│                                                                             │
│   FACTS_PREFS (Permanent)                                                   │
│   ═══════════════════════                                                   │
│                                                                             │
│   Day 0          Day ∞                                                      │
│   │              │                                                          │
│   ▼              ▼                                                          │
│   ┌──────────────────────────────────────────────────────────┐             │
│   │                        CORE (100%)                       │             │
│   │                                                          │             │
│   │   ██████████████████████████████████████████████████████ │             │
│   │                                                          │             │
│   │   NEVER DECAYS - Only explicit user removal              │             │
│   └──────────────────────────────────────────────────────────┘             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Pattern Detection

### Pattern Formation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PATTERN DETECTION FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   USER ACTIONS                                                              │
│   ────────────                                                              │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │ Day 1: Hide "Bitcoin Price Analysis" video                         │  │
│   │ Day 2: Hide "Ethereum vs Bitcoin" video                            │  │
│   │ Day 3: Hide "Crypto Trading Tips" video                            │  │
│   │ Day 5: Hide "NFT Market Update" video                              │  │
│   │ Day 7: Hide "DeFi Explained" video                                 │  │
│   └───────────────────────────────┬─────────────────────────────────────┘  │
│                                   │                                         │
│                                   ▼                                         │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                     PATTERN DETECTOR                                │  │
│   │                                                                     │  │
│   │   1. Analyze recent events for topic 'crypto'                       │  │
│   │   2. Count: 5 'not_interested' actions                              │  │
│   │   3. Threshold check: 5 ≥ 3 (minimum for pattern)                   │  │
│   │   4. Confidence = 5/5 = 1.0 (all negative)                          │  │
│   │                                                                     │  │
│   │   → CREATE PATTERN CARD                                             │  │
│   │                                                                     │  │
│   └───────────────────────────────┬─────────────────────────────────────┘  │
│                                   │                                         │
│                                   ▼                                         │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                     MID-TERM CARD CREATED                           │  │
│   │                                                                     │  │
│   │   {                                                                 │  │
│   │     card_id: "card_abc123",                                         │  │
│   │     summary: "User consistently blocks cryptocurrency content",     │  │
│   │     pattern_type: "block_pattern",                                  │  │
│   │     entities: [                                                     │  │
│   │       { type: "topic", name: "crypto" },                            │  │
│   │       { type: "topic", name: "bitcoin" },                           │  │
│   │       { type: "topic", name: "ethereum" },                          │  │
│   │       { type: "topic", name: "NFT" },                               │  │
│   │       { type: "topic", name: "DeFi" }                               │  │
│   │     ],                                                              │  │
│   │     tags: ["crypto", "blockchain", "financial"],                    │  │
│   │     confidence: 1.0,                                                │  │
│   │     status: "core",                                                 │  │
│   │     occurrence_count: 5,                                            │  │
│   │     context_bucket: "general"                                       │  │
│   │   }                                                                 │  │
│   │                                                                     │  │
│   └───────────────────────────────┬─────────────────────────────────────┘  │
│                                   │                                         │
│                                   ▼                                         │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                     RECOMMENDATION IMPACT                           │  │
│   │                                                                     │  │
│   │   Future content with crypto/bitcoin/ethereum/NFT/DeFi:             │  │
│   │                                                                     │  │
│   │   • Pattern match factor triggers                                   │  │
│   │   • Adds weight: 7 (pattern_match)                                  │  │
│   │   • Score becomes more negative                                     │  │
│   │   • Action: HIDE                                                    │  │
│   │                                                                     │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Pattern Types

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PATTERN TYPES                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  BLOCK_PATTERN                                                              │
│  ─────────────                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │ Trigger: 3+ "not_interested" on same topic                         │    │
│  │ Effect: Auto-hide content matching topic                           │    │
│  │ Example: Blocks crypto content after 3 hide actions                │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  INTEREST_PATTERN                                                           │
│  ────────────────                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │ Trigger: 3+ "interested" on same topic                             │    │
│  │ Effect: Boost content matching topic                               │    │
│  │ Example: Promotes photography content after 3 likes                │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  RESEARCH_PATTERN                                                           │
│  ────────────────                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │ Trigger: Concentrated activity on product/topic                    │    │
│  │ Effect: Creates working_set entry, boosts related content          │    │
│  │ Example: Detect camera research from many camera video views       │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  TIME_PATTERN                                                               │
│  ────────────                                                               │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │ Trigger: Consistent behavior at specific times                     │    │
│  │ Effect: Context detection enhancement                              │    │
│  │ Example: User watches coding tutorials 9-5, gaming after 6pm       │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  CONTEXT_PATTERN                                                            │
│  ───────────────                                                            │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │ Trigger: Different behavior on different platforms                 │    │
│  │ Effect: Platform-specific preferences                              │    │
│  │ Example: User blocks politics on YouTube but allows on Twitter     │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Memory Retrieval Flow

### Complete Retrieval Sequence

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   COMPLETE MEMORY RETRIEVAL SEQUENCE                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   shouldHide(['bitcoin', 'trading'], 'CryptoGuru', 'entertainment')         │
│   │                                                                         │
│   ▼                                                                         │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │ STEP 1: Retrieve Memory Pack                                        │  │
│   │                                                                     │  │
│   │   memoryPack = await retrieve('entertainment')                      │  │
│   │                                                                     │  │
│   │   Returns:                                                          │  │
│   │   {                                                                 │  │
│   │     short_term: [...last 20 items...],                              │  │
│   │     mid_term: [...pattern cards...],                                │  │
│   │     working_set: {...current research...},                          │  │
│   │     facts_prefs: {...entertainment prefs...},                       │  │
│   │     general_overlay: {                                              │  │
│   │       blocked_forever: ['crypto', ...],  ← KEY                      │  │
│   │       ...                                                           │  │
│   │     }                                                               │  │
│   │   }                                                                 │  │
│   │                                                                     │  │
│   └───────────────────────────────┬─────────────────────────────────────┘  │
│                                   │                                         │
│                                   ▼                                         │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │ STEP 2: Check facts_prefs.blocked_forever                           │  │
│   │                                                                     │  │
│   │   Is 'bitcoin' or 'trading' in blocked_forever?                     │  │
│   │   Is 'CryptoGuru' in blocked_creators?                              │  │
│   │                                                                     │  │
│   │   → 'bitcoin' related to 'crypto' (blocked) via knowledge graph     │  │
│   │   → INSTANT HIDE                                                    │  │
│   │                                                                     │  │
│   └───────────────────────────────┬─────────────────────────────────────┘  │
│                                   │                                         │
│                                   ▼                                         │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │ STEP 3: Check mid_term pattern cards                                │  │
│   │                                                                     │  │
│   │   Do any cards match ['bitcoin', 'trading']?                        │  │
│   │                                                                     │  │
│   │   → Card "User blocks crypto" contains 'bitcoin'                    │  │
│   │   → Pattern match score: -0.95                                      │  │
│   │                                                                     │  │
│   └───────────────────────────────┬─────────────────────────────────────┘  │
│                                   │                                         │
│                                   ▼                                         │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │ STEP 4: Check short_term for recency                                │  │
│   │                                                                     │  │
│   │   Recent hides of crypto content?                                   │  │
│   │                                                                     │  │
│   │   → 2 crypto videos hidden in last 20 actions                       │  │
│   │   → Recency signal: negative                                        │  │
│   │                                                                     │  │
│   └───────────────────────────────┬─────────────────────────────────────┘  │
│                                   │                                         │
│                                   ▼                                         │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │ STEP 5: Return Result                                               │  │
│   │                                                                     │  │
│   │   {                                                                 │  │
│   │     hide: true,                                                     │  │
│   │     reason: "Blocked topic: crypto (bitcoin is related)",           │  │
│   │     confidence: 0.98,                                               │  │
│   │     factors: [                                                      │  │
│   │       { name: 'blocked_topic', score: -1.0 },                       │  │
│   │       { name: 'pattern_match', score: -0.95 },                      │  │
│   │       { name: 'recency', score: -0.5 }                              │  │
│   │     ]                                                               │  │
│   │   }                                                                 │  │
│   │                                                                     │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Model Diagrams

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MEMORY DATA MODEL                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────┐         ┌─────────────────────┐                  │
│   │    MemoryEntry      │         │    MemoryEvent      │                  │
│   │    (Current State)  │         │    (Timeline)       │                  │
│   ├─────────────────────┤         ├─────────────────────┤                  │
│   │ entry_id (PK)       │         │ event_id (PK)       │                  │
│   │ user_id             │         │ user_id             │                  │
│   │ context_bucket      │◄───────▶│ context_bucket      │                  │
│   │ memory_type         │         │ memory_type         │                  │
│   │ topic_key           │◄───────▶│ topic_key           │                  │
│   │ value (JSON)        │         │ event_type          │                  │
│   │ confidence          │         │ payload (JSON)      │                  │
│   │ status              │         │ source_ref          │                  │
│   │ valid_from          │         │ occurred_at         │                  │
│   │ valid_to            │         │ created_at          │                  │
│   │ last_confirmed_at   │         └─────────────────────┘                  │
│   │ last_accessed_at    │                                                  │
│   │ access_count        │                                                  │
│   │ version             │                                                  │
│   │ is_deleted          │                                                  │
│   │ created_at          │                                                  │
│   │ updated_at          │                                                  │
│   └──────────┬──────────┘                                                  │
│              │                                                              │
│              │ 1:N                                                          │
│              ▼                                                              │
│   ┌─────────────────────┐                                                  │
│   │    MidTermCard      │                                                  │
│   │    (Patterns)       │                                                  │
│   ├─────────────────────┤                                                  │
│   │ card_id (PK)        │                                                  │
│   │ user_id             │                                                  │
│   │ context_bucket      │                                                  │
│   │ summary             │                                                  │
│   │ entities (JSON[])   │                                                  │
│   │ tags (string[])     │                                                  │
│   │ source_refs (JSON[])│                                                  │
│   │ confidence          │                                                  │
│   │ status              │                                                  │
│   │ pattern_type        │                                                  │
│   │ occurrence_count    │                                                  │
│   │ first_seen_at       │                                                  │
│   │ last_seen_at        │                                                  │
│   │ created_at          │                                                  │
│   │ updated_at          │                                                  │
│   └─────────────────────┘                                                  │
│                                                                             │
│                                                                             │
│   INDEXES:                                                                  │
│   ────────                                                                  │
│   memory_entries:                                                           │
│     • by_user_context: [user_id, context_bucket]                            │
│     • by_user_type: [user_id, memory_type]                                  │
│     • by_status: [user_id, status]                                          │
│     • by_topic: [user_id, topic_key]                                        │
│     • by_last_accessed: last_accessed_at                                    │
│                                                                             │
│   memory_events:                                                            │
│     • by_occurred: occurred_at                                              │
│     • by_user_topic: [user_id, topic_key]                                   │
│                                                                             │
│   mid_term_cards:                                                           │
│     • by_context: context_bucket                                            │
│     • by_status: status                                                     │
│     • by_last_seen: last_seen_at                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Summary

The Smriti memory system provides:

1. **Context-aware memory** - Different memories for different situations
2. **Natural forgetting** - Unused memories fade over time
3. **Pattern detection** - Learns from repeated behavior
4. **Permanent preferences** - Explicit blocks never fade
5. **General overlay** - blocked_forever applies everywhere

**Next**: See [Smriti_IMPLEMENTATION.md](Smriti_IMPLEMENTATION.md) for code details.
