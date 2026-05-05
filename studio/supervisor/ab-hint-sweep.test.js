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
