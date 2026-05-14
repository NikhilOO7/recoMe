# RecoMe Manual QA Checklist

Use this checklist after every build to verify the extension works on live sites. Load the `dist/` folder as an unpacked extension in `chrome://extensions` with Developer Mode enabled.

---

## Pre-Flight

- [ ] `npm run build` completes without errors
- [ ] Extension loads in chrome://extensions without errors
- [ ] Service worker shows "Active" (click "Inspect views: service worker" to check console)
- [ ] Popup opens when clicking the RecoMe icon
- [ ] Onboarding flow completes successfully (or is already done)

---

## Platform Tests

For each platform, verify:

1. **Content script injects** — open DevTools Console, filter for `[RecoMe]` logs
2. **Cards detected** — cards get a `data-recome-id` attribute (inspect DOM)
3. **RecoMe button appears** — hover over a card, the "RecoMe" pill appears
4. **Menu opens** — click the pill, action menu renders
5. **Action works** — click an action (e.g., "Not interested"), toast appears
6. **Undo works** — click "Undo" on the toast, card restores

### Amazon (Primary — must pass)

| Test                | URL                           | Expected                                     | Pass? |
| ------------------- | ----------------------------- | -------------------------------------------- | ----- |
| Search results      | `amazon.com/s?k=headphones`   | Cards get badges + commerce menu (9 actions) | [ ]   |
| Product page        | Any product detail page       | PDP extraction works, metadata logged        | [ ]   |
| Best sellers        | `amazon.com/gp/bestsellers`   | Cards detected and scored                    | [ ]   |
| Badge rendering     | Search with prior intents set | "Good fit" / "Lower priority" badges appear  | [ ]   |
| Explanation popover | Click "?" on a badge          | Score, factors, confidence shown             | [ ]   |
| Price extraction    | Search results                | Price visible in DevTools decision log       | [ ]   |

### YouTube

| Test           | URL                                    | Expected                                      | Pass? |
| -------------- | -------------------------------------- | --------------------------------------------- | ----- |
| Home feed      | `youtube.com`                          | Video cards detected, legacy menu (5 actions) | [ ]   |
| Search results | `youtube.com/results?search_query=...` | Cards detected, search tracked                | [ ]   |
| Watch page     | Any video page                         | Sidebar recommendations detected              | [ ]   |

### Twitter/X

| Test      | URL                  | Expected                           | Pass? |
| --------- | -------------------- | ---------------------------------- | ----- |
| Home feed | `x.com/home`         | Tweets detected, legacy menu works | [ ]   |
| Search    | `x.com/search?q=...` | Results detected                   | [ ]   |

### Instagram

| Test    | URL                     | Expected                          | Pass? |
| ------- | ----------------------- | --------------------------------- | ----- |
| Feed    | `instagram.com`         | Posts detected, legacy menu works | [ ]   |
| Explore | `instagram.com/explore` | Grid items detected               | [ ]   |

### Facebook

| Test | URL            | Expected                               | Pass? |
| ---- | -------------- | -------------------------------------- | ----- |
| Feed | `facebook.com` | Feed units detected, legacy menu works | [ ]   |

### eBay

| Test           | URL                                   | Expected                      | Pass? |
| -------------- | ------------------------------------- | ----------------------------- | ----- |
| Search results | `ebay.com/sch/i.html?_nkw=headphones` | Cards detected, commerce menu | [ ]   |

### Walmart

| Test           | URL                               | Expected                      | Pass? |
| -------------- | --------------------------------- | ----------------------------- | ----- |
| Search results | `walmart.com/search?q=headphones` | Cards detected, commerce menu | [ ]   |

### Generic (any other site)

| Test                     | URL                | Expected                             | Pass? |
| ------------------------ | ------------------ | ------------------------------------ | ----- |
| Blog/news site           | Any article page   | Content zones detected, generic menu | [ ]   |
| Chat site (WhatsApp Web) | `web.whatsapp.com` | RecoMe does NOT inject (excluded)    | [ ]   |

---

## Popup Tests

| Test                       | Expected                                             | Pass? |
| -------------------------- | ---------------------------------------------------- | ----- |
| Dashboard cold-start       | "Getting Started" card shows with progress steps     | [ ]   |
| Dashboard after use        | Stats update, Getting Started card disappears        | [ ]   |
| Quick Block                | Type topic, click Block, shows in Active Blocks list | [ ]   |
| Quick Like                 | Type topic, click Like, shows in Boosted Topics list | [ ]   |
| Agent Chat (Quick mode)    | Send "Show my watchlist" — gets a response           | [ ]   |
| Agent Chat (AI mode)       | With API key, send a message — AI response received  | [ ]   |
| Agent Chat (no key)        | Setup card shown with provider links                 | [ ]   |
| Settings — API key         | Enter key, save, Agent tab shows "AI powered by..."  | [ ]   |
| Settings — Platform toggle | Disable YouTube, visit YouTube — RecoMe skips        | [ ]   |
| Settings — Export          | Click Export, JSON file downloads                    | [ ]   |
| Settings — Import          | Import exported file, data restores                  | [ ]   |
| Theme toggle               | Switch light/dark, persists on reopen                | [ ]   |

---

## Cross-Cutting

| Test                  | Expected                                                                    | Pass? |
| --------------------- | --------------------------------------------------------------------------- | ----- |
| First-action nudge    | On first site visit, welcome toast appears after 3s                         | [ ]   |
| Keyboard: Cmd+Shift+R | Popup opens                                                                 | [ ]   |
| Keyboard: Cmd+Shift+E | Extension toggles on/off                                                    | [ ]   |
| DevTools panel        | Open DevTools → RecoMe tab → Decision Log, Memory, Graph, Storage tabs work | [ ]   |
| Achievement unlock    | After first block, "First Block" achievement unlocks                        | [ ]   |

---

## Common Failure Modes

| Symptom                                | Likely Cause                                 | Fix                                 |
| -------------------------------------- | -------------------------------------------- | ----------------------------------- |
| No RecoMe button on cards              | CSS selectors stale (DOM changed)            | Update `cardSelector` in adapter    |
| Cards detected but no badge            | Scoring returns all-neutral (no intents yet) | Block/like some topics first        |
| "Background service restarting" banner | Service worker crashed                       | Check SW console for errors         |
| Menu appears but outside viewport      | Portal positioning issue                     | Check `#recome-menu-portal` z-index |
| Extension not injecting on a site      | Platform disabled in settings                | Check settings platform toggles     |

---

## Selector Staleness Quick Check

Open DevTools Console on any platform page and run:

```js
// Replace SELECTOR with the adapter's cardSelector
document.querySelectorAll('SELECTOR').length;
```

If result is 0, the selector needs updating. Check the adapter file for the current selector.
