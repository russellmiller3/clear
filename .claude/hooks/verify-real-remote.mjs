#!/usr/bin/env node
// Block any git push or git commit when origin points at a sandbox-local
// proxy. Sandboxed Claude sessions sometimes have origin set to
// http://127.0.0.1:<port>/git/... — pushes "succeed" but never reach the
// real GitHub remote. This hook catches that before Claude can claim work
// shipped when it didn't.
//
// Background (2026-05-02): a sandbox session pushed 30+ commits including
// the rule keyword epic to a localhost proxy thinking it was the real
// origin. The work was stranded. This hook stops that from repeating.

import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const SUSPICIOUS_HOSTS = [
  '127.0.0.1',
  'localhost',
  '0.0.0.0',
  'local_proxy',
  '::1',
];

const TRUSTED_HOST_PATTERNS = [
  /^https?:\/\/github\.com\//i,
  /^git@github\.com:/i,
  /^https?:\/\/[\w-]+\.github\.com\//i,
  /^https?:\/\/gitlab\.com\//i,
  /^git@gitlab\.com:/i,
  /^https?:\/\/bitbucket\.org\//i,
  /^https?:\/\/[\w-]+\.dev\.azure\.com\//i,
];

const TRIGGER_PATTERNS = [
  /\bgit\s+push\b/i,
  /\bgit\s+commit\b/i,
  /\bgit\s+cherry-pick\b/i,
];

function getOriginUrl() {
  if (process.env.SANDBOX_REMOTE_OVERRIDE) return process.env.SANDBOX_REMOTE_OVERRIDE;
  try {
    return execFileSync('git', ['config', '--get', 'remote.origin.url'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

export function isSuspicious(url = '') {
  if (!url) return false;
  const lower = url.toLowerCase();
  for (const host of SUSPICIOUS_HOSTS) {
    if (lower.includes(host)) return true;
  }
  // also flag anything that doesn't match a known trusted pattern
  // — e.g. a random IP, an internal hostname, etc.
  if (TRUSTED_HOST_PATTERNS.some((p) => p.test(url))) return false;
  // Anything that looks like a private network is also suspect.
  if (/\bhttps?:\/\/(10|172\.(1[6-9]|2\d|3[01])|192\.168)\./.test(url)) return true;
  return false;
}

export function commandTouchesGit(command = '') {
  return TRIGGER_PATTERNS.some((p) => p.test(command));
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

function buildMessage(url, command) {
  return `Sandbox-remote guard: origin is NOT a real GitHub remote.

origin = ${url}
Blocked command: ${command}

Pushes and commits made against this origin will NOT reach Russell's real
GitHub repo. Work will be stranded inside the sandbox.

Before continuing:
  1. Run 'git remote -v' and confirm origin is github.com / gitlab.com / etc.
  2. If origin really is a local proxy, treat this session as DRAFT —
     generate a patch with 'git format-patch' instead of pushing.
  3. Tell Russell explicitly that pushes will not reach his real remote
     and ask whether to (a) generate a patch or (b) abort and pivot to
     read-only work.

Override (use only when you have verified the URL is intentional):
  set SANDBOX_REMOTE_OVERRIDE='<the real URL>' in env, or change origin:
    git remote set-url origin <real-url>

Why: 2026-05-02 — sandbox session shipped 30+ commits including the rule
keyword epic to a localhost proxy thinking it was real origin. Work was
stranded. Never again.`;
}

function buildSessionStartMessage(url) {
  return `Sandbox-remote guard fired at session start.

origin = ${url}

This session's git origin is NOT a real GitHub remote. Pushes WILL NOT
reach Russell's real repo — work made here will be stranded inside the
sandbox unless you generate a patch.

Treat this session as DRAFT:
  - Read-only work (research, doc analysis, planning) is fine.
  - For any code change, generate 'git format-patch' output that Russell
    can paste / apply on his real machine.
  - Tell Russell explicitly that pushes will not reach his real remote
    BEFORE he asks you to commit anything.

The PreToolUse hook will also block any 'git push' / 'git commit' /
'git cherry-pick' against this origin. Override only when intentional:
SANDBOX_REMOTE_OVERRIDE=<real-url> in env.

Why: 2026-05-02 — sandbox session shipped 30+ commits including the rule
keyword epic to a localhost git proxy thinking it was real origin.`;
}

function emitSessionContext(message) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: message,
    },
  }));
}

function main() {
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { process.exit(0); }
  let data = {};
  try { data = JSON.parse(raw || '{}'); } catch { process.exit(0); }

  // SessionStart event — emit a warning into the session context if origin
  // is suspicious. Doesn't block; sessions can still read.
  if (data?.hook_event_name === 'SessionStart') {
    const url = getOriginUrl();
    if (isSuspicious(url)) emitSessionContext(buildSessionStartMessage(url));
    process.exit(0);
  }

  // PreToolUse event — block git push/commit/cherry-pick against suspicious origins.
  const toolName = data?.tool_name || '';
  if (toolName !== 'Bash') process.exit(0);
  const command = data?.tool_input?.command || '';
  if (!commandTouchesGit(command)) process.exit(0);
  const url = getOriginUrl();
  if (isSuspicious(url)) block(buildMessage(url, command));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
