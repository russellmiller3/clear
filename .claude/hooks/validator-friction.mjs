#!/usr/bin/env node
// .claude/hooks/validator-friction.mjs
//
// PostToolUse hook — fires after Claude Edits or Writes validator.js.
// Runs scripts/top-friction-errors.mjs on the Factor DB and injects the
// top-5 highest-friction compile errors into Claude's context via
// hookSpecificOutput.additionalContext.
//
// Why this exists: the Session 44 friction-score analysis showed that the
// SAME compiler error message was firing on different words (reserved
// articles, Clear keywords) and costing ~700 Meph-minutes per error class.
// Rewriting one error-generator correctly shipped 4 top-10 fixes in one
// commit. Without this hook, Claude might rewrite error messages based on
// hunches — "this error feels confusing" — instead of the friction-ranked
// data. With the hook, the ranked list lands in Claude's context the
// moment he edits validator.js, so every compiler-error rewrite is
// grounded in actual Meph-minutes-burned.
//
// Complements the CLAUDE.md "compiler error fixes are data-driven" rule.
//
// Hook input (stdin JSON):
//   { tool_name, tool_input: { file_path, ... }, tool_response: {...} }
//
// Hook output (stdout JSON, only when file_path matches validator.js):
//   {
//     "hookSpecificOutput": {
//       "hookEventName": "PostToolUse",
//       "additionalContext": "<friction-script output>"
//     }
//   }
//
// Non-matching file paths → silent exit 0 (no output, no log spam).
// Script failure (DB missing, node crash) → silent exit 0 with a warning
// on stderr so normal editing isn't blocked by telemetry.

import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT_PATH = join(REPO_ROOT, 'scripts', 'top-friction-errors.mjs');

function main() {
	let input;
	try {
		input = readFileSync(0, 'utf8');
	} catch {
		// No stdin → silent no-op (shouldn't happen in hook context).
		process.exit(0);
	}

	let data;
	try {
		data = JSON.parse(input || '{}');
	} catch {
		process.exit(0);
	}

	const filePath = (data && data.tool_input && data.tool_input.file_path) || '';
	if (!/validator\.js$/.test(filePath)) {
		process.exit(0);
	}

	let scriptOutput;
	try {
		scriptOutput = execSync(`node "${SCRIPT_PATH}" --top=5 --min-count=3`, {
			encoding: 'utf8',
			cwd: REPO_ROOT,
			stdio: ['ignore', 'pipe', 'pipe'],
			timeout: 30_000,
		});
	} catch (err) {
		// Friction script failed — log but don't block the editing session.
		process.stderr.write(`[validator-friction hook] script failed: ${err.message}\n`);
		process.exit(0);
	}

	const context =
		'You just edited validator.js (compiler error messages).\n\n' +
		'Before shipping, check that your rewrite is data-driven — the Factor DB\'s top-5 highest-friction compile errors:\n\n' +
		scriptOutput +
		'\n\nFix these FIRST when they appear in the top ranking. Per the project CLAUDE.md "compiler error fixes are data-driven" rule, rewrites should target errors that actually cost Meph the most minutes, not hunches about what "feels confusing." After shipping an error-message rewrite that changes canonical syntax Meph should produce, update AI-INSTRUCTIONS.md in the same commit.';

	const payload = {
		hookSpecificOutput: {
			hookEventName: 'PostToolUse',
			additionalContext: context,
		},
	};
	process.stdout.write(JSON.stringify(payload));
}

main();
