#!/usr/bin/env node
/**
 * PreToolUse hook — block `git push origin main` when substantive code
 * changes exist on the merged work without matching doc-cascade entries.
 *
 * Russell's rule (2026-05-04, after the Claude that shipped 3 epics
 * forgot to update FAQ.md and excused it as "in the rush"): the docs
 * cascade is mandatory; the rule alone wasn't enough; this hook makes
 * skipping it impossible.
 *
 * What it checks:
 *   When `git push origin main` (any form) is about to fire, the hook
 *   computes the set of files changed in HEAD relative to origin/main.
 *   If that diff includes substantive code (compiler.js, parser.js,
 *   synonyms.js, runtime/*, studio/{server,ide,system-prompt}.* ,
 *   any new files, or any other .js / .clear / .py changes), then ALL
 *   three of these doc files MUST have changes too:
 *     - CHANGELOG.md  (the "what shipped" dated entry)
 *     - FEATURES.md   (the "what Clear can do today" capability table)
 *     - FAQ.md        (the "where does X live / why did we Z" entries)
 *   If any of the three is missing, deny with a clear message listing
 *   which doc surfaces are stale, plus the docs-skill quote that names
 *   them as the cascade.
 *
 * Why these three (and not the full 11-surface list):
 *   - CHANGELOG + FEATURES are the two the docs skill marks REQUIRED
 *     for end users.
 *   - FAQ.md is the surface Russell explicitly called out skipping;
 *     blocking on it forces the rule into structure, not vibes.
 *   - The other 8 surfaces (intent.md, SYNTAX.md, AI-INSTRUCTIONS.md,
 *     USER-GUIDE.md, ROADMAP.md, RESEARCH.md, system-prompt.md,
 *     learnings.md) are nuanced — sometimes they apply, sometimes
 *     they don't. The docs skill itself decides; this hook just
 *     enforces the lowest common denominator.
 *
 * Triggers (the hook fires only on these command shapes):
 *   - git push origin main
 *   - git push origin HEAD:main
 *   - git push -u origin main
 *   - git push --force origin main  (still blocks; force-pushing main
 *                                    doesn't excuse missing docs)
 * Other git pushes (feature branches, tags, etc.) → hook silent.
 *
 * Override (rare):
 *   Set SHIP_DOCS_CASCADE_OVERRIDE=1 in env. Use only when the change
 *   is genuinely doc-free (CI yaml, hook itself, .gitignore tweak).
 *   The override is documented in HANDOFF or commit message.
 *
 * Fail-open behaviour:
 *   If git itself errors, if the diff parse fails, or if the input
 *   JSON is malformed, the hook silently exits 0 (does not block).
 *   The cost of a missed enforcement is one stale doc; the cost of a
 *   false block on a legitimate emergency push is much worse.
 */

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// File patterns that count as substantive code changes — if any of
// these appear in the diff, the doc cascade is mandatory.
const SUBSTANTIVE_PATTERNS = [
  /^compiler\.js$/,
  /^parser\.js$/,
  /^synonyms\.js$/,
  /^validator\.js$/,
  /^tokenizer\.js$/,
  /^index\.js$/,
  /^runtime\//,
  /^lib\//,
  /^cli\//,
  /^studio\/server\.js$/,
  /^studio\/ide\.html$/,
  /^studio\/system-prompt\.md$/,  // counts as both code AND a doc surface
  /^apps\/[^/]+\/main\.clear$/,
  /^scripts\/[^/]+\.(mjs|js)$/,
  // Any new .clear / .js / .py / .ts file anywhere is substantive
  /\.(clear|py|ts)$/,
];

// Doc files that MUST be touched when substantive code changes.
const REQUIRED_DOCS = ['CHANGELOG.md', 'FEATURES.md', 'FAQ.md'];

