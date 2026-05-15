// =============================================================================
// CLEAR LANGUAGE — call-function primitive test suite
// =============================================================================
//
// New primitive 2026-05-14: `call function NAME with ARGS` — dispatches to
// a top-level Clear function by string name at runtime. NAME can be a
// literal identifier or an expression that resolves to a string (typically
// `matched_row's function` after a `search for X in TABLE`).
//
// This unlocks: text-routing dispatchers (the load-bearing primitive for
// chat command apps), LLM tool dispatch (tools live in a table, LLM
// returns the tool name as a string, we call function by string), plugin
// systems, workflow-step dispatchers.
//
// Pairs with the existing `define function NAME(arg):` syntax — every
// function-def now auto-registers into a module-scope `_userFunctions`
// lookup so dispatch-by-string works.
// =============================================================================

import { describe, it, expect } from './lib/testUtils.js';
import { compileProgram } from './index.js';

describe('call-function primitive (2026-05-14)', () => {
  it('parses `call function NAME with ARG` as a CALL_FUNCTION node', () => {
    const source = [
      "target: backend",
      "",
      "define function GREET(caller_name):",
      "  send back 'hello ' + caller_name",
      "",
      "when user calls POST /api/x:",
      "  call function GREET with 'world'",
    ].join('\n');
    const compile_result = compileProgram(source);
    expect(compile_result.errors).toEqual([]);
    // Locate the CALL_FUNCTION node inside the endpoint body.
    const endpoint_node = compile_result.ast.body.find(n => n.type === 'endpoint');
    expect(endpoint_node).toBeTruthy();
    const dispatch_node = (endpoint_node.body || []).find(n => n.type === 'call_function');
    expect(dispatch_node).toBeTruthy();
    expect(dispatch_node.functionName).toBeTruthy();
    expect(dispatch_node.argument).toBeTruthy();
  });

  it('registers every define-function emit into the _userFunctions lookup table', () => {
    const source = [
      "target: backend",
      "",
      "define function GREET(caller_name):",
      "  send back 'hello ' + caller_name",
      "",
      "define function FAREWELL(caller_name):",
      "  send back 'goodbye ' + caller_name",
    ].join('\n');
    const compile_result = compileProgram(source);
    expect(compile_result.errors).toEqual([]);
    expect(compile_result.javascript).toMatch(/_userFunctions\["GREET"\]\s*=\s*GREET/);
    expect(compile_result.javascript).toMatch(/_userFunctions\["FAREWELL"\]\s*=\s*FAREWELL/);
  });

  it('emits dispatch JS that calls into _userFunctions by the resolved name', () => {
    const source = [
      "target: backend",
      "",
      "define function GREET(caller_name):",
      "  send back 'hello ' + caller_name",
      "",
      "when user calls POST /api/x:",
      "  call function GREET with 'world'",
    ].join('\n');
    const compile_result = compileProgram(source);
    expect(compile_result.errors).toEqual([]);
    expect(compile_result.javascript).toMatch(/_userFunctions\["GREET"\]\(\s*['"]world['"]\s*\)/);
  });

  it('lets the function name be an expression — call function X with Y where X is a variable', () => {
    const source = [
      "target: backend",
      "",
      "define function GREET(caller_name):",
      "  send back 'hello ' + caller_name",
      "",
      "when user calls POST /api/x:",
      "  chosen_function = 'GREET'",
      "  call function chosen_function with 'world'",
    ].join('\n');
    const compile_result = compileProgram(source);
    expect(compile_result.errors).toEqual([]);
    // The emitted dispatch must read from the variable, NOT the literal 'chosen_function' string.
    expect(compile_result.javascript).toMatch(/_userFunctions\[\s*chosen_function\s*\]/);
  });

  it('emits assignment from call function without compiling to a bare call variable', () => {
    const source = [
      "target: backend",
      "",
      "define function GREET(caller_name):",
      "  send back 'hello ' + caller_name",
      "",
      "when user calls POST /api/x:",
      "  chosen_function = 'GREET'",
      "  result = call function chosen_function with 'world'",
      "  send back result",
    ].join('\n');
    const compile_result = compileProgram(source);
    expect(compile_result.errors).toEqual([]);
    expect(compile_result.javascript).toMatch(/result\s*=\s*await _userFunctions\[\s*chosen_function\s*\]\(\s*['"]world['"]\s*\)/);
    expect(compile_result.javascript).not.toContain('result = call;');
  });
});
