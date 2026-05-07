import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { parse } from '../../parser.js';
import { computeShape, shapeSimilarity } from './program-shape.js';

// Roles for the meph_turns trace table. Locked here so the test file and
// the chat handler agree on what's valid.
const VALID_TURN_ROLES = new Set([
  'user',                // user prompt that started this turn
  'assistant_text',      // Meph's prose reply
  'assistant_thinking',  // Meph's thinking block (extended-thinking models)
  'tool_use',            // Meph called a tool — input lives in tool_input
  'tool_result',         // tool returned — output lives in tool_result
  'snap_retry',          // snap-layer re-prompt event
]);
const TURN_TRUNC_BYTES = 4096;
const SNIPPET_STOP_WORDS = new Set([
  'build', 'clear', 'javascript', 'backend', 'python', 'web', 'for', 'with',
  'the', 'and', 'that', 'this', 'when', 'user', 'calls', 'sends', 'send',
  'back', 'create', 'table', 'page', 'section', 'text', 'required', 'default',
  'login', 'api', 'get', 'post', 'put', 'delete', 'all', 'new', 'save',
]);

function sha1Short(str) {
  return createHash('sha1').update(String(str || '')).digest('hex').slice(0, 16);
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function safeShapeFromSource(source) {
  try { return computeShape(parse(String(source || ''))); }
  catch { return computeShape(null); }
}

function normalizeTokens(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9_/-]+/)
    .filter(t => t.length > 1);
}

function canonicalToken(token) {
  const t = String(token || '').toLowerCase();
  if (t.endsWith('ies') && t.length > 4) return `${t.slice(0, -3)}y`;
  if (t.endsWith('es') && t.length > 4) return t.slice(0, -2);
  if (t.endsWith('s') && t.length > 3) return t.slice(0, -1);
  return t;
}

function snippetTerms(query, querySource) {
  const raw = [
    ...normalizeTokens(query),
    ...normalizeTokens(querySource).filter(t => !['is', 'to', 'as', 'of'].includes(t)),
  ];
  const terms = new Set();
  for (const token of raw) {
    const term = canonicalToken(token);
    if (!SNIPPET_STOP_WORDS.has(term) && term.length >= 3) terms.add(term);
  }
  return [...terms].slice(0, 32);
}

function pickSourceExcerpt(source, { query = '', querySource = '', maxChars = 1200, radius = 5 } = {}) {
  const src = String(source || '');
  const lines = src.split(/\r?\n/);
  if (lines.length === 0) return { source_excerpt: '', source_excerpt_start_line: 1, source_excerpt_end_line: 1 };
  const terms = snippetTerms(query, querySource);
  let bestIndex = 0;
  let bestScore = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineTokens = new Set(normalizeTokens(lines[i]).map(canonicalToken));
    let score = 0;
    for (const term of terms) {
      if (lineTokens.has(term)) score += 2;
      else if (lines[i].toLowerCase().includes(term)) score += 1;
    }
    if (/^\s*(rule|agent|queue|when user|display|detail panel|create a .+ table)\b/i.test(lines[i])) score += 0.5;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  let start = Math.max(0, bestIndex - radius);
  let end = Math.min(lines.length - 1, bestIndex + radius);
  while (end > start && lines.slice(start, end + 1).join('\n').length > maxChars) {
    if (bestIndex - start > end - bestIndex) start++;
    else end--;
  }
  return {
    source_excerpt: lines.slice(start, end + 1).join('\n'),
    source_excerpt_start_line: start + 1,
    source_excerpt_end_line: end + 1,
  };
}

function textMatchScore(row, query) {
  const terms = normalizeTokens(query);
  if (terms.length === 0) return 0;
  const haystack = normalizeTokens([
    row.template_name,
    row.pattern_set,
    row.title,
    row.description,
    row.archetype,
    Array.isArray(row.feature_tags) ? row.feature_tags.join(' ') : row.feature_tags,
  ].join(' '));
  const bag = new Set(haystack);
  let hits = 0;
  for (const term of terms) if (bag.has(term)) hits++;
  return hits / terms.length;
}

function shapeFromInput({ source = '', shape_signature = null } = {}) {
  if (shape_signature) {
    if (typeof shape_signature === 'string') return parseJson(shape_signature, safeShapeFromSource(source));
    return shape_signature;
  }
  return safeShapeFromSource(source);
}

