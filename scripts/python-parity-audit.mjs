#!/usr/bin/env node
// scripts/python-parity-audit.mjs
//
// Cross-target parity audit. For every NodeType in parser.js, check whether
// compileToPythonBackend in compiler.js handles it. Surfaces gaps as a CSV
// + a human-readable report. Also checks runtime helper file pairs.
//
// Answers the load-bearing question for the Python parity closure pass
// (plans/plan-python-parity.md): "What does the JS compile path do that the
// Python path silently skips?"
//
// Usage:
//   node scripts/python-parity-audit.mjs           # human report
//   node scripts/python-parity-audit.mjs --csv     # CSV at the bottom
//
// Exit codes: 0 = no HIGH-severity gaps. 1 = one or more HIGH-severity gap.

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// ---------------------------------------------------------------------------
// 1. Extract every NodeType from parser.js
// ---------------------------------------------------------------------------
const parserSrc = readFileSync(join(root, 'parser.js'), 'utf8');
const enumStart = parserSrc.indexOf('export const NodeType = Object.freeze({');
if (enumStart < 0) {
  console.error('Could not find NodeType enum in parser.js');
  process.exit(2);
}
const enumEnd = parserSrc.indexOf('});', enumStart);
const enumBody = parserSrc.slice(enumStart, enumEnd);
const nodeTypes = [...enumBody.matchAll(/^\s*([A-Z_][A-Z0-9_]*):\s*'([a-z_]+)'/gm)].map(m => ({
  key: m[1],
  value: m[2],
}));

// ---------------------------------------------------------------------------
// 2. Slice out compileToPythonBackend from compiler.js
// ---------------------------------------------------------------------------
const compilerSrc = readFileSync(join(root, 'compiler.js'), 'utf8');
const pyStart = compilerSrc.indexOf('function compileToPythonBackend(');
if (pyStart < 0) {
  console.error('Could not find compileToPythonBackend in compiler.js');
  process.exit(2);
}
// Walk forward looking for next top-level function as a heuristic boundary.
// The Python path is one big function plus its inline helpers; nothing else
// references NodeType outside it that we'd want to count as Python-handler.
let pyEnd = compilerSrc.indexOf('\nfunction ', pyStart + 10);
if (pyEnd < 0) pyEnd = compilerSrc.length;
const pySlice = compilerSrc.slice(pyStart, pyEnd);

// ---------------------------------------------------------------------------
// 3. JS slice = everything else (compileNode + helpers + Cloudflare path)
// ---------------------------------------------------------------------------
const jsSlice = compilerSrc.slice(0, pyStart) + compilerSrc.slice(pyEnd);

// ---------------------------------------------------------------------------
// 4. Severity classifier — based on what each NodeType represents
// ---------------------------------------------------------------------------
const HIGH_SEVERITY = new Set([
  // Auth + access control
  'REQUIRES_AUTH', 'REQUIRES_ROLE', 'GUARD', 'POLICY', 'THROW',
  'AUTH_SCAFFOLD', 'DEFINE_ROLE',
  // OWASP primitives
  'RATE_LIMIT', 'SENSITIVE_FIELD', 'OUTGOING_ALLOWLIST',
  'CAN_RETURN_SENSITIVE',
  // Business rules + provability
  'RULE_DEF',
  // Core data + endpoints
  'DATA_SHAPE', 'CRUD', 'ENDPOINT',
  // External effects
  'EXTERNAL_FETCH', 'RUN_COMMAND', 'SCRIPT',
  // AI
  'AGENT', 'ASK_AI', 'GIVE_CLAUDE', 'RUN_AGENT',
  // Workflow / queue / email
  'QUEUE_DEF', 'EMAIL_TRIGGER', 'EMAIL_DELIVERY_DIRECTIVE',
  'WORKFLOW', 'RUN_WORKFLOW', 'PIPELINE', 'RUN_PIPELINE',
  // Background / scheduled
  'CRON', 'BACKGROUND',
  // Concurrency
  'WITH_OPTIMISTIC_LOCK', 'SAFE_TO_RETRY',
  // Test surface (we want both targets testable)
  'TEST_DEF', 'EXPECT', 'HTTP_TEST_CALL', 'UNIT_ASSERT',
]);

const UI_ONLY = new Set([
  // HTML page chrome
  'PAGE', 'CONTENT', 'BUTTON', 'DISPLAY', 'CHART',
  'SECTION', 'NAV_SECTION', 'NAV_ITEM',
  'TAB_GROUP', 'TAB', 'TAB_STRIP', 'PAGE_HEADER', 'ROUTE_TAB',
  'STAT_STRIP', 'STAT_CARD', 'DETAIL_PANEL', 'PANEL_ACTION',
  'HIDE_ELEMENT', 'CLIPBOARD_COPY', 'DOWNLOAD_FILE', 'LOADING_ACTION',
  'TOAST', 'ASK_FOR', 'STYLE_DEF', 'THEME',
  'STORE', 'RESTORE',
]);

function severity(key) {
  if (HIGH_SEVERITY.has(key)) return 'HIGH';
  if (UI_ONLY.has(key)) return 'UI-only';
  return 'MEDIUM';
}

// ---------------------------------------------------------------------------
// 5. Count NodeType references in each slice
// ---------------------------------------------------------------------------
function countHits(slice, key) {
  const re = new RegExp(`NodeType\\.${key}\\b`, 'g');
  return (slice.match(re) || []).length;
}

