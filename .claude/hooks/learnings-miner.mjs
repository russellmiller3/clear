#!/usr/bin/env node
// .claude/hooks/learnings-miner.mjs
//
// PostToolUse hook — fires after Claude Edits or Writes ANY file in the
// repo. Greps learnings.md for past gotchas related to the edited file
// (by basename, directory keywords, and known-subsystem synonyms) and
// injects the top-3 matching sections into Claude's context via
// hookSpecificOutput.additionalContext.
//
// Why this exists: learnings.md is 1,800+ lines of "we hit X, root cause
// was Y, fix was Z." Nobody reads it "just in case" — too long, too much
// surface area. But when Claude touches `parser.js`, the 3-4 sections of
// learnings.md that mention parser gotchas are *exactly* the context he
// needs. This hook surfaces them on-demand, automatically, at the moment
// of relevance.
//
// Scoring: each learnings.md section gets 1 point per match on the
// basename (highest signal), 0.5 per match on extracted keywords (medium),
// 0.25 per match on parent-directory keywords (low). Top-3 by score get
// injected. If score is 0 across the board, silent exit — no noise for
// edits to files the learnings file doesn't discuss.
//
// Runtime: ~30-50ms on a 1,800-line learnings.md. Budget-safe for every
// Edit/Write.

import { readFileSync, existsSync } from 'fs';
import { dirname, join, resolve, basename } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');
const LEARNINGS_PATH = join(REPO_ROOT, 'learnings.md');

// Directory → concept keywords. When the edited file's parent dir matches,
// the corresponding keywords get boosted-match scoring.
const DIR_KEYWORDS = {
	playground: ['studio', 'playground', 'meph', 'ide'],
	'playground/supervisor': ['supervisor', 'sweep', 'curriculum', 'factor-db', 'reranker'],
	'playground/ghost-meph': ['cc-agent', 'ghost', 'mcp', 'stream-json'],
	'playground/ghost-meph/mcp-server': ['mcp', 'mcp-server'],
	lib: ['compiler', 'library', 'lib'],
	runtime: ['runtime', 'generated', 'db.js', 'auth'],
	curriculum: ['curriculum', 'task'],
	apps: ['template', 'app'],
	scripts: ['script', 'tool'],
};

// Filename → extra keywords. When the basename matches one of these keys,
// boost these keywords too (same weight as basename match).
const FILENAME_SYNONYMS = {
	'parser.js': ['parser', 'parsing', 'parseBlock', 'parseSave', 'parseNode'],
	'tokenizer.js': ['tokenizer', 'tokenize', 'token'],
	'synonyms.js': ['synonym', 'SYNONYM_VERSION', 'tokenizer'],
	'validator.js': ['validator', 'validation', 'validate', 'INTENT_HINTS'],
	'compiler.js': ['compiler', 'compile', 'compileNode', 'exprToCode', 'codegen'],
	'index.js': ['compileProgram', 'public API'],
	'server.js': ['studio', '/api/chat', 'server'],
	'cc-agent.js': ['cc-agent', 'claude CLI', 'stdin race', 'stream-json'],
	'factor-db.js': ['factor DB', 'training', 'reranker'],
	'router.js': ['router', 'MEPH_BRAIN', 'ghost meph'],
	'meph-tools.js': ['meph tool', 'hint', 'dispatchTool'],
	'deploy-cloudflare.js': ['cloudflare', 'WFP', 'deploy'],
	'tenants.js': ['tenant', 'multi-tenant', 'store'],
	'edit-api.js': ['live edit', 'LAE', '__meph__', 'widget'],
	'ship.js': ['ship', 'applyShip', 'rollback'],
	'meph-widget.js': ['widget', 'live edit', 'owner'],
	'curriculum-sweep.js': ['sweep', 'curriculum', 'grader'],
	'spawner.js': ['spawner', 'taskkill', 'zombie'],
};

