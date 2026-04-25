#!/usr/bin/env node
// .claude/hooks/doc-cascade.mjs
//
// PostToolUse hook — fires after Claude Edits or Writes any file that's
// likely to contain new compiler syntax, node types, synonyms, or runtime
// behavior. Injects the 11-doc cascade from CLAUDE.md into Claude's
// context, so the doc updates are top-of-mind at write time, not after.
//
// Why this exists: Session 46 (2026-04-25) shipped 5 features and
// shipped without updating AI-INSTRUCTIONS.md / SYNTAX.md until Russell
// explicitly nudged. The 11-surface cascade is too long to hold in
// working memory across long sessions. This hook makes the cascade
// surface-by-surface visible at the exact moment Claude has the diff
// in his head — when the cost of "also update X" is one Edit, not a
// separate session.
//
// Complements the CLAUDE.md "Documentation Rule (MANDATORY)" — that
// rule says WHAT to update; this hook reminds you to do it. Different
// from validator-friction.mjs (which fires only on validator.js and
// injects friction-ranked error data).
//
// Hook input (stdin JSON):
//   { tool_name, tool_input: { file_path, ... }, tool_response: {...} }
//
// Hook output (stdout JSON, only when file_path matches a syntax-affecting
// file):
//   {
//     "hookSpecificOutput": {
//       "hookEventName": "PostToolUse",
//       "additionalContext": "<doc-cascade reminder>"
//     }
//   }
//
// Non-matching file paths → silent exit 0.
// Malformed input → silent exit 0 (don't block editing).

import { readFileSync } from 'fs';

// File patterns that, when edited, *might* introduce new syntax / node
// types / synonyms / runtime behavior. The hook fires for any of these;
// it's up to Claude to decide whether the specific edit warrants a
// cascade update (e.g. a typo fix in parser.js doesn't, but a new
// case arm does).
const SYNTAX_AFFECTING_PATTERNS = [
	/(^|[\\/])parser\.js$/,
	/(^|[\\/])synonyms\.js$/,
	/(^|[\\/])compiler\.js$/,
	/(^|[\\/])index\.js$/,         // public API entry
	/(^|[\\/])runtime[\\/][^\\/]+\.js$/,
];

export function matchesSyntaxAffecting(filePath) {
	if (typeof filePath !== 'string' || filePath.length === 0) return false;
	return SYNTAX_AFFECTING_PATTERNS.some((re) => re.test(filePath));
}

export function buildReminder(filePath) {
	const fileName = filePath.split(/[\\/]/).pop() || filePath;
	return (
`You just edited ${fileName}.

If this edit ADDED or CHANGED user-visible syntax, a node type, a synonym, a runtime helper, or a compiler behavior, the project CLAUDE.md "Documentation Rule (MANDATORY)" requires updating ALL of these in the same commit:

  1. intent.md            — node-type row in the spec table (authoritative)
  2. SYNTAX.md            — complete syntax reference with example
  3. AI-INSTRUCTIONS.md   — conventions, when-to-use, gotchas (so Meph knows)
  4. USER-GUIDE.md        — tutorial coverage with worked example
  5. ROADMAP.md           — mark phase complete, update counts
  6. landing/*.html       — when the feature is user-facing, sync marketing examples
  7. playground/system-prompt.md — Meph reads this every session
  8. FAQ.md               — "Where does X live?" / "How do I Y?" entries
  9. RESEARCH.md          — when it touches the training-signal architecture
 10. FEATURES.md          — add a row to the capability table (today's reference)
 11. CHANGELOG.md         — session-dated entry describing what shipped

If this edit was ONLY a bug fix, refactor, comment, or rename (no user-visible delta), skip the cascade — but do consider whether requests.md has a stale entry that should now be marked DONE.

Canonical-syntax changes are extra dangerous: also grep landing/ and apps/ for the old form so old examples don't continue to mislead.

After shipping, the pre-push drift detector (scripts/doc-drift.mjs) will warn if any of these surfaces look stale relative to your diff — but catching it now is cheaper than catching it then.`
	);
}

function main() {
	let input;
	try {
		input = readFileSync(0, 'utf8');
	} catch {
		process.exit(0);
	}

	let data;
	try {
		data = JSON.parse(input || '{}');
	} catch {
		process.exit(0);
	}

	const filePath = (data && data.tool_input && data.tool_input.file_path) || '';
	if (!matchesSyntaxAffecting(filePath)) {
		process.exit(0);
	}

	const payload = {
		hookSpecificOutput: {
			hookEventName: 'PostToolUse',
			additionalContext: buildReminder(filePath),
		},
	};
	process.stdout.write(JSON.stringify(payload));
}

// Only run main() when invoked as a script (not when imported by tests).
const invokedDirectly = (() => {
	try {
		// import.meta.url is file:// URL; argv[1] is filesystem path.
		// Compare basenames as a portable check.
		const metaName = import.meta.url.split(/[\\/]/).pop() || '';
		const argvName = (process.argv[1] || '').split(/[\\/]/).pop() || '';
		return metaName === argvName;
	} catch {
		return true;
	}
})();

if (invokedDirectly) {
	main();
}
