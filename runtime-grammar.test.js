// =============================================================================
// CLEAR LANGUAGE — RUNTIME GRAMMAR TEST SUITE (Phase 1 of Lenat-in-Clear)
// =============================================================================
//
// Tests for the load-bearing addition: a runtime-extensible grammar primitive.
// `runtime grammar 'name':` declares a parsing surface where frames can be
// seeded at compile time AND added at runtime (via inserts into the storage
// table). Each frame names a phrase pattern, slot fields, and an `on match:`
// block to fire when user input parses to that frame.
//
// Three new node types land in this phase:
//   RUNTIME_GRAMMAR    — top-level block
//   GRAMMAR_FRAME      — child block, one per frame
//   GRAMMAR_MATCH_CALL — expression: `match input against 'name'`
//
// This file is imported from clear.test.js so the cycles count rolls into
// the headline pass total.
// =============================================================================

import { describe, it, expect } from './lib/testUtils.js';
import { compileProgram } from './index.js';

// =============================================================================
// CYCLE 1.1 — parser baseline: runtime grammar with one frame parses cleanly
// =============================================================================
describe('runtime grammar — parse baseline (Cycle 1.1)', () => {
  it('parses a runtime grammar with one frame to RUNTIME_GRAMMAR + GRAMMAR_FRAME child', () => {
    const source = [
      "runtime grammar 'concepts':",
      "  frame TASK:",
      "    canonical phrase 'remind me to'",
    ].join('\n');
    const result = compileProgram(source);
    expect(result.errors).toEqual([]);
    const grammar = result.ast.body.find(n => n.type === 'runtime_grammar');
    expect(grammar).toBeTruthy();
    expect(grammar.name).toBe('concepts');
    expect(grammar.frames.length).toBe(1);
    expect(grammar.frames[0].type).toBe('grammar_frame');
    expect(grammar.frames[0].id).toBe('TASK');
  });

  it('defaults storage table to Concepts when omitted', () => {
    const source = [
      "runtime grammar 'concepts':",
      "  frame TASK:",
      "    canonical phrase 'remind me to'",
    ].join('\n');
    const result = compileProgram(source);
    const grammar = result.ast.body.find(n => n.type === 'runtime_grammar');
    expect(grammar.storageTable).toBe('Concepts');
  });

  it('honors explicit `storage table is X` directive', () => {
    const source = [
      "runtime grammar 'concepts':",
      "  storage table is FrameRegistry",
      "  frame TASK:",
      "    canonical phrase 'remind me to'",
    ].join('\n');
    const result = compileProgram(source);
    const grammar = result.ast.body.find(n => n.type === 'runtime_grammar');
    expect(grammar.storageTable).toBe('FrameRegistry');
  });
});

