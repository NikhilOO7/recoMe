# Privacy Policy — RecoMe

**Last updated:** March 16, 2026

## Overview

RecoMe ("the Extension") is a browser extension that helps users control their recommendation feeds. This privacy policy explains what data the Extension collects, how it is used, and your rights.

**In short: RecoMe stores all data locally on your device. We do not collect, transmit, or sell any personal information.**

## Data Collection

### Data we do NOT collect
- We do not collect personal information (name, email, address, etc.)
- We do not collect browsing history
- We do not track which websites you visit
- We do not use analytics, telemetry, or tracking pixels
- We do not send any data to our servers (we have no servers)
- We do not sell or share any data with third parties

### Data stored locally on your device
The Extension stores the following data in your browser's local storage (IndexedDB and chrome.storage):

- **Your preferences:** Topics you have blocked, liked, or marked as interests
- **Interaction history:** A record of your feedback actions (e.g., "hide", "boost", "block") used to detect preference patterns
- **Knowledge graph:** Relationships between topics and entities to enable smart filtering (e.g., blocking "crypto" also filters "Bitcoin")
- **Extension settings:** Your chosen aggressiveness level, platform toggles, active context, and UI preferences
- **Achievement progress:** Badge unlock status and activity counters

This data never leaves your browser. It is not transmitted to any server, cloud service, or third party.

## Optional AI Enhancement

The Extension offers an optional AI-powered topic extraction feature. If you choose to enable this:

- You provide your own API key for one of: Anthropic (Claude), OpenAI (GPT), or Google (Gemini)
- Your API key is stored locally in your browser's storage
- When enabled, the text content of recommendation cards you interact with is sent directly from your browser to the AI provider you selected for topic extraction
- **We never see, store, or have access to your API key or the data sent to these providers**
- This feature is entirely optional. The Extension works fully without it using rule-based topic extraction
- Each AI provider has their own privacy policy governing how they handle API requests

## Host Permissions

The Extension requests access to all HTTPS websites (`https://*/*`) because it needs to:

1. Detect and analyze recommendation cards on any website you visit
2. Inject the feedback overlay UI on content cards
3. Support both platform-specific adapters (YouTube, Amazon, etc.) and a generic adapter for other sites

The Extension also requests access to AI API endpoints (`api.anthropic.com`, `api.openai.com`, `generativelanguage.googleapis.com`) solely for the optional AI enhancement feature described above.

**The Extension does not read, store, or transmit the content of pages you visit.** It only analyzes the visible text of recommendation cards to extract topic information for filtering.

## Permissions Used

| Permission | Purpose |
|-----------|---------|
| `storage` | Store your preferences, settings, and interaction history locally |
| `alarms` | Schedule periodic maintenance tasks (e.g., pattern detection, memory decay) |
| `tabs` | Detect which website you're on to activate the correct platform adapter |
| `activeTab` | Access the current tab for content analysis |

## Data Retention

- All data is stored indefinitely until you clear it
- You can export all your data as JSON from the Extension settings
- You can clear all data at any time from the Extension settings ("Clear all data" button)
- Uninstalling the Extension removes all stored data

## Children's Privacy

The Extension does not knowingly collect any information from children under 13. The Extension does not collect information from anyone — all data stays on the user's device.

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be noted with an updated "Last updated" date at the top of this document.

## Contact

If you have questions about this privacy policy, please open an issue at:
https://github.com/nikhiloo7/recoME/issues

## Your Rights

Since all data is stored locally on your device:
- **Access:** Open the Extension popup → Settings → Export to see all stored data
- **Deletion:** Settings → Clear all data, or uninstall the Extension
- **Portability:** Settings → Export downloads all data as JSON
- **No consent needed for data processing:** We don't process your data — your browser does, locally
