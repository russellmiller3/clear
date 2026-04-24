#!/usr/bin/env node
// scripts/decidable-core-replay.mjs
//
// Phase 7 measurement for the decidable-core branch. Pure analysis — no API
// spend, no sweeps. Answers "given every Clear source Meph has ever compiled,
// what would the new compiler's termination bounds + retry logic change?"
//
// This is the deterministic replay step from the plan (Session 46):
//   - Open playground/factor-db.sqlite
//   - Read every `code_actions` row with a non-empty source_before
//   - Recompile against the CURRENT compiler (already has the bounds landed)
//   - Count: warnings fired, retry markers emitted, transient-error sigs
//   - Produce a before/after-ish table Russell can read in <30 seconds
//
// Usage:
//   node scripts/decidable-core-replay.mjs
//   node scripts/decidable-core-replay.mjs --limit=100     # sample first N
//   node scripts/decidable-core-replay.mjs --verbose       # print per-row hits
//
// Exit code: 0 if the analysis completed. 2 if DB is missing.
//
// The script is intentionally read-only against the Factor DB. It never writes
// back. Safe to run repeatedly. Expect ~5-15 seconds for ~1600 rows on a warm
// cache.

import { compileProgram } from '../index.js';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const DB_PATH = 'playground/factor-db.sqlite';
if (!fs.existsSync(DB_PATH)) {
  console.error(`missing ${DB_PATH} — nothing to replay`);
  process.exit(2);
}

const args = process.argv.slice(2);
const limit = args.find(a => a.startsWith('--limit='))?.split('=')[1];
const verbose = args.includes('--verbose');

// Read code_actions rows via python3 + sqlite3 (no node deps). Write the
// script to a temp file to avoid shell-escaping mangling newlines.
const limitClause = limit ? `q += " LIMIT ${Number(limit)}"` : '';
const pyScript = `
import sqlite3, json, sys
conn = sqlite3.connect("${DB_PATH}")
conn.row_factory = sqlite3.Row
c = conn.cursor()
q = "SELECT id, source_before, error_sig, compile_ok, test_pass FROM code_actions WHERE source_before IS NOT NULL AND source_before != ''"
${limitClause}
rows = []
for r in c.execute(q):
    rows.append({"id": r["id"], "source_before": r["source_before"], "error_sig": r["error_sig"] or "", "compile_ok": r["compile_ok"], "test_pass": r["test_pass"]})
sys.stdout.write(json.dumps(rows))
`;

