#!/usr/bin/env node
import { buildNarratedRunPlan } from './openrouter-ralph-ranking-narrated-runner.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const plan = buildNarratedRunPlan(['--', '--models=gemini-pro', '--spend-cap=1'], {
  nowStamp: '2026-05-13T00-00-00-000Z',
  rootDir: 'C:\\repo',
});

assert(plan.args.includes('scripts/openrouter-ralph-ranking-benchmark.mjs'), 'should run the benchmark script');
assert(plan.args.includes('--models=gemini-pro'), 'should preserve benchmark args');
assert(plan.args.includes('--espn'), 'should force ESPN output');
assert(plan.args.some((arg) => arg.startsWith('--stream-jsonl=')), 'should force a stream file');
assert(plan.args.some((arg) => arg.startsWith('--out=')), 'should force an output file');
assert(/events\.jsonl$/.test(plan.streamPath), 'stream path should be JSONL');

const planWithExplicitStream = buildNarratedRunPlan(['--stream-jsonl=.tmp/custom.jsonl', '--out=.tmp/custom.json'], {
  nowStamp: 'x',
  rootDir: 'C:\\repo',
});
assert(planWithExplicitStream.args.filter((arg) => arg.startsWith('--stream-jsonl=')).length === 1, 'should not duplicate stream args');
assert(planWithExplicitStream.args.filter((arg) => arg.startsWith('--out=')).length === 1, 'should not duplicate out args');

console.log('openrouter-ralph-ranking-narrated-runner tests passed');