// =============================================================================
// CYCLE 1.2 — frame with effect + slots + synonyms parses to full metadata
// =============================================================================
describe('runtime grammar — frame metadata (Cycle 1.2)', () => {
  it('parses effect, canonical phrase, synonyms, and typed slots', () => {
    const source = [
      "runtime grammar 'concepts':",
      "  frame TASK:",
      "    effect internal",
      "    canonical phrase 'remind me to'",
      "    synonyms 'todo:', 'remember to'",
      "    slots:",
      "      what is text, required",
      "      when is datetime, optional",
    ].join('\n');
    const result = compileProgram(source);
    expect(result.errors).toEqual([]);
    const grammar = result.ast.body.find(n => n.type === 'runtime_grammar');
    const frame = grammar.frames[0];
    expect(frame.effect).toBe('internal');
    expect(frame.canonicalPhrase).toBe('remind me to');
    expect(frame.synonyms).toEqual(['todo:', 'remember to']);
    expect(frame.slots.length).toBe(2);
    expect(frame.slots[0]).toEqual({ name: 'what', slotType: 'text', required: true });
    expect(frame.slots[1]).toEqual({ name: 'when', slotType: 'datetime', required: false });
  });

  it('captures effect external + permission scope + first-N-confirm', () => {
    const source = [
      "runtime grammar 'concepts':",
      "  frame OPEN_NOTEPAD:",
      "    effect external",
      "    canonical phrase 'open notepad'",
      "    permission scope: 'spawn:notepad.exe'",
      "    first 3 runs require confirm: 3",
    ].join('\n');
    const result = compileProgram(source);
    expect(result.errors).toEqual([]);
    const frame = result.ast.body.find(n => n.type === 'runtime_grammar').frames[0];
    expect(frame.effect).toBe('external');
    expect(frame.permissionScope).toBe('spawn:notepad.exe');
    expect(frame.firstNRunsRequireConfirm).toBe(3);
  });

  it('parses multiple frames in one grammar block', () => {
    const source = [
      "runtime grammar 'concepts':",
      "  frame TASK:",
      "    effect internal",
      "    canonical phrase 'remind me to'",
      "  frame ENERGY_LOG:",
      "    effect internal",
      "    canonical phrase 'energy'",
      "  frame OPEN_NOTEPAD:",
      "    effect external",
      "    canonical phrase 'open notepad'",
    ].join('\n');
    const result = compileProgram(source);
    const grammar = result.ast.body.find(n => n.type === 'runtime_grammar');
    expect(grammar.frames.length).toBe(3);
    expect(grammar.frames.map(f => f.id)).toEqual(['TASK', 'ENERGY_LOG', 'OPEN_NOTEPAD']);
    expect(grammar.frames.map(f => f.effect)).toEqual(['internal', 'internal', 'external']);
  });
});

// =============================================================================
// CYCLE 1.3 — validator: missing canonical phrase errors with a helpful hint
// =============================================================================
describe('runtime grammar — validator (Cycle 1.3)', () => {
  it('errors with GRAMMAR_FRAME_MISSING_CANONICAL when frame has no canonical phrase', () => {
    const source = [
      "runtime grammar 'concepts':",
      "  frame TASK:",
      "    effect internal",
    ].join('\n');
    const result = compileProgram(source);
    expect(result.errors.length).toBeGreaterThan(0);
    const err = result.errors.find(e => /GRAMMAR_FRAME_MISSING_CANONICAL|canonical phrase/i.test(e.message));
    expect(err).toBeTruthy();
    expect(err.message).toMatch(/TASK/);
    expect(err.message.toLowerCase()).toMatch(/canonical phrase|canonical_phrase/);
  });

  it('does NOT error when canonical phrase is present', () => {
    const source = [
      "runtime grammar 'concepts':",
      "  frame TASK:",
      "    effect internal",
      "    canonical phrase 'remind me to'",
    ].join('\n');
    const result = compileProgram(source);
    expect(result.errors).toEqual([]);
  });

  it('defaults storage table to Concepts and reports no error', () => {
    // Phase 1 plan: missing `storage table is X` SHOULD default silently to
    // 'Concepts', not error. This test pins that the default path is clean.
    const source = [
      "runtime grammar 'concepts':",
      "  frame TASK:",
      "    canonical phrase 'remind me to'",
    ].join('\n');
    const result = compileProgram(source);
    const grammar = result.ast.body.find(n => n.type === 'runtime_grammar');
    expect(grammar.storageTable).toBe('Concepts');
    expect(result.errors).toEqual([]);
  });
});

