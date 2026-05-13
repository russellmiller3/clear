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
