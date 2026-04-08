# Plan: Compiler Internal Refactor — 5 Systemic Fixes

**Branch:** `feature/compiler-refactor`
**Date:** 2026-04-08
**Status:** Red-teamed. 7 issues found, all patched.

---

## 🎯 THE PROBLEM

learnings.md documents 5 recurring bug patterns that share root causes in the compiler's internal architecture. These aren't one-off bugs — they're structural problems that produce new bugs every time someone adds a feature. All 5 refactors are internal-only. No language surface changes. All 1337 tests must pass unchanged.

---

## 🔧 THE 5 REFACTORS (priority order)

### Phase 1: Parser Dispatch Table

**Bug class eliminated:** "New keywords must go before the assignment check" (learnings.md: Parser/DSL Extension, Session 7)

**What:** `parseBlock()` in parser.js (lines 723-2251) is a 97-branch if/else waterfall. Order matters — if a new keyword check goes after `isAssignmentLine()` at branch #96 (line 2133), assignment parsing swallows it. This has caused bugs multiple times.

**Fix:** Replace with two-phase dispatch:

```
Phase A: Map lookup (instant, order-independent)
  DISPATCH = new Map([
    ['repeat',          parseRepeatLoop],
    ['for_each',        parseForEachLoop],
    ['while',           parseWhileLoop],
    ['if',              parseIfBlock or parseIfThen],
    ['try',             parseTryHandle],
    ['page',            parsePage],
    ['section',         parseSection],
    ['when_user_calls', parseEndpoint],
    ['data_shape',      parseDataShape],
    ['send_back',       parseRespond],
    ['validate',        parseValidateBlock],
    ['button',          parseButton],
    ['show',            handleShow],       // routes to display/toast/show
    ['save_to',         parseSave],
    ['remove',          handleRemove],     // routes to CRUD/list remove
    ['define',          handleDefine],     // routes to component/function/define-as
    ... (all 70+ canonical-keyed branches)
  ])

Phase B: Pattern matchers (only if Map misses)
  PATTERNS = [
    { test: isLabelIsInput,      parse: parseLabelIsInput },
    { test: isMathStyleFunction, parse: parseMathStyleFunction },
    { test: isAssignmentLine,    parse: parseAssignment },  // ALWAYS LAST
  ]
```

**Files:** parser.js only
**Risk:** Low. Same functions get called, same AST comes out. Map is just a different dispatch mechanism.
**Test:** All 1337 tests pass. No new tests needed — this is pure internal restructuring.

**CRITICAL: 13 branches dispatch on `firstToken.value` (raw), not `firstToken.canonical`.**
These CANNOT go in the canonical-keyed Map. They need a separate raw-value Map or pre-check:
- `database` (line 765) — raw value, not a keyword
- `chart` (line 1087) — raw value
- `agent` (line 1208) — raw value
- `retry` (line 1272) — raw value
- `first` (line 1296) — raw value (for `first to finish`)
- `script` (line 1335) — raw value
- `store` (line 1353) — raw value
- `restore` (line 1365) — raw value
- `tab` (line 1493) — raw value
- `toggle`/`open`/`close` (line 1503) — raw values (panel actions)
- `background` (line 1610) — raw value (collides with CSS synonym!)
- `when` (lines 1689, 1876) — raw value (webhook + on-change; `when` is synonym for `if`)

**Fix:** Two Maps, not one:
```
RAW_DISPATCH = new Map([
  ['database',  handleDatabase],
  ['chart',     handleChart],
  ['agent',     parseAgent],
  ['script',    handleScript],
  ['store',     handleStore],
  ['restore',   handleRestore],
  ['tab',       handleTab],
  ['when',      handleWhen],        // webhooks, on-change
  ['toggle',    handlePanelAction],
  ['open',      handlePanelAction],
  ['close',     handlePanelAction],
  ['retry',     handleRetry],
  ['first',     handleFirstToFinish],
  ['background', handleBackground],
])

CANONICAL_DISPATCH = new Map([
  ['repeat',          parseRepeatLoop],
  ['for_each',        parseForEachLoop],
  ... (all canonical-keyed branches)
])
```

Lookup order: RAW_DISPATCH first (raw value), then CANONICAL_DISPATCH (canonical), then PATTERNS array.

