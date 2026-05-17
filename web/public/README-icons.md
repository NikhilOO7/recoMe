# PWA icon assets

`/manifest.webmanifest` references three icon files that must exist before
publishing the PWA:

- `icon-192.png` (192×192)
- `icon-512.png` (512×512)
- `icon-maskable-512.png` (512×512, with safe zone padding for Android)

Generate from the brand mark in [`website/logo.png`](../../website/logo.png).
Recommended tool: [`pwa-asset-generator`](https://github.com/onderceylan/pwa-asset-generator)
or [maskable.app](https://maskable.app/) for the maskable variant.

```bash
npx pwa-asset-generator website/logo.png web/public \
  --type png --background "#0a0a0a" --padding "10%"
```

Until those files are added, the manifest will validate but iOS/Android
will fall back to a generic icon on the home screen.
