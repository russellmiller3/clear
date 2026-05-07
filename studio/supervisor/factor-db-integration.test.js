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
import { CORE_TEMPLATE_SPECS, LANGUAGE_PRIMITIVE_SPECS, extractTemplatePrimitivePatterns, seedCoreTemplatePatterns } from './pattern-library.js';
import { probeSuites } from '../../scripts/meph-pattern-live-probe.mjs';
import { parse } from '../../parser.js';
import { compileProgram } from '../../index.js';
import { readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPS_DIR = join(__dirname, '..', '..', 'apps');

const TEST_DB = join(tmpdir(), 'factor-integration-test.db');
function cleanup() {
  for (const path of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) {
    try { unlinkSync(path); } catch {}
  }
}
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

  it('seeds the 13 canonical app patterns plus their primitive patterns from disk for Meph retrieval', () => {
    cleanup();
    const db = new FactorDB(TEST_DB);
    const result = seedCoreTemplatePatterns(db, join(__dirname, '..', '..'));

    expect(result.seeded).toEqual(13);
    expect(result.primitiveSeeded > 13).toEqual(true);
    expect(result.referenceTemplateCount > 0).toEqual(true);
    expect(result.referencePrimitiveSeeded > 0).toEqual(true);
    expect(result.languagePrimitiveSeeded).toEqual(LANGUAGE_PRIMITIVE_SPECS.length);
    expect(CORE_TEMPLATE_SPECS.length).toEqual(13);

    const coreRows = db.listProgrammingPatterns({ pattern_set: 'core' });
    const marcusRows = db.listProgrammingPatterns({ pattern_set: 'marcus' });
    expect(coreRows.length).toEqual(8);
    expect(marcusRows.length).toEqual(5);

    const primitiveRows = db.listProgrammingPatterns({ include_primitives: true }).filter(r => r.is_primitive);
    expect(primitiveRows.length).toEqual(result.primitiveSeeded + result.referencePrimitiveSeeded + result.languagePrimitiveSeeded);
    const canonicalPrimitiveParents = new Set(primitiveRows.filter(r => r.pattern_set === 'core' || r.pattern_set === 'marcus').map(r => r.parent_template_name));
    expect([...canonicalPrimitiveParents].sort()).toEqual(CORE_TEMPLATE_SPECS.map(s => s.name).sort());
    const referenceRows = db.listProgrammingPatterns({ pattern_set: 'reference', include_primitives: true });
    expect(referenceRows.length).toEqual(result.referencePrimitiveSeeded);
    expect(referenceRows.every(r => r.is_primitive === 1)).toEqual(true);
    expect(referenceRows.every(r => !CORE_TEMPLATE_SPECS.some(s => s.name === r.parent_template_name))).toEqual(true);

    const names = [...coreRows, ...marcusRows].map(r => r.template_name).sort();
    expect(names).toEqual(CORE_TEMPLATE_SPECS.map(s => s.name).sort());

    const agentSource = readFileSync(join(APPS_DIR, 'ecom-agent', 'main.clear'), 'utf8');
    const matches = db.queryProgrammingPatterns({ source: agentSource, topK: 3 });
    expect(matches[0].template_name).toEqual('ecom-agent');
    expect(matches[0].source).toContain('agent');

    const approvalSource = readFileSync(join(APPS_DIR, 'approval-queue', 'main.clear'), 'utf8');
    const narrowMatches = db.queryProgrammingPatterns({
      query: 'what is the shape of features to modify the routing of an approval queue',
      source: approvalSource,
      topK: 1,
    });
    expect(narrowMatches[0].is_primitive).toEqual(1);
    expect(narrowMatches[0].parent_template_name).toEqual('approval-queue');
    expect(narrowMatches[0].pattern_kind).toEqual('queue');
    expect(narrowMatches[0].source).toContain('queue for request:');

    const concurrencyMatches = db.queryProgrammingPatterns({
      query: 'avoid double processing approval optimistic lock',
      topK: 1,
    });
    expect(concurrencyMatches[0].is_primitive).toEqual(1);
    expect(concurrencyMatches[0].pattern_kind).toEqual('concurrency');
    expect(concurrencyMatches[0].source).toContain('with optimistic lock');
    expect(concurrencyMatches[0].source).toContain("status from 'pending' to 'approved'");

    db.close();
    cleanup();
  });

  it('extracts primitive rows from every golden template', () => {
    for (const spec of CORE_TEMPLATE_SPECS) {
      const source = readFileSync(join(APPS_DIR, spec.name, 'main.clear'), 'utf8');
      const primitives = extractTemplatePrimitivePatterns(source, spec);
      expect(primitives.length > 0).toEqual(true);
      expect(primitives.every(p => p.parent_template_name === spec.name)).toEqual(true);
      expect(primitives.every(p => p.is_primitive === 1)).toEqual(true);
      expect(primitives.every(p => p.source_start_line >= 1)).toEqual(true);
      expect(primitives.every(p => p.source.length > 0)).toEqual(true);
    }
  });

  it('retrieves useful primitives for narrow approval-queue questions', () => {
    cleanup();
    const db = new FactorDB(TEST_DB);
    seedCoreTemplatePatterns(db, join(__dirname, '..', '..'));
    const failures = [];

    for (const probe of probeSuites.narrowApprovalQueue) {
      const matches = db.queryProgrammingPatterns({ query: probe.prompt, topK: 5 });
      const haystack = matches
        .map(row => `${row.template_name} ${row.parent_template_name || ''} ${row.pattern_kind || ''} ${row.source || ''}`)
        .join('\n')
        .toLowerCase();
      const foundKind = probe.expectKinds.some(kind =>
        haystack.includes(kind.replace(/_/g, ' ')) || haystack.includes(kind)
      );
      const foundTerm = probe.expectTerms.some(term => haystack.includes(term.toLowerCase()));
      if (!foundKind || !foundTerm) {
        failures.push(`${probe.id}: expected kind ${probe.expectKinds.join('/')} and terms ${probe.expectTerms.join('/')} but got ${matches.map(row => `${row.template_name}:${row.pattern_kind}`).join(', ')}`);
      }
    }

    expect(failures).toEqual([]);
    db.close();
    cleanup();
  });
});
