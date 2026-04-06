// =============================================================================
// CLEAR LANGUAGE — TEST SUITE
// =============================================================================
// Run: npx vite-node clear/clear.test.js
// =============================================================================

import { describe, it, expect, run } from './lib/testUtils.js';
import { tokenizeLine, TokenType } from './tokenizer.js';
import { parse, NodeType } from './parser.js';
import { compile, compileNode, exprToCode } from './compiler.js';
import { validate } from './validator.js';
import { compileProgram, SYNONYM_TABLE, REVERSE_LOOKUP, SYNONYM_VERSION } from './index.js';

// =============================================================================
// SYNONYM TABLE
// =============================================================================

describe('Synonym Table', () => {
  it('is frozen and immutable', () => {
    expect(Object.isFrozen(SYNONYM_TABLE)).toBe(true);
  });

  it('has a version string', () => {
    expect(SYNONYM_VERSION).toBe('0.9.0');
  });

  it('maps "create" to canonical "set"', () => {
    expect(REVERSE_LOOKUP['create']).toBe('set');
  });

  it('maps "display" to canonical "show"', () => {
    expect(REVERSE_LOOKUP['display']).toBe('show');
  });

  it('maps "when" to canonical "if"', () => {
    expect(REVERSE_LOOKUP['when']).toBe('if');
  });

  it('maps multi-word synonyms like "is greater than"', () => {
    expect(REVERSE_LOOKUP['is greater than']).toBe('is greater than');
  });

  it('maps "otherwise" and "else" to the same canonical', () => {
    expect(REVERSE_LOOKUP['else']).toBe('otherwise');
    expect(REVERSE_LOOKUP['otherwise']).toBe('otherwise');
  });
});

// =============================================================================
// TOKENIZER
// =============================================================================

describe('Tokenizer', () => {
  it('tokenizes a number literal', () => {
    const tokens = tokenizeLine('42', 1);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[0].value).toBe(42);
  });

  it('tokenizes a decimal number', () => {
    const tokens = tokenizeLine('3.14', 1);
    expect(tokens[0].value).toBe(3.14);
  });

  it('tokenizes a string literal', () => {
    const tokens = tokenizeLine('"hello world"', 1);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].type).toBe(TokenType.STRING);
    expect(tokens[0].value).toBe('hello world');
  });

  it('tokenizes arithmetic operators', () => {
    const tokens = tokenizeLine('x + y * z', 1);
    expect(tokens).toHaveLength(5);
    expect(tokens[1].type).toBe(TokenType.OPERATOR);
    expect(tokens[1].value).toBe('+');
    expect(tokens[3].type).toBe(TokenType.OPERATOR);
    expect(tokens[3].value).toBe('*');
  });

  it('tokenizes assignment', () => {
    const tokens = tokenizeLine('price = 100', 1);
    expect(tokens).toHaveLength(3);
    expect(tokens[1].type).toBe(TokenType.ASSIGN);
  });

  it('resolves keyword synonyms to canonical form', () => {
    const tokens = tokenizeLine('create x = 5', 1);
    expect(tokens[0].type).toBe(TokenType.KEYWORD);
    expect(tokens[0].canonical).toBe('set');
  });

  it('resolves "display" to canonical "show"', () => {
    const tokens = tokenizeLine('display x', 1);
    expect(tokens[0].canonical).toBe('show');
  });

  it('tokenizes comments', () => {
    const tokens = tokenizeLine('x = 5 # this is a comment', 1);
    const commentToken = tokens.find(t => t.type === TokenType.COMMENT);
    expect(commentToken).toBeDefined();
    expect(commentToken.value).toBe('this is a comment');
  });

  it('tokenizes list brackets', () => {
    const tokens = tokenizeLine('[1, 2, 3]', 1);
    expect(tokens[0].type).toBe(TokenType.LBRACKET);
    expect(tokens[6].type).toBe(TokenType.RBRACKET);
  });

  it('tokenizes comparison operators', () => {
    const tokens = tokenizeLine('x >= 10', 1);
    expect(tokens[1].type).toBe(TokenType.COMPARE);
    expect(tokens[1].value).toBe('>=');
  });

  it('handles multi-word synonyms like "is greater than"', () => {
    const tokens = tokenizeLine('x is greater than 10', 1);
    const keyword = tokens.find(t => t.canonical === 'is greater than');
    expect(keyword).toBeDefined();
  });

  it('preserves line and column info', () => {
    const tokens = tokenizeLine('set x = 5', 3);
    expect(tokens[0].line).toBe(3);
    expect(tokens[0].column).toBe(1);
  });
});

// =============================================================================
// PARSER
// =============================================================================

describe('Parser - Basic Structure', () => {
  it('parses an empty program', () => {
    const ast = parse('');
    expect(ast.type).toBe(NodeType.PROGRAM);
    expect(ast.body).toHaveLength(0);
    expect(ast.errors).toHaveLength(0);
  });

  it('parses a single-line comment', () => {
    const ast = parse('# this is a comment');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0].type).toBe(NodeType.COMMENT);
    expect(ast.body[0].text).toBe('this is a comment');
  });

  it('parses a multi-line comment block', () => {
    const ast = parse('###\nline one\nline two\n###');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0].type).toBe(NodeType.COMMENT);
    expect(ast.body[0].text).toContain('line one');
    expect(ast.body[0].text).toContain('line two');
  });

  it('multi-line comment does not interfere with surrounding code', () => {
    const ast = parse('x = 1\n###\nnotes here\n###\ny = 2');
    const assigns = ast.body.filter(n => n.type === 'assign');
    const comments = ast.body.filter(n => n.type === 'comment');
    expect(assigns).toHaveLength(2);
    expect(comments).toHaveLength(1);
  });

  it('parses a target declaration', () => {
    const ast = parse('target: web');
    expect(ast.target).toBe('web');
  });

  it('accepts target synonyms', () => {
    const ast = parse('target: javascript');
    expect(ast.target).toBe('web');
  });
});

describe('Parser - Assignments', () => {
  it('parses "set x = 5"', () => {
    const ast = parse('set x = 5');
    expect(ast.body).toHaveLength(1);
    const node = ast.body[0];
    expect(node.type).toBe(NodeType.ASSIGN);
    expect(node.name).toBe('x');
    expect(node.expression.type).toBe(NodeType.LITERAL_NUMBER);
    expect(node.expression.value).toBe(5);
  });

  it('parses "create price = 100" (synonym for set)', () => {
    const ast = parse('create price = 100');
    expect(ast.body[0].type).toBe(NodeType.ASSIGN);
    expect(ast.body[0].name).toBe('price');
  });

  it('parses "x = 5" without keyword', () => {
    const ast = parse('x = 5');
    expect(ast.body[0].type).toBe(NodeType.ASSIGN);
    expect(ast.body[0].name).toBe('x');
  });

  it('parses string assignment', () => {
    const ast = parse('set name = "Alice"');
    expect(ast.body[0].expression.type).toBe(NodeType.LITERAL_STRING);
    expect(ast.body[0].expression.value).toBe('Alice');
  });

  it('parses boolean assignment', () => {
    const ast = parse('set active = true');
    expect(ast.body[0].expression.type).toBe(NodeType.LITERAL_BOOLEAN);
    expect(ast.body[0].expression.value).toBe(true);
  });

  it('parses list assignment with brackets', () => {
    const ast = parse('set items = [1, 2, 3]');
    expect(ast.body[0].expression.type).toBe(NodeType.LITERAL_LIST);
    expect(ast.body[0].expression.elements).toHaveLength(3);
  });
});

describe('Parser - Expressions', () => {
  it('parses arithmetic: a + b', () => {
    const ast = parse('set result = a + b');
    const expr = ast.body[0].expression;
    expect(expr.type).toBe(NodeType.BINARY_OP);
    expect(expr.operator).toBe('+');
  });

  it('respects operator precedence: a + b * c', () => {
    const ast = parse('set result = a + b * c');
    const expr = ast.body[0].expression;
    // Should be: a + (b * c) — multiplication binds tighter
    expect(expr.operator).toBe('+');
    expect(expr.right.operator).toBe('*');
  });

  it('parses parenthesized expressions', () => {
    const ast = parse('set result = (a + b) * c');
    const expr = ast.body[0].expression;
    expect(expr.operator).toBe('*');
    expect(expr.left.operator).toBe('+');
  });

  it('parses function calls', () => {
    const ast = parse('set total = sum(a, b, c)');
    const expr = ast.body[0].expression;
    expect(expr.type).toBe(NodeType.CALL);
    expect(expr.name).toBe('sum');
    expect(expr.args).toHaveLength(3);
  });

  it('parses comparison operators', () => {
    const ast = parse('set result = x >= 10');
    const expr = ast.body[0].expression;
    expect(expr.type).toBe(NodeType.BINARY_OP);
    expect(expr.operator).toBe('>=');
  });

  it('parses "not" unary operator', () => {
    const ast = parse('set result = not active');
    const expr = ast.body[0].expression;
    expect(expr.type).toBe(NodeType.UNARY_OP);
    expect(expr.operator).toBe('not');
  });
});

describe('Parser - Show/Display', () => {
  it('parses "show x"', () => {
    const ast = parse('show x');
    expect(ast.body[0].type).toBe(NodeType.SHOW);
  });

  it('parses "display x" (synonym)', () => {
    const ast = parse('display x');
    expect(ast.body[0].type).toBe(NodeType.SHOW);
  });

  it('parses "print x" (synonym)', () => {
    const ast = parse('print x');
    expect(ast.body[0].type).toBe(NodeType.SHOW);
  });
});

describe('Parser - If/Then', () => {
  it('parses basic if/then', () => {
    const ast = parse('if x > 10 then set result = "high"');
    expect(ast.body[0].type).toBe(NodeType.IF_THEN);
    expect(ast.body[0].condition.operator).toBe('>');
    expect(ast.body[0].thenBranch.type).toBe(NodeType.ASSIGN);
  });

  it('parses if/then/otherwise', () => {
    const ast = parse('if x > 10 then set result = "high" otherwise set result = "low"');
    const node = ast.body[0];
    expect(node.type).toBe(NodeType.IF_THEN);
    expect(node.otherwiseBranch).not.toBeNull();
    expect(node.otherwiseBranch.type).toBe(NodeType.ASSIGN);
  });

  it('accepts "when" as synonym for "if"', () => {
    const ast = parse('when x > 10 then set result = "high"');
    expect(ast.body[0].type).toBe(NodeType.IF_THEN);
  });
});

describe('Parser - Error Reporting', () => {
  it('reports error for missing expression', () => {
    const ast = parse('set x =');
    expect(ast.errors.length > 0).toBe(true);
  });

  it('reports error for unknown target', () => {
    const ast = parse('target: foobar');
    expect(ast.errors.length > 0).toBe(true);
    expect(ast.errors[0].message).toContain('web, backend, or both');
  });

  it('reports error for if without then or indented body', () => {
    const ast = parse('if x > 10 set result = "high"');
    expect(ast.errors.length > 0).toBe(true);
    // Error teaches user about block form OR inline form
    expect(ast.errors[0].message).toMatch(/if-block.*empty|then/);
  });
});

// =============================================================================
// PARSER - MULTI-LINE PROGRAMS
// =============================================================================

describe('Parser - Multi-line Programs', () => {
  it('parses a complete program', () => {
    const source = `
target: web

# Tax calculator
set price = 100
set tax_rate = 0.08
set tax = price * tax_rate
set total = price + tax
show total
    `;
    const ast = parse(source);
    expect(ast.target).toBe('web');
    expect(ast.errors).toHaveLength(0);
    // comment + 4 assignments + 1 show = 6 body nodes
    // (target node is also in body)
    const assigns = ast.body.filter(n => n.type === NodeType.ASSIGN);
    expect(assigns).toHaveLength(4);
  });
});

// =============================================================================
// COMPILER - JAVASCRIPT
// =============================================================================

describe('Compiler - JavaScript', () => {
  it('compiles a number assignment', () => {
    const result = compileProgram('set x = 42', { target: 'web' });
    expect(result.javascript).toContain('let x = 42;');
  });

  it('compiles a string assignment', () => {
    const result = compileProgram('set name = "Alice"', { target: 'web' });
    expect(result.javascript).toContain('let name = "Alice";');
  });

  it('compiles arithmetic', () => {
    const result = compileProgram('set result = a + b', { target: 'web' });
    expect(result.javascript).toContain('let result = (a + b);');
  });

  it('compiles ^ as power operator (**)', () => {
    const result = compileProgram('set result = 2 ^ 10', { target: 'web' });
    expect(result.javascript).toContain('let result = (2 ** 10);');
  });

  it('^ and ** produce identical output', () => {
    const r1 = compileProgram('set result = x ^ y', { target: 'web' });
    const r2 = compileProgram('set result = x ** y', { target: 'web' });
    expect(r1.javascript).toBe(r2.javascript);
  });

  it('^ and "to the power of" produce identical output', () => {
    const r1 = compileProgram('set result = x ^ y', { target: 'web' });
    const r2 = compileProgram('set result = x to the power of y', { target: 'web' });
    expect(r1.javascript).toBe(r2.javascript);
  });

  it('compiles show as console.log', () => {
    const result = compileProgram('show x', { target: 'web' });
    expect(result.javascript).toContain('console.log(x);');
  });

  it('compiles comments as JS comments', () => {
    const result = compileProgram('# hello', { target: 'web' });
    expect(result.javascript).toContain('// hello');
  });

  it('compiles a list literal', () => {
    const result = compileProgram('set items = [1, 2, 3]', { target: 'web' });
    expect(result.javascript).toContain('let items = [1, 2, 3];');
  });

  it('compiles if/then/otherwise', () => {
    const result = compileProgram(
      'if x > 10 then set result = "high" otherwise set result = "low"',
      { target: 'web' }
    );
    expect(result.javascript).toContain('if (x > 10)');
    expect(result.javascript).toContain('let result = "high"');
    expect(result.javascript).toContain('else');
    expect(result.javascript).toContain('let result = "low"');
  });

  it('maps sum() to _clear_sum()', () => {
    const result = compileProgram('set total = sum(a, b, c)', { target: 'web' });
    expect(result.javascript).toContain('_clear_sum(a, b, c)');
  });
});

// =============================================================================
// COMPILER - PYTHON
// =============================================================================

describe('Compiler - Python', () => {
  it('compiles a number assignment (no semicolon, no let)', () => {
    const result = compileProgram('set x = 42', { target: 'backend' });
    expect(result.python).toContain('x = 42');
    // Python output should not contain JS artifacts
    expect(result.python.includes('let')).toBe(false);
    expect(result.python.includes(';')).toBe(false);
  });

  it('compiles show as print()', () => {
    const result = compileProgram('show x', { target: 'backend' });
    expect(result.python).toContain('print(x)');
  });

  it('compiles comments as Python comments', () => {
    const result = compileProgram('# hello', { target: 'backend' });
    expect(result.python).toContain('# hello');
  });

  it('compiles booleans as True/False', () => {
    const result = compileProgram('set active = true', { target: 'backend' });
    expect(result.python).toContain('active = True');
  });

  it('compiles nothing as None', () => {
    const result = compileProgram('set x = nothing', { target: 'backend' });
    expect(result.python).toContain('x = None');
  });

  it('maps && to "and" and || to "or"', () => {
    const result = compileProgram('set result = a and b', { target: 'backend' });
    expect(result.python).toContain('and');
  });

  it('maps sum() to Python built-in sum()', () => {
    const result = compileProgram('set total = sum(a, b)', { target: 'backend' });
    expect(result.python).toContain('sum(a, b)');
  });

  it('maps abs() to Python built-in abs()', () => {
    const result = compileProgram('set val = abs(x)', { target: 'backend' });
    expect(result.python).toContain('abs(x)');
  });
});

// =============================================================================
// COMPILER - DUAL TARGET
// =============================================================================

describe('Compiler - Both Targets', () => {
  it('produces both JS and Python when target is "both"', () => {
    const result = compileProgram('set x = 42', { target: 'both' });
    expect(result.javascript).toContain('let x = 42;');
    expect(result.python).toContain('x = 42');
  });

  it('uses AST target when no override given', () => {
    const result = compileProgram('target: backend\nset x = 42');
    expect(result.python).toBeDefined();
    // Backend target now generates both JS (Express) and Python (FastAPI)
    expect(result.javascript).toBeDefined();
  });
});

// =============================================================================
// DETERMINISM — Same input always produces the same output
// =============================================================================

describe('Deterministic Compilation', () => {
  it('produces identical output on repeated compilations', () => {
    const source = `
target: both
set price = 100
set tax = price * 0.08
set total = price + tax
show total
    `;
    const result1 = compileProgram(source);
    const result2 = compileProgram(source);
    expect(result1.javascript).toBe(result2.javascript);
    expect(result1.python).toBe(result2.python);
  });
});

// =============================================================================
// END-TO-END: Full programs
// =============================================================================

describe('End-to-End Programs', () => {
  it('compiles a tax calculator to JS', () => {
    const source = `
target: web
# Simple tax calculator
set price = 100
set tax_rate = 0.08
set tax = price * tax_rate
set total = price + tax
show total
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('let price = 100;');
    expect(result.javascript).toContain('let tax_rate = 0.08;');
    expect(result.javascript).toContain('let tax = (price * tax_rate);');
    expect(result.javascript).toContain('let total = (price + tax);');
    expect(result.javascript).toContain('console.log(total);');
  });

  it('compiles a tax calculator to Python', () => {
    const source = `
target: backend
set price = 100
set tax_rate = 0.08
set tax = price * tax_rate
set total = price + tax
show total
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('price = 100');
    expect(result.python).toContain('tax = (price * tax_rate)');
    expect(result.python).toContain('print(total)');
  });

  it('synonym equivalence: all synonyms produce the same AST', () => {
    const programs = [
      'set x = 5',
      'create x = 5',
      'initialize x = 5',
      'make x = 5',
      'let x = 5',
    ];

    const results = programs.map(p => {
      const ast = compileProgram(p, { target: 'web' });
      return ast.javascript;
    });

    // All should produce the same JavaScript
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBe(results[0]);
    }
  });
});

// =============================================================================
// PHASE 1: FUNCTIONS
// =============================================================================

describe('Parser - Function Definitions', () => {
  it('parses a simple function with one param', () => {
    const source = `function greet with name\n  set message = "Hello"\n  return message`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    expect(ast.body).toHaveLength(1);
    const fn = ast.body[0];
    expect(fn.type).toBe(NodeType.FUNCTION_DEF);
    expect(fn.name).toBe('greet');
    expect(fn.params).toHaveLength(1);
    expect(fn.params[0]).toBe('name');
    expect(fn.body).toHaveLength(2);
  });

  it('parses a function with multiple params', () => {
    const source = `function add with a, b\n  return a`;
    const ast = parse(source);
    const fn = ast.body[0];
    expect(fn.params).toHaveLength(2);
    expect(fn.params[0]).toBe('a');
    expect(fn.params[1]).toBe('b');
  });

  it('parses a function with no params (no "with" clause)', () => {
    const source = `function say_hello\n  show "hello"`;
    const ast = parse(source);
    const fn = ast.body[0];
    expect(fn.type).toBe(NodeType.FUNCTION_DEF);
    expect(fn.params).toHaveLength(0);
    expect(fn.body).toHaveLength(1);
  });

  it('parses return statement', () => {
    const source = `function double with x\n  set result = x * 2\n  return result`;
    const ast = parse(source);
    const fn = ast.body[0];
    const ret = fn.body[1];
    expect(ret.type).toBe(NodeType.RETURN);
    expect(ret.expression.type).toBe(NodeType.VARIABLE_REF);
  });

  it('parses function followed by top-level code', () => {
    const source = `function greet with name\n  return name\nset result = greet("World")\nshow result`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    expect(ast.body).toHaveLength(3); // function + assign + show
    expect(ast.body[0].type).toBe(NodeType.FUNCTION_DEF);
    expect(ast.body[1].type).toBe(NodeType.ASSIGN);
    expect(ast.body[2].type).toBe(NodeType.SHOW);
  });

  it('reports error for function with no body', () => {
    const source = `function empty`;
    const ast = parse(source);
    expect(ast.errors.length > 0).toBe(true);
  });
});

describe('Compiler - Functions (JS)', () => {
  it('compiles a function definition to JS', () => {
    const source = `function greet with name\n  set message = "Hello"\n  return message`;
    const result = compileProgram(source, { target: 'web' });
    expect(result.javascript).toContain('function greet(name)');
    expect(result.javascript).toContain('let message = "Hello"');
    expect(result.javascript).toContain('return message;');
  });

  it('compiles a function with no params', () => {
    const source = `function say_hello\n  show "hello"`;
    const result = compileProgram(source, { target: 'web' });
    expect(result.javascript).toContain('function say_hello()');
  });

  it('compiles a function call in an expression', () => {
    const source = `function double with x\n  return x\nset y = double(5)`;
    const result = compileProgram(source, { target: 'web' });
    expect(result.javascript).toContain('let y = double(5);');
  });
});

describe('Compiler - Functions (Python)', () => {
  it('compiles a function definition to Python', () => {
    const source = `function greet with name\n  set message = "Hello"\n  return message`;
    const result = compileProgram(source, { target: 'backend' });
    expect(result.python).toContain('def greet(name):');
    expect(result.python).toContain('message = "Hello"');
    expect(result.python).toContain('return message');
  });
});

// =============================================================================
// PHASE 1: LOOPS
// =============================================================================

describe('Parser - Repeat Loop', () => {
  it('parses repeat N times', () => {
    const source = `repeat 5 times\n  show "hello"`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    expect(ast.body).toHaveLength(1);
    const loop = ast.body[0];
    expect(loop.type).toBe(NodeType.REPEAT);
    expect(loop.count.value).toBe(5);
    expect(loop.body).toHaveLength(1);
  });

  it('reports error without "times" keyword', () => {
    const source = `repeat 5\n  show "hello"`;
    const ast = parse(source);
    expect(ast.errors.length > 0).toBe(true);
  });
});

describe('Parser - For Each Loop', () => {
  it('parses for each item in list', () => {
    const source = `for each item in items\n  show item`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    const loop = ast.body[0];
    expect(loop.type).toBe(NodeType.FOR_EACH);
    expect(loop.variable).toBe('item');
    expect(loop.iterable.name).toBe('items');
    expect(loop.body).toHaveLength(1);
  });

  it('parses for each with list literal', () => {
    const source = `for each x in [1, 2, 3]\n  show x`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    const loop = ast.body[0];
    expect(loop.iterable.type).toBe(NodeType.LITERAL_LIST);
  });
});

describe('Parser - While Loop', () => {
  it('parses while with condition', () => {
    const source = `while x > 0\n  set x = x - 1`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    const loop = ast.body[0];
    expect(loop.type).toBe(NodeType.WHILE);
    expect(loop.condition.operator).toBe('>');
    expect(loop.body).toHaveLength(1);
  });

  it('parses while with English comparison', () => {
    const source = `while counter is less than 10\n  set counter = counter + 1`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].condition.operator).toBe('<');
  });
});

describe('Parser - Break and Continue', () => {
  it('parses break inside a loop', () => {
    const source = `repeat 10 times\n  break`;
    const ast = parse(source);
    expect(ast.body[0].body[0].type).toBe(NodeType.BREAK);
  });

  it('parses continue inside a loop', () => {
    const source = `repeat 10 times\n  continue`;
    const ast = parse(source);
    expect(ast.body[0].body[0].type).toBe(NodeType.CONTINUE);
  });
});

describe('Compiler - Loops (JS)', () => {
  it('compiles repeat to for loop', () => {
    const source = `repeat 3 times\n  show "hi"`;
    const result = compileProgram(source, { target: 'web' });
    expect(result.javascript).toContain('for (let _i = 0; _i < 3; _i++)');
    expect(result.javascript).toContain('console.log("hi")');
  });

  it('compiles for-each to for-of', () => {
    const source = `for each item in items\n  show item`;
    const result = compileProgram(source, { target: 'web' });
    expect(result.javascript).toContain('for (const item of items)');
    expect(result.javascript).toContain('console.log(item)');
  });

  it('compiles while loop', () => {
    const source = `while x > 0\n  set x = x - 1`;
    const result = compileProgram(source, { target: 'web' });
    expect(result.javascript).toContain('while (x > 0)');
    expect(result.javascript).toContain('let x = (x - 1);');
  });

  it('compiles break and continue', () => {
    const source = `repeat 10 times\n  break`;
    const result = compileProgram(source, { target: 'web' });
    expect(result.javascript).toContain('break;');
  });
});

describe('Compiler - Loops (Python)', () => {
  it('compiles repeat to range loop', () => {
    const source = `repeat 3 times\n  show "hi"`;
    const result = compileProgram(source, { target: 'backend' });
    expect(result.python).toContain('for _i in range(3):');
    expect(result.python).toContain('print("hi")');
  });

  it('compiles for-each to for-in', () => {
    const source = `for each item in items\n  show item`;
    const result = compileProgram(source, { target: 'backend' });
    expect(result.python).toContain('for item in items:');
  });

  it('compiles while loop', () => {
    const source = `while x > 0\n  set x = x - 1`;
    const result = compileProgram(source, { target: 'backend' });
    expect(result.python).toContain('while x > 0:');
  });

  it('compiles break and continue', () => {
    const source = `repeat 10 times\n  break`;
    const result = compileProgram(source, { target: 'backend' });
    expect(result.python).toContain('break');
  });
});

// =============================================================================
// PHASE 1: END-TO-END with functions + loops
// =============================================================================

describe('End-to-End - Functions + Loops', () => {
  it('compiles a function with a loop to JS', () => {
    const source = `
function sum_list with numbers
  set total = 0
  for each n in numbers
    set total = total + n
  return total

set result = sum_list([1, 2, 3])
show result
    `;
    const result = compileProgram(source, { target: 'web' });
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('function sum_list(numbers)');
    expect(result.javascript).toContain('for (const n of numbers)');
    expect(result.javascript).toContain('return total;');
    expect(result.javascript).toContain('let result = sum_list([1, 2, 3]);');
  });

  it('compiles a function with a loop to Python', () => {
    const source = `
function sum_list with numbers
  set total = 0
  for each n in numbers
    set total = total + n
  return total

set result = sum_list([1, 2, 3])
show result
    `;
    const result = compileProgram(source, { target: 'backend' });
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('def sum_list(numbers):');
    expect(result.python).toContain('for n in numbers:');
    expect(result.python).toContain('return total');
    expect(result.python).toContain('result = sum_list([1, 2, 3])');
  });

  it('compiles FizzBuzz to both targets', () => {
    const source = `
target: both
function fizzbuzz with n
  repeat n times
    show "fizz"

fizzbuzz(15)
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('function fizzbuzz(n)');
    expect(result.python).toContain('def fizzbuzz(n):');
  });
});

// =============================================================================
// ROUND 2 SYNTAX: Natural language improvements
// =============================================================================

describe('"is" as assignment', () => {
  it('parses "price is 100" as assignment', () => {
    const ast = parse('price is 100');
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.ASSIGN);
    expect(ast.body[0].name).toBe('price');
    expect(ast.body[0].expression.value).toBe(100);
  });

  it('parses "name is Alice" with string', () => {
    const ast = parse('name is "Alice"');
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.ASSIGN);
    expect(ast.body[0].expression.value).toBe('Alice');
  });

  it('parses "total is price + tax" with expression', () => {
    const ast = parse('total is price + tax');
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.BINARY_OP);
  });

  it('compiles "price is 100" to JS', () => {
    const result = compileProgram('price is 100', { target: 'web' });
    expect(result.javascript).toContain('let price = 100;');
  });

  it('compiles "price is 100" to Python', () => {
    const result = compileProgram('price is 100', { target: 'backend' });
    expect(result.python).toContain('price = 100');
  });

  it('"is" still means comparison inside if/then', () => {
    const ast = parse('if x is 5 then show "yes"');
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.IF_THEN);
    expect(ast.body[0].condition.operator).toBe('==');
  });
});

describe('"to" as function definition', () => {
  it('parses "to greet with name" as function def', () => {
    const source = `to greet with name\n  give back "hello"`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.FUNCTION_DEF);
    expect(ast.body[0].name).toBe('greet');
    expect(ast.body[0].params[0]).toBe('name');
  });

  it('compiles "to double with x" to JS', () => {
    const source = `to double with x\n  give back x * 2`;
    const result = compileProgram(source, { target: 'web' });
    expect(result.javascript).toContain('function double(x)');
    expect(result.javascript).toContain('return (x * 2);');
  });

  it('compiles "to double with x" to Python', () => {
    const source = `to double with x\n  give back x * 2`;
    const result = compileProgram(source, { target: 'backend' });
    expect(result.python).toContain('def double(x):');
    expect(result.python).toContain('return (x * 2)');
  });
});

describe('"give back" as return', () => {
  it('parses "give back message" as return', () => {
    const source = `to greet with name\n  give back name`;
    const ast = parse(source);
    const ret = ast.body[0].body[0];
    expect(ret.type).toBe(NodeType.RETURN);
  });
});

describe('increase / decrease', () => {
  it('parses "increase counter by 1"', () => {
    const ast = parse('increase counter by 1');
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.ASSIGN);
    expect(ast.body[0].name).toBe('counter');
    expect(ast.body[0].expression.operator).toBe('+');
  });

  it('parses "decrease lives by 1"', () => {
    const ast = parse('decrease lives by 1');
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.operator).toBe('-');
  });

  it('compiles "increase counter by 1" to JS', () => {
    const result = compileProgram('increase counter by 1', { target: 'web' });
    expect(result.javascript).toContain('let counter = (counter + 1);');
  });

  it('compiles "decrease lives by 1" to Python', () => {
    const result = compileProgram('decrease lives by 1', { target: 'backend' });
    expect(result.python).toContain('lives = (lives - 1)');
  });

  it('works with expressions: "increase score by bonus * 2"', () => {
    const ast = parse('increase score by bonus * 2');
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.right.operator).toBe('*');
  });

  it('reports error without "by"', () => {
    const ast = parse('increase counter 1');
    expect(ast.errors.length > 0).toBe(true);
  });
});

describe('End-to-End: Natural language style', () => {
  it('compiles a fully natural-language program to JS', () => {
    const source = `
target: web

# Tip calculator
bill is 50
tip_percent is 18
tip is bill * tip_percent / 100
total is bill + tip

show total
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('let bill = 50;');
    expect(result.javascript).toContain('let tip_percent = 18;');
    expect(result.javascript).toContain('let tip = ((bill * tip_percent) / 100);');
    expect(result.javascript).toContain('let total = (bill + tip);');
  });

  it('compiles a natural-language function with loop to both targets', () => {
    const source = `
target: both

to count_down with start
  set n = start
  while n is greater than 0
    show n
    decrease n by 1
  give back "done"

count_down(5)
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('function count_down(start)');
    expect(result.javascript).toContain('return "done";');
    expect(result.python).toContain('def count_down(start):');
    expect(result.python).toContain('return "done"');
  });

  it('all assignment styles produce the same output', () => {
    const styles = [
      'x = 42',           // bare assignment
      'set x = 42',       // set keyword
      'x is 42',          // natural "is"
      'create x = 42',    // synonym
      'let x = 42',       // synonym
      'make x = 42',      // synonym
    ];
    const results = styles.map(s => compileProgram(s, { target: 'web' }).javascript);
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBe(results[0]);
    }
  });
});

// =============================================================================
// PHASE 2: OBJECTS (Records)
// =============================================================================

describe('Parser - Object Definition', () => {
  it('parses "person is" with indented fields', () => {
    const source = `person is\n  name is "Alice"\n  age is 30`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    expect(ast.body).toHaveLength(1);
    const node = ast.body[0];
    expect(node.type).toBe(NodeType.ASSIGN);
    expect(node.name).toBe('person');
    expect(node.expression.type).toBe(NodeType.LITERAL_RECORD);
    expect(node.expression.entries).toHaveLength(2);
    expect(node.expression.entries[0].key).toBe('name');
    expect(node.expression.entries[1].key).toBe('age');
  });

  it('parses object with = syntax for fields', () => {
    const source = `config is\n  width = 800\n  height = 600`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.entries).toHaveLength(2);
  });

  it('parses object followed by more code', () => {
    const source = `person is\n  name is "Alice"\nshow person`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    expect(ast.body).toHaveLength(2);
    expect(ast.body[0].expression.type).toBe(NodeType.LITERAL_RECORD);
    expect(ast.body[1].type).toBe(NodeType.SHOW);
  });
});

describe('Parser - Dot Access', () => {
  it('parses person.name in expression', () => {
    const source = `show person.name`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    const expr = ast.body[0].expression;
    expect(expr.type).toBe(NodeType.MEMBER_ACCESS);
    expect(expr.member).toBe('name');
  });

  it('parses chained dot access: person.address.city', () => {
    const source = `show person.address.city`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    const expr = ast.body[0].expression;
    expect(expr.type).toBe(NodeType.MEMBER_ACCESS);
    expect(expr.member).toBe('city');
    expect(expr.object.type).toBe(NodeType.MEMBER_ACCESS);
    expect(expr.object.member).toBe('address');
  });

  it('parses dot assignment: person.name is "Bob"', () => {
    const source = `person.name is "Bob"`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.ASSIGN);
    expect(ast.body[0].name).toBe('person.name');
  });
});

describe('Compiler - Objects (JS)', () => {
  it('compiles object definition to JS', () => {
    const source = `person is\n  name is "Alice"\n  age is 30`;
    const result = compileProgram(source, { target: 'web' });
    expect(result.javascript).toContain('let person = { name: "Alice", age: 30 };');
  });

  it('compiles dot access to JS', () => {
    const result = compileProgram('show person.name', { target: 'web' });
    expect(result.javascript).toContain('console.log(person.name);');
  });

  it('compiles dot assignment to JS', () => {
    const result = compileProgram('person.name is "Bob"', { target: 'web' });
    expect(result.javascript).toContain('person.name = "Bob";');
  });
});

describe('Compiler - Objects (Python)', () => {
  it('compiles object definition to Python dict', () => {
    const source = `person is\n  name is "Alice"\n  age is 30`;
    const result = compileProgram(source, { target: 'backend' });
    expect(result.python).toContain('person = { "name": "Alice", "age": 30 }');
  });

  it('compiles dot access to Python bracket notation', () => {
    const result = compileProgram('show person.name', { target: 'backend' });
    expect(result.python).toContain('print(person["name"])');
  });

  it('compiles dot assignment to Python bracket notation', () => {
    const result = compileProgram('person.name is "Bob"', { target: 'backend' });
    expect(result.python).toContain('person["name"] = "Bob"');
  });
});

// =============================================================================
// PHASE 2: STRING OPERATIONS
// =============================================================================

describe('Compiler - String Functions (JS)', () => {
  it('maps uppercase() to JS', () => {
    const result = compileProgram('x is uppercase("hello")', { target: 'web' });
    expect(result.javascript).toContain('_clear_uppercase("hello")');
  });

  it('maps split() to JS', () => {
    const result = compileProgram('parts is split("a,b", ",")', { target: 'web' });
    expect(result.javascript).toContain('_clear_split("a,b", ",")');
  });

  it('maps join() to JS', () => {
    const result = compileProgram('text is join(words, " ")', { target: 'web' });
    expect(result.javascript).toContain('_clear_join(words, " ")');
  });
});

// =============================================================================
// PHASE 2: END-TO-END
// =============================================================================

describe('End-to-End - Objects + Strings', () => {
  it('compiles a program with objects to both targets', () => {
    const source = `
target: both

person is
  name is "Alice"
  age is 30

show person.name
person.age is 31
show person.age
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('let person = { name: "Alice", age: 30 };');
    expect(result.javascript).toContain('console.log(person.name);');
    expect(result.javascript).toContain('person.age = 31;');
    expect(result.python).toContain('person = { "name": "Alice", "age": 30 }');
    expect(result.python).toContain('print(person["name"])');
    expect(result.python).toContain('person["age"] = 31');
  });

  it('"define" now means function, not assignment', () => {
    const source = `define greet with name\n  return name`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.FUNCTION_DEF);
    expect(ast.body[0].name).toBe('greet');
  });
});

// =============================================================================
// CANONICAL SYNTAX: build for, create objects, define function with input(s)
// =============================================================================

describe('"build for" target declaration', () => {
  it('parses "build for web"', () => {
    const ast = parse('build for web');
    expect(ast.target).toBe('web');
    expect(ast.errors).toHaveLength(0);
  });

  it('parses "build for backend"', () => {
    const ast = parse('build for backend');
    expect(ast.target).toBe('backend');
  });

  it('parses "build for both"', () => {
    const ast = parse('build for both');
    expect(ast.target).toBe('both');
  });

  it('"target: web" still works as alias', () => {
    const ast = parse('target: web');
    expect(ast.target).toBe('web');
  });

  it('"build for web" and "target: web" produce same output', () => {
    const r1 = compileProgram('build for web\nshow 42');
    const r2 = compileProgram('target: web\nshow 42');
    expect(r1.javascript).toBe(r2.javascript);
  });
});

// =============================================================================
// THEME DIRECTIVE
// =============================================================================

describe('theme directive', () => {
  it('parses theme \'midnight\'', () => {
    const ast = parse("theme 'midnight'");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.THEME);
    expect(ast.body[0].name).toBe('midnight');
  });

  it('parses theme \'ivory\'', () => {
    const ast = parse("theme 'ivory'");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.THEME);
    expect(ast.body[0].name).toBe('ivory');
  });

  it('parses theme \'nova\'', () => {
    const ast = parse("theme 'nova'");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.THEME);
    expect(ast.body[0].name).toBe('nova');
  });

  it('rejects unknown theme names', () => {
    const ast = parse("theme 'neon'");
    expect(ast.errors.length).toBeGreaterThan(0);
    expect(ast.errors[0].message).toContain('neon');
  });

  it('errors on missing theme name', () => {
    const ast = parse("theme");
    expect(ast.errors.length).toBeGreaterThan(0);
    expect(ast.errors[0].message).toContain('needs a name');
  });

  it('sets data-theme in compiled HTML output', () => {
    const source = "build for web\ntheme 'midnight'\npage 'Test' at '/':\n  text 'Hello'";
    const result = compileProgram(source);
    expect(result.html).toContain('data-theme="midnight"');
  });

  it('defaults to ivory when no theme directive', () => {
    const source = "build for web\npage 'Test' at '/':\n  text 'Hello'";
    const result = compileProgram(source);
    expect(result.html).toContain('data-theme="ivory"');
  });

  it('compileNode returns null (directive, no code)', () => {
    const node = { type: NodeType.THEME, name: 'nova', line: 1 };
    const ctx = { lang: 'js', indent: 0, declared: new Set(), stateVars: new Set() };
    const result = compileNode(node, ctx);
    expect(result).toBe(null);
  });
});

// =============================================================================
// APP LAYOUT PRESETS
// =============================================================================

describe('app layout presets', () => {
  it('app_layout preset produces h-screen flex container', () => {
    const source = `build for web
page 'App' at '/':
  section 'Layout' with style app_layout:
    text 'Hello'`;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('flex h-screen overflow-hidden');
  });

  it('app_sidebar preset produces menu with fixed width', () => {
    const source = `build for web
page 'App' at '/':
  section 'Layout' with style app_layout:
    section 'Nav' with style app_sidebar:
      text 'Menu'`;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('w-64 shrink-0');
  });

  it('app_main preset produces flex column', () => {
    const source = `build for web
page 'App' at '/':
  section 'Layout' with style app_layout:
    section 'Right' with style app_main:
      text 'Content'`;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('flex-1 flex flex-col overflow-hidden min-w-0');
  });

  it('app_header preset produces sticky navbar', () => {
    const source = `build for web
page 'App' at '/':
  section 'Layout' with style app_layout:
    section 'Right' with style app_main:
      section 'Top' with style app_header:
        heading 'Dashboard'`;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('sticky top-0 z-20');
  });

  it('app_content preset produces scrollable area', () => {
    const source = `build for web
page 'App' at '/':
  section 'Layout' with style app_layout:
    section 'Right' with style app_main:
      section 'Body' with style app_content:
        text 'Scrollable'`;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('overflow-y-auto');
  });

  it('app_card preset produces bordered card', () => {
    const source = `build for web
page 'App' at '/':
  section 'Info' with style app_card:
    text 'Card content'`;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('rounded-box p-6');
  });

  it('app presets skip max-width wrapper', () => {
    const source = `build for web
page 'App' at '/':
  section 'Nav' with style app_sidebar:
    text 'Menu'`;
    const result = compileProgram(source);
    // app_sidebar should NOT have max-w-5xl wrapper
    const sidebarIdx = result.html.indexOf('w-64 shrink-0');
    const nearbyHtml = result.html.slice(sidebarIdx - 100, sidebarIdx + 200);
    expect(nearbyHtml).not.toContain('max-w-5xl');
  });

  it('hero presets use centered flex layout without max-width wrapper', () => {
    const source = `build for web
page 'App' at '/':
  section 'Hero' with style page_hero:
    heading 'Welcome'`;
    const result = compileProgram(source);
    expect(result.html).toContain('flex flex-col items-center');
    expect(result.html).toContain('font-display text-6xl');
  });

  it('full dashboard layout compiles end-to-end', () => {
    const source = `build for web
theme 'midnight'
page 'Dashboard' at '/':
  section 'Layout' with style app_layout:
    section 'Nav' with style app_sidebar:
      heading 'Menu'
      text 'Projects'
    section 'Right' with style app_main:
      section 'Top' with style app_header:
        heading 'Dashboard'
      section 'Body' with style app_content:
        section 'Info' with style app_card:
          text 'Hello World'`;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('data-theme="midnight"');
    expect(result.html).toContain('flex h-screen');
    expect(result.html).toContain('w-64');
    expect(result.html).toContain('sticky top-0');
    expect(result.html).toContain('overflow-y-auto');
    expect(result.html).toContain('rounded-box p-6');
  });
});

describe('"create" for objects', () => {
  it('parses "create person" with indented fields', () => {
    const source = `create person\n  name is "Alice"\n  age is 30`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.ASSIGN);
    expect(ast.body[0].name).toBe('person');
    expect(ast.body[0].expression.type).toBe(NodeType.LITERAL_RECORD);
    expect(ast.body[0].expression.entries).toHaveLength(2);
  });

  it('"person is" + fields still works as alias', () => {
    const source = `person is\n  name is "Alice"`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.LITERAL_RECORD);
  });

  it('"create" + indented block and "person is" + fields produce same output', () => {
    const r1 = compileProgram('create person\n  name is "Alice"', { target: 'web' });
    const r2 = compileProgram('person is\n  name is "Alice"', { target: 'web' });
    expect(r1.javascript).toBe(r2.javascript);
  });

  it('"create x = 5" still works as assignment (no indented block)', () => {
    const ast = parse('create x = 5');
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.ASSIGN);
    expect(ast.body[0].expression.type).toBe(NodeType.LITERAL_NUMBER);
  });
});

describe('"define function" with input(s)', () => {
  it('parses "define function greet with input name"', () => {
    const source = `define function greet with input name\n  return name`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.FUNCTION_DEF);
    expect(ast.body[0].name).toBe('greet');
    expect(ast.body[0].params).toHaveLength(1);
    expect(ast.body[0].params[0]).toBe('name');
  });

  it('parses "define function add with inputs a, b" (plural)', () => {
    const source = `define function add with inputs a, b\n  return a`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].params).toHaveLength(2);
  });

  it('parses "define function say_hello" with no params', () => {
    const source = `define function say_hello\n  show "hi"`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].params).toHaveLength(0);
  });

  it('"function greet with name" still works as alias', () => {
    const source = `function greet with name\n  return name`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.FUNCTION_DEF);
  });

  it('canonical and alias produce same output', () => {
    const r1 = compileProgram('define function greet with input name\n  return name', { target: 'web' });
    const r2 = compileProgram('function greet with name\n  return name', { target: 'web' });
    expect(r1.javascript).toBe(r2.javascript);
  });
});

describe('End-to-End: Canonical Clear program', () => {
  it('compiles the canonical sample program', () => {
    const source = `
build for both

# Contact card
create person
  name is "Alice"
  age is 30

define function greet with input someone
  greeting is "Hello, " + someone.name
  return greeting

message is greet(person)
show message
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('let person = { name: "Alice", age: 30 };');
    expect(result.javascript).toContain('function greet(someone)');
    expect(result.javascript).toContain('let message = greet(person);');
    expect(result.python).toContain('person = { "name": "Alice", "age": 30 }');
    expect(result.python).toContain('def greet(someone):');
    expect(result.python).toContain('message = greet(person)');
  });
});

// =============================================================================
// POSSESSIVE 'S SYNTAX
// =============================================================================

describe("Possessive 's access", () => {
  it("parses person's name in expression", () => {
    const ast = parse("show person's name");
    expect(ast.errors).toHaveLength(0);
    const expr = ast.body[0].expression;
    expect(expr.type).toBe(NodeType.MEMBER_ACCESS);
    expect(expr.member).toBe('name');
  });

  it("compiles person's name to JS dot notation", () => {
    const result = compileProgram("show person's name", { target: 'web' });
    expect(result.javascript).toContain('console.log(person.name);');
  });

  it("compiles person's name to Python bracket notation", () => {
    const result = compileProgram("show person's name", { target: 'backend' });
    expect(result.python).toContain('print(person["name"])');
  });

  it("parses possessive assignment: person's age is 31", () => {
    const ast = parse("person's age is 31");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.ASSIGN);
    expect(ast.body[0].name).toBe('person.age');
  });

  it("compiles possessive assignment to JS", () => {
    const result = compileProgram("person's age is 31", { target: 'web' });
    expect(result.javascript).toContain('person.age = 31;');
  });

  it("compiles possessive assignment to Python", () => {
    const result = compileProgram("person's age is 31", { target: 'backend' });
    expect(result.python).toContain('person["age"] = 31');
  });

  it("possessive and dot produce same output", () => {
    const r1 = compileProgram("show person's name", { target: 'web' });
    const r2 = compileProgram("show person.name", { target: 'web' });
    expect(r1.javascript).toBe(r2.javascript);
  });

  it("one-per-line chaining works", () => {
    const source = `
create person:
  address is 'home'
address is person's address
city is address's city
show city
    `;
    const result = compileProgram(source, { target: 'web' });
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('let address = person.address;');
    expect(result.javascript).toContain('let city = address.city;');
  });
});

// =============================================================================
// ERROR MESSAGE QUALITY
// =============================================================================

describe('Error messages are helpful (legacy checks)', () => {
  it('function name missing', () => {
    const ast = parse('define function');
    expect(ast.errors[0].message).toContain('missing a name');
  });

  it('repeat missing times', () => {
    const ast = parse('repeat 5\n  show "hi"');
    expect(ast.errors[0].message).toContain("doesn't know how many times");
  });

  it('increase missing by', () => {
    const ast = parse('increase counter 1');
    expect(ast.errors[0].message).toContain("doesn't know how much");
  });

  it('unknown platform', () => {
    const ast = parse('build for mars');
    expect(ast.errors[0].message).toContain("isn't a platform");
  });

  it('unclosed parenthesis', () => {
    const ast = parse('x is add(1, 2');
    expect(ast.errors[0].message).toContain('unclosed');
  });

  it('unclosed bracket', () => {
    const ast = parse('x is [1, 2, 3');
    expect(ast.errors[0].message).toContain('unclosed');
  });
});

// =============================================================================
// PHASE 3: TRY / HANDLE
// =============================================================================

describe('Parser - Try / If There\'s an Error', () => {
  it('parses canonical "try:" + "if there\'s an error:"', () => {
    const source = `try:\n  show 100 / 0\nif there's an error:\n  show "oops"`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    expect(ast.body).toHaveLength(1);
    const node = ast.body[0];
    expect(node.type).toBe('try_handle');
    expect(node.tryBody).toHaveLength(1);
    expect(node.handleBody).toHaveLength(1);
    expect(node.errorVar).toBe('error');
  });

  it('parses shorter synonym "if error:"', () => {
    const source = `try:\n  show 100 / 0\nif error:\n  show "oops"`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe('try_handle');
  });

  it('"handle the error" still works as alias', () => {
    const source = `try\n  show 100 / 0\nhandle the error\n  show "oops"`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe('try_handle');
  });

  it('all error handler styles produce same output', () => {
    const styles = [
      `try:\n  x is 1\nif there's an error:\n  show "oops"`,
      `try:\n  x is 1\nif error:\n  show "oops"`,
      `try\n  x is 1\nhandle the error\n  show "oops"`,
    ];
    const results = styles.map(s => compileProgram(s, { target: 'web' }).javascript);
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBe(results[0]);
    }
  });
});

describe('Compiler - Try/Error (JS)', () => {
  it('compiles to try/catch', () => {
    const source = `try:\n  x is 100 / 0\nif there's an error:\n  show "oops"`;
    const result = compileProgram(source, { target: 'web' });
    expect(result.javascript).toContain('try {');
    expect(result.javascript).toContain('} catch (error) {');
    expect(result.javascript).toContain('console.log("oops")');
  });
});

describe('Compiler - Try/Error (Python)', () => {
  it('compiles to try/except', () => {
    const source = `try:\n  x is 100 / 0\nif there's an error:\n  show "oops"`;
    const result = compileProgram(source, { target: 'backend' });
    expect(result.python).toContain('try:');
    expect(result.python).toContain('except Exception as error:');
    expect(result.python).toContain('print("oops")');
  });
});

// =============================================================================
// END-TO-END: Full canonical Clear program
// =============================================================================

describe('End-to-End: Full canonical Clear', () => {
  it('compiles a complete program with all features', () => {
    const source = `
build for both

# Inventory tracker
create item
  name is "Widget"
  price is 9.99
  quantity is 100

define function total_value with input item
  value is item's price * item's quantity
  return value

worth is total_value(item)
show item's name
show worth
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('function total_value(item)');
    expect(result.javascript).toContain('item.price');
    expect(result.javascript).toContain('item.quantity');
    expect(result.python).toContain('def total_value(item):');
    expect(result.python).toContain('item["price"]');
  });
});

// =============================================================================
// MATH-STYLE FUNCTION DEFINITIONS
// =============================================================================

describe('Math-style functions: name(params) = expression', () => {
  it('parses total_value(item) = item * 2', () => {
    const ast = parse('total_value(item) = item * 2');
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.FUNCTION_DEF);
    expect(ast.body[0].name).toBe('total_value');
    expect(ast.body[0].params).toHaveLength(1);
    expect(ast.body[0].params[0]).toBe('item');
    expect(ast.body[0].body[0].type).toBe(NodeType.RETURN);
  });

  it('parses add(a, b) = a + b with multiple params', () => {
    const ast = parse('add(a, b) = a + b');
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].params).toHaveLength(2);
  });

  it('supports "is" instead of "="', () => {
    const ast = parse("total_value(item) is item's price * item's quantity");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.FUNCTION_DEF);
  });

  it('compiles to JS function', () => {
    const result = compileProgram('double(x) = x * 2', { target: 'web' });
    expect(result.javascript).toContain('function double(x)');
    expect(result.javascript).toContain('return (x * 2);');
  });

  it('compiles to Python def', () => {
    const result = compileProgram('double(x) = x * 2', { target: 'backend' });
    expect(result.python).toContain('def double(x):');
    expect(result.python).toContain('return (x * 2)');
  });

  it('math-style and define-style produce same output', () => {
    const r1 = compileProgram('double(x) = x * 2', { target: 'web' });
    const r2 = compileProgram('define function double of x:\n  return x * 2', { target: 'web' });
    expect(r1.javascript).toBe(r2.javascript);
  });

  it('works in full programs', () => {
    const source = `
total_value(item) = item's price * item's quantity

create product:
  price is 9.99
  quantity is 100

worth is total_value(product)
show worth
    `;
    const result = compileProgram(source, { target: 'web' });
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('function total_value(item)');
    expect(result.javascript).toContain('let worth = total_value(product);');
  });
});

// =============================================================================
// "OF" PARAMETER SYNTAX
// =============================================================================

describe('"of" parameter syntax', () => {
  it('parses "define function greet of name:"', () => {
    const source = `define function greet of name:\n  return name`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.FUNCTION_DEF);
    expect(ast.body[0].params[0]).toBe('name');
  });

  it('parses "define function add of a, b:"', () => {
    const source = `define function add of a, b:\n  return a`;
    const ast = parse(source);
    expect(ast.body[0].params).toHaveLength(2);
  });

  it('"of" and "with input" produce same output', () => {
    const r1 = compileProgram('define function greet of name:\n  return name', { target: 'web' });
    const r2 = compileProgram('define function greet with input name:\n  return name', { target: 'web' });
    expect(r1.javascript).toBe(r2.javascript);
  });
});

// =============================================================================
// ERROR MESSAGES: WHY-WHAT PATTERN
// =============================================================================

describe('Error messages explain WHY then WHAT', () => {
  it('function name missing: explains what is wrong', () => {
    const ast = parse('define function');
    expect(ast.errors[0].message).toContain('missing a name');
  });

  it('repeat missing "times": explains why', () => {
    const ast = parse('repeat 5\n  show "hi"');
    expect(ast.errors[0].message).toContain("doesn't know how many times");
  });

  it('increase missing "by": explains why', () => {
    const ast = parse('increase counter 1');
    expect(ast.errors[0].message).toContain("doesn't know how much");
  });

  it('unknown platform: explains the problem', () => {
    const ast = parse('build for mars');
    expect(ast.errors[0].message).toContain("isn't a platform");
  });

  it('unclosed parenthesis: explains what happened', () => {
    const ast = parse('x is add(1, 2');
    expect(ast.errors[0].message).toContain('unclosed');
  });

  it('unclosed bracket: explains what happened', () => {
    const ast = parse('x is [1, 2, 3');
    expect(ast.errors[0].message).toContain('unclosed');
  });

  it('empty try block: explains why', () => {
    const ast = parse("try:\nif there's an error:\n  show \"oops\"");
    expect(ast.errors[0].message).toContain('empty');
  });

  it('missing then: explains what is needed', () => {
    const ast = parse('if x is 5 show "yes"');
    expect(ast.errors[0].message).toMatch(/if-block.*empty|then/);
  });
});

// =============================================================================
// PHASE 3: USE / IMPORT MODULES
// =============================================================================

describe('use/import modules', () => {
  it('parses use "helpers"', () => {
    const ast = parse('use "helpers"');
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.USE);
    expect(ast.body[0].module).toBe('helpers');
  });

  it('compiles to JS import', () => {
    const result = compileProgram('use "math_utils"', { target: 'web' });
    expect(result.javascript).toContain("import * as math_utils from './math_utils.js'");
  });

  it('compiles to Python import', () => {
    const result = compileProgram('use "math_utils"', { target: 'backend' });
    expect(result.python).toContain('import math_utils');
  });

  it('gives helpful error for missing module name', () => {
    const ast = parse('use');
    expect(ast.errors.length > 0).toBe(true);
    expect(ast.errors[0].message).toContain('module name');
  });
});

// =============================================================================
// PHASE 4: WEB APP FEATURES
// =============================================================================

describe('page declaration', () => {
  it('parses page "My App" with body', () => {
    const source = `page "My App":\n  show "hello"`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.PAGE);
    expect(ast.body[0].title).toBe('My App');
    expect(ast.body[0].body).toHaveLength(1);
  });

  it('compiles page to JS with document.title', () => {
    const source = `page "My App":\n  show "hello"`;
    const result = compileProgram(source, { target: 'web' });
    expect(result.javascript).toContain('document.title = "My App"');
  });
});

describe('ask for (input)', () => {
  it('parses ask for price as number called "Price"', () => {
    const source = 'ask for price as number called "Price"';
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.ASK_FOR);
    expect(ast.body[0].variable).toBe('price');
    expect(ast.body[0].inputType).toBe('number');
    expect(ast.body[0].label).toBe('Price');
  });

  it('defaults to text type when no "as" specified', () => {
    const source = 'ask for name called "Your Name"';
    const ast = parse(source);
    expect(ast.body[0].inputType).toBe('text');
  });

  it('compiles to JS event listener', () => {
    const source = 'ask for price as number called "Price"';
    const result = compileProgram(source, { target: 'web' });
    expect(result.javascript).toContain('addEventListener');
    expect(result.javascript).toContain('input_price');
  });
});

describe('display', () => {
  it('parses display total as dollars called "Total"', () => {
    const source = 'display total as dollars called "Total"';
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.DISPLAY);
    expect(ast.body[0].format).toBe('dollars');
    expect(ast.body[0].label).toBe('Total');
  });

  it('compiles to JS with dollar formatting', () => {
    const source = 'display total as dollars called "Total"';
    const result = compileProgram(source, { target: 'web' });
    expect(result.javascript).toContain('toFixed(2)');
    expect(result.javascript).toContain("'$'");
  });
});

describe('button', () => {
  it('parses button with body', () => {
    const source = `button "Add One":\n  increase count by 1`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.BUTTON);
    expect(ast.body[0].label).toBe('Add One');
    expect(ast.body[0].body).toHaveLength(1);
  });

  it('compiles to JS click handler', () => {
    const source = `button "Add One":\n  increase count by 1`;
    const result = compileProgram(source, { target: 'web' });
    expect(result.javascript).toContain("addEventListener('click'");
    expect(result.javascript).toContain('_recompute()');
  });
});

describe('End-to-End: Web app', () => {
  it('compiles a complete web app (reactive mode)', () => {
    const source = `
build for web:

page "Tip Calculator":
  price is 50
  tip_rate is 0.18
  tip is price * tip_rate
  total is price + tip

  ask for price as number called "Bill Amount"
  ask for tip_rate as percent called "Tip %"

  display tip as dollars called "Tip"
  display total as dollars called "Total"
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('document.title = "Tip Calculator"');
    // Reactive mode: assignments inside _recompute, inputs wired to _state
    expect(result.javascript).toContain('function _recompute');
    expect(result.javascript).toContain('price');
    expect(result.javascript).toContain('tip_rate');
    expect(result.javascript).toContain('addEventListener');
  });
});

// =============================================================================
// PHASE 5: BACKEND FEATURES
// =============================================================================

describe('endpoint declaration (canonical: when user calls)', () => {
  it('parses when user calls GET /api/health', () => {
    const source = `when user calls GET /api/health:\n  send back "OK"`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.ENDPOINT);
    expect(ast.body[0].method).toBe('GET');
    expect(ast.body[0].path).toBe('/api/health');
  });

  it('parses when user calls POST /api/users', () => {
    const source = `when user calls POST /api/users:\n  send back "created" status 201`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].method).toBe('POST');
  });

  it('"on GET" still works as alias', () => {
    const source = `on GET /api/health:\n  send back "OK"`;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.ENDPOINT);
  });

  it('compiles to JS Express route', () => {
    const source = `build for javascript backend\nwhen user calls GET /api/health:\n  send back "OK"`;
    const result = compileProgram(source);
    expect(result.javascript).toContain("app.get('/api/health'");
    expect(result.javascript).toContain('res.json({ message: "OK" })');
  });

  it('compiles to Python FastAPI route', () => {
    const source = `when user calls GET /api/health:\n  send back "OK"`;
    const result = compileProgram(source, { target: 'backend' });
    expect(result.python).toContain('@app.get("/api/health")');
    expect(result.python).toContain('{"message": "OK"}');
  });
});

describe('send back statement', () => {
  it('parses send back expression', () => {
    const source = `when user calls GET /api/test:\n  send back "hello"`;
    const ast = parse(source);
    const respond = ast.body[0].body[0];
    expect(respond.type).toBe(NodeType.RESPOND);
  });

  it('parses send back with status code', () => {
    const source = `when user calls POST /api/test:\n  send back "created" status 201`;
    const ast = parse(source);
    const respond = ast.body[0].body[0];
    expect(respond.status).toBe(201);
  });

  it('"respond with" still works as alias', () => {
    const source = `when user calls GET /api/test:\n  respond with "hello"`;
    const ast = parse(source);
    expect(ast.body[0].body[0].type).toBe(NodeType.RESPOND);
  });

  it('compiles status code to JS', () => {
    const source = `build for javascript backend\nwhen user calls POST /api/test:\n  send back "error" status 400`;
    const result = compileProgram(source);
    expect(result.javascript).toContain('res.status(400)');
  });

  it('compiles status code to Python', () => {
    const source = `when user calls POST /api/test:\n  send back "error" status 400`;
    const result = compileProgram(source, { target: 'backend' });
    expect(result.python).toContain('status_code=400');
  });
});

describe('End-to-End: Backend API', () => {
  it('compiles a complete API with create + send back', () => {
    const source = `
build for both:

when user calls GET /api/health:
  send back "OK"

when user calls POST /api/calculate:
  price is 100
  tax is price * 0.08

  create result:
    total is price + tax
    tax_amount is tax

  send back result
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    // Full-stack: backend JS goes to serverJS, frontend JS to javascript
    const backendJS = result.serverJS || result.javascript;
    expect(backendJS).toContain("app.get('/api/health'");
    expect(backendJS).toContain("app.post('/api/calculate'");
    expect(result.python).toContain('@app.get("/api/health")');
    expect(result.python).toContain('@app.post("/api/calculate")');
  });
});

// =============================================================================
// FULL CLEAR PROGRAM: Everything together
// =============================================================================

describe('End-to-End: Complete Clear program', () => {
  it('compiles a real-world inventory app', () => {
    const source = `
build for web:

# Inventory value calculator
total_value(item) = item's price * item's quantity

create product:
  name is "Widget"
  price is 9.99
  quantity is 100

worth is total_value(product)
show product's name
show worth
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('function total_value(item)');
    expect(result.javascript).toContain('let product = { name: "Widget"');
    expect(result.javascript).toContain('let worth = total_value(product)');
  });
});

// =============================================================================
// PHASE 6: DECLARATION TRACKING (let vs reassignment)
// =============================================================================

describe('Declaration Tracking', () => {
  it('uses let for first assignment, plain = for reassignment', () => {
    const source = `
count = 0
count = 1
    `;
    const result = compileProgram(source, { target: 'web' });
    expect(result.errors).toHaveLength(0);
    const lines = result.javascript.split('\n').filter(l => l.includes('count'));
    expect(lines[0]).toContain('let count = 0');
    // Second assignment should NOT have let — it's a reassignment
    expect(lines[1].includes('let')).toBe(false);
    expect(lines[1]).toContain('count = 1');
  });

  it('treats loop variable as declared inside loop body', () => {
    const source = `
items = [1, 2, 3]
total = 0
for each item in items:
  total = total + item
    `;
    const result = compileProgram(source, { target: 'web' });
    expect(result.errors).toHaveLength(0);
    const js = result.javascript;
    expect(js).toContain('let total = 0');
    // Inside the loop, total should be reassigned (no let)
    const letTotalCount = (js.match(/let total/g) || []).length;
    expect(letTotalCount).toBe(1);
  });

  it('uses let for first assignment inside a function', () => {
    const source = `
define function greet(name):
  message is "Hello, " + name
  show message
    `;
    const result = compileProgram(source, { target: 'web' });
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('let message =');
  });

  it('does not re-declare outer variable inside a loop', () => {
    const source = `
count = 0
repeat 3 times:
  increase count by 1
    `;
    const result = compileProgram(source, { target: 'web' });
    expect(result.errors).toHaveLength(0);
    const js = result.javascript;
    expect(js).toContain('let count = 0');
    // Inside loop: count = (count + 1) — no let, because count is already declared
    const letCountOccurrences = (js.match(/let count/g) || []).length;
    expect(letCountOccurrences).toBe(1);
  });

  it('increase/decrease reuses outer declaration', () => {
    const source = `
score = 100
increase score by 10
    `;
    const result = compileProgram(source, { target: 'web' });
    expect(result.errors).toHaveLength(0);
    const js = result.javascript;
    expect(js).toContain('let score = 100');
    // increase compiles to score = score + 10 — no second let
    const letScoreCount = (js.match(/let score/g) || []).length;
    expect(letScoreCount).toBe(1);
  });
});

// =============================================================================
// PHASE 6: HTML SCAFFOLD
// =============================================================================

describe('HTML Scaffold', () => {
  it('generates a complete HTML document for a simple web app', () => {
    const source = `
build for web

page "Tax Calculator":
  ask for price as number called "Price"
  tax = price * 0.08
  total = price + tax
  display total as dollars called "Total"
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toBeDefined();
    // Has DOCTYPE and html structure
    expect(result.html).toContain('<!DOCTYPE html>');
    expect(result.html).toContain('<html');
    expect(result.html).toContain('</html>');
    // Has the page title
    expect(result.html).toContain('<title>Tax Calculator</title>');
    // Has an input for price
    expect(result.html).toContain('input_price');
    expect(result.html).toContain('type="number"');
    expect(result.html).toContain('Price');
    // Has an output for total
    expect(result.html).toContain('output_Total');
    expect(result.html).toContain('Total');
    // Has the compiled JS
    expect(result.html).toContain('<script>');
    expect(result.html).toContain('price * 0.08');
  });

  it('generates buttons in the HTML', () => {
    const source = `
build for web

page "Counter":
  count = 0
  display count as number called "Count"
  button "Add One":
    increase count by 1
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('btn_Add_One');
    expect(result.html).toContain('Add One');
    expect(result.html).toContain('<button');
  });

  it('includes default CSS styles', () => {
    const source = `
build for web
page "Test":
  display "hello" as text called "Greeting"
    `;
    const result = compileProgram(source);
    expect(result.css || result.html).toBeTruthy();
    expect(result.css).toContain('box-sizing');
    expect(result.html).toContain('stat');
  });

  it('includes runtime functions for built-in operations', () => {
    const source = `
build for web
page "Test":
  items = [1, 2, 3]
  total = sum(items)
  display total as number called "Total"
    `;
    const result = compileProgram(source);
    expect(result.html).toContain('_clear_sum');
    expect(result.html).toContain('function _clear_sum');
  });

  it('does not generate html for backend-only targets', () => {
    const source = `
build for backend
when user calls GET /api/health:
  send back "ok"
    `;
    const result = compileProgram(source);
    expect(result.html).toBeUndefined();
  });
});

// =============================================================================
// PHASE 6: BACKEND SCAFFOLD
// =============================================================================

describe('Backend Scaffold', () => {
  it('generates a complete Express server for JS backend', () => {
    const source = `
build for backend

when user calls GET /api/health:
  send back "ok"
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    // JS backend should have Express boilerplate
    expect(result.javascript).toContain("require('express')");
    expect(result.javascript).toContain('app.listen');
    expect(result.javascript).toContain("app.get('/api/health'");
  });

  it('generates a complete FastAPI server for Python backend', () => {
    const source = `
build for backend

when user calls GET /api/health:
  send back "ok"
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    // Python backend should have FastAPI boilerplate
    expect(result.python).toContain('from fastapi import FastAPI');
    expect(result.python).toContain('app = FastAPI()');
    expect(result.python).toContain('uvicorn.run');
    expect(result.python).toContain('@app.get("/api/health")');
  });

  it('does not add server boilerplate for web-only targets', () => {
    const source = `
build for web
price = 100
show price
    `;
    const result = compileProgram(source);
    expect(result.javascript).toContain('let price = 100');
    expect(result.javascript.includes("require('express')")).toBe(false);
  });
});

// =============================================================================
// PHASE 6: REACTIVE WEB APP (compiled JS wiring)
// =============================================================================

describe('Reactive Web App', () => {
  it('generates _state initialization from ask-for variables', () => {
    const source = `
build for web

page "Calculator":
  ask for price as number called "Price"
  ask for quantity as number called "Quantity"
  total = price * quantity
  display total as dollars called "Total"
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    // The compiled JS should initialize state variables
    expect(result.javascript).toContain('_state');
    expect(result.javascript).toContain('price');
    expect(result.javascript).toContain('quantity');
  });

  it('generates a _recompute function that updates displays', () => {
    const source = `
build for web

page "Calculator":
  ask for price as number called "Price"
  tax = price * 0.08
  display tax as dollars called "Tax"
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('function _recompute');
    // The recompute function should recalculate tax and update the display
    expect(result.javascript).toContain('price * 0.08');
  });

  it('generates input event listeners that update state', () => {
    const source = `
build for web

page "Test":
  ask for name as text called "Name"
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('addEventListener');
    expect(result.javascript).toContain('input_name');
  });

  it('generates button click handlers', () => {
    const source = `
build for web

page "Counter":
  count = 0
  display count as number called "Count"
  button "Reset":
    count = 0
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('btn_Reset');
    expect(result.javascript).toContain('addEventListener');
    expect(result.javascript).toContain('click');
  });
});

// =============================================================================
// PHASE 6: BUILD TARGET SYNTAX
// =============================================================================

describe('Build Target Syntax', () => {
  it('parses "build for web and javascript backend"', () => {
    const source = `build for web and javascript backend`;
    const ast = parse(source);
    expect(ast.target).toBe('web_and_js_backend');
  });

  it('parses "build for web and python backend"', () => {
    const source = `build for web and python backend`;
    const ast = parse(source);
    expect(ast.target).toBe('web_and_python_backend');
  });

  it('parses "build for javascript backend"', () => {
    const source = `build for javascript backend`;
    const ast = parse(source);
    expect(ast.target).toBe('js_backend');
  });

  it('parses "build for python backend"', () => {
    const source = `build for python backend`;
    const ast = parse(source);
    expect(ast.target).toBe('python_backend');
  });

  it('still supports "build for web" (unchanged)', () => {
    const source = `build for web`;
    const ast = parse(source);
    expect(ast.target).toBe('web');
  });

  it('compiles only JS backend when target is web_and_js_backend', () => {
    const source = `
build for web and javascript backend

page "App":
  display "hello" as text called "Greeting"

when user calls GET /api/hello:
  send back "world"
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toBeDefined();
    expect(result.javascript).toBeDefined();
    // No Python for JS backend
    expect(result.python).toBeUndefined();
  });

  it('compiles only Python backend when target is web_and_python_backend', () => {
    const source = `
build for web and python backend

page "App":
  display "hello" as text called "Greeting"

when user calls GET /api/hello:
  send back "world"
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toBeDefined();
    expect(result.python).toBeDefined();
  });
});

// =============================================================================
// PHASE 7: COMPLEX WEB APP FEATURES
// =============================================================================

describe('List rendering (for each in page)', () => {
  it('parses for-each inside a page body', () => {
    const source = `
build for web

page "Todo List":
  items = ['Buy milk', 'Walk dog', 'Read book']
  for each item in items:
    display item as text
    `;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    const page = ast.body.find(n => n.type === 'page');
    expect(page).toBeDefined();
    const loop = page.body.find(n => n.type === 'for_each');
    expect(loop).toBeDefined();
  });

  it('compiles for-each inside a page to HTML list', () => {
    const source = `
build for web

page "Todo List":
  items = ['Buy milk', 'Walk dog', 'Read book']
  for each item in items:
    display item as text
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    // The HTML should contain a list container
    expect(result.html).toContain('clear-list');
  });
});

describe('Conditional UI (if blocks in page)', () => {
  it('parses if block inside a page body', () => {
    const source = `
build for web

page "Dashboard":
  logged_in is true
  if logged_in then display "Welcome!" as text called "Greeting"
    `;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
  });
});

describe('Section layout', () => {
  it('parses section inside a page', () => {
    const source = `
build for web

page "Dashboard":
  section "User Info":
    display "Alice" as text called "Name"
    display 25 as number called "Age"
    `;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    const page = ast.body.find(n => n.type === 'page');
    const section = page.body.find(n => n.type === 'section');
    expect(section).toBeDefined();
    expect(section.title).toBe('User Info');
  });

  it('generates a section div in HTML', () => {
    const source = `
build for web

page "Dashboard":
  section "User Info":
    display "Alice" as text called "Name"
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('User Info');
    expect(result.html).toContain('clear-section');
  });
});

describe('More input types', () => {
  it('parses dropdown input', () => {
    const source = `
ask for color as choice of ['Red', 'Green', 'Blue'] called "Color"
    `;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'ask_for');
    expect(node).toBeDefined();
    expect(node.inputType).toBe('choice');
  });

  it('parses checkbox input', () => {
    const source = `
ask for agree as yes/no called "I agree"
    `;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'ask_for');
    expect(node.inputType).toBe('yes/no');
  });

  it('parses textarea input', () => {
    const source = `
ask for bio as long text called "Bio"
    `;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'ask_for');
    expect(node.inputType).toBe('long text');
  });
});

describe('Table display', () => {
  it('parses display as table', () => {
    const source = `
build for web

page "Data":
  display users as table called "Users"
    `;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    const page = ast.body.find(n => n.type === 'page');
    const disp = page.body.find(n => n.type === 'display');
    expect(disp).toBeDefined();
    expect(disp.format).toBe('table');
  });

  it('compiles table display to HTML table element', () => {
    const source = `
build for web

page "Data":
  users is an empty list
  display users as table called "Users"
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('table');
  });
});

// =============================================================================
// END-TO-END: REALISTIC WEB APP
// =============================================================================

describe('End-to-End: Invoice Calculator App', () => {
  it('compiles a full web app with sections, inputs, computed values, and buttons', () => {
    const source = `
build for web

page "Invoice Calculator":

  section "Client Details":
    ask for client_name as text called "Client Name"
    ask for project as choice of ['Consulting', 'Design', 'Development'] called "Project Type"

  section "Line Items":
    ask for hours as number called "Hours Worked"
    ask for rate as number called "Hourly Rate"
    subtotal = hours * rate
    display subtotal as dollars called "Subtotal"

  section "Totals":
    tax_rate = 0.08
    tax = subtotal * tax_rate
    total = subtotal + tax
    display tax as dollars called "Tax"
    display total as dollars called "Total Due"

  button "Clear":
    hours = 0
    rate = 0
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);

    // HTML scaffold checks
    expect(result.html).toContain('<!DOCTYPE html>');
    expect(result.html).toContain('<title>Invoice Calculator</title>');
    // Sections
    expect(result.html).toContain('Client Details');
    expect(result.html).toContain('Line Items');
    expect(result.html).toContain('Totals');
    expect(result.html).toContain('clear-section');
    // Inputs
    expect(result.html).toContain('input_client_name');
    expect(result.html).toContain('input_hours');
    expect(result.html).toContain('input_rate');
    expect(result.html).toContain('<select');
    expect(result.html).toContain('Consulting');
    // Outputs
    expect(result.html).toContain('output_Subtotal');
    expect(result.html).toContain('output_Tax');
    expect(result.html).toContain('output_Total_Due');
    // Button
    expect(result.html).toContain('btn_Clear');
    // Styles
    expect(result.css || result.html).toBeTruthy();
    expect(result.css).toContain('box-sizing');
    // Script with reactive code
    expect(result.html).toContain('<script>');
    expect(result.html).toContain('_recompute');
    expect(result.html).toContain('_clear_format');

    // JS checks
    expect(result.javascript).toContain('function _recompute');
    expect(result.javascript).toContain('_state');
    expect(result.javascript).toContain('addEventListener');
  });
});

describe('End-to-End: API Backend App', () => {
  it('compiles a full backend with multiple endpoints', () => {
    const source = `
build for web and python backend

when user calls GET /api/health:
  send back "ok"

when user calls POST /api/calculate:
  price = 100
  tax = price * 0.08
  total = price + tax
  create result:
    amount is total
    currency is "USD"
  send back result
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    // Python backend
    expect(result.python).toContain('from fastapi import FastAPI');
    expect(result.python).toContain('app = FastAPI()');
    expect(result.python).toContain('@app.get("/api/health")');
    expect(result.python).toContain('@app.post("/api/calculate")');
    expect(result.python).toContain('uvicorn.run');
  });
});

// =============================================================================
// PHASE 7: STYLE BLOCKS
// =============================================================================

describe('Style Blocks (Phase 7)', () => {
  it('parses style block with properties', () => {
    const source = `
style card:
  background is 'white'
  padding = 16
  rounded = 8
    `;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    const style = ast.body.find(n => n.type === 'style_def');
    expect(style).toBeDefined();
    expect(style.name).toBe('card');
    expect(style.properties).toHaveLength(3);
    expect(style.properties[0].name).toBe('background');
    expect(style.properties[0].value).toBe('white');
    expect(style.properties[1].name).toBe('padding');
    expect(style.properties[1].value).toBe(16);
    expect(style.properties[2].name).toBe('rounded');
    expect(style.properties[2].value).toBe(8);
  });

  it('parses for_screen as media query modifier', () => {
    const source = `
style mobile:
  for_screen is 'small'
  stack is 'vertical'
  width is '100%'
    `;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    const style = ast.body.find(n => n.type === 'style_def');
    expect(style.mediaQuery).toBe('small');
    expect(style.properties).toHaveLength(2);
  });

  it('errors on empty style block', () => {
    const source = `
style empty:
price = 100
    `;
    const ast = parse(source);
    expect(ast.errors.length > 0).toBe(true);
    expect(ast.errors[0].message).toContain('empty');
  });

  // --- Phase 2: CSS compilation ---

  it('compiles style block to CSS class in HTML', () => {
    const source = `
build for web

style card:
  background is 'white'
  padding = 16
  rounded = 8

page "Test":
  display "hello" as text called "Greeting"
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.css).toContain('.style-card');
    expect(result.css).toContain('background: white');
    expect(result.css).toContain('padding: 16px');
    expect(result.css).toContain('border-radius: 8px');
  });

  it('does not crash when style block exists in reactive app', () => {
    const source = `
build for web

style card:
  padding = 16

page "Test":
  ask for name as text called "Name"
  display name as text called "Output"
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.css).toContain('.style-card');
    expect(result.javascript).toContain('function _recompute');
  });

  it('maps friendly CSS names correctly', () => {
    const source = `
build for web
style fancy:
  shadow is 'small'
  stack is 'vertical'
  centered is true
  bold is true
page "Test":
  display "hi" as text called "Hi"
    `;
    const result = compileProgram(source);
    expect(result.css).toContain('box-shadow: 0 1px 3px rgba(0,0,0,0.12)');
    expect(result.css).toContain('display: flex');
    expect(result.css).toContain('flex-direction: column');
    expect(result.css).toContain('margin-left: auto');
    expect(result.css).toContain('font-weight: 700');
  });

  it('passes unknown properties through with underscore to hyphen', () => {
    const source = `
build for web
style custom:
  font_family is 'monospace'
  line_height = 1.5
page "Test":
  display "hi" as text called "Hi"
    `;
    const result = compileProgram(source);
    expect(result.css).toContain('font-family: monospace');
    expect(result.css).toContain('line-height: 1.5px');
  });

  // --- Phase 3: Section + style ---

  it('parses section with style application', () => {
    const source = `
section "Info" with style card:
  display "hello" as text called "Hi"
    `;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    const section = ast.body.find(n => n.type === 'section');
    expect(section).toBeDefined();
    expect(section.title).toBe('Info');
    expect(section.styleName).toBe('card');
  });

  it('section without style still works', () => {
    const source = `
section "Plain":
  display "hello" as text called "Hi"
    `;
    const ast = parse(source);
    const section = ast.body.find(n => n.type === 'section');
    expect(section.styleName).toBeUndefined();
  });

  it('applies style class to section in HTML', () => {
    const source = `
build for web
style card:
  padding = 16
page "Test":
  section "Info" with style card:
    display "hello" as text called "Hi"
    `;
    const result = compileProgram(source);
    expect(result.html).toContain('clear-section style-card');
  });

  // --- Phase 4: Responsive ---

  it('generates media query for for_screen small', () => {
    const source = `
build for web
style mobile:
  for_screen is 'small'
  stack is 'vertical'
  width is '100%'
page "Test":
  display "hi" as text called "Hi"
    `;
    const result = compileProgram(source);
    expect(result.css).toContain('@media (max-width: 640px)');
    expect(result.css).toContain('.style-mobile');
  });

  it('generates media query for for_screen large', () => {
    const source = `
build for web
style wide:
  for_screen is 'large'
  width = 800
page "Test":
  display "hi" as text called "Hi"
    `;
    const result = compileProgram(source);
    expect(result.css).toContain('@media (min-width: 1024px)');
  });
});

// =============================================================================
// END-TO-END: STYLED WEB APP
// =============================================================================

describe('End-to-End: Styled Web App', () => {
  it('compiles a full app with style blocks, styled sections, and responsive', () => {
    const source = `
build for web

style card:
  background is 'white'
  padding = 16
  rounded = 8
  shadow is 'small'

style mobile:
  for_screen is 'small'
  stack is 'vertical'

page "Product Page":
  section "Details" with style card:
    display "Widget" as text called "Name"
    display 9.99 as dollars called "Price"

  section "Actions":
    button "Buy Now":
      show "purchased"
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    // CSS
    expect(result.css).toContain('.style-card');
    expect(result.css).toContain('border-radius: 8px');
    expect(result.css).toContain('@media (max-width: 640px)');
    // HTML
    expect(result.html).toContain('clear-section style-card');
    expect(result.html).toContain('Product Page');
    // JS
    expect(result.html).toContain('<script>');
  });
});

// =============================================================================
// NEW INPUT SYNTAX (text input, number input, dropdown, checkbox, text area)
// =============================================================================

describe('Input Syntax (label-first canonical)', () => {
  it('parses label-first number input', () => {
    const ast = parse(`'Quantity' as number input`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'ask_for');
    expect(node).toBeDefined();
    expect(node.inputType).toBe('number');
    expect(node.label).toBe('Quantity');
    expect(node.variable).toBe('quantity');
  });

  it('parses label-first text input', () => {
    const ast = parse(`'Name' as text input`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'ask_for');
    expect(node.inputType).toBe('text');
    expect(node.label).toBe('Name');
  });

  it('parses label-first dropdown with options', () => {
    const ast = parse(`'Color' as dropdown with ['Red', 'Green', 'Blue']`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'ask_for');
    expect(node.inputType).toBe('choice');
    expect(node.label).toBe('Color');
    expect(node.choices).toHaveLength(3);
  });

  it('parses label-first checkbox', () => {
    const ast = parse(`'Gift Wrap' as checkbox`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'ask_for');
    expect(node.inputType).toBe('yes/no');
    expect(node.label).toBe('Gift Wrap');
    expect(node.variable).toBe('gift_wrap');
  });

  it('parses label-first text area', () => {
    const ast = parse(`'Notes' as text area`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'ask_for');
    expect(node.inputType).toBe('long text');
  });

  it('parses label-first with saves to', () => {
    const ast = parse(`'Hourly Rate' as number input saves to rate`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'ask_for');
    expect(node.variable).toBe('rate');
    expect(node.label).toBe('Hourly Rate');
  });

  it('parses label-first checkbox with saves to', () => {
    const ast = parse(`'Gift Wrap (+$5)' as checkbox saves to gift_wrap`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'ask_for');
    expect(node.inputType).toBe('yes/no');
    expect(node.variable).toBe('gift_wrap');
  });
});

describe('Input Syntax (type-first alias)', () => {
  it('parses text input', () => {
    const ast = parse(`text input 'Name'`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'ask_for');
    expect(node).toBeDefined();
    expect(node.inputType).toBe('text');
    expect(node.label).toBe('Name');
    expect(node.variable).toBe('name');
  });

  it('parses number input', () => {
    const ast = parse(`number input 'Price'`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'ask_for');
    expect(node.inputType).toBe('number');
    expect(node.label).toBe('Price');
    expect(node.variable).toBe('price');
  });

  it('parses dropdown with options', () => {
    const ast = parse(`dropdown 'Color' with ['Red', 'Green', 'Blue']`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'ask_for');
    expect(node.inputType).toBe('choice');
    expect(node.label).toBe('Color');
    expect(node.choices).toHaveLength(3);
    expect(node.choices[0]).toBe('Red');
  });

  it('parses checkbox', () => {
    const ast = parse(`checkbox 'Gift Wrap'`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'ask_for');
    expect(node.inputType).toBe('yes/no');
    expect(node.label).toBe('Gift Wrap');
    expect(node.variable).toBe('gift_wrap');
  });

  it('parses text area', () => {
    const ast = parse(`text area 'Notes'`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'ask_for');
    expect(node.inputType).toBe('long text');
    expect(node.label).toBe('Notes');
  });

  it('parses input with saves to', () => {
    const ast = parse(`number input 'Hourly Rate' saves to rate`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'ask_for');
    expect(node.variable).toBe('rate');
    expect(node.label).toBe('Hourly Rate');
  });

  it('old ask for syntax still works', () => {
    const ast = parse(`ask for price as number called 'Price'`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'ask_for');
    expect(node.inputType).toBe('number');
  });
});

// =============================================================================
// EMPTY LIST SYNTAX
// =============================================================================

describe('Empty List Syntax', () => {
  it('parses "is an empty list"', () => {
    const ast = parse(`tasks is an empty list`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'assign');
    expect(node).toBeDefined();
    expect(node.expression.type).toBe('literal_list');
    expect(node.expression.elements).toHaveLength(0);
  });

  it('old [] syntax still works', () => {
    const ast = parse(`tasks = []`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'assign');
    expect(node.expression.type).toBe('literal_list');
  });
});

// =============================================================================
// STATIC CONTENT ELEMENTS
// =============================================================================

describe('Static Content Elements', () => {
  it('parses heading', () => {
    const ast = parse(`heading 'Welcome'`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'content');
    expect(node).toBeDefined();
    expect(node.contentType).toBe('heading');
    expect(node.text).toBe('Welcome');
  });

  it('parses subheading', () => {
    const ast = parse(`subheading 'Products'`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'content');
    expect(node.contentType).toBe('subheading');
  });

  it('parses text', () => {
    const ast = parse(`text 'Hello world'`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'content');
    expect(node.contentType).toBe('text');
    expect(node.text).toBe('Hello world');
  });

  it('parses bold text', () => {
    const ast = parse(`bold text 'Important'`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'content');
    expect(node.contentType).toBe('bold');
  });

  it('parses italic text', () => {
    const ast = parse(`italic text 'A note'`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'content');
    expect(node.contentType).toBe('italic');
  });

  it('parses small text', () => {
    const ast = parse(`small text 'Terms apply'`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'content');
    expect(node.contentType).toBe('small');
  });

  it('parses link', () => {
    const ast = parse(`link 'Learn more' to '/about'`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'content');
    expect(node.contentType).toBe('link');
    expect(node.text).toBe('Learn more');
    expect(node.href).toBe('/about');
  });

  it('parses divider', () => {
    const ast = parse(`divider`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'content');
    expect(node.contentType).toBe('divider');
  });

  it('compiles heading to h1 in HTML', () => {
    const source = `
build for web
page 'Test':
  heading 'Welcome'
  text 'Hello world'
  divider
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('<h1');
    expect(result.html).toContain('Welcome');
    expect(result.html).toContain('<p');
    expect(result.html).toContain('Hello world');
    expect(result.html).toContain('divider');
  });
});

// =============================================================================
// INLINE FORMATTING (*bold* _italic_)
// =============================================================================

describe('Inline Formatting', () => {
  it('compiles *bold* in text to <strong>', () => {
    const source = `
build for web
page 'Test':
  text 'Normal *bold part* normal'
    `;
    const result = compileProgram(source);
    expect(result.html).toContain('<strong>bold part</strong>');
  });

  it('compiles _italic_ in text to <em>', () => {
    const source = `
build for web
page 'Test':
  text 'Normal _italic part_ normal'
    `;
    const result = compileProgram(source);
    expect(result.html).toContain('<em>italic part</em>');
  });

  it('handles mixed inline formatting', () => {
    const source = `
build for web
page 'Test':
  text 'Start *bold* middle _italic_ end'
    `;
    const result = compileProgram(source);
    expect(result.html).toContain('<strong>bold</strong>');
    expect(result.html).toContain('<em>italic</em>');
  });
});

// =============================================================================
// CHECKBOX "IS CHECKED" SYNTAX
// =============================================================================

describe('Checkbox is checked/unchecked', () => {
  it('parses "if x is checked" as boolean true comparison', () => {
    const source = `
gift_wrap is false
if gift_wrap is checked then gift_cost = 5
    `;
    const ast = parse(source);
    expect(ast.errors).toHaveLength(0);
    const ifNode = ast.body.find(n => n.type === 'if_then');
    expect(ifNode).toBeDefined();
  });

  it('compiles "is checked" to boolean true check', () => {
    const source = `
build for web
gift_wrap is false
if gift_wrap is checked then gift_cost = 5
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    // "is checked" should compile to a truthy check
    expect(result.javascript).toContain('gift_wrap');
    expect(result.javascript).toContain('gift_cost = 5');
  });
});

// =============================================================================
// AUTO-LABEL FROM VARIABLE NAME
// =============================================================================

describe('Auto-label from variable name', () => {
  it('auto-capitalizes variable name when no label given', () => {
    const source = `
build for web
page 'Test':
  subtotal = 100
  display subtotal as dollars
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    // Should auto-generate label "Subtotal" from variable name
    expect(result.html).toContain('Subtotal');
  });

  it('auto-capitalizes multi-word variable names', () => {
    const source = `
build for web
page 'Test':
  total_due = 100
  display total_due as dollars
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('Total Due');
  });

  it('uses explicit label when provided via called', () => {
    const source = `
build for web
page 'Test':
  tax = 8
  display tax as dollars called 'Sales Tax'
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('Sales Tax');
  });
});

// =============================================================================
// PHASE 8A: MULTI-PAGE ROUTING
// =============================================================================

describe('Multi-page routing', () => {
  it('parses page with route path', () => {
    const ast = parse(`
page 'Home' at '/':
  heading 'Welcome'
    `);
    expect(ast.errors).toHaveLength(0);
    const page = ast.body.find(n => n.type === 'page');
    expect(page.title).toBe('Home');
    expect(page.route).toBe('/');
  });

  it('parses multiple pages with different routes', () => {
    const ast = parse(`
page 'Home' at '/':
  heading 'Home'

page 'About' at '/about':
  heading 'About'

page 'Product' at '/product/:id':
  heading 'Product'
    `);
    expect(ast.errors).toHaveLength(0);
    const pages = ast.body.filter(n => n.type === 'page');
    expect(pages).toHaveLength(3);
    expect(pages[0].route).toBe('/');
    expect(pages[1].route).toBe('/about');
    expect(pages[2].route).toBe('/product/:id');
  });

  it('compiles multi-page app to HTML with hash router', () => {
    const source = `
build for web

page 'Home' at '/':
  heading 'Welcome'

page 'About' at '/about':
  text 'About us'
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('hashchange');
    expect(result.html).toContain('Home');
    expect(result.html).toContain('About');
  });

  it('page without route still works (single-page)', () => {
    const ast = parse(`
page 'My App':
  heading 'Hello'
    `);
    expect(ast.errors).toHaveLength(0);
    const page = ast.body.find(n => n.type === 'page');
    expect(page.route).toBeUndefined();
  });
});

// =============================================================================
// PHASE 8C: DATA FETCHING
// =============================================================================

describe('Data fetching', () => {
  it('fetch_data compiles to async call in JS', () => {
    const source = `
build for web
data is fetch_data('https://api.example.com/items')
show data
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('_clear_fetch');
  });

  it('fetch_data compiles in Python', () => {
    const source = `
build for backend
data is fetch_data('https://api.example.com/items')
show data
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('httpx');
  });
});

// =============================================================================
// PHASE 9: DATA SHAPES + CRUD
// =============================================================================

describe('Data shapes', () => {
  it('parses data shape definition', () => {
    const ast = parse(`
create data shape User:
  name is text
  email is text
  age is number
  active is true/false
    `);
    expect(ast.errors).toHaveLength(0);
    const shape = ast.body.find(n => n.type === 'data_shape');
    expect(shape).toBeDefined();
    expect(shape.name).toBe('User');
    expect(shape.fields).toHaveLength(4);
    expect(shape.fields[0].name).toBe('name');
    expect(shape.fields[0].fieldType).toBe('text');
    expect(shape.fields[2].fieldType).toBe('number');
    expect(shape.fields[3].fieldType).toBe('boolean');
  });

  it('compiles data shape to SQL CREATE TABLE', () => {
    const source = `
build for backend
create data shape User:
  name is text
  email is text
  age is number
    `;
    const result = compileProgram(source);
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('CREATE TABLE');
    expect(result.python).toContain('users');
    expect(result.python).toContain('TEXT');
    expect(result.python).toContain('INTEGER');
  });
});

describe('CRUD operations', () => {
  it('parses save operation', () => {
    const ast = parse(`save new_user to Users`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'crud');
    expect(node).toBeDefined();
    expect(node.operation).toBe('save');
    expect(node.target).toBe('Users');
  });

  it('parses look up all', () => {
    const ast = parse(`all_users = look up all Users`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'crud');
    expect(node).toBeDefined();
    expect(node.operation).toBe('lookup');
    expect(node.variable).toBe('all_users');
    expect(node.target).toBe('Users');
  });

  it('parses look up with where', () => {
    const ast = parse(`active = look up Users where active is true`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'crud');
    expect(node).toBeDefined();
    expect(node.operation).toBe('lookup');
    expect(node.condition).toBeDefined();
  });

  it('parses remove from', () => {
    const ast = parse(`remove from Users where age is less than 18`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'crud');
    expect(node.operation).toBe('remove');
  });
});

// =============================================================================
// PHASE 10: ENVIRONMENT & CONFIG
// =============================================================================

describe('Environment and config', () => {
  it('parses env() function call', () => {
    const ast = parse(`api_key is env('API_KEY')`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'assign');
    expect(node).toBeDefined();
    expect(node.expression.type).toBe('call');
    expect(node.expression.name).toBe('env');
  });

  it('compiles env() to process.env in JS', () => {
    const source = `
build for backend
api_key is env('API_KEY')
    `;
    const result = compileProgram(source);
    expect(result.javascript).toContain('process.env');
    expect(result.javascript).toContain('API_KEY');
  });

  it('compiles env() to os.environ in Python', () => {
    const source = `
build for backend
api_key is env('API_KEY')
    `;
    const result = compileProgram(source);
    expect(result.python).toContain('os.environ');
    expect(result.python).toContain('API_KEY');
  });
});

// =============================================================================
// PHASE 11: TESTING IN CLEAR
// =============================================================================

describe('Testing syntax', () => {
  it('parses test block', () => {
    const ast = parse(`
test 'addition works':
  result = 2 + 3
  expect result is 5
    `);
    expect(ast.errors).toHaveLength(0);
    const test = ast.body.find(n => n.type === 'test_def');
    expect(test).toBeDefined();
    expect(test.name).toBe('addition works');
    expect(test.body).toHaveLength(2);
  });

  it('parses expect statement', () => {
    const ast = parse(`
test 'greeting':
  result is greet('Alice')
  expect result is 'Hello, Alice'
    `);
    expect(ast.errors).toHaveLength(0);
    const test = ast.body.find(n => n.type === 'test_def');
    const expectNode = test.body.find(n => n.type === 'expect');
    expect(expectNode).toBeDefined();
  });
});

// =============================================================================
// DESIGN CONSTRAINT: NO FORWARD REFERENCES (NO HOISTING)
// =============================================================================

describe('No forward references', () => {
  it('errors when using a variable before defining it', () => {
    const source = `
total = price + tax
price = 100
tax = 8
    `;
    const result = compileProgram(source, { target: 'web' });
    expect(result.errors.length > 0).toBe(true);
    expect(result.errors[0].message).toContain('price');
    expect(result.errors[0].message).toContain('created');
  });

  it('allows using a variable defined on a previous line', () => {
    const source = `
price = 100
tax = price * 0.08
total = price + tax
    `;
    const result = compileProgram(source, { target: 'web' });
    expect(result.errors).toHaveLength(0);
  });

  it('allows function calls before definition (functions are declarations)', () => {
    const source = `
result = greet('Alice')
define function greet(name):
  return 'Hello, ' + name
    `;
    const result = compileProgram(source, { target: 'web' });
    // Functions are declarations — they should be hoisted (like Python def)
    expect(result.errors).toHaveLength(0);
  });

  it('allows variables inside function bodies to reference params', () => {
    const source = `
define function calc(price, rate):
  tax = price * rate
  return tax
    `;
    const result = compileProgram(source, { target: 'web' });
    expect(result.errors).toHaveLength(0);
  });

  it('errors with helpful message including line numbers', () => {
    const source = `
total = price + tax
price = 100
    `;
    const result = compileProgram(source, { target: 'web' });
    expect(result.errors.length > 0).toBe(true);
    expect(result.errors[0].message).toContain('line');
  });

  it('does not error for built-in functions', () => {
    const source = `
items = [1, 2, 3]
total = sum(items)
    `;
    const result = compileProgram(source, { target: 'web' });
    expect(result.errors).toHaveLength(0);
  });
});

// =============================================================================
// DESIGN CONSTRAINT: TYPE CHECKING
// =============================================================================

describe('Type checking', () => {
  it('errors when adding a string to a number', () => {
    const source = `
name is 'Alice'
result = name + 5
    `;
    const result = compileProgram(source, { target: 'web' });
    expect(result.errors.length > 0).toBe(true);
    expect(result.errors[0].message).toContain('text');
    expect(result.errors[0].message).toContain('number');
  });

  it('allows string concatenation', () => {
    const source = `
first is 'Hello'
second is ' World'
greeting is first + second
    `;
    const result = compileProgram(source, { target: 'web' });
    expect(result.errors).toHaveLength(0);
  });

  it('allows number arithmetic', () => {
    const source = `
price = 10
tax = 20
total = price + tax
    `;
    const result = compileProgram(source, { target: 'web' });
    expect(result.errors).toHaveLength(0);
  });

  it('allows number to string conversion with explicit function', () => {
    const source = `
count = 5
message is 'You have ' + count + ' items'
    `;
    // This is a common pattern — string + number should work for concatenation
    // Only flag it when the intent is clearly arithmetic (number + number context)
    // Actually, this IS a footgun. Let's flag it.
    const result = compileProgram(source, { target: 'web' });
    expect(result.errors.length > 0).toBe(true);
  });
});

// =============================================================================
// DESIGN CONSTRAINT: CONFIG VALIDATION
// =============================================================================

describe('Config validation', () => {
  it('warns when env() is used but no config block exists', () => {
    const source = `
build for backend
api_key is env('API_KEY')
    `;
    const result = compileProgram(source);
    expect(result.warnings.length > 0).toBe(true);
    expect(result.warnings[0]).toContain('API_KEY');
  });
});

// =============================================================================
// DESIGN CONSTRAINT: CIRCULAR DEPENDENCY DETECTION
// =============================================================================

describe('Circular dependency detection', () => {
  it('detects self-referencing variable', () => {
    const source = `
x = x + 1
    `;
    const result = compileProgram(source, { target: 'web' });
    expect(result.errors.length > 0).toBe(true);
    expect(result.errors[0].message).toContain('x');
  });
});

// =============================================================================
// PARSER UI METADATA
// =============================================================================

describe('Parser UI metadata on ask_for', () => {
  it('adds ui metadata to number input', () => {
    const ast = parse("'Price' as number input");
    const node = ast.body.find(n => n.type === 'ask_for');
    expect(node.ui).toBeDefined();
    expect(node.ui.tag).toBe('input');
    expect(node.ui.htmlType).toBe('number');
    expect(node.ui.id).toBe('input_price');
  });

  it('adds ui metadata to text input', () => {
    const ast = parse("'Name' as text input");
    const node = ast.body.find(n => n.type === 'ask_for');
    expect(node.ui.tag).toBe('input');
    expect(node.ui.htmlType).toBe('text');
  });
});

describe('Parser UI metadata on display', () => {
  it('adds ui metadata to display', () => {
    const ast = parse("price = 100\ndisplay price as dollars");
    const node = ast.body.find(n => n.type === 'display');
    expect(node.ui).toBeDefined();
    expect(node.ui.id).toContain('output_');
    expect(node.ui.label).toBe('Price');
  });
});

describe('Parser UI metadata on section', () => {
  it('adds ui metadata to section with style', () => {
    const ast = parse("section 'Info' with style card:\n  price = 100");
    const node = ast.body.find(n => n.type === 'section');
    expect(node.ui.cssClass).toContain('clear-section');
    expect(node.ui.cssClass).toContain('style-card');
  });

  it('adds ui metadata to section without style', () => {
    const ast = parse("section 'Details':\n  price = 100");
    const node = ast.body.find(n => n.type === 'section');
    expect(node.ui.cssClass).toBe('clear-section');
  });
});

describe('Parser UI metadata on button', () => {
  it('adds ui metadata to button', () => {
    const ast = parse("button 'Calculate':\n  result = 42");
    const node = ast.body.find(n => n.type === 'button');
    expect(node.ui).toBeDefined();
    expect(node.ui.tag).toBe('button');
    expect(node.ui.id).toBe('btn_Calculate');
  });
});

describe('Parser UI metadata on content', () => {
  it('adds ui metadata to heading', () => {
    const ast = parse("heading 'Welcome'");
    const node = ast.body.find(n => n.type === 'content');
    expect(node.ui).toBeDefined();
    expect(node.ui.contentType).toBe('heading');
    expect(node.ui.text).toBe('Welcome');
  });
});

// =============================================================================
// UNIFIED COMPILER — compileNode + exprToCode
// =============================================================================

describe('Unified compileNode', () => {
  it('compiles ASSIGN to JS', () => {
    const ast = parse('price = 100');
    const node = ast.body.find(n => n.type === 'assign');
    const ctx = { lang: 'js', indent: 0, declared: new Set(), stateVars: null };
    const result = compileNode(node, ctx);
    expect(result).toContain('let price = 100');
  });

  it('compiles ASSIGN to Python', () => {
    const ast = parse('price = 100');
    const node = ast.body.find(n => n.type === 'assign');
    const ctx = { lang: 'python', indent: 0, declared: new Set(), stateVars: null };
    const result = compileNode(node, ctx);
    expect(result).toBe('price = 100');
  });

  it('compiles reactive variable ref with _state prefix', () => {
    const ast = parse('tax = price * 0.08');
    const node = ast.body.find(n => n.type === 'assign');
    const stateVars = new Set(['price']);
    const ctx = { lang: 'js', indent: 0, declared: new Set(['price']), stateVars };
    const result = compileNode(node, ctx);
    expect(result).toContain('_state.price');
  });

  it('compiles COMMENT to JS and Python', () => {
    const ast = parse('# hello world');
    const comment = ast.body.find(n => n.type === 'comment');
    expect(compileNode(comment, { lang: 'js', indent: 0, declared: new Set(), stateVars: null })).toContain('// hello world');
    expect(compileNode(comment, { lang: 'python', indent: 0, declared: new Set(), stateVars: null })).toContain('# hello world');
  });

  it('compiles boolean literals per language', () => {
    const ast = parse('flag = true');
    const node = ast.body.find(n => n.type === 'assign');
    const jsResult = compileNode(node, { lang: 'js', indent: 0, declared: new Set(), stateVars: null });
    expect(jsResult).toContain('true');
    const pyResult = compileNode(node, { lang: 'python', indent: 0, declared: new Set(), stateVars: null });
    expect(pyResult).toContain('True');
  });
});

// =============================================================================
// ROW-LEVEL SECURITY (Phase 15)
// =============================================================================

describe('Parser - RLS policies inside data shape', () => {
  it('parses anyone can read', () => {
    const ast = parse("create data shape Post:\n  title is text\n  anyone can read");
    const shape = ast.body.find(n => n.type === 'data_shape');
    expect(shape.policies).toBeDefined();
    expect(shape.policies.length).toBe(1);
    expect(shape.policies[0].subject).toBe('anyone');
    expect(shape.policies[0].actions).toContain('read');
  });

  it('parses owner can read, update, delete', () => {
    const ast = parse("create data shape Post:\n  title is text\n  owner can read, update, delete");
    const shape = ast.body.find(n => n.type === 'data_shape');
    expect(shape.policies[0].subject).toBe('owner');
    expect(shape.policies[0].actions).toContain('read');
    expect(shape.policies[0].actions).toContain('update');
    expect(shape.policies[0].actions).toContain('delete');
  });

  it('parses role-based policy', () => {
    const ast = parse("create data shape Post:\n  title is text\n  role 'admin' can read, update, delete");
    const shape = ast.body.find(n => n.type === 'data_shape');
    expect(shape.policies[0].subject).toBe('role');
    expect(shape.policies[0].role).toBe('admin');
  });

  it('parses same org can read', () => {
    const ast = parse("create data shape Post:\n  title is text\n  org_id is text\n  same org can read");
    const shape = ast.body.find(n => n.type === 'data_shape');
    expect(shape.policies[0].subject).toBe('same_org');
    expect(shape.policies[0].actions).toContain('read');
  });

  it('parses conditional policy with where clause', () => {
    const ast = parse("create data shape Post:\n  title is text\n  published is boolean\n  anyone can read where published == true");
    const shape = ast.body.find(n => n.type === 'data_shape');
    expect(shape.policies[0].condition).toBeDefined();
    expect(shape.policies[0].condition).toContain('published');
  });

  it('parses multiple policies on one shape', () => {
    const ast = parse("create data shape Post:\n  title is text\n  anyone can read\n  owner can update, delete");
    const shape = ast.body.find(n => n.type === 'data_shape');
    expect(shape.policies.length).toBe(2);
  });
});

describe('Compiler - RLS policies to SQL', () => {
  it('generates CREATE POLICY for anyone can read', () => {
    const result = compileProgram("target: python backend\ncreate data shape Post:\n  title is text\n  anyone can read");
    expect(result.python).toContain('CREATE POLICY');
    expect(result.python).toContain('SELECT');
    expect(result.python).toContain('true');
  });

  it('generates owner policy with user_id check', () => {
    const result = compileProgram("target: python backend\ncreate data shape Post:\n  title is text\n  owner can update, delete");
    expect(result.python).toContain('CREATE POLICY');
    expect(result.python).toContain('auth.uid()');
  });

  it('generates role-based policy', () => {
    const result = compileProgram("target: python backend\ncreate data shape Post:\n  title is text\n  role 'admin' can read, update");
    expect(result.python).toContain('CREATE POLICY');
    expect(result.python).toContain('admin');
  });

  it('generates tenant isolation policy', () => {
    const result = compileProgram("target: python backend\ncreate data shape Post:\n  title is text\n  org_id is text\n  same org can read");
    expect(result.python).toContain('org_id');
  });

  it('generates conditional policy with WHERE', () => {
    const result = compileProgram("target: python backend\ncreate data shape Post:\n  title is text\n  published is boolean\n  anyone can read where published == true");
    expect(result.python).toContain('published');
    expect(result.python).toContain('true');
  });
});

describe('E2E - full data shape with RLS compiles to real SQL', () => {
  it('generates CREATE TABLE + RLS policies together', () => {
    const result = compileProgram(`
target: python backend
create data shape Document:
  title is text, required
  owner_id is text, required
  org_id is text
  published is boolean, default false
  anyone can read where published == true
  owner can read, update, delete
  same org can read
    `);
    const sql = result.python;
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS documents');
    expect(sql).toContain('title TEXT NOT NULL');
    expect(sql).toContain('CREATE POLICY');
    // Should have 3 policies
    const policyCount = (sql.match(/CREATE POLICY/g) || []).length;
    expect(policyCount).toBe(3);
  });
});

// =============================================================================
// DATA CONSTRAINTS & RELATIONS (Phase 14)
// =============================================================================

describe('Parser - data shape with constraints', () => {
  it('parses required field', () => {
    const ast = parse("create data shape User:\n  name is text, required");
    const shape = ast.body.find(n => n.type === 'data_shape');
    expect(shape).toBeDefined();
    expect(shape.fields[0].name).toBe('name');
    expect(shape.fields[0].required).toBe(true);
  });

  it('parses unique field', () => {
    const ast = parse("create data shape User:\n  email is text, unique");
    const shape = ast.body.find(n => n.type === 'data_shape');
    expect(shape.fields[0].unique).toBe(true);
  });

  it('parses default value', () => {
    const ast = parse("create data shape User:\n  role is text, default 'viewer'");
    const shape = ast.body.find(n => n.type === 'data_shape');
    expect(shape.fields[0].defaultValue).toBe('viewer');
  });

  it('parses multiple constraints on one field', () => {
    const ast = parse("create data shape User:\n  email is text, required, unique");
    const shape = ast.body.find(n => n.type === 'data_shape');
    expect(shape.fields[0].required).toBe(true);
    expect(shape.fields[0].unique).toBe(true);
  });

  it('parses auto timestamp', () => {
    const ast = parse("create data shape User:\n  created_at is timestamp, auto");
    const shape = ast.body.find(n => n.type === 'data_shape');
    expect(shape.fields[0].fieldType).toBe('timestamp');
    expect(shape.fields[0].auto).toBe(true);
  });

  it('parses foreign key reference', () => {
    const ast = parse("create data shape Post:\n  author is User");
    const shape = ast.body.find(n => n.type === 'data_shape');
    expect(shape.fields[0].fk).toBe('User');
  });
});

describe('Compiler - data shape with constraints (Python/SQL)', () => {
  it('generates NOT NULL for required fields', () => {
    const result = compileProgram("target: python backend\ncreate data shape User:\n  name is text, required");
    expect(result.python).toContain('NOT NULL');
  });

  it('generates UNIQUE constraint', () => {
    const result = compileProgram("target: python backend\ncreate data shape User:\n  email is text, unique");
    expect(result.python).toContain('UNIQUE');
  });

  it('generates DEFAULT value', () => {
    const result = compileProgram("target: python backend\ncreate data shape User:\n  role is text, default 'viewer'");
    expect(result.python).toContain("DEFAULT 'viewer'");
  });

  it('generates timestamp with DEFAULT NOW()', () => {
    const result = compileProgram("target: python backend\ncreate data shape User:\n  created_at is timestamp, auto");
    expect(result.python).toContain('TIMESTAMP');
    expect(result.python).toContain('DEFAULT NOW()');
  });

  it('generates REFERENCES for foreign keys', () => {
    const result = compileProgram("target: python backend\ncreate data shape Post:\n  author is User");
    expect(result.python).toContain('REFERENCES');
    expect(result.python).toContain('users');
  });
});

describe('E2E - full data shape compiles to real SQL', () => {
  it('generates complete CREATE TABLE with all constraint types', () => {
    const result = compileProgram(`
target: python backend
create data shape User:
  name is text, required
  email is text, required, unique
  age is number, default 0
  role is text, default 'user'
  created_at is timestamp, auto
  org is Organization
    `);
    const sql = result.python;
    // Verify the actual SQL is correct and usable
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS users');
    expect(sql).toContain('name TEXT NOT NULL');
    expect(sql).toContain('email TEXT NOT NULL UNIQUE');
    expect(sql).toContain("age INTEGER DEFAULT '0'");
    expect(sql).toContain("role TEXT DEFAULT 'user'");
    expect(sql).toContain('created_at TIMESTAMP DEFAULT NOW()');
    expect(sql).toContain('org INTEGER REFERENCES organizations(id)');
  });
});

describe('Compiler - data shape with constraints (JS)', () => {
  it('generates schema with required/type metadata', () => {
    const result = compileProgram("target: backend\ncreate data shape User:\n  name is text, required");
    expect(result.javascript).toContain('required: true');
    expect(result.javascript).toContain('name');
  });
});

// =============================================================================
// AUTH & ROLES (Phase 13)
// =============================================================================

describe('Parser - requires auth', () => {
  it('parses requires auth inside endpoint', () => {
    const ast = parse("on GET '/users':\n  requires auth\n  send back 'ok'");
    const endpoint = ast.body.find(n => n.type === 'endpoint');
    const auth = endpoint.body.find(n => n.type === 'requires_auth');
    expect(auth).toBeDefined();
  });

  it('parses requires auth at top level', () => {
    const ast = parse("requires auth");
    const node = ast.body.find(n => n.type === 'requires_auth');
    expect(node).toBeDefined();
  });
});

describe('Compiler - requires auth', () => {
  it('compiles to JS auth guard in endpoint', () => {
    const result = compileProgram("target: backend\non GET '/users':\n  requires auth\n  send back 'ok'");
    expect(result.javascript).toContain('req.user');
    expect(result.javascript).toContain('401');
  });

  it('compiles to Python auth guard', () => {
    const result = compileProgram("target: python backend\non GET '/users':\n  requires auth\n  send back 'ok'");
    expect(result.python).toContain('request.user');
    expect(result.python).toContain('401');
  });
});

describe('Parser - requires role', () => {
  it('parses requires role with role name', () => {
    const ast = parse("on GET '/admin':\n  requires role 'admin'\n  send back 'ok'");
    const endpoint = ast.body.find(n => n.type === 'endpoint');
    const role = endpoint.body.find(n => n.type === 'requires_role');
    expect(role).toBeDefined();
    expect(role.role).toBe('admin');
  });
});

describe('Compiler - requires role', () => {
  it('compiles to JS role check with 403', () => {
    const result = compileProgram("target: backend\non GET '/admin':\n  requires role 'admin'\n  send back 'ok'");
    expect(result.javascript).toContain('admin');
    expect(result.javascript).toContain('403');
  });

  it('compiles to Python role check', () => {
    const result = compileProgram("target: python backend\non GET '/admin':\n  requires role 'admin'\n  send back 'ok'");
    expect(result.python).toContain('admin');
    expect(result.python).toContain('403');
  });
});

describe('Parser - define role', () => {
  it('parses role definition with permissions', () => {
    const ast = parse("define role 'editor':\n  can edit posts\n  can view posts");
    const node = ast.body.find(n => n.type === 'define_role');
    expect(node).toBeDefined();
    expect(node.role).toBe('editor');
    expect(node.permissions.length).toBe(2);
    expect(node.permissions[0]).toContain('edit');
  });
});

describe('Compiler - define role', () => {
  it('compiles role definition to JS object', () => {
    const result = compileProgram("target: backend\ndefine role 'admin':\n  can manage users\n  can view reports");
    expect(result.javascript).toContain('admin');
    expect(result.javascript).toContain('manage users');
    expect(result.javascript).toContain('view reports');
  });
});

describe('Parser - guard', () => {
  it('parses guard with expression', () => {
    const ast = parse("on POST '/delete':\n  guard is_admin == true\n  send back 'ok'");
    const endpoint = ast.body.find(n => n.type === 'endpoint');
    const guard = endpoint.body.find(n => n.type === 'guard');
    expect(guard).toBeDefined();
    expect(guard.expression).toBeDefined();
  });
});

describe('Compiler - guard', () => {
  it('compiles guard to JS conditional with 403', () => {
    const result = compileProgram("target: backend\non POST '/delete':\n  guard is_admin == true\n  send back 'ok'");
    expect(result.javascript).toContain('is_admin');
    expect(result.javascript).toContain('403');
  });

  it('compiles guard to Python conditional', () => {
    const result = compileProgram("target: python backend\non POST '/delete':\n  guard is_admin == true\n  send back 'ok'");
    expect(result.python).toContain('is_admin');
    expect(result.python).toContain('403');
  });
});

// =============================================================================
// DEPLOY NODE
// =============================================================================

describe('Parser - deploy node', () => {
  it('parses deploy to vercel', () => {
    const ast = parse("deploy to 'vercel'");
    const node = ast.body.find(n => n.type === 'deploy');
    expect(node).toBeDefined();
    expect(node.platform).toBe('vercel');
  });

  it('parses deploy to docker', () => {
    const ast = parse("deploy to 'docker'");
    const node = ast.body.find(n => n.type === 'deploy');
    expect(node.platform).toBe('docker');
  });
});

describe('Compiler - deploy node', () => {
  it('compiles deploy to vercel as JSON config', () => {
    const result = compileProgram("target: backend\non GET '/hello':\n  send back 'hi'\ndeploy to 'vercel'");
    expect(result.deployConfig).toBeDefined();
    expect(result.deployConfig.platform).toBe('vercel');
    expect(result.deployConfig.config).toContain('vercel');
  });

  it('compiles deploy to docker as Dockerfile', () => {
    const result = compileProgram("target: backend\non GET '/hello':\n  send back 'hi'\ndeploy to 'docker'");
    expect(result.deployConfig).toBeDefined();
    expect(result.deployConfig.platform).toBe('docker');
    expect(result.deployConfig.config).toContain('FROM');
  });
});

// =============================================================================
// STANDALONE VALIDATOR
// =============================================================================

describe('Standalone Validator', () => {
  it('catches forward references', () => {
    const ast = parse('total = price + tax\nprice = 100');
    const { errors } = validate(ast);
    expect(errors.length > 0).toBe(true);
    expect(errors[0].message).toContain('price');
  });

  it('catches type mixing', () => {
    const ast = parse("name is 'Alice'\nresult = name + 5");
    const { errors } = validate(ast);
    expect(errors.length > 0).toBe(true);
  });

  it('warns on missing config', () => {
    const ast = parse("api_key is env('API_KEY')");
    const { errors, warnings } = validate(ast);
    expect(warnings.length > 0).toBe(true);
  });

  it('returns empty errors for valid code', () => {
    const ast = parse('price = 100\ntax = price * 0.08');
    const { errors } = validate(ast);
    expect(errors.length).toBe(0);
  });
});

// =============================================================================
// PHASE 16: INPUT VALIDATION & OUTPUT SCHEMAS
// =============================================================================

describe('Parser - validate incoming', () => {
  it('parses validate block with field rules', () => {
    const ast = parse("on POST '/users':\n  validate incoming:\n    name is text, required\n    age is number, min 0, max 150\n  send back 'ok'");
    const endpoint = ast.body.find(n => n.type === 'endpoint');
    const validate = endpoint.body.find(n => n.type === 'validate');
    expect(validate).toBeDefined();
    expect(validate.rules.length).toBe(2);
  });

  it('parses field rule with required constraint', () => {
    const ast = parse("on POST '/users':\n  validate incoming:\n    name is text, required\n  send back 'ok'");
    const endpoint = ast.body.find(n => n.type === 'endpoint');
    const rule = endpoint.body.find(n => n.type === 'validate').rules[0];
    expect(rule.name).toBe('name');
    expect(rule.fieldType).toBe('text');
    expect(rule.constraints.required).toBe(true);
  });

  it('parses field rule with min and max', () => {
    const ast = parse("on POST '/users':\n  validate incoming:\n    name is text, required, min 1, max 100\n  send back 'ok'");
    const endpoint = ast.body.find(n => n.type === 'endpoint');
    const rule = endpoint.body.find(n => n.type === 'validate').rules[0];
    expect(rule.constraints.min).toBe(1);
    expect(rule.constraints.max).toBe(100);
  });

  it('parses field rule with matches email', () => {
    const ast = parse("on POST '/users':\n  validate incoming:\n    email is text, required, matches email\n  send back 'ok'");
    const endpoint = ast.body.find(n => n.type === 'endpoint');
    const rule = endpoint.body.find(n => n.type === 'validate').rules[0];
    expect(rule.constraints.matches).toBe('email');
  });

  it('parses number field with min and max', () => {
    const ast = parse("on POST '/users':\n  validate incoming:\n    age is number, min 0, max 150\n  send back 'ok'");
    const endpoint = ast.body.find(n => n.type === 'endpoint');
    const rule = endpoint.body.find(n => n.type === 'validate').rules[0];
    expect(rule.fieldType).toBe('number');
    expect(rule.constraints.min).toBe(0);
    expect(rule.constraints.max).toBe(150);
  });
});

describe('Compiler - validate incoming', () => {
  it('compiles validation to JS with _validate helper', () => {
    const result = compileProgram("target: backend\non POST '/users':\n  validate incoming:\n    name is text, required\n  send back 'ok'");
    expect(result.javascript).toContain('_validate(req.body');
    expect(result.javascript).toContain('400');
    expect(result.javascript).toContain('"required":true');
  });

  it('compiles min/max validation to JS', () => {
    const result = compileProgram("target: backend\non POST '/users':\n  validate incoming:\n    name is text, min 1, max 100\n  send back 'ok'");
    expect(result.javascript).toContain('"min":1');
    expect(result.javascript).toContain('"max":100');
  });

  it('compiles email validation to JS', () => {
    const result = compileProgram("target: backend\non POST '/users':\n  validate incoming:\n    email is text, matches email\n  send back 'ok'");
    expect(result.javascript).toContain('@');
    expect(result.javascript).toContain('400');
  });

  it('compiles validation to Python with HTTPException', () => {
    const result = compileProgram("target: python backend\non POST '/users':\n  validate incoming:\n    name is text, required\n  send back 'ok'");
    expect(result.python).toContain('incoming.get("name")');
    expect(result.python).toContain('400');
    expect(result.python).toContain('name is required');
  });

  it('compiles min/max validation to Python', () => {
    const result = compileProgram("target: python backend\non POST '/users':\n  validate incoming:\n    name is text, min 1, max 100\n  send back 'ok'");
    expect(result.python).toContain('len(');
    expect(result.python).toContain('400');
  });
});

describe('Parser - responds with', () => {
  it('parses responds with block', () => {
    const ast = parse("on GET '/users':\n  send back 'ok'\n  responds with:\n    id is text\n    name is text");
    const endpoint = ast.body.find(n => n.type === 'endpoint');
    const schema = endpoint.body.find(n => n.type === 'responds_with');
    expect(schema).toBeDefined();
    expect(schema.fields.length).toBe(2);
    expect(schema.fields[0].name).toBe('id');
    expect(schema.fields[1].name).toBe('name');
  });
});

describe('Compiler - responds with', () => {
  it('compiles responds with to JS comment schema', () => {
    const result = compileProgram("target: backend\non GET '/users':\n  send back 'ok'\n  responds with:\n    id is text\n    name is text");
    expect(result.javascript).toContain('Response schema');
    expect(result.javascript).toContain('id: text');
    expect(result.javascript).toContain('name: text');
  });

  it('compiles responds with to Python comment schema', () => {
    const result = compileProgram("target: python backend\non GET '/users':\n  send back 'ok'\n  responds with:\n    id is text\n    name is text");
    expect(result.python).toContain('Response schema');
    expect(result.python).toContain('id: text');
  });
});

describe('Parser - rate limit', () => {
  it('parses rate limit with count and period', () => {
    const ast = parse("on GET '/api':\n  rate limit 10 per minute\n  send back 'ok'");
    const endpoint = ast.body.find(n => n.type === 'endpoint');
    const rl = endpoint.body.find(n => n.type === 'rate_limit');
    expect(rl).toBeDefined();
    expect(rl.count).toBe(10);
    expect(rl.period).toBe('minute');
  });

  it('parses rate limit per hour', () => {
    const ast = parse("on GET '/api':\n  rate limit 100 per hour\n  send back 'ok'");
    const endpoint = ast.body.find(n => n.type === 'endpoint');
    const rl = endpoint.body.find(n => n.type === 'rate_limit');
    expect(rl.count).toBe(100);
    expect(rl.period).toBe('hour');
  });
});

describe('Compiler - rate limit', () => {
  it('compiles rate limit to JS middleware', () => {
    const result = compileProgram("target: backend\non GET '/api':\n  rate limit 10 per minute\n  send back 'ok'");
    expect(result.javascript).toContain('rateLimit');
    expect(result.javascript).toContain('60000');
    expect(result.javascript).toContain('max: 10');
  });

  it('compiles rate limit to Python decorator', () => {
    const result = compileProgram("target: python backend\non GET '/api':\n  rate limit 10 per minute\n  send back 'ok'");
    expect(result.python).toContain('limiter');
    expect(result.python).toContain('10/minute');
  });
});

describe('E2E - Phase 16: Validated API endpoint', () => {
  it('generates complete validated endpoint in JS', () => {
    const result = compileProgram(`
target: backend
on POST '/users':
  validate incoming:
    name is text, required, min 1, max 100
    email is text, required, matches email
    age is number, min 0, max 150
  rate limit 10 per minute
  send back 'created'
  responds with:
    id is text
    name is text
    created_at is timestamp
    `);
    expect(result.javascript).toContain('_validate(req.body');
    expect(result.javascript).toContain('"field":"name"');
    expect(result.javascript).toContain('400');
    expect(result.javascript).toContain('rateLimit');
    expect(result.javascript).toContain('Response schema');
  });

  it('generates complete validated endpoint in Python', () => {
    const result = compileProgram(`
target: python backend
on POST '/users':
  validate incoming:
    name is text, required, min 1, max 100
    email is text, required, matches email
  send back 'created'
    `);
    expect(result.python).toContain('incoming.get("name")');
    expect(result.python).toContain('incoming.get("email")');
    expect(result.python).toContain('400');
    expect(result.python).toContain('@app.post');
  });
});

// =============================================================================
// TABLE SYNTAX WITH TYPE INFERENCE
// =============================================================================

describe('Parser - create a table (new syntax)', () => {
  it('parses create a Users table with inferred types', () => {
    const ast = parse("create a Users table:\n  name, required\n  email, required, unique\n  role, default 'reader'\n  created_at, auto");
    expect(ast.errors).toHaveLength(0);
    const shape = ast.body.find(n => n.type === 'data_shape');
    expect(shape).toBeDefined();
    expect(shape.name).toBe('Users');
    expect(shape.fields.length).toBe(4);
  });

  it('infers text from string default', () => {
    const ast = parse("create a Config table:\n  role, default 'reader'");
    const shape = ast.body.find(n => n.type === 'data_shape');
    expect(shape.fields[0].fieldType).toBe('text');
    expect(shape.fields[0].defaultValue).toBe('reader');
  });

  it('infers number from explicit parens', () => {
    const ast = parse("create a Scores table:\n  score (number), default 0");
    const shape = ast.body.find(n => n.type === 'data_shape');
    expect(shape.fields[0].fieldType).toBe('number');
  });

  it('infers timestamp from _at name', () => {
    const ast = parse("create a Events table:\n  created_at, auto");
    const shape = ast.body.find(n => n.type === 'data_shape');
    expect(shape.fields[0].fieldType).toBe('timestamp');
    expect(shape.fields[0].auto).toBe(true);
  });

  it('infers FK from capitalized name', () => {
    const ast = parse("create a Posts table:\n  Author");
    const shape = ast.body.find(n => n.type === 'data_shape');
    expect(shape.fields[0].fieldType).toBe('fk');
    expect(shape.fields[0].fk).toBe('Author');
  });

  it('old syntax still works', () => {
    const ast = parse("create data shape User:\n  name is text, required");
    expect(ast.errors).toHaveLength(0);
    const shape = ast.body.find(n => n.type === 'data_shape');
    expect(shape.name).toBe('User');
    expect(shape.fields[0].fieldType).toBe('text');
  });
});

// =============================================================================
// PHASE 19: FILE UPLOADS & EXTERNAL APIs
// =============================================================================

describe('Parser - accept file', () => {
  it('parses accept file block with max size and types', () => {
    const ast = parse("on POST '/upload':\n  accept file:\n    max size is 10mb\n    allowed types are ['image/png', 'image/jpeg']\n  send back 'ok'");
    const endpoint = ast.body.find(n => n.type === 'endpoint');
    const af = endpoint.body.find(n => n.type === 'accept_file');
    expect(af).toBeDefined();
    expect(af.config.maxSize).toBe('10mb');
    expect(af.config.allowedTypes.length).toBe(2);
    expect(af.config.allowedTypes[0]).toBe('image/png');
  });

  it('parses accept file with max size only', () => {
    const ast = parse("on POST '/upload':\n  accept file:\n    max size is 5mb\n  send back 'ok'");
    const endpoint = ast.body.find(n => n.type === 'endpoint');
    const af = endpoint.body.find(n => n.type === 'accept_file');
    expect(af.config.maxSize).toBe('5mb');
    expect(af.config.allowedTypes.length).toBe(0);
  });
});

describe('Compiler - accept file', () => {
  it('compiles accept file to JS multer config', () => {
    const result = compileProgram("target: backend\non POST '/upload':\n  accept file:\n    max size is 10mb\n    allowed types are ['image/png', 'image/jpeg']\n  send back 'ok'");
    expect(result.javascript).toContain('multer');
    expect(result.javascript).toContain('fileSize');
    expect(result.javascript).toContain('image/png');
    expect(result.javascript).toContain('fileFilter');
  });

  it('compiles accept file to Python UploadFile', () => {
    const result = compileProgram("target: python backend\non POST '/upload':\n  accept file:\n    max size is 10mb\n    allowed types are ['image/png']\n  send back 'ok'");
    expect(result.python).toContain('UploadFile');
    expect(result.python).toContain('file.size');
    expect(result.python).toContain('image/png');
  });

  it('respects max size in bytes calculation', () => {
    const result = compileProgram("target: backend\non POST '/upload':\n  accept file:\n    max size is 5mb\n  send back 'ok'");
    expect(result.javascript).toContain('5242880');
  });
});

describe('Parser - external fetch', () => {
  it('parses data from URL with config', () => {
    const ast = parse("data from 'https://api.example.com/data':\n  timeout is 10 seconds\n  cache for 5 minutes\n  on error use default []");
    const ef = ast.body.find(n => n.type === 'external_fetch');
    expect(ef).toBeDefined();
    expect(ef.url).toBe('https://api.example.com/data');
    expect(ef.config.timeout.value).toBe(10);
    expect(ef.config.timeout.unit).toBe('seconds');
    expect(ef.config.cache.value).toBe(5);
    expect(ef.config.cache.unit).toBe('minutes');
    expect(ef.config.errorFallback).toBeDefined();
  });

  it('parses data from URL with timeout only', () => {
    const ast = parse("data from 'https://api.example.com':\n  timeout is 30 seconds");
    const ef = ast.body.find(n => n.type === 'external_fetch');
    expect(ef.config.timeout.value).toBe(30);
    expect(ef.config.cache).toBeNull();
  });

  it('reports error for missing URL', () => {
    const ast = parse("data from:\n  timeout is 10 seconds");
    expect(ast.errors.length > 0).toBe(true);
  });

  it('reports SSRF error for localhost URLs', () => {
    const ast = parse("data from 'http://localhost:3000/api':\n  timeout is 5 seconds");
    expect(ast.errors.length > 0).toBe(true);
  });

  it('reports SSRF error for 10.x.x.x URLs', () => {
    const ast = parse("data from 'http://10.0.0.1/api':\n  timeout is 5 seconds");
    expect(ast.errors.length > 0).toBe(true);
  });
});

describe('Compiler - external fetch', () => {
  it('compiles external fetch to JS with AbortController timeout', () => {
    const result = compileProgram("target: backend\ndata from 'https://api.example.com/data':\n  timeout is 10 seconds");
    expect(result.javascript).toContain('AbortController');
    expect(result.javascript).toContain('10000');
    expect(result.javascript).toContain('api.example.com');
  });

  it('compiles external fetch to JS with error fallback', () => {
    const result = compileProgram("target: backend\ndata from 'https://api.example.com/data':\n  timeout is 10 seconds\n  on error use default []");
    expect(result.javascript).toContain('catch');
    expect(result.javascript).toContain('_fetched_data = []');
  });

  it('compiles external fetch to Python with httpx', () => {
    const result = compileProgram("target: python backend\ndata from 'https://api.example.com/data':\n  timeout is 10 seconds");
    expect(result.python).toContain('httpx');
    expect(result.python).toContain('timeout=10');
    expect(result.python).toContain('api.example.com');
  });

  it('compiles external fetch to Python with fallback', () => {
    const result = compileProgram("target: python backend\ndata from 'https://api.example.com/data':\n  timeout is 5 seconds\n  on error use default []");
    expect(result.python).toContain('except');
    expect(result.python).toContain('_fetched_data = []');
  });
});

describe('E2E - Phase 19: File upload + API fetch', () => {
  it('generates complete upload endpoint in JS', () => {
    const result = compileProgram(`
target: backend
on POST '/upload':
  requires auth
  accept file:
    max size is 10mb
    allowed types are ['image/png', 'image/jpeg', 'application/pdf']
  send back 'uploaded'
    `);
    expect(result.javascript).toContain('multer');
    expect(result.javascript).toContain('fileSize');
    expect(result.javascript).toContain('image/png');
    expect(result.javascript).toContain('req.user');
    expect(result.javascript).toContain('401');
  });
});

// =============================================================================
// PHASE 18: BILLING & PAYMENTS
// =============================================================================

describe('Parser - checkout', () => {
  it('parses checkout block with plan name and config', () => {
    const ast = parse("checkout 'Pro Plan':\n  price is 'price_abc123'\n  mode is 'subscription'\n  success_url is '/success'\n  cancel_url is '/pricing'");
    const co = ast.body.find(n => n.type === 'checkout');
    expect(co).toBeDefined();
    expect(co.name).toBe('Pro Plan');
    expect(co.config.price).toBe('price_abc123');
    expect(co.config.mode).toBe('subscription');
    expect(co.config.success_url).toBe('/success');
    expect(co.config.cancel_url).toBe('/pricing');
  });

  it('reports error for checkout without name', () => {
    const ast = parse("checkout:\n  price is 'abc'");
    expect(ast.errors.length > 0).toBe(true);
  });

  it('parses checkout with minimal config', () => {
    const ast = parse("checkout 'Basic':\n  price is 'price_xyz'");
    const co = ast.body.find(n => n.type === 'checkout');
    expect(co.name).toBe('Basic');
    expect(co.config.price).toBe('price_xyz');
  });
});

describe('Compiler - checkout', () => {
  it('compiles checkout to JS config object (1:1 rule)', () => {
    const result = compileProgram("target: backend\ncheckout 'Pro Plan':\n  price is 'price_abc123'\n  mode is 'subscription'\n  success_url is '/success'\n  cancel_url is '/pricing'");
    expect(result.javascript).toContain('CHECKOUT_PRO_PLAN');
    expect(result.javascript).toContain('price_abc123');
    expect(result.javascript).toContain('subscription');
    expect(result.javascript).toContain('/success');
    // 1:1 rule: no generated routes or stripe imports
    expect(result.javascript).not.toContain("app.post('/checkout");
    expect(result.javascript).not.toContain("require('stripe')");
  });

  it('compiles checkout to Python config dict (1:1 rule)', () => {
    const result = compileProgram("target: python backend\ncheckout 'Pro Plan':\n  price is 'price_abc123'\n  mode is 'subscription'\n  success_url is '/success'");
    expect(result.python).toContain('CHECKOUT_PRO_PLAN');
    expect(result.python).toContain('price_abc123');
    // 1:1 rule: no generated routes
    expect(result.python).not.toContain('@app.post');
  });
});

describe('Parser - usage limit', () => {
  it('parses usage limit with tier rules', () => {
    const ast = parse("limit 'ai_generations':\n  free allows 5 per month\n  pro allows unlimited");
    const ul = ast.body.find(n => n.type === 'usage_limit');
    expect(ul).toBeDefined();
    expect(ul.name).toBe('ai_generations');
    expect(ul.tiers.length).toBe(2);
  });

  it('parses free tier with count and period', () => {
    const ast = parse("limit 'api_calls':\n  free allows 100 per day\n  pro allows 10000 per day");
    const ul = ast.body.find(n => n.type === 'usage_limit');
    expect(ul.tiers[0].tier).toBe('free');
    expect(ul.tiers[0].count).toBe(100);
    expect(ul.tiers[0].period).toBe('day');
    expect(ul.tiers[1].count).toBe(10000);
  });

  it('parses unlimited tier', () => {
    const ast = parse("limit 'exports':\n  enterprise allows unlimited");
    const ul = ast.body.find(n => n.type === 'usage_limit');
    expect(ul.tiers[0].tier).toBe('enterprise');
    expect(ul.tiers[0].count).toBe(-1);
  });

  it('reports error for limit without name', () => {
    const ast = parse("limit:\n  free allows 5 per month");
    expect(ast.errors.length > 0).toBe(true);
  });
});

describe('Compiler - usage limit', () => {
  it('compiles usage limit to JS config only (1:1 rule)', () => {
    const result = compileProgram("target: backend\nlimit 'ai_generations':\n  free allows 5 per month\n  pro allows unlimited");
    expect(result.javascript).toContain('LIMITS_AI_GENERATIONS');
    expect(result.javascript).toContain("'free'");
    expect(result.javascript).toContain('max: 5');
    expect(result.javascript).toContain('Infinity');
    // 1:1 rule: no generated checker function
    expect(result.javascript).not.toContain('function check_');
  });

  it('compiles usage limit to Python config only (1:1 rule)', () => {
    const result = compileProgram("target: python backend\nlimit 'ai_generations':\n  free allows 5 per month\n  pro allows unlimited");
    expect(result.python).toContain('LIMITS_AI_GENERATIONS');
    expect(result.python).toContain('"free"');
    expect(result.python).toContain('float("inf")');
    // 1:1 rule: no generated checker function
    expect(result.python).not.toContain('def check_');
  });
});

describe('E2E - Phase 18: SaaS billing', () => {
  it('generates billing config objects in JS (1:1 rule)', () => {
    const result = compileProgram(`
target: backend
checkout 'Pro Plan':
  price is 'price_abc123'
  mode is 'subscription'
  success_url is '/success'
  cancel_url is '/pricing'

limit 'ai_generations':
  free allows 5 per month
  pro allows unlimited
    `);
    expect(result.javascript).toContain('CHECKOUT_PRO_PLAN');
    expect(result.javascript).toContain('LIMITS_AI_GENERATIONS');
    // 1:1 rule: config only, no generated routes or functions
    expect(result.javascript).not.toContain('app.post');
    expect(result.javascript).not.toContain('function check_');
  });
});

// =============================================================================
// PHASE 17: WEBHOOKS & OAUTH
// =============================================================================

describe('Parser - webhook', () => {
  it('parses webhook with path and signed with', () => {
    const ast = parse("webhook '/stripe/events' signed with env('STRIPE_SECRET'):\n  send back 'ok'");
    const wh = ast.body.find(n => n.type === 'webhook');
    expect(wh).toBeDefined();
    expect(wh.path).toBe('/stripe/events');
    expect(wh.secret).toBeDefined();
    expect(wh.body.length).toBe(1);
  });

  it('parses webhook without signature verification', () => {
    const ast = parse("webhook '/events':\n  send back 'ok'");
    const wh = ast.body.find(n => n.type === 'webhook');
    expect(wh).toBeDefined();
    expect(wh.path).toBe('/events');
    expect(wh.secret).toBeNull();
  });

  it('reports error for webhook without path', () => {
    const ast = parse("webhook:\n  send back 'ok'");
    expect(ast.errors.length > 0).toBe(true);
  });
});

describe('Compiler - webhook', () => {
  it('compiles webhook to JS with HMAC verification', () => {
    const result = compileProgram("target: backend\nwebhook '/stripe/events' signed with env('STRIPE_SECRET'):\n  send back 'ok'");
    expect(result.javascript).toContain("app.post('/stripe/events'");
    expect(result.javascript).toContain('crypto');
    expect(result.javascript).toContain('createHmac');
    expect(result.javascript).toContain('stripe-signature');
  });

  it('compiles webhook to JS without signature when not signed', () => {
    const result = compileProgram("target: backend\nwebhook '/events':\n  send back 'ok'");
    expect(result.javascript).toContain("app.post('/events'");
  });

  it('compiles webhook to Python with HMAC verification', () => {
    const result = compileProgram("target: python backend\nwebhook '/stripe/events' signed with env('STRIPE_SECRET'):\n  send back 'ok'");
    expect(result.python).toContain('@app.post("/stripe/events")');
    expect(result.python).toContain('hmac');
    expect(result.python).toContain('signature');
  });

  it('makes incoming available in webhook body', () => {
    const result = compileProgram("target: backend\nwebhook '/events':\n  send back 'ok'");
    expect(result.javascript).toContain('incoming = req.body');
  });
});

describe('Parser - oauth config', () => {
  it('parses oauth block with provider and config', () => {
    const ast = parse("oauth 'github':\n  client_id is env('GH_ID')\n  scopes are ['user:email']\n  callback is '/auth/github/callback'");
    const oauth = ast.body.find(n => n.type === 'oauth_config');
    expect(oauth).toBeDefined();
    expect(oauth.provider).toBe('github');
    expect(oauth.config.client_id).toBeDefined();
    expect(oauth.config.scopes).toBeDefined();
  });

  it('parses oauth scopes as list', () => {
    const ast = parse("oauth 'github':\n  scopes are ['user:email', 'read:org']");
    const oauth = ast.body.find(n => n.type === 'oauth_config');
    expect(oauth.config.scopes.length).toBe(2);
    expect(oauth.config.scopes[0]).toBe('user:email');
  });

  it('reports error for oauth without provider', () => {
    const ast = parse("oauth:\n  client_id is 'abc'");
    expect(ast.errors.length > 0).toBe(true);
  });
});

describe('Compiler - oauth config', () => {
  it('compiles oauth to JS config constants (1:1 rule)', () => {
    const result = compileProgram("target: backend\noauth 'github':\n  client_id is env('GH_ID')\n  client_secret is env('GH_SECRET')");
    expect(result.javascript).toContain('OAUTH_GITHUB_CLIENT_ID');
    expect(result.javascript).toContain('OAUTH_GITHUB_CLIENT_SECRET');
    // 1:1 rule: no generated routes
    expect(result.javascript).not.toContain("app.get(");
  });

  it('compiles oauth to Python config constants (1:1 rule)', () => {
    const result = compileProgram("target: python backend\noauth 'github':\n  client_id is env('GH_ID')\n  client_secret is env('GH_SECRET')");
    expect(result.python).toContain('OAUTH_GITHUB_CLIENT_ID');
    // 1:1 rule: no generated routes
    expect(result.python).not.toContain('@app.get');
    expect(result.python).not.toContain('RedirectResponse');
  });
});

describe('E2E - Phase 17: Webhook + OAuth app', () => {
  it('generates webhook endpoint and oauth config in JS', () => {
    const result = compileProgram(`
target: backend
webhook '/stripe/events' signed with env('STRIPE_SECRET'):
  send back 'ok'

oauth 'github':
  client_id is env('GITHUB_CLIENT_ID')
  client_secret is env('GITHUB_CLIENT_SECRET')
  scopes are ['user:email']
    `);
    // Webhook is an endpoint-like block -- compiles to a route (1:1)
    expect(result.javascript).toContain("app.post('/stripe/events'");
    expect(result.javascript).toContain('createHmac');
    // OAuth is config only (1:1)
    expect(result.javascript).toContain('OAUTH_GITHUB_CLIENT_ID');
    expect(result.javascript).not.toContain("app.get('/auth/github'");
  });
});

// =============================================================================
// PHASE 20: ADVANCED FEATURES
// =============================================================================

describe('Parser - stream', () => {
  it('parses stream block with body', () => {
    const ast = parse("on GET '/stream':\n  stream:\n    send back 'hello'\n    wait 100ms");
    const endpoint = ast.body.find(n => n.type === 'endpoint');
    const stream = endpoint.body.find(n => n.type === 'stream');
    expect(stream).toBeDefined();
    expect(stream.body.length).toBe(2);
  });
});

describe('Compiler - stream', () => {
  it('compiles stream to JS Server-Sent Events', () => {
    const result = compileProgram("target: backend\non GET '/stream':\n  stream:\n    send back 'hello'");
    expect(result.javascript).toContain('text/event-stream');
    expect(result.javascript).toContain('writeHead');
  });

  it('compiles stream to Python StreamingResponse', () => {
    const result = compileProgram("target: python backend\non GET '/stream':\n  stream:\n    send back 'hello'");
    expect(result.python).toContain('StreamingResponse');
    expect(result.python).toContain('text/event-stream');
  });
});

describe('Parser - background', () => {
  it('parses background job with name and schedule', () => {
    const ast = parse("background 'send-emails':\n  runs every 1 hour\n  show 'running'");
    const bg = ast.body.find(n => n.type === 'background');
    expect(bg).toBeDefined();
    expect(bg.name).toBe('send-emails');
    expect(bg.schedule.value).toBe(1);
    expect(bg.schedule.unit).toBe('hour');
  });

  it('reports error for background without schedule', () => {
    const ast = parse("background 'test':\n  show 'running'");
    expect(ast.errors.length > 0).toBe(true);
  });
});

describe('Compiler - background', () => {
  it('compiles background job to JS setInterval', () => {
    const result = compileProgram("target: backend\nbackground 'send-emails':\n  runs every 1 hour\n  show 'sending'");
    expect(result.javascript).toContain('setInterval');
    expect(result.javascript).toContain('3600000');
  });

  it('compiles background job to Python asyncio task', () => {
    const result = compileProgram("target: python backend\nbackground 'send-emails':\n  runs every 1 hour\n  show 'sending'");
    expect(result.python).toContain('asyncio');
    expect(result.python).toContain('job_send_emails');
    expect(result.python).toContain('on_event("startup")');
  });
});

describe('Parser - subscribe', () => {
  it('parses subscribe to channel with body', () => {
    const ast = parse("subscribe to 'messages':\n  show 'got message'");
    const sub = ast.body.find(n => n.type === 'subscribe');
    expect(sub).toBeDefined();
    expect(sub.channel).toBe('messages');
    expect(sub.body.length).toBe(1);
  });

  it('reports error for subscribe without channel', () => {
    const ast = parse("subscribe to:\n  show 'msg'");
    expect(ast.errors.length > 0).toBe(true);
  });
});

describe('Compiler - subscribe', () => {
  it('compiles subscribe to JS WebSocket', () => {
    const result = compileProgram("target: backend\nsubscribe to 'messages':\n  show 'got message'");
    expect(result.javascript).toContain('WebSocket');
    expect(result.javascript).toContain('connection');
  });

  it('compiles subscribe to Python WebSocket', () => {
    const result = compileProgram("target: python backend\nsubscribe to 'messages':\n  show 'got message'");
    expect(result.python).toContain('websocket');
    expect(result.python).toContain('ws_messages');
  });
});

describe('Parser - migration', () => {
  it('parses migration with add column operation', () => {
    const ast = parse("migration 'add-status':\n  add column 'status' to Users as text, default 'active'");
    const mig = ast.body.find(n => n.type === 'migration');
    expect(mig).toBeDefined();
    expect(mig.name).toBe('add-status');
    expect(mig.operations.length).toBe(1);
    expect(mig.operations[0].op).toBe('add_column');
    expect(mig.operations[0].column).toBe('status');
    expect(mig.operations[0].table).toBe('Users');
  });

  it('parses migration with remove column', () => {
    const ast = parse("migration 'remove-legacy':\n  remove column 'old_field' from Users");
    const mig = ast.body.find(n => n.type === 'migration');
    expect(mig.operations[0].op).toBe('remove_column');
    expect(mig.operations[0].column).toBe('old_field');
  });

  it('reports error for migration without name', () => {
    const ast = parse("migration:\n  add column 'x' to Users as text");
    expect(ast.errors.length > 0).toBe(true);
  });
});

describe('Compiler - migration', () => {
  it('compiles migration to JS ALTER TABLE', () => {
    const result = compileProgram("target: backend\nmigration 'add-status':\n  add column 'status' to Users as text, default 'active'");
    expect(result.javascript).toContain('ALTER TABLE');
    expect(result.javascript).toContain('ADD COLUMN');
    expect(result.javascript).toContain('status TEXT');
  });

  it('compiles migration to Python ALTER TABLE', () => {
    const result = compileProgram("target: python backend\nmigration 'add-status':\n  add column 'status' to Users as text, default 'active'");
    expect(result.python).toContain('ALTER TABLE');
    expect(result.python).toContain('ADD COLUMN');
  });
});

describe('Parser - wait', () => {
  it('parses wait with milliseconds', () => {
    const ast = parse("wait 100ms");
    const w = ast.body.find(n => n.type === 'wait');
    expect(w).toBeDefined();
    expect(w.duration).toBe(100);
  });

  it('parses wait with seconds', () => {
    const ast = parse("wait 2 seconds");
    const w = ast.body.find(n => n.type === 'wait');
    expect(w.duration).toBe(2);
    expect(w.unit).toBe('second');
  });

  it('reports error for wait without duration', () => {
    const ast = parse("wait");
    expect(ast.errors.length > 0).toBe(true);
  });
});

describe('Compiler - wait', () => {
  it('compiles wait to JS setTimeout promise', () => {
    const result = compileProgram("target: backend\non GET '/slow':\n  wait 2 seconds\n  send back 'done'");
    expect(result.javascript).toContain('setTimeout');
    expect(result.javascript).toContain('2000');
    expect(result.javascript).toContain('Promise');
  });

  it('compiles wait to Python asyncio.sleep', () => {
    const result = compileProgram("target: python backend\non GET '/slow':\n  wait 2 seconds\n  send back 'done'");
    expect(result.python).toContain('asyncio.sleep(2');
  });
});

describe('E2E - Phase 20: Advanced backend', () => {
  it('generates background job + migration in Python', () => {
    const result = compileProgram(`
target: python backend
background 'daily-cleanup':
  runs every 24 hours
  show 'cleaning up'

migration 'add-status':
  add column 'status' to Users as text, default 'active'
    `);
    expect(result.python).toContain('asyncio');
    expect(result.python).toContain('job_daily_cleanup');
    expect(result.python).toContain('ALTER TABLE');
  });

  it('generates WebSocket subscription in JS', () => {
    const result = compileProgram(`
target: backend
subscribe to 'chat':
  show 'message received'
    `);
    expect(result.javascript).toContain('WebSocket');
    expect(result.javascript).toContain('wss_chat');
  });
});

// =============================================================================
// COMPILER FIXES: Runtime, Filter Objects, Try/Catch, Incoming
// =============================================================================

describe('Compiler - db runtime import', () => {
  it('JS backend includes db require', () => {
    const result = compileProgram(`
build for javascript backend
when user calls GET /api/health:
  send back 'ok'
    `);
    expect(result.javascript).toContain("require('./clear-runtime/db')");
  });
});

describe('Compiler - where-clause filter objects', () => {
  it('compiles where condition to filter object in JS', () => {
    const result = compileProgram(`
build for javascript backend
when user calls GET /api/posts:
  posts = look up Posts where published is true
  send back posts
    `);
    expect(result.javascript).toContain('{ published: true }');
    expect(result.javascript).not.toContain('(published == true)');
  });

  it('compiles where id condition to filter object in JS', () => {
    const result = compileProgram(`
build for javascript backend
when user calls GET /api/items/:id:
  item = look up Items where id is incoming's id
  send back item
    `);
    expect(result.javascript).toContain('{ id: incoming.id }');
  });

  it('compiles remove where to filter object', () => {
    const result = compileProgram(`
build for javascript backend
when user calls DELETE /api/items/:id:
  remove from Items where id is incoming's id
  send back 'deleted'
    `);
    expect(result.javascript).toContain("db.remove('items', { id: incoming.id })");
  });

  it('compiles where condition to filter object in Python', () => {
    const result = compileProgram(`
build for python backend
when user calls GET /api/posts:
  posts = look up Posts where published is true
  send back posts
    `);
    expect(result.python).toContain('{"published": True}');
  });
});

describe('Compiler - findOne vs findAll', () => {
  it('uses findAll for look up all', () => {
    const result = compileProgram(`
build for javascript backend
when user calls GET /api/todos:
  todos = look up all Todos
  send back todos
    `);
    expect(result.javascript).toContain("db.findAll('todos')");
  });

  it('uses findOne for look up where id is', () => {
    const result = compileProgram(`
build for javascript backend
when user calls GET /api/todos/:id:
  todo = look up Todos where id is incoming's id
  send back todo
    `);
    expect(result.javascript).toContain("db.findOne('todos'");
  });

  it('uses findAll for look up where non-id field', () => {
    const result = compileProgram(`
build for javascript backend
when user calls GET /api/posts:
  posts = look up Posts where published is true
  send back posts
    `);
    expect(result.javascript).toContain("db.findAll('posts'");
  });
});

describe('Compiler - save vs update', () => {
  it('compiles save-as to db.insert', () => {
    const result = compileProgram(`
build for javascript backend
when user calls POST /api/todos:
  new_todo = save incoming as Todo
  send back new_todo
    `);
    expect(result.javascript).toContain("db.insert('todos'");
  });

  it('compiles save-to to db.update', () => {
    const result = compileProgram(`
build for javascript backend
when user calls PUT /api/todos/:id:
  save incoming to Todos
  send back 'updated'
    `);
    expect(result.javascript).toContain("db.update('todos'");
  });
});

describe('Compiler - endpoint try/catch', () => {
  it('wraps JS endpoint body in try/catch', () => {
    const result = compileProgram(`
build for javascript backend
when user calls GET /api/health:
  send back 'ok'
    `);
    expect(result.javascript).toContain('try {');
    expect(result.javascript).toContain('catch (err)');
    expect(result.javascript).toContain('res.status(500).json');
  });

  it('wraps Python endpoint body in try/except', () => {
    const result = compileProgram(`
build for python backend
when user calls GET /api/health:
  send back 'ok'
    `);
    expect(result.python).toContain('try:');
    expect(result.python).toContain('except Exception');
    expect(result.python).toContain('status_code=500');
  });
});

describe('Compiler - incoming variable', () => {
  it('omits incoming for GET endpoints without body references', () => {
    const result = compileProgram(`
build for javascript backend
when user calls GET /api/todos:
  todos = look up all Todos
  send back todos
    `);
    expect(result.javascript).not.toContain('const incoming');
  });

  it('includes incoming for POST endpoints with validation', () => {
    const result = compileProgram(`
build for javascript backend
when user calls POST /api/todos:
  validate incoming:
    title is text, required
  new_todo = save incoming as Todo
  send back new_todo
    `);
    expect(result.javascript).toContain('const incoming');
  });

  it('includes incoming for endpoints referencing incoming property', () => {
    const result = compileProgram(`
build for javascript backend
when user calls GET /api/todos/:id:
  todo = look up Todos where id is incoming's id
  send back todo
    `);
    expect(result.javascript).toContain('const incoming');
  });
});

describe('Compiler - lookupAll parser flag', () => {
  it('sets lookupAll true when "all" keyword is present', () => {
    const ast = parse('todos = look up all Todos');
    const node = ast.body.find(n => n.type === 'crud');
    expect(node.lookupAll).toBe(true);
  });

  it('sets lookupAll false when "all" keyword is absent', () => {
    const ast = parse('todo = look up Todos where id is 1');
    const node = ast.body.find(n => n.type === 'crud');
    expect(node.lookupAll).toBe(false);
  });
});

// =============================================================================
// NEW SYNTAX FORMS (PHILOSOPHY.md redesign)
// =============================================================================

describe('Syntax - define X as', () => {
  it('parses define X as: expression', () => {
    const ast = parse('define total as: price + tax');
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'assign');
    expect(node).toBeDefined();
    expect(node.name).toBe('total');
  });

  it('parses define X as expression (no colon)', () => {
    const ast = parse("define name as 'Alice'");
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'assign');
    expect(node).toBeDefined();
    expect(node.name).toBe('name');
  });

  it('parses define X as: CRUD lookup', () => {
    const ast = parse('define all_posts as: look up all Posts');
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'crud');
    expect(node).toBeDefined();
    expect(node.variable).toBe('all_posts');
  });
});

describe('Syntax - receiving on endpoints', () => {
  it('parses endpoint with receiving keyword', () => {
    const ast = parse(`
when user calls POST /api/todos receiving post_data:
  send back post_data
    `);
    expect(ast.errors).toHaveLength(0);
    const ep = ast.body.find(n => n.type === 'endpoint');
    expect(ep).toBeDefined();
    expect(ep.receivingVar).toBe('post_data');
  });

  it('compiles receiving to named variable instead of incoming', () => {
    const result = compileProgram(`
build for javascript backend
when user calls POST /api/todos receiving post_data:
  send back post_data
    `);
    expect(result.javascript).toContain('const post_data');
    expect(result.javascript).not.toContain('const incoming');
  });
});

describe('Syntax - this endpoint requires auth', () => {
  it('parses this endpoint requires auth', () => {
    const ast = parse(`
when user calls GET /api/secret:
  this endpoint requires auth
  send back 'secret'
    `);
    expect(ast.errors).toHaveLength(0);
    const ep = ast.body.find(n => n.type === 'endpoint');
    const authNode = ep.body.find(n => n.type === 'requires_auth');
    expect(authNode).toBeDefined();
  });

  it('parses this endpoint requires role', () => {
    const ast = parse(`
when user calls GET /api/admin:
  this endpoint requires role 'admin'
  send back 'admin data'
    `);
    expect(ast.errors).toHaveLength(0);
    const ep = ast.body.find(n => n.type === 'endpoint');
    const roleNode = ep.body.find(n => n.type === 'requires_role');
    expect(roleNode).toBeDefined();
  });
});

describe('Syntax - look up all records in X table', () => {
  it('parses look up all records in Posts table', () => {
    const ast = parse('define all_posts as: look up all records in Posts table');
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'crud');
    expect(node).toBeDefined();
    expect(node.target).toBe('Posts');
    expect(node.lookupAll).toBe(true);
  });

  it('parses look up records in X table where condition', () => {
    const ast = parse('define my_post as: look up records in Posts table where id is 5');
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'crud');
    expect(node).toBeDefined();
    expect(node.target).toBe('Posts');
    expect(node.condition).toBeDefined();
  });
});

describe('Syntax - collection operations', () => {
  it('parses sum of expression', () => {
    const ast = parse('define total as: sum of all_prices');
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'assign');
    expect(node).toBeDefined();
    expect(node.expression.type).toBe('call');
    expect(node.expression.name).toBe('sum');
  });

  it('parses first of expression', () => {
    const ast = parse('define first_item as: first of items');
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'assign');
    expect(node).toBeDefined();
    expect(node.expression.type).toBe('call');
  });

  it('parses last of expression', () => {
    const ast = parse('define last_item as: last of items');
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'assign');
    expect(node).toBeDefined();
    expect(node.expression.type).toBe('call');
  });

  it('parses count of expression', () => {
    const ast = parse('define how_many as: count of active_users');
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'assign');
    expect(node).toBeDefined();
    expect(node.expression.type).toBe('call');
  });

  it('parses each X in Y pattern (map)', () => {
    const ast = parse("define all_names as: each user's name in active_users");
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'assign');
    expect(node).toBeDefined();
  });

  it('compiles sum of to JS', () => {
    const result = compileProgram(`
build for web
total = sum of prices
    `);
    expect(result.javascript).toContain('_clear_sum(prices)');
  });

  it('compiles count of to JS', () => {
    const result = compileProgram(`
build for web
how_many = count of users
    `);
    expect(result.javascript).toContain('_clear_len(users)');
  });

  it('compiles first of to JS', () => {
    const result = compileProgram(`
build for web
first_item = first of items
    `);
    expect(result.javascript).toContain('items[0]');
  });

  it('compiles last of to JS', () => {
    const result = compileProgram(`
build for web
last_item = last of items
    `);
    expect(result.javascript).toContain('items[items.length - 1]');
  });
});

// =============================================================================
// AUTH RUNTIME + VALIDATOR FIXES
// =============================================================================

describe('Compiler - auth middleware injection', () => {
  it('includes auth import when endpoint uses requires auth', () => {
    const result = compileProgram(`
build for javascript backend
when user calls DELETE /api/items/:id:
  requires auth
  remove from Items where id is incoming's id
  send back 'deleted'
    `);
    expect(result.javascript).toContain("require('./clear-runtime/auth')");
    expect(result.javascript).toContain('auth.middleware()');
  });

  it('omits auth import when no endpoint uses auth', () => {
    const result = compileProgram(`
build for javascript backend
when user calls GET /api/health:
  send back 'ok'
    `);
    expect(result.javascript).not.toContain('auth');
  });
});

describe('Validator - receiving var in scope', () => {
  it('allows receiving var to be used in endpoint body', () => {
    const result = compileProgram(`
build for javascript backend
when user calls POST /api/items receiving item_data:
  define new_item as: save item_data as Item
  send back new_item
    `);
    expect(result.errors).toHaveLength(0);
  });
});

describe('Compiler - define as with new syntax', () => {
  it('compiles define-as CRUD in backend context', () => {
    const result = compileProgram(`
build for javascript backend
when user calls GET /api/links:
  define all_links as: look up all records in Link table
  send back all_links
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain("db.findAll('links')");
  });

  it('compiles collection operations in backend context', () => {
    const result = compileProgram(`
build for javascript backend
when user calls GET /api/stats:
  define all_items as: look up all Items
  define total as: count of all_items
  send back total
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('_clear_len(all_items)');
  });
});

// =============================================================================
// RED-TEAM FIXES
// =============================================================================

describe('Compiler - schema registration in backend', () => {
  it('calls db.createTable for data shapes in backend mode', () => {
    const result = compileProgram(`
build for javascript backend
create data shape User:
  name is text, required
  email is text, required, unique
    `);
    expect(result.javascript).toContain("db.createTable('users', UserSchema)");
  });

  it('does not call db.createTable in web mode', () => {
    const result = compileProgram(`
build for web
create data shape User:
  name is text, required
    `);
    expect(result.javascript).not.toContain('db.createTable');
  });
});

describe('Compiler - rate limit import', () => {
  it('includes rateLimit import when endpoint uses rate limiting', () => {
    const result = compileProgram(`
build for javascript backend
when user calls POST /api/items:
  rate limit 10 per minute
  send back 'ok'
    `);
    expect(result.javascript).toContain("require('./clear-runtime/rateLimit')");
  });
});

describe('Compiler - param precedence', () => {
  it('separates params and body to prevent injection', () => {
    const result = compileProgram(`
build for javascript backend
when user calls POST /api/items:
  send back incoming
    `);
    // No receiving var = uses req.params only (prevents param injection)
    expect(result.javascript).toContain('req.params');
  });
});

// =============================================================================
// E2E: STRESS TEST APPS COMPILE CLEANLY
// =============================================================================

describe('E2E - Tier 1 stress test apps compile', () => {
  it('todo-api compiles with 0 errors', () => {
    const src = `
build for javascript backend
create data shape Todo:
  title is text, required
  completed is boolean, default false
when user calls GET /api/todos:
  define all_todos as: look up all Todos
  send back all_todos
when user calls POST /api/todos:
  validate incoming:
    title is text, required
  define new_todo as: save incoming as Todo
  send back new_todo status 201
    `;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain("db.findAll('todos')");
    expect(result.javascript).toContain("db.insert('todos'");
    expect(result.javascript).toContain('try {');
    expect(result.javascript).toContain("db.createTable('todos'");
  });
});

describe('E2E - Tier 2 stress test apps compile', () => {
  it('ecommerce-api compiles with 0 errors', () => {
    const src = `
build for javascript backend
create data shape Product:
  name is text, required
  price (number), required
  stock (number), default 100
create data shape Order:
  user_id is text, required
  total (number), required
  status is text, default 'pending'
checkout 'Standard Purchase':
  price is 'price_auto'
  mode is 'payment'
when user calls GET /api/products:
  define all_products as: look up all records in Product table
  send back all_products
when user calls POST /api/orders receiving order_data:
  requires auth
  define new_order as: save order_data as Order
  send back new_order status 201
webhook '/stripe/events' signed with env('STRIPE_SECRET'):
  send back 'ok'
    `;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('CHECKOUT_STANDARD_PURCHASE');
    expect(result.javascript).toContain("auth.middleware()");
    expect(result.javascript).toContain("stripe-signature");
  });

  it('webhook-relay compiles with 0 errors', () => {
    const src = `
build for javascript backend
create data shape Destination:
  name is text, required
  url is text, required
webhook '/webhooks/stripe' signed with env('STRIPE_SECRET'):
  send back 'received'
when user calls GET /api/destinations:
  requires auth
  define all_dests as: look up all records in Destination table
  send back all_dests
background 'retry-deliveries':
  runs every 5 minutes
    `;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('setInterval');
    expect(result.javascript).toContain("stripe-signature");
  });
});

// =============================================================================
// PRODUCTION HARDENING SYNTAX
// =============================================================================

describe('Syntax - log every request', () => {
  it('compiles to request logging middleware', () => {
    const result = compileProgram(`
build for javascript backend
log every request
when user calls GET /api/health:
  send back 'ok'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('req.method');
    expect(result.javascript).toContain('req.path');
  });
});

describe('Syntax - allow cross-origin requests', () => {
  it('compiles to CORS middleware', () => {
    const result = compileProgram(`
build for javascript backend
allow cross-origin requests
when user calls GET /api/health:
  send back 'ok'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('Access-Control');
  });
});

// =============================================================================
// COMPONENT SYSTEM
// =============================================================================

describe('Component - parsing', () => {
  it('parses define component with receiving props', () => {
    const ast = parse(`
define component TodoItem receiving title, completed:
  text title
    `);
    expect(ast.errors).toHaveLength(0);
    const comp = ast.body.find(n => n.type === 'component_def');
    expect(comp).toBeDefined();
    expect(comp.name).toBe('TodoItem');
    expect(comp.props).toEqual(['title', 'completed']);
    expect(comp.body).toHaveLength(1);
  });

  it('parses component with no props', () => {
    const ast = parse(`
define component Header:
  heading 'Welcome'
    `);
    expect(ast.errors).toHaveLength(0);
    const comp = ast.body.find(n => n.type === 'component_def');
    expect(comp).toBeDefined();
    expect(comp.name).toBe('Header');
    expect(comp.props).toEqual([]);
  });
});

describe('Component - compilation', () => {
  it('compiles component to JS function', () => {
    const result = compileProgram(`
build for web
define component Greeting receiving name:
  heading 'Hello'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('function Greeting');
    expect(result.javascript).toContain('name');
  });
});

// =============================================================================
// E2E: TIER 3 STRESS TEST APPS
// =============================================================================

describe('E2E - Tier 3 stress test apps compile', () => {
  it('chat-backend compiles with WebSocket, auth, CORS, logging', () => {
    const src = `
build for javascript backend
log every request
allow cross-origin requests
create data shape Message:
  room is text, required
  content is text, required
when user calls POST /api/messages receiving msg_data:
  requires auth
  define new_msg as: save msg_data as Message
  send back new_msg status 201
subscribe to 'chat':
  show 'received'
    `;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('WebSocket');
    expect(result.javascript).toContain('Access-Control');
    expect(result.javascript).toContain('req.method');
  });

  it('job-queue compiles with background jobs and auth', () => {
    const src = `
build for javascript backend
create data shape Job:
  type is text, required
  status is text, default 'pending'
when user calls POST /api/jobs receiving job_data:
  requires auth
  define new_job as: save job_data as Job
  send back new_job status 201
background 'process-jobs':
  runs every 30 seconds
    `;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('setInterval');
    expect(result.javascript).toContain('30000');
  });

  it('live-dashboard compiles with SSE stream', () => {
    const src = `
build for javascript backend
create data shape Metric:
  name is text, required
  value (number), required
when user calls GET /api/stream:
  stream:
    send back 'heartbeat'
    wait 5 seconds
    `;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('text/event-stream');
    expect(result.javascript).toContain('5000');
  });
});

// =============================================================================
// CONTENT WITH VARIABLE REFERENCES
// =============================================================================

describe('Content - quotes required, show for variables', () => {
  it('heading requires quoted string', () => {
    const ast = parse("heading 'Hello'");
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'content');
    expect(node).toBeDefined();
    expect(node.text).toBe('Hello');
  });

  it('heading without quotes gives helpful error', () => {
    const ast = parse('heading title');
    expect(ast.errors.length).toBeGreaterThan(0);
    expect(ast.errors[0].message).toContain('show');
  });

  it('component uses show for dynamic values', () => {
    const ast = parse(`
define component Greeting receiving name:
  heading 'Hello'
  show name
    `);
    expect(ast.errors).toHaveLength(0);
    const comp = ast.body.find(n => n.type === 'component_def');
    expect(comp.body).toHaveLength(2);
    expect(comp.body[0].type).toBe('content');
    expect(comp.body[1].type).toBe('show');
  });
});

// =============================================================================
// TIER 4: CAST API
// =============================================================================

describe('E2E - Tier 4: Cast API compiles', () => {
  it('compiles cast-api with 0 errors', () => {
    const src = `
build for javascript backend
log every request
allow cross-origin requests
create data shape Model:
  name is text, required
  type is text, required
create data shape ChatMessage:
  role is text, required
  content is text, required
when user calls GET /api/health:
  send back 'ok'
when user calls GET /api/models:
  requires auth
  define all_models as: look up all records in Model table
  send back all_models
when user calls POST /api/chat receiving chat_data:
  requires auth
  validate chat_data:
    content is text, required
  define msg as: save chat_data as ChatMessage
  send back msg status 201
    `;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('/api/health');
    expect(result.javascript).toContain('/api/models');
    expect(result.javascript).toContain('/api/chat');
    expect(result.javascript).toContain('auth.middleware()');
  });
});

// =============================================================================
// COMPONENT HTML RENDERING
// =============================================================================

describe('Component - HTML rendering', () => {
  it('compiles component to return HTML string in web mode', () => {
    const result = compileProgram(`
build for web
page 'Test':
  heading 'Hello'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('Hello');
  });
});

// =============================================================================
// TYPE VALIDATION
// =============================================================================

describe('Compiler - type validation in endpoints', () => {
  it('generates number type check for number fields', () => {
    const result = compileProgram(`
build for javascript backend
when user calls POST /api/items:
  validate incoming:
    price is number, required
  send back 'ok'
    `);
    expect(result.javascript).toContain('"type":"number"');
    expect(result.javascript).toContain('must be a number');
  });

  it('generates boolean type check for boolean fields', () => {
    const result = compileProgram(`
build for javascript backend
when user calls POST /api/items:
  validate incoming:
    active is boolean, required
  send back 'ok'
    `);
    expect(result.javascript).toContain('"type":"boolean"');
  });
});

// =============================================================================
// TIER 4: LANDING PAGE
// =============================================================================

describe('E2E - Tier 4: Landing page compiles', () => {
  it('compiles multi-page landing with styles', () => {
    const src = `
build for web
style hero:
  background is '#1a1a2e'
  padding = 64
page 'Home' at '/':
  section 'Hero' with style hero:
    heading 'Welcome'
    text 'Hello world'
page 'Signup' at '/signup':
  heading 'Sign Up'
  'Email' as text input
  button 'Submit':
    show 'done'
    `;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('Welcome');
    expect(result.html).toContain('Hello world');
    expect(result.html).toContain('Sign Up');
    expect(result.html).toContain('Email');
    expect(result.javascript).toContain('_recompute');
  });
});

// =============================================================================
// TIER 4: FULL SAAS APP (THE FINAL BOSS)
// =============================================================================

describe('E2E - Tier 4: Full SaaS app compiles', () => {
  it('compiles frontend + backend + billing + auth', () => {
    const src = `
build for web and javascript backend
create data shape User:
  email is text, required, unique
  name is text, required
  plan is text, default 'free'
checkout 'Pro Plan':
  price is 'price_pro'
  mode is 'subscription'
limit 'api_requests':
  free allows 100 per month
  pro allows unlimited
style hero:
  background is '#111'
  padding = 64
page 'Home' at '/':
  section 'Hero' with style hero:
    heading 'Welcome'
page 'Signup' at '/signup':
  'Email' as text input
  button 'Sign Up':
    show 'signing up'
when user calls POST /api/auth/signup receiving signup_data:
  validate signup_data:
    email is text, required, matches email
  define new_user as: save signup_data as User
  send back new_user status 201
when user calls GET /api/health:
  send back 'ok'
webhook '/stripe/events' signed with env('STRIPE_SECRET'):
  send back 'ok'
    `;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    // Frontend output
    expect(result.javascript).toContain('_recompute');
    expect(result.html).toContain('Welcome');
    expect(result.html).toContain('Email');
    // Backend output
    expect(result.serverJS).toContain('/api/auth/signup');
    expect(result.serverJS).toContain('/api/health');
    expect(result.serverJS).toContain('stripe-signature');
    expect(result.serverJS).toContain('CHECKOUT_PRO_PLAN');
    expect(result.serverJS).toContain("db.createTable('users'");
  });
});

// =============================================================================
// ENV() BACKEND COMPILATION
// =============================================================================

describe('Compiler - env() in backend mode', () => {
  it('compiles env() to process.env in JS backend', () => {
    const result = compileProgram(`
build for javascript backend
api_key is env('API_KEY')
when user calls GET /api/health:
  send back 'ok'
    `);
    expect(result.javascript).toContain('process.env["API_KEY"]');
    expect(result.javascript).not.toContain('_clear_env');
  });

  it('compiles env() to os.environ in Python backend', () => {
    const result = compileProgram(`
build for python backend
api_key is env('API_KEY')
when user calls GET /api/health:
  send back 'ok'
    `);
    expect(result.python).toContain('os.environ');
  });
});

// =============================================================================
// COMPONENT DOM RENDERING
// =============================================================================

describe('Component - DOM rendering in HTML', () => {
  it('component definition is skipped in HTML output', () => {
    const result = compileProgram(`
build for web
define component Card receiving title:
  show title
page 'App':
  heading 'Hello'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('Hello');
  });

  it('component compiles to a JS function that builds HTML', () => {
    const result = compileProgram(`
build for web
define component Card receiving title:
  heading 'test'
page 'App':
  heading 'Hello'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('function Card');
    expect(result.javascript).toContain("_html += '<h1>test</h1>'");
    expect(result.javascript).toContain('return _html');
  });

  it('component renders dynamic text from props via show', () => {
    const result = compileProgram(`
build for web
define component Greeting receiving name:
  show name
  text 'Welcome!'
page 'App':
  heading 'Hello'
    `);
    expect(result.errors).toHaveLength(0);
    // show inside component appends to _html
    expect(result.javascript).toContain("_html += name");
    expect(result.javascript).toContain("_html += '<p>Welcome!</p>'");
  });
});

// =============================================================================
// CONNECTION MANAGEMENT
// =============================================================================

describe('Compiler - SSE heartbeat and cleanup', () => {
  it('SSE stream includes heartbeat and cleanup on disconnect', () => {
    const result = compileProgram(`
build for javascript backend
when user calls GET /api/stream:
  stream:
    send back 'event'
    wait 5 seconds
    `);
    expect(result.javascript).toContain('_heartbeat');
    expect(result.javascript).toContain("req.on('close'");
    expect(result.javascript).toContain('clearInterval');
  });
});

describe('Compiler - WebSocket heartbeat and connection tracking', () => {
  it('WebSocket includes heartbeat ping/pong and client tracking', () => {
    const result = compileProgram(`
build for javascript backend
subscribe to 'chat':
  show 'received'
    `);
    expect(result.javascript).toContain('_isAlive');
    expect(result.javascript).toContain('ws.ping()');
    expect(result.javascript).toContain('ws.terminate()');
    expect(result.javascript).toContain('_clients_chat');
    expect(result.javascript).toContain(".delete(ws)");
  });
});

// =============================================================================
// GUARD WITH CUSTOM ERROR MESSAGES
// =============================================================================

describe('Guard - custom error messages', () => {
  it('compiles guard with custom message', () => {
    const result = compileProgram(`
build for javascript backend
when user calls POST /api/order:
  guard stock is greater than 0 or 'Out of stock'
  send back 'ordered'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('Out of stock');
    expect(result.javascript).not.toContain('Access denied');
  });

  it('compiles guard with default message when no custom message', () => {
    const result = compileProgram(`
build for javascript backend
when user calls POST /api/order:
  guard stock is greater than 0
  send back 'ordered'
    `);
    expect(result.javascript).toContain('Access denied');
  });
});

// =============================================================================
// IF/THEN WITH SEND BACK + RETURN BEHAVIOR
// =============================================================================

describe('Compiler - if/then with send back', () => {
  it('compiles send back inside if/then branch', () => {
    const result = compileProgram(`
build for javascript backend
when user calls POST /api/test:
  if stock is 0 then send back 'Out of stock' status 400
  send back 'ok'
    `);
    expect(result.javascript).toContain('res.status(400).json({ message: "Out of stock" })');
  });

  it('all send back statements include return to prevent double-send', () => {
    const result = compileProgram(`
build for javascript backend
when user calls GET /api/test:
  send back 'ok'
    `);
    expect(result.javascript).toContain('return res.json({ message: "ok" })');
  });

  it('send back with status includes return', () => {
    const result = compileProgram(`
build for javascript backend
when user calls GET /api/test:
  send back 'error' status 404
    `);
    expect(result.javascript).toContain('return res.status(404).json({ message: "error" })');
  });

  it('show works as inline then-branch', () => {
    const result = compileProgram(`
build for javascript backend
when user calls GET /api/test:
  if x is 5 then show 'found'
  send back 'ok'
    `);
    expect(result.javascript).toContain('console.log("found")');
  });
});

// =============================================================================
// BOOLEAN/NUMBER DEFAULTS IN DATA SHAPES
// =============================================================================

describe('Data shapes - proper default types', () => {
  it('stores boolean false as actual boolean, not string', () => {
    const ast = parse(`
create a Todos table:
  completed, default false
    `);
    expect(ast.errors).toHaveLength(0);
    const shape = ast.body.find(n => n.type === 'data_shape');
    const field = shape.fields.find(f => f.name === 'completed');
    expect(field.defaultValue).toBe(false);
    expect(typeof field.defaultValue).toBe('boolean');
    expect(field.fieldType).toBe('boolean');
  });

  it('stores boolean true as actual boolean', () => {
    const ast = parse(`
create a Settings table:
  active, default true
    `);
    const shape = ast.body.find(n => n.type === 'data_shape');
    const field = shape.fields.find(f => f.name === 'active');
    expect(field.defaultValue).toBe(true);
    expect(field.fieldType).toBe('boolean');
  });

  it('stores number defaults as numbers', () => {
    const ast = parse(`
create a Products table:
  stock (number), default 100
    `);
    const shape = ast.body.find(n => n.type === 'data_shape');
    const field = shape.fields.find(f => f.name === 'stock');
    expect(field.defaultValue).toBe(100);
    expect(typeof field.defaultValue).toBe('number');
  });

  it('compiles boolean default correctly in JS schema', () => {
    const result = compileProgram(`
build for javascript backend
create data shape Todo:
  completed is boolean, default false
    `);
    expect(result.javascript).toContain('default: false');
    expect(result.javascript).not.toContain('default: "false"');
  });
});

// =============================================================================
// PYTHON COMPILATION FIXES
// =============================================================================

describe('Compiler - Python path params', () => {
  it('converts :param to {param} for FastAPI', () => {
    const result = compileProgram(`
build for python backend
when user calls GET /api/users/:id:
  send back 'ok'
    `);
    expect(result.python).toContain('"/api/users/{id}"');
    expect(result.python).not.toContain(':id');
  });
});

// =============================================================================
// BLOCK-FORM IF/OTHERWISE
// =============================================================================

describe('Block-form if', () => {
  it('parses block if with indented body', () => {
    const ast = parse(`
if x is 5:
  show 'yes'
    `);
    expect(ast.errors).toHaveLength(0);
    const ifNode = ast.body.find(n => n.type === 'if_then');
    expect(ifNode).toBeDefined();
    expect(ifNode.isBlock).toBe(true);
    expect(Array.isArray(ifNode.thenBranch)).toBe(true);
    expect(ifNode.thenBranch).toHaveLength(1);
  });

  it('parses block if with otherwise', () => {
    const ast = parse(`
if x is 5:
  show 'yes'
otherwise:
  show 'no'
    `);
    expect(ast.errors).toHaveLength(0);
    const ifNode = ast.body.find(n => n.type === 'if_then');
    expect(ifNode.otherwiseBranch).toBeDefined();
    expect(Array.isArray(ifNode.otherwiseBranch)).toBe(true);
  });

  it('compiles block if to JS', () => {
    const result = compileProgram(`
build for javascript backend
when user calls POST /api/test receiving data:
  define count as: count of data
  if count is 0:
    send back 'empty' status 400
  send back 'ok'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('if (count == 0)');
    expect(result.javascript).toContain('empty');
  });

  it('compiles block if/otherwise to JS', () => {
    const result = compileProgram(`
build for javascript backend
when user calls POST /api/test receiving data:
  define count as: count of data
  if count is 0:
    send back 'empty' status 400
  otherwise:
    send back 'has data'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('empty');
    expect(result.javascript).toContain('has data');
    expect(result.javascript).toContain('} else {');
  });
});

// =============================================================================
// SSE STREAM MODE
// =============================================================================

describe('Compiler - stream mode respond', () => {
  it('send back inside stream compiles to res.write SSE format', () => {
    const result = compileProgram(`
build for javascript backend
when user calls GET /api/stream:
  stream:
    send back 'heartbeat'
    wait 5 seconds
    `);
    expect(result.javascript).toContain("res.write(");
    expect(result.javascript).toContain("data:");
    expect(result.javascript).not.toContain("res.json(\"heartbeat\")");
  });
});

// =============================================================================
// COLLECTION PIPELINE + COMBINE IN BACKEND
// =============================================================================

describe('Compiler - collection pipeline in backend', () => {
  it('each/sum pipeline compiles to map/reduce', () => {
    const result = compileProgram(`
build for javascript backend
when user calls GET /api/report:
  define orders as: look up all Orders
  define amounts as: each order's total in orders
  define grand_total as: sum of amounts
  send back grand_total
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('.map(item => item.total)');
    expect(result.javascript).toContain('_clear_sum(amounts)');
  });

  it('combine X with Y compiles to spread merge', () => {
    const result = compileProgram(`
build for javascript backend
when user calls PUT /api/items/:id receiving updates:
  this endpoint requires auth
  define item as: look up records in Items table where id is incoming's id
  define merged as: combine item with updates
  save merged to Items
  send back 'updated'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('{ ...item, ...updates }');
    expect(result.javascript).toContain("db.update('items'");
  });
});

// =============================================================================
// COMPREHENSIVE E2E: FULL-SAAS (most complex app)
// =============================================================================

describe('E2E - Full SaaS comprehensive check', () => {
  it('generates all three output types (JS + server + HTML)', () => {
    const result = compileProgram(`
build for web and javascript backend
create data shape User:
  email is text, required, unique
  name is text, required
checkout 'Pro':
  price is 'price_pro'
  mode is 'subscription'
style hero:
  padding = 64
page 'Home' at '/':
  section 'Hero' with style hero:
    heading 'Welcome'
when user calls POST /api/signup receiving data:
  validate data:
    email is text, required, matches email
  define new_user as: save data as User
  send back new_user status 201
when user calls GET /api/health:
  send back 'ok'
    `);
    expect(result.errors).toHaveLength(0);
    // Frontend JS exists
    expect(result.javascript).toBeDefined();
    // Server JS exists with all features
    expect(result.serverJS).toContain('/api/signup');
    expect(result.serverJS).toContain('/api/health');
    expect(result.serverJS).toContain('CHECKOUT_PRO');
    expect(result.serverJS).toContain("db.createTable('users'");
    expect(result.serverJS).toContain('return res.status(201)');
    // HTML exists with page content
    expect(result.html).toContain('Welcome');
    expect(result.html).toContain('<!DOCTYPE html>');
  });
});

// =============================================================================
// CURRENT USER ACCESS
// =============================================================================

describe('Syntax - current user', () => {
  it('compiles current user property access in JS backend', () => {
    const result = compileProgram(`
build for javascript backend
when user calls GET /api/me:
  requires auth
  define user_id as: current user's id
  define email as: current user's email
  send back user_id
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('req.user.id');
    expect(result.javascript).toContain('req.user.email');
  });

  it('compiles current user in Python backend', () => {
    const result = compileProgram(`
build for python backend
when user calls GET /api/me:
  requires auth
  define user_id as: current user's id
  send back user_id
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('request.user');
  });
});

// =============================================================================
// EXPECT COMPILATION
// =============================================================================

describe('Compiler - expect in test blocks', () => {
  it('expect X is Y compiles to equality check', () => {
    const result = compileProgram(`
build for web
double(x) = x * 2
test 'double works':
  result = double(5)
  expect result is 10
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('(result == 10)');
    expect(result.javascript).not.toContain('result_is');
  });
});

// =============================================================================
// FRONTEND API CALLS
// =============================================================================

describe('Syntax - frontend API calls', () => {
  it('parses "send X and Y to URL" (friendly form)', () => {
    const ast = parse(`
page 'App':
  'Name' as text input saves to name
  'Email' as text input saves to email
  button 'Submit':
    send name and email to '/api/signup'
    `);
    expect(ast.errors).toHaveLength(0);
    const page = ast.body[0];
    const btn = page.body.find(n => n.type === 'button');
    const apiCall = btn.body.find(n => n.type === 'api_call');
    expect(apiCall).toBeDefined();
    expect(apiCall.method).toBe('POST');
    expect(apiCall.url).toBe('/api/signup');
    expect(apiCall.fields).toEqual(['name', 'email']);
  });

  it('compiles send-to with specific fields', () => {
    const result = compileProgram(`
build for web
page 'App':
  'Name' as text input saves to name
  'Email' as text input saves to email
  button 'Submit':
    send name and email to '/api/signup'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('fetch("/api/signup"');
    expect(result.javascript).toContain('name: _state.name');
    expect(result.javascript).toContain('email: _state.email');
  });

  it('parses "post to URL" (terse form)', () => {
    const ast = parse(`
page 'App':
  button 'Submit':
    post to '/api/signup'
    `);
    expect(ast.errors).toHaveLength(0);
    const btn = ast.body[0].body.find(n => n.type === 'button');
    const apiCall = btn.body.find(n => n.type === 'api_call');
    expect(apiCall).toBeDefined();
    expect(apiCall.method).toBe('POST');
  });

  it('parses "get from URL"', () => {
    const ast = parse(`
page 'App':
  button 'Load':
    get from '/api/items'
    `);
    expect(ast.errors).toHaveLength(0);
    const btn = ast.body[0].body.find(n => n.type === 'button');
    const apiCall = btn.body.find(n => n.type === 'api_call');
    expect(apiCall).toBeDefined();
    expect(apiCall.method).toBe('GET');
  });
});

// =============================================================================
// ASYNC BUTTON HANDLERS + RESPONSE STORAGE
// =============================================================================

describe('Compiler - async button with API call', () => {
  it('button with send-to compiles to async handler', () => {
    const result = compileProgram(`
build for web
page 'App':
  'Email' as text input saves to email
  button 'Submit':
    send email to '/api/signup'
    show 'Done'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('async ');
    expect(result.javascript).toContain('await fetch');
    expect(result.javascript).toContain('/api/signup');
  });

  it('button without API call stays synchronous', () => {
    const result = compileProgram(`
build for web
page 'App':
  button 'Click':
    show 'clicked'
    `);
    expect(result.javascript).not.toContain('async');
  });
});

// =============================================================================
// OBJECT FIELD MUTATION
// =============================================================================

describe('Syntax - set field on object', () => {
  it('parses set X property to Y as assignment', () => {
    const ast = parse("order's status is 'complete'");
    expect(ast.errors).toHaveLength(0);
    // This should be an assignment to order.status
    const node = ast.body[0];
    expect(node.type).toBe('assign');
  });

  it('compiles possessive assignment to field set', () => {
    const result = compileProgram(`
build for web
create order:
  status is 'pending'
order's status is 'complete'
show order's status
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain("order.status = ");
    expect(result.javascript).toContain('"complete"');
  });
});

// =============================================================================
// LIST OPERATIONS IN REACTIVE MODE
// =============================================================================

describe('Reactive - list state and add-to', () => {
  it('empty list is added to reactive state', () => {
    const result = compileProgram(`
build for web
page 'App':
  items is an empty list
  'Item' as text input saves to item
  heading 'List'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('items: []');
  });

  it('add X to Y compiles to push in reactive mode', () => {
    const result = compileProgram(`
build for web
page 'App':
  items is an empty list
  'Item' as text input saves to item
  button 'Add':
    add item to items
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('_state.items.push(_state.item)');
  });

  it('add X to Y works in non-reactive mode too', () => {
    const result = compileProgram(`
build for web
items is an empty list
add 'hello' to items
show items
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('items.push("hello")');
  });
});

// =============================================================================
// DYNAMIC LIST RENDERING
// =============================================================================

describe('Reactive - dynamic list rendering', () => {
  it('for each in reactive mode renders to innerHTML', () => {
    const result = compileProgram(`
build for web
page 'App':
  items is an empty list
  'Item' as text input saves to item
  button 'Add':
    add item to items
  for each item in items:
    show item
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('_container.innerHTML');
    expect(result.javascript).toContain('_listSource.map');
    expect(result.javascript).toContain('clear-list-item');
  });
});

// =============================================================================
// CANONICAL INPUT SYNTAX: 'Label' is a text input
// =============================================================================

describe('Syntax - is a text input (canonical)', () => {
  it('parses the canonical form', () => {
    const ast = parse("'Email' is a text input that saves to email");
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'ask_for');
    expect(node).toBeDefined();
    expect(node.variable).toBe('email');
    expect(node.inputType).toBe('text');
    expect(node.label).toBe('Email');
  });

  it('parses without saves-to (auto-derives variable)', () => {
    const ast = parse("'Full Name' is a text input");
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'ask_for');
    expect(node).toBeDefined();
    expect(node.variable).toBe('full_name');
  });

  it('parses number input', () => {
    const ast = parse("'Price' is a number input that saves to price");
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'ask_for');
    expect(node.inputType).toBe('number');
  });

  it('old syntax still works as alias', () => {
    const ast = parse("'Email' as text input saves to email");
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'ask_for');
    expect(node).toBeDefined();
    expect(node.variable).toBe('email');
  });

  it('compiles canonical form in reactive page', () => {
    const result = compileProgram(`
build for web
page 'App':
  'Name' is a text input that saves to name
  display name
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('_state.name');
    expect(result.html).toContain('Name');
  });
});

describe('Reactive - show item in for-each', () => {
  it('show inside for-each renders item to DOM', () => {
    const result = compileProgram(`
build for web
page 'App':
  items is an empty list
  'Item' is a text input that saves to new_item
  button 'Add':
    add new_item to items
  for each item in items:
    show item
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('_container.innerHTML');
    expect(result.javascript).toContain('item');
  });
});

// =============================================================================
// FOR EACH WITH "LIST" KEYWORD
// =============================================================================

describe('Syntax - for each X in Y list', () => {
  it('parses "for each item in items list:"', () => {
    const ast = parse(`
items is an empty list
for each item in items list:
  show item
    `);
    expect(ast.errors).toHaveLength(0);
    const loop = ast.body.find(n => n.type === 'for_each');
    expect(loop).toBeDefined();
    expect(loop.variable).toBe('item');
  });

  it('old form "for each item in items:" still works', () => {
    const ast = parse(`
items is an empty list
for each item in items:
  show item
    `);
    expect(ast.errors).toHaveLength(0);
    const loop = ast.body.find(n => n.type === 'for_each');
    expect(loop).toBeDefined();
  });
});

// =============================================================================
// STATE VARIABLE ASSIGNMENT IN BUTTON HANDLERS
// =============================================================================

describe('Reactive - state assignment in button handler', () => {
  it('assigning to state var in button uses _state prefix', () => {
    const result = compileProgram(`
build for web
page 'App':
  items is an empty list
  'Item' is a text input that saves to item
  button 'Add':
    add item to items
    item is ''
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('_state.item = ""');
    expect(result.javascript).not.toContain('let item = ""');
  });
});

// =============================================================================
// REACTIVE STATE VS LOCAL VARIABLES
// =============================================================================

describe('Reactive - local vars vs state vars', () => {
  it('computed variables are local, not _state prefixed', () => {
    const result = compileProgram(`
build for web
page 'Calc':
  'Price' is a number input that saves to price
  tax = price * 0.08
  total = price + tax
  display total as dollars
    `);
    expect(result.errors).toHaveLength(0);
    // tax and total are local (let), price is state
    expect(result.javascript).toContain('let tax = (_state.price * 0.08)');
    expect(result.javascript).toContain('let total = (_state.price + tax)');
    // NOT _state.tax or _state.total
    expect(result.javascript).not.toContain('_state.tax');
    expect(result.javascript).not.toContain('_state.total');
  });
});

// =============================================================================
// DATABASE UPDATE SYNTAX
// =============================================================================

describe('Syntax - update database', () => {
  it('parses "update database: in Users table: add name field"', () => {
    const ast = parse(`
update database:
  in Users table:
    add name field as text
    `);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'migration');
    expect(node).toBeDefined();
  });

  it('parses "update database: create Products table"', () => {
    const ast = parse(`
update database:
  create Products table:
    name, required
    price (number), required
    `);
    expect(ast.errors).toHaveLength(0);
  });

  it('compiles update database to SQL in JS backend', () => {
    const result = compileProgram(`
build for javascript backend
update database:
  in Users table:
    add status field as text, default 'active'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('ALTER TABLE');
    expect(result.javascript).toContain('status');
  });
});

// =============================================================================
// LITERAL ASSIGNMENTS AS STATE + STEPPER
// =============================================================================

describe('Reactive - literal assignments become state', () => {
  it('bare number assignment goes to _state', () => {
    const result = compileProgram(`
build for web
page 'App':
  count = 0
  'X' is a text input that saves to x
  button 'Up':
    increase count by 1
  display count called 'Count'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('count: 0');
    expect(result.javascript).toContain('_state.count = (_state.count + 1)');
  });

  it('bare string assignment goes to _state', () => {
    const result = compileProgram(`
build for web
page 'App':
  status is 'ready'
  'X' is a text input that saves to x
  display status called 'Status'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('status: "ready"');
  });

  it('stepper pattern works: increase/decrease/display', () => {
    const result = compileProgram(`
build for web
page 'Wizard':
  step = 1
  'Name' is a text input that saves to name
  button 'Next':
    increase step by 1
  button 'Back':
    decrease step by 1
  display step called 'Step'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('step: 1');
    expect(result.javascript).toContain('_state.step = (_state.step + 1)');
    expect(result.javascript).toContain('_state.step = (_state.step - 1)');
    expect(result.javascript).toContain('String(_state.step)');
  });
});

// =============================================================================
// LAYOUT PATTERNS
// =============================================================================

describe('Style - layout patterns', () => {
  it('sticky at top compiles to position: sticky', () => {
    const result = compileProgram(`
build for web
style header:
  sticky at top
page 'App':
  section 'Header' with style header:
    heading 'Results'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.css).toContain('position: sticky');
    expect(result.css).toContain('top: 0');
    expect(result.css).toContain('z-index: 10');
  });

  it('scrollable compiles to overflow-y: auto', () => {
    const result = compileProgram(`
build for web
style body:
  scrollable
  height is '400px'
page 'App':
  section 'Content' with style body:
    text 'Hello'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.css).toContain('overflow-y: auto');
  });

  it('two column layout compiles to CSS grid', () => {
    const result = compileProgram(`
build for web
style layout:
  two column layout
page 'App':
  section 'Main' with style layout:
    text 'Left'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.css).toContain('display: grid');
    expect(result.css).toContain('grid-template-columns: 1fr 1fr');
  });

  it('2 column layout works as number synonym', () => {
    const result = compileProgram(`
build for web
style layout:
  2 column layout
page 'App':
  section 'Main' with style layout:
    text 'Content'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.css).toContain('display: grid');
  });

  it('Cast-like output pane: sticky header + scrollable body', () => {
    const result = compileProgram(`
build for web
style results_pane:
  stacked
  height is '100%'
style results_header:
  sticky at top
  padding = 8
  background is '#fff'
style results_body:
  scrollable
  fills remaining space
page 'Cast':
  section 'Output' with style results_pane:
    section 'Header' with style results_header:
      heading 'Results'
    section 'Body' with style results_body:
      text 'Row 1'
      text 'Row 2'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.css).toContain('position: sticky');
    expect(result.css).toContain('overflow-y: auto');
    expect(result.css).toContain('flex: 1');
  });
});

describe('Style - row layouts', () => {
  it('two row layout compiles to grid rows', () => {
    const result = compileProgram(`
build for web
style layout:
  two row layout
page 'App':
  section 'Main' with style layout:
    text 'Top'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.css).toContain('grid-template-rows: 1fr 1fr');
  });
});

// =============================================================================
// CONDITIONAL DOM RENDERING
// =============================================================================

describe('Reactive - conditional DOM (if/section in pages)', () => {
  it('if block with section compiles to display toggle', () => {
    const result = compileProgram(`
build for web
page 'Wizard':
  step = 1
  'Name' is a text input that saves to name
  button 'Next':
    increase step by 1
  if step is 1:
    section 'Step 1':
      heading 'Enter your name'
  if step is 2:
    section 'Step 2':
      heading 'Confirm'
    `);
    expect(result.errors).toHaveLength(0);
    // Should generate display:none/block toggling, not JS if-statements
    expect(result.javascript).toContain('display');
    expect(result.javascript).toContain('_state.step');
  });

  it('conditional sections appear in HTML output', () => {
    const result = compileProgram(`
build for web
page 'App':
  step = 1
  'X' is a text input that saves to x
  if step is 1:
    heading 'Step One'
  if step is 2:
    heading 'Step Two'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('Step One');
    expect(result.html).toContain('Step Two');
  });
});

// =============================================================================
// COMPONENT INLINE USAGE
// =============================================================================

describe('Reactive - component inline usage', () => {
  it('show Component(args) renders component HTML in page', () => {
    const result = compileProgram(`
build for web
define component Greeting receiving name:
  show name
page 'App':
  'Name' is a text input that saves to user_name
  show Greeting(user_name)
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('Greeting(');
    expect(result.javascript).toContain('innerHTML');
  });
});

// =============================================================================
// REMOVE FROM LIST
// =============================================================================

describe('Syntax - remove from list', () => {
  it('parses remove X from Y', () => {
    const ast = parse(`
items is an empty list
remove 'hello' from items
    `);
    expect(ast.errors).toHaveLength(0);
  });

  it('compiles remove from list in reactive mode', () => {
    const result = compileProgram(`
build for web
page 'App':
  items is an empty list
  'Item' is a text input that saves to item
  button 'Remove':
    remove item from items
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('filter');
    expect(result.javascript).toContain('_state.items');
  });
});

// =============================================================================
// COMPONENTS WITH CHILDREN (SLOTS)
// =============================================================================

describe('Components - receiving content (slots)', () => {
  it('parses component usage with content block', () => {
    const ast = parse(`
page 'App':
  show Card:
    heading 'Title'
    text 'Body'
    `);
    expect(ast.errors).toHaveLength(0);
    const page = ast.body[0];
    const showCall = page.body.find(n => n.type === 'component_use');
    expect(showCall).toBeDefined();
    expect(showCall.name).toBe('Card');
    expect(showCall.children.length).toBe(2);
  });

  it('compiles component with named content prop', () => {
    const result = compileProgram(`
build for web
define component Card receiving content:
  heading 'Card Title'
  show content
page 'App':
  'X' is a text input that saves to x
  show Card:
    text 'Inside the card'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('function Card(content)');
    expect(result.javascript).toContain('_html += content');
  });

  it('passes block content as last prop', () => {
    const result = compileProgram(`
build for web
define component Card receiving content:
  heading 'Card'
  show content
  divider
page 'App':
  'X' is a text input that saves to x
  show Card:
    text 'Hello'
    text 'World'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain("Card('<p>Hello</p>'");
  });
});

// =============================================================================
// STYLE VARIABLES
// =============================================================================

describe('Style variables', () => {
  it('variable defined at top level resolves in style block', () => {
    const result = compileProgram(`
build for web
primary_color is '#2563eb'

style button:
  background is primary_color
  padding = 16

page 'App':
  section 'Main' with style button:
    heading 'Hello'
    `);
    expect(result.errors).toHaveLength(0);
    // The CSS should contain the resolved value, not the variable name
    expect(result.css).toContain('background: #2563eb');
    expect(result.html).not.toContain('background: primary_color');
  });

  it('multiple style variables work together', () => {
    const result = compileProgram(`
build for web
brand_blue is '#2563eb'
brand_radius is '12px'

style card:
  background is brand_blue
  rounded is brand_radius

page 'App':
  section 'Card' with style card:
    heading 'Hello'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('#2563eb');
    expect(result.html).toContain('12px');
  });
});

// =============================================================================
// COMPONENT IN FOR-EACH
// =============================================================================

describe('Reactive - show Component(item) in for-each', () => {
  it('component call in for-each renders without <p> wrapping', () => {
    const result = compileProgram(`
build for web
define component Card receiving name:
  show name
page 'App':
  items is an empty list
  'Name' is a text input that saves to new_name
  button 'Add':
    add new_name to items
  for each item in items list:
    show Card(item)
    `);
    expect(result.errors).toHaveLength(0);
    // Component call should NOT be wrapped in <p>
    expect(result.javascript).toContain("Card(item)");
    expect(result.javascript).not.toContain("'<p>' + Card(item)");
  });

  it('plain show in for-each still wraps in <p>', () => {
    const result = compileProgram(`
build for web
page 'App':
  items is an empty list
  'X' is a text input that saves to x
  button 'Add':
    add x to items
  for each item in items list:
    show item
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain("item");
    expect(result.javascript).toContain("'<p>'");
  });
});

// =============================================================================
// SORT LIST
// =============================================================================

describe('Syntax - sort list by field', () => {
  it('sort items by name compiles to Array.sort', () => {
    const result = compileProgram(`
build for web
items is an empty list
sort items by name
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('.sort(');
    expect(result.javascript).toContain('name');
  });

  it('sort descending compiles with reversed comparison', () => {
    const result = compileProgram(`
build for web
items is an empty list
sort items by price descending
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('.sort(');
    expect(result.javascript).toContain('-1');
  });
});

// =============================================================================
// ON PAGE LOAD
// =============================================================================

describe('Syntax - on page load', () => {
  it('compiles on page load with API fetch', () => {
    const result = compileProgram(`
build for web
page 'App':
  'X' is a text input that saves to x
  on page load:
    get from '/api/items'
  display response as table called 'Items'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('On Page Load');
    expect(result.javascript).toContain('fetch("/api/items")');
  });
});

// =============================================================================
// MATCH/WHEN PATTERN MATCHING
// =============================================================================

describe('Syntax - match/when', () => {
  it('compiles match with when cases to if/else-if', () => {
    const result = compileProgram(`
build for web
x = 'hello'
match x:
  when 'hello':
    show 'hi'
  when 'bye':
    show 'goodbye'
  otherwise:
    show 'unknown'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('if (x == "hello")');
    expect(result.javascript).toContain('else if (x == "bye")');
    expect(result.javascript).toContain('} else {');
  });

  it('match works with property access', () => {
    const result = compileProgram(`
build for web
define function process(node):
  match node's type:
    when 'text':
      return node's value
    otherwise:
      return 'unknown'
show 'ok'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('node.type == "text"');
  });
});

// =============================================================================
// FILE I/O (Phase 21)
// =============================================================================

describe('Parser - File I/O', () => {
  it('parses read file', () => {
    const ast = parse("contents = read file 'data.csv'");
    expect(ast.errors).toHaveLength(0);
    const assign = ast.body[0];
    expect(assign.type).toBe(NodeType.ASSIGN);
    expect(assign.expression.type).toBe(NodeType.FILE_OP);
    expect(assign.expression.operation).toBe('read');
    expect(assign.expression.path).toBe('data.csv');
  });

  it('parses file exists', () => {
    const ast = parse("found = file exists 'config.json'");
    expect(ast.errors).toHaveLength(0);
    const assign = ast.body[0];
    expect(assign.expression.type).toBe(NodeType.FILE_OP);
    expect(assign.expression.operation).toBe('exists');
    expect(assign.expression.path).toBe('config.json');
  });

  it('parses write file with data', () => {
    const ast = parse("write file 'output.txt' with results");
    expect(ast.errors).toHaveLength(0);
    const node = ast.body[0];
    expect(node.type).toBe(NodeType.FILE_OP);
    expect(node.operation).toBe('write');
    expect(node.path).toBe('output.txt');
    expect(node.data.type).toBe(NodeType.VARIABLE_REF);
    expect(node.data.name).toBe('results');
  });

  it('parses append to file with data', () => {
    const ast = parse("append to file 'log.txt' with message");
    expect(ast.errors).toHaveLength(0);
    const node = ast.body[0];
    expect(node.type).toBe(NodeType.FILE_OP);
    expect(node.operation).toBe('append');
    expect(node.path).toBe('log.txt');
  });

  it('errors on read file without path', () => {
    const ast = parse('contents = read file');
    expect(ast.errors.length > 0).toBe(true);
    expect(ast.errors[0].message).toContain('file path');
  });

  it('errors on write file without with', () => {
    const ast = parse("write file 'output.txt'");
    expect(ast.errors.length > 0).toBe(true);
    expect(ast.errors[0].message).toContain('with');
  });

  it('works with load file alias', () => {
    const ast = parse("contents = load file 'data.csv'");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.operation).toBe('read');
  });

  it('works with save file alias', () => {
    const ast = parse("save file 'output.txt' with data");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].operation).toBe('write');
  });
});

describe('Compiler - File I/O (JS)', () => {
  it('compiles read file to readFileSync', () => {
    const result = compileProgram("build for web\ncontents = read file 'data.csv'\nshow contents");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('readFileSync("data.csv", "utf-8")');
  });

  it('compiles file exists to existsSync', () => {
    const result = compileProgram("build for web\nfound = file exists 'config.json'\nshow found");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('existsSync("config.json")');
  });

  it('compiles write file to writeFileSync', () => {
    const result = compileProgram("build for web\nwrite file 'output.txt' with results");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('writeFileSync("output.txt"');
  });

  it('compiles append to file to appendFileSync', () => {
    const result = compileProgram("build for web\nappend to file 'log.txt' with message");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('appendFileSync("log.txt"');
  });
});

describe('Compiler - File I/O (Python)', () => {
  it('compiles read file to open().read()', () => {
    const result = compileProgram("build for python backend\ncontents = read file 'data.csv'\nshow contents");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('open("data.csv", "r").read()');
    expect(result.python).toContain('import os');
  });

  it('compiles file exists to os.path.exists', () => {
    const result = compileProgram("build for python backend\nfound = file exists 'config.json'\nshow found");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('os.path.exists("config.json")');
  });

  it('compiles write file to open().write()', () => {
    const result = compileProgram("build for python backend\nwrite file 'output.txt' with results");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('open("output.txt", "w")');
  });

  it('compiles append to file to open("a")', () => {
    const result = compileProgram("build for python backend\nappend to file 'log.txt' with message");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('open("log.txt", "a")');
  });
});

describe('E2E - File I/O program', () => {
  it('compiles a complete file processing program', () => {
    const result = compileProgram(`
build for javascript backend

contents = read file 'input.csv'
lines = split(contents, ',')
show lines

found = file exists 'config.json'
if found:
  config = read file 'config.json'
  show config

write file 'output.txt' with contents
append to file 'log.txt' with 'processed'
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('readFileSync("input.csv"');
    expect(result.javascript).toContain('existsSync("config.json"');
    expect(result.javascript).toContain('writeFileSync("output.txt"');
    expect(result.javascript).toContain('appendFileSync("log.txt"');
  });
});

// =============================================================================
// JSON (Phase 21)
// =============================================================================

describe('Parser - JSON', () => {
  it('parses parse json', () => {
    const ast = parse("data = parse json text");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.JSON_PARSE);
  });

  it('parses to json', () => {
    const ast = parse("output = to json data");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.JSON_STRINGIFY);
  });

  it('from json alias works', () => {
    const ast = parse("data = from json text");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.JSON_PARSE);
  });

  it('as json alias works', () => {
    const ast = parse("output = as json data");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.JSON_STRINGIFY);
  });
});

describe('Compiler - JSON (JS)', () => {
  it('compiles parse json to JSON.parse', () => {
    const result = compileProgram("build for web\ndata = parse json text\nshow data");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('JSON.parse(text)');
  });

  it('compiles to json to JSON.stringify', () => {
    const result = compileProgram("build for web\noutput = to json data\nshow output");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('JSON.stringify(data)');
  });
});

describe('Compiler - JSON (Python)', () => {
  it('compiles parse json to json.loads', () => {
    const result = compileProgram("build for python backend\ndata = parse json text\nshow data");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('json.loads(text)');
    expect(result.python).toContain('import json');
  });

  it('compiles to json to json.dumps', () => {
    const result = compileProgram("build for python backend\noutput = to json data\nshow output");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('json.dumps(data)');
  });
});

// =============================================================================
// REGEX (Phase 21)
// =============================================================================

describe('Parser - Regex', () => {
  it('parses find pattern', () => {
    const ast = parse("nums = find pattern '[0-9]+' in text");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.REGEX_FIND);
    expect(ast.body[0].expression.pattern).toBe('[0-9]+');
  });

  it('parses matches pattern', () => {
    const ast = parse("valid = matches pattern '^[a-z]+$' in text");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.REGEX_MATCH);
    expect(ast.body[0].expression.pattern).toBe('^[a-z]+$');
  });

  it('parses replace pattern', () => {
    const ast = parse("cleaned = replace pattern '[0-9]+' in text with 'X'");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.REGEX_REPLACE);
    expect(ast.body[0].expression.pattern).toBe('[0-9]+');
  });

  it('errors on find pattern without quotes', () => {
    const ast = parse("nums = find pattern");
    expect(ast.errors.length > 0).toBe(true);
    expect(ast.errors[0].message).toContain('pattern');
  });
});

describe('Compiler - Regex (JS)', () => {
  it('compiles find pattern to match()', () => {
    const result = compileProgram("build for web\nnums = find pattern '[0-9]+' in text\nshow nums");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('match(new RegExp("[0-9]+", "g"))');
  });

  it('compiles matches pattern to test()', () => {
    const result = compileProgram("build for web\nvalid = matches pattern '^[a-z]' in text\nshow valid");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('new RegExp("^[a-z]").test(text)');
  });

  it('compiles replace pattern to replace()', () => {
    const result = compileProgram("build for web\ncleaned = replace pattern '[0-9]+' in text with 'X'\nshow cleaned");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('text.replace(new RegExp("[0-9]+", "g"), "X")');
  });
});

describe('Compiler - Regex (Python)', () => {
  it('compiles find pattern to re.findall', () => {
    const result = compileProgram("build for python backend\nnums = find pattern '[0-9]+' in text\nshow nums");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('re.findall("[0-9]+", text)');
  });

  it('compiles matches pattern to re.search', () => {
    const result = compileProgram("build for python backend\nvalid = matches pattern '^[a-z]' in text\nshow valid");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('re.search("^[a-z]", text)');
  });

  it('compiles replace pattern to re.sub', () => {
    const result = compileProgram("build for python backend\ncleaned = replace pattern '[0-9]+' in text with 'X'\nshow cleaned");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('re.sub("[0-9]+", "X", text)');
  });
});

// =============================================================================
// DATE/TIME (Phase 21)
// =============================================================================

describe('Parser - Date/Time', () => {
  it('parses current time', () => {
    const ast = parse("now = current time");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.CURRENT_TIME);
  });

  it('parses current date alias', () => {
    const ast = parse("today = current date");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.CURRENT_TIME);
  });

  it('parses format date with format string', () => {
    const ast = parse("formatted = format date now as 'YYYY-MM-DD'");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.FORMAT_DATE);
    expect(ast.body[0].expression.format).toBe('YYYY-MM-DD');
  });

  it('parses days between', () => {
    const ast = parse("gap = days between start_date and end_date");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.DAYS_BETWEEN);
  });

  it('errors on format date without as', () => {
    const ast = parse("formatted = format date now");
    expect(ast.errors.length > 0).toBe(true);
    expect(ast.errors[0].message).toContain('as');
  });

  it('errors on days between without and', () => {
    const ast = parse("gap = days between start_date");
    expect(ast.errors.length > 0).toBe(true);
    expect(ast.errors[0].message).toContain('and');
  });
});

describe('Compiler - Date/Time (JS)', () => {
  it('compiles current time to new Date()', () => {
    const result = compileProgram("build for web\nnow = current time\nshow now");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('new Date()');
  });

  it('compiles format date with YYYY-MM-DD', () => {
    const result = compileProgram("build for web\nnow = current time\nformatted = format date now as 'YYYY-MM-DD'\nshow formatted");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('getFullYear()');
    expect(result.javascript).toContain('YYYY-MM-DD');
  });

  it('compiles days between to Math.abs', () => {
    const result = compileProgram("build for web\ngap = days between start_date and end_date\nshow gap");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('Math.abs');
    expect(result.javascript).toContain('86400000');
  });
});

describe('Compiler - Date/Time (Python)', () => {
  it('compiles current time to datetime.now()', () => {
    const result = compileProgram("build for python backend\nnow = current time\nshow now");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('datetime.datetime.now()');
    expect(result.python).toContain('import datetime');
  });

  it('compiles format date to strftime', () => {
    const result = compileProgram("build for python backend\nnow = current time\nformatted = format date now as 'YYYY-MM-DD'\nshow formatted");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('strftime');
  });

  it('compiles days between to .days', () => {
    const result = compileProgram("build for python backend\ngap = days between start_date and end_date\nshow gap");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('.days');
  });
});

describe('E2E - Phase 21: All primitives in one program', () => {
  it('compiles a program using file I/O, JSON, regex, and dates', () => {
    const result = compileProgram(`
build for javascript backend

# File I/O
config_text = read file 'config.json'
config = parse json config_text

# Date
now = current time
today = format date now as 'YYYY-MM-DD'

# Regex
valid = matches pattern '^[0-9]+$' in config_text

# JSON output
output = to json config
write file 'output.json' with output
append to file 'log.txt' with today

# File check
has_backup = file exists 'backup.json'
show has_backup
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('readFileSync');
    expect(result.javascript).toContain('JSON.parse');
    expect(result.javascript).toContain('new Date()');
    expect(result.javascript).toContain('RegExp');
    expect(result.javascript).toContain('JSON.stringify');
    expect(result.javascript).toContain('writeFileSync');
    expect(result.javascript).toContain('appendFileSync');
    expect(result.javascript).toContain('existsSync');
  });
});

// =============================================================================
// DATA OPERATIONS (Phase 22)
// =============================================================================

describe('Parser - Data Operations', () => {
  it('parses load csv', () => {
    const ast = parse("sales = load csv 'sales.csv'");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.LOAD_CSV);
    expect(ast.body[0].expression.path).toBe('sales.csv');
  });

  it('parses read csv alias', () => {
    const ast = parse("data = read csv 'data.csv'");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.LOAD_CSV);
  });

  it('parses save csv with data', () => {
    const ast = parse("save csv 'output.csv' with results");
    expect(ast.errors).toHaveLength(0);
    const node = ast.body[0];
    expect(node.type).toBe(NodeType.SAVE_CSV);
    expect(node.path).toBe('output.csv');
    expect(node.data.name).toBe('results');
  });

  it('errors on load csv without path', () => {
    const ast = parse("data = load csv");
    expect(ast.errors.length > 0).toBe(true);
    expect(ast.errors[0].message).toContain('file path');
  });

  it('errors on save csv without with', () => {
    const ast = parse("save csv 'output.csv'");
    expect(ast.errors.length > 0).toBe(true);
    expect(ast.errors[0].message).toContain('with');
  });
});

describe('Compiler - Data Operations (JS)', () => {
  it('compiles load csv to file read + parse', () => {
    const result = compileProgram("build for web\nsales = load csv 'sales.csv'\nshow sales");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('readFileSync');
    expect(result.javascript).toContain('split');
    expect(result.javascript).toContain('sales.csv');
  });

  it('compiles save csv to file write + format', () => {
    const result = compileProgram("build for web\nsave csv 'output.csv' with data");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('writeFileSync');
    expect(result.javascript).toContain('output.csv');
  });
});

describe('Compiler - Data Operations (Python)', () => {
  it('compiles load csv to csv.reader', () => {
    const result = compileProgram("build for python backend\nsales = load csv 'sales.csv'\nshow sales");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('csv');
    expect(result.python).toContain('sales.csv');
  });

  it('compiles save csv to csv.DictWriter', () => {
    const result = compileProgram("build for python backend\nsave csv 'output.csv' with data");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('DictWriter');
    expect(result.python).toContain('output.csv');
  });
});

describe('E2E - Data pipeline program', () => {
  it('compiles a CSV load + process + save program', () => {
    const result = compileProgram(`
build for javascript backend

sales = load csv 'sales.csv'
show sales

config_text = read file 'config.json'
config = parse json config_text

now = current time
today = format date now as 'YYYY-MM-DD'
append to file 'log.txt' with today

save csv 'processed.csv' with sales
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('readFileSync');
    expect(result.javascript).toContain('JSON.parse');
    expect(result.javascript).toContain('new Date()');
    expect(result.javascript).toContain('appendFileSync');
    expect(result.javascript).toContain('writeFileSync');
  });
});

// =============================================================================
// FILTER (Phase 22)
// =============================================================================

describe('Parser - Filter', () => {
  it('parses filter with greater than', () => {
    const ast = parse("big_sales = filter sales where revenue is greater than 10000");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.FILTER);
    expect(ast.body[0].expression.list).toBe('sales');
  });

  it('parses filter with equals', () => {
    const ast = parse("active = filter users where status is 'active'");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.FILTER);
  });

  it('errors on filter without list', () => {
    const ast = parse("result = filter");
    expect(ast.errors.length > 0).toBe(true);
  });
});

describe('Compiler - Filter (JS)', () => {
  it('compiles filter to Array.filter()', () => {
    const result = compileProgram("build for web\nbig_sales = filter sales where revenue is greater than 10000\nshow big_sales");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('.filter(_item =>');
    expect(result.javascript).toContain('_item.revenue');
  });
});

describe('Compiler - Filter (Python)', () => {
  it('compiles filter to list comprehension', () => {
    const result = compileProgram("build for python backend\nbig_sales = filter sales where revenue is greater than 10000\nshow big_sales");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('_item for _item in sales');
    expect(result.python).toContain('_item["revenue"]');
  });
});

// =============================================================================
// GROUP BY (Phase 22)
// =============================================================================

describe('Parser - Group By', () => {
  it('parses group by field in list', () => {
    const ast = parse("by_region = group by region in sales");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.GROUP_BY);
    expect(ast.body[0].expression.field).toBe('region');
    expect(ast.body[0].expression.list).toBe('sales');
  });

  it('errors on group by without field', () => {
    const ast = parse("result = group by");
    expect(ast.errors.length > 0).toBe(true);
  });
});

describe('Compiler - Group By (JS)', () => {
  it('compiles group by to reduce()', () => {
    const result = compileProgram("build for web\nby_region = group by region in sales\nshow by_region");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('.reduce(');
    expect(result.javascript).toContain('item.region');
  });
});

describe('Compiler - Group By (Python)', () => {
  it('compiles group by to dict comprehension', () => {
    const result = compileProgram("build for python backend\nby_region = group by region in sales\nshow by_region");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('"region"');
  });
});

// =============================================================================
// COUNT BY + UNIQUE VALUES (Phase 22)
// =============================================================================

describe('Parser - Count By', () => {
  it('parses count by field in list', () => {
    const ast = parse("counts = count by status in orders");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.COUNT_BY);
    expect(ast.body[0].expression.field).toBe('status');
    expect(ast.body[0].expression.list).toBe('orders');
  });
});

describe('Compiler - Count By', () => {
  it('compiles count by to reduce (JS)', () => {
    const result = compileProgram("build for web\ncounts = count by status in orders\nshow counts");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('.reduce(');
    expect(result.javascript).toContain('item.status');
  });

  it('compiles count by to dict comprehension (Python)', () => {
    const result = compileProgram("build for python backend\ncounts = count by status in orders\nshow counts");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('"status"');
  });
});

describe('Parser - Unique Values', () => {
  it('parses unique values of field in list', () => {
    const ast = parse("regions = unique values of region in sales");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.UNIQUE_VALUES);
    expect(ast.body[0].expression.field).toBe('region');
  });
});

describe('Compiler - Unique Values', () => {
  it('compiles unique values to Set (JS)', () => {
    const result = compileProgram("build for web\nregions = unique values of region in sales\nshow regions");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('new Set');
    expect(result.javascript).toContain('item.region');
  });

  it('compiles unique values to set() (Python)', () => {
    const result = compileProgram("build for python backend\nregions = unique values of region in sales\nshow regions");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('set(');
    expect(result.python).toContain('"region"');
  });
});

describe('E2E - Full data pipeline', () => {
  it('compiles load + filter + column extract + aggregate + save', () => {
    const result = compileProgram(`
build for javascript backend

sales = load csv 'sales.csv'
big_sales = filter sales where revenue is greater than 10000
sort big_sales by revenue descending
revenues = each row's revenue in big_sales
total = sum of revenues
average = avg of revenues
show total
show average
save csv 'big_sales.csv' with big_sales
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('readFileSync');
    expect(result.javascript).toContain('.filter(_item =>');
    expect(result.javascript).toContain('.sort(');
    expect(result.javascript).toContain('.map(item => item.revenue)');
    expect(result.javascript).toContain('_clear_sum');
    expect(result.javascript).toContain('_clear_avg');
    expect(result.javascript).toContain('writeFileSync');
  });
});

// =============================================================================
// DATABASE ADAPTER (Phase 23)
// =============================================================================

describe('Parser - Database', () => {
  it('parses connect to database with config', () => {
    const ast = parse("connect to database:\n  type is 'postgres'\n  url is env('DATABASE_URL')");
    expect(ast.errors).toHaveLength(0);
    const node = ast.body[0];
    expect(node.type).toBe(NodeType.CONNECT_DB);
    expect(node.config.type).toBe('postgres');
  });

  it('parses query as assignment', () => {
    const ast = parse("results = query 'select * from users'");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.RAW_QUERY);
    expect(ast.body[0].expression.sql).toBe('select * from users');
  });

  it('parses query with params', () => {
    const ast = parse("user = query 'select * from users where id = $1' with user_id");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.params.name).toBe('user_id');
  });

  it('parses standalone run', () => {
    const ast = parse("run 'delete from logs where age > 30'");
    expect(ast.errors).toHaveLength(0);
    const node = ast.body[0];
    expect(node.type).toBe(NodeType.RAW_QUERY);
    expect(node.operation).toBe('run');
  });
});

describe('Compiler - Database (JS)', () => {
  it('compiles connect to database to pg Pool', () => {
    const result = compileProgram("build for javascript backend\nconnect to database:\n  type is 'postgres'\n  url is env('DATABASE_URL')");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain("require('pg')");
    expect(result.javascript).toContain('process.env.DATABASE_URL');
  });

  it('compiles query to pool.query().rows', () => {
    const result = compileProgram("build for javascript backend\nresults = query 'select * from users'\nshow results");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('_pool.query');
    expect(result.javascript).toContain('.rows');
  });

  it('compiles run to pool.query without .rows', () => {
    const result = compileProgram("build for javascript backend\nrun 'insert into logs (event) values ($1)' with event_name");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('_pool.query');
    expect(result.javascript).toContain('event_name');
  });
});

describe('Compiler - Database (Python)', () => {
  it('compiles connect to database to asyncpg', () => {
    const result = compileProgram("build for python backend\nconnect to database:\n  type is 'postgres'\n  url is env('DATABASE_URL')");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('asyncpg');
    expect(result.python).toContain('create_pool');
  });

  it('compiles query to fetch', () => {
    const result = compileProgram("build for python backend\nresults = query 'select * from users'\nshow results");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('.fetch(');
  });
});

describe('E2E - Database app', () => {
  it('compiles a full database-backed API', () => {
    const result = compileProgram(`
build for javascript backend

connect to database:
  type is 'postgres'
  url is env('DATABASE_URL')

when user calls GET /api/users:
  all_users = query 'select * from users'
  send back all_users

when user calls POST /api/log receiving data:
  run 'insert into logs (event, created_at) values ($1, now())' with data
  send back 'logged' status 201
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain("require('pg')");
    expect(result.javascript).toContain('process.env.DATABASE_URL');
    expect(result.javascript).toContain('_pool.query');
    expect(result.javascript).toContain('.rows');
  });
});

// =============================================================================
// EMAIL ADAPTER (Phase 24)
// =============================================================================

describe('Parser - Email', () => {
  it('parses configure email', () => {
    const ast = parse("configure email:\n  service is 'gmail'\n  user is env('EMAIL_USER')\n  password is env('EMAIL_PASS')");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.CONFIGURE_EMAIL);
  });

  it('parses send email block', () => {
    const ast = parse("send email:\n  to is customer_email\n  subject is 'Hello'\n  body is message");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.SEND_EMAIL);
  });

  it('does not collide with send X to URL', () => {
    const ast = parse("build for web\npage 'App':\n  button 'Go':\n    send email to '/api/signup'");
    expect(ast.errors).toHaveLength(0);
    // Should be an API_CALL, not SEND_EMAIL
    expect(ast.body.some(n => n.type === NodeType.SEND_EMAIL)).toBe(false);
  });
});

describe('Compiler - Email (JS)', () => {
  it('compiles configure email to nodemailer', () => {
    const result = compileProgram("build for javascript backend\nconfigure email:\n  service is 'gmail'\n  user is env('EMAIL_USER')\n  password is env('EMAIL_PASS')");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('nodemailer');
    expect(result.javascript).toContain('createTransport');
  });

  it('compiles send email to sendMail', () => {
    const result = compileProgram("build for javascript backend\nsend email:\n  to is customer_email\n  subject is 'Welcome'\n  body is message");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('sendMail');
    expect(result.javascript).toContain('"Welcome"');
    expect(result.javascript).toContain('customer_email');
  });
});

describe('Compiler - Email (Python)', () => {
  it('compiles configure email to smtplib', () => {
    const result = compileProgram("build for python backend\nconfigure email:\n  service is 'gmail'\n  user is env('EMAIL_USER')\n  password is env('EMAIL_PASS')");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('smtplib');
    expect(result.python).toContain('MIMEText');
  });

  it('compiles send email to send_message', () => {
    const result = compileProgram("build for python backend\nsend email:\n  to is customer_email\n  subject is 'Welcome'\n  body is message");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('send_message');
  });
});

// WEB SCRAPER ADAPTER (Phase 25)
// =============================================================================

describe('Parser - Web Scraper', () => {
  it('parses fetch page with string URL', () => {
    const ast = parse("html = fetch page 'https://example.com'");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.FETCH_PAGE);
    expect(ast.body[0].expression.url.value).toBe('https://example.com');
  });

  it('parses fetch page with variable URL', () => {
    const ast = parse("html = fetch page target_url");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.FETCH_PAGE);
    expect(ast.body[0].expression.url.type).toBe(NodeType.VARIABLE_REF);
  });

  it('parses scrape page synonym', () => {
    const ast = parse("html = scrape page 'https://example.com'");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.FETCH_PAGE);
  });

  it('parses download page synonym', () => {
    const ast = parse("html = download page 'https://example.com'");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.FETCH_PAGE);
  });

  it('parses find all selector in variable', () => {
    const ast = parse("stories = find all '.titleline a' in html");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.FIND_ELEMENTS);
    expect(ast.body[0].expression.selector.value).toBe('.titleline a');
    expect(ast.body[0].expression.mode).toBe('all');
  });

  it('parses find first selector in variable', () => {
    const ast = parse("title = find first 'h1' in html");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.FIND_ELEMENTS);
    expect(ast.body[0].expression.selector.value).toBe('h1');
    expect(ast.body[0].expression.mode).toBe('first');
  });

  it('errors on fetch page without URL', () => {
    const ast = parse("html = fetch page");
    expect(ast.errors.length).toBeGreaterThan(0);
  });

  it('errors on find all without in', () => {
    const ast = parse("items = find all '.title'");
    expect(ast.errors.length).toBeGreaterThan(0);
  });

  it('works in define-as path', () => {
    const ast = parse("define html as: fetch page 'https://example.com'");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.FETCH_PAGE);
  });

  it('works find all in define-as path', () => {
    const ast = parse("define links as: find all 'a' in html");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.FIND_ELEMENTS);
    expect(ast.body[0].expression.mode).toBe('all');
  });
});

describe('Compiler - Web Scraper (JS)', () => {
  it('compiles fetch page to axios', () => {
    const result = compileProgram("build for javascript backend\nhtml = fetch page 'https://example.com'");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('axios');
    expect(result.javascript).toContain('https://example.com');
  });

  it('compiles find all to cheerio', () => {
    const result = compileProgram("build for javascript backend\nhtml = fetch page 'https://example.com'\nstories = find all '.title' in html");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('cheerio');
    expect(result.javascript).toContain('.title');
    expect(result.javascript).toContain('.map(');
  });

  it('compiles find first to cheerio first()', () => {
    const result = compileProgram("build for javascript backend\nhtml = fetch page 'https://example.com'\ntitle = find first 'h1' in html");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('cheerio');
    expect(result.javascript).toContain('.first()');
  });

  it('extracts text, href, src, class, id from elements', () => {
    const result = compileProgram("build for javascript backend\nhtml = fetch page 'https://example.com'\nlinks = find all 'a' in html");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('text:');
    expect(result.javascript).toContain('href:');
    expect(result.javascript).toContain('src:');
    expect(result.javascript).toContain('class:');
    expect(result.javascript).toContain('id:');
  });
});

describe('Compiler - Web Scraper (Python)', () => {
  it('compiles fetch page to requests', () => {
    const result = compileProgram("build for python backend\nhtml = fetch page 'https://example.com'");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('requests');
    expect(result.python).toContain('https://example.com');
  });

  it('compiles find all to beautifulsoup', () => {
    const result = compileProgram("build for python backend\nhtml = fetch page 'https://example.com'\nstories = find all '.title' in html");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('BeautifulSoup');
    expect(result.python).toContain('.select(');
  });

  it('compiles find first to select_one', () => {
    const result = compileProgram("build for python backend\nhtml = fetch page 'https://example.com'\ntitle = find first 'h1' in html");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('BeautifulSoup');
    expect(result.python).toContain('select_one');
  });

  it('extracts text, href, src from elements', () => {
    const result = compileProgram("build for python backend\nhtml = fetch page 'https://example.com'\nlinks = find all 'a' in html");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('get_text');
    expect(result.python).toContain('"href"');
    expect(result.python).toContain('"src"');
  });
});

describe('E2E - Web Scraper', () => {
  it('compiles a full scraper app (JS)', () => {
    const result = compileProgram(`build for javascript backend
html = fetch page 'https://news.ycombinator.com'
stories = find all '.titleline a' in html
for each story in stories list:
  show story's text`);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('axios');
    expect(result.javascript).toContain('cheerio');
    expect(result.javascript).toContain('.titleline a');
  });

  it('compiles a full scraper app (Python)', () => {
    const result = compileProgram(`build for python backend
html = fetch page 'https://news.ycombinator.com'
stories = find all '.titleline a' in html
for each story in stories list:
  show story's text`);
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('requests');
    expect(result.python).toContain('BeautifulSoup');
    expect(result.python).toContain('.titleline a');
  });

  it('compiles scraper with find first (JS)', () => {
    const result = compileProgram(`build for javascript backend
webpage = fetch page 'https://example.com/pricing'
main_title = find first 'h1' in webpage
prices = find all '.price' in webpage`);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('.first()');
    expect(result.javascript).toContain('.map(');
  });

  it('scraper inside API endpoint', () => {
    const result = compileProgram(`build for javascript backend
when user calls GET /api/scrape:
  html = fetch page 'https://example.com'
  links = find all 'a.nav-link' in html
  send back links`);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('axios');
    expect(result.javascript).toContain('cheerio');
  });
});

// PDF ADAPTER (Phase 26)
// =============================================================================

describe('Parser - PDF', () => {
  it('parses create pdf with content elements', () => {
    const ast = parse("create pdf 'report.pdf':\n  heading 'My Report'\n  text 'Hello world'");
    expect(ast.errors).toHaveLength(0);
    const node = ast.body[0];
    expect(node.type).toBe(NodeType.CREATE_PDF);
    expect(node.path.value).toBe('report.pdf');
    expect(node.content.length).toBe(2);
    expect(node.content[0].contentType).toBe('heading');
    expect(node.content[1].contentType).toBe('text');
  });

  it('parses create pdf with variable path', () => {
    const ast = parse("create pdf output_path:\n  text 'Done'");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].path.type).toBe(NodeType.VARIABLE_REF);
  });

  it('parses generate pdf synonym', () => {
    const ast = parse("generate pdf 'out.pdf':\n  heading 'Title'");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.CREATE_PDF);
  });

  it('parses divider inside pdf', () => {
    const ast = parse("create pdf 'report.pdf':\n  heading 'Title'\n  divider\n  text 'Body'");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].content.length).toBe(3);
    expect(ast.body[0].content[1].contentType).toBe('divider');
  });

  it('parses bold and italic text inside pdf', () => {
    const ast = parse("create pdf 'report.pdf':\n  bold text 'Important'\n  italic text 'A note'");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].content[0].contentType).toBe('bold');
    expect(ast.body[0].content[1].contentType).toBe('italic');
  });

  it('errors on create pdf without path', () => {
    const ast = parse("create pdf:\n  text 'Hello'");
    expect(ast.errors.length).toBeGreaterThan(0);
  });
});

describe('Compiler - PDF (JS)', () => {
  it('compiles create pdf to PDFKit', () => {
    const result = compileProgram("build for javascript backend\ncreate pdf 'report.pdf':\n  heading 'My Report'\n  text 'Hello'");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('PDFDocument');
    expect(result.javascript).toContain('pdfkit');
    expect(result.javascript).toContain('createWriteStream');
    expect(result.javascript).toContain('report.pdf');
  });

  it('compiles heading to large bold font', () => {
    const result = compileProgram("build for javascript backend\ncreate pdf 'out.pdf':\n  heading 'Title'");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('fontSize(24)');
    expect(result.javascript).toContain('Helvetica-Bold');
  });

  it('compiles divider to line stroke', () => {
    const result = compileProgram("build for javascript backend\ncreate pdf 'out.pdf':\n  divider");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('.stroke()');
  });

  it('compiles bold text to bold font', () => {
    const result = compileProgram("build for javascript backend\ncreate pdf 'out.pdf':\n  bold text 'Important'");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('Helvetica-Bold');
    expect(result.javascript).toContain('fontSize(12)');
  });
});

describe('Compiler - PDF (Python)', () => {
  it('compiles create pdf to reportlab', () => {
    const result = compileProgram("build for python backend\ncreate pdf 'report.pdf':\n  heading 'My Report'\n  text 'Hello'");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('reportlab');
    expect(result.python).toContain('SimpleDocTemplate');
    expect(result.python).toContain('Paragraph');
    expect(result.python).toContain('report.pdf');
  });

  it('compiles heading to Heading1 style', () => {
    const result = compileProgram("build for python backend\ncreate pdf 'out.pdf':\n  heading 'Title'");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('Heading1');
  });

  it('compiles divider to HRFlowable', () => {
    const result = compileProgram("build for python backend\ncreate pdf 'out.pdf':\n  divider");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('HRFlowable');
  });

  it('compiles bold to <b> tag in Paragraph', () => {
    const result = compileProgram("build for python backend\ncreate pdf 'out.pdf':\n  bold text 'Important'");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('<b>');
  });
});

describe('E2E - PDF', () => {
  it('compiles a full invoice PDF (JS)', () => {
    const result = compileProgram(`build for javascript backend
invoice_id = 1234
total = 99.99
create pdf 'invoice.pdf':
  heading 'Invoice'
  text 'Invoice #1234'
  divider
  bold text 'Total: $99.99'`);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('PDFDocument');
    expect(result.javascript).toContain('invoice.pdf');
    expect(result.javascript).toContain('.stroke()');
  });

  it('compiles a full invoice PDF (Python)', () => {
    const result = compileProgram(`build for python backend
invoice_id = 1234
total = 99.99
create pdf 'invoice.pdf':
  heading 'Invoice'
  text 'Invoice #1234'
  divider
  bold text 'Total: $99.99'`);
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('SimpleDocTemplate');
    expect(result.python).toContain('invoice.pdf');
    expect(result.python).toContain('HRFlowable');
  });

  it('pdf inside API endpoint', () => {
    const result = compileProgram(`build for javascript backend
when user calls GET /api/report:
  create pdf 'report.pdf':
    heading 'Monthly Report'
    text 'Generated automatically'
  send back 'report.pdf'`);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('PDFDocument');
  });
});

// ML ADAPTER (Phase 27)
// =============================================================================

describe('Parser - ML', () => {
  it('parses train model on data predicting target', () => {
    const ast = parse("model = train model on data predicting churn");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.TRAIN_MODEL);
    expect(ast.body[0].expression.data.name).toBe('data');
    expect(ast.body[0].expression.target).toBe('churn');
  });

  it('parses build model synonym', () => {
    const ast = parse("model = build model on customers predicting revenue");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.TRAIN_MODEL);
  });

  it('parses predict with model using features', () => {
    const ast = parse("result = predict with model using age and income");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.PREDICT);
    expect(ast.body[0].expression.model.name).toBe('model');
    expect(ast.body[0].expression.features).toContain('age');
    expect(ast.body[0].expression.features).toContain('income');
  });

  it('parses predict with single feature', () => {
    const ast = parse("result = predict with model using temperature");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.features).toContain('temperature');
  });

  it('errors on train model without data', () => {
    const ast = parse("model = train model");
    expect(ast.errors.length).toBeGreaterThan(0);
  });

  it('errors on train model without predicting', () => {
    const ast = parse("model = train model on data");
    expect(ast.errors.length).toBeGreaterThan(0);
  });

  it('works in define-as path', () => {
    const ast = parse("define model as: train model on data predicting churn");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.TRAIN_MODEL);
  });
});

describe('Compiler - ML (Python)', () => {
  it('compiles train model to scikit-learn', () => {
    const result = compileProgram("build for python backend\nmodel = train model on data predicting churn");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('sklearn');
    expect(result.python).toContain('fit');
    expect(result.python).toContain('churn');
  });

  it('compiles predict to model.predict()', () => {
    const result = compileProgram("build for python backend\nresult = predict with model using age and income");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('predict');
    expect(result.python).toContain('age');
    expect(result.python).toContain('income');
  });
});

describe('Compiler - ML (JS)', () => {
  it('compiles train model to REST call to Python service', () => {
    const result = compileProgram("build for javascript backend\nmodel = train model on data predicting churn");
    expect(result.errors).toHaveLength(0);
    // JS ML goes through a REST call to Python service
    expect(result.javascript).toContain('fetch');
    expect(result.javascript).toContain('churn');
  });

  it('compiles predict to REST call', () => {
    const result = compileProgram("build for javascript backend\nresult = predict with model using age and income");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('fetch');
    expect(result.javascript).toContain('predict');
  });
});

describe('E2E - ML', () => {
  it('compiles full ML pipeline (Python)', () => {
    const result = compileProgram(`build for python backend
data = load csv 'customers.csv'
model = train model on data predicting churn
result = predict with model using signup_days and usage_hours`);
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('sklearn');
    expect(result.python).toContain('fit');
    expect(result.python).toContain('predict');
  });

  it('compiles ML in API endpoint (JS)', () => {
    const result = compileProgram(`build for javascript backend
when user calls POST /api/predict:
  model = train model on data predicting churn
  result = predict with model using age and income
  send back result`);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('fetch');
  });
});

// ADVANCED FEATURES (Phase 28)
// =============================================================================

describe('Parser - Text Block (multi-line strings)', () => {
  it('parses text block with indented lines', () => {
    const ast = parse("message is text block:\n  Hello world\n  Second line");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.TEXT_BLOCK);
    expect(ast.body[0].expression.lines.length).toBe(2);
    expect(ast.body[0].expression.lines[0]).toBe('Hello world');
    expect(ast.body[0].expression.lines[1]).toBe('Second line');
  });

  it('parses text block with interpolation markers', () => {
    const ast = parse("msg is text block:\n  Hello {name}\n  Order {id} shipped");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.TEXT_BLOCK);
    expect(ast.body[0].expression.lines[0]).toBe('Hello {name}');
  });

  it('parses text template synonym', () => {
    const ast = parse("email_body is text template:\n  Dear customer\n  Thank you");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.TEXT_BLOCK);
  });

  it('parses multiline text synonym', () => {
    const ast = parse("body is multiline text:\n  Line one\n  Line two");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.TEXT_BLOCK);
  });

  it('errors on text block without indented lines', () => {
    const ast = parse("msg is text block:");
    expect(ast.errors.length).toBeGreaterThan(0);
  });
});

describe('Compiler - Text Block (JS)', () => {
  it('compiles text block to template literal', () => {
    const result = compileProgram("build for javascript backend\nmessage is text block:\n  Hello world\n  Second line");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('Hello world');
    expect(result.javascript).toContain('Second line');
  });

  it('compiles interpolation to template expressions', () => {
    const result = compileProgram("build for javascript backend\nname = 'Alice'\nmsg is text block:\n  Hello {name}\n  Welcome");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('${');
    expect(result.javascript).toContain('name');
  });
});

describe('Compiler - Text Block (Python)', () => {
  it('compiles text block to f-string or triple-quote', () => {
    const result = compileProgram("build for python backend\nmessage is text block:\n  Hello world\n  Second line");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('Hello world');
    expect(result.python).toContain('Second line');
  });

  it('compiles interpolation to f-string', () => {
    const result = compileProgram("build for python backend\nname = 'Alice'\nmsg is text block:\n  Hello {name}\n  Welcome");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('{name}');
  });
});

describe('Parser - Do All (parallel execution)', () => {
  it('parses do all block with expressions', () => {
    const ast = parse("results = do all:\n  fetch page 'https://api.example.com/users'\n  fetch page 'https://api.example.com/orders'");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.DO_ALL);
    expect(ast.body[0].expression.tasks.length).toBe(2);
  });

  it('parses run all synonym', () => {
    const ast = parse("results = run all:\n  fetch page 'https://example.com'\n  fetch page 'https://other.com'");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].expression.type).toBe(NodeType.DO_ALL);
  });

  it('errors on do all without tasks', () => {
    const ast = parse("results = do all:");
    expect(ast.errors.length).toBeGreaterThan(0);
  });
});

describe('Compiler - Do All (JS)', () => {
  it('compiles do all to Promise.all', () => {
    const result = compileProgram("build for javascript backend\nresults = do all:\n  fetch page 'https://api.example.com/a'\n  fetch page 'https://api.example.com/b'");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('Promise.all');
  });
});

describe('Compiler - Do All (Python)', () => {
  it('compiles do all to asyncio.gather', () => {
    const result = compileProgram("build for python backend\nresults = do all:\n  fetch page 'https://api.example.com/a'\n  fetch page 'https://api.example.com/b'");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('asyncio');
    expect(result.python).toContain('gather');
  });
});

// SOURCE MAPS
// =============================================================================

describe('Source Maps', () => {
  it('adds clear:LINE comments when sourceMap enabled (JS backend)', () => {
    const result = compileProgram("build for javascript backend\nprice = 100\ntax = price * 0.08", { sourceMap: true });
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('// clear:2');
    expect(result.javascript).toContain('// clear:3');
  });

  it('adds clear:LINE comments when sourceMap enabled (Python)', () => {
    const result = compileProgram("build for python backend\nprice = 100\ntax = price * 0.08", { sourceMap: true });
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('# clear:2');
    expect(result.python).toContain('# clear:3');
  });

  it('does NOT add source map comments by default', () => {
    const result = compileProgram("build for javascript backend\nprice = 100");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).not.toContain('// clear:');
  });

  it('annotates if-then blocks', () => {
    const result = compileProgram("build for javascript backend\nx = 5\nif x is 5:\n  show 'yes'", { sourceMap: true });
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('// clear:3');
  });

  it('annotates endpoints', () => {
    const result = compileProgram("build for javascript backend\nwhen user calls GET /api/health:\n  send back 'ok'", { sourceMap: true });
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('// clear:2');
  });

  it('annotates for-each loops', () => {
    const result = compileProgram("build for javascript backend\nitems is an empty list\nfor each item in items list:\n  show item", { sourceMap: true });
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('// clear:3');
  });

  it('annotates web reactive app', () => {
    const result = compileProgram("build for web\npage 'App':\n  'Name' is a text input\n  price = 100\n  display price", { sourceMap: true });
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('// clear:');
  });

  it('line numbers are correct and sequential', () => {
    const result = compileProgram("build for javascript backend\nx = 1\ny = 2\nz = x + y", { sourceMap: true });
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('// clear:2');
    expect(result.javascript).toContain('// clear:3');
    expect(result.javascript).toContain('// clear:4');
  });
});

// MULTI-FILE MODULES
// =============================================================================

describe('Parser - Multi-file modules', () => {
  it('parses use with file path', () => {
    const ast = parse("use 'helpers'");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.USE);
    expect(ast.body[0].module).toBe('helpers');
  });

  it('parses use with .clear extension', () => {
    const ast = parse("use 'lib/helpers.clear'");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].module).toBe('lib/helpers.clear');
  });

  it('parses use with path separators', () => {
    const ast = parse("use 'components/UserCard'");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].module).toBe('components/UserCard');
  });
});

describe('Compiler - Multi-file modules', () => {
  it('resolves file import as namespace', () => {
    const resolver = (moduleName) => {
      if (moduleName === 'helpers') return 'double(x) = x * 2';
      return null;
    };
    const result = compileProgram("build for javascript backend\nuse 'helpers'\nresult = helpers's double(5)", { moduleResolver: resolver });
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('helpers.double(5)');
  });

  it('resolver returns null for adapters (not files)', () => {
    const resolver = (moduleName) => null;
    const result = compileProgram("build for javascript backend\nconnect to database:\n  type is 'postgres'\n  url is env('DB_URL')", { moduleResolver: resolver });
    expect(result.errors).toHaveLength(0);
  });

  it('errors when file module not found', () => {
    const resolver = (moduleName) => null;
    const result = compileProgram("build for javascript backend\nuse 'nonexistent'\nresult = foo()", { moduleResolver: resolver });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.message.includes('nonexistent'))).toBe(true);
  });

  it('namespaces multiple functions from imported module', () => {
    const resolver = (moduleName) => {
      if (moduleName === 'math_utils') return "double(x) = x * 2\ntriple(x) = x * 3";
      return null;
    };
    const result = compileProgram("build for javascript backend\nuse 'math_utils'\nfirst_result = math_utils's double(5)\nsecond_result = math_utils's triple(5)", { moduleResolver: resolver });
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('math_utils.double(5)');
    expect(result.javascript).toContain('math_utils.triple(5)');
  });

  it('namespaces variables from imported module', () => {
    const resolver = (moduleName) => {
      if (moduleName === 'config') return "tax_rate = 0.08\napp_name is 'My App'";
      return null;
    };
    const result = compileProgram("build for javascript backend\nuse 'config'\ntotal = 100 * config's tax_rate", { moduleResolver: resolver });
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('config.tax_rate');
  });

  it('works with Python backend', () => {
    const resolver = (moduleName) => {
      if (moduleName === 'helpers') return 'double(x) = x * 2';
      return null;
    };
    const result = compileProgram("build for python backend\nuse 'helpers'\nresult = helpers's double(5)", { moduleResolver: resolver });
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('helpers["double"](5)');
  });

  it('does not duplicate when same module imported twice', () => {
    const resolver = (moduleName) => {
      if (moduleName === 'helpers') return 'double(x) = x * 2';
      return null;
    };
    const result = compileProgram("build for javascript backend\nuse 'helpers'\nuse 'helpers'\nresult = helpers's double(5)", { moduleResolver: resolver });
    expect(result.errors).toHaveLength(0);
    // Count occurrences of helpers namespace — should be exactly 1
    const matches = result.javascript.match(/const helpers\s*=/g) || result.javascript.match(/let helpers\s*=/g);
    expect(matches).toHaveLength(1);
  });
});

describe('Namespaced module imports', () => {
  const resolver = (name) => {
    if (name === 'helpers') return 'double(x) = x * 2\ntriple(x) = x * 3';
    if (name === 'config') return "tax_rate = 0.08\napp_name is 'My App'";
    return null;
  };

  it('wraps imports in namespace object', () => {
    const result = compileProgram("build for javascript backend\nuse 'helpers'\nresult = helpers's double(5)", { moduleResolver: resolver });
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('helpers.double(5)');
  });

  it('dot access also works', () => {
    const result = compileProgram("build for javascript backend\nuse 'helpers'\nresult = helpers.double(5)", { moduleResolver: resolver });
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('helpers.double(5)');
  });

  it('namespace contains all exported functions', () => {
    const result = compileProgram("build for javascript backend\nuse 'helpers'\nfirst_val = helpers's double(1)\nsecond_val = helpers's triple(2)", { moduleResolver: resolver });
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('helpers.double(1)');
    expect(result.javascript).toContain('helpers.triple(2)');
  });

  it('namespace contains variables', () => {
    const result = compileProgram("build for javascript backend\nuse 'config'\ntotal = 100 * config's tax_rate", { moduleResolver: resolver });
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('config.tax_rate');
  });

  it('bare function name is not available (forward ref error)', () => {
    const result = compileProgram("build for javascript backend\nuse 'helpers'\nresult = double(5)", { moduleResolver: resolver });
    // Should either error or not find double as a bare name
    const hasError = result.errors.length > 0;
    const hasDouble = result.javascript && result.javascript.includes('function double');
    // double should NOT be a top-level function
    expect(hasError || !hasDouble).toBe(true);
  });

  it('adapters still work unchanged', () => {
    const result = compileProgram("build for javascript backend\nconnect to database:\n  type is 'postgres'\n  url is env('DB_URL')", { moduleResolver: resolver });
    expect(result.errors).toHaveLength(0);
  });

  it('external JS imports still work unchanged', () => {
    const result = compileProgram("build for web\nuse 'lib' from './lib.js'\npage 'T' at '/':\n  text 'hi'");
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('await import("./lib.js")');
  });

  it('derives namespace from path: lib/helpers -> helpers', () => {
    const pathResolver = (name) => {
      if (name === 'lib/helpers') return 'double(x) = x * 2';
      return null;
    };
    const result = compileProgram("build for javascript backend\nuse 'lib/helpers'\nresult = helpers's double(5)", { moduleResolver: pathResolver });
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('helpers.double(5)');
  });
});

describe('Selective module imports', () => {
  const resolver = (name) => {
    if (name === 'helpers') return 'double(x) = x * 2\ntriple(x) = x * 3';
    return null;
  };

  it('use NAME from MODULE inlines just that function', () => {
    const result = compileProgram("build for javascript backend\nuse double from 'helpers'\nresult = double(5)", { moduleResolver: resolver });
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('double(5)');
    // triple should NOT be available
    expect(result.javascript).not.toContain('triple');
  });

  it('use NAME, NAME from MODULE inlines multiple', () => {
    const result = compileProgram("build for javascript backend\nuse double, triple from 'helpers'\nfirst = double(5)\nsecond = triple(3)", { moduleResolver: resolver });
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('function double');
    expect(result.javascript).toContain('function triple');
  });

  it('errors when name not found in module', () => {
    const result = compileProgram("build for javascript backend\nuse nonexistent from 'helpers'\nresult = nonexistent(5)", { moduleResolver: resolver });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('nonexistent');
    expect(result.errors[0].message).toContain('double'); // suggests available names
  });

  it('collision with local function = error', () => {
    const result = compileProgram("build for javascript backend\ndouble(x) = x * 10\nuse double from 'helpers'\nresult = double(5)", { moduleResolver: resolver });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('double');
  });

  it('keyword names work as import names', () => {
    const keyResolver = (name) => {
      if (name === 'math') return 'total(items) = 42';
      return null;
    };
    const result = compileProgram("build for javascript backend\nuse total from 'math'\nmy_items = [1, 2, 3]\nresult = total(my_items)", { moduleResolver: keyResolver });
    expect(result.errors).toHaveLength(0);
  });
});

describe('use everything from (inline-all)', () => {
  const resolver = (name) => {
    if (name === 'helpers') return 'double(x) = x * 2\ntriple(x) = x * 3';
    return null;
  };

  it('inlines all functions without namespace', () => {
    const result = compileProgram("build for javascript backend\nuse everything from 'helpers'\nresult = double(5)", { moduleResolver: resolver });
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('function double');
    expect(result.javascript).toContain('double(5)');
  });

  it('all functions accessible without prefix', () => {
    const result = compileProgram("build for javascript backend\nuse everything from 'helpers'\nfirst = double(5)\nsecond = triple(3)", { moduleResolver: resolver });
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('function double');
    expect(result.javascript).toContain('function triple');
  });

  it('name collision with local function errors', () => {
    const result = compileProgram("build for javascript backend\ndouble(x) = x * 10\nuse everything from 'helpers'\nresult = double(5)", { moduleResolver: resolver });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('double');
  });
});

describe('Circular module dependency detection', () => {
  it('detects a -> b -> a cycle', () => {
    const resolver = (name) => {
      if (name === 'module_a') return "use 'module_b'\ndouble(x) = x * 2";
      if (name === 'module_b') return "use 'module_a'\ntriple(x) = x * 3";
      return null;
    };
    const result = compileProgram("build for javascript backend\nuse 'module_a'\nresult = module_a's double(5)", { moduleResolver: resolver });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message.toLowerCase()).toContain('circular');
  });

  it('detects self-import', () => {
    const resolver = (name) => {
      if (name === 'self_ref') return "use 'self_ref'\ndouble(x) = x * 2";
      return null;
    };
    const result = compileProgram("build for javascript backend\nuse 'self_ref'\nresult = self_ref's double(5)", { moduleResolver: resolver });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message.toLowerCase()).toContain('circular');
  });

  it('deep chain without cycle works fine', () => {
    const resolver = (name) => {
      if (name === 'chain_a') return "use 'chain_b'\ndouble(x) = x * 2";
      if (name === 'chain_b') return "use 'chain_c'\ntriple(x) = x * 3";
      if (name === 'chain_c') return "quad(x) = x * 4";
      return null;
    };
    const result = compileProgram("build for javascript backend\nuse 'chain_a'\nresult = chain_a's double(5)", { moduleResolver: resolver });
    expect(result.errors).toHaveLength(0);
  });
});

describe('Component imports across files', () => {
  it('selective import of component works', () => {
    const resolver = (name) => {
      if (name === 'components') return "define component Card receiving content:\n  text 'Card: ' + content";
      return null;
    };
    const result = compileProgram("build for web\nuse Card from 'components'\npage 'T' at '/':\n  show Card('Hello')", { moduleResolver: resolver });
    expect(result.errors).toHaveLength(0);
  });

  it('namespaced import includes component in namespace', () => {
    const resolver = (name) => {
      if (name === 'ui') return "define component Badge receiving label:\n  text 'Badge: ' + label";
      return null;
    };
    // Namespace includes the component (compiled to JS object property)
    const result = compileProgram("build for javascript backend\nuse 'ui'\nshow ui's Badge('Active')", { moduleResolver: resolver });
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('ui.Badge');
  });

  it('COMPONENT_DEF included in importable types', () => {
    const resolver = (name) => {
      if (name === 'widgets') return "define component Card receiving content:\n  text 'Widget: ' + content";
      return null;
    };
    const result = compileProgram("build for web\nuse Card from 'widgets'\npage 'T' at '/':\n  show Card('Test')", { moduleResolver: resolver });
    expect(result.errors).toHaveLength(0);
  });
});

// SYNTAX V2
// =============================================================================

describe('Syntax v2 - sending keyword', () => {
  it('parses sending as alias for receiving', () => {
    const ast = parse("when user calls POST /api/todos sending post_data:\n  send back post_data");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].receivingVar).toBe('post_data');
  });
});

describe('Syntax v2 - get all shorthand', () => {
  it('parses get all Todos as CRUD lookup', () => {
    const ast = parse("all_todos = get all Todos");
    expect(ast.errors).toHaveLength(0);
    const node = ast.body[0];
    expect(node.type).toBe(NodeType.CRUD);
    expect(node.operation).toBe('lookup');
    expect(node.lookupAll).toBe(true);
  });

  it('compiles get all Todos to findAll (JS)', () => {
    const result = compileProgram("build for javascript backend\nall_todos = get all Todos\nwhen user calls GET /api/todos:\n  all_todos = get all Todos\n  send back all_todos");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('findAll');
    expect(result.javascript).toContain("'todos'");
  });
});

describe('Syntax v2 - save as new', () => {
  it('parses save X as new Todo', () => {
    const ast = parse("new_todo = save post_data as new Todo");
    expect(ast.errors).toHaveLength(0);
    const node = ast.body[0];
    expect(node.type).toBe(NodeType.CRUD);
    expect(node.operation).toBe('save');
    expect(node.resultVar).toBe('new_todo');
  });

  it('compiles to db.insert with _pick', () => {
    const result = compileProgram("build for javascript backend\ncreate a Todos table:\n  title, required\nwhen user calls POST /api/todos sending d:\n  new_todo = save d as new Todo\n  send back new_todo with success message");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('insert');
    expect(result.javascript).toContain('_pick');
  });
});

describe('Syntax v2 - with success message', () => {
  it('parses with success message as status 201', () => {
    const ast = parse("when user calls POST /api/test sending d:\n  send back d with success message");
    expect(ast.errors).toHaveLength(0);
    const respond = ast.body[0].body[0];
    expect(respond.status).toBe(201);
    expect(respond.successMessage).toBe(true);
  });

  it('compiles to 201 with message field (JS)', () => {
    const result = compileProgram("build for javascript backend\nwhen user calls POST /api/test sending d:\n  send back d with success message");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('status(201)');
    expect(result.javascript).toContain('message');
  });

  it('works with string responses too', () => {
    const result = compileProgram("build for javascript backend\nwhen user calls DELETE /api/test/:id:\n  requires auth\n  send back 'deleted' with success message");
    expect(result.errors).toHaveLength(0);
    // DELETE returns 200 (not 201 which is for POST/create)
    expect(result.javascript).toContain('status(200)');
  });
});

describe('Syntax v2 - delete the X with this id', () => {
  it('parses delete the Todo with this id', () => {
    const ast = parse("when user calls DELETE /api/todos/:id:\n  requires auth\n  delete the Todo with this id\n  send back 'ok'");
    expect(ast.errors).toHaveLength(0);
    const crud = ast.body[0].body.find(n => n.type === NodeType.CRUD);
    expect(crud).toBeDefined();
    expect(crud.operation).toBe('remove');
  });

  it('compiles to db.remove with id filter', () => {
    const result = compileProgram("build for javascript backend\nwhen user calls DELETE /api/todos/:id:\n  requires auth\n  delete the Todo with this id\n  send back 'ok'");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('db.remove');
    expect(result.javascript).toContain('incoming.id');
  });
});

describe('Syntax v2 - get X from URL (named fetch)', () => {
  it('parses get todos from URL as standalone statement', () => {
    const ast = parse("page 'App':\n  button 'Go':\n    get todos from '/api/todos'");
    expect(ast.errors).toHaveLength(0);
    const apiCall = ast.body[0].body[0].body[0];
    expect(apiCall.type).toBe(NodeType.API_CALL);
    expect(apiCall.targetVar).toBe('todos');
    expect(apiCall.url).toBe('/api/todos');
  });

  it('parses in assignment context', () => {
    const ast = parse("todos = get from '/api/todos'");
    expect(ast.errors).toHaveLength(0);
  });

  it('compiles to _state.todos fetch (JS)', () => {
    const result = compileProgram("build for web\npage 'App':\n  'X' is a text input\n  button 'Go':\n    get todos from '/api/todos'\n  display todos as table");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('_state.todos');
    expect(result.javascript).toContain('fetch("/api/todos")');
  });

  it('registers target as state variable', () => {
    const result = compileProgram("build for web\npage 'App':\n  'X' is a text input\n  button 'Go':\n    get items from '/api/items'\n  display items as table");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('items: null');
  });
});

describe('Syntax v2 - on page load inline', () => {
  it('parses inline on page load get X from URL', () => {
    const ast = parse("page 'App':\n  on page load get todos from '/api/todos'");
    expect(ast.errors).toHaveLength(0);
    const opl = ast.body[0].body.find(n => n.type === NodeType.ON_PAGE_LOAD);
    expect(opl).toBeDefined();
    expect(opl.body[0].type).toBe(NodeType.API_CALL);
    expect(opl.body[0].targetVar).toBe('todos');
  });
});

describe('Syntax v2 - saved as (input alias)', () => {
  it('parses saved as with article', () => {
    const ast = parse("page 'App':\n  'What?' is a text input saved as a todo");
    expect(ast.errors).toHaveLength(0);
    const input = ast.body[0].body[0];
    expect(input.variable).toBe('todo');
  });

  it('parses saved as without article', () => {
    const ast = parse("page 'App':\n  'Name' is a text input saved as name");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].body[0].variable).toBe('name');
  });
});

describe('Syntax v2 - display showing columns', () => {
  it('parses showing column list', () => {
    const ast = parse("page 'App':\n  display todos as table showing title, completed");
    expect(ast.errors).toHaveLength(0);
    const disp = ast.body[0].body[0];
    expect(disp.columns).toEqual(['title', 'completed']);
  });

  it('compiles to hardcoded keys array', () => {
    const result = compileProgram("build for web\npage 'App':\n  'X' is a text input\n  button 'Go':\n    get todos from '/api/todos'\n  display todos as table showing name, email");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('["name","email"]');
  });

  it('omits columns when showing not specified', () => {
    const result = compileProgram("build for web\npage 'App':\n  'X' is a text input\n  button 'Go':\n    get todos from '/api/todos'\n  display todos as table");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('Object.keys');
  });
});

describe('Syntax v2 - send as a new X to (decorative)', () => {
  it('strips as a new X from field list', () => {
    const ast = parse("page 'App':\n  button 'Go':\n    send todo as a new todo to '/api/todos'");
    expect(ast.errors).toHaveLength(0);
    const apiCall = ast.body[0].body[0].body[0];
    expect(apiCall.type).toBe(NodeType.API_CALL);
    expect(apiCall.fields).toEqual(['todo']);
    expect(apiCall.fields).not.toContain('new');
  });
});

describe('Syntax v2 - string interpolation', () => {
  it('compiles {var} to template literal (JS)', () => {
    const result = compileProgram("build for javascript backend\nname is 'Alice'\nmsg is 'Hello, {name}!'");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('`Hello, ${name}!`');
  });

  it('compiles {var} to f-string (Python)', () => {
    const result = compileProgram("build for python backend\nname is 'Alice'\nmsg is 'Hello, {name}!'");
    expect(result.errors).toHaveLength(0);
    expect(result.python).toContain('f"Hello, {name}!"');
  });

  it('does not interpolate strings without braces', () => {
    const result = compileProgram("build for javascript backend\nmsg is 'Hello world'");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('"Hello world"');
    // No template literal for this specific string (backticks may exist elsewhere in boilerplate)
    expect(result.javascript).not.toContain('`Hello world`');
  });
});

describe('Syntax v2 - database declaration', () => {
  it('parses database is local memory', () => {
    const ast = parse("database is local memory");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.DATABASE_DECL);
    expect(ast.body[0].backend).toBe('local memory');
  });

  it('parses database is PostgreSQL at env URL', () => {
    const ast = parse("database is PostgreSQL at env('DATABASE_URL')");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].backend).toContain('postgresql');
    expect(ast.body[0].connection).toBeDefined();
  });

  it('compiles local memory to comment', () => {
    const result = compileProgram("build for javascript backend\ndatabase is local memory");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('local memory');
  });

  it('compiles PostgreSQL to pg Pool', () => {
    const result = compileProgram("build for javascript backend\ndatabase is PostgreSQL at env('DB_URL')");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('Pool');
    expect(result.javascript).toContain('DB_URL');
  });
});

// INTERACTIVE LAYOUT PATTERNS
// =============================================================================

describe('Tabs', () => {
  it('parses section as tabs with tab children', () => {
    const ast = parse("page 'App':\n  section 'Views' as tabs:\n    tab 'One':\n      text 'first'\n    tab 'Two':\n      text 'second'");
    expect(ast.errors).toHaveLength(0);
    const section = ast.body[0].body[0];
    expect(section.inlineModifiers).toContain('__tabs');
    const tabs = section.body.filter(n => n.type === NodeType.TAB);
    expect(tabs).toHaveLength(2);
    expect(tabs[0].title).toBe('One');
  });

  it('compiles tabs to DaisyUI tab structure', () => {
    const result = compileProgram("build for web\npage 'App':\n  section 'Views' as tabs:\n    tab 'One':\n      text 'first'\n    tab 'Two':\n      text 'second'");
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('tabs-bordered');
    expect(result.html).toContain('tab-panel');
    expect(result.html).toContain('tabpanel-one');
    expect(result.html).toContain('tabpanel-two');
  });

  it('first tab is active by default', () => {
    const result = compileProgram("build for web\npage 'App':\n  section 'V' as tabs:\n    tab 'A':\n      text 'a'\n    tab 'B':\n      text 'b'");
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('tab-active');
    // Second tab panel hidden
    expect(result.html).toContain("display:none");
  });
});

describe('Collapsible sections', () => {
  it('parses collapsible modifier', () => {
    const ast = parse("page 'App':\n  section 'Details' collapsible:\n    text 'content'");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].body[0].inlineModifiers).toContain('__collapsible');
  });

  it('parses starts closed modifier', () => {
    const ast = parse("page 'App':\n  section 'Details' collapsible, starts closed:\n    text 'content'");
    expect(ast.errors).toHaveLength(0);
    const mods = ast.body[0].body[0].inlineModifiers;
    expect(mods).toContain('__collapsible');
    expect(mods).toContain('__starts_closed');
  });

  it('compiles to clickable header with toggle', () => {
    const result = compileProgram("build for web\npage 'App':\n  section 'Details' collapsible:\n    text 'content'");
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('collapsible-content');
    expect(result.html).toContain('cursor-pointer');
  });

  it('starts closed hides content by default', () => {
    const result = compileProgram("build for web\npage 'App':\n  section 'FAQ' collapsible, starts closed:\n    text 'hidden'");
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('display:none');
  });
});

describe('Slide-in panel', () => {
  it('parses slides in from right', () => {
    const ast = parse("page 'App':\n  section 'Help' slides in from right:\n    text 'help text'");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].body[0].inlineModifiers).toContain('__slidein_right');
  });

  it('compiles to hidden panel with fixed positioning', () => {
    const result = compileProgram("build for web\npage 'App':\n  section 'Help' slides in from right:\n    text 'help'");
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('panel-help');
    expect(result.html).toContain('display:none');
    expect(result.css).toContain('position: fixed');
  });
});

describe('Modal', () => {
  it('parses section as modal', () => {
    const ast = parse("page 'App':\n  section 'Confirm' as modal:\n    text 'Are you sure?'");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].body[0].inlineModifiers).toContain('__modal');
  });

  it('compiles to dialog element', () => {
    const result = compileProgram("build for web\npage 'App':\n  section 'Confirm' as modal:\n    text 'Sure?'");
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('<dialog');
    expect(result.html).toContain('modal-box');
    expect(result.html).toContain('panel-confirm');
  });
});

describe('Panel actions', () => {
  it('parses toggle the X panel', () => {
    const ast = parse("page 'App':\n  button 'Help':\n    toggle the Help panel");
    expect(ast.errors).toHaveLength(0);
    const action = ast.body[0].body[0].body[0];
    expect(action.type).toBe(NodeType.PANEL_ACTION);
    expect(action.action).toBe('toggle');
    expect(action.target).toBe('Help');
  });

  it('parses open the X modal', () => {
    const ast = parse("page 'App':\n  button 'Go':\n    open the Confirm modal");
    expect(ast.errors).toHaveLength(0);
    const action = ast.body[0].body[0].body[0];
    expect(action.action).toBe('open');
    expect(action.target).toBe('Confirm');
  });

  it('parses close modal without "this"', () => {
    const ast = parse("page 'App':\n  button 'Cancel':\n    close modal");
    expect(ast.errors).toHaveLength(0);
    const action = ast.body[0].body[0].body[0];
    expect(action.action).toBe('close');
  });

  it('compiles toggle to visibility toggle JS', () => {
    const result = compileProgram("build for web\npage 'App':\n  button 'Help':\n    toggle the Help panel");
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('panel-help');
  });

  it('compiles open to showModal for dialog', () => {
    const result = compileProgram("build for web\npage 'App':\n  button 'Go':\n    open the Confirm modal");
    expect(result.errors).toHaveLength(0);
    // The JS should reference panel-confirm and call showModal
    const js = result.javascript || result.html;
    expect(js).toContain('panel-confirm');
  });
});

// TOAST NOTIFICATIONS
// =============================================================================

describe('Toast', () => {
  it('parses show toast with message', () => {
    const ast = parse("page 'App':\n  button 'Go':\n    show toast 'Saved'");
    expect(ast.errors).toHaveLength(0);
    const toast = ast.body[0].body[0].body[0];
    expect(toast.type).toBe(NodeType.TOAST);
    expect(toast.message).toBe('Saved');
    expect(toast.variant).toBe('success');
  });

  it('parses show toast with variant', () => {
    const ast = parse("page 'App':\n  button 'Go':\n    show toast 'Oops' as error");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].body[0].body[0].variant).toBe('error');
  });

  it('parses warning variant', () => {
    const ast = parse("page 'App':\n  button 'Go':\n    show toast 'Check' as warning");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].body[0].body[0].variant).toBe('warning');
  });

  it('compiles to _toast call with DaisyUI class', () => {
    const result = compileProgram("build for web\npage 'App':\n  button 'Go':\n    show toast 'Done'");
    expect(result.errors).toHaveLength(0);
    const js = result.javascript || result.html;
    expect(js).toContain('_toast(');
    expect(js).toContain('alert-success');
  });

  it('compiles error variant', () => {
    const result = compileProgram("build for web\npage 'App':\n  button 'Go':\n    show toast 'Failed' as error");
    expect(result.errors).toHaveLength(0);
    const js = result.javascript || result.html;
    expect(js).toContain('alert-error');
  });
});

// ERROR MESSAGE IMPROVEMENTS

describe('Validator: missing required schema fields in validation', () => {
  it('warns when validate block is missing a required schema field', () => {
    const result = compileProgram(`build for javascript backend
create data shape Item:
  name is text, required
  color is text, required
  created_at is timestamp, auto
when user calls POST /api/items sending d:
  validate d:
    name is text, required
  new_item = save d as Item
  send back new_item with success message`);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some(w => w.includes("missing required field 'color'"))).toBe(true);
  });

  it('does not warn for auto or default fields', () => {
    const result = compileProgram(`build for javascript backend
create data shape Item:
  name is text, required
  status is text, default 'active'
  created_at is timestamp, auto
when user calls POST /api/items sending d:
  validate d:
    name is text, required
  new_item = save d as Item
  send back new_item with success message`);
    expect(result.errors).toHaveLength(0);
    const fieldWarns = result.warnings.filter(w => w.includes('missing required field'));
    expect(fieldWarns).toHaveLength(0);
  });

  it('does not warn when all required fields are validated', () => {
    const result = compileProgram(`build for javascript backend
create data shape Item:
  name is text, required
  color is text, required
when user calls POST /api/items sending d:
  validate d:
    name is text, required
    color is text, required
  new_item = save d as Item
  send back new_item with success message`);
    expect(result.errors).toHaveLength(0);
    const fieldWarns = result.warnings.filter(w => w.includes('missing required field'));
    expect(fieldWarns).toHaveLength(0);
  });
});

describe('Compiler bug: endpoint with sending AND incoming params', () => {
  it('binds both req.body and req.params when endpoint has sending + URL params', () => {
    const src = `
build for javascript backend
create a Invoices table:
  status, default 'draft'
when user calls PUT /api/invoices/:id/pay sending payment_data:
  requires auth
  validate payment_data:
    amount is number, required
  define invoice as: look up records in Invoices table where id is incoming's id
  guard invoice is not nothing or 'Invoice not found'
  send back 'paid' with success message
    `;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    const js = result.javascript;
    // Must have BOTH body binding and params binding
    expect(js).toContain('const payment_data = req.body');
    expect(js).toContain('const incoming = req.params');
  });

  it('does not double-bind incoming when endpoint has no sending', () => {
    const src = `
build for javascript backend
create a Invoices table:
  status, default 'draft'
when user calls PUT /api/invoices/:id/cancel:
  requires auth
  define invoice as: look up records in Invoices table where id is incoming's id
  send back 'cancelled' with success message
    `;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    const js = result.javascript;
    // Should have params binding only (no body)
    expect(js).toContain('const incoming = req.params');
    expect(js).not.toContain('req.body');
  });
});

describe('Error messages - keyword typo detection', () => {
  it('suggests repeat for repat', () => {
    const result = compileProgram("repat 5 times:\n  show 1");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain("Did you mean 'repeat'");
  });

  it('suggests define for defne', () => {
    const result = compileProgram("defne x as: 5");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain("Did you mean 'define'");
  });

  it('suggests return for retrn', () => {
    const result = compileProgram("define function f():\n  retrn 1");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain("Did you mean 'return'");
  });

  it('suggests show for sho', () => {
    const result = compileProgram("sho 5");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain("Did you mean 'show'");
  });

  it('does not suggest keyword for completely unrelated names', () => {
    const result = compileProgram("banana = 5\nshow banana");
    expect(result.errors).toHaveLength(0);
  });
});

describe('Error messages - duplicate endpoint detection', () => {
  it('warns on duplicate GET endpoint', () => {
    const result = compileProgram("build for javascript backend\nwhen user calls GET /api/x:\n  send back 1\nwhen user calls GET /api/x:\n  send back 2");
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.includes('Duplicate endpoint GET /api/x'))).toBe(true);
  });

  it('does not warn when methods differ', () => {
    const result = compileProgram("build for javascript backend\nwhen user calls GET /api/x:\n  send back 1\nwhen user calls POST /api/x:\n  send back 2");
    const dupWarns = (result.warnings || []).filter(w => w.includes('Duplicate endpoint'));
    expect(dupWarns).toHaveLength(0);
  });

  it('does not warn when paths differ', () => {
    const result = compileProgram("build for javascript backend\nwhen user calls GET /api/x:\n  send back 1\nwhen user calls GET /api/y:\n  send back 2");
    const dupWarns = (result.warnings || []).filter(w => w.includes('Duplicate endpoint'));
    expect(dupWarns).toHaveLength(0);
  });
});

// FK DEPENDENCY DETECTION IN E2E TEST GENERATION

describe('E2E test generation - FK dependency detection', () => {
  it('generates setup step for parent table when child has _id FK field', () => {
    const src = `
build for javascript backend
create a Products table:
  name, required
  price (number), required

create a Orders table:
  product_id, required
  quantity (number), required

when user calls POST /api/products sending product_data:
  requires auth
  validate product_data:
    name is text, required
    price is number, required
  new_product = save product_data as new Product
  send back new_product with success message

when user calls POST /api/orders sending order_data:
  requires auth
  validate order_data:
    product_id is text, required
    quantity is number, required
  new_order = save order_data as new Order
  send back new_order with success message
    `;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    const tests = result.tests;
    expect(tests).toContain('SETUP: create product for FK dependencies');
    expect(tests).toContain('createdIds["product"]');
    expect(tests).toContain('payload["product_id"] = createdIds["product"]');
  });

  it('does not generate setup step when no FK dependencies exist', () => {
    const src = `
build for javascript backend
create a Users table:
  name, required
  email, required

when user calls POST /api/users sending user_data:
  validate user_data:
    name is text, required
    email is text, required
  new_user = save user_data as new User
  send back new_user with success message
    `;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    const tests = result.tests;
    expect(tests).not.toContain('SETUP');
    expect(tests).not.toContain('createdIds');
  });

  it('handles multiple FK dependencies (orders -> products, orders -> users)', () => {
    const src = `
build for javascript backend
create a Products table:
  name, required
create a Users table:
  name, required
create a Orders table:
  product_id, required
  user_id, required

when user calls POST /api/products sending data:
  validate data:
    name is text, required
  new_product = save data as new Product
  send back new_product with success message

when user calls POST /api/users sending data:
  validate data:
    name is text, required
  new_user = save data as new User
  send back new_user with success message

when user calls POST /api/orders sending data:
  validate data:
    product_id is text, required
    user_id is text, required
  new_order = save data as new Order
  send back new_order with success message
    `;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    const tests = result.tests;
    expect(tests).toContain('SETUP: create product for FK dependencies');
    expect(tests).toContain('SETUP: create user for FK dependencies');
    expect(tests).toContain('payload["product_id"] = createdIds["product"]');
    expect(tests).toContain('payload["user_id"] = createdIds["user"]');
  });

  it('generates valid email for matches email constraint', () => {
    const src = `
build for javascript backend
create a Users table:
  name, required
  email, required

when user calls POST /api/users sending data:
  validate data:
    name is text, required
    email is text, required, matches email
  new_user = save data as new User
  send back new_user with success message
    `;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    const tests = result.tests;
    expect(tests).toContain('test@example.com');
    expect(tests).not.toContain('"email":"Test value"');
  });

  it('setup steps appear before regular tests', () => {
    const src = `
build for javascript backend
create a Products table:
  name, required
create a Orders table:
  product_id, required

when user calls GET /api/orders:
  all_orders = get all Orders
  send back all_orders

when user calls POST /api/products sending data:
  validate data:
    name is text, required
  new_product = save data as new Product
  send back new_product with success message

when user calls POST /api/orders sending data:
  validate data:
    product_id is text, required
  new_order = save data as new Order
  send back new_order with success message
    `;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    const tests = result.tests;
    const setupIdx = tests.indexOf('SETUP');
    const getIdx = tests.indexOf('GET /api/orders');
    expect(setupIdx).toBeLessThan(getIdx);
  });
});

// =============================================================================
// AGENT PRIMITIVES -- Parser
// =============================================================================

describe('Agent primitives - parser', () => {
  it('parses agent definition', () => {
    const result = compileProgram("build for javascript backend\nagent 'Scorer' receiving data:\n  send back data");
    expect(result.errors).toHaveLength(0);
    const agent = result.ast.body.find(n => n.type === 'agent');
    expect(agent).toBeDefined();
    expect(agent.name).toBe('Scorer');
    expect(agent.receivingVar).toBe('data');
    expect(agent.body.length).toBeGreaterThan(0);
  });

  it('parses ask ai with prompt and context', () => {
    const result = compileProgram("build for javascript backend\nagent 'Test' receiving d:\n  answer = ask ai 'Summarize this' with d\n  send back answer");
    expect(result.errors).toHaveLength(0);
    const agent = result.ast.body.find(n => n.type === 'agent');
    const assign = agent.body.find(n => n.type === 'assign');
    expect(assign.expression.type).toBe('ask_ai');
    expect(assign.expression.prompt.value).toBe('Summarize this');
    expect(assign.expression.context.name).toBe('d');
  });

  it('parses ask ai without context', () => {
    const result = compileProgram("build for javascript backend\nagent 'Test' receiving d:\n  answer = ask ai 'Hello'\n  send back answer");
    expect(result.errors).toHaveLength(0);
    const agent = result.ast.body.find(n => n.type === 'agent');
    const assign = agent.body.find(n => n.type === 'assign');
    expect(assign.expression.type).toBe('ask_ai');
    expect(assign.expression.context).toBe(null);
  });

  it('parses call agent with data', () => {
    const result = compileProgram("build for javascript backend\nagent 'Scorer' receiving d:\n  send back d\nwhen user calls POST /api/test:\n  result = call 'Scorer' with incoming\n  send back result");
    expect(result.errors).toHaveLength(0);
    const ep = result.ast.body.find(n => n.type === 'endpoint');
    const assign = ep.body.find(n => n.type === 'assign');
    expect(assign.expression.type).toBe('run_agent');
    expect(assign.expression.agentName).toBe('Scorer');
  });

  it('parses full agent with guard and ask ai', () => {
    const src = `build for javascript backend
agent 'Qualifier' receiving lead:
  guard lead's email is not nothing or 'Email required'
  summary = ask ai 'Classify this lead' with lead's company
  if summary contains 'enterprise':
    lead's tier is 'enterprise'
  send back lead`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    const agent = result.ast.body.find(n => n.type === 'agent');
    expect(agent.body.length).toBe(4);
  });
});

// =============================================================================
// AGENT PRIMITIVES -- Compiler
// =============================================================================

describe('Agent primitives - compiler', () => {
  it('compiles agent to async function', () => {
    const result = compileProgram("build for javascript backend\nagent 'Scorer' receiving data:\n  send back data");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('async function agent_scorer(data)');
    expect(result.javascript).toContain('return data');
  });

  it('compiles ask ai to _askAI call', () => {
    const result = compileProgram("build for javascript backend\nagent 'T' receiving d:\n  answer = ask ai 'Summarize' with d\n  send back answer");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('_askAI("Summarize"');
  });

  it('compiles ask ai without context', () => {
    const result = compileProgram("build for javascript backend\nagent 'T' receiving d:\n  answer = ask ai 'Hello'\n  send back answer");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('_askAI("Hello")');
  });

  it('compiles call agent to function call', () => {
    const result = compileProgram("build for javascript backend\nagent 'Lead Scorer' receiving d:\n  send back d\nwhen user calls GET /api/test:\n  result = call 'Lead Scorer' with incoming\n  send back result");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('agent_lead_scorer(');
  });

  it('includes _askAI utility when ask ai is used', () => {
    const result = compileProgram("build for javascript backend\nagent 'T' receiving d:\n  answer = ask ai 'Hi' with d\n  send back answer");
    expect(result.javascript).toContain('async function _askAI(');
    expect(result.javascript).toContain('CLEAR_AI_KEY');
  });

  it('does not include _askAI when not used', () => {
    const result = compileProgram("build for javascript backend\nagent 'T' receiving d:\n  send back d");
    expect(result.javascript).not.toContain('_askAI');
  });

  it('agent send back compiles to return not res.json', () => {
    const result = compileProgram("build for javascript backend\nagent 'T' receiving d:\n  send back d");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('return d;');
    expect(result.javascript).not.toContain('res.json');
  });

  it('agent guard compiles to throw not res.status', () => {
    const result = compileProgram("build for javascript backend\nagent 'T' receiving d:\n  guard d's name is not nothing or 'Name required'\n  send back d");
    expect(result.errors).toHaveLength(0);
    const js = result.javascript;
    const agentStart = js.indexOf('async function agent_t');
    const agentEnd = js.indexOf('\n}', agentStart) + 2;
    const agentBody = js.substring(agentStart, agentEnd);
    expect(agentBody).toContain('throw new Error("Name required")');
    expect(agentBody).not.toContain('res.status');
  });
});

// =============================================================================
// AGENT PRIMITIVES -- Validator
// =============================================================================

describe('Agent primitives - validator', () => {
  it('allows calling agent before definition', () => {
    const result = compileProgram("build for javascript backend\nwhen user calls GET /api/t:\n  r = call 'Scorer' with incoming\n  send back r\nagent 'Scorer' receiving d:\n  send back d");
    expect(result.errors).toHaveLength(0);
  });

  it('errors when ask ai prompt is not a string', () => {
    const result = compileProgram("build for javascript backend\nagent 'T' receiving d:\n  answer = ask ai d\n  send back answer");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('quoted prompt');
  });

  it('errors when agent has no name', () => {
    const result = compileProgram("build for javascript backend\nagent receiving d:\n  send back d");
    expect(result.errors.length).toBeGreaterThan(0);
    const hasQuotedNameError = result.errors.some(e => e.message.includes('quoted name'));
    expect(hasQuotedNameError).toBe(true);
  });

  it('errors when agent has no receiving var', () => {
    const result = compileProgram("build for javascript backend\nagent 'T':\n  send back 1");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('receiving');
  });
});

// =============================================================================
// GAN APP TESTS -- Chat App
// =============================================================================

describe('GAN: Chat backend app', () => {
  const src = `build for javascript backend

database is local memory

create data shape Message:
  room is text, required
  sender is text, required
  content is text, required
  created_at is timestamp, auto

create data shape Room:
  name is text, required, unique
  description is text
  created_at is timestamp, auto

log every request
allow cross-origin requests

when user calls GET /api/rooms:
  all_rooms = get all Rooms
  send back all_rooms

when user calls POST /api/rooms sending room_data:
  requires auth
  validate room_data:
    name is text, required, min 1, max 100
  new_room = save room_data as new Room
  send back new_room with success message

when user calls GET /api/rooms/:id/messages:
  room_messages = get all Messages
  send back room_messages

when user calls POST /api/messages sending msg_data:
  requires auth
  validate msg_data:
    room is text, required
    sender is text, required
    content is text, required, min 1
  new_message = save msg_data as new Message
  send back new_message with success message

when user calls GET /api/health:
  send back 'ok'`;

  it('compiles with 0 errors', () => {
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
  });

  it('has express app scaffold', () => {
    const js = compileProgram(src).javascript;
    expect(js).toContain("require('express')");
    expect(js).toContain('app.use(express.json())');
    expect(js).toContain('app.listen(');
  });

  it('has CORS middleware', () => {
    const js = compileProgram(src).javascript;
    expect(js).toContain('cross-origin');
    expect(js).toContain('Access-Control');
  });

  it('has request logging', () => {
    const js = compileProgram(src).javascript;
    expect(js).toContain('Log every request');
    expect(js).toContain('req.method');
  });

  it('creates both data tables', () => {
    const js = compileProgram(src).javascript;
    expect(js).toContain("db.createTable('messages'");
    expect(js).toContain("db.createTable('rooms'");
  });

  it('has all 5 endpoints', () => {
    const js = compileProgram(src).javascript;
    expect(js).toContain("app.get('/api/rooms'");
    expect(js).toContain("app.post('/api/rooms'");
    expect(js).toContain("app.get('/api/rooms/:id/messages'");
    expect(js).toContain("app.post('/api/messages'");
    expect(js).toContain("app.get('/api/health'");
  });

  it('POST endpoints require auth', () => {
    const js = compileProgram(src).javascript;
    const postRooms = js.indexOf("app.post('/api/rooms'");
    const postMessages = js.indexOf("app.post('/api/messages'");
    const afterPostRooms = js.substring(postRooms, postRooms + 500);
    const afterPostMessages = js.substring(postMessages, postMessages + 500);
    expect(afterPostRooms).toContain('req.user');
    expect(afterPostMessages).toContain('req.user');
  });

  it('POST endpoints validate input', () => {
    const js = compileProgram(src).javascript;
    expect(js).toContain('_validate(req.body');
  });

  it('GET endpoints do not require auth', () => {
    const js = compileProgram(src).javascript;
    const getRooms = js.indexOf("app.get('/api/rooms',");
    const nextEndpoint = js.indexOf('app.', getRooms + 10);
    const handler = js.substring(getRooms, nextEndpoint);
    expect(handler).not.toContain('req.user');
  });

  it('has try/catch error handling in every endpoint', () => {
    const js = compileProgram(src).javascript;
    const tryCount = (js.match(/try \{/g) || []).length;
    expect(tryCount >= 5).toBe(true);
  });

  it('returns 201 for POST with success message', () => {
    const js = compileProgram(src).javascript;
    expect(js).toContain('res.status(201)');
    expect(js).toContain('message');
  });

  it('has graceful shutdown', () => {
    const js = compileProgram(src).javascript;
    expect(js).toContain('SIGTERM');
    expect(js).toContain('server.close');
  });
});

// =============================================================================
// GAN APP TESTS -- Agent Apps
// =============================================================================

describe('GAN: Page analyzer agent app', () => {
  const src = `build for javascript backend

database is local memory

create a Pages table:
  url, required
  title
  link_count (number), default 0
  created_at_date, auto

agent 'Page Analyzer' receiving page_data:
  guard page_data's url is not nothing or 'URL is required'
  page_data's title is 'Analyzed'
  send back page_data

when user calls POST /api/analyze sending page_data:
  requires auth
  validate page_data:
    url is text, required
  analyzed = call 'Page Analyzer' with page_data
  saved = save analyzed as new Page
  send back saved with success message

when user calls GET /api/pages:
  all_pages = get all Pages
  send back all_pages

when user calls GET /api/health:
  send back 'ok'`;

  it('compiles with 0 errors', () => {
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
  });

  it('agent compiles to async function', () => {
    const js = compileProgram(src).javascript;
    expect(js).toContain('async function agent_page_analyzer(page_data)');
  });

  it('agent guard throws Error not res.status', () => {
    const js = compileProgram(src).javascript;
    const agentStart = js.indexOf('async function agent_page_analyzer');
    const agentEnd = js.indexOf('\n}', agentStart) + 2;
    const agentBody = js.substring(agentStart, agentEnd);
    expect(agentBody).toContain('throw new Error("URL is required")');
    expect(agentBody).not.toContain('res.status');
  });

  it('agent send back compiles to return', () => {
    const js = compileProgram(src).javascript;
    const agentStart = js.indexOf('async function agent_page_analyzer');
    const agentEnd = js.indexOf('\n}', agentStart) + 2;
    const agentBody = js.substring(agentStart, agentEnd);
    expect(agentBody).toContain('return page_data;');
  });

  it('endpoint calls agent with await', () => {
    const js = compileProgram(src).javascript;
    expect(js).toContain('await agent_page_analyzer(page_data)');
  });

  it('endpoint saves result to database', () => {
    const js = compileProgram(src).javascript;
    expect(js).toContain("db.insert('pages'");
  });

  it('does not include _askAI utility (no ask ai used)', () => {
    const js = compileProgram(src).javascript;
    expect(js).not.toContain('_askAI');
  });
});

describe('GAN: Lead scorer agent app (with ask ai)', () => {
  const src = `build for javascript backend

database is local memory

create a Leads table:
  company, required
  email, required
  score (number), default 0

agent 'Lead Scorer' receiving lead:
  guard lead's company is not nothing or 'Company is required'
  analysis = ask ai 'Rate this company on a scale of 1-10 for enterprise potential' with lead's company
  lead's score is analysis
  send back lead

when user calls POST /api/score sending lead_data:
  requires auth
  validate lead_data:
    company is text, required
    email is text, required
  scored = call 'Lead Scorer' with lead_data
  saved = save scored as new Lead
  send back saved with success message

when user calls GET /api/leads:
  all_leads = get all Leads
  send back all_leads`;

  it('compiles with 0 errors', () => {
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
  });

  it('agent compiles to async function with guard', () => {
    const js = compileProgram(src).javascript;
    expect(js).toContain('async function agent_lead_scorer(lead)');
    expect(js).toContain('throw new Error("Company is required")');
  });

  it('ask ai compiles to _askAI call with prompt and context', () => {
    const js = compileProgram(src).javascript;
    expect(js).toContain('_askAI("Rate this company');
    expect(js).toContain('lead.company');
  });

  it('includes _askAI utility with BYOK', () => {
    const js = compileProgram(src).javascript;
    expect(js).toContain('async function _askAI(prompt, context, schema)');
    expect(js).toContain('CLEAR_AI_KEY');
    expect(js).toContain('anthropic');
  });

  it('_askAI utility has error handling', () => {
    const js = compileProgram(src).javascript;
    expect(js).toContain('if (!key) throw new Error');
    expect(js).toContain('AI request failed');
  });

  it('endpoint validates both required fields', () => {
    const js = compileProgram(src).javascript;
    expect(js).toContain('"field":"company"');
    expect(js).toContain('"field":"email"');
  });
});

describe('GAN: Multi-agent pipeline', () => {
  const src = `build for javascript backend

agent 'Validator' receiving data:
  guard data's email is not nothing or 'Email required'
  send back data

agent 'Enricher' receiving data:
  summary = ask ai 'Summarize this company' with data's company
  data's summary is summary
  send back data

agent 'Scorer' receiving data:
  score = ask ai 'Score this lead 1-10 based on the summary' with data's summary
  data's score is score
  send back data

when user calls POST /api/pipeline sending incoming:
  validated = call 'Validator' with incoming
  enriched = call 'Enricher' with validated
  scored = call 'Scorer' with enriched
  send back scored`;

  it('compiles with 0 errors', () => {
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
  });

  it('creates 3 separate async agent functions', () => {
    const js = compileProgram(src).javascript;
    expect(js).toContain('async function agent_validator(data)');
    expect(js).toContain('async function agent_enricher(data)');
    expect(js).toContain('async function agent_scorer(data)');
  });

  it('pipeline chains agents in order', () => {
    const js = compileProgram(src).javascript;
    const v = js.indexOf('agent_validator(incoming)');
    const e = js.indexOf('agent_enricher(validated)');
    const s = js.indexOf('agent_scorer(enriched)');
    expect(v).toBeGreaterThan(-1);
    expect(e).toBeGreaterThan(v);
    expect(s).toBeGreaterThan(e);
  });

  it('only validator has guard, others use ask ai', () => {
    const js = compileProgram(src).javascript;
    const valStart = js.indexOf('async function agent_validator');
    const valEnd = js.indexOf('\n}', valStart);
    const valBody = js.substring(valStart, valEnd);
    expect(valBody).toContain('throw new Error');
    expect(valBody).not.toContain('_askAI');

    const enrStart = js.indexOf('async function agent_enricher');
    const enrEnd = js.indexOf('\n}', enrStart);
    const enrBody = js.substring(enrStart, enrEnd);
    expect(enrBody).toContain('_askAI');

    const scrStart = js.indexOf('async function agent_scorer');
    const scrEnd = js.indexOf('\n}', scrStart);
    const scrBody = js.substring(scrStart, scrEnd);
    expect(scrBody).toContain('_askAI');
  });

  it('includes _askAI utility exactly once', () => {
    const js = compileProgram(src).javascript;
    const matches = js.match(/async function _askAI\(/g);
    expect(matches).toHaveLength(1);
  });
});

// =============================================================================
// SCHEDULED AGENTS
// =============================================================================

describe('Scheduled agents (runs every)', () => {
  it('parses agent with runs every schedule', () => {
    const src = "build for javascript backend\nagent 'Cleanup' runs every 1 hour:\n  send back 'done'";
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    const agent = result.ast.body.find(n => n.type === 'agent');
    expect(agent.schedule).toEqual({ value: 1, unit: 'hour' });
    expect(agent.receivingVar).toBe(null);
  });

  it('compiles to setInterval with correct milliseconds', () => {
    const src = "build for javascript backend\nagent 'Check' runs every 5 minute:\n  send back 'ok'";
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('setInterval(agent_check, 300000)');
  });

  it('handles day schedule', () => {
    const src = "build for javascript backend\nagent 'Daily' runs every 1 day:\n  send back 'done'";
    const result = compileProgram(src);
    expect(result.javascript).toContain('86400000');
  });

  it('handles second schedule', () => {
    const src = "build for javascript backend\nagent 'Fast' runs every 30 second:\n  send back 'tick'";
    const result = compileProgram(src);
    expect(result.javascript).toContain('30000');
  });

  it('scheduled agent function has no parameters', () => {
    const src = "build for javascript backend\nagent 'Job' runs every 1 hour:\n  send back 'done'";
    const result = compileProgram(src);
    expect(result.javascript).toContain('async function agent_job()');
  });

  it('regular agent still requires receiving', () => {
    const src = "build for javascript backend\nagent 'Scorer' receiving data:\n  send back data";
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('async function agent_scorer(data)');
  });

  it('logs schedule info on startup', () => {
    const src = "build for javascript backend\nagent 'Report' runs every 1 day:\n  send back 'report'";
    const result = compileProgram(src);
    expect(result.javascript).toContain('Scheduled agent');
    expect(result.javascript).toContain('every 1 day');
  });
});

describe('Agent-to-agent calls (inside agent body)', () => {
  const src = `build for javascript backend

agent 'Screener' receiving candidate:
  check candidate's resume is not missing, otherwise error 'Resume required'
  send back candidate

agent 'Scorer' receiving candidate:
  set candidate's score to ask ai 'Rate 1-10' with candidate's resume
  send back candidate

agent 'Pipeline' receiving candidate:
  set screened to call 'Screener' with candidate
  set scored to call 'Scorer' with screened
  send back scored

when user calls POST /api/evaluate sending data:
  set result to call 'Pipeline' with data
  send back result`;

  it('compiles with 0 errors', () => {
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
  });

  it('Pipeline agent calls Screener then Scorer', () => {
    const js = compileProgram(src).javascript;
    const pipeStart = js.indexOf('async function agent_pipeline');
    const pipeEnd = js.indexOf('\n}', pipeStart);
    const pipeBody = js.substring(pipeStart, pipeEnd);
    expect(pipeBody).toContain('await agent_screener(candidate)');
    expect(pipeBody).toContain('await agent_scorer(screened)');
    // Screener is called before Scorer
    expect(pipeBody.indexOf('agent_screener')).toBeLessThan(pipeBody.indexOf('agent_scorer'));
  });

  it('endpoint calls Pipeline which chains the others', () => {
    const js = compileProgram(src).javascript;
    // The endpoint calls Pipeline, not Screener/Scorer directly
    const endpointSection = js.substring(js.indexOf("app.post('/api/evaluate'"));
    expect(endpointSection).toContain('agent_pipeline(');
    expect(endpointSection).not.toContain('agent_screener(');
    expect(endpointSection).not.toContain('agent_scorer(');
  });

  it('all three agent functions are async', () => {
    const js = compileProgram(src).javascript;
    expect(js).toContain('async function agent_screener');
    expect(js).toContain('async function agent_scorer');
    expect(js).toContain('async function agent_pipeline');
  });
});

describe('GAN: Support ticket classifier (agent + conditional logic)', () => {
  const src = `build for javascript backend

database is local memory

create a Tickets table:
  subject is text, required
  body is text, required
  priority
  category
  created_at is timestamp, auto

agent 'Classifier' receiving ticket:
  category = ask ai 'Classify this support ticket into one of: billing, technical, account, other' with ticket's body
  ticket's category is category
  if category is 'billing':
    ticket's priority is 'high'
  if category is 'technical':
    ticket's priority is 'medium'
  send back ticket

when user calls POST /api/tickets sending ticket_data:
  requires auth
  validate ticket_data:
    subject is text, required
    body is text, required
  classified = call 'Classifier' with ticket_data
  saved = save classified as new Ticket
  send back saved with success message

when user calls GET /api/tickets:
  all_tickets = get all Tickets
  send back all_tickets`;

  it('compiles with 0 errors', () => {
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
  });

  it('agent has conditional logic after ask ai', () => {
    const js = compileProgram(src).javascript;
    const agentStart = js.indexOf('async function agent_classifier');
    const agentEnd = js.indexOf('\n}', agentStart);
    const agentBody = js.substring(agentStart, agentEnd);
    expect(agentBody).toContain('_askAI(');
    expect(agentBody).toContain('ticket.category');
    expect(agentBody).toContain('"billing"');
    expect(agentBody).toContain('"high"');
    expect(agentBody).toContain('"technical"');
    expect(agentBody).toContain('"medium"');
  });

  it('endpoint saves classified ticket to database', () => {
    const js = compileProgram(src).javascript;
    expect(js).toContain('agent_classifier(ticket_data)');
    expect(js).toContain("db.insert('tickets'");
  });
});

describe('GAN: Content moderator (agent without database)', () => {
  const src = `build for javascript backend

agent 'Moderator' receiving post:
  verdict = ask ai 'Is this content safe for a general audience? Reply SAFE or UNSAFE and a one-line reason.' with post's content
  post's moderation_result is verdict
  send back post

when user calls POST /api/moderate sending post_data:
  moderated = call 'Moderator' with post_data
  send back moderated`;

  it('compiles with 0 errors', () => {
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
  });

  it('works without database or auth', () => {
    const js = compileProgram(src).javascript;
    expect(js).not.toContain('db.createTable');
    expect(js).not.toContain('req.user');
  });

  it('agent and endpoint are both async', () => {
    const js = compileProgram(src).javascript;
    expect(js).toContain('async function agent_moderator(post)');
    expect(js).toContain('await agent_moderator(post_data)');
  });

  it('no _pick or _validate utilities (not needed)', () => {
    const js = compileProgram(src).javascript;
    expect(js).not.toContain('function _pick');
    expect(js).not.toContain('function _validate');
  });
});

describe('GAN: Hiring pipeline (multi-agent with 3 ask ai calls)', () => {
  const src = `build for javascript backend

database is local memory

create a Candidates table:
  name is text, required
  role is text, required
  experience is text, required
  skills is text
  screening_pass
  score (number), default 0
  summary
  applied_at_date, auto

agent 'Screener' receiving candidate:
  guard candidate's name is not nothing or 'Name is required'
  result = ask ai 'Does this candidate meet minimum qualifications? Reply YES or NO.' with candidate's experience
  candidate's screening_pass is result
  send back candidate

agent 'Scorer' receiving candidate:
  evaluation = ask ai 'Rate this candidate 1-10. Reply with just the number.' with candidate's skills
  candidate's score is evaluation
  send back candidate

agent 'Summarizer' receiving candidate:
  brief = ask ai 'Write a 2-sentence hiring recommendation.' with candidate's experience
  candidate's summary is brief
  send back candidate

when user calls POST /api/apply sending candidate_data:
  validate candidate_data:
    name is text, required
    role is text, required
    experience is text, required
  screened = call 'Screener' with candidate_data
  scored = call 'Scorer' with screened
  summarized = call 'Summarizer' with scored
  saved = save summarized as new Candidate
  send back saved with success message

when user calls GET /api/candidates:
  all_candidates = get all Candidates
  send back all_candidates`;

  it('compiles with 0 errors', () => {
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
  });

  it('creates 3 agent functions', () => {
    const js = compileProgram(src).javascript;
    expect(js).toContain('async function agent_screener(candidate)');
    expect(js).toContain('async function agent_scorer(candidate)');
    expect(js).toContain('async function agent_summarizer(candidate)');
  });

  it('screener has guard + ask ai', () => {
    const js = compileProgram(src).javascript;
    const start = js.indexOf('async function agent_screener');
    const end = js.indexOf('\n}', start);
    const body = js.substring(start, end);
    expect(body).toContain('throw new Error("Name is required")');
    expect(body).toContain('_askAI(');
    expect(body).toContain('candidate.screening_pass');
  });

  it('pipeline chains all 3 agents in order', () => {
    const js = compileProgram(src).javascript;
    const s1 = js.indexOf('agent_screener(candidate_data)');
    const s2 = js.indexOf('agent_scorer(screened)');
    const s3 = js.indexOf('agent_summarizer(scored)');
    expect(s1).toBeGreaterThan(-1);
    expect(s2).toBeGreaterThan(s1);
    expect(s3).toBeGreaterThan(s2);
  });

  it('saves final result to database', () => {
    const js = compileProgram(src).javascript;
    expect(js).toContain("db.insert('candidates'");
    expect(js).toContain('_pick(summarized');
  });

  it('includes _askAI utility exactly once', () => {
    const js = compileProgram(src).javascript;
    const matches = js.match(/async function _askAI\(/g);
    expect(matches).toHaveLength(1);
  });
});

// =============================================================================
// EXPLICIT AGENT SYNTAX (canonical forms)
// =============================================================================

describe('Explicit syntax: check ... otherwise error (guard)', () => {
  it('parses check with otherwise error as guard', () => {
    const result = compileProgram("build for javascript backend\nagent 'T' receiving d:\n  check d's name is not missing, otherwise error 'Name is required'\n  send back d");
    expect(result.errors).toHaveLength(0);
    const agent = result.ast.body.find(n => n.type === 'agent');
    const guard = agent.body.find(n => n.type === 'guard');
    expect(guard).toBeDefined();
    expect(guard.message).toBe('Name is required');
  });

  it('compiles check to throw inside agent', () => {
    const result = compileProgram("build for javascript backend\nagent 'T' receiving d:\n  check d's name is not missing, otherwise error 'Name is required'\n  send back d");
    expect(result.errors).toHaveLength(0);
    const js = result.javascript;
    const agentStart = js.indexOf('async function agent_t');
    const agentEnd = js.indexOf('\n}', agentStart) + 2;
    const agentBody = js.substring(agentStart, agentEnd);
    expect(agentBody).toContain('throw new Error("Name is required")');
  });

  it('compiles check to res.status in endpoint', () => {
    const result = compileProgram("build for javascript backend\nwhen user calls POST /api/t sending d:\n  check d's name is not missing, otherwise error 'Name is required'\n  send back d");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('Name is required');
  });

  it('old guard syntax still works as alias', () => {
    const result = compileProgram("build for javascript backend\nagent 'T' receiving d:\n  guard d's name is not nothing or 'Name is required'\n  send back d");
    expect(result.errors).toHaveLength(0);
    const agent = result.ast.body.find(n => n.type === 'agent');
    const guard = agent.body.find(n => n.type === 'guard');
    expect(guard).toBeDefined();
  });
});

describe('Explicit syntax: missing as synonym for nothing', () => {
  it('parses "is missing" as equality check with nothing', () => {
    const result = compileProgram("build for javascript backend\nagent 'T' receiving d:\n  if d's name is missing:\n    send back d\n  send back d");
    expect(result.errors).toHaveLength(0);
  });

  it('parses "is not missing" in conditions', () => {
    const result = compileProgram("build for javascript backend\nagent 'T' receiving d:\n  check d's name is not missing, otherwise error 'Required'\n  send back d");
    expect(result.errors).toHaveLength(0);
  });
});

describe('Explicit syntax: set X to call (agent invocation)', () => {
  it('parses set X to call agent with data', () => {
    const result = compileProgram("build for javascript backend\nagent 'Scorer' receiving d:\n  send back d\nwhen user calls POST /api/t sending data:\n  set result to call 'Scorer' with data\n  send back result");
    expect(result.errors).toHaveLength(0);
    const ep = result.ast.body.find(n => n.type === 'endpoint');
    const assign = ep.body.find(n => n.type === 'assign');
    expect(assign.expression.type).toBe('run_agent');
    expect(assign.expression.agentName).toBe('Scorer');
  });

  it('compiles set X to call to await', () => {
    const result = compileProgram("build for javascript backend\nagent 'Scorer' receiving d:\n  send back d\nwhen user calls POST /api/t sending data:\n  set result to call 'Scorer' with data\n  send back result");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('await agent_scorer(data)');
  });

  it('old call syntax still works as alias', () => {
    const result = compileProgram("build for javascript backend\nagent 'Scorer' receiving d:\n  send back d\nwhen user calls POST /api/t sending data:\n  result = call 'Scorer' with data\n  send back result");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('await agent_scorer(data)');
  });
});

describe('Explicit syntax: set X to ask ai', () => {
  it('parses set X to ask ai with prompt and context', () => {
    const result = compileProgram("build for javascript backend\nagent 'T' receiving d:\n  set answer to ask ai 'Summarize this' with d\n  send back answer");
    expect(result.errors).toHaveLength(0);
    const agent = result.ast.body.find(n => n.type === 'agent');
    const assign = agent.body.find(n => n.type === 'assign');
    expect(assign.expression.type).toBe('ask_ai');
    expect(assign.expression.prompt.value).toBe('Summarize this');
  });

  it('compiles set X to ask ai', () => {
    const result = compileProgram("build for javascript backend\nagent 'T' receiving d:\n  set answer to ask ai 'Summarize' with d\n  send back answer");
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('_askAI("Summarize"');
  });
});

// =============================================================================
// STRUCTURED AI OUTPUT (ask ai ... returning:)
// =============================================================================

// =============================================================================
// SCRIPT BLOCK (raw JS escape hatch)
// =============================================================================

// =============================================================================
// USE FROM (external JS imports)
// =============================================================================

// =============================================================================
// STORE / RESTORE (localStorage)
// =============================================================================

describe('store / restore (localStorage)', () => {
  it('parses store variable', () => {
    const src = "build for web\npage 'T' at '/':\n  x is 5\n  store x";
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
  });

  it('parses restore variable', () => {
    const src = "build for web\npage 'T' at '/':\n  x is 5\n  restore x";
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
  });

  it('compiles store to localStorage.setItem', () => {
    const src = "build for web\npage 'T' at '/':\n  prefs is 'dark'\n  button 'Save':\n    store prefs";
    const result = compileProgram(src);
    expect(result.html).toContain('localStorage.setItem("prefs"');
    expect(result.html).toContain('JSON.stringify');
  });

  it('compiles restore to localStorage.getItem', () => {
    const src = "build for web\npage 'T' at '/':\n  prefs is 'dark'\n  restore prefs";
    const result = compileProgram(src);
    expect(result.html).toContain('localStorage.getItem("prefs"');
    expect(result.html).toContain('JSON.parse');
  });

  it('supports custom key with as', () => {
    const src = "build for web\npage 'T' at '/':\n  settings is 'default'\n  store settings as 'user-prefs'\n  restore settings as 'user-prefs'";
    const result = compileProgram(src);
    expect(result.html).toContain('"user-prefs"');
  });

  it('wraps in try-catch for safety', () => {
    const src = "build for web\npage 'T' at '/':\n  x is 1\n  store x\n  restore x";
    const result = compileProgram(src);
    const storeCount = (result.html.match(/try \{/g) || []).length;
    expect(storeCount >= 2).toBe(true);
  });
});

describe('use from (external JS import)', () => {
  it('parses use with from path', () => {
    const src = "build for web\nuse 'compiler' from '../index.js'\npage 'T' at '/':\n  text 'hi'";
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    const useNode = result.ast.body.find(n => n.type === 'use');
    expect(useNode.module).toBe('compiler');
    expect(useNode.source).toBe('../index.js');
  });

  it('compiles to dynamic import', () => {
    const src = "build for web\nuse 'compiler' from '../index.js'\npage 'T' at '/':\n  text 'hi'";
    const result = compileProgram(src);
    expect(result.html).toContain('await import("../index.js")');
  });

  it('allows calling imported functions via possessive', () => {
    const src = "build for web\nuse 'lib' from './lib.js'\npage 'T' at '/':\n  result is ''\n  button 'Go':\n    set result to lib's doThing(result)";
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('lib.doThing');
  });

  it('plain use without from still works', () => {
    const src = "build for javascript backend\nuse 'helpers'\nshow 42";
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain("from './helpers.js'");
    expect(result.javascript).not.toContain('await import');
  });
});

describe('script: block (raw JavaScript)', () => {
  it('parses script block with indented code', () => {
    const src = `build for web
page 'Test' at '/':
  script:
    console.log('hello');`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    const scriptNode = result.ast.body.find(n => n.type === 'page').body.find(n => n.type === 'script');
    expect(scriptNode).toBeDefined();
    expect(scriptNode.code).toContain("console.log('hello')");
  });

  it('emits raw JS in compiled output', () => {
    const src = `build for web
page 'Test' at '/':
  script:
    document.title = 'Custom';`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain("document.title = 'Custom'");
  });

  it('works inside button handlers', () => {
    const src = `build for web
page 'Test' at '/':
  button 'Run':
    script:
      alert('clicked');`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain("alert('clicked')");
  });

  it('preserves multi-line code', () => {
    const src = `build for web
page 'Test' at '/':
  script:
    const x = 1;
    const y = 2;
    console.log(x + y);`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('const x = 1');
    expect(result.html).toContain('const y = 2');
    expect(result.html).toContain('console.log(x + y)');
  });

  it('errors on empty script block', () => {
    const src = `build for web
page 'Test' at '/':
  script:
  text 'after'`;
    const result = compileProgram(src);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('empty');
  });

  it('works in backend endpoints', () => {
    const src = `build for javascript backend
when user calls GET /api/test:
  script:
    const custom = require('some-lib');
  send back 'ok'`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain("require('some-lib')");
  });
});

describe('Structured AI output (ask ai returning:)', () => {
  it('parses schema fields with types', () => {
    const src = `build for javascript backend
agent 'T' receiving d:
  set result to ask ai 'Analyze' with d returning:
    score (number)
    reasoning
    qualified (boolean)
  send back result`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    const agent = result.ast.body.find(n => n.type === 'agent');
    const assign = agent.body.find(n => n.type === 'assign');
    expect(assign.expression.schema).toHaveLength(3);
    expect(assign.expression.schema[0]).toEqual({ name: 'score', type: 'number' });
    expect(assign.expression.schema[1]).toEqual({ name: 'reasoning', type: 'text' });
    expect(assign.expression.schema[2]).toEqual({ name: 'qualified', type: 'boolean' });
  });

  it('compiles schema as 3rd argument to _askAI', () => {
    const src = `build for javascript backend
agent 'T' receiving d:
  set result to ask ai 'Test' with d returning:
    score (number)
    reasoning
  send back result`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    const js = result.javascript;
    expect(js).toContain('_askAI("Test", d, [{"name":"score","type":"number"},{"name":"reasoning","type":"text"}])');
  });

  it('allows accessing returned object properties', () => {
    const src = `build for javascript backend
agent 'T' receiving d:
  set result to ask ai 'Score this' with d returning:
    score (number)
    reason
  d's score is result's score
  d's reason is result's reason
  send back d`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('d.score = result.score');
    expect(result.javascript).toContain('d.reason = result.reason');
  });

  it('works without context (ask ai with no with)', () => {
    const src = `build for javascript backend
agent 'T' receiving d:
  set result to ask ai 'Generate a rating' returning:
    score (number)
    comment
  send back result`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('_askAI("Generate a rating", null, ');
  });

  it('_askAI utility includes schema handling', () => {
    const src = `build for javascript backend
agent 'T' receiving d:
  set result to ask ai 'Test' with d returning:
    score (number)
  send back result`;
    const result = compileProgram(src);
    const js = result.javascript;
    // Utility should have schema-aware prompt building
    expect(js).toContain('if (schema)');
    // Utility should parse JSON response
    expect(js).toContain('parseResult');
  });

  it('supports list type in schema', () => {
    const src = `build for javascript backend
agent 'T' receiving d:
  set result to ask ai 'Analyze' with d returning:
    tags (list)
    score (number)
  send back result`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('"type":"list"');
  });

  it('errors on empty returning block', () => {
    const src = `build for javascript backend
agent 'T' receiving d:
  set result to ask ai 'Test' with d returning:
  send back result`;
    const result = compileProgram(src);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('returning:');
  });

  it('plain ask ai still returns string (no schema)', () => {
    const src = `build for javascript backend
agent 'T' receiving d:
  set answer to ask ai 'Summarize' with d
  send back answer`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    // No schema argument
    expect(result.javascript).toContain('_askAI("Summarize", d)');
    expect(result.javascript).not.toContain('_askAI("Summarize", d, ');
  });
});

describe('Explicit syntax: full agent with new canonical forms', () => {
  it('compiles a full agent using all new canonical forms', () => {
    const src = `build for javascript backend

database is local memory

create a Leads table:
  company, required
  email, required
  score (number), default 0

agent 'Lead Scorer' receiving lead:
  check lead's company is not missing, otherwise error 'Company is required'
  set analysis to ask ai 'Rate 1-10' with lead's company
  lead's score is analysis
  send back lead

when user calls POST /api/score sending lead_data:
  validate lead_data:
    company is text, required
    email is text, required
  set scored to call 'Lead Scorer' with lead_data
  set saved to save scored as new Lead
  send back saved with success message`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('async function agent_lead_scorer(lead)');
    expect(result.javascript).toContain('throw new Error("Company is required")');
    expect(result.javascript).toContain('_askAI("Rate 1-10"');
    expect(result.javascript).toContain('agent_lead_scorer(lead_data)');
  });
});

describe('Table action buttons - parsing', () => {
  it('parses "with delete" on display table', () => {
    const ast = parse("page 'App':\n  display contacts as table showing name, email with delete");
    expect(ast.errors).toHaveLength(0);
    const disp = ast.body[0].body[0];
    expect(disp.columns).toEqual(['name', 'email']);
    expect(disp.actions).toEqual(['delete']);
  });

  it('parses "with edit" on display table', () => {
    const ast = parse("page 'App':\n  display contacts as table showing name, email with edit");
    expect(ast.errors).toHaveLength(0);
    const disp = ast.body[0].body[0];
    expect(disp.actions).toEqual(['edit']);
  });

  it('parses "with delete and edit" on display table', () => {
    const ast = parse("page 'App':\n  display contacts as table showing name, email with delete and edit");
    expect(ast.errors).toHaveLength(0);
    const disp = ast.body[0].body[0];
    expect(disp.actions).toEqual(['delete', 'edit']);
  });

  it('no actions when "with" is absent', () => {
    const ast = parse("page 'App':\n  display contacts as table showing name, email");
    expect(ast.errors).toHaveLength(0);
    const disp = ast.body[0].body[0];
    expect(disp.actions).toBe(undefined);
  });

  it('parses "with delete" without showing clause', () => {
    const ast = parse("page 'App':\n  display contacts as table with delete");
    expect(ast.errors).toHaveLength(0);
    const disp = ast.body[0].body[0];
    expect(disp.columns).toBe(null);
    expect(disp.actions).toEqual(['delete']);
  });

  it('columns do not include with/delete/edit tokens', () => {
    const ast = parse("page 'App':\n  display contacts as table showing name, email with delete and edit");
    expect(ast.errors).toHaveLength(0);
    const disp = ast.body[0].body[0];
    expect(disp.columns).toEqual(['name', 'email']);
    expect(disp.columns).not.toContain('with');
    expect(disp.columns).not.toContain('delete');
    expect(disp.columns).not.toContain('edit');
  });
});

describe('Table action buttons - compilation', () => {
  it('renders delete buttons when "with delete" and DELETE endpoint exist', () => {
    const src = `build for web and javascript backend
database is local memory
create a Contacts table:
  name, required
  email, required
when user calls GET /api/contacts:
  all_contacts = get all Contacts
  send back all_contacts
when user calls DELETE /api/contacts/:id:
  requires auth
  delete the Contact with this id
  send back 'deleted' with success message
page 'App' at '/':
  on page load get contacts from '/api/contacts'
  display contacts as table showing name, email with delete`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('data-delete-id');
    expect(result.javascript).toContain("method: 'DELETE'");
  });

  it('does NOT render delete buttons without "with delete"', () => {
    const src = `build for web and javascript backend
database is local memory
create a Contacts table:
  name, required
  email, required
when user calls GET /api/contacts:
  all_contacts = get all Contacts
  send back all_contacts
when user calls DELETE /api/contacts/:id:
  requires auth
  delete the Contact with this id
  send back 'deleted' with success message
page 'App' at '/':
  on page load get contacts from '/api/contacts'
  display contacts as table showing name, email`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).not.toContain('data-delete-id');
  });

  it('renders edit buttons when "with edit" and PUT endpoint exist', () => {
    const src = `build for web and javascript backend
database is local memory
create a Contacts table:
  name, required
  email, required
when user calls GET /api/contacts:
  all_contacts = get all Contacts
  send back all_contacts
when user calls PUT /api/contacts/:id sending contact_data:
  requires auth
  save contact_data to Contacts
  send back contact_data with success message
page 'App' at '/':
  on page load get contacts from '/api/contacts'
  'Name' is a text input saved as a name
  display contacts as table showing name, email with edit`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('data-edit-id');
    expect(result.javascript).toContain('_editing_id');
  });

  it('auto-upserts POST to PUT when _editing_id is set', () => {
    const src = `build for web and javascript backend
database is local memory
create a Contacts table:
  name, required
  email, required
when user calls GET /api/contacts:
  all_contacts = get all Contacts
  send back all_contacts
when user calls POST /api/contacts sending contact_data:
  new_contact = save contact_data as new Contact
  send back new_contact with success message
when user calls PUT /api/contacts/:id sending contact_data:
  requires auth
  save contact_data to Contacts
  send back contact_data with success message
page 'App' at '/':
  on page load get contacts from '/api/contacts'
  'Name' is a text input saved as a name
  'Email' is a text input saved as an email
  button 'Save':
    send name and email to '/api/contacts'
    get contacts from '/api/contacts'
  display contacts as table showing name, email with edit`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('_state._editing_id');
    expect(result.javascript).toContain("method: 'PUT'");
  });

  it('does NOT add _editing_id to state without "with edit"', () => {
    const src = `build for web and javascript backend
database is local memory
create a Contacts table:
  name, required
when user calls GET /api/contacts:
  all_contacts = get all Contacts
  send back all_contacts
when user calls PUT /api/contacts/:id sending contact_data:
  requires auth
  save contact_data to Contacts
  send back contact_data with success message
page 'App' at '/':
  on page load get contacts from '/api/contacts'
  display contacts as table showing name`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).not.toContain('_editing_id');
  });
});

describe('Table action buttons - validation', () => {
  it('warns when "with delete" but no DELETE endpoint', () => {
    const src = `build for web and javascript backend
database is local memory
create a Contacts table:
  name, required
when user calls GET /api/contacts:
  all_contacts = get all Contacts
  send back all_contacts
page 'App' at '/':
  on page load get contacts from '/api/contacts'
  display contacts as table showing name with delete`;
    const result = compileProgram(src);
    expect(result.warnings.some(w => w.includes('no DELETE endpoint'))).toBe(true);
  });

  it('warns when "with edit" but no PUT/PATCH endpoint', () => {
    const src = `build for web and javascript backend
database is local memory
create a Contacts table:
  name, required
when user calls GET /api/contacts:
  all_contacts = get all Contacts
  send back all_contacts
page 'App' at '/':
  on page load get contacts from '/api/contacts'
  display contacts as table showing name with edit`;
    const result = compileProgram(src);
    expect(result.warnings.some(w => w.includes('no PUT or PATCH endpoint'))).toBe(true);
  });

  it('no warning when endpoints match actions', () => {
    const src = `build for web and javascript backend
database is local memory
create a Contacts table:
  name, required
when user calls GET /api/contacts:
  all_contacts = get all Contacts
  send back all_contacts
when user calls DELETE /api/contacts/:id:
  requires auth
  delete the Contact with this id
  send back 'deleted' with success message
page 'App' at '/':
  on page load get contacts from '/api/contacts'
  display contacts as table showing name with delete`;
    const result = compileProgram(src);
    expect(result.warnings.filter(w => w.includes('DELETE endpoint'))).toHaveLength(0);
  });
});

// =============================================================================
// PHASE 30: CLIENT VALIDATION, LOADING STATE, ERROR DISPLAY
// =============================================================================

describe('Phase 30 - client-side validation before fetch', () => {
  it('adds validation checks for POST fields', () => {
    const src = `build for web and javascript backend
database is local memory
create a Todos table:
  todo, required
when user calls POST /api/todos sending todo_data:
  new_todo = save todo_data as new Todo
  send back new_todo with success message
page 'App' at '/':
  'Task' is a text input saved as a todo
  button 'Add':
    send todo to '/api/todos'`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain("_toast('todo is required'");
    expect(result.javascript).toContain("return;");
  });

  it('does not add validation for buttons without POST', () => {
    const src = `build for web
page 'App' at '/':
  count = 0
  button 'Inc':
    increase count by 1`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).not.toContain('_toast');
  });
});

describe('Phase 30 - loading state on buttons', () => {
  it('disables button and shows Loading during async', () => {
    const src = `build for web and javascript backend
database is local memory
create a Todos table:
  todo, required
when user calls GET /api/todos:
  all_todos = get all Todos
  send back all_todos
page 'App' at '/':
  'Task' is a text input saved as a todo
  button 'Add':
    send todo to '/api/todos'
    get todos from '/api/todos'`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('_btn.disabled = true');
    expect(result.javascript).toContain('loading loading-spinner');
    expect(result.javascript).toContain('_btn.disabled = false');
  });
});

describe('Phase 30 - error display on fetch failure', () => {
  it('checks response status and throws on error', () => {
    const src = `build for web and javascript backend
database is local memory
create a Todos table:
  todo, required
when user calls POST /api/todos sending todo_data:
  new_todo = save todo_data as new Todo
  send back new_todo with success message
page 'App' at '/':
  'Task' is a text input saved as a todo
  button 'Add':
    send todo to '/api/todos'`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('if (!_r.ok)');
    expect(result.javascript).toContain('throw new Error');
  });

  it('wraps async button body in try/catch with toast', () => {
    const src = `build for web and javascript backend
database is local memory
create a Todos table:
  todo, required
when user calls POST /api/todos sending todo_data:
  new_todo = save todo_data as new Todo
  send back new_todo with success message
page 'App' at '/':
  'Task' is a text input saved as a todo
  button 'Add':
    send todo to '/api/todos'`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain("catch(_err)");
    expect(result.javascript).toContain("_toast(_err.message");
  });
});

// =============================================================================
// CHART SYNTAX (ECharts)
// =============================================================================

describe('Chart syntax - parsing', () => {
  it('parses chart as line showing data', () => {
    const ast = parse("page 'App':\n  chart 'Revenue' as line showing sales");
    expect(ast.errors).toHaveLength(0);
    const chart = ast.body[0].body[0];
    expect(chart.type).toBe(NodeType.CHART);
    expect(chart.title).toBe('Revenue');
    expect(chart.chartType).toBe('line');
    expect(chart.dataVar).toBe('sales');
  });

  it('parses chart as pie showing data by field', () => {
    const ast = parse("page 'App':\n  chart 'Status' as pie showing tasks by status");
    expect(ast.errors).toHaveLength(0);
    const chart = ast.body[0].body[0];
    expect(chart.chartType).toBe('pie');
    expect(chart.groupBy).toBe('status');
  });

  it('parses chart as bar and area types', () => {
    const ast = parse("page 'App':\n  chart 'Sales' as bar showing data");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].body[0].chartType).toBe('bar');

    const ast2 = parse("page 'App':\n  chart 'Trend' as area showing data");
    expect(ast2.errors).toHaveLength(0);
    expect(ast2.body[0].body[0].chartType).toBe('area');
  });

  it('rejects unknown chart type', () => {
    const ast = parse("page 'App':\n  chart 'X' as donut showing data");
    expect(ast.errors.length).toBeGreaterThan(0);
    expect(ast.errors[0].message).toContain('Unknown chart type');
  });
});

describe('Chart syntax - compilation', () => {
  it('compiles chart to ECharts init + option', () => {
    const src = `build for web and javascript backend
database is local memory
create a Sales table:
  region, required
  revenue (number), required
when user calls GET /api/sales:
  all_sales = get all Sales
  send back all_sales
page 'App' at '/':
  on page load get sales from '/api/sales'
  chart 'Revenue' as bar showing sales`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('echarts');
    expect(result.html).toContain('chart_Revenue');
    expect(result.javascript).toContain('echarts.init');
    expect(result.javascript).toContain("type: 'bar'");
  });

  it('compiles pie chart with groupBy', () => {
    const src = `build for web and javascript backend
database is local memory
create a Tasks table:
  title, required
  status, default 'todo'
when user calls GET /api/tasks:
  all_tasks = get all Tasks
  send back all_tasks
page 'App' at '/':
  on page load get tasks from '/api/tasks'
  chart 'Status' as pie showing tasks by status`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain("type: 'pie'");
    expect(result.javascript).toContain('_counts');
  });

  it('does not include ECharts CDN when no chart nodes', () => {
    const src = `build for web
page 'App' at '/':
  heading 'Hello'`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.html).not.toContain('echarts');
  });
});

run();
