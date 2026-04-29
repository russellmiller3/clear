// Direct verification of cycle 4 against the real factor-db.sqlite — no
// LLM cost, no Meph invocation. Calls editCodeTool with the real Factor DB
// open and a synthetic compile-error-triggering source. Asserts a row was
// inserted with the expected shape, then deletes it (probe rows would
// pollute the training corpus otherwise).
//
// Confirms three things:
//   1. The schema matches what editCodeTool's logAction call expects
//   2. ctx.hintState.lastFactorRowId is set to the new row id
//   3. attachHintsForCompileResult fires querySuggestions against the
//      real DB (no crash on real schema, even if no candidates match)
//
// Run: node tools/verify-cc-agent-hint-fix.mjs
//
// Expected output:
//   ✓ row inserted with id=N, archetype=general, compile_ok=0
//   ✓ ctx.hintState.lastFactorRowId === N
//   ✓ querySuggestions ran without throwing
//   ✓ probe row cleaned up

import { editCodeTool } from '../playground/meph-tools.js';
import { compileProgram } from '../index.js';
import { FactorDB } from '../playground/supervisor/factor-db.js';
import { MephContext } from '../playground/meph-context.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'playground', 'factor-db.sqlite');

const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
const noop = () => null;
const safeArchetype = () => 'general';
const currentStep = () => null;
const classifyErrorCategory = () => 'none';
const rankPairwise = (_b, _c, rows) => rows;
const rankEBM = (_b, rows) => rows;
const featurizeRow = () => ({});

const helpers = {
  compileProgram,
  sha1,
  safeArchetype,
  currentStep,
  classifyErrorCategory,
  rankPairwise,
  rankEBM,
  featurizeRow,
};

const factorDB = new FactorDB(DB_PATH);
const sessionId = `verify-cc-agent-hint-fix_${Date.now()}`;
const ctx = new MephContext({
  source: '',
  factorDB,
  sessionId,
});

console.log(`Probing factor-db.sqlite at ${DB_PATH}`);
console.log(`Session id (probe-only — will be cleaned up): ${sessionId}`);

const badSource = 'database is local memory\n\nshow undefined_variable\n';
const result = JSON.parse(editCodeTool({ action: 'write', code: badSource }, ctx, helpers));

console.log('');
console.log('--- editCodeTool result ---');
console.log('applied:', result.applied);
console.log('errors count:', result.errors?.length || 0);
console.log('hints attached:', result.hints ? 'yes' : 'no');
console.log('lastFactorRowId:', ctx.hintState.lastFactorRowId);
console.log('');

if (!ctx.hintState.lastFactorRowId) {
  console.error('❌ FAIL: ctx.hintState.lastFactorRowId not set');
  process.exit(1);
}

// Look up the row directly
const row = factorDB._db.prepare(
  'SELECT id, session_id, archetype, task_type, compile_ok, error_sig, hint_applied FROM code_actions WHERE id = ?'
).get(ctx.hintState.lastFactorRowId);

console.log('--- row in factor-db.sqlite ---');
console.log(row);

const checks = [];
checks.push([row?.session_id === sessionId, `session_id matches probe (${row?.session_id})`]);
checks.push([row?.task_type === 'compile_cycle', `task_type === compile_cycle (${row?.task_type})`]);
checks.push([row?.compile_ok === 0, `compile_ok === 0 since source has errors (${row?.compile_ok})`]);
checks.push([row?.archetype === 'general', `archetype tagged general (${row?.archetype})`]);
checks.push([typeof row?.error_sig === 'string' && row.error_sig.length > 0, `error_sig populated (${row?.error_sig?.slice(0, 16)}...)`]);
// hint_applied stays NULL until the post-turn HINT_APPLIED parser fires —
// which only happens via /api/chat after a real Meph turn. The schema field
// is allocated and ready to be updated; that's enough to verify cycle 4.
checks.push([row?.hint_applied === null, `hint_applied is NULL (post-turn parser will fill it; ${row?.hint_applied})`]);

console.log('');
let allPass = true;
for (const [pass, label] of checks) {
  console.log(`${pass ? '✓' : '❌'} ${label}`);
  if (!pass) allPass = false;
}

// Clean up the probe row so it doesn't pollute the corpus.
factorDB._db.prepare('DELETE FROM code_actions WHERE id = ?').run(ctx.hintState.lastFactorRowId);
console.log('');
console.log(`✓ probe row id=${ctx.hintState.lastFactorRowId} cleaned up`);

factorDB.close();
process.exit(allPass ? 0 : 1);
