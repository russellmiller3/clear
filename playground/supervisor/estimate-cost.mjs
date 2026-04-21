// Pre-run cost estimator. ALWAYS run before kicking any sweep.
//
// Pulls historical per-task token counts from the last N sweeps,
// multiplies by model pricing, returns a $ estimate + best/worst range.
//
// Usage:
//   node playground/supervisor/estimate-cost.mjs                  # default: 1 sweep × 30 tasks
//   node playground/supervisor/estimate-cost.mjs --sweeps=3 --tasks=38
//   node playground/supervisor/estimate-cost.mjs --sweeps=3 --tasks=38 --model=haiku4.5
//
// Numbers come from the Anthropic console for this repo on Apr 2026.
// Update HISTORICAL_COST_PER_TASK if you switch models or change sweep
// invariants (system prompt size, iteration cap, worker count).

// Observed Apr 2026 rates (from console.anthropic.com/settings/usage):
//   290M input tokens / 30 tasks / 3 workers ≈ 3.2M tokens per task-run
//   Mostly cache reads ($0.10/Mtok) with some fresh input ($1/Mtok) and output ($5/Mtok)
//   Effective blended: ~$0.15/Mtok-in
//   Per-task cost (observed): ~$1.00-1.50 per task on Haiku 4.5
//
// That's ~3× higher than the script header's original "$0.20-1.00" estimate.
// When in doubt, pick the higher end and communicate the range.

// Calibrated against Anthropic console Apr 21 2026 data:
//   8 sweeps + chat activity = $50 for the day
//   Per-sweep cost: ~$5-7
//   Per task-run: $5 / 30 tasks = ~$0.17 median
//   Factor of ~10× wider when errors cascade and iteration cap hits
const MODELS = {
  'haiku4.5': {
    name: 'claude-haiku-4-5',
    // Per TASK-RUN (one task attempt by one worker). Multiply by tasks × sweeps.
    per_task_low_usd: 0.10,      // short/easy tasks that finish in 2-3 iterations
    per_task_median_usd: 0.20,   // observed median across April sweeps
    per_task_high_usd: 0.35,     // hits iteration cap, lots of fresh input
  },
  'sonnet4': {
    name: 'claude-sonnet-4-5',
    // Sonnet is ~3× the Haiku per-token cost
    per_task_low_usd: 0.30,
    per_task_median_usd: 0.60,
    per_task_high_usd: 1.05,
  },
};

const argv = process.argv.slice(2);
const arg = (k, def) => {
  const a = argv.find(s => s.startsWith(`--${k}=`));
  return a ? a.split('=')[1] : def;
};

const sweeps = Number(arg('sweeps', '1'));
const tasks = Number(arg('tasks', '30'));
const parallel = Number(arg('parallel', '1'));
const modelKey = arg('model', 'haiku4.5');
const m = MODELS[modelKey];
if (!m) {
  console.error(`Unknown model: ${modelKey}. Choices: ${Object.keys(MODELS).join(', ')}`);
  process.exit(1);
}

const totalTaskRuns = sweeps * tasks;
const low = totalTaskRuns * m.per_task_low_usd;
const mid = totalTaskRuns * m.per_task_median_usd;
const high = totalTaskRuns * m.per_task_high_usd;

// Parallel doesn't change $, but does cut wall clock. Estimate wall clock too.
const wallClockMinutesPerSweep = 10; // observed: ~10 min for 30-task sweep on 3 workers
const wallClockTotal = parallel > 1
  ? wallClockMinutesPerSweep * Math.ceil(sweeps / parallel)
  : wallClockMinutesPerSweep * sweeps;

console.log('=== Pre-run cost estimate ===');
console.log(`Model:          ${m.name}`);
console.log(`Sweeps:         ${sweeps}${parallel > 1 ? ` (${parallel} parallel)` : ''}`);
console.log(`Tasks/sweep:    ${tasks}`);
console.log(`Total task-runs: ${totalTaskRuns}`);
console.log('');
console.log(`Estimated cost range:`);
console.log(`  low:     $${low.toFixed(2)}`);
console.log(`  median:  $${mid.toFixed(2)}    ← plan to spend this`);
console.log(`  high:    $${high.toFixed(2)}`);
console.log('');
console.log(`Wall clock:      ~${wallClockTotal} min`);
console.log('');
console.log(`Source of estimate: Apr 2026 observed rates. If sweep invariants change`);
console.log(`(system prompt size, iteration cap, workers), update per_task_*_usd in this file.`);
