# Plan: General-Purpose Language Features
**Date:** 2026-04-09
**Branch:** `feature/general-purpose-v1`
**Log tag:** `[GP-LANG]`

Five features in priority order that make Clear a real general-purpose language:

1. **Map iteration** — `for each key, value in scores:` + `keys of X` / `values of X` / `key exists in X`
2. **String interpolation (expressions)** — extend existing `{var}` to `{price * quantity}` and `{person's name}`
3. **First-class functions** — `apply fn to each in list` / `filter list using fn` / `sort list using fn`
4. **Type annotations** — `define function greet(name is text):` + `returns number` hint + compiler warnings
5. **Typed error handling** — `if there's a 'not found' error:` multi-clause try/catch

---

## Section 0: Before Starting

- Branch: `feature/general-purpose-v1` ✅
- Baseline: `node clear.test.js` → confirm 1489 passing
- Log tag: `[GP-LANG]`

---

## Section 1: Existing Code — Phased Reading

### Always read first:
| File | Why |
|------|-----|
| `intent.md` | Authoritative node type list — update at end of each phase |
| `learnings.md` TOC | Catch known gotchas |

### Phase 1 (Map iteration):
| File | Lines | Why |
|------|-------|-----|
| `parser.js` | ~3157 | `parseForEachLoop` — add two-variable detection |
| `parser.js` | ~5984 | `parseAssignment` / expression parser — add `keys of`, `values of`, `key exists in` |
| `compiler.js` | ~3105 | `FOR_EACH` case — emit `Object.entries`/`Object.keys` |
| `synonyms.js` | all | Check `keys`, `values`, `exists` for collisions |

### Phase 2 (String interpolation expressions):
| File | Lines | Why |
|------|-------|-----|
| `parser.js` | ~6586 | `parsePrimary` — where STRING tokens become LITERAL_STRING nodes |
| `compiler.js` | ~4102 | `LITERAL_STRING` case in `exprToCode` — extend from regex to parsed parts |
| `tokenizer.js` | ~140 | String scanning loop — understand how `{` is treated inside strings |

### Phase 3 (First-class functions):
| File | Lines | Why |
|------|-------|-----|
| `parser.js` | ~1000 | `parseBlock` dispatch / `parseAssignment` — add `apply`, `filter using`, `sort using` |
| `compiler.js` | ~3875 | `LIST_SORT` case — extend with custom comparator |
| `synonyms.js` | all | **CRITICAL:** `using` maps to canonical `with` (line 80). `filter` maps to canonical `filter_where` (line 342). All checks must use `.value` not `.canonical` for these tokens. |

### Phase 4 (Type annotations):
| File | Lines | Why |
|------|-------|-----|
| `parser.js` | ~2255 | `parseFunctionDef` — extend param parsing to detect `name is type` |
| `compiler.js` | ~2984 | `FUNCTION_DEF` case — emit JSDoc comments |
| `validator.js` | all | Add call-site type warning |

### Phase 5 (Typed error handling):
| File | Lines | Why |
|------|-------|-----|
| `parser.js` | ~5475 | `parseTryHandle` — add multi-clause error handler parsing |
| `compiler.js` | ~3134 | `TRY_HANDLE` case — emit multi-branch catch |
| `synonyms.js` | all | Verify `if_error` canonical |

---

## Section 2: What We're Building

### Phase 1: Map Iteration

