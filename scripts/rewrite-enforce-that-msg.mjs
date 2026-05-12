#!/usr/bin/env node
// One-shot rewrite: `enforce that X or 'msg'` → `enforce that X, or fail with error message: 'msg'`
//
// Russell locked the new canonical form 2026-05-03 evening. The old form
// reads weird because `or` is in the wrong position (`X or 'message'`
// reads "X or this string" not "if not X, fail with this message"). The
// new form reads as English: "enforce that X is true, OR if not, fail
// with this error message."
//
// Per project rule: no back-compat. Every existing `or 'msg'` form gets
// rewritten in this single pass. The parser is updated in the same
// commit to require the new form.
//
// Files touched: every `.clear` file under apps/, examples/, tests/, plus
// any `.js`/`.mjs`/`.md` file that contains inline Clear source strings
// for tests / docs. The rewrite is line-scoped — only lines starting with
// `enforce that` (after whitespace) and ending in `or 'msg'` are changed.
//
// Run: `node scripts/rewrite-enforce-that-msg.mjs`

import { readFileSync, writeFileSync, statSync, readdirSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT  = dirname(dirname(__filename));

// Match a line whose leading whitespace + content begins with "enforce that"
// and whose trailing portion is `or 'msg'` (single-quoted message). Replace
// with the new separator. Capture indent + expression + message + trailing
// whitespace so we preserve formatting exactly.
//
// The pattern is conservative: it requires single quotes (Clear's canonical
// string delimiter), and it allows the message to contain anything except
// a single quote. Multi-line strings, double-quoted strings, and embedded
// single quotes are not touched. None of those forms appear in the
// existing audit (130 occurrences across 19 files).
const PATTERN = /^(\s*enforce that .+?) or '([^']*)'(\s*)$/;
const REPLACEMENT = (_m, expr, msg, trail) =>
  `${expr}, or fail with error message: '${msg}'${trail}`;

// File-extension allow-list. Only walk files where Clear source is likely
// to appear — either as actual Clear (`.clear`) or as inline strings in
// JS / docs. Exclude node_modules, build outputs, and history.
const ALLOWED_EXTS = new Set(['.clear', '.js', '.mjs', '.md']);
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.claude', 'build', '.tmp', '.cache',
  'studio/.tmp', 'studio/.studio-build',
]);

function* walkFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel  = full.slice(REPO_ROOT.length + 1).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if ([...SKIP_DIRS].some(s => rel.startsWith(s))) continue;
      yield* walkFiles(full);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!ALLOWED_EXTS.has(extname(entry.name))) continue;
    yield full;
  }
}

const changed = [];
let totalLines = 0;
for (const file of walkFiles(REPO_ROOT)) {
  const original = readFileSync(file, 'utf8');
  const lines = original.split('\n');
  let dirty = false;
  let count = 0;
  const next = lines.map((line) => {
    const m = line.match(PATTERN);
    if (!m) return line;
    dirty = true;
    count++;
    return REPLACEMENT(...m);
  });
  if (dirty) {
    writeFileSync(file, next.join('\n'), 'utf8');
    const rel = file.slice(REPO_ROOT.length + 1).replace(/\\/g, '/');
    changed.push({ file: rel, count });
    totalLines += count;
  }
}

console.log(`Rewrote ${totalLines} lines across ${changed.length} files:`);
for (const c of changed) console.log(`  ${c.file}: ${c.count}`);
