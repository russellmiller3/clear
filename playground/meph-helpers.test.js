// =============================================================================
// MEPH HELPERS — UNIT TESTS
// =============================================================================
// Verifies the pure helpers that used to live in playground/server.js and
// now live in playground/meph-helpers.js. Both /api/chat and the MCP
// server depend on these — the tests here catch extraction regressions
// (e.g. regex drift in parseTestOutput, signature changes in compileForEval).
//
// Run: node playground/meph-helpers.test.js
// =============================================================================

import { parseTestOutput, compileForEval } from './meph-helpers.js';
import { compileProgram } from '../index.js';

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

console.log('\n🧾 parseTestOutput\n');

// Empty stdout → empty results
{
  const r = parseTestOutput('');
  assert(r.passed === 0 && r.failed === 0 && r.results.length === 0,
    'empty stdout returns {passed:0, failed:0, results:[]}');
}

// null stdout → same clean shape (defensive)
{
  const r = parseTestOutput(null);
  assert(r.passed === 0 && r.failed === 0,
    'null stdout returns 0/0 without throwing');
}

// Single pass line
{
  const r = parseTestOutput('PASS: test the login flow');
  assert(r.passed === 1 && r.failed === 0,
    'single PASS line counted');
  assert(r.results[0].name === 'test the login flow' && r.results[0].status === 'pass',
    'PASS name + status captured');
}

// Single fail line with single-dash error
{
  const r = parseTestOutput('FAIL: test X - expected 2 got 3');
  assert(r.passed === 0 && r.failed === 1, 'single FAIL counted');
  assert(r.results[0].error === 'expected 2 got 3',
    `FAIL error captured (got "${r.results[0].error}")`);
  assert(r.results[0].sourceLine === null,
    'no [clear:N] tag → sourceLine=null');
}

// Legacy dash-dash separator still supported
{
  const r = parseTestOutput('FAIL: test Y -- old-style error');
  assert(r.failed === 1,
    'legacy " -- " separator still parses');
  assert(r.results[0].error === 'old-style error',
    `dash-dash error text captured (got "${r.results[0].error}")`);
}

// [clear:N] source line extraction
{
  const r = parseTestOutput('FAIL: test Z - something broke [clear:42]');
  assert(r.results[0].error === 'something broke',
    `[clear:N] tag stripped from error message (got "${r.results[0].error}")`);
  assert(r.results[0].sourceLine === 42,
    `sourceLine parsed as number (got ${r.results[0].sourceLine})`);
}

// Mixed batch
{
  const stdout = [
    'PASS: one',
    'PASS: two',
    'FAIL: three - boom [clear:10]',
    'some junk line that is ignored',
    'PASS: four',
  ].join('\n');
  const r = parseTestOutput(stdout);
  assert(r.passed === 3 && r.failed === 1,
    `mixed stdout counted correctly (got ${r.passed} passed, ${r.failed} failed)`);
  assert(r.results.length === 4,
    `non-PASS/FAIL lines skipped (got ${r.results.length} results, expected 4)`);
}

console.log('\n⚙️  compileForEval\n');

// Empty source → clean error envelope, no throw
{
  const r = compileForEval('', compileProgram);
  assert(r.ok === false && r.error.includes('No source code'),
    `empty source returns {ok:false, error:"No source code..."} (got ${JSON.stringify(r)})`);
}

// Whitespace-only also rejected
{
  const r = compileForEval('   \n\t  \n', compileProgram);
  assert(r.ok === false, 'whitespace-only source rejected like empty');
}

// Source with compile errors → { ok: false, errors: [...] }
{
  const r = compileForEval('bogus nonsense line', compileProgram);
  assert(r.ok === false && Array.isArray(r.errors) && r.errors.length > 0,
    `compile errors surface in the errors array (got ${JSON.stringify(r).slice(0, 120)})`);
}

// Valid source with a backend → { ok: true, compiled, serverJS }
{
  const r = compileForEval("on GET '/':\n  send 'hi'\n", compileProgram);
  // `on GET '/'` compiles to BOTH a serverJS and a frontend javascript blob.
  // compileForEval accepts either — `serverJS` is preferred; `javascript` is
  // the fallback for backend-only apps.
  assert(r.ok === true,
    `valid source with backend produces ok:true (got ${JSON.stringify(r).slice(0, 150)})`);
  assert(r.serverJS && typeof r.serverJS === 'string' && r.serverJS.length > 0,
    `compileForEval returns non-empty serverJS (got length ${r.serverJS?.length || 0})`);
  assert(r.compiled && r.compiled.errors.length === 0,
    'compileForEval includes the normal-mode compile result as .compiled');
}

// compileProgram throws → caught, returned as error envelope
{
  const throwingCompile = () => { throw new Error('synthetic compiler crash'); };
  const r = compileForEval('anything', throwingCompile);
  assert(r.ok === false && r.error.includes('Compile threw'),
    `compileProgram throws caught + prefixed with "Compile threw" (got ${JSON.stringify(r)})`);
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