**Before** (broken — objects aren't iterable in JS):
```clear
scores is create:
  alice = 95
  bob = 87
for each key in scores:   # throws "scores is not iterable"
  show key
```

**After:**
```clear
# Iterate keys only
for each key in keys of scores:
  show key

# Iterate keys and values together
for each key, value in scores:
  show key + ' scored ' + value

# Check existence
found = 'alice' exists in scores

# Extract all keys / values
all_keys = keys of scores
all_values = values of scores
```

**Compilation targets:**

| Clear | JS | Python |
|-------|----|--------|
| `for each key, value in scores:` | `for (const [key, value] of Object.entries(scores))` | `for key, value in scores.items():` |
| `for each key in keys of scores:` | `for (const key of Object.keys(scores))` | `for key in scores.keys():` |
| `keys of scores` | `Object.keys(scores)` | `list(scores.keys())` |
| `values of scores` | `Object.values(scores)` | `list(scores.values())` |
| `'alice' exists in scores` | `'alice' in scores` | `'alice' in scores` |

**Decisions:**
- `for each key, value in X:` — two-variable FOR_EACH → always means map entries. Disambiguated by syntax (comma between vars).
- `keys of X` / `values of X` — new expression node types `MAP_KEYS` / `MAP_VALUES`. Detected in `parseAssignment` right side and `parsePrimary`.
- `X exists in Y` — new expression type `MAP_EXISTS`. Detected in expression parser.
- `for each key in keys of scores:` — composes existing FOR_EACH with new `MAP_KEYS` expression. No new node needed — `keys of scores` just evaluates to an array.
- Single-var `for each x in obj:` — keep existing behavior. No breaking change.

### Phase 2: String Interpolation (Expressions)

**Already works:**
```clear
greeting is 'Hello {name}!'          # simple var — works today
```

**Doesn't work today:**
```clear
summary is 'Total: {price * quantity}'     # expression — broken
greeting is 'Hello {person's name}!'       # member access — broken
label is 'Score: {scores's alice}'         # possessive — broken
```

**Approach:**
- Keep tokenizer unchanged — string stored as raw text
- In `parsePrimary`, when a STRING token contains `{`, scan for `{...}` pairs, tokenize the inner content, parse as expression
- LITERAL_STRING node gets `parts` property: `[{ text: 'Total: ' }, { expr: binaryOpNode }, { text: '' }]`
- Compiler: if `node.parts` exists, emit template literal from parts (JS) or f-string parts (Python)
- Fallback: if `parts` is absent (no `{`), existing behavior unchanged

**Inner expression parsing:**
```js
// In parsePrimary, after creating STRING token:
function parseStringParts(rawStr, lineNum, errors) {
  const parts = [];
  let i = 0;
  while (i < rawStr.length) {
    const open = rawStr.indexOf('{', i);
    if (open === -1) { parts.push({ text: rawStr.slice(i) }); break; }
    if (open > i) parts.push({ text: rawStr.slice(i, open) });
    const close = rawStr.indexOf('}', open + 1);
    if (close === -1) { parts.push({ text: rawStr.slice(open) }); break; }
    const inner = rawStr.slice(open + 1, close);
    const innerTokens = tokenizeLine(inner, lineNum);  // tokenizer.js export
    const expr = parseExpression(innerTokens, 0, lineNum);
    if (expr.error) {
      errors.push({ line: lineNum, message: `String interpolation error in {${inner}}: ${expr.error}` });
      parts.push({ text: '{' + inner + '}' }); // fallback: keep as-is
    } else {
      parts.push({ expr: expr.node });
    }
    i = close + 1;
  }
  return parts;
}
```

**Compiler output:**
- JS: `` `Hello ${exprToCode(part.expr, ctx)}!` ``
- Python: `f"Hello {exprToCode(part.expr, ctx)}!"` — but Python f-strings need the expression in `{}` directly. For complex expressions, emit as string concatenation instead: `"Hello " + str(expr) + "!"`

### Phase 3: First-Class Functions

**New syntax:**
```clear
# Apply a function to every item, get back a list
doubled = apply double to each in numbers

# Filter a list using a function
active_users = filter users using is_active

# Sort using a custom comparator function
sorted_items = sort items using compare_by_price

# Pass a function as an argument (already works in JS — just needs validation)
result = transform(data, normalize)
```

**New node types:**
- `MAP_APPLY` — `apply fn to each in list` → `list.map(fn)` / `[fn(x) for x in list]`
- `FILTER_APPLY` — `filter list using fn` → `list.filter(fn)` / `[x for x in list if fn(x)]`
- `SORT_APPLY` — `sort list using fn` → `list.sort(fn)` / `list.sort(key=fn)` (extends LIST_SORT)

**Function references in expressions:**
- Function names already compile to JS identifiers. Passing them as args (`transform(data, double)`) already works in JS.
- Validator currently doesn't know if `double` is a function or a variable — add function tracking to declared set with a `_fn_` prefix so validator can give better errors.

**Decisions:**
- `apply fn to each in list` — new line-level statement OR assignment right-side. Detect in `parseAssignment`.
- `filter list using fn` — assignment right-side. Detect in `parseAssignment`.
- `sort list using fn` — statement (mutates in place). Detect in `parseBlock` dispatch.
- All three are **assignment forms** — they return a value. `sort list using fn` modifies in place in Python but returns new array in JS — emit consistently: assign result.

### Phase 4: Type Annotations

**New syntax:**
```clear
define function greet(name is text):
  show 'Hello ' + name

define function add(a is number, b is number) returns number:
  return a + b

define function process(items is list) returns list:
  return items
```

**What it does:**
- Param types stored on FUNCTION_DEF node: `params: [{ name: 'name', type: 'text' }]`
- Compiler emits JSDoc: `/** @param {string} name @returns {number} */`
- Validator: when calling a typed function with a literal of wrong type — `WARN` (not error)
- No runtime type checking generated — compile-time hints only
- Types: `text` → `string`, `number` → `number`, `list` → `Array`, `boolean` → `boolean`, `map` → `object`

**Breaking change risk:** `parseFunctionDef` currently collects params as plain strings. Changing to `[{ name, type }]` objects would break any compiler code that reads `param` as a string. Fix: normalize to objects early, keep `.name` property. All existing reads of `params[i]` as string become `params[i].name`. Grep all usages before touching.

### Phase 5: Typed Error Handling

**New syntax:**
```clear
try:
  result = call api 'https://api.example.com/data':
    method is 'GET'
if there's a 'not found' error:
  show 'Resource not found'
if there's a 'permission' error:
  show 'Access denied'
if there's an error:
  show 'Something went wrong: ' + error's message
```

**Error type → condition mapping:**
| Type string | JS check | Python check |
|-------------|----------|--------------|
| `'not found'` | `e.status === 404 \|\| e.message?.includes('not found')` | `'404' in str(e) or 'not found' in str(e).lower()` |
| `'permission'` / `'forbidden'` | `e.status === 403 \|\| e.status === 401` | `'403' in str(e) or '401' in str(e)` |
| `'validation'` / `'invalid'` | `e.status === 400` | `'400' in str(e)` |
| `'server'` | `e.status >= 500` | `int(str(e)[:3] or 0) >= 500` |
| any other string | `e.message?.toLowerCase().includes(type)` | `type.lower() in str(e).lower()` |
| no type (catch-all) | `true` (final else) | `True` |

**Node change:** `TRY_HANDLE` gets `handlers: [{ errorType: string|null, body: [...] }]` instead of flat `handleBody`. The `null` errorType is the catch-all (existing behavior). Multiple typed handlers come first, catch-all last.

**Parser:** After parsing try body, loop collecting `if there's a X error:` clauses at same indent. Stop when line isn't an error handler.

---

## Section 3: Data Flow

### Map Iteration
```
Source: for each key, value in scores:
  → parseForEachLoop detects TWO variables before 'in' (comma separator)
  → FOR_EACH node { variable: 'key', variable2: 'value', iterable: varRef('scores'), body }
  → Compiler: for (const [key, value] of Object.entries(scores)) { ... }

Source: all_keys = keys of scores
  → parseAssignment RHS → parsePrimary detects 'keys' + 'of' token sequence
  → MAP_KEYS node { source: varRef('scores') }
  → Compiler: Object.keys(scores)

Source: found = 'alice' exists in scores
  → parseExpression: after parsing 'alice', detects 'exists' + 'in' tokens
  → MAP_EXISTS node { key: literal('alice'), map: varRef('scores') }
  → Compiler: ('alice' in scores)
```

### String Interpolation
```
Source: summary is 'Total: {price * quantity}'
  → Tokenizer: STRING token, value = 'Total: {price * quantity}'
  → parsePrimary: STRING contains '{' → call parseStringParts()
    → tokenizeLine('price * quantity', line) → [price, *, quantity]
    → parseExpression → BINARY_OP(price, *, quantity)
  → LITERAL_STRING node { value: '...', parts: [{ text: 'Total: ' }, { expr: BINARY_OP }] }
  → Compiler exprToCode LITERAL_STRING: parts present
    → JS: `Total: ${price * quantity}`
    → Python: "Total: " + str(price * quantity)
```

### First-Class Functions
```
Source: doubled = apply double to each in numbers
  → parseAssignment RHS: first token 'apply' → MAP_APPLY node { fn: 'double', list: 'numbers' }
  → Compiler: numbers.map(double)   (JS)
              [double(x) for x in numbers]  (Python)

Source: active = filter users using is_active
  → parseAssignment RHS: FILTER_APPLY node { fn: 'is_active', list: 'users' }
  → Compiler: users.filter(is_active)
              [x for x in users if is_active(x)]
```

### Type Annotations
```
Source: define function add(a is number, b is number) returns number:
  → parseFunctionDef: params = [{ name: 'a', type: 'number' }, { name: 'b', type: 'number' }]
  → returnType = 'number'
  → FUNCTION_DEF node { name: 'add', params: [{name,type}], returnType: 'number', body }
  → Compiler: /** @param {number} a @param {number} b @returns {number} */
              function add(a, b) { ... }
```

### Typed Error Handling
```
Source: try: / ... / if there's a 'not found' error: / ... / if there's an error: / ...
  → parseTryHandle: loop collecting handlers until no more if_error lines
  → TRY_HANDLE { tryBody, handlers: [
      { errorType: 'not found', body: [...] },
      { errorType: null, body: [...] }
    ]}
  → Compiler JS:
    try { ... }
    catch (error) {
      if (error.status === 404 || error.message?.includes('not found')) { ... }
      else { ... }
    }
```

---

## Section 4: Integration Points

| Producer | Consumer | Format |
|----------|----------|--------|
| `parseForEachLoop` | FOR_EACH compiler | `node.variable2` (string or undefined) |
| `parsePrimary` (STRING) | `exprToCode` LITERAL_STRING | `node.parts: [{text}|{expr}][]` or absent |
| `parseAssignment` | MAP_APPLY/FILTER_APPLY compiler | new node types |
| `parseFunctionDef` | FUNCTION_DEF compiler | `params: [{name, type}]` instead of `string[]` |
| `parseTryHandle` | TRY_HANDLE compiler | `handlers: [{errorType, body}]` instead of flat `handleBody` |

---

## Section 5: Edge Cases

| Scenario | Handling |
|----------|----------|
| `for each key, value in array:` — user passes an array not a map | Runtime behavior: `Object.entries(['a','b'])` → `[['0','a'],['1','b']]` — works, indices become keys. No compile-time error. |
| `keys of` / `values of` on an array | `Object.keys([1,2,3])` → `['0','1','2']`. Valid JS, may surprise user. Add comment in output: `// keys of array returns string indices` |
| `'alice' exists in scores` where scores is an array | JS: `'alice' in [...]` checks by index, not value — WRONG. Error message: "exists in checks map keys, not list items. Use 'items contains alice' instead." — validator check. |
| `{person's name}` in interpolated string — possessive inside `{}` | `tokenizeLine("person's name", line)` → produces POSSESSIVE token sequence. `parseExpression` handles MEMBER_ACCESS. Works. |
| `{fn(x)}` — function call inside string | `tokenizeLine` + `parseExpression` handles CALL nodes. Works. |
| `{'literal'}` — string inside string interpolation | Inner string uses different quote — will likely fail tokenizer. Error: "Can't use strings inside string interpolation. Use a variable instead." |
| `{` without closing `}` | `parseStringParts` falls back: treat rest as literal text. No crash. |
| `apply fn to each in []` — empty list | `[].map(fn)` → `[]`. Works. |
| `filter [] using fn` — empty list | `[].filter(fn)` → `[]`. Works. |
| `apply nonexistent_fn to each in list` | Validator: if `nonexistent_fn` not in declared functions, warn: "nonexistent_fn isn't defined. Define it with: define function nonexistent_fn(item):" |
| Type annotation — `name is text` conflicts with `is` assignment? | In param list context (inside parens or after `of`), `is` means type annotation not assignment. Parser is in `parseFunctionDef` context, not `parseAssignment`. No conflict. |
| `returns` keyword used as variable name | `returns` IS a global synonym — it maps to canonical `responds_with` (synonyms.js line 244). **CRITICAL:** In `parseFunctionDef`, detect `returns` by checking `tokens[pos].value === 'returns'` (original value), NOT `.canonical`. The canonical will be `responds_with` and won't match `'returns'`. |
| Typed handler without catch-all | Last handler has no `errorType` check — if no catch-all, unmatched errors propagate. This is valid. No error needed. |
| Multiple typed handlers, same error type | Allowed — first matching handler wins (JS if/else chain). Warn: "Two handlers for 'not found' — only the first will run." |
| `for each key, value in scores:` — `key` or `value` already declared | Same as existing FOR_EACH: loop variables shadow outer scope. No error. |

---

## Section 6: ENV VARS

None required.

---

## Section 7: Files to Create

None — all changes extend existing files.

---

## Section 8: Files to Modify

### Phase 1: `parser.js` — map iteration

**In `parseForEachLoop` (~line 3167):** After parsing first variable name, check for comma → second variable:
```js
const variable = tokens[pos].value;
pos++;

// Check for two-variable form: "for each key, value in scores:"
let variable2 = null;
if (pos < tokens.length && tokens[pos].type === TokenType.COMMA) {
  pos++; // skip comma
  if (pos < tokens.length && (tokens[pos].type === TokenType.IDENTIFIER || tokens[pos].type === TokenType.KEYWORD)) {
    variable2 = tokens[pos].value;
    pos++;
  } else {
    errors.push({ line, message: 'After the comma, add a second variable name. Example: for each key, value in scores:' });
    return { node: null, endIdx: startIdx + 1 };
  }
}
```
Then pass `variable2` into `forEachNode`: update `forEachNode()` builder to accept and store `variable2`.

**In expression parser (`parsePrimary` or `parseAssignment` RHS, ~line 5984):**
```js
// keys of X
if (tokens[pos].value === 'keys' && pos + 1 < tokens.length && tokens[pos + 1].canonical === 'of') {
  pos += 2;
  const src = parseExpression(tokens, pos, line);
  return { node: { type: 'map_keys', source: src.node }, nextPos: src.nextPos };
}
// values of X
if (tokens[pos].value === 'values' && pos + 1 < tokens.length && tokens[pos + 1].canonical === 'of') {
  pos += 2;
  const src = parseExpression(tokens, pos, line);
  return { node: { type: 'map_values', source: src.node }, nextPos: src.nextPos };
}
```

**For `X exists in Y` — MUST be in `parseExprPrec` (not `parsePrimary`), after the left side is already parsed:**

`parseExprPrec` parses left, then loops on operators. Add `exists in` detection inside that operator loop, after the left expr is available:
```js
// Inside parseExprPrec operator loop, after left is parsed:
if (pos < tokens.length && tokens[pos].value === 'exists' &&
    pos + 1 < tokens.length && tokens[pos + 1].canonical === 'in') {
  pos += 2;
  const right = parseExprPrec(tokens, pos, 0, line);
  left = { type: 'map_exists', key: left, map: right.node };
  pos = right.nextPos;
  continue; // stay in operator loop for further chaining
}
```
Do NOT put this in `parsePrimary` — `parsePrimary` only sees its own token, not the already-parsed left side.

Add `MAP_KEYS`, `MAP_VALUES`, `MAP_EXISTS` to NodeType enum.

### Phase 1: `compiler.js` — map iteration

**FOR_EACH case (~line 3105):** Add two-variable branch:
```js
if (node.variable2) {
  // Map entries iteration
  const k = sanitizeName(node.variable);
  const v = sanitizeName(node.variable2);
  const iter = exprToCode(node.iterable, ctx);
  const bodyCode = compileBody(node.body, ctx, { declared: new Set(ctx.declared) });
  if (ctx.lang === 'python') return `${pad}for ${k}, ${v} in ${iter}.items():\n${bodyCode}`;
  return `${pad}for (const [${k}, ${v}] of Object.entries(${iter})) {\n${bodyCode}\n${pad}}`;
}
```

**New cases for MAP_KEYS, MAP_VALUES, MAP_EXISTS in `exprToCode`:**
```js
case 'map_keys': {
  const src = exprToCode(expr.source, ctx);
  return ctx.lang === 'python' ? `list(${src}.keys())` : `Object.keys(${src})`;
}
case 'map_values': {
  const src = exprToCode(expr.source, ctx);
  return ctx.lang === 'python' ? `list(${src}.values())` : `Object.values(${src})`;
}
case 'map_exists': {
  const key = exprToCode(expr.key, ctx);
  const map = exprToCode(expr.map, ctx);
  return ctx.lang === 'python' ? `(${key} in ${map})` : `(${key} in ${map})`;
}
```

### Phase 2: `parser.js` — string interpolation

**Add `parseStringParts(rawStr, lineNum)` helper near `parsePrimary`:**

No `errors` parameter — `parsePrimary` has no errors array. All failures are silent fallbacks (keep `{inner}` as literal text).
```js
function parseStringParts(rawStr, lineNum) {
  if (!rawStr.includes('{')) return null; // fast path — no interpolation
  const parts = [];
  let i = 0;
  while (i < rawStr.length) {
    const open = rawStr.indexOf('{', i);
    if (open === -1) { if (i < rawStr.length) parts.push({ text: rawStr.slice(i) }); break; }
    if (open > i) parts.push({ text: rawStr.slice(i, open) });
    const close = rawStr.indexOf('}', open + 1);
    if (close === -1) { parts.push({ text: rawStr.slice(open) }); break; } // no closing } — treat rest as literal
    const inner = rawStr.slice(open + 1, close);
    if (inner.trim() === '') { parts.push({ text: '{}' }); i = close + 1; continue; }
    try {
      const innerTokens = tokenizeLine(inner, lineNum);
      const result = parseExpression(innerTokens, 0, lineNum);
      if (result && result.node && !result.error) {
        parts.push({ expr: result.node });
      } else {
        parts.push({ text: '{' + inner + '}' }); // silent fallback
      }
    } catch (e) {
      parts.push({ text: '{' + inner + '}' }); // silent fallback on tokenizer error
    }
    i = close + 1;
  }
  return parts.length > 0 ? parts : null;
}
```

**CRITICAL: `parsePrimary` has no `errors` array** — it only returns `{ node, nextPos }` or `{ error }`. Do NOT pass `errors` to `parseStringParts`. Instead, `parseStringParts` must silently fall back (keep `{inner}` as literal text) on any parse failure — never push to an errors array.

Update `parseStringParts` signature to remove `errors` parameter:
```js
function parseStringParts(rawStr, lineNum) { // no errors param
  // On parse failure: push { text: '{' + inner + '}' } silently — no error push
```

**In `parsePrimary`, where STRING token is handled (find `type: TokenType.STRING`):**
```js
// After creating the string node:
const parts = parseStringParts(token.value, token.line); // no errors arg
const node = { type: NodeType.LITERAL_STRING, value: token.value, line: token.line };
if (parts) node.parts = parts;
return { node, nextPos: pos + 1 };
```

**CRITICAL: `tokenizeLine` is NOT imported in `parser.js`.** It's exported from `tokenizer.js` (line 108) but `parser.js` line 118 only imports `tokenize` and `TokenType`. Fix: add `tokenizeLine` to the import line:
```js
// parser.js line 118 — CHANGE:
import { tokenize, TokenType } from './tokenizer.js';
// TO:
import { tokenize, tokenizeLine, TokenType } from './tokenizer.js';
```

### Phase 2: `compiler.js` — string interpolation

**Replace the LITERAL_STRING case (~line 4102):**
```js
case NodeType.LITERAL_STRING: {
  // If parts are present, use structured interpolation
  if (expr.parts) {
    if (ctx.lang === 'python') {
      // Build string concatenation for Python (f-strings can't handle all expressions safely)
      const pyParts = expr.parts.map(p =>
        p.text !== undefined
          ? JSON.stringify(p.text)
          : `str(${exprToCode(p.expr, ctx)})`
      );
      return pyParts.length === 1 ? pyParts[0] : pyParts.join(' + ');
    }
    // JS: template literal
    const jsParts = expr.parts.map(p =>
      p.text !== undefined
        ? p.text.replace(/`/g, '\\`').replace(/\\/g, '\\\\')
        : '${' + exprToCode(p.expr, ctx) + '}'
    );
    return '`' + jsParts.join('') + '`';
  }
  // No parts — existing simple-var interpolation (backward compat)
  const val = expr.value;
  if (val.includes('{') && val.includes('}')) {
    if (ctx.lang === 'python') return `f"${val.replace(/"/g, '\\"')}"`;
    const tmpl = val.replace(/\{(\w+)\}/g, (_, v) => {
      const ref = ctx.stateVars?.has(v) ? `_state.${v}` : v;
      return '${' + ref + '}';
    });
    return '`' + tmpl + '`';
  }
  return JSON.stringify(val);
}
```

### Phase 3: `parser.js` — first-class functions

**In `parseAssignment` RHS detection (~line 5800s), add before existing CRUD intercepts:**
```js
// apply fn to each in list
if (tokens[pos].value === 'apply' && tokens.length > pos + 3) {
  const fn = tokens[pos + 1].value;
  // expect "to each in listName"
  if (tokens[pos + 2].canonical === 'to' && tokens[pos + 3].value === 'each') {
    const inPos = pos + 4;
    if (inPos < tokens.length && tokens[inPos].canonical === 'in') {
      const listExpr = parseExpression(tokens, inPos + 1, line);
      return { node: { type: 'map_apply', fn, list: listExpr.node, line }, nextPos: listExpr.nextPos };
    }
  }
}

