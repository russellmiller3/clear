#!/usr/bin/env node
// .claude/hooks/meta-learnings-updater.mjs
//
// SessionStart hook — refreshes the AUTO-INVENTORY section of
// meta-learnings.md every 7 days (weekly cadence matching the other
// periodic mining hook, propose-new-hooks.mjs). Scans .claude/hooks/*.mjs,
// .claude/skills/SKILL.md, CLAUDE.md section headers, and scripts/*.{mjs,sh}
// and writes a current inventory between the BEGIN/END markers. If the
// generated inventory is byte-for-byte identical to what's already there,
// no write happens and the hook exits silent. If there's drift, the hook
// rewrites the section and emits a systemMessage noting the changes.
//
// Force a re-run mid-week: `rm .claude/.meta-learnings-updater-stamp`.
//
// Why this exists: meta-learnings.md is the portable cookbook for
// seeding new AI-first repos. Its narrative (philosophy, starter kit,
// advanced kit) is hand-curated. But the INVENTORY of what's actually
// installed today — rules, hooks, skills, scripts — goes stale the
// moment anyone adds a new hook or rule. Making the inventory auto-
// maintained means the cookbook stays accurate without human effort;
// the starter kit is always what's actually in the repo.
//
// Runtime: ~30-50ms. Gate: .claude/.meta-learnings-updater-stamp,
// 7-day refresh window.

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'fs';
import { dirname, join, resolve, basename } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');
const META_PATH = join(REPO_ROOT, 'meta-learnings.md');
const HOOKS_DIR = join(REPO_ROOT, '.claude', 'hooks');
const SKILLS_DIR = join(REPO_ROOT, '.claude', 'skills');
const SCRIPTS_DIR = join(REPO_ROOT, 'scripts');
const CLAUDE_MD = join(REPO_ROOT, 'CLAUDE.md');
const STAMP_PATH = join(REPO_ROOT, '.claude', '.meta-learnings-updater-stamp');

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const BEGIN_MARKER = '<!-- BEGIN AUTO-INVENTORY';
const END_MARKER = '<!-- END AUTO-INVENTORY -->';

function main() {
	// 7-day gate so we don't churn on every session start.
	try {
		if (existsSync(STAMP_PATH)) {
			const age = Date.now() - statSync(STAMP_PATH).mtimeMs;
			if (age < SEVEN_DAYS_MS) process.exit(0);
		}
	} catch { /* proceed */ }

	if (!existsSync(META_PATH)) {
		// No cookbook to update — silent.
		process.exit(0);
	}

	const inventory = buildInventory();
	const existing = readFileSync(META_PATH, 'utf8');
	const beginIdx = existing.indexOf(BEGIN_MARKER);
	const endIdx = existing.indexOf(END_MARKER);

	if (beginIdx < 0 || endIdx < 0 || endIdx < beginIdx) {
		// Markers missing — cookbook was hand-edited wrong. Silent exit, don't corrupt.
		process.exit(0);
	}

	// Find the end of the BEGIN marker line + the END marker line boundaries.
	const beginLineEnd = existing.indexOf('\n', beginIdx);
	const endLineStart = existing.lastIndexOf('\n', endIdx) + 1;
	if (beginLineEnd < 0 || endLineStart < 0) process.exit(0);

	const existingSection = existing.slice(beginLineEnd + 1, endLineStart).trim();

	if (existingSection === inventory.trim()) {
		// No drift. Touch stamp so we don't scan for another 24h.
		touchStamp();
		process.exit(0);
	}

	// Drift detected — rewrite the section.
	const newContent =
		existing.slice(0, beginLineEnd + 1) +
		'\n' + inventory + '\n\n' +
		existing.slice(endLineStart);

	try {
		writeFileSync(META_PATH, newContent, 'utf8');
		touchStamp();
	} catch (err) {
		process.stderr.write(`[meta-learnings-updater] write failed: ${err.message}\n`);
		process.exit(0);
	}

	// Surface the change to Claude + Russell so stale cookbook isn't silent.
	const payload = {
		systemMessage: 'meta-learnings.md auto-inventory refreshed (new/changed hooks, skills, scripts, or CLAUDE.md rules detected).',
		hookSpecificOutput: {
			hookEventName: 'SessionStart',
			additionalContext:
				'Note: `meta-learnings.md` auto-inventory section was just refreshed because new items appeared in `.claude/hooks/`, `.claude/skills/`, `scripts/`, or CLAUDE.md. Commit the update alongside whatever change introduced the new items.',
		},
	};
	process.stdout.write(JSON.stringify(payload));
}

