<p align="center">
  <img src="website/logo.png" alt="RecoMe Logo" width="128" />
</p>

<h1 align="center">RecoMe</h1>
<p align="center"><strong>Your Feed, Your Rules</strong></p>

<p align="center">
  A privacy-first browser extension that puts you in control of your recommendation feeds across the web.
</p>

---

## Features

- **Topic Blocking & Boosting** — Hide content you don't want, amplify what you do
- **Smart Product Scoring** — Multi-factor recommendation engine with intent memory and watchlists
- **AI Agent Chat** — Conversational assistant powered by Claude, GPT, or Gemini (with regex fallback)
- **Intent Memory** — Three-tier memory system that learns your preferences over time
- **Cross-Platform** — Works across YouTube, Amazon, Instagram, Twitter/X, Facebook, eBay, Walmart, and more
- **Achievements** — 13 unlockable achievements to track your personalization journey

## Supported Platforms

YouTube | Amazon | Instagram | Twitter/X | Facebook | eBay | Walmart | Generic (any site)

## Quick Start

### Install from Chrome Web Store

> [Chrome Web Store](https://chrome.google.com/webstore) _(coming soon)_

### Build from Source

```bash
git clone https://github.com/recome/recome.git
cd recome
npm install
npm run build
```

Then load `dist/` as an unpacked extension in `chrome://extensions` (enable Developer Mode).

## Development

```bash
npm run dev         # Start dev build with watch mode
npm test            # Run test suite
npm run build       # Production build
npm run typecheck   # TypeScript type checking
```

## Tech Stack

| Layer     | Technology             |
| --------- | ---------------------- |
| Language  | TypeScript             |
| UI        | React 19, Tailwind CSS |
| Extension | Manifest V3            |
| Storage   | IndexedDB (via idb)    |
| Bundler   | Webpack 5              |

## Privacy

RecoMe is **100% local**. All data stays on your device — no telemetry, no tracking, no servers.

An optional API key can be configured for AI chat features (Claude, GPT, or Gemini). Keys are stored locally and sent only to the provider you choose.

## License

[MIT](LICENSE)