**Implementation steps:**
1. Build RAW_DISPATCH Map for the 13 raw-value branches
2. Build CANONICAL_DISPATCH Map for the ~60 canonical-keyed branches
3. Build PATTERNS array (3 entries: label-input, math-function, assignment — ALWAYS LAST)
4. Replace parseBlock's if/else chain with: RAW_DISPATCH → CANONICAL_DISPATCH → PATTERNS
5. Write router functions for multi-target branches (show, if, remove, define, respond, set)
6. Run tests after each sub-step

**Tricky branches that need wrapper functions (8 total):**
- `show` — routes to parseDisplay (if followed by display modifiers), toast node, or show node
- `remove` — routes to CRUD delete (4+ tokens with table pattern) or list remove
- `define` — routes to parseComponentDef, parseFunctionDef, or parseDefineAs
- `if` — routes to guard (if + otherwise error), parseIfBlock (no `then`), or inline if-then
- `respond`/`send` — routes to email (via sendgrid), API call, or parseRespond based on tokens[1]
- `set` — routes to parseDataShape (if followed by data_shape pattern) or falls through to PATTERNS
- `when` — routes to webhook (has 'notifies'), on-change (has 'changes'), or falls through
- `background` — only matches if followed by STRING token (else falls through to PATTERNS)
### Phase 2: Context-Sensitive Synonyms

**Bug class eliminated:** All 10+ synonym collision bugs in learnings.md (background/CSS, toggle/checkbox, delete/remove, data from, count by, send email, theme/style, as/as_format, max/maximum, etc.)

**What:** The tokenizer rewrites ALL words using a flat synonym table before the parser sees them. `delete` becomes `remove` everywhere — whether it's a CRUD operation, a table action button, or a list removal. The parser then has to un-confuse them with guards and special cases.

**Fix:** Two changes:

**A. Tokenizer changes (tokenizer.js):**
- Stop calling REVERSE_LOOKUP for single-word synonyms
- Keep multi-word synonym matching (these are unambiguous: "is greater than", "for each", etc.)
- Emit raw words as IDENTIFIER tokens with a new `rawValue` field
- Single words that COULD be keywords get `type: TokenType.WORD` (new token type)

**⚠️ TEST BREAKAGE WARNING:** 3 tokenizer tests check `token.canonical` directly:
- Line 91: `expect(tokens[0].canonical).toBe('set')` — tests `create` → `set` rewriting
- Line 96: `expect(tokens[0].canonical).toBe('show')` — tests `display` → `show`
- Line 120: `tokens.find(t => t.canonical === 'is greater than')`

The multi-word test (line 120) still passes since multi-word synonyms stay in tokenizer.
The single-word tests (lines 91, 96) WILL BREAK because single-word rewriting moves to parser.

**Fix:** These 2 tests must be updated to check that the tokenizer emits `TokenType.WORD` with
the raw value, and that `resolveCanonical()` in the parser resolves them correctly. This is the
ONE exception to "no test changes" — 2 tokenizer unit tests need updating to match the new
contract. All 1335 other tests pass unchanged because they test parse/compile output, not
tokenizer internals.

**B. Parser changes (parser.js):**
- New function: `resolveCanonical(token, zone)` 
- Zones: `'statement'`, `'crud'`, `'ui'`, `'comparison'`, `'expression'`
- Each zone has its own synonym subset:
  - `crud` zone: delete->remove, save->save_to, look up->look_up
  - `ui` zone: toggle->checkbox, delete->"action_delete" (not remove)
  - `comparison` zone: is->equals, is not->not_equals
  - `statement` zone: the current full table (fallback)
- Parser calls `resolveCanonical(token, currentZone)` instead of reading `token.canonical`

**Why zones work:** The parser already knows context. Inside `parseDisplay()` after `with`, it's in UI zone. Inside `parseEndpoint()` body, it's in CRUD zone. The zone just tells synonym resolution what context we're in.

**Files:** tokenizer.js, parser.js, synonyms.js
**Risk:** Medium. This is the biggest change. Must be very careful that every parser function resolves synonyms correctly.