const tmpPy = `/tmp/decidable-core-replay-query-${process.pid}.py`;
fs.writeFileSync(tmpPy, pyScript);
let rows;
try {
  const out = execSync(`python3 ${tmpPy}`, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  rows = JSON.parse(out);
} catch (e) {
  console.error('failed to read factor-db:', e.message);
  process.exit(2);
} finally {
  try { fs.unlinkSync(tmpPy); } catch {}
}

console.log(`decidable-core-replay: analyzing ${rows.length} Factor DB rows`);
console.log('');

// Transient-error signatures the new retry layer would have helped with.
// Error sigs in the DB are sha-like hashes — we can't classify them directly.
// Instead, we look for these patterns in the source_before (the Clear code
// that produced the row) to bucket which safety rules might apply.
const metrics = {
  total: rows.length,
  compileOk: 0,
  compileFail: 0,
  // New-compiler introspection
  emitsWhileCounter: 0,  // source has a `while` → new compiler emits iteration cap
  emitsRecursionDepth: 0,  // source has self-recursive fn → depth counter
  emitsSendEmailTimeout: 0,  // source has `send email` → Promise.race wrapper
  emitsAskAIRetry: 0,  // source has `ask claude` → retry logic in compiled output
  // Validator warnings — the signal that the bounds are doing preventive work
  wtOneFires: 0,  // W-T1: naked while
  wtTwoFires: 0,  // W-T2: self-recursive without max depth
  wtThreeFires: 0,  // W-T3: send email without timeout
  // Pattern counts in source
  srcHasWhile: 0,
  srcHasSendEmail: 0,
  srcHasAskClaude: 0,
  // Rows whose source_before compiles clean (the baseline for "how many of these
  // sources does the new compiler still accept?")
  reCompileClean: 0,
  reCompileErrors: 0,
};

const examples = {
  wtOne: [],
  wtTwo: [],
  wtThree: [],
};

for (const row of rows) {
  const src = row.source_before || '';
  if (row.compile_ok) metrics.compileOk++; else metrics.compileFail++;

  // Source patterns (fast string checks — these are the patterns that *would*
  // trigger the new safety rules when they exist).
  if (/^\s*while\s/m.test(src)) metrics.srcHasWhile++;
  if (src.includes('send email')) metrics.srcHasSendEmail++;
  if (src.includes('ask claude')) metrics.srcHasAskClaude++;

  // Compile with the current (post-change) compiler.
  let r;
  try {
    r = compileProgram(src);
  } catch (e) {
    metrics.reCompileErrors++;
    continue;
  }
  if (!r.errors || r.errors.length === 0) metrics.reCompileClean++;
  else metrics.reCompileErrors++;

  // Scan the compiled output for retry/bounds markers.
  const emitted = (r.javascript || '') + (r.serverJS || '');
  if (emitted.includes('let _iter = 0') && emitted.includes('while-loop exceeded')) metrics.emitsWhileCounter++;
  if (emitted.includes('recursed more than')) metrics.emitsRecursionDepth++;
  if (emitted.includes('send email timed out')) metrics.emitsSendEmailTimeout++;
  if (emitted.includes('_attempt < 3') && emitted.includes('Math.pow(2, _attempt)')) metrics.emitsAskAIRetry++;

  // Scan warnings.
  for (const w of (r.warnings || [])) {
    const msg = typeof w === 'string' ? w : (w.message || '');
    if (msg.includes('while-loop has no')) { metrics.wtOneFires++; if (examples.wtOne.length < 3) examples.wtOne.push({ id: row.id, msg }); }
    if (msg.includes('calls itself')) { metrics.wtTwoFires++; if (examples.wtTwo.length < 3) examples.wtTwo.push({ id: row.id, msg }); }
    if (msg.includes('send email') && msg.includes('timeout')) { metrics.wtThreeFires++; if (examples.wtThree.length < 3) examples.wtThree.push({ id: row.id, msg }); }
  }

  if (verbose && (metrics.wtOneFires || metrics.wtTwoFires || metrics.wtThreeFires)) {
    console.log(`  row ${row.id}: src has ${src.includes('while ') ? 'while ' : ''}${src.includes('send email') ? 'send_email ' : ''}${src.includes('ask claude') ? 'ask_claude ' : ''}`);
  }
}

// Percentage helper
const pct = (n) => ((n / metrics.total) * 100).toFixed(1);

console.log('=== BASELINE (Factor DB as shipped) ===');
console.log(`  Total rows:              ${metrics.total}`);
console.log(`  compile_ok at write time: ${metrics.compileOk} (${pct(metrics.compileOk)}%)`);
console.log(`  compile_fail at write time: ${metrics.compileFail} (${pct(metrics.compileFail)}%)`);
console.log('');

console.log('=== SOURCE PATTERNS (what Meph has actually written) ===');
console.log(`  rows with \`while\`:       ${metrics.srcHasWhile} (${pct(metrics.srcHasWhile)}%)`);
console.log(`  rows with \`send email\`:  ${metrics.srcHasSendEmail} (${pct(metrics.srcHasSendEmail)}%)`);
console.log(`  rows with \`ask claude\`:  ${metrics.srcHasAskClaude} (${pct(metrics.srcHasAskClaude)}%)`);
console.log('');

console.log('=== RECOMPILE AGAINST NEW COMPILER ===');
console.log(`  Clean compile:           ${metrics.reCompileClean} (${pct(metrics.reCompileClean)}%)`);
console.log(`  Has errors:              ${metrics.reCompileErrors} (${pct(metrics.reCompileErrors)}%)`);
console.log('');

console.log('=== NEW BOUNDS EMITTED ===');
console.log(`  WHILE counter emitted:   ${metrics.emitsWhileCounter}`);
console.log(`  Recursion depth emitted: ${metrics.emitsRecursionDepth}`);
console.log(`  SEND_EMAIL timeout:      ${metrics.emitsSendEmailTimeout}`);
console.log(`  ask-claude retry marks:  ${metrics.emitsAskAIRetry} (${pct(metrics.emitsAskAIRetry)}%)`);
console.log('');

console.log('=== NEW WARNINGS FIRED (preventive signal) ===');
console.log(`  W-T1 (naked while):      ${metrics.wtOneFires}`);
console.log(`  W-T2 (self-recursive):   ${metrics.wtTwoFires}`);
console.log(`  W-T3 (send email timeout): ${metrics.wtThreeFires}`);
console.log('');

if (examples.wtOne.length || examples.wtTwo.length || examples.wtThree.length) {
  console.log('=== EXAMPLES ===');
  for (const [tag, arr] of [['W-T1', examples.wtOne], ['W-T2', examples.wtTwo], ['W-T3', examples.wtThree]]) {
    for (const ex of arr) {
      console.log(`  ${tag} @ row ${ex.id}: ${ex.msg.slice(0, 100)}`);
    }
  }
  console.log('');
}

console.log('=== INTERPRETATION ===');
if (metrics.wtOneFires + metrics.wtTwoFires + metrics.wtThreeFires === 0) {
  console.log('  Zero termination warnings fired across the entire Factor DB.');
  console.log('  This matches the Session 46 audit: Meph has not written');
  console.log('  naked `while`, self-recursive functions, or bare `send email`');
  console.log(`  in any of the ${metrics.total} rows. The new bounds are`);
  console.log('  PREVENTIVE (closing an un-exercised foot-gun) rather than');
  console.log('  REACTIVE (fixing a failure class we can measure today).');
  console.log('  Justification comes from the capital-investment framing:');
  console.log('  the cost of the bounds is fixed and small; the cost of any');
  console.log('  future hang they prevent is unbounded.');
}
if (metrics.emitsAskAIRetry > 0) {
  console.log(`  ${metrics.emitsAskAIRetry} compiled outputs now carry retry logic.`);
  console.log('  These runs will auto-recover from transient 429/5xx/network');
  console.log('  errors that previously surfaced as sweep-killing failures.');
}
console.log('');
console.log('=== NEXT STEPS ===');
console.log('  - Real Phase 7 measurement (A/B on 5 curriculum tasks) needs');
console.log('    ANTHROPIC_API_KEY + Russell approval (~$2-5, capped $10).');
console.log('  - See playground/eval-meph.js for the harness shape the A/B');
console.log('    would reuse.');
