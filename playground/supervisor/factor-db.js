import Database from 'better-sqlite3';

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
  embedding        BLOB,
  created_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_type   ON code_actions(task_type);
CREATE INDEX IF NOT EXISTS idx_archetype   ON code_actions(archetype);
CREATE INDEX IF NOT EXISTS idx_error_sig   ON code_actions(error_sig);
CREATE INDEX IF NOT EXISTS idx_test_pass   ON code_actions(test_pass, test_score DESC);
CREATE INDEX IF NOT EXISTS idx_created_at  ON code_actions(created_at);

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
  }

  logAction({ session_id, task_type = null, archetype = null, error_sig = null, file_state_hash = null,
    source_before = '', patch_ops = [], patch_summary = null,
    compile_ok = 0, test_pass = 0, test_score = 0.0, score_delta = 0.0 }) {
    const now = Date.now();
    const result = this._db.prepare(`
      INSERT INTO code_actions
        (session_id, task_type, archetype, error_sig, file_state_hash, source_before,
         patch_ops, patch_summary, compile_ok, test_pass, test_score, score_delta, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(session_id, task_type, archetype, error_sig, file_state_hash, source_before,
      JSON.stringify(patch_ops), patch_summary, compile_ok ? 1 : 0,
      test_pass ? 1 : 0, test_score, score_delta, now);
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

  stats() {
    const total = this._db.prepare('SELECT COUNT(*) AS n FROM code_actions').get().n;
    const passing = this._db.prepare('SELECT COUNT(*) AS n FROM code_actions WHERE test_pass = 1').get().n;
    return { total, passing };
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

  close() {
    this._db.close();
  }
}