// filter list using fn
// CRITICAL: `filter` canonical is `filter_where` (synonyms.js line 342), NOT `filter_op`
// CRITICAL: `using` canonical is `with` (synonyms.js line 80) — must check .value === 'using'
// Disambiguation: `filter X using fn` vs `filter X where field` — scan ahead for 'using' value
if (tokens[pos].canonical === 'filter_where') {
  // Scan ahead to check if this is "filter X using fn" vs "filter X where ..."
  // Look for 'using' (value) token anywhere after position pos+1
  let usingPos = -1;
  for (let si = pos + 1; si < tokens.length; si++) {
    if (tokens[si].value === 'using') { usingPos = si; break; }
    if (tokens[si].canonical === 'where') break; // it's a data filter, not function filter
  }
  if (usingPos !== -1) {
    // Parse the list expression (from pos+1 up to usingPos)
    const listExpr = parseExpression(tokens, pos + 1, line);
    const fn = tokens[usingPos + 1]?.value;
    if (!fn) { errors.push({ line, message: 'After "using", add a function name. Example: filter users using is_active' }); }
    return { node: { type: 'filter_apply', fn, list: listExpr.node, line }, nextPos: usingPos + 2 };
  }
  // else: fall through to existing filter_where (data filter) handling
}
```

**NOTE:** `filter` canonical in synonyms.js is `filter_where` (line 342), NOT `filter_op`. The FILTER_APPLY detection must come BEFORE the existing `filter_where` data filter detection in `parseAssignment`. Check for `.value === 'using'` (not `.canonical`) since `using` maps to canonical `with`.

Add `MAP_APPLY`, `FILTER_APPLY` to NodeType enum.

### Phase 3: `compiler.js` — first-class functions

```js
case NodeType.MAP_APPLY: {
  const fn = sanitizeName(node.fn);
  const list = exprToCode(node.list, ctx);
  if (ctx.lang === 'python') return `${pad}[${fn}(x) for x in ${list}]`;
  return `${pad}${list}.map(${fn})`;
}

