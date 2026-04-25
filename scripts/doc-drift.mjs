#!/usr/bin/env node
// scripts/doc-drift.mjs
//
// Doc-drift detector — runs in pre-push to catch new node types or new
// synonyms that landed in code without corresponding doc updates.
//
// Why this exists: the project CLAUDE.md "Documentation Rule" requires
// updates across 11 surfaces every time a new feature ships. The
// PostToolUse hook (.claude/hooks/doc-cascade.mjs) reminds at write
// time, but that fires per-edit; this detector compares HEAD vs
// origin/main and warns about high-confidence drift — items that
// appear in code but not in ANY user-facing doc.
//
// Detection strategy (intentionally narrow, low-false-positive):
//   1. New keys in the NodeType freeze block in parser.js.
//   2. New top-level synonym keys in synonyms.js.
//
// For each new item, the detector reads intent.md, SYNTAX.md,
// FEATURES.md, and AI-INSTRUCTIONS.md, and warns when the item appears
// in NONE of them. Partial drift (e.g. in intent.md but not SYNTAX.md)
// is intentionally NOT flagged here — that's the PostToolUse hook's
// job. This script's bar is "looks like a complete doc miss."
//
// Usage:
//   node scripts/doc-drift.mjs                  # default base origin/main
//   node scripts/doc-drift.mjs --base=HEAD~5    # custom base
//   node scripts/doc-drift.mjs --quiet          # exit 0 with no output if no drift
//
// Exit codes: always 0. Warnings print to stderr. The script never
// blocks a push — it nudges. The pre-push gate is the test suite.

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

const NODE_TYPE_RE = /^  ([A-Z_]+):\s*'([a-z_]+)'/;
const SYNONYM_RE = /^  '([^']+)':/;

const DOC_FILES = ['intent.md', 'SYNTAX.md', 'FEATURES.md', 'AI-INSTRUCTIONS.md'];

// ─── Pure helpers (exported for tests) ───────────────────────────────

export function extractAddedLinesByFile(diff) {
	const result = {};
	let currentFile = null;
	for (const line of diff.split('\n')) {
		const fileMatch = line.match(/^diff --git a\/(.+) b\/(.+)$/);
		if (fileMatch) {
			currentFile = fileMatch[2];
			result[currentFile] = result[currentFile] || [];
			continue;
		}
		if (line.startsWith('+++')) continue;
		if (line.startsWith('+') && currentFile) {
			result[currentFile].push(line.slice(1));
		}
	}
	for (const k of Object.keys(result)) {
		if (result[k].length === 0) delete result[k];
	}
	return result;
}

export function findNewNodeTypes(linesByFile) {
	const lines = linesByFile['parser.js'] || [];
	const out = [];
	for (const line of lines) {
		const m = line.match(NODE_TYPE_RE);
		if (m) out.push(m[2]);
	}
	return out;
}

export function findNewSynonyms(linesByFile) {
	const lines = linesByFile['synonyms.js'] || [];
	const out = [];
	for (const line of lines) {
		const m = line.match(SYNONYM_RE);
		if (m) out.push(m[1]);
	}
	return out;
}

// Generate fuzzy variants for a snake_case node-type name. Docs document
// the English form ("set cookie"), not the internal snake_case
// ("cookie_set"). Without these variants, we'd flag every documented
// node type as drift. Variants:
//   - literal item:           cookie_set
//   - words-with-spaces:      cookie set
//   - reversed-with-spaces:   set cookie
// For single-word items, only the literal form is generated.
export function variantsOfItem(item) {
	const lc = item.toLowerCase();
	const set = new Set([lc]);
	const words = lc.split('_').filter(Boolean);
	if (words.length >= 2) {
		set.add(words.join(' '));
		set.add(words.slice().reverse().join(' '));
	}
	return [...set];
}

export function detectMissingMentions(items, docs) {
	const out = [];
	const docNames = Object.keys(docs);
	for (const item of items) {
		const variants = variantsOfItem(item);
		const missingFrom = [];
		for (const docName of docNames) {
			const haystack = docs[docName].toLowerCase();
			const found = variants.some((v) => haystack.includes(v));
			if (!found) missingFrom.push(docName);
		}
		// Only flag items missing from EVERY doc — that's the
		// high-confidence "complete miss" signal. Partial drift
		// is the PostToolUse hook's territory.
		if (missingFrom.length === docNames.length && docNames.length > 0) {
			out.push({ item, missingFrom });
		}
	}
	return out;
}