function touchStamp() {
	try { writeFileSync(STAMP_PATH, new Date().toISOString() + '\n'); } catch { /* ignore */ }
}

function buildInventory() {
	const now = new Date().toISOString().slice(0, 10);
	const parts = [`_Last refresh: ${now}_`];

	// --- CLAUDE.md rules ---
	parts.push('\n### CLAUDE.md rules (project-level, this repo)\n');
	const rules = extractClaudeMdRules();
	if (rules.length === 0) {
		parts.push('_(none — add rules to CLAUDE.md as `## Rule Name (HARD RULE)` headers)_');
	} else {
		for (const r of rules) {
			parts.push(`- **${r.title}** — ${r.oneLine}`);
		}
	}

	// --- Hooks ---
	parts.push('\n### `.claude/hooks/` — event-driven enforcement\n');
	const hooks = extractHooks();
	if (hooks.length === 0) {
		parts.push('_(none)_');
	} else {
		for (const h of hooks) {
			parts.push(`- **${h.name}** — ${h.desc}`);
		}
	}

	// --- Skills ---
	parts.push('\n### `.claude/skills/` — user-invocable slash commands\n');
	const skills = extractSkills();
	if (skills.length === 0) {
		parts.push('_(none — add skills as `.claude/skills/<name>/SKILL.md` with YAML frontmatter)_');
	} else {
		for (const s of skills) {
			parts.push(`- **/${s.name}** — ${s.desc}`);
		}
	}

	// --- Scripts ---
	parts.push('\n### `scripts/` — helper utilities (safe to run on demand)\n');
	const scripts = extractScripts();
	if (scripts.length === 0) {
		parts.push('_(none)_');
	} else {
		for (const s of scripts) {
			parts.push(`- **${s.name}** — ${s.desc}`);
		}
	}

	// --- Docs pattern ---
	parts.push('\n### Doc files at repo root (the discipline pattern)\n');
	const docs = detectDocFiles();
	for (const d of docs) {
		parts.push(`- **${d.name}** — ${d.desc}${d.exists ? '' : ' _(missing in this repo)_'}`);
	}

	return parts.join('\n');
}

function extractClaudeMdRules() {
	if (!existsSync(CLAUDE_MD)) return [];
	const text = readFileSync(CLAUDE_MD, 'utf8');
	const lines = text.split('\n');
	const out = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		// Match lines like "## Rule Name (HARD RULE)" or "## Rule Name (MANDATORY)" or "## Rule Name"
		// Require the rule to have a body — skip structural/TOC headers.
		const m = /^##\s+(.+?)(?:\s*\(.*(?:HARD\s*RULE|MANDATORY|RULE)\)?)?$/i.exec(line);
		if (!m) continue;
		// Skip headers that are obviously structural or grouping-only
		const rawTitle = line.replace(/^##\s+/, '').trim();
		if (/^(table of contents|index|about|introduction|overview|canonical vocabulary|canonical example|architecture)/i.test(rawTitle)) continue;
		if (rawTitle.length > 80) continue; // probably a paragraph misread as header
		// Extract the one-liner: first non-empty line in the body, truncated.
		let oneLine = '';
		for (let j = i + 1; j < lines.length && j < i + 12; j++) {
			const body = lines[j].trim();
			if (body.startsWith('#')) break;
			if (!body) continue;
			oneLine = body.replace(/^[*-]\s+/, '').replace(/^\*\*[^*]+\*\*[:\s.—-]*/, '');
			break;
		}
		if (oneLine.length > 140) oneLine = oneLine.slice(0, 137) + '…';
		if (!oneLine) continue;
		out.push({ title: rawTitle, oneLine });
	}
	// Cap — CLAUDE.md rule count is typically 20-50; showing top 20 by textual
	// position keeps inventory readable.
	return out.slice(0, 20);
}

