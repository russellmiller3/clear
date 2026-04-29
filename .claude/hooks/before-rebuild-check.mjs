#!/usr/bin/env node
// .claude/hooks/before-rebuild-check.mjs
//
// PreToolUse hook on Bash — fires when Claude is about to cut a feature
// branch (`git checkout -b feature/X` or `git switch -c feature/X`).
//
// Why this exists: 2026-04-29 close. Claude was about to rebuild the
// search-input-filter primitive that was already shipped via Codex chunk
// #5 — the priority queue listed it as "to do" and the discipline of
// checking FEATURES.md first only existed in the head-rule. Russell's
// fix: enforce it at branch-cut time. The only moment when the agent
// has named the new direction AND hasn't started writing yet is when
// it cuts the branch. That's the cheapest moment to catch a duplicate.
//
// What the hook does:
//   1. Detects `git (checkout -b|switch -c) (feature|fix)/<slug>` in the
//      Bash command.
//   2. Splits the slug into keyword tokens (split on `-`, drop short stop
//      words like 'a', 'the', 'of', 'cc-5b' etc.).
//   3. Greps FEATURES.md + intent.md + parser.js + synonyms.js for each
//      keyword. Any match → inject a warning in Claude's context.
//   4. Lists the matching lines so Claude can decide: rebuild, extend, or
//      skip.
//
// The hook NEVER blocks the branch creation. It just surfaces evidence.
// If the match is a false positive (a homonym), Claude continues. If the
// match is real (the thing already exists), Claude skips and picks the
// next item from the queue.
//
// Hook input (stdin JSON):
//   { tool_name: 'Bash', tool_input: { command, ... }, ... }
//
// Hook output (stdout JSON, only when command matches a feature-branch
// cut AND keywords match existing docs/code):
//   {
//     "hookSpecificOutput": {
//       "hookEventName": "PreToolUse",
//       "additionalContext": "<warning + matched lines>"
//     }
//   }
//
// Non-matching commands → silent exit 0. Branches with no doc/code matches
// → silent exit 0 (don't add noise on legitimately-new work).

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Stop words that are too generic to be useful keywords. Keep this list
// short — most short tokens ARE meaningful (e.g. "dns", "css", "api").
const STOP_WORDS = new Set([
	'a', 'an', 'the', 'of', 'for', 'to', 'in', 'on', 'and', 'or',
	'cc', 'rr', 'qp', 'gtm', 'p0', 'p1', 'p2', 'p3', 'p4',
	'fix', 'feature', 'docs', 'doc', 'test', 'tests',
	'cycle', 'phase', 'plan', 'new', 'old',
]);

// Files we grep for "does this already exist?" evidence. Order matters:
// FEATURES.md is the capability surface, intent.md is the spec,
// parser.js + synonyms.js are the implementation.
const SEARCH_FILES = [
	'FEATURES.md',
	'intent.md',
	'parser.js',
	'synonyms.js',
];

export function extractFeatureSlug(command) {
	if (typeof command !== 'string') return null;
	const m = command.match(/git\s+(?:checkout\s+-b|switch\s+-c)\s+(?:feature|fix|docs)\/([\w./-]+)/i);
	return m ? m[1] : null;
}

export function slugToKeywords(slug) {
	if (!slug) return [];
	// Split on hyphens, dots, and slashes. Lowercase. Drop stop words and
	// pure-numeric tokens. Drop tokens shorter than 3 chars unless they
	// look meaningful (we already exclude those via STOP_WORDS for common
	// cases like 'a', 'or', etc.).
	return slug
		.toLowerCase()
		.split(/[-./]+/)
		.map(t => t.trim())
		.filter(t => t.length >= 3)
		.filter(t => !STOP_WORDS.has(t))
		.filter(t => !/^\d+$/.test(t));
}

export function searchKeywordInFile(repoRoot, fileRel, keyword) {
	const fullPath = join(repoRoot, fileRel);
	if (!existsSync(fullPath)) return [];
	let content;
	try {
		content = readFileSync(fullPath, 'utf8');
	} catch {
		return [];
	}
	const lines = content.split('\n');
	const re = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
	const hits = [];
	for (let i = 0; i < lines.length; i++) {
		if (re.test(lines[i])) {
			hits.push({ line: i + 1, text: lines[i].slice(0, 160) });
			if (hits.length >= 3) break; // cap noise per file
		}
	}
	return hits;
}

export function buildReminder(slug, keywords, evidence) {
	const lines = [];
	lines.push(`<system-reminder>`);
	lines.push(`Before-rebuild check: you are about to cut \`feature/${slug}\`.`);
	lines.push('');
	lines.push(`Keywords scanned: ${keywords.map(k => `\`${k}\``).join(', ')}`);
	lines.push('');
	lines.push(`The following existing documentation / code matches one of those keywords. Skim it BEFORE writing new code — if the thing already exists, extend it or add a row to FEATURES.md instead of rebuilding.`);
	lines.push('');
	for (const fileRel of Object.keys(evidence)) {
		const hits = evidence[fileRel];
		if (hits.length === 0) continue;
		lines.push(`**${fileRel}:**`);
		for (const h of hits) {
			lines.push(`  - line ${h.line}: ${h.text.trim()}`);
		}
		lines.push('');
	}
	lines.push(`If these matches are FALSE POSITIVES (homonyms — same word, different concept), proceed and ignore. If any match is the real thing, skip the rebuild and pick the next priority-queue item.`);
	lines.push(``);
	lines.push(`This hook never blocks. It surfaces evidence. The decision is yours.`);
	lines.push(`</system-reminder>`);
	return lines.join('\n');
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

	if (data.tool_name !== 'Bash') process.exit(0);

	const command = (data.tool_input && data.tool_input.command) || '';
	const slug = extractFeatureSlug(command);
	if (!slug) process.exit(0);

	const keywords = slugToKeywords(slug);
	if (keywords.length === 0) process.exit(0);

	const repoRoot = process.cwd();
	const evidence = {};
	let totalHits = 0;
	for (const fileRel of SEARCH_FILES) {
		const allHits = [];
		for (const kw of keywords) {
			const hits = searchKeywordInFile(repoRoot, fileRel, kw);
			for (const h of hits) {
				allHits.push({ ...h, keyword: kw });
				totalHits++;
			}
		}
		// Dedup by line number per file.
		const seen = new Set();
		evidence[fileRel] = allHits.filter(h => {
			if (seen.has(h.line)) return false;
			seen.add(h.line);
			return true;
		}).slice(0, 5); // hard cap per file
	}

	if (totalHits === 0) process.exit(0);

	const payload = {
		hookSpecificOutput: {
			hookEventName: 'PreToolUse',
			additionalContext: buildReminder(slug, keywords, evidence),
		},
	};
	process.stdout.write(JSON.stringify(payload));
	process.exit(0);
}

const invokedDirectly = (() => {
	try {
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
