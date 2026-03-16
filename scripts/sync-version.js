#!/usr/bin/env node
/**
 * Syncs the version from package.json to extension/src/manifest.json.
 * Run: node scripts/sync-version.js
 * Or:  npm version patch/minor/major (triggers via "version" npm hook)
 */
const fs = require('fs');
const path = require('path');

const pkgPath = path.resolve(__dirname, '..', 'package.json');
const manifestPath = path.resolve(__dirname, '..', 'extension', 'src', 'manifest.json');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

if (manifest.version !== pkg.version) {
  manifest.version = pkg.version;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\u2713 Synced manifest.json version to ${pkg.version}`);
} else {
  console.log(`\u2713 Versions already in sync: ${pkg.version}`);
}