// =============================================================================
// CYCLE 1.4 — compiler JS: RUNTIME_GRAMMAR emits storage table + matcher hook
// =============================================================================
describe('runtime grammar — compile to JS (Cycle 1.4)', () => {
  it('emits a Concepts storage table schema via the standard schema machinery', () => {
    const source = [
      "target: backend",
      "runtime grammar 'concepts':",
      "  frame TASK:",
      "    effect internal",
      "    canonical phrase 'remind me to'",
    ].join('\n');
    const result = compileProgram(source);
    const js = result.javascript || result.serverJS || '';
    // Storage table emits a schema constant matching the DATA_SHAPE pattern.
    expect(js).toMatch(/ConceptsSchema/);
    expect(js).toMatch(/db\.createTable\('concepts'/i);
  });

  it('emits a runtime matcher registry seeded with each compile-time frame', () => {
    const source = [
      "target: backend",
      "runtime grammar 'concepts':",
      "  frame TASK:",
      "    effect internal",
      "    canonical phrase 'remind me to'",
      "    synonyms 'todo:'",
      "  frame ENERGY_LOG:",
      "    effect internal",
      "    canonical phrase 'energy'",
    ].join('\n');
    const result = compileProgram(source);
    const js = result.javascript || result.serverJS || '';
    // The compiler emits a per-grammar registry object holding every frame's
    // canonical phrase, synonyms, slots, and effect, plus a _grammarMatch
    // helper that resolves input against the registry. Asserting key shape:
    expect(js).toMatch(/_grammarMatch/);
    expect(js).toMatch(/_grammarRegistry/);
    expect(js).toMatch(/["']remind me to["']/);
    expect(js).toMatch(/["']energy["']/);
    expect(js).toMatch(/TASK/);
    expect(js).toMatch(/ENERGY_LOG/);
  });

  it('honors the storage table name when overridden', () => {
    const source = [
      "target: backend",
      "runtime grammar 'concepts':",
      "  storage table is FrameRegistry",
      "  frame TASK:",
      "    effect internal",
      "    canonical phrase 'remind me to'",
    ].join('\n');
    const result = compileProgram(source);
    const js = result.javascript || result.serverJS || '';
    expect(js).toMatch(/FrameRegistrySchema/);
    expect(js).toMatch(/db\.createTable\('frameregistries'|db\.createTable\('frame_registries'/i);
  });
});

// =============================================================================
// CYCLE 1.5 — compiler Python parity: same three pieces, Python emit
// =============================================================================
describe('runtime grammar — compile to Python (Cycle 1.5)', () => {
  it('emits a CREATE TABLE statement for the storage table', () => {
    const source = [
      "target: python",
      "runtime grammar 'concepts':",
      "  frame TASK:",
      "    effect internal",
      "    canonical phrase 'remind me to'",
    ].join('\n');
    const result = compileProgram(source);
    const py = result.python || '';
    expect(py).toMatch(/CREATE TABLE IF NOT EXISTS concepts/);
    expect(py).toMatch(/frame_id TEXT UNIQUE/);
    expect(py).toMatch(/canonical_phrase TEXT NOT NULL/);
  });

  it('emits a _grammar_registry dict seeded with each frame', () => {
    const source = [
      "target: python",
      "runtime grammar 'concepts':",
      "  frame TASK:",
      "    effect internal",
      "    canonical phrase 'remind me to'",
      "  frame ENERGY_LOG:",
      "    effect internal",
      "    canonical phrase 'energy'",
    ].join('\n');
    const result = compileProgram(source);
    const py = result.python || '';
    expect(py).toMatch(/_grammar_registry/);
    expect(py).toMatch(/TASK/);
    expect(py).toMatch(/ENERGY_LOG/);
    expect(py).toMatch(/make_grammar_match/);
  });

  it('Python target honors a custom storage table name', () => {
    const source = [
      "target: python",
      "runtime grammar 'concepts':",
      "  storage table is FrameRegistry",
      "  frame TASK:",
      "    effect internal",
      "    canonical phrase 'remind me to'",
    ].join('\n');
    const result = compileProgram(source);
    const py = result.python || '';
    expect(py).toMatch(/CREATE TABLE IF NOT EXISTS frameregistries/);
  });
});

// =============================================================================
// CYCLE 1.6 — runtime matcher (JS): load frames, resolve input to a frame
// =============================================================================
import { createRequire } from 'node:module';
const _requireForRuntime = createRequire(import.meta.url);
const grammarMatcherModule = _requireForRuntime('./runtime/grammar-matcher.js');

// Fake db with a tiny in-memory storage. The matcher only needs findAll(table).
function fakeDb(initialRows) {
  const rows = Array.isArray(initialRows) ? initialRows.slice() : [];
  return {
    findAll: (tableName) => rows,
    _insert: (row) => { rows.push(row); },
    _rows: rows,
  };
}

describe('runtime matcher — JS (Cycle 1.6)', () => {
  const seedRegistry = {
    concepts: {
      storageTable: 'concepts',
      frames: [
        {
          frame_id: 'TASK',
          effect: 'internal',
          canonical_phrase: 'remind me to',
          synonyms: ['todo:', 'remember to'],
          slots: [{ name: 'what', type: 'text', required: true }],
          permission_scope: null,
          first_n_runs_require_confirm: null,
        },
        {
          frame_id: 'ENERGY_LOG',
          effect: 'internal',
          canonical_phrase: 'energy',
          synonyms: [],
          slots: [{ name: 'level', type: 'number', required: false }],
          permission_scope: null,
          first_n_runs_require_confirm: null,
        },
        {
          frame_id: 'OPEN_NOTEPAD',
          effect: 'external',
          canonical_phrase: 'open notepad',
          synonyms: ['launch notepad'],
          slots: [],
          permission_scope: 'spawn:notepad.exe',
          first_n_runs_require_confirm: 3,
        },
      ],
    },
  };

  it('matches a canonical phrase prefix and extracts the remainder into the first text slot', () => {
    const db = fakeDb([]);
    const match = grammarMatcherModule.makeGrammarMatch(db, seedRegistry);
    const result = match('concepts', 'remind me to call Marcus');
    expect(result.kind).toBe('matched');
    expect(result.frame.frame_id).toBe('TASK');
    expect(result.slotValues.what).toBe('call Marcus');
    expect(result.missingSlots).toEqual([]);
  });

  it('falls back to a synonym prefix when canonical does not match', () => {
    const db = fakeDb([]);
    const match = grammarMatcherModule.makeGrammarMatch(db, seedRegistry);
    const result = match('concepts', 'todo: pick up groceries');
    expect(result.kind).toBe('matched');
    expect(result.frame.frame_id).toBe('TASK');
    expect(result.slotValues.what).toBe('pick up groceries');
  });

  it('returns no_match when no frame prefix matches', () => {
    const db = fakeDb([]);
    const match = grammarMatcherModule.makeGrammarMatch(db, seedRegistry);
    const result = match('concepts', 'random gibberish input here');
    expect(result.kind).toBe('no_match');
    expect(result.frame).toBe(null);
  });

  it('returns no_match when grammar name does not exist', () => {
    const db = fakeDb([]);
    const match = grammarMatcherModule.makeGrammarMatch(db, seedRegistry);
    const result = match('does_not_exist', 'remind me to call Marcus');
    expect(result.kind).toBe('no_match');
  });

  it('picks the longest prefix when multiple frames could match', () => {
    // Two frames: one canonical 'open' (synthetic short), one canonical 'open notepad'.
    // Input 'open notepad' should match the longer one.
    const registry = {
      concepts: {
        storageTable: 'concepts',
        frames: [
          { frame_id: 'OPEN_ANYTHING', effect: 'internal', canonical_phrase: 'open', synonyms: [], slots: [] },
          { frame_id: 'OPEN_NOTEPAD', effect: 'external', canonical_phrase: 'open notepad', synonyms: [], slots: [] },
        ],
      },
    };
    const db = fakeDb([]);
    const match = grammarMatcherModule.makeGrammarMatch(db, registry);
    const result = match('concepts', 'open notepad');
    expect(result.kind).toBe('matched');
    expect(result.frame.frame_id).toBe('OPEN_NOTEPAD');
  });
});
