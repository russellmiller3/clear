// ab-hint-sweep — pure-helper tests (Session 44 Track 1.3)
// Validates the trial-expansion + result-aggregation used by the hint A/B
// runner. The runner itself is validated by running it (it's research
// tooling, not user-facing code).

import { expandTrials, summarizeAbResults, formatSummaryTable } from './ab-hint-sweep.js';

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

console.log('\n📊 ab-hint-sweep pure helpers\n');

// ── expandTrials ──
const trials = expandTrials(['counter', 'todo-crud'], 3, 'hint_on');
assert(trials.length === 6,
  `expandTrials(2 tasks, 3 trials/cond, 1 cond) returns 6 trials (got ${trials.length})`);
assert(trials.every(t => t.condition === 'hint_on'),
  'expandTrials tags every trial with the condition');
assert(trials.filter(t => t.taskId === 'counter').length === 3,
  'expandTrials produces trialsPerCondition trials per task');
assert(trials[0].trialIdx === 0 && trials[1].trialIdx === 1 && trials[2].trialIdx === 2,
  'expandTrials numbers trialIdx from 0 within each task');

// ── summarizeAbResults ──
const sampleResults = [
  { taskId: 'counter', condition: 'hint_on', ok: true, elapsedMs: 40000 },
  { taskId: 'counter', condition: 'hint_on', ok: true, elapsedMs: 55000 },
  { taskId: 'counter', condition: 'hint_on', ok: false, elapsedMs: 180000, timedOut: true },
  { taskId: 'counter', condition: 'hint_off', ok: false, elapsedMs: 180000, timedOut: true },
  { taskId: 'counter', condition: 'hint_off', ok: true, elapsedMs: 70000 },
  { taskId: 'counter', condition: 'hint_off', ok: false, elapsedMs: 180000, timedOut: true },
  { taskId: 'todo-crud', condition: 'hint_on', ok: true, elapsedMs: 80000 },
  { taskId: 'todo-crud', condition: 'hint_off', ok: true, elapsedMs: 90000 },
];

const summary = summarizeAbResults(sampleResults);
assert(summary.counter.hint_on.trials === 3,
  `counter hint_on trial count (got ${summary.counter.hint_on.trials})`);
assert(summary.counter.hint_on.passes === 2,
  `counter hint_on pass count (got ${summary.counter.hint_on.passes})`);
assert(Math.abs(summary.counter.hint_on.passRate - 2 / 3) < 1e-9,
  `counter hint_on pass rate (got ${summary.counter.hint_on.passRate})`);
assert(summary.counter.hint_off.passes === 1,
  `counter hint_off pass count (got ${summary.counter.hint_off.passes})`);
assert(Math.abs(summary.counter.hint_off.passRate - 1 / 3) < 1e-9,
  `counter hint_off pass rate (got ${summary.counter.hint_off.passRate})`);
assert(summary['todo-crud'].hint_on.passes === 1 && summary['todo-crud'].hint_on.trials === 1,
  'todo-crud hint_on bucket populated');

// Lift is the per-task signed delta (hint_on − hint_off) in pass rate
assert(Math.abs(summary.counter.lift - (2 / 3 - 1 / 3)) < 1e-9,
  `counter lift = hint_on − hint_off (got ${summary.counter.lift})`);

// ── infra-failure exclusion ──
// 04-29 sweep regression: trials that returned in 2.3s with no Meph activity
// got bucketed as ok:false and dragged pass rates to 0%. After the fix, those
// trials are tracked separately as infraFailures and excluded from the
// numerator + denominator of passRate.
const mixedResults = [
  { taskId: 'counter', condition: 'hint_on', ok: true, elapsedMs: 40000 },
  { taskId: 'counter', condition: 'hint_on', ok: true, elapsedMs: 50000 },
  { taskId: 'counter', condition: 'hint_off', ok: false, elapsedMs: 2300, error: 'no-meph-activity (2300ms, 0 rows): ' },
  { taskId: 'counter', condition: 'hint_off', ok: false, elapsedMs: 2400, error: 'no-meph-activity (2400ms, 0 rows): ' },
  { taskId: 'counter', condition: 'hint_off', ok: true, elapsedMs: 60000 },
];
const mixed = summarizeAbResults(mixedResults);
assert(mixed.counter.hint_on.trials === 2 && mixed.counter.hint_on.infraFailures === 0,
  `hint_on side has 0 infra failures, 2 genuine trials (got ${mixed.counter.hint_on.trials} trials, ${mixed.counter.hint_on.infraFailures} infra)`);
assert(mixed.counter.hint_off.trials === 1 && mixed.counter.hint_off.infraFailures === 2,
  `hint_off side excludes 2 infra failures, leaves 1 genuine trial (got ${mixed.counter.hint_off.trials} trials, ${mixed.counter.hint_off.infraFailures} infra)`);
assert(mixed.counter.hint_off.passRate === 1,
  `passRate over GENUINE trials only — 1/1 = 100% (got ${mixed.counter.hint_off.passRate})`);
assert(Math.abs(mixed.counter.lift - (1 - 1)) < 1e-9,
  `lift uses genuine-trial pass rates: 100% − 100% = 0 (got ${mixed.counter.lift})`);

// All-infra side → lift is null (no comparison possible)
const allInfraOff = summarizeAbResults([
  { taskId: 'counter', condition: 'hint_on', ok: true, elapsedMs: 40000 },
  { taskId: 'counter', condition: 'hint_off', ok: false, elapsedMs: 2300, error: 'no-meph-activity (2300ms, 0 rows): ' },
]);
assert(allInfraOff.counter.lift === null,
  `lift = null when one side has 0 genuine trials (got ${allInfraOff.counter.lift})`);
assert(allInfraOff.counter.hint_off.infraFailures === 1 && allInfraOff.counter.hint_off.trials === 0,
  'all-infra side: 1 infra failure, 0 genuine trials');

// ── formatSummaryTable ──
const table = formatSummaryTable(summary);
assert(table.includes('counter'), 'table mentions the task ids');
assert(table.includes('hint_on') && table.includes('hint_off'),
  'table has columns for both conditions');
assert(/\d+\/\d+/.test(table),
  'table prints passes/trials in the N/M form');

// ── Degenerate inputs ──
assert(summarizeAbResults([]) && Object.keys(summarizeAbResults([])).length === 0,
  'summarizeAbResults([]) returns empty object');
assert(expandTrials([], 10, 'hint_on').length === 0,
  'expandTrials([]) returns empty list');
assert(expandTrials(['counter'], 0, 'hint_on').length === 0,
  'expandTrials with 0 trialsPerCondition returns empty list');

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
