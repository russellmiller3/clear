# Plan: Unit-Level Test Assertions for Clear

**Date:** 2026-04-17  
**Branch:** feature/unit-test-assertions  
**Status:** In progress

---

## Problem

Clear's `test:` blocks only speak HTTP + display. There is no way to assert on a plain value — the result of a calculation, a string comparison, a count. If a user wants to verify that `price * 0.08` equals `8`, they must wrap it in an endpoint and assert on the response. That's absurd. Unit-level assertions must be first-class.

---

## Proposed Syntax

```clear
test 'tax calculation':
  price = 100
  tax = price * 0.08
  expect price is 100
  expect tax is 8.0
  expect tax is not 0

test 'comparison checks':
  score = 85
  expect score is greater than 80
  expect score is less than 100
  expect score is at least 85
  expect score is at most 90

test 'string equality':
  name is 'Alice'
  expect name is 'Alice'
  expect name is not 'Bob'

test 'empty checks':
  items is 'hello'
  expect items is not empty
  empty_str is ''
  expect empty_str is empty
```

**Design decisions:**
- Reuses the existing `expect` keyword — consistent surface, no new keyword to learn.
- `is` as the comparison operator — matches Clear's value-assignment idiom exactly.
- Plain English comparators: `greater than`, `less than`, `at least`, `at most`.
- `empty` / `not empty` cover null, `''`, and zero-length arrays.
- Variable assignment inside test blocks uses existing ASSIGN node — no new syntax needed there.

---

## What Is NOT Supported (Phase 1)

**Calling app-defined functions directly.** The test harness is a separate Node.js script that talks to the running server over HTTP. Functions defined in the app (e.g., `define double as:`) are not in scope. To unit-test a function, expose it via an endpoint and use `can user call GET /api/double` instead.

Phase 2 can inline `FUNCTION_DEF` nodes into the test harness. That's a separate plan.

---

## Synonym Collision Analysis

| Phrase | Risk | Verdict |
|--------|------|---------|
| `expect X is 5` | `is` is ASSIGN token — could fire on existing expect paths | **Safe** — guarded by position: only fires when tokens[1] is not `it`/`response`/known keywords |
| `is greater than` | Not a registered synonym anywhere | **Safe** |
| `is less than` | Not a registered synonym | **Safe** |
| `is at least` / `is at most` | Not registered | **Safe** |
| `is empty` | `is empty` appears in IF conditions (if X is empty). No conflict — `expect` handler is context-specific | **Safe** |
| `is not empty` | Same as above | **Safe** |

---

## New AST Node: `UNIT_ASSERT`

Add to `NodeType` object in `parser.js`:
```js
UNIT_ASSERT: 'unit_assert',
```

Node shape:
```js
{
  type: NodeType.UNIT_ASSERT,
  left:    <expr node>,     // LHS — the value being tested
  check:   'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'empty' | 'not_empty',
  right:   <expr node> | null,  // RHS — null for empty/not_empty checks
  line:    N,
  rawLeft: 'string' // original token text for error messages, e.g. "tax"
}
```

---

## Parser Changes (`parser.js`)

**Where:** inside the `['expect', (ctx) => { ... }]` dispatch handler, starting around line 1197.

**New branch:** add after all existing `expect it ...`, `expect response ...` checks, as a final catch-all.

**Detection logic:**
```
// New unit-assert branch fires when tokens[1] is not 'it' / 'response'
// and an 'is' token exists somewhere in the line.
// Pattern: expect <left-expr> is [not] [comparator] [right-expr]
```

Steps:
1. Find the first token with `canonical === 'is'` or `type === TokenType.ASSIGN` — call its index `isIdx`.
2. If no `isIdx` found: fall through to the generic `expect(expr).toBeTruthy()` path (existing behavior).
3. Left side: `parseExpression(tokens, 1, line)` up to `isIdx`. Use the raw token text as `rawLeft`.
4. Right side: examine tokens from `isIdx+1`:
   - `not empty` → `{ check: 'not_empty', right: null }`
   - `empty` → `{ check: 'empty', right: null }`
   - `not <value>` → `{ check: 'ne', right: parseExpression(tokens, isIdx+2) }`
   - `greater than <value>` → `{ check: 'gt', right: parseExpression(tokens, isIdx+3) }`
   - `less than <value>` → `{ check: 'lt', right: parseExpression(tokens, isIdx+3) }`
   - `at least <value>` → `{ check: 'gte', right: parseExpression(tokens, isIdx+3) }`
   - `at most <value>` → `{ check: 'lte', right: parseExpression(tokens, isIdx+3) }`
   - anything else → `{ check: 'eq', right: parseExpression(tokens, isIdx+1) }`
5. Push `UNIT_ASSERT` node onto `ctx.body`.

**Guard:** this branch must NOT fire when:
- `tokens[1].value === 'it'` (handled above already)
- `tokens[1].value === 'response'` (handled above already)
- The expect is outside a test block context

The context guard is implicit: `parseExpect` is only called from inside a test block body, so no extra check needed.

---

## Compiler Changes (`compiler.js`)

### 1. New case in `_compileNodeInner` switch

After the `case NodeType.EXPECT:` case (around line 5646), add:

