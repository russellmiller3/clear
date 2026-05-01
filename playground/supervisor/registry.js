import Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  task         TEXT,
  state        TEXT NOT NULL DEFAULT 'idle',
  port         INTEGER NOT NULL,
  pid          INTEGER,
  worktree     TEXT,
  source       TEXT,
  test_pass    INTEGER DEFAULT 0,
  test_score   REAL DEFAULT 0.0,
  test_summary TEXT,
  error_sig    TEXT,
  stall_count  INTEGER DEFAULT 0,
  assigned_at  INTEGER,
  completed_at INTEGER,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS supervisor_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  action     TEXT NOT NULL,
  reason     TEXT,
  payload    TEXT,
  ts         INTEGER NOT NULL
);
`;

export class SessionRegistry {
  constructor(dbPath) {
    this._db = new Database(dbPath);
    this._db.pragma('journal_mode = WAL');
    this._db.pragma('synchronous = NORMAL');
    this._db.exec(SCHEMA);
  }

  create({ id, port, state = 'idle', task = null, pid = null }) {
    const now = Date.now();
    this._db.prepare(`
      INSERT INTO sessions (id, port, state, task, pid, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, port, state, task, pid, now);
  }

  get(id) {
    return this._db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) || null;
  }

  update(id, fields) {
    const now = Date.now();
    const allowed = ['task', 'state', 'pid', 'worktree', 'source', 'test_pass',
      'test_score', 'test_summary', 'error_sig', 'stall_count', 'assigned_at', 'completed_at'];
    const updates = Object.entries(fields)
      .filter(([k]) => allowed.includes(k))
      .map(([k]) => `${k} = ?`);
    const values = Object.entries(fields)
      .filter(([k]) => allowed.includes(k))
      .map(([, v]) => v);
    if (updates.length === 0) return;
    this._db.prepare(`UPDATE sessions SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`)
      .run(...values, now, id);
  }

  listActive() {
    return this._db.prepare(`SELECT * FROM sessions WHERE state IN ('idle', 'running')`).all();
  }

  listAll() {
    return this._db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all();
  }

  /**
   * Clear stale rows so a fresh sweep can re-use the same session ids
   * ('worker-1', 'worker-2', ...) without tripping the UNIQUE PRIMARY
   * KEY on `sessions.id`.
   *
   * Deletes:
   *   - any row whose state is 'idle' or 'done' (regardless of age)
   *   - any row whose updated_at is older than 1 hour (regardless of state)
   *
   * Preserves: rows in 'running' / 'crashed' / etc. that were touched in
   * the last hour — those might belong to a sibling sweep still running
   * elsewhere.
   *
   * Why this exists: pre-2026-04-25, an abnormal exit (Ctrl-C, OOM, taskkill)
   * left rows behind. The next sweep called registry.create() with the same
   * ids and the INSERT failed with `UNIQUE constraint failed: sessions.id`
   * before any worker spawned, killing the whole sweep at startup.
   *
   * Returns: number of rows deleted.
   */
  cleanupStale() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const result = this._db.prepare(
      `DELETE FROM sessions
        WHERE state IN ('idle', 'done')
           OR updated_at < ?`
    ).run(oneHourAgo);
    return result.changes;
  }

  log(sessionId, action, reason = null, payload = null) {
    this._db.prepare(`
      INSERT INTO supervisor_log (session_id, action, reason, payload, ts)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, action, reason, payload ? JSON.stringify(payload) : null, Date.now());
  }

  close() {
    this._db.close();
  }
}
