// Hard hint A/B sweep preset.
// WHY: saturated tasks cannot tell us whether hints help. This runner
// locks the launch-evidence sweep to harder Marcus-shaped tasks.

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runAbSweep } from './ab-hint-sweep.js';

export const HARD_HINT_TASKS = Object.freeze([
  'deal-with-detail-panel',
  'lead-router',
  'multi-tab-queue',
  'internal-request-queue',
]);

export const HARD_HINT_SWEEP_DEFAULTS = Object.freeze({
  taskIds: HARD_HINT_TASKS,
  trialsPerCondition: 3,
  workers: 1,
  timeoutMs: 300_000,
  strict: true,
  dryRun: false,
});

function argValue(argv, name) {
  const prefix = `--${name}=`;
  const hit = argv.find(a => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function positiveInt(raw, fallback, name) {
  if (raw == null || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return n;
}

export function buildHardHintSweepOptions(argv = []) {
  const taskIds = argValue(argv, 'tasks')
    ? argValue(argv, 'tasks').split(',').map(s => s.trim()).filter(Boolean)
    : [...HARD_HINT_TASKS];
  return {
    taskIds,
    trialsPerCondition: positiveInt(
      argValue(argv, 'trials'),
      HARD_HINT_SWEEP_DEFAULTS.trialsPerCondition,
      'trials'
    ),
    workers: positiveInt(
      argValue(argv, 'workers'),
      HARD_HINT_SWEEP_DEFAULTS.workers,
      'workers'
    ),
    timeoutMs: positiveInt(
      argValue(argv, 'timeout'),
      HARD_HINT_SWEEP_DEFAULTS.timeoutMs / 1000,
      'timeout'
    ) * 1000,
    strict: argv.includes('--strict') || !argv.includes('--loose'),
    dryRun: argv.includes('--dry-run'),
  };
}

export function buildHardHintSweepEnv(env = {}) {
  return {
    ...env,
    MEPH_BRAIN: env.MEPH_BRAIN || 'cc-agent',
    GHOST_MEPH_CC_TOOLS: env.GHOST_MEPH_CC_TOOLS || '1',
    CLEAR_AB_PORT_BASE: env.CLEAR_AB_PORT_BASE || '3600',
    CLEAR_AB_REGISTRY: env.CLEAR_AB_REGISTRY
      || join(tmpdir(), `clear-hard-hint-ab-${process.pid || 'local'}.db`),
  };
}

export async function runHardHintSweep(argv = process.argv.slice(2), env = process.env) {
  const opts = buildHardHintSweepOptions(argv);
  Object.assign(env, buildHardHintSweepEnv(env));
  console.log('\n=== Hard Hint Sweep Preset ===');
  console.log(`  Direct Anthropic API spend: $0 (cc-agent tool mode)`);
  console.log(`  Hard tasks: ${opts.taskIds.join(', ')}`);
  console.log(`  Saturated tasks excluded: counter, kpi-dashboard`);
  return runAbSweep(opts);
}

const thisFile = fileURLToPath(import.meta.url);
let entryFile = '';
try {
  entryFile = process.argv[1] ? realpathSync(process.argv[1]) : '';
} catch {}

if (thisFile === entryFile) {
  runHardHintSweep()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Hard hint sweep failed:', err.message);
      process.exit(1);
    });
}
