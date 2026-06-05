#!/usr/bin/env node
import { decisionForToolUse } from './benchmark-narration-guard.mjs';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function commandDecision(command) {
  return decisionForToolUse({ toolName: 'Bash', command });
}

const direct = commandDecision(
  'node scripts/openrouter-ralph-ranking-benchmark.mjs --models=gemini-pro --espn --stream-jsonl=.tmp/events.jsonl'
);
assert(direct.allow === false, 'direct foreground benchmark should be blocked');
assert(/narrated runner/i.test(direct.reason), 'block reason should name the narrated runner');

const narrated = commandDecision(
  'node scripts/openrouter-ralph-ranking-narrated-runner.mjs -- --models=gemini-pro --timeout-ms=120000'
);
assert(narrated.allow === true, 'narrated runner should be allowed');

const listModels = commandDecision('node scripts/openrouter-ralph-ranking-benchmark.mjs --list-models');
assert(listModels.allow === true, 'list-models should be allowed');

const unrelated = commandDecision('node scripts/openrouter-iteration-report.mjs .tmp/run.json');
assert(unrelated.allow === true, 'unrelated commands should be allowed');

console.log('benchmark-narration-guard hook tests passed');
