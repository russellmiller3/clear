import { describe, it, expect } from '../../lib/testUtils.js';
import { FactorDB } from './factor-db.js';
import { parse } from '../../parser.js';
import { computeShape } from './program-shape.js';
import { unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const TEST_DB = join(tmpdir(), 'factor-db-test.db');
function cleanup() {
  for (const path of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) {
    try { unlinkSync(path); } catch {}
  }
}

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

  it('filters query by archetype', () => {
    cleanup();
    const db = new FactorDB(TEST_DB);
    db.logAction({ session_id: 'w1', archetype: 'queue_workflow', task_type: 'fix_validation', test_pass: 1, test_score: 0.9, compile_ok: 1, patch_ops: [], patch_summary: 'Fix A (queue)', error_sig: 'e1', file_state_hash: 'h1', source_before: '' });
    db.logAction({ session_id: 'w1', archetype: 'crud_app', task_type: 'fix_validation', test_pass: 1, test_score: 0.9, compile_ok: 1, patch_ops: [], patch_summary: 'Fix B (crud)', error_sig: 'e2', file_state_hash: 'h2', source_before: '' });
    db.logAction({ session_id: 'w1', archetype: 'queue_workflow', task_type: 'fix_validation', test_pass: 1, test_score: 0.8, compile_ok: 1, patch_ops: [], patch_summary: 'Fix C (queue)', error_sig: 'e3', file_state_hash: 'h3', source_before: '' });

    const queueOnly = db.querySimilar({ archetype: 'queue_workflow' });
    expect(queueOnly.length).toEqual(2);
    for (const r of queueOnly) expect(r.archetype).toEqual('queue_workflow');

    db.close();
    cleanup();
  });

  it('querySuggestions returns exact-error fix when session fails then succeeds', () => {
    cleanup();
    const db = new FactorDB(TEST_DB);
    // Session hits error_sig 'E1' then fixes it. Include source_before
    // on the fix row — retrieval now filters out rows with empty source so
    // hints always have code to pattern-match from.
    const t1 = Date.now();
    const WORKING_SRC = 'build for javascript backend\n\ntable Items:\n  name is text\n\nwhen user calls GET /api/items:\n  send back all Items\n';
    db._db.prepare(`INSERT INTO code_actions (session_id, archetype, error_sig, compile_ok, test_pass, test_score, patch_ops, patch_summary, source_before, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('s1', 'crud_app', 'E1', 0, 0, 0, '[]', 'failed', '', t1);
    db._db.prepare(`INSERT INTO code_actions (session_id, archetype, error_sig, compile_ok, test_pass, test_score, patch_ops, patch_summary, source_before, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('s1', 'crud_app', null, 1, 1, 1.0, '[]', 'fixed it', WORKING_SRC, t1 + 100);

    const hints = db.querySuggestions({ archetype: 'crud_app', error_sig: 'E1', topK: 3 });
    expect(hints.length).toEqual(1);
    expect(hints[0].patch_summary).toEqual('fixed it');
    expect(hints[0].tier).toEqual('exact_error_same_archetype');
    db.close();
    cleanup();
  });

  it('querySuggestions falls back to archetype when error_sig unknown', () => {
    cleanup();
    const db = new FactorDB(TEST_DB);
    const WORKING_SRC = 'build for javascript backend\n\ntable Items:\n  name is text\n\nwhen user calls GET /api/items:\n  send back all Items\n';
    db._db.prepare(`INSERT INTO code_actions (session_id, archetype, error_sig, compile_ok, test_pass, test_score, patch_ops, patch_summary, source_before, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('s1', 'crud_app', null, 1, 1, 1.0, '[]', 'working CRUD app', WORKING_SRC, Date.now());

    const hints = db.querySuggestions({ archetype: 'crud_app', error_sig: 'NOT_SEEN_BEFORE', topK: 3 });
    expect(hints.length).toEqual(1);
    expect(hints[0].tier).toEqual('same_archetype_gold');
    expect(hints[0].patch_summary).toEqual('working CRUD app');
    db.close();
    cleanup();
  });

  it('querySuggestions returns empty when no archetype and no error match', () => {
    cleanup();
    const db = new FactorDB(TEST_DB);
    const hints = db.querySuggestions({ error_sig: 'UNKNOWN', topK: 3 });
    expect(hints.length).toEqual(0);
    db.close();
    cleanup();
  });

  it('querySuggestions deduplicates rows across tiers', () => {
    cleanup();
    const db = new FactorDB(TEST_DB);
    // Same session: fail then fix. Also in crud_app.
    const t1 = Date.now();
    const WORKING_SRC = 'build for javascript backend\n\ntable Items:\n  name is text\n\nwhen user calls GET /api/items:\n  send back all Items\n';
    db._db.prepare(`INSERT INTO code_actions (session_id, archetype, error_sig, compile_ok, test_pass, test_score, patch_ops, patch_summary, source_before, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('s1', 'crud_app', 'E1', 0, 0, 0, '[]', 'fail', '', t1);
    db._db.prepare(`INSERT INTO code_actions (session_id, archetype, error_sig, compile_ok, test_pass, test_score, patch_ops, patch_summary, source_before, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('s1', 'crud_app', null, 1, 1, 1.0, '[]', 'the-fix', WORKING_SRC, t1 + 100);

    const hints = db.querySuggestions({ archetype: 'crud_app', error_sig: 'E1', topK: 5 });
    // Should return the fix row ONCE — tier 1 catches it, tier 3 should skip (already seen)
    expect(hints.length).toEqual(1);
    expect(hints[0].patch_summary).toEqual('the-fix');
    db.close();
    cleanup();
  });

  it('querySuggestions does not pad exact-error fixes with generic archetype examples', () => {
    cleanup();
    const db = new FactorDB(TEST_DB);
    const t1 = Date.now();
    const WORKING_SRC = 'build for javascript backend\n\ntable Items:\n  name is text\n\nwhen user calls GET /api/items:\n  send back all Items\n';
    db._db.prepare(`INSERT INTO code_actions (session_id, archetype, error_sig, compile_ok, test_pass, test_score, patch_ops, patch_summary, source_before, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('s1', 'crud_app', 'E1', 0, 0, 0, '[]', 'fail', '', t1);
    db._db.prepare(`INSERT INTO code_actions (session_id, archetype, error_sig, compile_ok, test_pass, test_score, patch_ops, patch_summary, source_before, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('s1', 'crud_app', null, 1, 1, 1.0, '[]', 'exact fix', WORKING_SRC, t1 + 100);
    db._db.prepare(`INSERT INTO code_actions (session_id, archetype, error_sig, compile_ok, test_pass, test_score, patch_ops, patch_summary, source_before, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('gold-1', 'crud_app', null, 1, 1, 1.0, '[]', 'generic gold 1', WORKING_SRC, t1 + 200);
    db._db.prepare(`INSERT INTO code_actions (session_id, archetype, error_sig, compile_ok, test_pass, test_score, patch_ops, patch_summary, source_before, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('gold-2', 'crud_app', null, 1, 1, 0.9, '[]', 'generic gold 2', WORKING_SRC, t1 + 300);

    const hints = db.querySuggestions({ archetype: 'crud_app', error_sig: 'E1', topK: 3 });
    expect(hints.length).toEqual(1);
    expect(hints[0].patch_summary).toEqual('exact fix');
    expect(hints[0].tier).toEqual('exact_error_same_archetype');
    db.close();
    cleanup();
  });

  it('querySuggestions ranks same-archetype exact fixes before newer cross-archetype fixes', () => {
    cleanup();
    const db = new FactorDB(TEST_DB);
    const t1 = Date.now();
    const CRUD_SRC = 'build for javascript backend\n\ntable Items:\n  name is text\n\nwhen user calls GET /api/items:\n  send back all Items\n';
    const API_SRC = 'build for javascript backend\n\nwhen user calls GET /api/health:\n  send back { ok is true }\n';

    db._db.prepare(`INSERT INTO code_actions (session_id, archetype, error_sig, compile_ok, test_pass, test_score, patch_ops, patch_summary, source_before, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('crud-session', 'crud_app', 'E1', 0, 0, 0, '[]', 'crud fail', '', t1);
    db._db.prepare(`INSERT INTO code_actions (session_id, archetype, error_sig, compile_ok, test_pass, test_score, patch_ops, patch_summary, source_before, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('crud-session', 'crud_app', null, 1, 1, 0.8, '[]', 'same archetype fix', CRUD_SRC, t1 + 100);
    db._db.prepare(`INSERT INTO code_actions (session_id, archetype, error_sig, compile_ok, test_pass, test_score, patch_ops, patch_summary, source_before, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('api-session', 'api_service', 'E1', 0, 0, 0, '[]', 'api fail', '', t1 + 200);
    db._db.prepare(`INSERT INTO code_actions (session_id, archetype, error_sig, compile_ok, test_pass, test_score, patch_ops, patch_summary, source_before, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('api-session', 'api_service', null, 1, 1, 1.0, '[]', 'newer cross archetype fix', API_SRC, t1 + 300);

    const hints = db.querySuggestions({ archetype: 'crud_app', error_sig: 'E1', topK: 2 });
    expect(hints.length).toEqual(2);
    expect(hints[0].patch_summary).toEqual('same archetype fix');
    expect(hints[0].tier).toEqual('exact_error_same_archetype');
    expect(hints[1].patch_summary).toEqual('newer cross archetype fix');
    expect(hints[1].tier).toEqual('exact_error');
    db.close();
    cleanup();
  });

  it('logHintUsage updates hint_applied / hint_tier / hint_helpful / hint_reason', () => {
    cleanup();
    const db = new FactorDB(TEST_DB);
    const id = db.logAction({
      session_id: 's1', archetype: 'api_service', error_sig: 'e1',
      file_state_hash: 'h', source_before: 'build for javascript backend\n',
      patch_ops: [], patch_summary: 'Compile error',
      compile_ok: 0, test_pass: 0, test_score: 0.0,
    });
    // Applied a hint
    db.logHintUsage(id, { applied: true, tier: 'exact_error', helpful: 'yes' });
    let row = db._db.prepare('SELECT hint_applied, hint_tier, hint_helpful, hint_reason FROM code_actions WHERE id = ?').get(id);
    expect(row.hint_applied).toEqual(1);
    expect(row.hint_tier).toEqual('exact_error');
    expect(row.hint_helpful).toEqual('yes');
    expect(row.hint_reason).toEqual(null);

    // Skipped a hint (applied=false, with reason)
    const id2 = db.logAction({
      session_id: 's2', archetype: 'agent_workflow', error_sig: 'e2',
      file_state_hash: 'h2', source_before: 'build for javascript backend\n',
      patch_ops: [], patch_summary: 'Compile error',
      compile_ok: 0, test_pass: 0, test_score: 0.0,
    });
    db.logHintUsage(id2, { applied: false, reason: 'wrong archetype' });
    row = db._db.prepare('SELECT hint_applied, hint_tier, hint_helpful, hint_reason FROM code_actions WHERE id = ?').get(id2);
    expect(row.hint_applied).toEqual(0);
    expect(row.hint_reason).toEqual('wrong archetype');
    db.close();
    cleanup();
  });

  it('stores curated Clear programming patterns and searches them by shape plus text', () => {
    cleanup();
    const db = new FactorDB(TEST_DB);
    const crudSource = "build for javascript backend\n\ncreate a Todos table:\n  title is text\n\nwhen user calls GET /api/todos:\n  send back all Todos\n";
    const dealSource = "build for javascript backend\n\ncreate a Deals table:\n  amount is number\n  status is text\n\nrule 'Discount cap':\n  enforce that amount is less than 100000\n\nwhen user sends deal to /api/deals:\n  save deal as new Deal\n";
    const crudShape = computeShape(parse(crudSource));
    const dealShape = computeShape(parse(dealSource));

    db.upsertProgrammingPattern({
      template_name: 'todo-fullstack',
      pattern_set: 'core',
      title: 'CRUD basics',
      description: 'Tables, endpoints, auth, validation, pages',
      archetype: crudShape.archetype,
      shape_signature: crudShape,
      feature_tags: ['crud', 'tables', 'endpoints'],
      source: crudSource,
    });
    db.upsertProgrammingPattern({
      template_name: 'deal-desk',
      pattern_set: 'marcus',
      title: 'Discount approval with provable rules',
      description: 'Approval queue, audit, discount rules, CRO sign-off',
      archetype: dealShape.archetype,
      shape_signature: dealShape,
      feature_tags: ['approval', 'rules', 'audit'],
      source: dealSource,
    });

    const byShape = db.queryProgrammingPatterns({ shape_signature: crudShape, topK: 2 });
    expect(byShape.length).toEqual(2);
    expect(byShape[0].template_name).toEqual('todo-fullstack');
    expect(byShape[0].tier).toEqual('canonical_pattern');
    expect(Array.isArray(byShape[0].feature_tags)).toEqual(true);
    expect(typeof byShape[0].shape_score).toEqual('number');

    const byText = db.queryProgrammingPatterns({ query: 'approval discount rules', topK: 1 });
    expect(byText.length).toEqual(1);
    expect(byText[0].template_name).toEqual('deal-desk');
    expect(byText[0].source).toContain("rule 'Discount cap'");

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

  it('logs a runtime beacon and reads it back by compile row', () => {
    cleanup();
    const db = new FactorDB(TEST_DB);
    const compileId = db.logAction({
      session_id: 's1', task_type: 'add_endpoint',
      file_state_hash: 'h1', source_before: '',
      patch_ops: [], patch_summary: 'compile',
      compile_ok: 1, test_pass: 0, test_score: 0.0,
    });
    expect(compileId).toBeTruthy();

    const beaconId = db.logRuntimeBeacon({
      compile_row_id: compileId,
      event_type: 'endpoint_latency',
      route: '/api/deals/pending',
      method: 'GET',
      status_code: 200,
      latency_ms: 42.5,
      source_hash: 'abc123',
    });
    expect(beaconId).toBeTruthy();

    const errorBeaconId = db.logRuntimeBeacon({
      compile_row_id: compileId,
      event_type: 'endpoint_error',
      route: '/api/deals/draft',
      method: 'POST',
      status_code: 500,
      error_text: 'TypeError: Cannot read property of undefined',
    });
    expect(errorBeaconId).toBeTruthy();

    const beacons = db.runtimeBeaconsForCompile(compileId);
    expect(beacons.length).toEqual(2);
    const errorRow = beacons.find(b => b.event_type === 'endpoint_error');
    expect(errorRow.status_code).toEqual(500);
    expect(errorRow.error_text).toContain('TypeError');
    const latencyRow = beacons.find(b => b.event_type === 'endpoint_latency');
    expect(latencyRow.latency_ms).toEqual(42.5);

    db.close();
    cleanup();
  });

  it('rejects a beacon without event_type', () => {
    cleanup();
    const db = new FactorDB(TEST_DB);
    const result = db.logRuntimeBeacon({ compile_row_id: 1, route: '/api/x' });
    expect(result).toEqual(null);
    db.close();
    cleanup();
  });

  it('logs a compiler edit and lists recent ones', () => {
    cleanup();
    const db = new FactorDB(TEST_DB);
    const editId = db.logCompilerEdit({
      commit_sha: 'abc123def',
      file_path: 'compiler.js',
      edit_kind: 'error_message',
      before_text: "'x' is not defined",
      after_text: "Clear doesn't know what 'x' is — define it first with `define x as ...`",
      context: 'validateForwardReferences',
    });
    expect(editId).toBeTruthy();

    db.logCompilerEdit({
      commit_sha: 'def456abc',
      file_path: 'validator.js',
      edit_kind: 'error_message',
      before_text: 'Missing "to" after "send"',
      after_text: "Clear expected `to '/path'` after `send` — see Syntax Reference > Endpoints",
    });

    const recent = db.recentCompilerEdits();
    expect(recent.length).toEqual(2);
    // Most recent first
    expect(recent[0].file_path).toEqual('validator.js');
    expect(recent[1].file_path).toEqual('compiler.js');
    expect(recent[1].context).toEqual('validateForwardReferences');

    const onlyMessages = db.recentCompilerEdits({ kind: 'error_message' });
    expect(onlyMessages.length).toEqual(2);
    db.close();
    cleanup();
  });

  it('rejects a compiler edit without commit_sha or file_path', () => {
    cleanup();
    const db = new FactorDB(TEST_DB);
    expect(db.logCompilerEdit({ file_path: 'compiler.js', before_text: 'x', after_text: 'y' })).toEqual(null);
    expect(db.logCompilerEdit({ commit_sha: 'abc', before_text: 'x', after_text: 'y' })).toEqual(null);
    db.close();
    cleanup();
  });

  // meph_turns — full conversation trace (added 2026-05-06).
  // Captures every assistant text, thinking, tool_use, and tool_result so
  // downstream research can answer "did Meph plan before acting" / "which
  // tools correlate with success" / "is the todo tool used or theater?"
  it('logTurn writes a row and getSessionTurns reads it back', () => {
    cleanup();
    const db = new FactorDB(TEST_DB);
    const id = db.logTurn({
      session_id: 's1',
      turn_index: 0,
      role: 'user',
      message_text: 'build me a todo app',
    });
    expect(id).toBeTruthy();
    const turns = db.getSessionTurns('s1');
    expect(turns.length).toEqual(1);
    expect(turns[0].role).toEqual('user');
    expect(turns[0].message_text).toEqual('build me a todo app');
    expect(turns[0].turn_index).toEqual(0);
    expect(turns[0].truncated).toEqual(0);
    db.close();
    cleanup();
  });

  it('logTurn truncates large fields and flags truncated=1', () => {
    cleanup();
    const db = new FactorDB(TEST_DB);
    const big = 'x'.repeat(5000);
    db.logTurn({
      session_id: 's2',
      turn_index: 0,
      role: 'tool_result',
      tool_name: 'compile',
      tool_use_id: 'tu_123',
      tool_result: big,
    });
    const turns = db.getSessionTurns('s2');
    expect(turns.length).toEqual(1);
    expect(turns[0].truncated).toEqual(1);
    expect(turns[0].tool_result.length < big.length).toEqual(true);
    expect(turns[0].full_hash).toBeTruthy();
    db.close();
    cleanup();
  });

  it('getSessionTurns returns rows in turn_index order across roles', () => {
    cleanup();
    const db = new FactorDB(TEST_DB);
    // Insert out of order on purpose
    db.logTurn({ session_id: 's3', turn_index: 2, role: 'tool_use', tool_name: 'todo', tool_use_id: 'tu_a', tool_input: { action: 'set', todos: [] } });
    db.logTurn({ session_id: 's3', turn_index: 0, role: 'user', message_text: 'hi' });
    db.logTurn({ session_id: 's3', turn_index: 1, role: 'assistant_text', message_text: 'planning' });
    db.logTurn({ session_id: 's3', turn_index: 3, role: 'tool_result', tool_name: 'todo', tool_use_id: 'tu_a', tool_result: '{"ok":true}' });
    const turns = db.getSessionTurns('s3');
    expect(turns.length).toEqual(4);
    expect(turns.map(t => t.turn_index)).toEqual([0, 1, 2, 3]);
    expect(turns[2].role).toEqual('tool_use');
    expect(turns[3].role).toEqual('tool_result');
    expect(turns[3].tool_use_id).toEqual('tu_a');
    db.close();
    cleanup();
  });

  it('getSessionTurns isolates by session_id', () => {
    cleanup();
    const db = new FactorDB(TEST_DB);
    db.logTurn({ session_id: 'a', turn_index: 0, role: 'user', message_text: 'a-prompt' });
    db.logTurn({ session_id: 'b', turn_index: 0, role: 'user', message_text: 'b-prompt' });
    db.logTurn({ session_id: 'a', turn_index: 1, role: 'assistant_text', message_text: 'a-reply' });
    expect(db.getSessionTurns('a').length).toEqual(2);
    expect(db.getSessionTurns('b').length).toEqual(1);
    expect(db.getSessionTurns('b')[0].message_text).toEqual('b-prompt');
    db.close();
    cleanup();
  });

  it('logTurn rejects unknown role values', () => {
    cleanup();
    const db = new FactorDB(TEST_DB);
    let threw = false;
    try {
      db.logTurn({ session_id: 's4', turn_index: 0, role: 'banana', message_text: 'no' });
    } catch { threw = true; }
    expect(threw).toEqual(true);
    db.close();
    cleanup();
  });
});
