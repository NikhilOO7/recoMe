# RecoMe Quick Start Guide

> Get RecoMe up and running in 15 minutes.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Project Setup](#project-setup)
3. [Development Workflow](#development-workflow)
4. [Project Structure](#project-structure)
5. [First Steps](#first-steps)
6. [Testing Your Changes](#testing-your-changes)
7. [Common Tasks](#common-tasks)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

```bash
# Check Node.js version (18+ required)
node --version
# Expected: v18.x.x or higher

# Check npm version
npm --version
# Expected: 9.x.x or higher

# Check Git
git --version
```

### Browser Requirements

- **Chrome 88+** (recommended for development)
- Edge, Brave, or any Chromium-based browser

### Recommended VS Code Extensions

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-typescript-next",
    "streetsidesoftware.code-spell-checker"
  ]
}
```

---

## Project Setup

### 1. Clone and Install

```bash
# Clone the repository
git clone https://github.com/yourusername/recome.git
cd recome

# Install dependencies
npm install

# Verify installation
npm run typecheck
```

### 2. Environment Setup

```bash
# Create environment file for API keys (optional)
cp .env.example .env

# Edit .env and add your Claude API key (optional, for LLM extraction)
# CLAUDE_API_KEY=sk-ant-...
```

### 3. Build the Extension

```bash
# Development build (with source maps)
npm run build:dev

# Or start watch mode for auto-rebuild
npm run dev
```

### 4. Load in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `dist/` folder from your project
5. You should see RecoMe in your extensions list

### 5. Verify Installation

1. Click the RecoMe icon in toolbar
2. You should see the popup UI
3. Navigate to YouTube and verify content scripts are running (check DevTools console for `[RecoMe]` logs)

---

## Development Workflow

### Daily Development Flow

```bash
# Terminal 1: Start watch mode
npm run dev

# Terminal 2: Run tests in watch mode (optional)
npm run test:watch
```

### After Making Changes

| Change Type               | Action Required                          |
| ------------------------- | ---------------------------------------- |
| TypeScript/JavaScript     | Auto-rebuilt by webpack                  |
| Manifest changes          | Reload extension in chrome://extensions/ |
| Content script changes    | Refresh the target page                  |
| Background script changes | Click "Reload" on extension card         |
| Popup changes             | Close and reopen popup                   |

### Code Quality Commands

```bash
# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format

# Run all checks before commit
npm run typecheck && npm run lint && npm test
```

---

## Project Structure

```
recome/
├── src/
│   ├── manifest.json                 # Extension manifest (V3)
│   │
│   ├── background/                   # Service Worker
│   │   ├── index.ts                  # Entry point
│   │   ├── messageHandler.ts         # Message routing
│   │   └── alarms.ts                 # Scheduled tasks
│   │
│   ├── content/                      # Content Scripts
│   │   ├── index.ts                  # Entry point
│   │   ├── adapters/                 # Platform adapters
│   │   │   ├── BaseAdapter.ts
│   │   │   ├── YouTubeAdapter.ts
│   │   │   ├── AmazonAdapter.ts
│   │   │   └── ...
│   │   ├── observer.ts               # DOM observation
│   │   └── ui/                       # Injected UI
│   │       ├── FeedbackButtons.ts
│   │       ├── HideAnimation.ts
│   │       └── Toast.ts
│   │
│   ├── popup/                        # Popup UI (React)
│   │   ├── index.tsx
│   │   ├── App.tsx
│   │   └── components/
│   │
│   ├── intelligence/                 # AI/ML Layer
│   │   ├── index.ts                  # IntelligenceService
│   │   ├── memory/                   # Smriti Memory System
│   │   ├── graph/                    # Knowledge Graph
│   │   ├── extraction/               # Entity Extraction
│   │   └── recommendation/           # Recommendation Engine
│   │
│   ├── data/                         # Data Layer
│   │   ├── IndexedDBManager.ts
│   │   ├── ChromeStorageManager.ts
│   │   └── LRUCache.ts
│   │
│   ├── shared/                       # Shared Utilities
│   │   ├── types.ts
│   │   ├── constants.ts
│   │   └── messages.ts
│   │
│   └── styles/                       # Global Styles
│       ├── variables.css
│       ├── animations.css
│       └── popup.css
│
├── public/                           # Static assets
├── docs/                             # Documentation
├── tests/                            # Test files
└── scripts/                          # Build scripts
```

---

## First Steps

### Step 1: Understand the Message Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Content Script │────▶│   Background    │────▶│     Popup       │
│   (per tab)     │◀────│   Service       │◀────│    (React)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        │                       ▼
        │               ┌─────────────────┐
        │               │  Intelligence   │
        │               │    Service      │
        │               │  ┌───────────┐  │
        │               │  │  Memory   │  │
        │               │  │  System   │  │
        │               │  └───────────┘  │
        │               │  ┌───────────┐  │
        │               │  │ Knowledge │  │
        │               │  │   Graph   │  │
        │               │  └───────────┘  │
        │               └─────────────────┘
        │                       │
        └───────────────────────┘
                via chrome.runtime.sendMessage
```

### Step 2: Make Your First Change

**Task**: Add a console log when content is processed

```typescript
// src/content/index.ts
async function processContentItem(item: ContentItem): Promise<void> {
  console.log('[RecoMe] Processing content:', item.title);

  // Send to background for analysis
  const result = await sendMessage({
    type: 'PROCESS_CONTENT',
    payload: item,
  });

  // Apply result
  if (result.action === 'hide') {
    hideElement(item.element);
  }
}
```

### Step 3: Test the Memory System

```typescript
// Quick test in background console
// (chrome://extensions → Inspect service worker)

// Block a topic
await memoryService.blockForever('crypto');

// Check if content should be hidden
const result = await memoryService.shouldHide(['bitcoin', 'trading']);
console.log(result); // { hide: true, reason: 'Blocked topic: crypto' }

// Get memory pack
const pack = await memoryService.retrieve('entertainment');
console.log(pack.facts_prefs); // Shows blocked topics
```

### Step 4: Explore the Knowledge Graph

```typescript
// In background console

// Add a relation
knowledgeGraph.addRelation({
  source_id: 'crypto',
  target_id: 'bitcoin',
  type: 'similar_to',
  weight: 0.95,
  confidence: 1.0,
});

// Find similar entities
const similar = knowledgeGraph.findSimilar('crypto', 5);
console.log(similar); // [{ entity: bitcoin, score: 0.95 }, ...]

// Calculate affinity
const affinity = affinityCalculator.calculateEntityAffinity('user', 'bitcoin');
console.log(affinity); // -0.67 (negative because crypto is blocked)
```

---

## Testing Your Changes

### Unit Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- src/intelligence/memory/MemoryService.test.ts

# Run with coverage
npm run test:coverage
```

### Manual Testing Checklist

#### YouTube Testing

- [ ] Content items detected on home page
- [ ] Content items detected in search results
- [ ] Feedback buttons appear on hover
- [ ] Hide animation works correctly
- [ ] Toast notification appears
- [ ] Hidden items stay hidden on refresh

#### Memory Testing

- [ ] Blocked topics persist across sessions
- [ ] Context detection works correctly
- [ ] Pattern detection creates cards after 3+ similar actions

---

## Common Tasks

### Adding a New Platform

```typescript
// 1. Create adapter: src/content/adapters/NewPlatformAdapter.ts
export class NewPlatformAdapter extends BaseAdapter {
  constructor() {
    super({
      platform: 'newplatform',
      selectors: {
        container: '.content-feed',
        item: '.content-item',
        title: '.item-title',
      },
      observerConfig: { childList: true, subtree: true },
    });
  }

  // Implement abstract methods...
}

// 2. Register in src/content/index.ts
// 3. Add to manifest.json content_scripts
// 4. Add tests
```

### Adding a New Recommendation Factor

```typescript
// In RecommendationEngine.ts

private readonly FACTOR_WEIGHTS = {
  // ... existing factors
  new_factor: 5,  // Add weight
};

async recommend(content: AnalyzedContent): Promise<RecommendationResult> {
  const factors: RecommendationFactor[] = [];

  // ... existing factors
  factors.push(await this.calculateNewFactor(content));

  // ... rest of method
}

private async calculateNewFactor(content: AnalyzedContent): Promise<RecommendationFactor> {
  // Implementation
}
```

---

## Troubleshooting

### Extension Not Loading

```bash
# Check for build errors
npm run build:dev

# Verify dist folder exists
ls -la dist/

# Check manifest.json is valid
cat dist/manifest.json | jq .
```

### Content Script Not Running

1. Check manifest.json `matches` patterns
2. Verify page URL matches the pattern
3. Check for console errors in page DevTools
4. Try reloading the extension

### IndexedDB Issues

```typescript
// Clear all data (in background console)
await indexedDB.deleteDatabase('recome_db');

// Reload extension after clearing
```

---

## Quick Reference

### Key Commands

| Command             | Purpose                |
| ------------------- | ---------------------- |
| `npm run dev`       | Watch mode development |
| `npm run build`     | Production build       |
| `npm test`          | Run tests              |
| `npm run lint`      | Check code style       |
| `npm run typecheck` | TypeScript validation  |

### Key Concepts

| Concept            | Description                                           |
| ------------------ | ----------------------------------------------------- |
| **Context Bucket** | Scoped memory container (work, entertainment, etc.)   |
| **Memory Lane**    | Type of memory (short-term, mid-term, facts, etc.)    |
| **Pattern Card**   | Auto-created rule from repeated behavior              |
| **Affinity**       | User's preference score for an entity (-1 to 1)       |
| **Entity**         | Node in knowledge graph (topic, brand, creator, etc.) |
| **Relation**       | Edge in knowledge graph (similar_to, blocked, etc.)   |

---

## Next Steps

1. **Read** [ARCHITECTURE.md](ARCHITECTURE.md) - Full system architecture
2. **Read** [MEMORY_SYSTEM.md](MEMORY_SYSTEM.md) - Smriti deep dive
3. **Read** [KNOWLEDGE_GRAPH.md](KNOWLEDGE_GRAPH.md) - Entity relationships
4. **Read** [CLAUDE_CODE_PROMPT.md](CLAUDE_CODE_PROMPT.md) - AI-assisted development

---

**Happy coding! 🚀**
