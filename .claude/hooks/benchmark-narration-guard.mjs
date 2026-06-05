#!/usr/bin/env node
// PreToolUse hook on Bash.
//
// Paid Ralph benchmark runs must be visible while they run. A foreground shell
// command hides the ESPN output until the command exits, which defeats the
// point. Use the narrated runner so the agent can poll the stream file and
// narrate results in chat while the child process continues.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

function normalizeCommand(command = '') {
  return String(command || '').trim().replace(/\s+/g, ' ');
}

function isRalphBenchmarkCommand(command = '') {
  return /openrouter-ralph-ranking-benchmark\.mjs/i.test(normalizeCommand(command));
}

function isHarmlessInspection(command = '') {
  const normalized = normalizeCommand(command);
  return /\s--list-models\b/i.test(normalized)
    || /\s--list-variants\b/i.test(normalized)
    || /\s--help\b/i.test(normalized)
    || /\s-h\b/i.test(normalized);
}

function usesNarratedRunner(command = '') {
  return /openrouter-ralph-ranking-narrated-runner\.mjs/i.test(normalizeCommand(command));
}

export function decisionForToolUse({ toolName = '', command = '' } = {}) {
  if (toolName !== 'Bash') return { allow: true };
  if (!isRalphBenchmarkCommand(command)) return { allow: true };
  if (isHarmlessInspection(command)) return { allow: true };
  if (usesNarratedRunner(command)) return { allow: true };

  return {
    allow: false,
    reason:
      'Benchmark narration guard: do not run the Ralph benchmark as a silent foreground job. ' +
      'Use the narrated runner: node scripts/openrouter-ralph-ranking-narrated-runner.mjs -- <benchmark args>. ' +
      'Then poll the JSONL stream and narrate spend, attempts, closest gaps, and winners in chat while it runs.',
  };
}

function block(message) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: message,
      additionalContext: message,
    },
  }));
}

function main() {
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { process.exit(0); }

  let data = {};
  try { data = JSON.parse(raw || '{}'); } catch { process.exit(0); }

  const decision = decisionForToolUse({
    toolName: data?.tool_name || '',
    command: data?.tool_input?.command || '',
  });

  if (!decision.allow) block(decision.reason);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
