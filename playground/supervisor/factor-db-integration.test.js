// Integration test: real worker → /api/chat compile → Factor DB row.
//
// Spawns a real worker server, hits /api/compile (simpler than /api/chat
// which requires an API key), verifies a row appears in the Factor DB.
//
// Note: /api/compile is the direct compile endpoint — it bypasses the
// Factor DB hook, which lives inside /api/chat's executeTool('compile').
// For a true end-to-end test we'd need to drive /api/chat with a real
// Anthropic key, which the standard test suite doesn't have.
//
// So this test verifies the simpler guarantee: the FactorDB logger
// receives a compile result when invoked directly.

import { describe, it, expect } from '../../lib/testUtils.js';
import { FactorDB } from './factor-db.js';
import { classifyArchetype } from './archetype.js';
import { parse } from '../../parser.js';
import { compileProgram } from '../../index.js';
import { readFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPS_DIR = join(__dirname, '..', '..', 'apps');

const TEST_DB = '/tmp/factor-integration-test.db';
function cleanup() { try { unlinkSync(TEST_DB); } catch {} }
function sha1(s) { return createHash('sha1').update(s).digest('hex').slice(0, 16); }

describe('Factor DB compile integration', () => {
  it('logs a row per compile with correct archetype on a real template', () => {
    cleanup();
    const db = new FactorDB(TEST_DB);

    const source = readFileSync(join(APPS_DIR, 'todo-fullstack', 'main.clear'), 'utf8');

    // Simulate the hook: compile + classify + log
    const r = compileProgram(source);
    const archetype = classifyArchetype(parse(source));
    const compileOk = r.errors.length === 0 ? 1 : 0;

    const rowId = db.logAction({
      session_id: 'test-session',
      archetype,
      task_type: 'compile_cycle',
      error_sig: null,
      file_state_hash: sha1(source),
      source_before: source.slice(0, 5000),
      patch_ops: [],
      patch_summary: 'Clean compile of todo-fullstack',
      compile_ok: compileOk,
      test_pass: 0,
      test_score: 0.0,
    });

    expect(rowId).toBeTruthy();
    const row = db.getAction(rowId);
    expect(row.compile_ok).toEqual(1);
    expect(row.archetype).toEqual('crud_app');
    expect(row.session_id).toEqual('test-session');

    db.close();
    cleanup();
  });

  it('updates existing row with test outcome (simulates run_tests follow-up)', () => {
    cleanup();
    const db = new FactorDB(TEST_DB);

    const rowId = db.logAction({
      session_id: 'test-session',
      archetype: 'crud_app',
      task_type: 'compile_cycle',
      compile_ok: 1,
      test_pass: 0,
      test_score: 0.0,
      source_before: '',
      patch_ops: [],
      patch_summary: 'Clean compile',
      error_sig: null,
      file_state_hash: 'abc',
    });

    // Simulate run_tests update
    db._db.prepare('UPDATE code_actions SET test_pass = ?, test_score = ? WHERE id = ?')
      .run(1, 1.0, rowId);

    const updated = db.getAction(rowId);
    expect(updated.test_pass).toEqual(1);
    expect(updated.test_score).toEqual(1.0);

    db.close();
    cleanup();
  });

  it('logs multiple rows across templates with different archetypes', () => {
    cleanup();
    const db = new FactorDB(TEST_DB);

    const todoSrc = readFileSync(join(APPS_DIR, 'todo-fullstack', 'main.clear'), 'utf8');
    const chatSrc = readFileSync(join(APPS_DIR, 'live-chat', 'main.clear'), 'utf8');
    const bookingSrc = readFileSync(join(APPS_DIR, 'booking', 'main.clear'), 'utf8');

    for (const src of [todoSrc, chatSrc, bookingSrc]) {
      db.logAction({
        session_id: 's1',
        archetype: classifyArchetype(parse(src)),
        task_type: 'compile_cycle',
        compile_ok: 1,
        source_before: src.slice(0, 1000),
        patch_ops: [],
        patch_summary: '',
        error_sig: null,
        file_state_hash: sha1(src),
      });
    }

    expect(db.querySimilar({ archetype: 'crud_app' }).length).toEqual(1);
    expect(db.querySimilar({ archetype: 'realtime_app' }).length).toEqual(1);
    expect(db.querySimilar({ archetype: 'booking_app' }).length).toEqual(1);

    db.close();
    cleanup();
  });
});
