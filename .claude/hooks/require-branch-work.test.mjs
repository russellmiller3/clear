#!/usr/bin/env node

import assert from 'node:assert/strict';
import { decisionForToolUse } from './require-branch-work.mjs';

function expectAllowed(name, input) {
  const decision = decisionForToolUse(input);
  assert.equal(decision.allow, true, `${name} should be allowed`);
}

function expectBlocked(name, input) {
  const decision = decisionForToolUse(input);
  assert.equal(decision.allow, false, `${name} should be blocked`);
  assert.match(decision.reason, /Branch discipline guard/);
}

expectBlocked('direct file edit on main', {
  toolName: 'Write',
  branch: 'main',
});

expectAllowed('direct file edit on a feature branch', {
  toolName: 'Write',
  branch: 'feature/meph-model-picker',
});

expectAllowed('checking status on main', {
  toolName: 'Bash',
  branch: 'main',
  command: 'git status --short',
});

expectAllowed('creating a feature branch from main', {
  toolName: 'Bash',
  branch: 'main',
  command: 'git switch -c feature/branch-discipline',
});

expectAllowed('merging a verified branch back to main', {
  toolName: 'Bash',
  branch: 'main',
  command: 'git merge --ff-only feature/meph-model-picker',
});

expectAllowed('publishing main after a merge', {
  toolName: 'Bash',
  branch: 'main',
  command: 'git push origin main',
});

for (const command of [
  'Set-Content CLAUDE.md "changed"',
  'Add-Content CLAUDE.md "changed"',
  'Out-File -FilePath CLAUDE.md -InputObject "changed"',
  'New-Item scratch.txt',
  'Remove-Item scratch.txt',
  'Move-Item scratch.txt scratch2.txt',
  'Copy-Item scratch.txt scratch2.txt',
  'git add .',
  'git commit -m "change"',
  'git reset --hard HEAD',
  'git clean -fd',
  "'changed' > CLAUDE.md",
  "'changed' >> CLAUDE.md",
]) {
  expectBlocked(`mutating command on main: ${command}`, {
    toolName: 'Bash',
    branch: 'main',
    command,
  });
}

