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
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const _requireForRuntime = createRequire(import.meta.url);
const { _extractAbout, _regexCaptureRem } = _requireForRuntime('./runtime/slot-extractors.js');

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

// =============================================================================
// CYCLE 2.3 — compiler emit (Python): same shape, snake_case names
// =============================================================================
describe('slot extractors — compile to Python (Cycle 2.3)', () => {
  it('EXTRACT_DATETIME emits a call to _extract_datetime', () => {
    const source = [
      "when user sends note to /api/intake:",
      "  dt = extract datetime from note",
      "  send back dt",
    ].join('\n');
    const result = compileProgram(source, { target: 'python_backend' });
    expect(result.errors).toEqual([]);
    expect(result.python).toMatch(/_extract_datetime\s*\(/);
  });

  it('FUZZY_MATCH emits a call to _fuzzy_match with query, list, and threshold', () => {
    const source = [
      "when user sends note to /api/intake:",
      "  pick = fuzzy match 'paint' in note scored at least 0.7",
      "  send back pick",
    ].join('\n');
    const result = compileProgram(source, { target: 'python_backend' });
    expect(result.errors).toEqual([]);
    expect(result.python).toMatch(/_fuzzy_match\s*\(/);
    expect(result.python).toMatch(/0\.7/);
  });

  it('FUZZY_MATCH without threshold emits None so runtime uses default', () => {
    const source = [
      "when user sends note to /api/intake:",
      "  pick = fuzzy match 'paint' in note",
      "  send back pick",
    ].join('\n');
    const result = compileProgram(source, { target: 'python_backend' });
    expect(result.errors).toEqual([]);
    expect(result.python).toMatch(/_fuzzy_match\(\s*"paint"\s*,[^,]+,\s*None\s*\)/);
  });

  it('EXTRACT_ABOUT emits a call to _extract_about', () => {
    const source = [
      "when user sends note to /api/intake:",
      "  parts = extract about-clause from note",
      "  send back parts",
    ].join('\n');
    const result = compileProgram(source, { target: 'python_backend' });
    expect(result.errors).toEqual([]);
    expect(result.python).toMatch(/_extract_about\s*\(/);
  });

  it('REGEX_CAPTURE_REM emits a call to _regex_capture_rem with the pattern', () => {
    const source = [
      "when user sends note to /api/intake:",
      "  out = find pattern '\\d+' in note returning value and remainder",
      "  send back out",
    ].join('\n');
    const result = compileProgram(source, { target: 'python_backend' });
    expect(result.errors).toEqual([]);
    expect(result.python).toMatch(/_regex_capture_rem\s*\(/);
  });
});

// =============================================================================
// CYCLE 2.4 — Python runtime parity: spawn the Python unittest file
// =============================================================================
// Source-of-truth is runtime/slot_extractors_test.py (28 unittest cases).
// We just shell out and assert OK; environment-only gaps (no python on PATH)
// soft-pass so the JS suite remains useful on Windows boxes without Python.
describe('slot extractors — Python runtime parity (Cycle 2.4)', () => {
  it('slot_extractors_test.py passes its full unittest suite', () => {
    const candidates = ['python', 'python3', 'py'];
    let ran = false;
    for (const bin of candidates) {
      const res = spawnSync(bin, ['runtime/slot_extractors_test.py'], {
        cwd: process.cwd(),
        encoding: 'utf8',
      });
      if (res.error && res.error.code === 'ENOENT') continue;
      ran = true;
      const output = (res.stdout || '') + '\n' + (res.stderr || '');
      expect(output).toMatch(/OK/);
      expect(res.status).toBe(0);
      break;
    }
    if (!ran) {
      // No python on PATH — soft-pass. The standalone py test is the source
      // of truth; CI runs it independently.
      expect(true).toBe(true);
    }
  });
});

// =============================================================================
// CYCLE 2.6 — EXTRACT_ABOUT: parser shape + JS runtime corpus
// =============================================================================
// `extract about-clause from X` parses to an EXTRACT_ABOUT node. The runtime
// helper splits text on \b(about|re|regarding)\b and returns {what, about}.
// Cycle 2.2 covered the JS emit; cycle 2.3 covered the Python emit; cycle 2.4
// covered the Python runtime. This block locks the parser AST shape and the
// JS runtime corpus so the about-clause primitive has full TDD coverage.
describe('EXTRACT_ABOUT — parser AST shape (Cycle 2.6)', () => {
  it('parses `extract about-clause from X` to a node with type extract_about', () => {
    const source = [
      "when user sends note to /api/intake:",
      "  parts = extract about-clause from note",
      "  send back parts",
    ].join('\n');
    const result = compileProgram(source, { target: 'backend' });
    expect(result.errors).toEqual([]);
    const found = flattenAst(result.ast).some(n => n.type === 'extract_about');
    expect(found).toBe(true);
  });

  it('parses the alternate `extract about clause from X` phrasing too', () => {
    const source = [
      "when user sends note to /api/intake:",
      "  parts = extract about clause from note",
      "  send back parts",
    ].join('\n');
    const result = compileProgram(source, { target: 'backend' });
    expect(result.errors).toEqual([]);
    expect(flattenAst(result.ast).some(n => n.type === 'extract_about')).toBe(true);
  });
});

describe('EXTRACT_ABOUT — JS runtime corpus (Cycle 2.6)', () => {
  it('splits "remind me to email Marcus about Q3 numbers"', () => {
    const r = _extractAbout('remind me to email Marcus about Q3 numbers');
    expect(r.what).toBe('remind me to email Marcus');
    expect(r.about).toBe('Q3 numbers');
  });

  it('splits "todo: write demo about the launch"', () => {
    const r = _extractAbout('todo: write demo about the launch');
    expect(r.what).toBe('todo: write demo');
    expect(r.about).toBe('the launch');
  });

  it('splits "remind me re: pricing model"', () => {
    const r = _extractAbout('remind me re: pricing model');
    expect(r.what).toBe('remind me');
    expect(r.about).toBe('pricing model');
  });

  it('splits "note regarding the deal-desk demo"', () => {
    const r = _extractAbout('note regarding the deal-desk demo');
    expect(r.what).toBe('note');
    expect(r.about).toBe('the deal-desk demo');
  });

  it('returns about=null when no keyword is present', () => {
    const r = _extractAbout('todo: stretch');
    expect(r.what).toBe('todo: stretch');
    expect(r.about).toBe(null);
  });

  it('handles non-string input defensively', () => {
    const r = _extractAbout(null);
    expect(r.what).toBe('');
    expect(r.about).toBe(null);
  });
});
