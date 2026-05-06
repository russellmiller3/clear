#!/usr/bin/env node
// .claude/hooks/python-first-class.mjs
//
// PostToolUse hook (Edit, Write). Fires when Claude edits files that
// affect the JS-vs-Python compile-path parity:
//   - runtime/*.js / runtime/*.mjs (helper files; need .py peers)
//   - compiler.js / parser.js / synonyms.js (compile path; Python emit
//     should handle every NodeType the JS emit handles)
//
// Strategy: every edit on a guarded file runs the python-parity audit
// (scripts/python-parity-audit.mjs — fast, ~1s) and surfaces the result
// as additional context for Claude's next message. If a runtime helper
// has no Python peer, surface a strong reminder pointing at CLAUDE.md
// "Build Python Alongside JS — No Drift Tax" rule.
//
// Doesn't BLOCK (PostToolUse can't undo the edit). The reminder + visible
// gap count is the enforcement — Claude sees the gap grow and knows to
// add the Python equivalent in the next edit.
//
// Override: set PYTHON_LATER=1 in env to silence the hook for an explicit
// JS-only follow-up commit. Use sparingly.

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, basename, join } from 'path';

if (process.env.PYTHON_LATER === '1') {
  process.exit(0);
}

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const tool = input.tool_input || {};
const filePath = tool.file_path || '';
const projectRoot = process.cwd();

const isRuntimeJs = /(?:^|[\\/])runtime[\\/][^\\/]+\.(?:m|c)?js$/.test(filePath);
const isCompilerCore = /(?:^|[\\/])(?:compiler|parser|synonyms)\.js$/.test(filePath);

if (!isRuntimeJs && !isCompilerCore) {
  process.exit(0);
}

const messages = [];

// --- Check 1: runtime helper has a Python peer ---
if (isRuntimeJs) {
  const dir = dirname(filePath);
  const base = basename(filePath).replace(/\.(?:m|c)?js$/, '');
  // hyphenated JS filenames -> underscored Python filenames (PEP 8)
  const pyName = base.replace(/-/g, '_') + '.py';
  const pyPath = join(dir, pyName);
  if (!existsSync(pyPath)) {
    messages.push(
      [
        '## Python parity reminder — runtime helper has no Python peer',
        '',
        `You just edited \`${filePath}\` but its Python peer \`${pyPath}\` doesn't exist.`,
        '',
        'Per CLAUDE.md "Build Python Alongside JS — No Drift Tax": every JS runtime',
        'helper needs a Python equivalent in the same change. Either create',
        `\`${pyPath}\` now (port the JS file, match the on-disk format byte-for-byte`,
        'so cross-runtime data interop works), OR document the gap in',
        '`plans/plan-python-parity.md` AND set `PYTHON_LATER=1` in env to',
        'silence this reminder for the explicit follow-up commit.',
        '',
        'The python-parity-audit at `scripts/python-parity-audit.mjs` will continue',
        'to count this as a HIGH-severity gap until the .py file lands.',
      ].join('\n')
    );
  }
}

// --- Check 2: run the parity audit and surface current gap state ---
if (isCompilerCore || isRuntimeJs) {
  let result = '';
  try {
    result = execSync('node scripts/python-parity-audit.mjs 2>&1', {
      encoding: 'utf8',
      cwd: projectRoot,
      timeout: 10000,
    });
  } catch (e) {
    // audit returns non-zero when HIGH-severity gaps exist — that's fine,
    // we just want the report
    result = (e.stdout || '').toString() + (e.stderr || '').toString();
  }

  const highMatch = result.match(/HIGH severity:\s*(\d+)/);
  const mediumMatch = result.match(/MEDIUM severity:\s*(\d+)/);
  const helperMatch = result.match(/Runtime helper[^:]*:\s*(\d+)\s+of\s+(\d+)/);

  const high = highMatch ? parseInt(highMatch[1], 10) : null;
  const medium = mediumMatch ? parseInt(mediumMatch[1], 10) : null;
  const helperGaps = helperMatch ? parseInt(helperMatch[1], 10) : null;
  const helperTotal = helperMatch ? parseInt(helperMatch[2], 10) : null;

  const hasGap = (high && high > 0) || (helperGaps && helperGaps > 0);

  if (hasGap) {
    messages.push(
      [
        '## Python parity audit — current state',
        '',
        `- HIGH-severity feature gaps (JS handles, Python no-ops): **${high ?? '?'}**`,
        `- MEDIUM-severity gaps (some are noise from primitive emit): **${medium ?? '?'}**`,
        `- Runtime helper file gaps: **${helperGaps ?? '?'} of ${helperTotal ?? '?'}**`,
        '',
        'If your edit just added a JS-only feature, add the Python equivalent in',
        'the SAME change. Per CLAUDE.md "Build Python Alongside JS — No Drift',
        'Tax": the gap is supposed to SHRINK over time, not grow.',
        '',
        'Run `node scripts/python-parity-audit.mjs --csv` to see the full gap list.',
        'Override this hook with `PYTHON_LATER=1` in env for an explicit',
        'JS-only follow-up commit.',
      ].join('\n')
    );
  }
}

if (messages.length === 0) {
  process.exit(0);
}

const additionalContext = messages.join('\n\n---\n\n');
const response = {
  hookSpecificOutput: {
    hookEventName: 'PostToolUse',
    additionalContext,
  },
};
console.log(JSON.stringify(response));
process.exit(0);
