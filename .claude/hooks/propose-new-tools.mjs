#!/usr/bin/env node
// .claude/hooks/propose-new-tools.mjs
//
// SessionStart hook — weekly nudge (7-day gate) reminding Claude to look
// for gaps in scripts/ and build tools proactively when repeated patterns
// emerge. Distinct from propose-new-hooks: that one proposes HOOKS from
// learnings.md pain signals; this one proposes SCRIPTS + HELPERS from
// usage patterns + high-friction subsystems.
//
// Philosophy: the AI contributor building this repo should treat itself
// as a reasonable engineer would — if the same bash pipeline fires three
// times in a session, that's a script. If the same subsystem is
// investigated weekly, that's a diagnostic helper. Don't wait to be told
// to build tools; notice the pattern and build.
//
// What this hook surfaces each week:
//  - Inventory of scripts/ so Claude knows what already exists (don't
//    propose duplicates)
//  - Top-3 highest-friction subsystems (from top-friction-errors.mjs if
//    present) — these are likely candidates for diagnostic tools
//  - Recent git log patterns that hint at repeated work ("debug X again",
//    "running Y to check Z")
//  - Explicit prompt: "any tool worth building this week?"
//
// Silent exit when <7 days since last run (stamp file). Force re-run with
// `rm .claude/.propose-new-tools-stamp`.

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPTS_DIR = join(REPO_ROOT, 'scripts');
const FRICTION_SCRIPT = join(SCRIPTS_DIR, 'top-friction-errors.mjs');
const STAMP_PATH = join(REPO_ROOT, '.claude', '.propose-new-tools-stamp');

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function main() {
	try {
		if (existsSync(STAMP_PATH)) {
			const age = Date.now() - statSync(STAMP_PATH).mtimeMs;
			if (age < SEVEN_DAYS_MS) process.exit(0);
		}
	} catch { /* proceed */ }

	const parts = [];

	// --- Existing scripts inventory so proposals don't duplicate ---
	const inventory = listScripts();
	if (inventory.length > 0) {
		parts.push('**Existing scripts (don\'t duplicate):**');
		for (const s of inventory) parts.push(`  - \`${s}\``);
	} else {
		parts.push('**Existing scripts:** none — `scripts/` is empty or missing.');
	}

	// --- Top-friction subsystems, if the friction script exists ---
	const frictionTop = runFrictionScript();
	if (frictionTop.length > 0) {
		parts.push('');
		parts.push('**Top-3 high-friction error classes (likely diagnostic-tool candidates):**');
		for (const f of frictionTop) parts.push(`  - ${f}`);
	}

	// --- Recent git log patterns that hint at repeated effort ---
	const repeatedPatterns = findRepeatedPatterns();
	if (repeatedPatterns.length > 0) {
		parts.push('');
		parts.push('**Repeated-effort signals from git log (last 30 commits):**');
		for (const p of repeatedPatterns) parts.push(`  - ${p}`);
	}

	// --- Heuristic: subsystems mentioned in recent learnings without matching scripts ---
	const gapCandidates = suggestScriptGaps(inventory);
	if (gapCandidates.length > 0) {
		parts.push('');
		parts.push('**Gap candidates — subsystems with activity but no dedicated tool:**');
		for (const g of gapCandidates) parts.push(`  - ${g}`);
	}

	touchStamp();

	const body = parts.join('\n');
	const context = `## Weekly tool-building nudge

This hook runs once every 7 days at SessionStart to surface the question: **is there a tool worth building this week?** Pattern: if you've found yourself running the same bash pipeline 3+ times, grepping the same subsystem repeatedly, or investigating the same failure class more than once, that's a tool candidate. Build it, drop it in \`scripts/\`, commit — every future session inherits it at \$0.

${body || '_(no obvious signals this week — but the question still applies: anything you did repeatedly in the last 7 days?)_'}

**Process when you spot a candidate:**
1. Check the existing-scripts list above to avoid duplication.
2. Write it in \`scripts/\` as a pure-Node .mjs (zero deps) with a top-comment description (the cookbook-updater reads it for the inventory).
3. Add a one-line rule to CLAUDE.md if the tool should be RUN at specific moments (e.g., "before touching X, run script Y").
4. If the tool should be automatic (not manual), propose it as a hook via the propose-new-hooks flow.

To dismiss this week's nudge without action: no-op — the 7-day gate resets on its own. Force a mid-week re-surface with \`rm .claude/.propose-new-tools-stamp\`.`;

	const payload = {
		hookSpecificOutput: {
			hookEventName: 'SessionStart',
			additionalContext: context,
		},
	};
	process.stdout.write(JSON.stringify(payload));
}