**Implementation steps:**
1. Add `TokenType.WORD` to tokenizer.js
2. Split SYNONYM_TABLE into ZONE_SYNONYMS in synonyms.js
3. Keep multi-word synonyms resolving in tokenizer (they're unambiguous)
4. Change single-word resolution: tokenizer emits WORD, parser resolves
5. Add `resolveCanonical(token, zone)` helper to parser.js
6. Update each parseBlock branch to resolve in correct zone
7. Run tests after each file change

**The safe migration path:** Do this incrementally. Start by having `resolveCanonical()` just call the existing REVERSE_LOOKUP (same behavior). Then zone by zone, move synonyms into zone-specific tables. Each zone migration is independently testable.

**⚠️ PUBLIC API IMPACT:** `index.js` re-exports `REVERSE_LOOKUP` and `SYNONYM_TABLE`. The test
file imports them (`clear.test.js` line 12). If you restructure synonyms.js, these exports
must still work. Options:
- Keep `REVERSE_LOOKUP` as the full/statement-zone table (backward compatible)
- Add `ZONE_SYNONYMS` as a new export alongside the existing ones
- `SYNONYM_VERSION` must be bumped (currently '0.10.0')

**⚠️ PHASE 1 CONFLICT:** If Phase 1 (dispatch table) dispatches on `firstToken.canonical`,
and Phase 2 stops setting `canonical` on single-word tokens, the dispatch table breaks.

**Resolution:** Phase 2 must ensure tokens still have a `canonical` field. The change is:
- Tokenizer sets `canonical` to the raw word (identity mapping) instead of REVERSE_LOOKUP
- Parser's `resolveCanonical(token, zone)` returns the zone-aware canonical
- Dispatch table in parseBlock uses `resolveCanonical(firstToken, 'statement')` not `firstToken.canonical`

This means Phase 1's CANONICAL_DISPATCH Map keys must match what `resolveCanonical()` returns
in statement zone — which is the same as current `firstToken.canonical`. No conflict.
### Phase 3: Normalize Parser Return Types

**Bug class eliminated:** "Used wrong field name on return value" (learnings.md: parseExpression returns {node, nextPos} not {expr, pos}; define-as must return {node:assignNode()} not {name, expression}; CRUD nodes must use {isCrud:true, node})

**What:** Parser functions return 5+ different shapes. Callers guess which shape each function uses.

**Fix:** Universal return shape:

```
// Single-line parser:
{ node, error }          // node is null if error is set

// Multi-line parser:
{ node, endIdx, error }  // endIdx = line index AFTER this construct

// No more:
//   { isCrud: true, node }     -> check node.type === NodeType.CRUD
//   { name, expression }       -> return { node: assignNode(name, expr) }
//   { expr, pos }              -> return { node, nextPos }
//   { value, error }           -> return { node: targetNode(value) }
```

**Files:** parser.js only (all parser functions + all call sites)
**Risk:** Low. Mechanical find-and-replace. Each function change is independently testable.

**Implementation steps:**
1. Grep for every `return {` in parser.js to find all return shapes
2. Normalize parseExpression: rename `nextPos` field if inconsistent
3. Normalize parseSave/parseLookUp: remove `isCrud` wrapper, caller checks `node.type`
4. Normalize parseDefineAs: return `{ node: assignNode(...) }` not `{ name, expression }`
5. Normalize parseTarget: return `{ node: targetNode(value) }` not `{ value }`
6. Update every call site to use the new shape
7. Run tests after each function change
### Phase 4: Tokenizer Preserves Everything

**Bug class eliminated:** "Tokenizer strips trailing colons" breaking route params (learnings.md: Synonym/Tokenizer Traps); "Tokenizer strips { and }" breaking text interpolation (learnings.md: Adapters Phases 25-28)

**What:** tokenizer.js line 381: `trimmed.endsWith(':') ? trimmed.slice(0, -1)` strips trailing colons. This breaks `/api/todos/:id:` (loses both colons). Curly braces `{` and `}` are not tokenized, causing text interpolation to use `lines[j].raw` workaround.

**Fix:**

**A. Stop stripping trailing colons (tokenizer.js line 381):**
- Remove the `trimmed.endsWith(':')` slice
- Instead, `tokenizeLine()` naturally emits a COLON token at end of line
- Add `COLON: 'colon'` to TokenType enum
- Add colon detection in tokenizeLine: `if (line[pos] === ':')` -> emit COLON token

**⚠️ COLON INSIDE ROUTE PARAMS:** `/api/todos/:id` has a colon mid-line. The tokenizer will
now emit a COLON token there too. This is fine — `parseEndpoint` already uses `lines[i].raw`
to extract the full route path (learnings.md: "store raw text and extract paths from raw source
in parseEndpoint"). The COLON tokens in mid-line are ignored by parseEndpoint.

**⚠️ COLON AFTER INLINE VALUES:** `define x as: price + tax` has a colon after `as`. Currently
this colon is stripped. With the change, `parseAssignment` will see a COLON token between `as`
and the expression. The parser must skip COLON tokens in this position.

**B. Parser handles block-opener colons:**
- In `parseBlock()`, when a line's last token is COLON, treat it as block opener
- Strip the COLON from the token array before passing to sub-parsers
- This is the same behavior as now, just decided by parser not tokenizer
- ALSO: skip COLON tokens after `as_format` in parseAssignment/parseDefineAs

**C. Add LBRACE/RBRACE tokens:**
- Add to TokenType enum: `LBRACE: 'lbrace'`, `RBRACE: 'rbrace'`
- Tokenize `{` and `}` as tokens instead of skipping them
- Parser ignores them in expression context, uses them for interpolation

**Files:** tokenizer.js, parser.js
**Risk:** Medium. The colon change touches every block-opener in the language. But the parser change is mechanical — "if last token is COLON, pop it and treat as block."

**Implementation steps:**
1. Add COLON, LBRACE, RBRACE to TokenType
2. Add tokenization for `:`, `{`, `}` in tokenizeLine
3. Remove the trailing-colon strip from `tokenize()` (line 381)
4. In parseBlock, add: `if (tokens[tokens.length-1]?.type === TokenType.COLON) tokens.pop()`
5. Find all `lines[j].raw` usages and replace with proper token-based parsing
6. Run tests after each step
### Phase 5: Unify Statement/Expression Compilation

**Bug class eliminated:** "Easy to fix one path and miss the other" (learnings.md: Session 9 — Two HTTP_REQUEST Paths)

**What:** 2 node types have duplicate implementations:
- `HTTP_REQUEST`: compiler.js:2265 (statement) AND compiler.js:3067 (expression) — DIFFERENT code
- `RAW_QUERY`: compiler.js:2215 (statement) AND compiler.js:3120 (expression) — DIFFERENT code

The statement version (in `_compileNodeInner`) includes Python support and padding. The expression version (in `exprToCode`) is JS-only with different error handling. Bugs fixed in one miss the other.

**Fix:** One function per feature. The ASSIGN case in `_compileNodeInner` wraps the result.

```
// Before (two paths):
case NodeType.HTTP_REQUEST:  // in _compileNodeInner — 50 lines
case NodeType.HTTP_REQUEST:  // in exprToCode — 30 lines (different!)

// After (one path):
function compileHttpRequest(node, ctx) { ... }  // ONE implementation

// In _compileNodeInner:
case NodeType.HTTP_REQUEST:
  return compileHttpRequest(node, ctx);

// In exprToCode:
case NodeType.HTTP_REQUEST:
  return compileHttpRequest(expr, { ...ctx, indent: 0 });
```

**Specific merge decisions:**
- HTTP_REQUEST: Keep the statement version (has Python support + _clearCtx error context). Expression version calls same function with indent=0.
- RAW_QUERY: Keep statement version (handles both `run` and `fetch` operations). Expression version calls same function for fetch-only case.

**⚠️ STATEMENT vs EXPRESSION DIFFERENCES (must be preserved):**

HTTP_REQUEST statement (line 2265) vs expression (line 3067):
- Statement has Python path (`ctx.lang === 'python'` → httpx). Expression is JS-only.
- Statement uses `${pad}` for indentation. Expression uses no padding.
- Statement has `finally` without catch. Expression has explicit catch + re-throw.
- Both have `_clearCtx` error context — good.

The unified function must:
1. Accept a `padOverride` param (empty string for expression context)
2. Keep the Python path from the statement version
3. Keep the catch + re-throw from the expression version (it's more correct)

RAW_QUERY statement (line 2215) vs expression (line 3120):
- Statement handles both `run` (execute, no return) and `fetch` (query, returns rows)
- Statement assigns to `node.variable` with `const`
- Expression only handles `fetch`, returns raw expression (no variable assignment)

The unified function must:
1. Return the raw expression (no `const X =` prefix)
2. Let the ASSIGN case in `_compileNodeInner` add the `const X =` prefix
3. Handle `run` operation only in statement context (no expression form for `run`)

**Files:** compiler.js only
**Risk:** Low. Only 2 node types affected. Each merge is independently testable.

**Implementation steps:**
1. Extract `compileHttpRequest(node, ctx)` from the statement case
2. Replace both HTTP_REQUEST cases with calls to the extracted function
3. Extract `compileRawQuery(node, ctx)` from the statement case
4. Replace both RAW_QUERY cases with calls to the extracted function
5. Run tests after each extraction

---

## 📁 FILES INVOLVED

| File | Phase(s) | What changes |
|------|----------|-------------|
| parser.js (6022 lines) | 1, 2, 3, 4 | Dispatch table, zone resolution, return types, colon handling |
| tokenizer.js (409 lines) | 2, 4 | Stop synonym rewriting, preserve colons/braces |
| compiler.js (5626 lines) | 5 | Extract + unify HTTP_REQUEST and RAW_QUERY |
| synonyms.js (406 lines) | 2 | Split into zone-based tables |
| validator.js (1245 lines) | - | No changes expected |
| clear.test.js | All | No test changes — all 1337 must pass as-is |

No new files created.

---

## 🚨 EDGE CASES

| Scenario | How we handle it |
|----------|-----------------|
| `show` routes to 3 parsers | Router function checks tokens[1]: toast, display modifiers, or plain show |
| `if` routes to 3 parsers | Router checks: has `otherwise error` (guard), has no `then` (block if), else inline |
| `remove` routes to 2 parsers | Router checks token count + table pattern (4+ = CRUD, 3 = list remove) |
| `database` checked by raw value not canonical | Dispatch Map has raw-value entries too |
| Multi-word synonyms still need greedy matching | Phase 2 keeps multi-word resolution in tokenizer. Only single-word moves to parser |
| Colon inside route path `/api/:id` | Phase 4: parseEndpoint reconstructs path from raw line |
| Colon inside string literal | Tokenizer already handles — strings parsed before colon detection |
| `{name}` in text interpolation | Phase 4: LBRACE/RBRACE tokens. Parser uses them instead of raw workaround |

---

## 🔄 PHASE ORDERING (revised after red-team)

```
Phase 5 (Unify Compilation)  -- independent, smallest, good warmup
    |
Phase 3 (Return Types)       -- independent, mechanical, low risk
    |
Phase 1 (Dispatch Table)     -- parser restructure, medium risk
    |
Phase 2 (Context Synonyms)   -- depends on Phase 1 dispatch, highest risk
    |
Phase 4 (Tokenizer Preserve) -- depends on Phase 2 tokenizer changes
```

**Why reordered:** Original order put Phase 1 first, but Phase 5 is the safest
warmup (only 2 cases in compiler.js, zero parser impact). Phase 3 is mechanical
and reduces noise before the big Phase 1 restructure. Phase 2 MUST come after
Phase 1 because the dispatch table needs to use `resolveCanonical()`.

**Critical rule:** Run `node clear.test.js` after EVERY sub-step. Not per phase — per change.

**Bailout rule:** If any phase causes more than 10 test failures, STOP. The
change is wrong — don't try to fix 10 tests. Revert and rethink.

---

## 📋 EXISTING CODE TO READ (phased)

### Always read first:
| intent.md | Authoritative spec |
| learnings.md | Related gotchas |

### Phase 1: parser.js lines 723-2251 (parseBlock), 5061-5072 (isAssignmentLine)
### Phase 2: synonyms.js (full), tokenizer.js 260-310, parser.js 723-800
### Phase 3: parser.js — grep `return {` for every return statement
### Phase 4: tokenizer.js 378-387, parser.js — grep `lines[j].raw`
### Phase 5: compiler.js 2215-2313 and 3067-3131

---

## 🧪 TESTING

**Command:** `node clear.test.js`
**Expected:** 1337 pass, 0 fail — before AND after every change.

No new tests. Existing suite IS the acceptance criteria.

**Manual verification after each phase:**
- Compile canonical todo app from PHILOSOPHY.md
- Verify output is byte-identical to pre-refactor

**Checklist:**
- [ ] All 1337 tests pass after each phase (except 2 tokenizer tests updated in Phase 2)
- [ ] Compiled output byte-identical for todo app
- [ ] No new files created
- [ ] TOC in parser.js and compiler.js updated if sections moved
- [ ] learnings.md updated after completion
- [ ] intent.md "Compiler Passes" section updated to reflect new dispatch architecture
- [ ] SYNONYM_VERSION bumped after Phase 2
- [ ] index.js exports still work (REVERSE_LOOKUP, SYNONYM_TABLE)

---

## 📎 RESUME PROMPT

```
Implementing compiler refactor plan at: plans/plan-compiler-refactor-04-08-2026.md

5 phases, all internal-only, all 1337 tests must pass unchanged:
1. Parser dispatch table (replace if/else waterfall with Map)
2. Context-sensitive synonyms (zone-based resolution)
3. Normalize parser return types (universal { node, error } shape)
4. Tokenizer preserves everything (stop stripping colons/braces)
5. Unify statement/expression compilation (merge dual paths)

Read the plan, then start Phase [N]. Run tests after every change.
```
