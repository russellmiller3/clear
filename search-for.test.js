// =============================================================================
// CLEAR LANGUAGE — search-for primitive test suite
// =============================================================================
//
// New primitive 2026-05-14: `search for X in TABLE by FIELD [or FIELD]`
// Returns the first row in TABLE whose primary FIELD or any optional
// other FIELDs (treated as list-of-alternatives if list-typed) starts
// with X. Binds the match into an implicit `match` variable usable in
// the next `if there's a match:` / `if no match:` block.
//
// This is the load-bearing primitive for text routing — chat command
// dispatch, fuzzy product search, help-topic routing, LLM tool routing
// over a tool-table. Pairs with `call function NAME with ARG` (P3) for
// the dispatch step.
//
// Russell's verbatim 2026-05-14: "it is acceptable to have a primitive
// for finding a match in a table though. e.g. Search for 'x' in
// [tablename]. If there's a match: [block]. If no match: [block]."
// =============================================================================

import { describe, it, expect } from './lib/testUtils.js';
import { compileProgram } from './index.js';

describe('search-for primitive (2026-05-14)', () => {
  it('parses `search for X in TABLE by FIELD` to a SEARCH_FOR node', () => {
    const source = [
      "target: backend",
      "",
      "create a Commands table:",
      "  function is text",
      "  phrase is text",
      "",
      "when user calls POST /api/route:",
      "  user_command = incoming.text",
      "  search for user_command in Commands by phrase",
    ].join('\n');
    const compile_result = compileProgram(source);
    expect(compile_result.errors).toEqual([]);
    const endpoint_node = compile_result.ast.body.find(n => n.type === 'endpoint');
    const search_node = (endpoint_node.body || []).find(n => n.type === 'search_for');
    expect(search_node).toBeTruthy();
    expect(search_node.table).toBe('Commands');
    expect(search_node.fields).toEqual(['phrase']);
    expect(search_node.input).toBeTruthy();
  });

  it('parses `search for X in TABLE by FIELD or FIELD` with multiple fields', () => {
    const source = [
      "target: backend",
      "",
      "create a Commands table:",
      "  function is text",
      "  phrase is text",
      "  synonyms is list",
      "",
      "when user calls POST /api/route:",
      "  user_command = incoming.text",
      "  search for user_command in Commands by phrase or synonyms",
    ].join('\n');
    const compile_result = compileProgram(source);
    expect(compile_result.errors).toEqual([]);
    const endpoint_node = compile_result.ast.body.find(n => n.type === 'endpoint');
    const search_node = (endpoint_node.body || []).find(n => n.type === 'search_for');
    expect(search_node).toBeTruthy();
    expect(search_node.fields).toEqual(['phrase', 'synonyms']);
  });

  it('emits JS that scans the table for a row whose field starts-with the input', () => {
    const source = [
      "target: backend",
      "",
      "create a Commands table:",
      "  function is text",
      "  phrase is text",
      "",
      "when user calls POST /api/route:",
      "  user_command = incoming.text",
      "  search for user_command in Commands by phrase",
    ].join('\n');
    const compile_result = compileProgram(source);
    expect(compile_result.errors).toEqual([]);
    // Emit must read from db.findAll('commands') (sanitized table name) and
    // produce a `match` binding via startsWith on the phrase field.
    expect(compile_result.javascript).toMatch(/db\.findAll\(['"]commands['"]/);
    expect(compile_result.javascript).toMatch(/\.startsWith\(/);
    expect(compile_result.javascript).toMatch(/let\s+match\s*=\s*null/);
  });

  it('emits JS that lists both fields and iterates list entries for list-typed alternatives', () => {
    const source = [
      "target: backend",
      "",
      "create a Commands table:",
      "  function is text",
      "  phrase is text",
      "  synonyms is list",
      "",
      "when user calls POST /api/route:",
      "  user_command = incoming.text",
      "  search for user_command in Commands by phrase or synonyms",
    ].join('\n');
    const compile_result = compileProgram(source);
    expect(compile_result.errors).toEqual([]);
    // The field list is emitted verbatim. The loop body uses dynamic
    // _row[_field] reads + Array.isArray for list-typed fields. We check
    // for the list signal + both field names in the field-list literal.
    expect(compile_result.javascript).toContain('["phrase","synonyms"]');
    expect(compile_result.javascript).toMatch(/Array\.isArray\(_val\)/);
  });
});
