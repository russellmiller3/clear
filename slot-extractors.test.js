// =============================================================================
// CLEAR LANGUAGE — SLOT-EXTRACTOR TEST SUITE (Phase 2 of Lenat-in-Clear)
// =============================================================================
//
// Tests for the four new slot-extractor node types and their runtime helpers.
// Every chat-style Clear app needs to pull structured values out of free-form
// text — datetimes, fuzzy-matched intents, "about X" clauses, regex slices.
// This file covers parser, JS + Python compiler emit, the runtime helpers
// themselves, and validator hints.
//
// Node types added in Phase 2:
//   EXTRACT_DATETIME   — extract datetime from text → {value, remainder}
//   FUZZY_MATCH        — fuzzy match 'q' in list scored at least 0.7 → best
//   EXTRACT_ABOUT      — extract about-clause from text → {what, about}
//   REGEX_CAPTURE_REM  — find pattern 'P' in text returning value and remainder
//
// Imported from clear.test.js so the cycle count rolls into the headline.
// =============================================================================

import { describe, it, expect } from './lib/testUtils.js';
import { compileProgram } from './index.js';

// Helper to walk every node in the AST so tests can assert on node types
// without depending on the exact tree shape (it changes as parser evolves).
function flattenAst(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.type) out.push(node);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach(x => flattenAst(x, out));
    else if (v && typeof v === 'object') flattenAst(v, out);
  }
  return out;
}

// =============================================================================
// CYCLE 2.2 — compiler emit (JS): every slot extractor lowers to a runtime call
// =============================================================================
describe('slot extractors — compile to JS (Cycle 2.2)', () => {
  it('EXTRACT_DATETIME emits a call to _extractDatetime', () => {
    const source = [
      "when user sends note to /api/intake:",
      "  dt = extract datetime from note",
      "  send back dt",
    ].join('\n');
    const result = compileProgram(source, { target: 'backend' });
    expect(result.errors).toEqual([]);
    expect(result.javascript).toMatch(/_extractDatetime\s*\(/);
  });

  it('FUZZY_MATCH emits a call to _fuzzyMatch with query, list, and threshold', () => {
    const source = [
      "when user sends note to /api/intake:",
      "  pick = fuzzy match 'paint' in note scored at least 0.7",
      "  send back pick",
    ].join('\n');
    const result = compileProgram(source, { target: 'backend' });
    expect(result.errors).toEqual([]);
    expect(result.javascript).toMatch(/_fuzzyMatch\s*\(/);
    // Threshold should appear as a literal numeric arg in the emitted call.
    expect(result.javascript).toMatch(/0\.7/);
  });

  it('FUZZY_MATCH without threshold emits null so runtime uses default', () => {
    const source = [
      "when user sends note to /api/intake:",
      "  pick = fuzzy match 'paint' in note",
      "  send back pick",
    ].join('\n');
    const result = compileProgram(source, { target: 'backend' });
    expect(result.errors).toEqual([]);
    expect(result.javascript).toMatch(/_fuzzyMatch\(\s*"paint"\s*,[^,]+,\s*null\s*\)/);
  });

  it('EXTRACT_ABOUT emits a call to _extractAbout', () => {
    const source = [
      "when user sends note to /api/intake:",
      "  parts = extract about-clause from note",
      "  send back parts",
    ].join('\n');
    const result = compileProgram(source, { target: 'backend' });
    expect(result.errors).toEqual([]);
    expect(result.javascript).toMatch(/_extractAbout\s*\(/);
  });

  it('REGEX_CAPTURE_REM emits a call to _regexCaptureRem with the pattern', () => {
    const source = [
      "when user sends note to /api/intake:",
      "  out = find pattern '\\d+' in note returning value and remainder",
      "  send back out",
    ].join('\n');
    const result = compileProgram(source, { target: 'backend' });
    expect(result.errors).toEqual([]);
    expect(result.javascript).toMatch(/_regexCaptureRem\s*\(/);
  });
});