case NodeType.FILTER_APPLY: {
  const fn = sanitizeName(node.fn);
  const list = exprToCode(node.list, ctx);
  if (ctx.lang === 'python') return `${pad}[x for x in ${list} if ${fn}(x)]`;
  return `${pad}${list}.filter(${fn})`;
}
```

### Phase 4: `parser.js` — type annotations

**In `parseFunctionDef` param parsing (~line 2287):**
```js
// Inside the paren-style param loop, replace:
//   params.push(tokens[pos].value);
// with:
const paramName = tokens[pos].value;
pos++;
let paramType = null;
// Check for "name is type" pattern
if (pos < tokens.length && tokens[pos].canonical === 'is' &&
    pos + 1 < tokens.length && isTypeKeyword(tokens[pos + 1].value)) {
  paramType = tokens[pos + 1].value; // 'text', 'number', 'list', 'boolean', 'map'
  pos += 2;
}
params.push({ name: paramName, type: paramType });
```

```js
function isTypeKeyword(v) {
  return ['text', 'number', 'list', 'boolean', 'map', 'any'].includes(v.toLowerCase());
}
```

**After params, check for `returns TYPE`:**

**CRITICAL:** `returns` maps to canonical `responds_with` (synonyms.js line 244). MUST check `.value === 'returns'` (the original token value), NOT `.canonical`:
```js
let returnType = null;
// Check .value not .canonical — 'returns' canonical is 'responds_with'
if (pos < tokens.length && tokens[pos].value === 'returns') {
  pos++;
  if (pos < tokens.length && isTypeKeyword(tokens[pos].value)) {
    returnType = tokens[pos].value;
    pos++;
  }
}
```

Store as `node.returnType`. Update `functionDefNode()` builder.

**BREAKING CHANGE — normalize params in `functionDefNode()` builder so all downstream code is safe:**

In the `functionDefNode()` AST builder, normalize every param to `{name, type}` immediately:
```js
function functionDefNode(name, params, body, line) {
  const normalizedParams = params.map(p =>
    typeof p === 'string' ? { name: p, type: null } : p
  );
  return { type: NodeType.FUNCTION_DEF, name, params: normalizedParams, body, line };
}
```

**Grep for all compiler.js call sites that read params as strings and update them:**
- `compiler.js line ~548`: `mNode.params.map(sanitizeName)` → `mNode.params.map(p => sanitizeName(p.name))`
- `compiler.js line ~557`: same pattern → `p.name`
- `compiler.js line ~566`: same pattern → `p.name`
- `compiler.js line ~3013`: `node.params.map(sanitizeName)` → `node.params.map(p => sanitizeName(p.name))`
- `compiler.js line ~3019`: `new Set(node.params.map(sanitizeName))` → `new Set(node.params.map(p => sanitizeName(p.name)))`

Run `grep -n "params.map" compiler.js` before editing to verify all call sites.

### Phase 4: `compiler.js` — type annotations

**In FUNCTION_DEF case, add JSDoc before function:**
```js
case NodeType.FUNCTION_DEF: {
  const fnName = sanitizeName(node.name);
  // Build JSDoc if any params have types or there's a returnType
  const typedParams = node.params.filter(p => p.type);
  const hasTypes = typedParams.length > 0 || node.returnType;
  let jsdoc = '';
  if (hasTypes && ctx.lang !== 'python') {
    const typeMap = { text: 'string', number: 'number', list: 'Array', boolean: 'boolean', map: 'Object', any: '*' };
    const paramDocs = typedParams.map(p => ` * @param {${typeMap[p.type] || p.type}} ${sanitizeName(p.name)}`).join('\n');
    const retDoc = node.returnType ? ` * @returns {${typeMap[node.returnType] || node.returnType}}` : '';
    jsdoc = `${pad}/**\n${paramDocs ? paramDocs + '\n' : ''}${retDoc ? retDoc + '\n' : ''}${pad} */\n`;
  }
  const paramList = node.params.map(p => sanitizeName(typeof p === 'string' ? p : p.name)).join(', ');
  // ... rest of existing FUNCTION_DEF compilation
}
```

### Phase 5: `parser.js` — typed error handling

**In `parseTryHandle` (~line 5475), replace single handler parse with loop:**
```js
const handlers = [];
while (i < lines.length && lines[i].indent <= blockIndent) {
  const handleTokens = lines[i].tokens;
  if (!handleTokens.length) break;
  if (handleTokens[0].canonical !== 'if_error' && handleTokens[0].canonical !== 'handle') break;

  // Check for typed: "if there's a 'not found' error:"
  // Tokens after if_error: optional STRING then optional 'error'
  let errorType = null;
  let tPos = 1; // after if_error token
  if (tPos < handleTokens.length && handleTokens[tPos].type === TokenType.STRING) {
    errorType = handleTokens[tPos].value; // 'not found', 'permission', etc.
    tPos++;
  }
  // Skip 'error' keyword if present
  if (tPos < handleTokens.length && handleTokens[tPos].value === 'error') tPos++;

  const handlerResult = parseBlock(lines, i + 1, blockIndent, errors);
  if (handlerResult.body.length === 0) {
    errors.push({ line: handleTokens[0].line, message: 'This error handler is empty — add code to handle the error.' });
  }
  handlers.push({ errorType, body: handlerResult.body });
  i = handlerResult.endIdx;
}

