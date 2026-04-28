// =============================================================================
// CLEAR LANGUAGE — PUBLIC API
// =============================================================================
//
// PURPOSE: Clear is a programming language designed for AI to WRITE and humans
// to READ. When Claude builds an app, it writes Clear. The human can open the
// source and understand what was built without knowing JS, Python, CSS, or SQL.
//
// Usage:
//   import { compile as clearCompile } from '$lib/clear';
//
//   const result = clearCompile(`
//     target: web
//     set price = 100
//     set tax_rate = 0.08
//     set total = price + price * tax_rate
//     show total
//   `);
//
//   console.log(result.javascript);
//   // → let price = 100;
//   //   let tax_rate = 0.08;
//   //   let total = (price + (price * tax_rate));
//   //   console.log(total);
//
// =============================================================================

import { tokenize, tokenizeLine, TokenType } from './tokenizer.js';
import { parse, NodeType } from './parser.js';
import { compile, resolveModules, generateEvalEndpoints } from './compiler.js';
import { validate } from './validator.js';
import { SYNONYM_TABLE, REVERSE_LOOKUP, SYNONYM_VERSION } from './synonyms.js';
import { generateUATContract } from './lib/uat-contract.js';

/**
 * Parse and compile a Clear program in one step.
 *
 * @param {string} source - Clear source code
 * @param {object} [options] - Compilation options
 * @param {string} [options.target] - Override target ("web", "backend", "both")
 * @returns {{ javascript?: string, python?: string, ast: object, errors: Array<{line, message}> }}
 */
/**
 * Compute program statistics from AST + warnings for RL reward / observability.
 * Pure function — no side effects.
 */
function computeStats(ast, source, warnings) {
  let endpoints = 0, tables = 0, pages = 0, tests = 0, functions = 0,
      agents = 0, workflows = 0, hasAuth = false, hasDatabase = false,
      npmPackages = 0;

  function walk(nodes) {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
      switch (n.type) {
        case NodeType.ENDPOINT:   endpoints++; walk(n.body); break;
        case NodeType.DATA_SHAPE: tables++; hasDatabase = true; break;
        case NodeType.DATABASE_DECL: hasDatabase = true; break;
        case NodeType.PAGE:       pages++; walk(n.body); break;
        case NodeType.TEST_DEF:   tests++; break;
        case NodeType.FUNCTION_DEF: functions++; walk(n.body); break;
        case NodeType.AGENT:      agents++; break;
        case NodeType.WORKFLOW:   workflows++; break;
        case NodeType.USE:
          if (n.isNpm) npmPackages++;
          break;
        case NodeType.REQUIRES_AUTH:
        case NodeType.REQUIRES_ROLE:
          hasAuth = true; break;
      }
      if (n.body && n.type !== NodeType.PAGE && n.type !== NodeType.FUNCTION_DEF) walk(n.body);
      if (n.thenBranch) walk(n.thenBranch);
      if (n.otherwiseBranch) walk(n.otherwiseBranch);
    }
  }
  walk(ast.body);

  const typeWarnings = warnings.filter(w => w.message?.startsWith('Type warning')).length;
  // Note: inferred type errors are in errors[], not warnings[] — counted separately if needed
  const lines = source.split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).length;

  return {
    ok: true,                 // set to false if errors exist — caller patches this
    endpoints,
    tables,
    pages,
    tests: { defined: tests },
    functions,
    agents,
    workflows,
    npm_packages: npmPackages,
    has_auth: hasAuth,
    has_database: hasDatabase,
    lines,
    warnings: {
      total: warnings.length,
      type_warnings: typeWarnings,
    },
  };
}

function compileProgram(source, options = {}) {
  const ast = parse(source);
  // Resolve file-based imports BEFORE validation so imported functions are visible
  const moduleErrors = resolveModules(ast, options.moduleResolver);
  const { errors: validationErrors, warnings } = validate(ast);
  const result = compile(ast, options);
  result.errors = [...moduleErrors, ...validationErrors, ...result.errors];
  result.warnings = [...(result.warnings || []), ...warnings];
  result.ast = ast;
  // Expose database backend so CLI commands (package, deploy) can pick the right adapter
  result.dbBackend = ast.body.find(n => n.type === NodeType.DATABASE_DECL)?.backend || 'local memory';
  // Lean Lesson 1 — collect every TBD line in the program so the test runner,
  // the canonical-examples library, and Lesson 3 (open-capability visibility)
  // can find them. The compiler emits runtime stubs at these lines; this list
  // tells callers WHICH lines are stubs without re-walking the AST.
  result.placeholders = collectPlaceholders(ast);
  // UAT contract — JSON description of every page, route, button, and API
  // call in the program. Test generators walk this to know what to assert
  // (every button click, every nav target, every endpoint hit). Cherry-picked
  // from a 2026-04-27 Codex stash; the deeper browser-test generator that
  // consumes this contract lands in a follow-up commit.
  try {
    result.uatContract = generateUATContract(ast.body);
  } catch (err) {
    // Never let the contract break compilation. Surface as warning instead.
    result.uatContract = null;
    (result.warnings ??= []).push({ kind: 'uat-contract-failed', message: String(err.message || err) });
  }
  // Structured eval stats for RL + observability
  const stats = computeStats(ast, source, result.warnings);
  stats.ok = result.errors.length === 0;
  result.stats = stats;
  return result;
}

// Walk the AST and gather every PLACEHOLDER node (TBD marker). Returns
// `[{ line: N }]` sorted by line. Used by `result.placeholders` so external
// tools (test runner, harvest scorer, hint pipeline) can introspect the
// program's open holes without parsing source themselves.
function collectPlaceholders(ast) {
  const found = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const n of node) walk(n); return; }
    if (node.type === NodeType.PLACEHOLDER && typeof node.line === 'number') {
      found.push({ line: node.line });
    }
    // Recurse into every child property — tolerant of unknown node shapes
    // so it picks up placeholders nested inside agents, workflows, pages,
    // etc. without needing a hand-maintained type table.
    for (const key of Object.keys(node)) {
      const v = node[key];
      if (v && typeof v === 'object') walk(v);
    }
  }
  walk(ast.body || []);
  return found.sort((a, b) => a.line - b.line);
}

export {
  // High-level API
  compileProgram,
  compile,
  parse,
  validate,
  generateEvalEndpoints,

  // Low-level API
  tokenize,
  tokenizeLine,

  // Types and constants
  TokenType,
  NodeType,
  SYNONYM_TABLE,
  REVERSE_LOOKUP,
  SYNONYM_VERSION,
};