function listScripts() {
	if (!existsSync(SCRIPTS_DIR)) return [];
	try {
		return readdirSync(SCRIPTS_DIR)
			.filter(f => /\.(mjs|js|sh|cjs|py)$/.test(f))
			.sort();
	} catch { return []; }
}

function runFrictionScript() {
	if (!existsSync(FRICTION_SCRIPT)) return [];
	try {
		const out = execSync(`node "${FRICTION_SCRIPT}" --top=3 --min-count=3 --json`, {
			encoding: 'utf8',
			cwd: REPO_ROOT,
			stdio: ['ignore', 'pipe', 'pipe'],
			timeout: 10_000,
		});
		const data = JSON.parse(out);
		if (!data || !Array.isArray(data.top)) return [];
		return data.top.map(e => {
			const msg = (e.message || '').slice(0, 80);
			return `friction=${e.frictionScore} n=${e.count}: "${msg}${msg.length === 80 ? '…' : ''}"`;
		});
	} catch (err) {
		// Script failed or DB empty — silent skip, don't block the hook.
		return [];
	}
}

function findRepeatedPatterns() {
	try {
		const log = execSync('git log --oneline -30', {
			encoding: 'utf8',
			cwd: REPO_ROOT,
			stdio: ['ignore', 'pipe', 'ignore'],
			timeout: 5_000,
		});
		const subjects = log.trim().split('\n').map(l => l.replace(/^\w+\s+/, ''));
		// Look for repeated subsystem keywords in commit subjects — naive signal
		// that the same area is getting hit often.
		const wordCounts = new Map();
		const stopwords = new Set(['feat', 'fix', 'docs', 'test', 'chore', 'refactor', 'the', 'and', 'for', 'with', 'from', 'add', 'update', 'new']);
		for (const s of subjects) {
			const words = s.toLowerCase().match(/\b[a-z][a-z-]{3,}\b/g) || [];
			const seen = new Set();
			for (const w of words) {
				if (stopwords.has(w) || seen.has(w)) continue;
				seen.add(w);
				wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
			}
		}
		const hot = [...wordCounts.entries()]
			.filter(([, n]) => n >= 4)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5);
		if (hot.length === 0) return [];
		return hot.map(([w, n]) => `"${w}" mentioned in ${n} of 30 recent commits — if investigation pattern, consider a helper`);
	} catch {
		return [];
	}
}

function suggestScriptGaps(existing) {
	// Heuristic gap catalog — each entry is a subsystem + what a tool for it
	// would do. Only surfaces items whose subsystem keyword doesn't already
	// appear in an existing script filename.
	const catalog = [
		{ keyword: 'session-recap', title: 'scripts/session-recap.mjs', does: 'summarizes what changed + what tests ran in the current session (for auto-handoff generation)' },
		{ keyword: 'factor-db-query', title: 'scripts/factor-db-query.mjs', does: 'canned SQL queries over Factor DB (per-archetype pass rate, per-error counts, time-series)' },
		{ keyword: 'diff-summary', title: 'scripts/diff-summary.mjs', does: 'generates plain-English summary of git diff for commit messages' },
		{ keyword: 'archive-session', title: 'scripts/archive-session.mjs', does: 'snapshots playground/sessions/*.ndjson to a dated archive dir before cleanup' },
		{ keyword: 'tooling-inventory', title: 'scripts/tooling-inventory.mjs', does: 'dumps all installed hooks + skills + scripts + rules — for new-repo porting' },
		{ keyword: 'doc-drift-check', title: 'scripts/doc-drift-check.mjs', does: 'verifies intent.md + SYNTAX.md + AI-INSTRUCTIONS.md + FEATURES.md all mention the latest node types the parser emits' },
		{ keyword: 'template-smoke', title: 'scripts/template-smoke.mjs', does: 'one-shot compile-all-8-core-templates check (currently inlined in Bash rules)' },
	];
	const existingLower = existing.map(e => e.toLowerCase()).join(' ');
	return catalog
		.filter(c => !existingLower.includes(c.keyword.replace(/-/g, '')) && !existingLower.includes(c.keyword))
		.slice(0, 5)
		.map(c => `**${c.title}** — ${c.does}`);
}

function touchStamp() {
	try { writeFileSync(STAMP_PATH, new Date().toISOString() + '\n'); } catch { /* ignore */ }
}

main();
