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
