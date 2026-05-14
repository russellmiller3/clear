// =============================================================================
// CLEAR LANGUAGE — `if there's a match:` / `if no match:` test suite
// =============================================================================
//
// New primitive 2026-05-14: conditional binding on the result of the most
// recent `search for X in TABLE by FIELD` (P1). Two block-form branches:
//   - `if there's a match:` runs when search found a row
//   - `if no match:` runs when search returned nothing
// Both blocks have access to the implicit `match` variable bound by P1.
//
// Compiles to a plain `if (match) { ... } else { ... }` — the only new
// thing is the parser recognizing the English-form predicates and binding
// them to the right truthy branch.
// =============================================================================

import { describe, it, expect } from './lib/testUtils.js';
import { compileProgram } from './index.js';

describe('if-match primitive (2026-05-14)', () => {
  it('parses `if there\'s a match:` as a MATCH_CONDITIONAL with the match branch', () => {
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
      "  if there's a match:",
      "    send back 'matched'",
    ].join('\n');
    const compile_result = compileProgram(source);
    expect(compile_result.errors).toEqual([]);
    const endpoint_node = compile_result.ast.body.find(n => n.type === 'endpoint');
    const conditional_node = (endpoint_node.body || []).find(n => n.type === 'match_conditional');
    expect(conditional_node).toBeTruthy();
    expect(Array.isArray(conditional_node.matchBody)).toBe(true);
    expect(conditional_node.matchBody.length).toBeGreaterThan(0);
  });

  it('parses `if no match:` as a MATCH_CONDITIONAL with the no-match branch', () => {
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
      "  if no match:",
      "    send back 'unknown command'",
    ].join('\n');
    const compile_result = compileProgram(source);
    expect(compile_result.errors).toEqual([]);
    const endpoint_node = compile_result.ast.body.find(n => n.type === 'endpoint');
    const conditional_node = (endpoint_node.body || []).find(n => n.type === 'match_conditional');
    expect(conditional_node).toBeTruthy();
    expect(Array.isArray(conditional_node.noMatchBody)).toBe(true);
    expect(conditional_node.noMatchBody.length).toBeGreaterThan(0);
  });

  it('emits JS as a simple `if (match) ... else ...` over the match variable', () => {
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
      "  if there's a match:",
      "    send back 'matched'",
      "  if no match:",
      "    send back 'unknown command'",
    ].join('\n');
    const compile_result = compileProgram(source);
    expect(compile_result.errors).toEqual([]);
    expect(compile_result.javascript).toMatch(/if\s*\(\s*match\s*\)/);
    // Both branch bodies present in the emit (compiler may use single or double quotes).
    expect(compile_result.javascript).toMatch(/['"]matched['"]/);
    expect(compile_result.javascript).toMatch(/['"]unknown command['"]/);
  });

  it('lets the match body reference `match`\'s fields like a normal record', () => {
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
      "  if there's a match:",
      "    send back match's function",
    ].join('\n');
    const compile_result = compileProgram(source);
    expect(compile_result.errors).toEqual([]);
    // The emit must include a read against match.function (or match['function'],
    // or match?.function with optional chaining).
    expect(compile_result.javascript).toMatch(/match\??\.function|match\[['"]function['"]\]/);
  });
});