```js
case NodeType.UNIT_ASSERT: {
  const left = exprToCode(node.left, ctx);
  const right = node.right ? exprToCode(node.right, ctx) : 'null';
  const check = JSON.stringify(node.check);
  const line = node.line || 0;
  const raw = JSON.stringify(node.rawLeft);
  return `${pad}_unitAssert(${left}, ${check}, ${right}, ${line}, ${raw});`;
}
```

### 2. `_unitAssert` helper emitted in test harness

Add to the helper functions block at the end of `generateTestScript` (around line 2457), alongside `_expectStatus`, `_expectBodyHas`, etc.:

```js
function _unitAssert(actual, check, expected, line, expr) {
  const where = line ? ' [clear:' + line + ']' : '';
  let ok = false;
  if (check === 'eq')        ok = actual == expected;
  if (check === 'ne')        ok = actual != expected;
  if (check === 'gt')        ok = actual > expected;
  if (check === 'lt')        ok = actual < expected;
  if (check === 'gte')       ok = actual >= expected;
  if (check === 'lte')       ok = actual <= expected;
  if (check === 'empty')     ok = actual === null || actual === undefined || actual === '' || (Array.isArray(actual) && actual.length === 0);
  if (check === 'not_empty') ok = actual !== null && actual !== undefined && actual !== '' && (!Array.isArray(actual) || actual.length > 0);
  if (ok) return;
  const got = actual === null || actual === undefined ? 'nothing' : JSON.stringify(actual);
  const want = { eq: 'to equal', ne: 'to not equal', gt: 'to be greater than', lt: 'to be less than', gte: 'to be at least', lte: 'to be at most', empty: 'to be empty', not_empty: 'to not be empty' };
  const suffix = (check === 'empty' || check === 'not_empty') ? '' : ' ' + JSON.stringify(expected);
  throw new Error('`' + expr + '` was expected ' + (want[check] || check) + suffix + ', but got ' + got + ' instead.' + where);
}
```

**Emit condition:** emit `_unitAssert` whenever `testDefs.length > 0` (same guard as existing helpers). Alternatively, check if any test body contains a `UNIT_ASSERT` node — but the blanket emit is simpler and adds negligible bytes.

### 3. Update `compiler.js` TOC

Add `UNIT_ASSERT` to the switch comment near the top (the "96 node types total" diagram).

---

## Test Coverage (TDD — write these FIRST)

File: `clear.test.js`

### Failing tests to write before implementation:

**T1 — basic equality:**
```clear
test 'eq passes':
  x = 5
  expect x is 5
```
Compile and run → should currently emit `expect(x).toBeTruthy()` which passes for non-zero, not a real assertion. With UNIT_ASSERT it emits `_unitAssert(x, 'eq', 5, ...)` which passes correctly.

Actually: current behavior for `expect x is 5` falls through to `parseExpression` → `EXPECT` node → `expect(x is 5).toBeTruthy()` — that's `expect(true).toBeTruthy()` which always passes. This is the **silent false-positive bug** UNIT_ASSERT fixes. The failing test must verify that `expect x is 9999` on `x = 5` FAILS (not silently passes).

**Tests:**
1. `expect x is N` — passes when correct, fails with clear message when wrong
2. `expect x is not N` — ne check  
3. `expect x is greater than N` — gt check
4. `expect x is less than N` — lt check
5. `expect x is at least N` — gte check
6. `expect x is at most N` — lte check
7. `expect x is empty` — empty check
8. `expect x is not empty` — not_empty check
9. `expect name is 'Alice'` — string equality
10. Error message quality — when assertion fails, message names the variable and the line

**How to write the failing test in `clear.test.js`:**
Use the `compileProgram` API, call `generateTestScript`, and verify the compiled output contains `_unitAssert(...)`. Until the parser recognizes `UNIT_ASSERT`, these tests fail (the output won't contain `_unitAssert`).

---

## Update TOC

**parser.js TOC line 91:** change:
```
//   TEST BLOCKS ....................... parseTestDef(), parseExpect()
```
to:
```
//   TEST BLOCKS ....................... parseTestDef(), parseExpect(), parseUnitAssert()
```

**compiler.js diagram:** add `UNIT_ASSERT` to the node type list.

---

## Documentation Updates (after implementation)

Per the Documentation Rule (MANDATORY), update all 7 surfaces:
1. `intent.md` — add UNIT_ASSERT row to node type table
2. `SYNTAX.md` — add unit assertion section with all 8 check forms + examples
3. `AI-INSTRUCTIONS.md` — note when to use unit vs HTTP assertions
4. `USER-GUIDE.md` — add worked example in the Testing chapter
5. `ROADMAP.md` — mark phase complete
6. `playground/system-prompt.md` — ✅ already done (TDD instructions added)
7. `landing/` — not user-facing syntax, skip

---

## Execution Order

1. ✅ Update Meph system prompt (done)
2. Write failing tests in `clear.test.js` (RED)
3. Add `UNIT_ASSERT` to `NodeType` in `parser.js`
4. Add parser detection in the `expect` dispatch handler
5. Add `UNIT_ASSERT` compiler case + `_unitAssert` helper in `compiler.js`
6. Update TOCs in both files
7. Run tests → GREEN
8. Run template smoke test (all 8 templates, 0 errors)
9. Update docs (intent.md, SYNTAX.md, AI-INSTRUCTIONS.md, USER-GUIDE.md, ROADMAP.md)
10. Verify Meph behavioral TDD check in Studio