if (handlers.length === 0) {
  errors.push({ line, message: "Add \"if there's an error:\" after the try block." });
}
```

Update `tryHandleNode` builder: store `handlers` instead of `handleBody` + `errorVar`.

### Phase 5: `compiler.js` — typed error handling

**Replace TRY_HANDLE case (~line 3134):**
```js
case NodeType.TRY_HANDLE: {
  const errorTypeToCondition = (type, lang) => {
    if (!type) return lang === 'python' ? 'True' : 'true';
    const t = type.toLowerCase();
    if (lang === 'python') {
      if (t === 'not found') return "'404' in str(_err) or 'not found' in str(_err).lower()";
      if (t === 'permission' || t === 'forbidden') return "'403' in str(_err) or '401' in str(_err)";
      if (t === 'validation' || t === 'invalid') return "'400' in str(_err)";
      if (t === 'server') return "str(_err).startswith('5')";
      return `'${t}' in str(_err).lower()`;
    }
    if (t === 'not found') return "_err.status === 404 || _err.message?.toLowerCase().includes('not found')";
    if (t === 'permission' || t === 'forbidden') return "_err.status === 403 || _err.status === 401";
    if (t === 'validation' || t === 'invalid') return "_err.status === 400";
    if (t === 'server') return "_err.status >= 500";
    return `_err.message?.toLowerCase().includes('${t}')`;
  };

  const tryCode = compileBody(node.tryBody, ctx, { declared: new Set(ctx.declared) });
  const handlers = node.handlers || [{ errorType: null, body: node.handleBody || [] }];

  if (ctx.lang === 'python') {
    let out = `${pad}try:\n${tryCode}\n${pad}except Exception as _err:\n`;
    handlers.forEach((h, i) => {
      const cond = errorTypeToCondition(h.errorType, 'python');
      const hBody = compileBody(h.body, { ...ctx, declared: new Set(ctx.declared) });
      out += i === 0 ? `${pad}    if ${cond}:\n${hBody}\n` : `${pad}    elif ${cond}:\n${hBody}\n`;
    });
    return out;
  }

  let out = `${pad}try {\n${tryCode}\n${pad}} catch (_err) {\n`;
  handlers.forEach((h, i) => {
    const cond = errorTypeToCondition(h.errorType, 'js');
    const hBody = compileBody(h.body, { ...ctx, declared: new Set(ctx.declared) });
    // rename 'error' references to '_err' in hBody
    out += i === 0 ? `${pad}  if (${cond}) {\n${hBody}\n${pad}  }` : ` else if (${cond}) {\n${hBody}\n${pad}  }`;
  });
  out += `\n${pad}}`;
  return out;
}
```

**Note:** existing code uses `error` variable in handler body (`error's message`). The compiled catch var is now `_err`. Need to ensure `exprToCode` for `error` variable ref inside handler body maps to `_err`. Pass `errorVar: '_err'` through context and check in `VARIABLE_REF` case.

