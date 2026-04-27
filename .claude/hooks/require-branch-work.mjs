#!/usr/bin/env node
// Block edit tools on main. Work should happen on a focused branch, then merge.

import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';

function currentBranch() {
  if (process.env.BRANCH_DISCIPLINE_BRANCH) {
    return process.env.BRANCH_DISCIPLINE_BRANCH;
  }

  try {
    return execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
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

  const tool = data?.tool_name || '';
  if (!/^(Write|Edit|MultiEdit)$/.test(tool)) process.exit(0);

  const branch = currentBranch();
  if (branch !== 'main') process.exit(0);

  block(
`Branch discipline guard: you are on main.

Create a focused branch before editing files:
  git switch -c feature/<name>
  git switch -c fix/<name>
  git switch -c docs/<name>

Why: Russell's rule is that work is always done on a branch. No edits on main.`
  );
}

main();
