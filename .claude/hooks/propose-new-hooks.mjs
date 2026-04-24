#!/usr/bin/env node
// .claude/hooks/propose-new-hooks.mjs
//
// SessionStart hook — runs at most once every 7 days (gated by
// `.claude/.hook-proposal-stamp`). Scans learnings.md for patterns that
// indicate we keep paying the same tax (gotchas repeated across sessions,
// "cost us X minutes", "bit us again", "rule born from" language), cross-
// references against already-installed hooks, and proposes the top-5
// unserved candidates via hookSpecificOutput.additionalContext.
//
// Why this exists: learnings.md grows every session. Some entries warrant
// hooks (recurring, mechanical, painful). Nobody's going to sit down and
// review 1,800+ lines "just to look for hookable patterns." So the hook
// looks for us, weekly, and surfaces proposals when they're actionable.
//
// Meta-pattern: this IS the self-play flywheel applied at the dev-loop
// layer. SK-5 generates synthetic CURRICULUM tasks for Meph; this
// generates synthetic HOOK proposals for Claude. Same shape.
//
// Silent exit when:
//   - Last run <7 days ago (stamp file)
//   - Zero unserved proposals scored above threshold
//   - learnings.md missing
//
// Runtime: ~30-80ms on the current learnings.md, well under any timeout.

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');
const LEARNINGS_PATH = join(REPO_ROOT, 'learnings.md');
const HOOKS_DIR = join(REPO_ROOT, '.claude', 'hooks');
const SETTINGS_PATH = join(REPO_ROOT, '.claude', 'settings.json');
const STAMP_PATH = join(REPO_ROOT, '.claude', '.hook-proposal-stamp');

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Signals that a learnings section contains a HOOKABLE pattern — repeated
// pain the author is documenting as a rule. Weight by how strongly each
// language pattern indicates "we should automate a check here."
const PATTERN_SIGNALS = [
	{ weight: 3.0, re: /\b(gotcha[-\s]as[-\s]rule|new project rule|new hard rule)\b/i },
	{ weight: 2.5, re: /\b(bit us again|same mistake|hit this again|always forget)\b/i },
	{ weight: 2.0, re: /\b(cost us|wasted|burned|\d+ (min|mins|minutes|hours|hrs) debug)/i },
	{ weight: 1.5, re: /\b(mandatory|must NEVER|never do this|always do|silent(ly)? (bug|fail)s?)\b/i },
	{ weight: 1.5, re: /\b(rule born|lesson learned|going forward|from now on)\b/i },
	{ weight: 1.0, re: /\b(drift[-\s]guard|regression[-\s]floor|trap|pitfall)\b/i },
];

// Topic fingerprints we can detect inside a flagged section. Each maps a
// concept to the kind of hook it would warrant. When a section scores high
// AND matches a topic, we propose the topic's hook shape.
const TOPIC_HOOKS = [
	{
		topic: /\bsynonym(s|_version)?\b|\btokenizer\s+(trap|collision)/i,
		alreadyServed: /synonym|tokenizer/i,
		proposal: {
			name: 'synonym-version-bump',
			trigger: 'PostToolUse on synonyms.js',
			does: 'warns if git diff changes synonyms.js without bumping SYNONYM_VERSION',
			why: 'Documented in Session 10/11 — forgotten SYNONYM_VERSION bumps cause cache-staleness bugs that slip past unit tests',
		},
	},
	{
		topic: /\btemplate(s)?\s+(broke|smoke|compile)|\b8[-\s]core\s+templates?\b|\btemplate[-\s]smoke/i,
		alreadyServed: /template[-\s]smoke/i,
		proposal: {
			name: 'template-smoke-test',
			trigger: 'PostToolUse on parser.js | synonyms.js | compiler.js',
			does: 'runs the 8-core-template compile check and warns on any non-zero error count',
			why: 'CLAUDE.md "Template Smoke Test on New Syntax" rule is advisory — hooking it makes it mechanical',
		},
	},
	{
		topic: /\b(factor[-\s]db|training[-\s]data|sqlite[-\s]wal)\b/i,
		alreadyServed: /factor[-\s]db[-\s](guard|checkpoint)/i,
		proposal: {
			name: 'factor-db-pre-commit',
			trigger: 'PreToolUse on Bash matching `git commit`',
			does: 'forces SQLite WAL checkpoint + confirms .sqlite changes are staged before commit',
			why: 'Session 38 lost 343 training rows to this exact failure class',
		},
	},
	{
		topic: /\bplans?[/\\]|plan[-\s]directory|\/plans\s+directory/i,
		alreadyServed: /plans[-\s]directory[-\s]redirect/i,
		proposal: {
			name: 'plans-directory-redirect',
			trigger: 'PreToolUse on Write matching `*plan*.md`',
			does: 'redirects plan files to /plans/ if written elsewhere',
			why: 'User-memory rule — corrected 4+ times',
		},
	},
	{
		topic: /\b_revive\s+is\s+not\s+defined|_revive\s+crash/i,
		alreadyServed: /_revive/i,
		proposal: {
			name: 'revive-drift-guard',
			trigger: 'PostToolUse on compiler.js',
			does: 'greps the last-compiled template output for `_revive` at top level of emitted code — warns if helper is missing',
			why: 'Tier-1 blocker class that recurred multiple times across sessions',
		},
	},
	{
		topic: /\bdoc(umentation)?\s+drift|intent\.md\s+lag|SYNTAX\.md\s+stale/i,
		alreadyServed: /doc[-\s]drift/i,
		proposal: {
			name: 'doc-drift-on-new-node-type',
			trigger: 'PostToolUse on parser.js',
			does: 'detects new NodeType entries in the diff; warns if intent.md + SYNTAX.md + AI-INSTRUCTIONS.md were not touched in the same commit range',
			why: 'CLAUDE.md Documentation Rule is 11 surfaces — hard to remember which; auto-check closes the loop',
		},
	},
	{
		topic: /\bstdin[-\s]race|claude\.exe\s+\d|windows.*\s+(pipe|stdin)/i,
		alreadyServed: /stdin[-\s]race[-\s]check/i,
		proposal: {
			name: 'no-stdin-piped-to-claude-cli',
			trigger: 'PreToolUse on Bash',
			does: 'warns if a bash command pipes stdin to `claude` or `claude.exe` without using --system-prompt-file',
			why: 'Session 44 stdin race — cost multiple debug sessions before the fix was understood',
		},
	},
];

