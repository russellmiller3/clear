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
function compileProgram(source, options = {}) {
  const ast = parse(source);
  // Resolve file-based imports BEFORE validation so imported functions are visible
  const moduleErrors = resolveModules(ast, options.moduleResolver);
  const { errors: validationErrors, warnings } = validate(ast);
  const result = compile(ast, options);
  result.errors = [...moduleErrors, ...validationErrors, ...result.errors];
  result.warnings = [...(result.warnings || []), ...warnings];
  result.ast = ast;
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
