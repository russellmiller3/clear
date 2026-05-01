#!/usr/bin/env node
// Post-commit hook: scan the last commit's diff for error-message-shaped
// string changes in compiler.js + validator.js, log each one to the Factor
// DB so the friction script can later answer "did rewriting this message
// reduce its friction count in subsequent sweeps?"
//
// Always exits 0 — must NEVER block a commit. Failures get a one-line
// warning on stderr and the script bails.
//
// Usage:
//   node scripts/log-compiler-edits.mjs
//
// Env overrides (for tests):
//   CLEAR_FLYWHEEL_DB   — path to factor-db.sqlite (default: playground/factor-db.sqlite)
//   CLEAR_EDIT_DIFF_REF — git ref to diff against HEAD (default: HEAD~1)

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const TARGET_FILES = ['compiler.js', 'validator.js'];

function gitOk(cmd) {
  try { return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8' }); }
  catch { return ''; }
}

function getCommitSha() {
  return gitOk('git rev-parse HEAD').trim();
}

function getCommitTimestampMs() {
  const ct = Number(gitOk('git log -1 --format=%ct HEAD').trim());
  return Number.isFinite(ct) ? ct * 1000 : Date.now();
}

function getDiff(filePath, baseRef) {
  return gitOk(`git diff ${baseRef} HEAD -- ${filePath}`);
}

// Heuristic: a "quoted string" worth tracking has at least 8 chars inside
// the quotes (filters out 'a', "to", `id` — short literals that are usually
// JSON keys or operators, not human-readable error messages).
const QUOTED_RE = /(['"`])((?:(?!\1).){8,})\1/;

export function containsQuotedString(s) {
  return QUOTED_RE.test(s);
}

// Parse a unified-diff string. Pair every '-' line with the next '+' line
// where AT LEAST ONE side contains a quoted string. Multi-line removals are
// paired with the first added line; we preserve the line number from the
// hunk header for context.
//
// Returns: [{ before, after, line, context }] in source order.
export function parseDiffStringChanges(diff) {
  const changes = [];
  if (!diff) return changes;
  const lines = diff.split('\n');
  let currentLine = 0;
  let context = null;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@(?:\s+(.*))?/);
    if (hunk) {
      currentLine = parseInt(hunk[1], 10);
      if (hunk[2]) context = hunk[2].trim().slice(0, 200);
      i++;
      continue;
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      const remBefore = line.slice(1);
      // Skip past the rest of the removal block to find the first '+' line.
      let j = i + 1;
      while (j < lines.length && lines[j].startsWith('-') && !lines[j].startsWith('---')) j++;
      if (j < lines.length && lines[j].startsWith('+') && !lines[j].startsWith('+++')) {
        const remAfter = lines[j].slice(1);
        if (containsQuotedString(remBefore) || containsQuotedString(remAfter)) {
          changes.push({
            before: remBefore.trim().slice(0, 1000),
            after: remAfter.trim().slice(0, 1000),
            line: currentLine,
            context,
          });
        }
        // Consume the whole '+' block so the next iteration doesn't re-pair
        // additional '-' lines from the same removal with the same '+' lines.
        let k = j;
        while (k < lines.length && lines[k].startsWith('+') && !lines[k].startsWith('+++')) {
          currentLine++;
          k++;
        }
        i = k;
        continue;
      }
      // Removal with no paired addition (pure delete) — just skip past it
      i++;
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      currentLine++;
      i++;
    } else if (line.startsWith(' ')) {
      currentLine++;
      i++;
    } else {
      i++;
    }
  }
  return changes;
}

async function main() {
  const dbPath = process.env.CLEAR_FLYWHEEL_DB
    || resolve(REPO_ROOT, 'playground/factor-db.sqlite');
  if (!existsSync(dbPath)) {
    // No DB present — common on fresh clones, totally fine, just skip.
    return;
  }

  const baseRef = process.env.CLEAR_EDIT_DIFF_REF || 'HEAD~1';
  const sha = getCommitSha();
  if (!sha) return; // not in a git tree, bail silently
  const ts = getCommitTimestampMs();

  let FactorDB;
  try {
    ({ FactorDB } = await import('../playground/supervisor/factor-db.js'));
  } catch (e) {
    console.error('  (compiler-edit log skipped — could not import FactorDB: ' + e.message + ')');
    return;
  }

  let db;
  try { db = new FactorDB(dbPath); }
  catch (e) {
    console.error('  (compiler-edit log skipped — could not open ' + dbPath + ': ' + e.message + ')');
    return;
  }

  let total = 0;
  for (const file of TARGET_FILES) {
    const diff = getDiff(file, baseRef);
    if (!diff) continue;
    const changes = parseDiffStringChanges(diff);
    for (const c of changes) {
      try {
        db.logCompilerEdit({
          commit_sha: sha,
          file_path: file,
          edit_kind: 'error_message',
          before_text: c.before,
          after_text: c.after,
          context: c.context,
          authored_at: ts,
        });
        total++;
      } catch {
        // Per-row failure is non-fatal — keep going.
      }
    }
  }
  db.close();
  if (total > 0) {
    console.log(`  Logged ${total} compiler-edit row(s) for commit ${sha.slice(0, 8)}`);
  }
}

// Only run main when invoked as a script (not when imported by tests).
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main().catch(e => {
    console.error('  (compiler-edit log error: ' + e.message + ')');
    // never exit non-zero — must not block any commit
  });
}