function main() {
	// Gate: only run if >7 days since last proposal.
	try {
		if (existsSync(STAMP_PATH)) {
			const age = Date.now() - statSync(STAMP_PATH).mtimeMs;
			if (age < SEVEN_DAYS_MS) process.exit(0);
		}
	} catch { /* fall through — proceed */ }

	if (!existsSync(LEARNINGS_PATH)) process.exit(0);

	// Enumerate already-installed hooks (by filename + settings.json content)
	// so we don't propose ones that exist.
	let servedFingerprint = '';
	try {
		const files = readdirSync(HOOKS_DIR);
		servedFingerprint += files.join('|');
	} catch { /* ignore */ }
	try {
		servedFingerprint += readFileSync(SETTINGS_PATH, 'utf8');
	} catch { /* ignore */ }

	// Read + split learnings.md into sections.
	const raw = readFileSync(LEARNINGS_PATH, 'utf8');
	const lines = raw.split('\n');
	const sections = [];
	let current = null;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (/^#{2,3}\s/.test(line)) {
			if (current) sections.push(current);
			current = { header: line, body: [], score: 0, matchedPatterns: [] };
		} else if (current) {
			current.body.push(line);
		}
	}
	if (current) sections.push(current);

	// Score each section by signal density.
	for (const s of sections) {
		const text = (s.header + '\n' + s.body.join('\n'));
		for (const sig of PATTERN_SIGNALS) {
			const matches = text.match(sig.re);
			if (matches) {
				s.score += sig.weight;
				s.matchedPatterns.push(matches[0]);
			}
		}
	}

	const hot = sections.filter(s => s.score >= 2.0).sort((a, b) => b.score - a.score);
	if (hot.length === 0) {
		touchStamp();
		process.exit(0);
	}

	// For each hot section, find which TOPIC_HOOKS apply AND are not already served.
	const proposed = new Map(); // name → { proposal, evidence[] }
	for (const s of hot) {
		const text = s.header + '\n' + s.body.join('\n');
		for (const th of TOPIC_HOOKS) {
			if (!th.topic.test(text)) continue;
			if (th.alreadyServed.test(servedFingerprint)) continue;
			if (!proposed.has(th.proposal.name)) {
				proposed.set(th.proposal.name, { proposal: th.proposal, evidence: [] });
			}
			proposed.get(th.proposal.name).evidence.push(s.header.trim());
		}
	}

	touchStamp();

	if (proposed.size === 0) process.exit(0);

	// Build the additionalContext payload.
	const items = [...proposed.values()].slice(0, 5);
	const body = items.map(({ proposal, evidence }) => {
		const evList = evidence.slice(0, 3).map(e => `  - ${e}`).join('\n');
		return `**${proposal.name}** (${proposal.trigger})
  - Does: ${proposal.does}
  - Why: ${proposal.why}
  - Evidence from learnings.md:
${evList}`;
	}).join('\n\n');

	const context = `## Periodic hook-miner (runs every 7 days) — unserved proposals

The hook-miner scanned learnings.md for repeating-pain signals AND cross-referenced against already-installed hooks in \`.claude/hooks/\` + settings. ${items.length} new hook${items.length === 1 ? '' : 's'} worth considering:

${body}

To install any of these, tell me "build the <name> hook" and I'll write it + wire it in. To dismiss without installing, say so and I won't propose again until the signal strengthens. Stamp file at \`.claude/.hook-proposal-stamp\` gates re-runs for 7 days regardless.`;

	const payload = {
		hookSpecificOutput: {
			hookEventName: 'SessionStart',
			additionalContext: context,
		},
	};
	process.stdout.write(JSON.stringify(payload));
}

function touchStamp() {
	try { writeFileSync(STAMP_PATH, new Date().toISOString() + '\n'); } catch { /* ignore */ }
}

main();
