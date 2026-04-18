import { describe, it, expect } from '../../lib/testUtils.js';
import { FactorDB } from './factor-db.js';
import { unlinkSync } from 'fs';

const TEST_DB = '/tmp/factor-db-test.db';
function cleanup() { try { unlinkSync(TEST_DB); } catch {} }

describe('FactorDB', () => {
  it('inserts a code action and reads it back', () => {
    cleanup();
    const db = new FactorDB(TEST_DB);
    const id = db.logAction({
      session_id: 'worker-1',
      task_type: 'add_endpoint',
      error_sig: 'abc123',
      file_state_hash: 'def456',
      source_before: 'create a Table called Users',
      patch_ops: [{ op: 'add_endpoint', path: '/users', method: 'GET' }],
      patch_summary: 'Added GET /users endpoint',
      compile_ok: 1,
      test_pass: 1,
      test_score: 1.0,
      score_delta: 0.5,
    });
    expect(id).toBeTruthy();
    const row = db.getAction(id);
    expect(row.task_type).toEqual('add_endpoint');
    expect(row.test_pass).toEqual(1);
    expect(row.patch_summary).toEqual('Added GET /users endpoint');
    db.close();
    cleanup();
  });

  it('queries top actions by task type', () => {
    cleanup();
    const db = new FactorDB(TEST_DB);
    db.logAction({ session_id: 'w1', task_type: 'fix_validation', test_pass: 1, test_score: 0.9, compile_ok: 1, patch_ops: [], patch_summary: 'Fix A', error_sig: 'e1', file_state_hash: 'h1', source_before: '' });
    db.logAction({ session_id: 'w1', task_type: 'fix_validation', test_pass: 1, test_score: 0.7, compile_ok: 1, patch_ops: [], patch_summary: 'Fix B', error_sig: 'e2', file_state_hash: 'h2', source_before: '' });
    db.logAction({ session_id: 'w1', task_type: 'add_endpoint', test_pass: 1, test_score: 0.8, compile_ok: 1, patch_ops: [], patch_summary: 'Add C', error_sig: 'e3', file_state_hash: 'h3', source_before: '' });
    const results = db.querySimilar({ task_type: 'fix_validation', topK: 5 });
    expect(results.length).toEqual(2);
    expect(results[0].test_score >= results[1].test_score).toEqual(true); // ordered by score
    db.close();
    cleanup();
  });

  it('counts total actions and passing actions', () => {
    cleanup();
    const db = new FactorDB(TEST_DB);
    db.logAction({ session_id: 'w1', task_type: 'fix_validation', test_pass: 1, test_score: 1.0, compile_ok: 1, patch_ops: [], patch_summary: '', error_sig: 'e1', file_state_hash: 'h1', source_before: '' });
    db.logAction({ session_id: 'w1', task_type: 'fix_validation', test_pass: 0, test_score: 0.0, compile_ok: 0, patch_ops: [], patch_summary: '', error_sig: 'e2', file_state_hash: 'h2', source_before: '' });
    const stats = db.stats();
    expect(stats.total).toEqual(2);
    expect(stats.passing).toEqual(1);
    db.close();
    cleanup();
  });

  it('creates a GA run and logs candidates', () => {
    cleanup();
    const db = new FactorDB(TEST_DB);
    const runId = db.createGARun({ session_id: 'w1', task: 'build blog', population_size: 10 });
    expect(runId).toBeTruthy();
    db.logGACandidate({ run_id: runId, generation: 0, origin: 'seed', patch_ops: [], patch_summary: 'Seed candidate', compile_ok: 1, test_score: 0.6 });
    const candidates = db.getGACandidates(runId, 0);
    expect(candidates.length).toEqual(1);
    expect(candidates[0].origin).toEqual('seed');
    db.close();
    cleanup();
  });
});