function normalizePatternRow(row) {
  if (!row) return row;
  return {
    ...row,
    shape_signature: parseJson(row.shape_signature, null),
    feature_tags: parseJson(row.feature_tags, []),
  };
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS code_actions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id       TEXT NOT NULL,
  task_type        TEXT,
  archetype        TEXT,
  error_sig        TEXT,
  file_state_hash  TEXT,
  source_before    TEXT,
  patch_ops        TEXT NOT NULL DEFAULT '[]',
  patch_summary    TEXT,
  compile_ok       INTEGER NOT NULL DEFAULT 0,
  test_pass        INTEGER NOT NULL DEFAULT 0,
  test_score       REAL NOT NULL DEFAULT 0.0,
  score_delta      REAL DEFAULT 0.0,
  step_id          TEXT,
  step_index       INTEGER,
  step_name        TEXT,
  embedding        BLOB,
  -- Hint-usage tracking. NULL = no hints were in the compile result for this
  -- row. Populated from Meph's HINT_APPLIED tag in his response text.
  hint_applied     INTEGER,        -- 1 = Meph used a hint, 0 = hints present but skipped, NULL = no hints
  hint_tier        TEXT,           -- exact tier label Meph cited (or NULL)
  hint_helpful     TEXT,           -- yes|no|partial (or NULL)
  hint_reason      TEXT,           -- short reason when applied=0 (or NULL)
  created_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_type   ON code_actions(task_type);
CREATE INDEX IF NOT EXISTS idx_archetype   ON code_actions(archetype);
CREATE INDEX IF NOT EXISTS idx_error_sig   ON code_actions(error_sig);
CREATE INDEX IF NOT EXISTS idx_test_pass   ON code_actions(test_pass, test_score DESC);
CREATE INDEX IF NOT EXISTS idx_created_at  ON code_actions(created_at);
-- idx_step is created after migration (below), because on existing DBs the
-- step_index column doesn't exist yet when this SCHEMA block runs.

CREATE TABLE IF NOT EXISTS reranker_feedback (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  action_id     INTEGER REFERENCES code_actions(id),
  was_used      INTEGER DEFAULT 0,
  outcome_score REAL,
  ts            INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ga_runs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT NOT NULL,
  task            TEXT,
  generation      INTEGER DEFAULT 0,
  best_score      REAL DEFAULT 0.0,
  population_size INTEGER NOT NULL,
  status          TEXT DEFAULT 'running',
  clear_version   TEXT,
  created_at      INTEGER NOT NULL,
  completed_at    INTEGER
);

CREATE TABLE IF NOT EXISTS ga_candidates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          INTEGER NOT NULL REFERENCES ga_runs(id),
  generation      INTEGER NOT NULL,
  parent_ids      TEXT,
  origin          TEXT NOT NULL,
  patch_ops       TEXT NOT NULL DEFAULT '[]',
  patch_summary   TEXT,
  source          TEXT,
  compile_ok      INTEGER DEFAULT 0,
  test_score      REAL DEFAULT 0.0,
  test_pass       INTEGER DEFAULT 0,
  warnings_count  INTEGER DEFAULT 0,
  source_length   INTEGER DEFAULT 0,
  novelty_score   REAL DEFAULT 0.0,
  reranker_score  REAL DEFAULT 0.0,
  pareto_rank     INTEGER DEFAULT 0,
  created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ga_run_id ON ga_candidates(run_id, generation);
CREATE INDEX IF NOT EXISTS idx_ga_pareto ON ga_candidates(run_id, pareto_rank, test_score DESC);
CREATE INDEX IF NOT EXISTS idx_ga_status ON ga_runs(status, created_at);

-- Runtime beacons from compiled Clear apps. Receiver:
-- POST /api/flywheel/beacon → both appends a JSONL line (legacy backup)
-- AND inserts here. Lets the friction script join compile-time code_actions
-- rows with the runtime errors / latencies they produced in production.
CREATE TABLE IF NOT EXISTS code_actions_runtime (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  compile_row_id  INTEGER,                 -- nullable: links to code_actions.id when known
  event_type      TEXT NOT NULL,           -- 'endpoint_latency' | 'endpoint_error' | …
  route           TEXT,                    -- e.g. '/api/deals/pending'
  method          TEXT,                    -- HTTP method when event has one
  status_code     INTEGER,                 -- HTTP status when event has one
  latency_ms      REAL,                    -- request latency in ms (nullable)
  error_text      TEXT,                    -- error message snippet when event_type is an error
  source_hash     TEXT,                    -- hash of the .clear source the running app was compiled from
  raw             TEXT,                    -- full JSON of the original beacon payload for debugging
  received_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runtime_compile_row ON code_actions_runtime(compile_row_id, received_at);
CREATE INDEX IF NOT EXISTS idx_runtime_event_type  ON code_actions_runtime(event_type, received_at);
CREATE INDEX IF NOT EXISTS idx_runtime_route       ON code_actions_runtime(route, status_code);

-- Compiler-edit ledger. Every time a compile error message in compiler.js
-- or validator.js gets rewritten, a row lands here with before/after text.
-- The friction script can then JOIN: did rewriting this error message reduce
-- the friction count in subsequent sweeps? Lets us measure the OUTER
-- improvement loop (compiler-quality edits) the same way we measure the
-- INNER loop (Meph hint retrieval).
CREATE TABLE IF NOT EXISTS compiler_edits (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  commit_sha    TEXT NOT NULL,
  file_path     TEXT NOT NULL,
  edit_kind     TEXT NOT NULL,             -- 'error_message' | 'hint' | 'syntax' | other
  before_text   TEXT,
  after_text    TEXT,
  context       TEXT,                       -- function name or surrounding block, optional
  authored_at   INTEGER NOT NULL,
  recorded_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_compiler_edits_sha   ON compiler_edits(commit_sha);
CREATE INDEX IF NOT EXISTS idx_compiler_edits_kind  ON compiler_edits(edit_kind, authored_at);
CREATE INDEX IF NOT EXISTS idx_compiler_edits_file  ON compiler_edits(file_path, authored_at);

-- Curated Clear programming-pattern memory. Seeded from the 13 canonical
-- app templates (8 core + 5 Marcus). Meph searches this table by program
-- shape and plain-English query, then pulls the matching Clear source.
CREATE TABLE IF NOT EXISTS clear_programming_patterns (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  template_name    TEXT NOT NULL UNIQUE,
  pattern_set      TEXT NOT NULL,           -- core | marcus | future curated set
  title            TEXT NOT NULL,
  description      TEXT,
  archetype        TEXT,
  shape_signature  TEXT NOT NULL,           -- JSON from program-shape.js
  feature_tags     TEXT NOT NULL DEFAULT '[]',
  source           TEXT NOT NULL,
  source_hash      TEXT NOT NULL,
  line_count       INTEGER NOT NULL DEFAULT 0,
  updated_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clear_patterns_set ON clear_programming_patterns(pattern_set, archetype);
CREATE INDEX IF NOT EXISTS idx_clear_patterns_archetype ON clear_programming_patterns(archetype);

-- Meph turn trace. One row per conversation event: user prompt, assistant
-- prose, assistant thinking, tool_use, tool_result. Joins to code_actions
-- via session_id. Lets research probes ask "did Meph plan with the todo
-- tool before acting", "which tools correlate with success", etc., without
-- needing to instrument fresh sweeps. Big payloads truncate at TURN_TRUNC_BYTES
-- with truncated=1; full_hash is the SHA1 of the original untruncated content
-- so we can dedupe and confirm a record matches a specific app source state.
CREATE TABLE IF NOT EXISTS meph_turns (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT NOT NULL,
  turn_index      INTEGER NOT NULL,
  role            TEXT NOT NULL,
  tool_name       TEXT,
  tool_use_id     TEXT,
  tool_input      TEXT,
  tool_result     TEXT,
  message_text    TEXT,
  full_hash       TEXT,
  truncated       INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_turns_session ON meph_turns(session_id, turn_index);
CREATE INDEX IF NOT EXISTS idx_turns_tool    ON meph_turns(tool_name, created_at);
CREATE INDEX IF NOT EXISTS idx_turns_use_id  ON meph_turns(tool_use_id);
`;

export class FactorDB {
  constructor(dbPath) {
    this._db = new Database(dbPath);
    this._db.pragma('journal_mode = WAL');
    this._db.pragma('synchronous = NORMAL');
    this._db.exec(SCHEMA);
    // Migration: add archetype column if upgrading from pre-archetype schema
    const cols = this._db.prepare('PRAGMA table_info(code_actions)').all();
    if (!cols.some(c => c.name === 'archetype')) {
      this._db.exec('ALTER TABLE code_actions ADD COLUMN archetype TEXT');
      this._db.exec('CREATE INDEX IF NOT EXISTS idx_archetype ON code_actions(archetype)');
    }
    // Migration: add step_id/step_index/step_name columns (step-decomposition, feature/rl).
    // Existing rows keep NULL step values — they just won't contribute to per-step stats.
    if (!cols.some(c => c.name === 'step_id')) {
      this._db.exec('ALTER TABLE code_actions ADD COLUMN step_id TEXT');
      this._db.exec('ALTER TABLE code_actions ADD COLUMN step_index INTEGER');
      this._db.exec('ALTER TABLE code_actions ADD COLUMN step_name TEXT');
    }
    // Create idx_step after migration so it's safe on both fresh + migrated DBs.
    // On a fresh DB, step_index was created by the SCHEMA CREATE TABLE above.
    // On an existing DB, it was just added by the ALTER statements.
    this._db.exec('CREATE INDEX IF NOT EXISTS idx_step ON code_actions(task_type, step_index, test_pass)');
    // Migration: hint-usage tracking columns. Existing rows get NULL — they
    // predate the tracking system and that's fine; new rows populate as
    // Meph emits HINT_APPLIED tags.
    if (!cols.some(c => c.name === 'hint_applied')) {
      this._db.exec('ALTER TABLE code_actions ADD COLUMN hint_applied INTEGER');
      this._db.exec('ALTER TABLE code_actions ADD COLUMN hint_tier TEXT');
      this._db.exec('ALTER TABLE code_actions ADD COLUMN hint_helpful TEXT');
      this._db.exec('ALTER TABLE code_actions ADD COLUMN hint_reason TEXT');
    }
  }

  // Update hint-usage columns on an existing row. Called by the server after
  // it parses HINT_APPLIED from Meph's response text for the compile cycle
  // that surfaced hints. `applied` is 0/1; tier/helpful/reason may be null.
  logHintUsage(rowId, { applied = null, tier = null, helpful = null, reason = null } = {}) {
    if (!rowId) return;
    this._db.prepare(
      `UPDATE code_actions SET hint_applied = ?, hint_tier = ?, hint_helpful = ?, hint_reason = ? WHERE id = ?`
    ).run(
      applied === null ? null : (applied ? 1 : 0),
      tier,
      helpful,
      reason,
      rowId
    );
  }

  upsertProgrammingPattern({
    template_name,
    pattern_set = 'core',
    title = '',
    description = '',
    archetype = null,
    shape_signature = null,
    feature_tags = [],
    source = '',
  } = {}) {
    const name = String(template_name || '').trim();
    const src = String(source || '');
    if (!name || src.length === 0) return null;
    const shape = shape_signature || safeShapeFromSource(src);
    const normalizedArchetype = archetype || shape?.archetype || 'general';
    const tags = Array.isArray(feature_tags) ? feature_tags : normalizeTokens(feature_tags);
    const lineCount = src.split('\n').filter(l => l.trim()).length;
    const result = this._db.prepare(`
      INSERT INTO clear_programming_patterns
        (template_name, pattern_set, title, description, archetype,
         shape_signature, feature_tags, source, source_hash, line_count, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(template_name) DO UPDATE SET
        pattern_set = excluded.pattern_set,
        title = excluded.title,
        description = excluded.description,
        archetype = excluded.archetype,
        shape_signature = excluded.shape_signature,
        feature_tags = excluded.feature_tags,
        source = excluded.source,
        source_hash = excluded.source_hash,
        line_count = excluded.line_count,
        updated_at = excluded.updated_at
    `).run(
      name,
      String(pattern_set || 'core'),
      String(title || name),
      String(description || ''),
      String(normalizedArchetype || 'general'),
      JSON.stringify(shape),
      JSON.stringify(tags),
      src,
      sha1Short(src),
      lineCount,
      Date.now()
    );
    return result.lastInsertRowid || this._db.prepare(
      'SELECT id FROM clear_programming_patterns WHERE template_name = ?'
    ).get(name)?.id || null;
  }

  listProgrammingPatterns({ pattern_set = null } = {}) {
    let sql = 'SELECT * FROM clear_programming_patterns';
    const params = [];
    if (pattern_set) {
      sql += ' WHERE pattern_set = ?';
      params.push(String(pattern_set));
    }
    sql += ' ORDER BY pattern_set, template_name';
    return this._db.prepare(sql).all(...params).map(normalizePatternRow);
  }

  queryProgrammingPatterns({ source = '', shape_signature = null, query = '', topK = 3, pattern_set = null } = {}) {
    const queryShape = shapeFromInput({ source, shape_signature });
    let sql = 'SELECT * FROM clear_programming_patterns';
    const params = [];
    if (pattern_set) {
      sql += ' WHERE pattern_set = ?';
      params.push(String(pattern_set));
    }
    const rows = this._db.prepare(sql).all(...params).map(normalizePatternRow);
    const scored = rows.map(row => {
      const shapeScore = shapeSimilarity(queryShape, row.shape_signature);
      const queryScore = textMatchScore(row, query);
      const excerpt = pickSourceExcerpt(row.source, { query, querySource: source });
      return {
        ...row,
        ...excerpt,
        tier: 'canonical_pattern',
        shape_score: shapeScore,
        query_score: queryScore,
        score: shapeScore + queryScore,
      };
    });
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.shape_score !== a.shape_score) return b.shape_score - a.shape_score;
      return String(a.template_name).localeCompare(String(b.template_name));
    });
    return scored.slice(0, Math.max(1, Number(topK) || 3));
  }

  logAction({ session_id, task_type = null, archetype = null, error_sig = null, file_state_hash = null,
    source_before = '', patch_ops = [], patch_summary = null,
    compile_ok = 0, test_pass = 0, test_score = 0.0, score_delta = 0.0,
    step_id = null, step_index = null, step_name = null }) {
    const now = Date.now();
    const result = this._db.prepare(`
      INSERT INTO code_actions
        (session_id, task_type, archetype, error_sig, file_state_hash, source_before,
         patch_ops, patch_summary, compile_ok, test_pass, test_score, score_delta,
         step_id, step_index, step_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(session_id, task_type, archetype, error_sig, file_state_hash, source_before,
      JSON.stringify(patch_ops), patch_summary, compile_ok ? 1 : 0,
      test_pass ? 1 : 0, test_score, score_delta,
      step_id, step_index, step_name, now);
    return result.lastInsertRowid;
  }

  getAction(id) {
    const row = this._db.prepare('SELECT * FROM code_actions WHERE id = ?').get(id);
    if (!row) return null;
    try { row.patch_ops = JSON.parse(row.patch_ops); } catch {}
    return row;
  }

  // BM25-style retrieval: filter by archetype/task_type/error_sig, rank by test_score
  querySimilar({ archetype = null, task_type = null, error_sig = null, topK = 10 } = {}) {
    let sql = 'SELECT * FROM code_actions WHERE 1=1';
    const params = [];
    if (archetype) { sql += ' AND archetype = ?'; params.push(archetype); }
    if (task_type) { sql += ' AND task_type = ?'; params.push(task_type); }
    if (error_sig) { sql += ' AND error_sig = ?'; params.push(error_sig); }
    sql += ' ORDER BY test_score DESC LIMIT ?';
    params.push(topK);
    return this._db.prepare(sql).all(...params);
  }

  // Hint retrieval for compile errors. Layered fallback — best match first,
  // graceful degradation as specificity drops. Returns up to topK rows with
  // a `source` tag indicating which tier matched.
  //
  //   Tier 1: same error_sig, session that LATER compiled clean in same archetype
  //           → "this exact error was fixed in a similar app"
  //   Tier 2: same error_sig, session that LATER compiled clean (any archetype)
  //           → "this exact error was fixed somewhere"
  //   Tier 3: same archetype + compile_ok=1 + test_pass=1
  //           → "here are working apps of the same shape" (v1 fallback)
  //
  // Never returns the same source row twice. Exact-error fixes do NOT get
  // padded with generic same-archetype examples; generic examples only fire
  // when no exact-error fix exists. That keeps weak hints out of Meph's prompt
  // and keeps measurement honest.
  querySuggestions({ archetype = null, error_sig = null, topK = 3 } = {}) {
    const seen = new Set();
    const results = [];

    const addRow = (row, tier) => {
      if (!row || seen.has(row.id)) return;
      seen.add(row.id);
      results.push({ ...row, tier });
    };

    // Tier 1 + 2: find sessions that hit error_sig, then grab their NEXT
    // successful compile in the same session. Strong signal — "how was this
    // specific error actually resolved?"
    if (error_sig) {
      const sameArchetypeFixes = [];
      const crossArchetypeFixes = [];
      const failingSessions = this._db.prepare(`
        SELECT DISTINCT session_id, created_at
        FROM code_actions
        WHERE error_sig = ? AND compile_ok = 0
        ORDER BY created_at DESC
        LIMIT 20
      `).all(error_sig);

      for (const fs of failingSessions) {
        if (results.length >= topK) break;
        // Find next compile_ok=1 row in the same session after the failure.
        // Require source_before > 50 chars — the worktree-incident recovery
        // from JSONL left many rows with empty source_before, and a hint with
        // no code to pattern-match from is label-only noise for Meph.
        const fix = this._db.prepare(`
          SELECT * FROM code_actions
          WHERE session_id = ? AND created_at > ? AND compile_ok = 1
            AND source_before IS NOT NULL AND LENGTH(source_before) > 50
          ORDER BY created_at ASC
          LIMIT 1
        `).get(fs.session_id, fs.created_at);
        if (fix) {
          const tier = archetype && fix.archetype === archetype ? 'exact_error_same_archetype' : 'exact_error';
          if (tier === 'exact_error_same_archetype') sameArchetypeFixes.push(fix);
          else crossArchetypeFixes.push(fix);
        }
      }
      for (const fix of sameArchetypeFixes) {
        if (results.length >= topK) break;
        addRow(fix, 'exact_error_same_archetype');
      }
      for (const fix of crossArchetypeFixes) {
        if (results.length >= topK) break;
        addRow(fix, 'exact_error');
      }
    }

    // Tier 3: archetype fallback. Only gold rows (compile AND test passed)
    // with non-empty source to show Meph. Only used when no exact-error fix
    // exists; otherwise it pads good evidence with generic noise.
    if (archetype && results.length === 0) {
      const need = Math.min(topK, 2);
      const golds = this._db.prepare(`
        SELECT * FROM code_actions
        WHERE archetype = ? AND compile_ok = 1 AND test_pass = 1
          AND source_before IS NOT NULL AND LENGTH(source_before) > 50
        ORDER BY test_score DESC, created_at DESC
        LIMIT ?
      `).all(archetype, need * 3); // fetch more, filter seen
      for (const g of golds) {
        if (results.length >= topK) break;
        addRow(g, 'same_archetype_gold');
      }
    }

    return results;
  }

  stats() {
    const total = this._db.prepare('SELECT COUNT(*) AS n FROM code_actions').get().n;
    const passing = this._db.prepare('SELECT COUNT(*) AS n FROM code_actions WHERE test_pass = 1').get().n;
    return { total, passing };
  }

  // Per-step rollup for sweep reports. Returns one row per (task_type, step_index, step_name)
  // with compile/test pass counts. Null step rows (pre-step-decomp, or tasks without steps)
  // get grouped under step_index = NULL. Scope by `sessionIds` or `sinceMs` so each sweep
  // can report just its own rows.
  stepStats({ sessionIds = null, sinceMs = null } = {}) {
    let sql = `
      SELECT task_type, step_index, step_name,
             COUNT(*) AS attempts,
             SUM(compile_ok) AS compiles_ok,
             SUM(test_pass) AS tests_passed
      FROM code_actions
      WHERE 1=1
    `;
    const params = [];
    if (Array.isArray(sessionIds) && sessionIds.length > 0) {
      const placeholders = sessionIds.map(() => '?').join(',');
      sql += ` AND session_id IN (${placeholders})`;
      params.push(...sessionIds);
    }
    if (typeof sinceMs === 'number' && sinceMs > 0) {
      sql += ' AND created_at >= ?';
      params.push(sinceMs);
    }
    sql += ' GROUP BY task_type, step_index, step_name ORDER BY task_type, step_index';
    return this._db.prepare(sql).all(...params);
  }

  createGARun({ session_id, task = null, population_size, clear_version = null }) {
    const result = this._db.prepare(`
      INSERT INTO ga_runs (session_id, task, population_size, clear_version, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(session_id, task, population_size, clear_version, Date.now());
    return result.lastInsertRowid;
  }

  updateGARun(runId, fields) {
    const allowed = ['generation', 'best_score', 'status', 'completed_at'];
    const updates = Object.entries(fields).filter(([k]) => allowed.includes(k)).map(([k]) => `${k} = ?`);
    const values = Object.entries(fields).filter(([k]) => allowed.includes(k)).map(([, v]) => v);
    if (updates.length === 0) return;
    this._db.prepare(`UPDATE ga_runs SET ${updates.join(', ')} WHERE id = ?`).run(...values, runId);
  }

  logGACandidate({ run_id, generation, parent_ids = null, origin,
    patch_ops = [], patch_summary = null, source = null,
    compile_ok = 0, test_score = 0.0, test_pass = 0,
    warnings_count = 0, source_length = 0,
    novelty_score = 0.0, reranker_score = 0.0, pareto_rank = 0 }) {
    const result = this._db.prepare(`
      INSERT INTO ga_candidates
        (run_id, generation, parent_ids, origin, patch_ops, patch_summary, source,
         compile_ok, test_score, test_pass, warnings_count, source_length,
         novelty_score, reranker_score, pareto_rank, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(run_id, generation, parent_ids ? JSON.stringify(parent_ids) : null, origin,
      JSON.stringify(patch_ops), patch_summary, source,
      compile_ok ? 1 : 0, test_score, test_pass ? 1 : 0,
      warnings_count, source_length, novelty_score, reranker_score, pareto_rank, Date.now());
    return result.lastInsertRowid;
  }

  getGACandidates(runId, generation = null) {
    let sql = 'SELECT * FROM ga_candidates WHERE run_id = ?';
    const params = [runId];
    if (generation !== null) { sql += ' AND generation = ?'; params.push(generation); }
    sql += ' ORDER BY test_score DESC';
    return this._db.prepare(sql).all(...params);
  }

  logRerankerFeedback({ action_id, was_used = 0, outcome_score = null }) {
    this._db.prepare(`
      INSERT INTO reranker_feedback (action_id, was_used, outcome_score, ts)
      VALUES (?, ?, ?, ?)
    `).run(action_id, was_used ? 1 : 0, outcome_score, Date.now());
  }

  // Runtime beacon ingest. Called from /api/flywheel/beacon AFTER the JSONL
  // append, so the JSONL stays the durable backup and the DB row is the
  // queryable copy. `compile_row_id` is the code_actions.id of the compile
  // that produced the running app — links runtime errors back to source.
  logRuntimeBeacon(ev = {}) {
    const compileRowId = Number.isFinite(ev.compile_row_id) ? ev.compile_row_id : null;
    const eventType = String(ev.event_type || '').slice(0, 64);
    if (!eventType) return null;
    const route = ev.route ? String(ev.route).slice(0, 256) : null;
    const method = ev.method ? String(ev.method).slice(0, 16) : null;
    const statusCode = Number.isFinite(ev.status_code) ? ev.status_code : null;
    const latencyMs = Number.isFinite(ev.latency_ms) ? Number(ev.latency_ms) : null;
    const errorText = ev.error_text ? String(ev.error_text).slice(0, 2000) : null;
    const sourceHash = ev.source_hash ? String(ev.source_hash).slice(0, 128) : null;
    let raw = null;
    try { raw = JSON.stringify(ev); } catch { raw = null; }
    const result = this._db.prepare(`
      INSERT INTO code_actions_runtime
        (compile_row_id, event_type, route, method, status_code,
         latency_ms, error_text, source_hash, raw, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(compileRowId, eventType, route, method, statusCode,
      latencyMs, errorText, sourceHash, raw, Date.now());
    return result.lastInsertRowid;
  }

  // Compiler-edit ledger. Called from scripts/log-compiler-edits.mjs (the
  // post-commit hook). One row per error message rewritten in compiler.js
  // or validator.js. Lets the friction script later answer:
  // "did rewriting this message reduce its friction count in subsequent sweeps?"
  logCompilerEdit({ commit_sha, file_path, edit_kind = 'error_message',
    before_text = null, after_text = null, context = null, authored_at = null }) {
    if (!commit_sha || !file_path) return null;
    const ts = authored_at || Date.now();
    const result = this._db.prepare(`
      INSERT INTO compiler_edits
        (commit_sha, file_path, edit_kind, before_text, after_text, context,
         authored_at, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(String(commit_sha), String(file_path), String(edit_kind),
      before_text, after_text, context, ts, Date.now());
    return result.lastInsertRowid;
  }

  // Read helper for the friction script: list compiler edits since a date.
  // Order: most recent authored_at first, breaking ties by insertion order
  // (id DESC) so two edits in the same millisecond return the later-inserted
  // one first — matches user expectation of "show me what just changed."
  recentCompilerEdits({ sinceMs = null, kind = null } = {}) {
    let sql = 'SELECT * FROM compiler_edits WHERE 1=1';
    const params = [];
    if (sinceMs) { sql += ' AND authored_at >= ?'; params.push(sinceMs); }
    if (kind)    { sql += ' AND edit_kind = ?';    params.push(kind); }
    sql += ' ORDER BY authored_at DESC, id DESC LIMIT 500';
    return this._db.prepare(sql).all(...params);
  }

  // Read helper for runtime beacons keyed by compile row.
  runtimeBeaconsForCompile(compileRowId, { limit = 100 } = {}) {
    return this._db.prepare(`
      SELECT * FROM code_actions_runtime
      WHERE compile_row_id = ?
      ORDER BY received_at DESC
      LIMIT ?
    `).all(compileRowId, limit);
  }

  // Append one row to meph_turns. Each conversation event (user prompt,
  // assistant text/thinking, tool_use, tool_result) is a separate row keyed
  // by (session_id, turn_index). Big payloads truncate at TURN_TRUNC_BYTES;
  // full_hash captures the original content so dedup + DB joins still work.
  // Throws on unknown role so a typo in the chat handler surfaces immediately
  // rather than silently logging junk rows.
  logTurn({ session_id, turn_index, role, tool_name = null, tool_use_id = null,
    tool_input = null, tool_result = null, message_text = null }) {
    if (!session_id) throw new Error('logTurn: session_id required');
    if (!Number.isFinite(turn_index)) throw new Error('logTurn: turn_index must be a number');
    if (!VALID_TURN_ROLES.has(role)) {
      throw new Error(`logTurn: unknown role "${role}" — valid: ${[...VALID_TURN_ROLES].join(', ')}`);
    }

    let truncated = 0;
    const trunc = (val) => {
      if (val == null) return null;
      const str = typeof val === 'string' ? val : JSON.stringify(val);
      if (str.length > TURN_TRUNC_BYTES) {
        truncated = 1;
        return str.slice(0, TURN_TRUNC_BYTES) + '...[TRUNCATED]';
      }
      return str;
    };

    const toolInputStr = trunc(tool_input);
    const toolResultStr = trunc(tool_result);
    const messageTextStr = trunc(message_text);

    // Hash the FULL untruncated content so we can dedupe / join even when
    // we only stored the truncated form. Empty payloads → null.
    let full_hash = null;
    const fullPayload = JSON.stringify({
      tool_input: tool_input ?? null,
      tool_result: tool_result ?? null,
      message_text: message_text ?? null,
    });
    if (fullPayload.length > 2) { // not just '{}'
      full_hash = createHash('sha1').update(fullPayload).digest('hex');
    }

    const result = this._db.prepare(`
      INSERT INTO meph_turns
        (session_id, turn_index, role, tool_name, tool_use_id,
         tool_input, tool_result, message_text, full_hash, truncated, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(session_id), Number(turn_index), String(role),
      tool_name ? String(tool_name) : null,
      tool_use_id ? String(tool_use_id) : null,
      toolInputStr, toolResultStr, messageTextStr,
      full_hash, truncated, Date.now()
    );
    return result.lastInsertRowid;
  }

  // Read every turn for a session, ordered by turn_index then by row id.
  // Used by the trace-summary script and downstream research probes.
  getSessionTurns(session_id, { limit = 1000 } = {}) {
    if (!session_id) return [];
    return this._db.prepare(`
      SELECT * FROM meph_turns
      WHERE session_id = ?
      ORDER BY turn_index ASC, id ASC
      LIMIT ?
    `).all(String(session_id), Number(limit));
  }

  // Aggregate stats across the whole turn log. For the "did Meph plan or
  // theater" probe: count tool calls per role, plus how often `todo set`
  // landed BEFORE any other tool in a session.
  turnStats({ sinceMs = null } = {}) {
    let where = '';
    const params = [];
    if (Number.isFinite(sinceMs)) { where = 'WHERE created_at >= ?'; params.push(sinceMs); }
    const total = this._db.prepare(`SELECT COUNT(*) AS n FROM meph_turns ${where}`).get(...params).n;
    const sessions = this._db.prepare(`SELECT COUNT(DISTINCT session_id) AS n FROM meph_turns ${where}`).get(...params).n;
    const byRole = this._db.prepare(`
      SELECT role, COUNT(*) AS n FROM meph_turns ${where}
      GROUP BY role ORDER BY n DESC
    `).all(...params);
    const byTool = this._db.prepare(`
      SELECT tool_name, COUNT(*) AS n FROM meph_turns
      ${where ? where + ' AND' : 'WHERE'} role = 'tool_use' AND tool_name IS NOT NULL
      GROUP BY tool_name ORDER BY n DESC
    `).all(...params);
    return { total, sessions, byRole, byTool };
  }

  close() {
    this._db.close();
  }
}