function main() {
	let input;
	try {
		input = readFileSync(0, 'utf8');
	} catch { process.exit(0); }

	let data;
	try { data = JSON.parse(input || '{}'); } catch { process.exit(0); }

	const filePath = (data && data.tool_input && data.tool_input.file_path) || '';
	if (!filePath) process.exit(0);

	// Skip hidden + node_modules + build dirs — noise, not learnings material.
	if (/(^|[\/\\])(\.git|node_modules|\.meph-build|tests\/acceptance|\.claude\/worktrees)($|[\/\\])/.test(filePath)) {
		process.exit(0);
	}

	if (!existsSync(LEARNINGS_PATH)) process.exit(0);

	const bname = basename(filePath);
	const lowerBname = bname.toLowerCase();
	const normalizedPath = filePath.replace(/\\/g, '/');

	// Build keyword sets for scoring.
	const highWeight = new Set([lowerBname]); // basename match = 1.0
	const medWeight = new Set(); // filename synonyms + boosted keywords = 0.5
	const lowWeight = new Set(); // directory concepts = 0.25

	const syns = FILENAME_SYNONYMS[lowerBname];
	if (syns) for (const k of syns) medWeight.add(k.toLowerCase());

	for (const [dirKey, keywords] of Object.entries(DIR_KEYWORDS)) {
		if (normalizedPath.includes('/' + dirKey + '/') || normalizedPath.includes(dirKey + '/')) {
			for (const k of keywords) lowWeight.add(k.toLowerCase());
		}
	}

	// Read + split learnings.md into sections by ## and ### headers.
	const raw = readFileSync(LEARNINGS_PATH, 'utf8');
	const lines = raw.split('\n');
	const sections = [];
	let current = null;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (/^#{2,3}\s/.test(line)) {
			if (current) sections.push(current);
			current = { header: line, startLine: i, body: [], score: 0 };
		} else if (current) {
			current.body.push(line);
		}
	}
	if (current) sections.push(current);

	// Filter out sections that are structural noise, not learnings content:
	//  - Table of Contents (matches every subsystem keyword trivially)
	//  - Empty or near-empty sections
	//  - Bare session-title sections whose body is just a list of ### links
	const NOISE_RE = /^#{2,3}\s*(table of contents|toc|index)\b/i;
	const nonNoise = sections.filter(s => {
		if (NOISE_RE.test(s.header)) return false;
		const bodyText = s.body.join('\n').trim();
		if (bodyText.length < 50) return false; // stub sections
		return true;
	});

	// Score each section.
	for (const s of nonNoise) {
		const text = (s.header + '\n' + s.body.join('\n')).toLowerCase();
		for (const kw of highWeight) {
			const re = new RegExp(`\\b${escapeRegex(kw)}\\b`, 'g');
			const matches = text.match(re);
			if (matches) s.score += matches.length * 1.0;
		}
		for (const kw of medWeight) {
			const re = new RegExp(`\\b${escapeRegex(kw)}\\b`, 'g');
			const matches = text.match(re);
			if (matches) s.score += matches.length * 0.5;
		}
		for (const kw of lowWeight) {
			const re = new RegExp(`\\b${escapeRegex(kw)}\\b`, 'g');
			const matches = text.match(re);
			if (matches) s.score += matches.length * 0.25;
		}
	}

	const ranked = nonNoise.filter(s => s.score > 0).sort((a, b) => b.score - a.score);
	if (ranked.length === 0) process.exit(0);

	// Take top-3, cap each section body at 20 lines so the injected context
	// stays under ~1.5KB total per edit.
	const top = ranked.slice(0, 3).map(s => {
		const body = s.body.slice(0, 20).join('\n').trim();
		const trailer = s.body.length > 20 ? '\n…' : '';
		return `${s.header}\n${body}${trailer}`;
	});

	const context =
		`You just edited \`${bname}\`. Past gotchas from learnings.md that mention this file or its subsystem — read these before committing:\n\n` +
		top.join('\n\n---\n\n') +
		`\n\n(Hook: .claude/hooks/learnings-miner.mjs — ranks sections of learnings.md by relevance to the edited file. Full file is at learnings.md if you want more context.)`;

	const payload = {
		hookSpecificOutput: {
			hookEventName: 'PostToolUse',
			additionalContext: context,
		},
	};
	process.stdout.write(JSON.stringify(payload));
}

function escapeRegex(s) {
	return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

main();
