#!/usr/bin/env node
// Pretty-print the meph_turns trace for one session, or aggregate stats.
// Read-only — safe to run while sweeps are in flight (SQLite WAL).
//
// Usage:
//   node scripts/factor-db-trace-summary.mjs --session=<session_id>
//   node scripts/factor-db-trace-summary.mjs --recent=<N>
//   node scripts/factor-db-trace-summary.mjs --stats [--since=<ms>]
//   node scripts/factor-db-trace-summary.mjs --todo-probe
//
// --todo-probe answers the "did Meph plan or theater" question:
//   For each session, find the first tool_use turn. If it's a `todo set` AND
//   it lands before any other tool, count it as PLANNED. If a non-todo tool
//   fires first, count it as ACTED. If todo never fires, count NEVER.

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'studio', 'factor-db.sqlite');

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    if (!a.startsWith('--')) return [a, true];
    const [k, v] = a.slice(2).split('=');
    return [k, v ?? true];
  })
);

const db = new Database(DB_PATH, { readonly: true });

function fmt(n) { return typeof n === 'number' ? n.toLocaleString() : String(n); }
function tsLocal(ms) { return new Date(ms).toISOString().slice(5, 19).replace('T', ' '); }
function clip(s, n) {
  if (s == null) return '';
  const str = String(s);
  return str.length > n ? str.slice(0, n) + '…' : str;
}