---

## Section 9: Pre-Flight Checklist

- [ ] `node clear.test.js` → 1489 green before starting
- [ ] `grep -n "filter" synonyms.js` — confirm canonical is `filter_where` (line 342), NOT `filter_op`
- [ ] `grep -n "using\|returns" synonyms.js` — confirm `using` → canonical `with` (line 80), `returns` → canonical `responds_with` (line 244). Both must be checked by `.value`, not `.canonical`.
- [ ] `grep -n "params.map" compiler.js` — find all 5 call sites before touching `functionDefNode`
- [ ] `grep -n "params\[" compiler.js` — find all places that read params as strings (need to handle `params[i].name`)
- [ ] `grep -n "tokenizeLine" tokenizer.js` — confirm export at line 108. Then add `tokenizeLine` to parser.js import line 118.
- [ ] `grep -n "if_error\|if there" synonyms.js` — confirm `if_error` canonical for typed handler detection
- [ ] `learnings.md` exists and TOC scanned

---

## Section 10: TDD Cycles

### Phase 1: Map Iteration

**Cycle 1.1 — `for each key, value in map:`**
🔴
```js
it('parses for each key, value in map', () => {
  const ast = parse("for each key, value in scores:\n  show key");
  const node = ast.body[0];
  expect(node.type).toBe(NodeType.FOR_EACH);
  expect(node.variable).toBe('key');
  expect(node.variable2).toBe('value');
});
```
🟢 Add comma detection in `parseForEachLoop`. Update `forEachNode` builder.
🔄 Existing single-var FOR_EACH tests unchanged.

**Cycle 1.2 — compiles to Object.entries (JS) and .items() (Python)**
🔴
```js
it('compiles two-var for each to Object.entries', () => {
  const r = compileProgram("build for javascript backend\nfor each key, value in scores:\n  show key");
  expect(r.serverJS).toContain('Object.entries(scores)');
  expect(r.serverJS).toContain('[key, value]');
});
it('compiles two-var for each to .items() in python', () => {
  const r = compileProgram("build for python backend\nfor each key, value in scores:\n  items()\nfor each key, value in scores:\n  show key");
  expect(r.python).toContain('scores.items()');
});
```
🟢 Add `node.variable2` branch in FOR_EACH compiler case.

