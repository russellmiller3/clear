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
import { compile, resolveModules } from './compiler.js';
import { validate } from './validator.js';
import { SYNONYM_TABLE, REVERSE_LOOKUP, SYNONYM_VERSION } from './synonyms.js';

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
  // Structured eval stats for RL + observability
  const stats = computeStats(ast, source, result.warnings);
  stats.ok = result.errors.length === 0;
  result.stats = stats;
  return result;
}

export {
  // High-level API
  compileProgram,
  compile,
  parse,
  validate,

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