if (args.session) {
  const turns = db.prepare(`
    SELECT * FROM meph_turns WHERE session_id = ?
    ORDER BY turn_index ASC, id ASC
  `).all(String(args.session));
  if (turns.length === 0) {
    console.log(`No turns for session "${args.session}".`);
    process.exit(0);
  }
  console.log(`# Session ${args.session}`);
  console.log(`${turns.length} turn(s), ${tsLocal(turns[0].created_at)} → ${tsLocal(turns[turns.length-1].created_at)}\n`);
  for (const t of turns) {
    const trunc = t.truncated ? ' [truncated]' : '';
    const icon =
      t.role === 'user' ? '👤' :
      t.role === 'assistant_thinking' ? '💭' :
      t.role === 'assistant_text' ? '💬' :
      t.role === 'tool_use' ? '🔧' :
      t.role === 'tool_result' ? '✓' :
      t.role === 'snap_retry' ? '↻' : '·';
    const head = `${icon} #${t.turn_index} ${t.role}${t.tool_name ? ` (${t.tool_name})` : ''}${trunc}`;
    console.log(head);
    const body = t.message_text || t.tool_input || t.tool_result || '';
    if (body) console.log('  ' + clip(body, 400).replace(/\n/g, '\n  '));
    console.log('');
  }
}
else if (args.recent) {
  const n = Number(args.recent) || 20;
  const sessions = db.prepare(`
    SELECT session_id,
           COUNT(*) AS turns,
           MIN(created_at) AS started,
           MAX(created_at) AS ended,
           SUM(CASE WHEN role='tool_use' THEN 1 ELSE 0 END) AS tool_calls
    FROM meph_turns
    GROUP BY session_id
    ORDER BY MAX(created_at) DESC
    LIMIT ?
  `).all(n);
  console.log(`# Most recent ${sessions.length} session(s) with trace data\n`);
  console.log('| session | turns | tool calls | when |');
  console.log('|---|---|---|---|');
  for (const s of sessions) {
    console.log(`| \`${s.session_id}\` | ${fmt(s.turns)} | ${fmt(s.tool_calls)} | ${tsLocal(s.started)} |`);
  }
}
else if (args.stats) {
  const since = Number(args.since) || null;
  let where = '';
  const params = [];
  if (since) { where = 'WHERE created_at >= ?'; params.push(since); }
  const total = db.prepare(`SELECT COUNT(*) AS n FROM meph_turns ${where}`).get(...params).n;
  const sessions = db.prepare(`SELECT COUNT(DISTINCT session_id) AS n FROM meph_turns ${where}`).get(...params).n;
  const byRole = db.prepare(`
    SELECT role, COUNT(*) AS n FROM meph_turns ${where}
    GROUP BY role ORDER BY n DESC
  `).all(...params);
  const toolWhere = where ? where + ' AND' : 'WHERE';
  const byTool = db.prepare(`
    SELECT tool_name, COUNT(*) AS n FROM meph_turns
    ${toolWhere} role = 'tool_use' AND tool_name IS NOT NULL
    GROUP BY tool_name ORDER BY n DESC
  `).all(...params);
  console.log('# meph_turns stats\n');
  console.log(`- Total turns: **${fmt(total)}**`);
  console.log(`- Distinct sessions: **${fmt(sessions)}**\n`);
  console.log('## By role\n');
  for (const r of byRole) console.log(`- ${r.role}: ${fmt(r.n)}`);
  console.log('\n## Tool calls by name\n');
  for (const r of byTool) console.log(`- ${r.tool_name}: ${fmt(r.n)}`);
}
else if (args['todo-probe']) {
  // For each session that emitted any tool_use rows, find the FIRST tool_use
  // (by turn_index). Bucket: PLANNED if it's a `todo set`, ACTED if any other
  // tool, NEVER if no todo turn ever fires.
  const firstTools = db.prepare(`
    SELECT t.session_id, t.tool_name, t.tool_input
    FROM meph_turns t
    INNER JOIN (
      SELECT session_id, MIN(turn_index) AS first_idx
      FROM meph_turns
      WHERE role = 'tool_use'
      GROUP BY session_id
    ) f ON t.session_id = f.session_id AND t.turn_index = f.first_idx
    WHERE t.role = 'tool_use'
  `).all();

  const sessionsWithTodoEver = new Set(
    db.prepare(`SELECT DISTINCT session_id FROM meph_turns WHERE role='tool_use' AND tool_name='todo'`)
      .all().map(r => r.session_id)
  );

  let planned = 0, acted = 0;
  let plannedSet = 0, plannedGet = 0;
  for (const r of firstTools) {
    if (r.tool_name === 'todo') {
      planned++;
      try {
        const inp = JSON.parse(r.tool_input);
        if (inp?.action === 'set') plannedSet++;
        else if (inp?.action === 'get') plannedGet++;
      } catch { /* unparseable input — count as planned regardless */ }
    } else acted++;
  }
  const totalSessions = firstTools.length;
  const allTraceSessions = db.prepare(`SELECT COUNT(DISTINCT session_id) AS n FROM meph_turns`).get().n;
  const neverTodo = allTraceSessions - sessionsWithTodoEver.size;

  console.log('# todo-probe: did Meph plan before acting?\n');
  console.log(`Sessions with any tool call: **${totalSessions}**`);
  console.log(`Sessions with any trace data: **${allTraceSessions}**\n`);
  console.log(`- 📋 PLANNED (first tool was \`todo\`): **${planned}** (${pct(planned, totalSessions)}%)`);
  console.log(`  - of those, \`todo set\` (writing the list): ${plannedSet}`);
  console.log(`  - \`todo get\` (reading): ${plannedGet}`);
  console.log(`- ⚡ ACTED (first tool was something else): **${acted}** (${pct(acted, totalSessions)}%)`);
  console.log(`- 🚫 NEVER touched todo across the whole session: **${neverTodo}** (${pct(neverTodo, allTraceSessions)}%)`);
  console.log('');
  console.log('A high PLANNED + high todo-set fraction = real planning.');
  console.log('A high ACTED + low todo-ever fraction = the tool is decoration.');
}
else {
  console.log('Usage:');
  console.log('  --session=<id>     pretty-print every turn for one session');
  console.log('  --recent=<N>       list N most recent sessions with trace data');
  console.log('  --stats            aggregate counts by role / tool');
  console.log('  --stats --since=<ms>   stats over a time window');
  console.log('  --todo-probe       answer "did Meph plan before acting?"');
}

db.close();

function pct(n, total) {
  if (!total) return '0';
  return ((n / total) * 100).toFixed(1);
}