export function buildReport({ nodeTypes = [], synonyms = [] }) {
	if (nodeTypes.length === 0 && synonyms.length === 0) return '';
	const sections = [];
	sections.push('━━━ doc-drift detector ━━━');
	if (nodeTypes.length > 0) {
		sections.push('');
		sections.push(`New node types not mentioned in any user-facing doc (${nodeTypes.length}):`);
		for (const { item, missingFrom } of nodeTypes) {
			sections.push(`  - ${item}  (missing from: ${missingFrom.join(', ')})`);
		}
	}
	if (synonyms.length > 0) {
		sections.push('');
		sections.push(`New synonyms not mentioned in any user-facing doc (${synonyms.length}):`);
		for (const { item, missingFrom } of synonyms) {
			sections.push(`  - ${item}  (missing from: ${missingFrom.join(', ')})`);
		}
	}
	sections.push('');
	sections.push('Per CLAUDE.md "Documentation Rule (MANDATORY)", new features need entries in:');
	sections.push('  intent.md • SYNTAX.md • AI-INSTRUCTIONS.md • USER-GUIDE.md');
	sections.push('  FEATURES.md • CHANGELOG.md • ROADMAP.md • playground/system-prompt.md');
	sections.push('  + landing/*.html when user-facing');
	sections.push('');
	sections.push('This is a warning, not a block. Push proceeds.');
	sections.push('━━━━━━━━━━━━━━━━━━━━━━━━━━');
	return sections.join('\n');
}

// ─── main() — CLI entry point ────────────────────────────────────────

function parseArgs(argv) {
	const out = { base: 'origin/main', quiet: false };
	for (const arg of argv.slice(2)) {
		if (arg.startsWith('--base=')) out.base = arg.slice('--base='.length);
		else if (arg === '--quiet') out.quiet = true;
	}
	return out;
}

function getDiff(base) {
	try {
		return execSync(`git diff --no-color ${base}...HEAD -- parser.js synonyms.js`, {
			encoding: 'utf8',
			cwd: REPO_ROOT,
			stdio: ['ignore', 'pipe', 'pipe'],
			timeout: 10_000,
		});
	} catch {
		// origin/main may not exist, or git failed. Return empty so the
		// detector silently no-ops rather than blocking the push.
		return '';
	}
}

function readDocs() {
	const docs = {};
	for (const name of DOC_FILES) {
		const path = join(REPO_ROOT, name);
		if (existsSync(path)) {
			try {
				docs[name] = readFileSync(path, 'utf8');
			} catch {
				// skip unreadable file
			}
		}
	}
	return docs;
}

function main() {
	const args = parseArgs(process.argv);
	const diff = getDiff(args.base);

	if (!diff.trim()) {
		if (!args.quiet) process.stderr.write('[doc-drift] no diff vs ' + args.base + ' — skipping.\n');
		process.exit(0);
	}

	const linesByFile = extractAddedLinesByFile(diff);
	const newNodeTypes = findNewNodeTypes(linesByFile);
	const newSynonyms = findNewSynonyms(linesByFile);

	if (newNodeTypes.length === 0 && newSynonyms.length === 0) {
		if (!args.quiet) {
			process.stderr.write('[doc-drift] no new node types or synonyms in this diff. ✅\n');
		}
		process.exit(0);
	}

	const docs = readDocs();
	const missingNodes = detectMissingMentions(newNodeTypes, docs);
	const missingSyns = detectMissingMentions(newSynonyms, docs);

	const report = buildReport({ nodeTypes: missingNodes, synonyms: missingSyns });
	if (!report) {
		if (!args.quiet) {
			process.stderr.write('[doc-drift] new items detected, all already documented. ✅\n');
		}
		process.exit(0);
	}

	process.stderr.write(report + '\n');
	process.exit(0);
}

// Only run main() when invoked as a script (not when imported by tests).
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
