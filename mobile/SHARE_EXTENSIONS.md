# WS-9 Mobile share extensions — overview

The Recome mobile app catches shared URLs from the OS share-sheet and ingests
them as `page_view` signals against the same `/intelligence/signals` endpoint
the browser extension and the web `/paste` PWA share-target use. One cloud
contract, three OS surfaces — all the topic / entity enrichment happens
server-side, the clients are dumb forwarders.

## File map

| File                                  | Role                                                                                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `app.json`                            | Expo config. Declares the `recome://` URL scheme, the Android `SEND` + `VIEW` intent filters, and the iOS `recome` URL type.      |
| `App.tsx`                             | Wires `ShareReceiver.attach()` on mount and renders `<ShareReceivedScreen>` over the tab navigator when a share lands.            |
| `src/services/ShareReceiver.ts`       | OS-agnostic listener. Parses `recome://share?url=…`, plain URLs (Android `SEND`), and `https://recome.app/paste?url=…` app links. |
| `src/screens/ShareReceivedScreen.tsx` | Modal confirmation. Three states: ingesting / saved / error.                                                                      |
| `ios-share-extension/`                | Standalone iOS Share Sheet target source — added to Xcode after `expo prebuild`. See its README for the one-time setup checklist. |

## Platform-by-platform

### Android (WS-9 M-3) — managed Expo, no native code

The intent filter on `MainActivity` is declared entirely in `app.json` under
`expo.android.intentFilters`. Two filters matter:

- `SEND` with `text/plain` (or `text/*`) — fires when the user picks Recome
  from the share sheet for a URL, tweet, article excerpt, etc.
- `VIEW` with `https://recome.app/paste/*` — universal links from the web PWA.

Expo's runtime surfaces the inbound URL (or shared text) via
`Linking.getInitialURL()` (cold start) and the `'url'` event (warm start).
`ShareReceiver` handles both. No `MainActivity.kt` patch, no `prebuild`
required for Android.

### iOS (WS-9 M-2) — needs a separate target

iOS does not expose your app in the share sheet for arbitrary URLs unless you
ship a **Share Extension** — a second target with its own bundle ID,
entitlements, and an App Group shared with the host app. Managed Expo
cannot declare a second target, so the iOS path needs `expo prebuild` once.

`ios-share-extension/` ships the Swift source + Info.plist. After
`expo prebuild --platform ios`:

1. Open `ios/Recome.xcworkspace` in Xcode.
2. **File → New → Target → Share Extension**, name it `RecomeShareExtension`.
3. Replace the generated files with the ones in `ios-share-extension/`.
4. Enable App Group `group.app.recome.shared` on both targets.
5. Add URL Type `recome` on the host target.

Full step-by-step in `ios-share-extension/README.md`.

## Auth state

`ShareReceiver.ingest()` short-circuits with `not_signed_in` if the host app
has no access token in `expo-secure-store`. The Share Extension still
forwards the payload — the modal shows "Sign in to start saving" and the
user is one tap from the existing login flow.

A Keychain Access Group so the Share Extension can ingest without bouncing
through the host app is documented as a v1.2 polish in
`ios-share-extension/README.md` — defensible, but not worth the auth-surface
expansion until there's user signal asking for it.

## Build

```bash
# Dev (Expo Go: Android only — iOS Share Extension needs the dev client)
npx expo start --android
npx expo start --ios

# Native build via EAS (required for both Share Extension testing on iOS
# and for distributing to TestFlight / Play Console):
eas build --platform all --profile preview
```
