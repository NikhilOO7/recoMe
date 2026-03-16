# RecoMe — Claude Code Instructions

This file is read automatically by Claude Code at the start of every session.

---

## Project Identity

**RecoMe** is a Chrome Manifest V3 browser extension that gives users intelligent control over recommendation feeds on YouTube, Amazon, Twitter, Facebook, eBay, and Walmart.

Core innovations:
- **Mnemosyne** — a human-like memory system with context buckets, forgetting lifecycle, and pattern detection
- **Knowledge Graph** — semantic entity relationships that enable affinity propagation ("block crypto → auto-blocks BTC, NFT, Ethereum…")

Full architecture → `ARCHITECTURE.html`
Detailed specs → `CLAUDE_CODE_PROMPT.md` and `RECOME_CLAUDE_CODE_PROMPT.md`

---

## Using context-hub (`chub`)

[context-hub](https://github.com/andrewyng/context-hub) is installed at `/usr/local/bin/chub`.
It provides up-to-date, LLM-optimised API docs. **Always prefer `chub get` over relying on training-data knowledge** when working with any external SDK or API — this prevents hallucinated method names and stale patterns.

### Workflow

Before writing code that touches an external API or SDK, run the relevant `chub get` command and incorporate the output into your context for that task.

```bash
# 1. Discover what's available
chub search <topic>

# 2. Pull the doc (always use --lang js for this TypeScript project)
chub get <id> --lang js

# 3. Annotate if you discover a gap or workaround
chub annotate <id> "note about the gap or workaround"
```

### Docs relevant to RecoMe

| When you are working on… | Run this |
|---|---|
| Any Claude API / Anthropic SDK integration | `chub get anthropic/claude-api --lang js` |
| ChromaDB vector search (future AI feature) | `chub get chromadb/embeddings-db --lang js` |
| Analytics / event tracking | `chub get amplitude/analytics --lang js` |

> **Note:** Chrome extension APIs, IndexedDB, MutationObserver, React, Webpack, and Jest are **not yet in context-hub**. Use MDN Web Docs and Chrome Developer docs for these. If you find a gap that would be useful to the community, run `chub feedback <id> up/down` or suggest contributing.

### When to skip chub

- Core Web APIs (IndexedDB, MutationObserver, fetch, etc.) — use MDN
- Chrome extension APIs (chrome.runtime, chrome.alarms, etc.) — use Chrome Developer Docs
- React 18 / Webpack / Jest / TypeScript — use their official docs
- Internal RecoMe modules — use the existing MD files in this repo

---

## Tech Stack (quick ref)

| Layer | Technology |
|---|---|
| Language | TypeScript 5 |
| Extension | Chrome Manifest V3 |
| UI | React 18 |
| Storage | IndexedDB via `idb` library |
| Build | Webpack 5 |
| Tests | Jest |
| Style | TailwindCSS |

---

## Key Architecture Rules

1. **No direct IndexedDB calls in intelligence services** — go through the repository pattern.
2. **No Chrome APIs in intelligence services** — those live in the background service layer only.
3. **No module-level singletons** — use dependency injection so everything is unit-testable.
4. **Service worker is ephemeral** — never hold critical state in memory; always flush to IndexedDB before the worker may sleep.
5. **All cross-context comms are typed** — every message through `chrome.runtime.sendMessage` must use the discriminated union `MessageType`.
6. **Privacy by default** — no network requests unless explicitly building a future cloud-sync feature.

---

## File Map (entry points)

```
src/
  background/         ← Service worker, message broker, event bus, decay manager
  content/            ← Platform adapters (one per platform)
  popup/              ← React app for the dashboard
  intelligence/
    memory/           ← Mnemosyne: MemoryService, PatternDetector, DecayManager, ContextDetector
    graph/            ← KnowledgeGraph, AffinityCalculator
    recommendation/   ← RecommendationEngine (multi-factor scoring)
  data/               ← Repositories, IndexedDB schema, migrations, LRU cache
  shared/             ← Types, constants, utilities shared across contexts
```

---

## Development Commands

```bash
npm run dev       # Webpack watch mode
npm run build     # Production build
npm test          # Jest unit tests
npm run typecheck # tsc --noEmit
npm run lint      # ESLint
```

Load the extension in Chrome: `chrome://extensions` → Developer mode → Load unpacked → `dist/`

---

## Implementation Phases

| Phase | Focus |
|---|---|
| 1 | Foundation: MV3 scaffold, build, message broker, IndexedDB schema |
| 2 | Mnemosyne memory system |
| 3 | Knowledge graph + affinity calculator |
| 4 | Recommendation engine + all 6 platform adapters |
| 5 | React popup, onboarding, achievements, polish |

Start at Phase 1 unless a phase is explicitly marked done.
