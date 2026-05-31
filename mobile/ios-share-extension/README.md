# RecomeShareExtension — iOS Share Sheet target

This folder contains the source for a standalone iOS Share Extension that lets
users share a URL from any app (Safari, Reddit, YouTube, Mail, …) directly
into Recome. The extension does **not** open the host app; it ingests the URL
inline against `/intelligence/signals` and dismisses.

Expo's managed workflow cannot declare a second iOS target (Share Extensions
require their own bundle, entitlements, and an App Group with the host app),
so this code ships as source files the founder adds to Xcode after
`expo prebuild`. The host-app side (URL scheme, App Group reads, share toast)
is already wired in `mobile/App.tsx` + `mobile/src/services/ShareReceiver.ts`.

## One-time setup

```bash
cd mobile
npx expo prebuild --platform ios          # generates ios/ workspace
open ios/Recome.xcworkspace
```

In Xcode:

1. **File → New → Target → Share Extension.**
   - Product name: `RecomeShareExtension`
   - Language: Swift, Project: Recome, Embed in: Recome
2. **Replace** the generated `ShareViewController.swift` with the file from
   this folder (same name). Replace the auto-generated `Info.plist` with the
   one alongside it.
3. **Capabilities → App Groups** on **both** the host app target and the
   `RecomeShareExtension` target:
   - Add: `group.app.recome.shared`
4. **URL Types** on the host app target:
   - Identifier: `app.recome.share`, URL Schemes: `recome`
5. **Provisioning:** the App Group ID must be enabled in your Apple Developer
   account for both bundle IDs (`app.recome.mobile`,
   `app.recome.mobile.ShareExtension`).

## Runtime contract

The Share Extension:

1. Reads the first text / URL attachment off `NSExtensionContext.inputItems`.
2. Writes `{ "url": "...", "title": "...", "ts": <ms> }` into the App Group's
   `UserDefaults(suiteName: "group.app.recome.shared")` under the key
   `shared-payload`.
3. Opens `recome://share?url=<URL>&title=<TITLE>` so the host app comes to the
   foreground.
4. Calls `completeRequest()` to dismiss the share sheet.

The host app's `ShareReceiver.attach()` listener fires on that URL scheme,
pulls the title from the App Group as a backup (URL scheme query params get
truncated by iOS on long titles), and ingests via `/intelligence/signals` —
the same path Android's `SEND` intent and the web `/paste` share-target go
through. One ingest contract, three OS surfaces.

## What this scaffold does NOT do (intentional)

- **No background ingest.** The Share Extension only forwards the payload;
  the actual `/intelligence/signals` POST happens in the host app once it's
  foregrounded. Doing the network call from the extension requires
  `NSURLSession` with background config + an auth-token shared via Keychain
  Access Group — defensible v1.2 work, but it adds an auth surface to the
  extension that's not worth shipping before there's user signal.
- **No share-extension UI beyond Apple's default sheet.** The extension uses
  `SLComposeServiceViewController`'s built-in confirmation. Custom UI is a
  v1.2 polish.
- **No tag/topic picker.** The extension can't reach Neo4j; topic assignment
  is the cloud's job. Future polish: a "category hint" dropdown that
  pre-tags the signal.

## Verifying

After build, share a URL from Safari. You should:

1. See the Recome icon in the share sheet.
2. Tap it → the extension shows its confirmation sheet, then auto-dismisses.
3. The Recome app foregrounds with the `ShareReceivedScreen` modal showing
   "Saved to your graph" + the signalId.
4. The shared URL appears in `/inbox` / `/mind` once Curator or Recall picks
   it up on the next pass.