**Cycle 1.3 — `keys of X` and `values of X` expressions**
🔴
```js
it('compiles keys of X to Object.keys', () => {
  const r = compileProgram("build for javascript backend\nall_keys = keys of scores\nshow all_keys");
  expect(r.serverJS).toContain('Object.keys(scores)');
});
it('compiles values of X to Object.values', () => {
  const r = compileProgram("build for javascript backend\nall_vals = values of scores\nshow all_vals");
  expect(r.serverJS).toContain('Object.values(scores)');
});
```
🟢 Add MAP_KEYS / MAP_VALUES detection in expression parser + cases in `exprToCode`.

**Cycle 1.4 — `X exists in Y`**
🔴
```js
it('compiles exists in to in operator', () => {
  const r = compileProgram("build for javascript backend\nfound = 'alice' exists in scores\nshow found");
  expect(r.serverJS).toContain("'alice' in scores");
});
```
🟢 Add MAP_EXISTS detection in expression parser + case in `exprToCode`.

Run `node clear.test.js`. 📚 `update-learnings`.

---

### Phase 2: String Interpolation (Expressions)

**Cycle 2.1 — `parseStringParts` correctly splits string**
🔴
```js
it('creates parts for interpolated string with expression', () => {
  const ast = parse("summary is 'Total: {price * quantity}'");
  const node = ast.body[0];
  expect(node.expression.parts).toBeDefined();
  expect(node.expression.parts.length).toBe(2);
  expect(node.expression.parts[0].text).toBe('Total: ');
  expect(node.expression.parts[1].expr.type).toBe('binary_op');
});
```
🟢 Add `parseStringParts` helper. Call from wherever LITERAL_STRING nodes are built in parser (grep for `type: NodeType.LITERAL_STRING`).

**Cycle 2.2 — compiles expression in string to template literal**
🔴
```js
it('compiles expression interpolation to template literal', () => {
  const r = compileProgram("build for javascript backend\nprice = 10\nquantity = 3\nsummary is 'Total: {price * quantity}'\nshow summary");
  expect(r.serverJS).toContain('`Total: ${price * quantity}`');
});
```
🟢 Update LITERAL_STRING compiler case to use `parts` when present.

**Cycle 2.3 — member access in string**
🔴
```js
it('compiles possessive member access in string interpolation', () => {
  const r = compileProgram("build for javascript backend\ngreeting is 'Hello {person\\'s name}!'\nshow greeting");
  expect(r.serverJS).toContain('person.name');
});
```
🟢 Verify `tokenizeLine("person's name", 1)` + `parseExpression` handles MEMBER_ACCESS. Should work with existing parser.

**Cycle 2.4 — Python uses string concatenation**
🔴
```js
it('compiles expression interpolation to string concat in python', () => {
  const r = compileProgram("build for python backend\nsummary is 'Total: {price * quantity}'\nshow summary");
  expect(r.python).toContain('str(price * quantity)');
  expect(r.python).not.toContain('f"');
});
```
🟢 Python branch in LITERAL_STRING emits `str()` concatenation for parts with expressions.

**Cycle 2.5 — simple `{var}` still works (no regression)**
🔴
```js
it('simple var interpolation still works after change', () => {
  const r = compileProgram("build for javascript backend\nname is 'Alice'\ngreeting is 'Hello {name}!'\nshow greeting");
  // Should still work — either via parts or fallback regex
  expect(r.serverJS).toMatch(/Hello.*name.*!/);
});
```
🟢 Confirm fallback path untouched when `parseStringParts` returns null.

Run `node clear.test.js`. 📚 `update-learnings`.

---

### Phase 3: First-Class Functions

**Cycle 3.1 — `apply fn to each in list`**
🔴
```js
it('parses apply fn to each in list', () => {
  const ast = parse("doubled = apply double to each in numbers");
  const node = ast.body[0];
  expect(node.type).toBe(NodeType.ASSIGN);
  expect(node.expression.type).toBe('map_apply');
  expect(node.expression.fn).toBe('double');
});
it('compiles apply to list.map(fn)', () => {
  const r = compileProgram("build for javascript backend\ndoubled = apply double to each in numbers\nshow doubled");
  expect(r.serverJS).toContain('numbers.map(double)');
});
```
🟢 Add MAP_APPLY detection in `parseAssignment` RHS. Add MAP_APPLY case in compiler.

**Cycle 3.2 — `filter list using fn`**
🔴
```js
it('parses filter list using fn', () => {
  const ast = parse("active = filter users using is_active");
  const node = ast.body[0];
  expect(node.expression.type).toBe('filter_apply');
  expect(node.expression.fn).toBe('is_active');
});
it('compiles filter using to list.filter(fn)', () => {
  const r = compileProgram("build for javascript backend\nactive = filter users using is_active\nshow active");
  expect(r.serverJS).toContain('users.filter(is_active)');
});
```
🟢 Add FILTER_APPLY detection (check `using` token to disambiguate from `filter X where`). Add FILTER_APPLY compiler case.

**Cycle 3.3 — Python list comprehension**
🔴
```js
it('compiles apply and filter to python comprehensions', () => {
  const r = compileProgram("build for python backend\ndoubled = apply double to each in numbers\nactive = filter users using is_active");
  expect(r.python).toContain('[double(x) for x in numbers]');
  expect(r.python).toContain('[x for x in users if is_active(x)]');
});
```
🟢 Python branches in MAP_APPLY and FILTER_APPLY.

Run `node clear.test.js`. 📚 `update-learnings`.

---

### Phase 4: Type Annotations

**Cycle 4.1 — parser stores typed params**
🔴
```js
it('parses typed function params', () => {
  const ast = parse("define function greet(name is text):\n  show name");
  const fn = ast.body[0];
  expect(fn.type).toBe(NodeType.FUNCTION_DEF);
  expect(fn.params[0].name).toBe('name');
  expect(fn.params[0].type).toBe('text');
});
it('parses return type', () => {
  const ast = parse("define function add(a is number, b is number) returns number:\n  return a + b");
  const fn = ast.body[0];
  expect(fn.params[0].type).toBe('number');
  expect(fn.returnType).toBe('number');
});
```
🟢 Extend `parseFunctionDef` param loop. Add `returns TYPE` detection. Update `functionDefNode` builder to normalize params.