const rows = nodeTypes.map(({ key, value }) => {
  const js = countHits(jsSlice, key);
  const python = countHits(pySlice, key);
  return { key, value, js, python, severity: severity(key) };
});

// ---------------------------------------------------------------------------
// 6. Identify gaps
// ---------------------------------------------------------------------------
const gaps = rows.filter(r => r.js > 0 && r.python === 0 && r.severity !== 'UI-only');
const matched = rows.filter(r => r.js > 0 && r.python > 0);
const uiSkipped = rows.filter(r => r.severity === 'UI-only');
const pyOnly = rows.filter(r => r.python > 0 && r.js === 0);

// ---------------------------------------------------------------------------
// 7. Runtime helper file-pair check
// ---------------------------------------------------------------------------
const helpers = [
  { js: 'runtime/auth.js', py: 'runtime/auth.py', severity: 'HIGH', note: 'allow signup and login (bcrypt + JWT)' },
  { js: 'runtime/rateLimit.js', py: 'runtime/rate_limit.py', severity: 'HIGH', note: 'auto login rate-limit (OWASP Piece 4)' },
  { js: 'runtime/sensitive-crypto.js', py: 'runtime/sensitive_crypto.py', severity: 'HIGH', note: 'encrypt-at-rest for sensitive fields (OWASP Piece 3)' },
  { js: 'runtime/db.js', py: 'runtime/db.py', severity: 'HIGH', note: 'persistent DB layer (Python target uses inline _DB stub today)' },
  { js: 'runtime/db-postgres.js', py: 'runtime/db_postgres.py', severity: 'MEDIUM', note: 'Postgres adapter parity' },
];
// Python peer paths use PEP 8 underscored filenames (rate_limit.py,
// sensitive_crypto.py, db_postgres.py) even though the JS siblings use
// hyphens or camelCase. Earlier versions of this list expected the JS
// name verbatim with .py — that reported false gaps for files that DO
// exist under PEP 8 names. Helpers list now uses the actual Python paths.
const helperGaps = helpers.filter(h =>
  existsSync(join(root, h.js)) && !existsSync(join(root, h.py))
);

// ---------------------------------------------------------------------------
// 8. Print report
// ---------------------------------------------------------------------------
const wantCsv = process.argv.includes('--csv');

console.log('# Python Parity Audit');
console.log('# Generated: ' + new Date().toISOString());
console.log('');
console.log('## Summary');
console.log(`Total NodeTypes: ${rows.length}`);
console.log(`Both targets handle: ${matched.length}`);
console.log(`Python-only handlers (rare): ${pyOnly.length}`);
console.log(`Python GAPS — HIGH severity: ${gaps.filter(g => g.severity === 'HIGH').length}`);
console.log(`Python GAPS — MEDIUM severity: ${gaps.filter(g => g.severity === 'MEDIUM').length}`);
console.log(`UI-only NodeTypes (skipped — Python target doesn't render HTML): ${uiSkipped.length}`);
console.log(`Runtime helper file gaps: ${helperGaps.length} of ${helpers.length}`);
console.log('');

if (helperGaps.length) {
  console.log('## HIGH-severity runtime helper file gaps');
  console.log('');
  console.log('These JS runtime files exist but their Python peers do NOT.');
  console.log('Python apps that need the corresponding feature will silently fall back');
  console.log('to whatever the inline Python emit does — usually no security at all.');
  console.log('');
  for (const h of helperGaps) {
    console.log(`- **${h.py}** (paired with ${h.js}) — severity: ${h.severity}`);
    console.log(`  ${h.note}`);
  }
  console.log('');
}

const highGaps = gaps.filter(g => g.severity === 'HIGH').sort((a, b) => b.js - a.js);
if (highGaps.length) {
  console.log('## HIGH-severity NodeType gaps');
  console.log('');
  console.log('JS compile path handles these, Python does not. Each is a feature that');
  console.log('parses + validates + emits on Node but silently does nothing on Python.');
  console.log('');
  for (const g of highGaps) {
    console.log(`- **${g.key}** (\`${g.value}\`) — JS handler hits: ${g.js}, Python: 0`);
  }
  console.log('');
}

const mediumGaps = gaps.filter(g => g.severity === 'MEDIUM').sort((a, b) => b.js - a.js);
if (mediumGaps.length) {
  console.log('## MEDIUM-severity NodeType gaps');
  console.log('');
  for (const g of mediumGaps) {
    console.log(`- ${g.key} (\`${g.value}\`) — JS hits: ${g.js}, Python: 0`);
  }
  console.log('');
}

if (pyOnly.length) {
  console.log('## Python-only handlers (no JS counterpart)');
  console.log('');
  console.log('Rare. Worth investigating — usually means a NodeType got renamed on the');
  console.log('JS side but the Python branch still references the old name.');
  console.log('');
  for (const r of pyOnly) {
    console.log(`- ${r.key} (\`${r.value}\`) — Python hits: ${r.python}, JS: 0`);
  }
  console.log('');
}

if (wantCsv) {
  console.log('## CSV');
  console.log('node_type,clear_value,js_hits,python_hits,severity,is_gap');
  for (const r of rows) {
    const gap = r.js > 0 && r.python === 0 && r.severity !== 'UI-only';
    console.log(`${r.key},${r.value},${r.js},${r.python},${r.severity},${gap}`);
  }
}

const fail = (helperGaps.length + highGaps.length) > 0;
process.exit(fail ? 1 : 0);
