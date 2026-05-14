// =============================================================================
// CLEAR LANGUAGE — `with rows:` table-seed test suite
// =============================================================================
//
// New primitive 2026-05-14: `create a TABLE: ... with rows: {field: value...}`
// Lets a table declaration carry its seed rows in the same block. The
// compiler inserts the rows once at server startup (after createTable).
// =============================================================================

import { describe, it, expect } from './lib/testUtils.js';
import { compileProgram } from './index.js';

describe('with-rows primitive (2026-05-14)', () => {
  it('parses `with rows:` block as seed data on the DATA_SHAPE', () => {
    const source = [
      "target: backend",
      "",
      "create a Commands table:",
      "  function is text",
      "  phrase is text",
      "  with rows:",
      "    {function: 'OPEN_NOTEPAD', phrase: 'open notepad'}",
      "    {function: 'OPEN_CALC', phrase: 'open calc'}",
    ].join('\n');
    const compile_result = compileProgram(source);
    expect(compile_result.errors).toEqual([]);
    const table_node = compile_result.ast.body.find(n => n.type === 'data_shape');
    expect(table_node).toBeTruthy();
    expect(Array.isArray(table_node.seedRows)).toBe(true);
    expect(table_node.seedRows.length).toBe(2);
  });

  it('emits server-startup inserts for each row', () => {
    const source = [
      "target: backend",
      "",
      "create a Commands table:",
      "  function is text",
      "  phrase is text",
      "  with rows:",
      "    {function: 'OPEN_NOTEPAD', phrase: 'open notepad'}",
      "    {function: 'OPEN_CALC', phrase: 'open calc'}",
    ].join('\n');
    const compile_result = compileProgram(source);
    expect(compile_result.errors).toEqual([]);
    // Each row produces an insert into the lowercased table name.
    expect(compile_result.javascript).toMatch(/db\.insert\(['"]commands['"]/);
    // Both row payloads should be present somewhere.
    expect(compile_result.javascript).toContain('OPEN_NOTEPAD');
    expect(compile_result.javascript).toContain('OPEN_CALC');
  });

  it('declaring a table without `with rows:` leaves seedRows empty (no regression)', () => {
    const source = [
      "target: backend",
      "",
      "create a Items table:",
      "  name is text",
    ].join('\n');
    const compile_result = compileProgram(source);
    expect(compile_result.errors).toEqual([]);
    const table_node = compile_result.ast.body.find(n => n.type === 'data_shape');
    expect(table_node).toBeTruthy();
    expect(table_node.seedRows == null || table_node.seedRows.length === 0).toBe(true);
  });
});