function isShipToMain(command) {
  if (typeof command !== 'string') return false;
  // Normalise whitespace for matching
  const c = command.replace(/\s+/g, ' ').trim();

  // (1) Push to main — the remote ship.
  if (/\bgit\s+push\b/.test(c)) {
    if (/\borigin\s+(?:[^\s]+:)?main\b/.test(c)) return true;
    if (/\borigin\s+refs\/heads\/main\b/.test(c)) return true;
    if (/\borigin\s+HEAD:main\b/.test(c)) return true;
  }

  // (2) Merge a feature branch into main locally — the local ship.
  // Russell's rule (2026-05-04): "needs to block local commit and remote commit."
  // The most fragile moment is `git merge feature/x` while on main; that's the
  // local equivalent of the push gate. Detect by: command is `git merge` AND
  // current branch is `main`. If we can't determine the branch, fail open.
  if (/\bgit\s+merge\b/.test(c)) {
    try {
      const branch = execSync('git branch --show-current', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
      if (branch === 'main') return true;
    } catch {
      // Can't determine branch — fail open.
    }
  }

  // (3) Commit on main — extra belt-and-suspenders. The branch-discipline hook
  // already blocks most edits on main, but `git commit -m ...` itself slips
  // past if files were staged from another path. Block here too when on main
  // with substantive code in the staged diff.
  if (/\bgit\s+commit\b/.test(c)) {
    try {
      const branch = execSync('git branch --show-current', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
      if (branch === 'main') return true;
    } catch {
      // Fail open
    }
  }

  return false;
}

function isSubstantive(filePath) {
  return SUBSTANTIVE_PATTERNS.some((re) => re.test(filePath));
}

function detectOperation(command) {
  // Return one of: 'push', 'merge', 'commit', or null.
  if (/\bgit\s+push\b/.test(command)) return 'push';
  if (/\bgit\s+merge\b/.test(command)) return 'merge';
  if (/\bgit\s+commit\b/.test(command)) return 'commit';
  return null;
}

function extractMergeSource(command) {
  // Crude parse: pick the first non-flag, non-`git`, non-`merge` token as
  // the source branch. Handles `git merge feature/x`, `git merge --no-ff feature/x -m "..."`,
  // etc. Returns null if we can't find one — caller falls open.
  const tokens = command.split(/\s+/);
  let i = 0;
  while (i < tokens.length && tokens[i] !== 'merge') i++;
  i++; // skip the 'merge' word
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.startsWith('-')) {
      // Skip flag and possibly its arg (--message X / -m "X")
      if (/^(?:-m|--message|-X|--strategy(?:-option)?|-S|--gpg-sign)$/.test(t)) i += 2;
      else i += 1;
      continue;
    }
    if (t === 'main' || t === 'origin/main') {
      // `git merge main` (rare) — no source to check.
      return null;
    }
    return t;
  }
  return null;
}

function safeGitFiles(operation, command) {
  // Returns the set of files about to land in main for the operation in question.
  //   - push:   origin/main..HEAD (everything not yet on remote main)
  //   - merge:  main..<source>    (everything the merge will introduce)
  //   - commit: staged files      (everything about to be committed)
  try {
    let cmd;
    if (operation === 'commit') {
      cmd = 'git diff --cached --name-only';
    } else if (operation === 'merge') {
      const source = extractMergeSource(command);
      if (!source) return null; // can't determine — fail open
      cmd = `git diff --name-only main..${source}`;
    } else {
      // push (or unknown — default to push behaviour)
      cmd = 'git diff --name-only origin/main..HEAD';
    }
    const out = execSync(cmd, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return null; // signal: can't determine, fail open
  }
}

function main() {
  if (process.env.SHIP_DOCS_CASCADE_OVERRIDE === '1') process.exit(0);

  let event;
  try {
    event = JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    process.exit(0);
  }

  const tool = event.tool_name || '';
  if (tool !== 'Bash') process.exit(0);

  const input = event.tool_input || {};
  const command = input.command || '';
  if (!isShipToMain(command)) process.exit(0);

  const operation = detectOperation(command);
  const files = safeGitFiles(operation, command);
  if (!files) process.exit(0); // fail open if git query fails
  if (files.length === 0) process.exit(0); // nothing to ship

  const substantiveFiles = files.filter(isSubstantive);
  if (substantiveFiles.length === 0) {
    // Doc-only or infra-only change — no cascade required.
    process.exit(0);
  }

  const missing = REQUIRED_DOCS.filter((doc) => !files.includes(doc));
  if (missing.length === 0) process.exit(0); // cascade complete — let push proceed.

  // BLOCK with a clear message.
  const opVerb = operation === 'commit' ? 'commit' : operation === 'merge' ? 'merge into' : 'push to';
  const reason =
    `🚫 Ship blocked — doc cascade incomplete.\n\n` +
    `You're about to ${opVerb} main with ${substantiveFiles.length} substantive code file(s), ` +
    `but ${missing.length} required doc surface(s) are missing entries:\n\n` +
    missing.map((d) => `  • ${d} — UNCHANGED in this push`).join('\n') +
    `\n\n` +
    `Substantive code changes detected:\n` +
    substantiveFiles.slice(0, 8).map((f) => `  • ${f}`).join('\n') +
    (substantiveFiles.length > 8 ? `\n  • … and ${substantiveFiles.length - 8} more` : '') +
    `\n\n` +
    `Why this is blocked: the docs skill (.claude/skills/docs/SKILL.md) ` +
    `names CHANGELOG.md, FEATURES.md, and FAQ.md as the cascade surfaces ` +
    `that reach end users. Skipping any one of them ships a feature that ` +
    `existing customers and future Claude sessions can't find.\n\n` +
    `What to do:\n` +
    `  1. Add the missing entries to each file (one section per shipped feature).\n` +
    `  2. Commit them on a docs/ branch and merge to main, OR amend onto an\n` +
    `     existing local commit if main hasn't been pushed yet.\n` +
    `  3. Retry the push.\n\n` +
    `Genuine doc-free pushes (CI, hooks, .gitignore): set\n` +
    `  SHIP_DOCS_CASCADE_OVERRIDE=1\n` +
    `in env and document the rationale in the commit message.`;

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

main();
