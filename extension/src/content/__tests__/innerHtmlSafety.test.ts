/**
 * P0.3 Regression Guard — innerHTML Safety
 *
 * Scans all non-test content-side source files for innerHTML/outerHTML
 * assignments and verifies that every occurrence is in the approved allowlist.
 *
 * If this test fails, it means a new innerHTML usage was introduced.
 * Either:
 *   1. Use textContent or DOM construction instead, OR
 *   2. Wrap the value with escapeHtml() or sanitizePromptHtml(), then
 *      add the location to APPROVED_LOCATIONS below.
 */

import * as fs from 'fs';
import * as path from 'path';

// Approved innerHTML locations — each entry is { file (relative to repo root), line }
// All of these have been audited and use escapeHtml(), sanitizePromptHtml(),
// static chrome.runtime.getURL(), or only insert hardcoded markup.
const APPROVED_LOCATIONS: Array<{ file: string; line: number }> = [
  // PromptRenderer: uses sanitizePromptHtml()
  { file: 'extension/src/content/prompts/PromptRenderer.ts', line: 51 },
  // FloatingOverlay: static chrome.runtime.getURL() only
  { file: 'extension/src/content/overlay/FloatingOverlay.tsx', line: 87 },
  // Toast: message already escaped via escapeHtml()
  { file: 'extension/src/content/ui/Toast.ts', line: 33 },
  // BaseAdapter: badge with static label (not user-controlled)
  { file: 'extension/src/content/adapters/BaseAdapter.ts', line: 266 },
  // BaseAdapter: menu buttons with escapeHtml()
  { file: 'extension/src/content/adapters/BaseAdapter.ts', line: 555 },
  { file: 'extension/src/content/adapters/BaseAdapter.ts', line: 652 },
  { file: 'extension/src/content/adapters/BaseAdapter.ts', line: 675 },
  { file: 'extension/src/content/adapters/BaseAdapter.ts', line: 815 },
];

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SCAN_DIRS = ['extension/src/content', 'extension/src/popup'];

// Match `.innerHTML =` or `.outerHTML =` assignments (not reads)
const INNER_HTML_PATTERN = /\.(?:innerHTML|outerHTML)\s*=/;

function getAllTsFiles(dir: string): string[] {
  const results: string[] = [];
  const fullDir = path.join(REPO_ROOT, dir);
  if (!fs.existsSync(fullDir)) return results;

  function walk(d: string) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.')) {
        results.push(full);
      }
    }
  }

  walk(fullDir);
  return results;
}

describe('P0.3 innerHTML Safety', () => {
  it('should have no unapproved innerHTML/outerHTML assignments', () => {
    const unapproved: string[] = [];

    for (const scanDir of SCAN_DIRS) {
      const files = getAllTsFiles(scanDir);
      for (const filePath of files) {
        const relPath = path.relative(REPO_ROOT, filePath);
        const lines = fs.readFileSync(filePath, 'utf-8').split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!;
          // Skip comments
          if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;
          if (!INNER_HTML_PATTERN.test(line)) continue;

          const lineNum = i + 1;
          const isApproved = APPROVED_LOCATIONS.some(
            (loc) => relPath.replace(/\\/g, '/') === loc.file && lineNum === loc.line,
          );

          if (!isApproved) {
            unapproved.push(`${relPath}:${lineNum} → ${line.trim()}`);
          }
        }
      }
    }

    expect(unapproved).toEqual(expect.objectContaining({ length: 0 }));
    if (unapproved.length > 0) {
      // Extra detail if the above assertion somehow doesn't trigger
      throw new Error(
        `Found ${unapproved.length} unapproved innerHTML/outerHTML assignment(s).\n` +
          'Either replace with textContent/DOM construction, or wrap with escapeHtml()/sanitizePromptHtml() ' +
          'and add to APPROVED_LOCATIONS in this test.\n\n' +
          unapproved.map((u) => `  - ${u}`).join('\n'),
      );
    }
  });

  it('approved locations should still exist (detect stale allowlist entries)', () => {
    const stale: string[] = [];

    for (const loc of APPROVED_LOCATIONS) {
      const filePath = path.join(REPO_ROOT, loc.file);
      if (!fs.existsSync(filePath)) {
        stale.push(`${loc.file}:${loc.line} — file not found`);
        continue;
      }

      const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
      const lineContent = lines[loc.line - 1];
      if (!lineContent || !INNER_HTML_PATTERN.test(lineContent)) {
        stale.push(
          `${loc.file}:${loc.line} — no innerHTML at this line (was it moved or removed?)`,
        );
      }
    }

    expect(stale).toEqual(expect.objectContaining({ length: 0 }));
    if (stale.length > 0) {
      throw new Error(
        `Found ${stale.length} stale approved location(s). Update APPROVED_LOCATIONS:\n\n` +
          stale.map((s) => `  - ${s}`).join('\n'),
      );
    }
  });
});
