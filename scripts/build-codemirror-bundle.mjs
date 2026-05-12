// Build script for Studio's CodeMirror bundle.
//
// Why this script exists: Studio (`studio/studio.html`) imports
// from `studio/codemirror.bundle.js` — a pre-built ESM file that
// ships with the repo. Browsers can't `import` from npm packages, so
// every CodeMirror symbol used in Studio has to be in this
// single bundle. The bundle was originally vendored from a one-off
// `npm install` + esbuild pass that wasn't checked in. This script
// makes the rebuild reproducible.
//
// What the script does:
//   1. Reads `scripts/codemirror-entry.mjs` (the single source of truth
//      for which CodeMirror symbols Studio uses).
//   2. Runs esbuild against it with the browser target.
//   3. Writes the minified ESM result to `studio/codemirror.bundle.js`.
//   4. Reports the bundle size (warns if it has ballooned past 600 KB).
//
// To regenerate after adding a new editor feature:
//   1. Add the missing symbol to `scripts/codemirror-entry.mjs` exports.
//   2. If a new package is needed, add it to `devDependencies` in
//      `package.json` and run `npm install`.
//   3. `node scripts/build-codemirror-bundle.mjs`
//   4. Commit `studio/codemirror.bundle.js` (and `package.json` /
//      `package-lock.json` if deps changed).
//
// CodeMirror v6 is split across many small @codemirror/* packages. Each
// package version-bumps independently. This script doesn't pin specific
// versions — it picks up whatever's in node_modules at build time. If
// you want predictable rebuilds, lock the versions in `package.json`
// devDependencies (no `^`).
//
// Why minified: the unminified bundle is ~3x larger (~1.3 MB vs 443 KB
// today) and offers no debugging benefit because all the CodeMirror
// internals are themselves minified. Studio's own source map
// for `studio/studio.html` is what users debug.

import { build } from 'esbuild';
import { readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const entryPoint = resolve(__dirname, 'codemirror-entry.mjs');
const outFile = resolve(repoRoot, 'studio', 'codemirror.bundle.js');

console.log('[codemirror-bundle] entry  =', entryPoint);
console.log('[codemirror-bundle] output =', outFile);

const before = (() => {
  try { return statSync(outFile).size; } catch { return 0; }
})();

await build({
  entryPoints: [entryPoint],
  bundle: true,
  format: 'esm',
  target: ['es2020'],
  platform: 'browser',
  minify: true,
  outfile: outFile,
  // Treat node-builtin imports as errors — CodeMirror is browser-only,
  // so any `fs` / `path` / `url` reference would mean a wrong import
  // slipped through and would 404 at runtime in the browser. Better to
  // catch it at build time.
  external: [],
  // Don't generate a sourcemap — studio/studio.html ships its own,
  // and bundling the CodeMirror source map would 2-3x the file size
  // for no real debugging benefit (CodeMirror internals are not what
  // Studio developers debug).
  sourcemap: false,
  // Drop comments to keep the bundle tight.
  legalComments: 'none',
});

const after = statSync(outFile).size;
const beforeKB = (before / 1024).toFixed(1);
const afterKB = (after / 1024).toFixed(1);
const delta = after - before;
const deltaKB = (Math.abs(delta) / 1024).toFixed(1);
const direction = delta === 0 ? '(unchanged)'
  : delta > 0 ? `(+${deltaKB} KB)`
  : `(-${deltaKB} KB)`;

console.log(`[codemirror-bundle] size: ${beforeKB} KB → ${afterKB} KB ${direction}`);

// Warn if the bundle has ballooned. Studio load time on a fresh
// page is roughly proportional to bundle size; >600 KB starts to hurt
// on slow connections.
if (after > 600 * 1024) {
  console.warn('[codemirror-bundle] WARNING — bundle size > 600 KB. Investigate before shipping.');
  console.warn('[codemirror-bundle]   Likely cause: a new package brought in a heavy transitive dep.');
  console.warn('[codemirror-bundle]   Check: `npx esbuild --bundle --analyze --metafile=meta.json` then');
  console.warn('[codemirror-bundle]   inspect `meta.json` for the largest contributors.');
}

// Sanity-check: every export the studio imports must actually be in
// the new bundle. Scan studio/studio.html for `import { ... } from
// './codemirror.bundle.js'` and verify every named symbol resolves.
const idePath = resolve(repoRoot, 'studio', 'studio.html');
const ide = readFileSync(idePath, 'utf8');
const importLines = ide.match(/import\s*\{[^}]+\}\s*from\s*['"]\.\/codemirror\.bundle\.js['"]/g) || [];
const want = new Set();
for (const line of importLines) {
  const inner = line.match(/\{([^}]+)\}/)[1];
  for (const sym of inner.split(',').map(s => s.trim()).filter(Boolean)) {
    want.add(sym);
  }
}

const bundle = readFileSync(outFile, 'utf8');
const missing = [];
for (const sym of want) {
  // Minified ESM exports look like `export { Foo as F, Bar as B }` at
  // the bottom. Search for `as <symbol>}` or `as <symbol>,` or `<symbol> as` etc.
  // The simplest reliable check: look for `\b<symbol>\b` in the
  // export-mapping suffix at the very end of the file.
  const tail = bundle.slice(-3000);
  const re = new RegExp(`\\b${sym}\\b`);
  if (!re.test(tail)) missing.push(sym);
}

if (missing.length > 0) {
  console.error('[codemirror-bundle] ERROR — these imports exist in studio/studio.html but are NOT in the new bundle:');
  missing.forEach(m => console.error('   • ' + m));
  console.error('[codemirror-bundle] Add them to scripts/codemirror-entry.mjs and rebuild.');
  process.exit(1);
}

console.log(`[codemirror-bundle] verified ${want.size} import symbol(s) all resolve.`);
console.log('[codemirror-bundle] OK.');