function extractHooks() {
	if (!existsSync(HOOKS_DIR)) return [];
	let files;
	try { files = readdirSync(HOOKS_DIR); } catch { return []; }
	const out = [];
	for (const f of files) {
		if (!/\.(mjs|js|sh)$/.test(f)) continue;
		const fp = join(HOOKS_DIR, f);
		let text;
		try { text = readFileSync(fp, 'utf8'); } catch { continue; }
		const desc = extractTopCommentDescription(text, f);
		out.push({ name: f, desc });
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
}

function extractSkills() {
	if (!existsSync(SKILLS_DIR)) return [];
	let subs;
	try { subs = readdirSync(SKILLS_DIR, { withFileTypes: true }).filter(d => d.isDirectory()); } catch { return []; }
	const out = [];
	for (const dir of subs) {
		const skillMd = join(SKILLS_DIR, dir.name, 'SKILL.md');
		if (!existsSync(skillMd)) continue;
		let text;
		try { text = readFileSync(skillMd, 'utf8'); } catch { continue; }
		// YAML frontmatter between --- delimiters, otherwise first heading.
		let desc = '';
		const fmMatch = /^---\n([\s\S]*?)\n---/m.exec(text);
		if (fmMatch) {
			const descMatch = /^description:\s*(.+?)$/m.exec(fmMatch[1]);
			if (descMatch) desc = descMatch[1].trim();
		}
		if (!desc) {
			// Fallback: first paragraph after the first heading
			const afterH1 = text.split(/^#\s+.+$/m).slice(1).join('\n').trim();
			desc = afterH1.split(/\n\s*\n/)[0].replace(/\s+/g, ' ').slice(0, 140);
		}
		if (desc.length > 140) desc = desc.slice(0, 137) + '…';
		out.push({ name: dir.name, desc: desc || '(no description)' });
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
}

function extractScripts() {
	if (!existsSync(SCRIPTS_DIR)) return [];
	let files;
	try { files = readdirSync(SCRIPTS_DIR); } catch { return []; }
	const out = [];
	for (const f of files) {
		if (!/\.(mjs|js|sh|cjs)$/.test(f)) continue;
		const fp = join(SCRIPTS_DIR, f);
		let text;
		try { text = readFileSync(fp, 'utf8'); } catch { continue; }
		const desc = extractTopCommentDescription(text, f);
		out.push({ name: f, desc });
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
}

function extractTopCommentDescription(text, fallback) {
	// Look for a top comment block (// or #) and grab the first sentence.
	const lines = text.split('\n');
	const comments = [];
	let started = false;
	for (const line of lines) {
		const t = line.trim();
		if (!started && (t.startsWith('#!') || t === '')) continue;
		if (t.startsWith('//') || t.startsWith('#')) {
			const cleaned = t.replace(/^\/\/\s?|^#+\s?/, '').trim();
			if (!cleaned) { if (comments.length > 0) break; else continue; }
			comments.push(cleaned);
			started = true;
			continue;
		}
		if (started) break; // hit code
	}
	if (comments.length === 0) return `(no top-comment description in ${fallback})`;
	// Heuristic: first line is usually the file path; actual description starts on line 2.
	// Pick the first comment line that looks like prose (>20 chars, not a file path).
	const prose = comments.find(c => c.length > 20 && !/^\.?[/\\]/.test(c) && !/\.(mjs|js|sh|cjs)\b/.test(c));
	let desc = prose || comments[0];
	// Truncate at first period + space, or at 200 chars.
	const firstSentence = desc.match(/^(.+?[.!?])(\s|$)/);
	if (firstSentence) desc = firstSentence[1];
	if (desc.length > 200) desc = desc.slice(0, 197) + '…';
	return desc;
}

function detectDocFiles() {
	const candidates = [
		{ name: 'CLAUDE.md', desc: 'AI contributor rules — read at every session start' },
		{ name: 'HANDOFF.md', desc: 'session-to-session state + prioritized next-moves' },
		{ name: 'learnings.md', desc: 'append-only narrative log of bugs + root causes + fixes' },
		{ name: 'meta-learnings.md', desc: 'portable cookbook (this file) for seeding new repos' },
		{ name: 'ROADMAP.md', desc: 'forward-looking — what\'s planned, priority-ordered' },
		{ name: 'CHANGELOG.md', desc: 'historical — what shipped, session-dated, newest first' },
		{ name: 'FEATURES.md', desc: 'capability reference — what exists today (split from roadmap)' },
		{ name: 'FAQ.md', desc: 'where-does-X-live search-first navigation' },
		{ name: 'RESEARCH.md', desc: 'research thesis + experiment results + flywheel notes' },
		{ name: 'PHILOSOPHY.md', desc: 'design principles for this repo — WHY the architecture looks like this' },
		{ name: 'requests.md', desc: 'bug/feature-request tracker (tiered by severity)' },
	];
	return candidates.map(c => ({ ...c, exists: existsSync(join(REPO_ROOT, c.name)) }));
}

main();