**Cycle 4.2 — compiler emits JSDoc**
🔴
```js
it('emits jsdoc for typed function', () => {
  const r = compileProgram("build for javascript backend\ndefine function add(a is number, b is number) returns number:\n  return a + b");
  expect(r.serverJS).toContain('@param {number} a');
  expect(r.serverJS).toContain('@returns {number}');
});
```
🟢 Add JSDoc emission in FUNCTION_DEF compiler case.

**Cycle 4.3 — untyped params still work (no regression)**
🔴
```js
it('untyped params still work after type annotation change', () => {
  const r = compileProgram("build for javascript backend\ndefine function double(x):\n  return x * 2");
  expect(r.serverJS).toContain('function double(x)');
  expect(r.errors).toHaveLength(0);
});
```
🟢 Confirm param normalization: `{ name: 'x', type: null }` → `sanitizeName('x')` → `'x'`.

Run `node clear.test.js`. 📚 `update-learnings`.

---

### Phase 5: Typed Error Handling

**Cycle 5.1 — parser collects multiple handlers**
🔴
```js
it('parses typed error handlers', () => {
  const src = "try:\n  show 'hi'\nif there's a 'not found' error:\n  show 'nope'\nif there's an error:\n  show 'oops'";
  const ast = parse(src);
  const node = ast.body[0];
  expect(node.type).toBe(NodeType.TRY_HANDLE);
  expect(node.handlers).toBeDefined();
  expect(node.handlers.length).toBe(2);
  expect(node.handlers[0].errorType).toBe('not found');
  expect(node.handlers[1].errorType).toBeNull();
});
```
🟢 Replace `parseTryHandle` handler parsing with loop. Update `tryHandleNode` builder.

**Cycle 5.2 — compiler emits if/else chain (JS)**
🔴
```js
it('compiles typed errors to if/else catch chain', () => {
  const r = compileProgram("build for javascript backend\ntry:\n  show 'hi'\nif there's a 'not found' error:\n  show 'not found'\nif there's an error:\n  show 'error'");
  expect(r.serverJS).toContain('404');
  expect(r.serverJS).toContain("includes('not found')");
  expect(r.serverJS).toContain('} else if');
});
```
🟢 Rewrite TRY_HANDLE compiler case with handler loop.

**Cycle 5.3 — single handler still works (no regression)**
🔴
```js
it('single catch-all handler still works', () => {
  const r = compileProgram("build for javascript backend\ntry:\n  show 'hi'\nif there's an error:\n  show 'oops'");
  expect(r.serverJS).toContain('try {');
  expect(r.serverJS).toContain('catch');
  expect(r.errors).toHaveLength(0);
});
```
🟢 Ensure backward compat: single handler with `errorType: null` emits existing catch pattern.

**Cycle 5.4 — Python multi-handler**
🔴
```js
it('compiles typed errors to if/elif chain in python', () => {
  const r = compileProgram("build for python backend\ntry:\n  show 'hi'\nif there's a 'not found' error:\n  show 'nope'\nif there's an error:\n  show 'err'");
  expect(r.python).toContain('except Exception as _err');
  expect(r.python).toContain("'not found' in str(_err).lower()");
  expect(r.python).toContain('elif');
});
```
🟢 Python branch in TRY_HANDLE compiler.

Run `node clear.test.js`. 📚 `update-learnings`.

---

## Section 11: Success Criteria

- [ ] `for each key, value in scores:` → `Object.entries` (JS), `.items()` (Python)
- [ ] `keys of X` → `Object.keys(X)`, `values of X` → `Object.values(X)`
- [ ] `'x' exists in map` → `'x' in map` (JS + Python)
- [ ] `'Total: {price * quantity}'` → template literal with compiled expression
- [ ] `'Hello {person's name}'` → member access inside template literal
- [ ] Simple `{var}` still works (no regression)
- [ ] `apply fn to each in list` → `list.map(fn)` / `[fn(x) for x in list]`
- [ ] `filter list using fn` → `list.filter(fn)` / `[x for x in list if fn(x)]`
- [ ] Typed params stored: `params[i].name` and `params[i].type`
- [ ] JSDoc emitted for typed functions in JS
- [ ] Untyped functions still compile (no regression)
- [ ] Multiple `if there's a X error:` handlers compile to if/else chain
- [ ] Single catch-all still works
- [ ] All 1489 existing tests pass throughout
- [ ] `intent.md` updated with all 5 new syntax forms
- [ ] Parser + compiler TOCs updated

---

## Resume Prompt

```
Branch: feature/general-purpose-v1
Plan: plans/plan-general-purpose-lang-04-09-2026.md

Execute phases in order. `node clear.test.js` after every cycle.

PHASE 1 — Map iteration:
- parseForEachLoop: detect comma between vars → variable2 on FOR_EACH node
- FOR_EACH compiler: if node.variable2 → Object.entries (JS) / .items() (Python)
- Expression parser: detect 'keys of X' → MAP_KEYS, 'values of X' → MAP_VALUES
- Expression parser: detect 'X exists in Y' → MAP_EXISTS (after left expr parsed)
- exprToCode: add MAP_KEYS, MAP_VALUES, MAP_EXISTS cases

PHASE 2 — String interpolation expressions:
- Add parseStringParts(rawStr, lineNum, errors) to parser.js
- Call it wherever LITERAL_STRING nodes are created — attach parts if present
- LITERAL_STRING compiler: if parts → template literal from parts (JS), str() concat (Python)
- Preserve fallback simple-var regex for strings without parts

PHASE 3 — First-class functions:
- parseAssignment RHS: detect 'apply fn to each in list' → MAP_APPLY node
- parseAssignment RHS: detect 'filter list using fn' (not 'where') → FILTER_APPLY node
- Compiler: MAP_APPLY → list.map(fn), FILTER_APPLY → list.filter(fn)
- Python: list comprehension forms

PHASE 4 — Type annotations:
- parseFunctionDef: in param loop, after name check for 'is TYPE' → {name, type}
- parseFunctionDef: after params, check 'returns TYPE' → node.returnType
- Normalize: untyped params become {name, type: null} — grep all params[i] usages
- FUNCTION_DEF compiler: emit JSDoc when types present

PHASE 5 — Typed error handling:
- parseTryHandle: replace single handler with loop collecting multiple if_error clauses
- Check for STRING token after if_error → errorType
- tryHandleNode: store handlers array
- TRY_HANDLE compiler: emit if/else chain mapping error types to status checks
- Backward compat: single null-type handler works as before

Update parser.js and compiler.js TOCs. Update intent.md after each phase.
```
