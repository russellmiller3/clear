#!/usr/bin/env node
// Block file-changing work on main. Work should happen on a focused branch,
// then merge the verified branch back when done.

import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

const SAFE_MAIN_BASH_PATTERNS = [
  /^git\s+status(?:\s|$)/i,
  /^git\s+branch(?:\s|$)/i,
  /^git\s+show(?:\s|$)/i,
  /^git\s+log(?:\s|$)/i,
  /^git\s+diff(?:\s|$)/i,
  /^git\s+rev-parse(?:\s|$)/i,
  /^git\s+merge-base(?:\s|$)/i,
  /^git\s+ls-files(?:\s|$)/i,
  /^git\s+switch\s+-c\s+(feature|fix|docs)\/[\w./-]+$/i,
  /^git\s+checkout\s+-b\s+(feature|fix|docs)\/[\w./-]+$/i,
  /^git\s+switch\s+(feature|fix|docs)\/[\w./-]+$/i,
  /^git\s+checkout\s+(feature|fix|docs)\/[\w./-]+$/i,
  /^git\s+merge\s+--ff-only\s+(feature|fix|docs)\/[\w./-]+$/i,
  /^git\s+push(?:\s+--no-verify)?(?:\s+origin\s+main)?$/i,
];

const MUTATING_MAIN_BASH_PATTERNS = [
  /\bSet-Content\b/i,
  /\bAdd-Content\b/i,
  /\bOut-File\b/i,
  /\bNew-Item\b/i,
  /\bRemove-Item\b/i,
  /\bMove-Item\b/i,
  /\bCopy-Item\b/i,
  /\bapply_patch\b/i,
  /(^|[^\d])>>?/,
  /^git\s+add(?:\s|$)/i,
  /^git\s+commit(?:\s|$)/i,
  /^git\s+cherry-pick(?:\s|$)/i,
  /^git\s+reset(?:\s|$)/i,
  /^git\s+clean(?:\s|$)/i,
  /^git\s+rebase(?:\s|$)/i,
];

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

function branchGuardMessage(tool, command = '') {
  const commandLine = command ? `\n\nBlocked command:\n  ${command}` : '';

  return `Branch discipline guard: you are on main.${commandLine}

Create or switch to a focused branch before changing files:
  git switch -c feature/<name>
  git switch -c fix/<name>
  git switch -c docs/<name>

Allowed on main: status checks, branch creation/switching, ff-only merge of a finished branch, and pushing main after merge.

Why: Russell's rule is that work happens on a branch. No edits on main.`;
}

function normalizeCommand(command = '') {
  return command.trim().replace(/\s+/g, ' ');
}

export function isSafeMainBashCommand(command = '') {
  const normalized = normalizeCommand(command);
  return SAFE_MAIN_BASH_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isMutatingMainBashCommand(command = '') {
  const normalized = normalizeCommand(command);
  return MUTATING_MAIN_BASH_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function decisionForToolUse({ toolName = '', branch = '', command = '' } = {}) {
  if (branch !== 'main') {
    return { allow: true };
  }

  if (EDIT_TOOLS.has(toolName)) {
    return { allow: false, reason: branchGuardMessage(toolName) };
  }

  if (toolName === 'Bash' && !isSafeMainBashCommand(command) && isMutatingMainBashCommand(command)) {
    return { allow: false, reason: branchGuardMessage(toolName, command) };
  }

  return { allow: true };
}

function main() {
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { process.exit(0); }

  let data = {};
  try { data = JSON.parse(raw || '{}'); } catch { process.exit(0); }

  const toolName = data?.tool_name || '';
  const command = data?.tool_input?.command || '';
  const decision = decisionForToolUse({ toolName, command, branch: currentBranch() });
  if (!decision.allow) block(decision.reason);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
