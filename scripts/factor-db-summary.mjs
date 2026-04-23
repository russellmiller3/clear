#!/usr/bin/env node
// Quick read-only summary of the Factor DB. No writes. Safe to run while
// sweeps are in flight — SQLite WAL gives us a consistent snapshot.
//
// Usage: node scripts/factor-db-summary.mjs [--since=<iso>]

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'playground', 'factor-db.sqlite');

const argSince = process.argv.find((a) => a.startsWith('--since='))?.slice(8);

const db = new Database(DB_PATH, { readonly: true });

function q(sql, ...args) {
	try { return db.prepare(sql).all(...args); }
	catch (e) { return [{ error: e.message }]; }
}

function single(sql, ...args) {
	try { return db.prepare(sql).get(...args); }
	catch (e) { return { error: e.message }; }
}

function fmt(n) {
	return typeof n === 'number' ? n.toLocaleString() : String(n);
}

console.log('# Factor DB Summary');
console.log('');
console.log(`**Database:** \`${DB_PATH}\``);
console.log(`**Read at:** ${new Date().toISOString()}`);
console.log('');

// Total rows
const total = single('SELECT COUNT(*) AS c FROM code_actions');
const passing = single('SELECT COUNT(*) AS c FROM code_actions WHERE test_pass = 1');
const compileOk = single('SELECT COUNT(*) AS c FROM code_actions WHERE compile_ok = 1');

console.log('## Row Counts');
console.log('');
console.log(`- Total rows: **${fmt(total?.c || 0)}**`);
console.log(`- Compile-ok rows: **${fmt(compileOk?.c || 0)}** (${(((compileOk?.c || 0) / (total?.c || 1)) * 100).toFixed(1)}%)`);
console.log(`- Passing rows (test_pass=1): **${fmt(passing?.c || 0)}** (${(((passing?.c || 0) / (total?.c || 1)) * 100).toFixed(1)}%)`);
console.log('');

// Last N rows (created_at is Unix-ms)
console.log('## Most Recent 10 Rows');
console.log('');
console.log('| archetype | task_type | compile_ok | test_pass | when |');
console.log('|---|---|---|---|---|');
const recent = q(`SELECT archetype, task_type, compile_ok, test_pass, created_at
                  FROM code_actions ORDER BY id DESC LIMIT 10`);
for (const r of recent) {
	if (r.error) { console.log(`| ERROR | ${r.error} | | | |`); continue; }
	const when = new Date(r.created_at).toISOString().slice(5, 19).replace('T', ' ');
	console.log(`| ${r.archetype || '-'} | ${r.task_type || '-'} | ${r.compile_ok ? '✅' : '❌'} | ${r.test_pass ? '✅' : '❌'} | ${when} |`);
}
console.log('');

// Per-archetype pass rate
console.log('## Per-Archetype Pass Rate (top 20)');
console.log('');
console.log('| archetype | attempts | passes | rate |');
console.log('|---|---|---|---|');
const perArch = q(`SELECT archetype,
                     COUNT(*) AS attempts,
                     SUM(CASE WHEN test_pass=1 THEN 1 ELSE 0 END) AS passes
                   FROM code_actions
                   WHERE archetype IS NOT NULL
                   GROUP BY archetype
                   ORDER BY attempts DESC LIMIT 20`);
for (const r of perArch) {
	if (r.error) continue;
	const rate = r.attempts > 0 ? ((r.passes / r.attempts) * 100).toFixed(1) + '%' : '-';
	console.log(`| ${r.archetype} | ${r.attempts} | ${r.passes} | ${rate} |`);
}
console.log('');

// Last 24 hours (Unix-ms timestamps)
const now = Date.now();
const dayAgo = now - 24 * 60 * 60 * 1000;
const hourAgo = now - 60 * 60 * 1000;
const last24 = single(`SELECT COUNT(*) AS c FROM code_actions WHERE created_at >= ?`, dayAgo);
const last24Pass = single(`SELECT COUNT(*) AS c FROM code_actions WHERE created_at >= ? AND test_pass=1`, dayAgo);
const last1h = single(`SELECT COUNT(*) AS c FROM code_actions WHERE created_at >= ?`, hourAgo);
const last1hPass = single(`SELECT COUNT(*) AS c FROM code_actions WHERE created_at >= ? AND test_pass=1`, hourAgo);
console.log('## Rolling Windows');
console.log('');
console.log(`- Last 1h: **${fmt(last1h?.c || 0)}** rows, **${fmt(last1hPass?.c || 0)}** passing`);
console.log(`- Last 24h: **${fmt(last24?.c || 0)}** rows, **${fmt(last24Pass?.c || 0)}** passing`);
console.log('');

// Hint-applied rows (re-ranker signal)
const hintApplied = single(`SELECT COUNT(*) AS c FROM code_actions WHERE hint_applied IS NOT NULL`);
const hintHelpful = single(`SELECT COUNT(*) AS c FROM code_actions WHERE hint_helpful = 1`);
console.log('## Hint Telemetry');
console.log('');
console.log(`- Rows with a hint applied: **${fmt(hintApplied?.c || 0)}**`);
console.log(`- Hints marked helpful: **${fmt(hintHelpful?.c || 0)}**`);
console.log('');

// Schema sanity — tables present
console.log('## Schema');
console.log('');
const tables = q(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
for (const t of tables) {
	if (t.error) continue;
	const count = single(`SELECT COUNT(*) AS c FROM "${t.name}"`);
	console.log(`- \`${t.name}\` — ${fmt(count?.c || 0)} rows`);
}
console.log('');

db.close();
