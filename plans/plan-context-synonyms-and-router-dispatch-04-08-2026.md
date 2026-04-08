# Plan: Context-Sensitive Synonyms + Router Dispatch Completion

**Branch:** `feature/context-synonyms-router-dispatch`
**Date:** 2026-04-08
**Status:** Red-teamed. 5 issues found, all patched.

---

## 🎯 THE PROBLEM

Two remaining refactor tasks from Phase 47:

1. **Synonym collisions** are the #1 recurring bug class (10+ entries in learnings.md). Root cause: the tokenizer rewrites `delete` → `remove`, `toggle` → `checkbox`, etc. without knowing context. The parser has guards everywhere to un-confuse them.

2. **34 complex branches** remain as if/else in parseBlock. These are "router" branches that check `tokens[1+]` for sub-routing (e.g., `show` → toast/display/show). They can't go in a flat Map but CAN be wrapped in router functions that go in the Map.

---

## 🔧 THE FIX

### Task 1: Backward-Compatible Context-Sensitive Synonyms

**Key insight: Don't remove `.canonical` from the tokenizer. ADD `.rawValue` instead.**

The tokenizer keeps setting `.canonical` (290 references don't break). It also stores the original word as `.rawValue`. The parser's `resolveCanonical(token, zone)` checks zone overrides first, then falls back to `token.canonical`. Migration is gradual — add zone overrides one collision at a time, each independently testable.

```
BEFORE (tokenizer):
  "delete" → { type: KEYWORD, value: "delete", canonical: "remove" }

AFTER (tokenizer):
  "delete" → { type: KEYWORD, value: "delete", canonical: "remove", rawValue: "delete" }

resolveCanonical(token, 'ui'):
  if ZONE_OVERRIDES.ui[token.rawValue] → return override
  else → return token.canonical  (same as before)
```

**Why this is safe:** Every existing `.canonical` check keeps working. The `rawValue` field is only used by `resolveCanonical()` when a zone override exists. Zero behavior change until we add specific overrides.

### Task 2: Router Functions for Complex Branches

**Key insight: A router function IS a Map handler that inspects tokens[1+].**

```javascript
CANONICAL_DISPATCH.set('show', (ctx) => {
  // Sub-route: toast
  if (ctx.tokens.length >= 3 && ctx.tokens[1].value === 'toast') {
    return handleShowToast(ctx);
  }
  // Sub-route: display with modifiers
  if (hasDisplayModifiers(ctx.tokens)) {
    return handleShowDisplay(ctx);
  }
  // Default: plain show
  return handleShowPlain(ctx);
});
```

Each router function returns `newI` (handled) or `undefined` (fall through). The if/else chain gets shorter as routers move into the Map.

---

## 📁 FILES INVOLVED

| File | Task | What changes |
|------|------|-------------|
| tokenizer.js | 1 | Add `rawValue` field to KEYWORD tokens |
| parser.js | 1, 2 | Update `resolveCanonical()` + add router functions + remove if/else branches |
| synonyms.js | 1 | Add zone-specific override tables |
| clear.test.js | 1 | Update 2 tokenizer tests, add zone resolution tests |

---

## 🚨 EDGE CASES

| Scenario | How we handle it |
|----------|-----------------|
| Multi-word synonyms (`is greater than`) | Keep resolving in tokenizer — they're unambiguous |
| `delete` in display context | `resolveCanonical(token, 'ui')` returns `'action_delete'` |
| `delete` in CRUD context | `resolveCanonical(token, 'crud')` returns `'remove'` (same as now) |
| `toggle` in panel action | RAW_DISPATCH handler checks raw value, not canonical |
| `when` is synonym for `if` | RAW_DISPATCH already handles `when` by raw value |
| `background` collides with CSS | RAW_DISPATCH already handles by raw value |
| `as` has canonical `as_format` | No change — already works, just document in ZONE_OVERRIDES |
| `max` has canonical `maximum` | No change — comparison zone could override but low priority |
| Router returns undefined | Falls through to next dispatch phase (PATTERNS, then assignment) |
| Router function throws | Caught by try/catch in parseBlock main loop |

---

## 📋 IMPLEMENTATION — PHASE ORDER

### Phase A: Add `rawValue` to tokenizer (Task 1 foundation)

**Read first:** tokenizer.js lines 295-330

Two insertion points in tokenizer.js `tokenizeLine()`:

**Point 1 — Multi-word synonyms (line 297):** Add `rawValue: matchedSynonym`
```javascript
// BEFORE (line 295-303):
if (matchedSynonym) {
  const canonical = REVERSE_LOOKUP[matchedSynonym];
  tokens.push({
    type: TokenType.KEYWORD,
    value: matchedSynonym,
    canonical,
    line: lineNumber,
    column: pos + 1,
  });

// AFTER:
if (matchedSynonym) {
  const canonical = REVERSE_LOOKUP[matchedSynonym];
  tokens.push({
    type: TokenType.KEYWORD,
    value: matchedSynonym,
    canonical,
    rawValue: matchedSynonym,      // ← ADD THIS
    line: lineNumber,
    column: pos + 1,
  });
```

**Point 2 — Single-word synonyms (line 317):** Add `rawValue: lower`
```javascript
// BEFORE (line 316-323):
if (canonical) {
  tokens.push({
    type: TokenType.KEYWORD,
    value: word,
    canonical,
    line: lineNumber,
    column: start + 1,
  });

// AFTER:
if (canonical) {
  tokens.push({
    type: TokenType.KEYWORD,
    value: word,
    canonical,
    rawValue: lower,               // ← ADD THIS
    line: lineNumber,
    column: start + 1,
  });
```

Run tests → 1337 pass (no behavior change, just new field)

### Phase B: Wire `resolveCanonical()` to use `rawValue` (Task 1 activation)

**Read first:** parser.js ZONE_OVERRIDES section, synonyms.js full file

1. In synonyms.js, export `ZONE_OVERRIDES` with the first real override:
   ```javascript
   export const ZONE_OVERRIDES = {
     ui: { delete: 'action_delete' },
   };
   ```
2. Update `resolveCanonical()` in parser.js:
   ```javascript
   function resolveCanonical(token, zone) {
     if (zone && token.rawValue) {
       const overrides = ZONE_OVERRIDES[zone];
       if (overrides && overrides[token.rawValue]) {
         return overrides[token.rawValue];
       }
     }
     return token.canonical || null;
   }
   ```
3. In `parseDisplay()` (line ~3832), replace `canon === 'remove'` with `resolveCanonical(tokens[pos], 'ui') === 'action_delete'` OR keep checking `remove` (both work since display context has the guard)
4. Add 3 tests:
   - `resolveCanonical` with no zone returns token.canonical
   - `resolveCanonical` with 'ui' zone and 'delete' rawValue returns 'action_delete'
   - `resolveCanonical` with 'crud' zone and 'delete' rawValue returns 'remove' (fallback)
5. Run tests → 1337 pass + 3 new

### Phase C: Router functions for `show`, `if`, `define` (Task 2, batch 1)

**Read first:** parser.js lines 1463-1580 (show/define blocks)

Create router functions and add them to CANONICAL_DISPATCH:

1. `handleShow(ctx)` — routes to toast / display / plain show
2. `handleIf(ctx)` — routes to guard / block if / inline if-then
3. `handleDefine(ctx)` — routes to component / function / define-as

For each:
- Copy exact logic from existing if/else branch into the router
- Add router to CANONICAL_DISPATCH
- Remove old if/else branch
- Run tests after each router

### Phase D: Router functions for `set`, `remove`, `respond` (Task 2, batch 2)

**Read first:** parser.js lines 1815-1980 (set/remove/respond blocks)

1. `handleSet(ctx)` — routes to data_shape / map_set / falls through to assignment
2. `handleRemove(ctx)` — routes to CRUD delete / list remove
3. `handleRespond(ctx)` — routes to sendgrid / SMTP email / API call / send back

**Critical for `handleSet`:** This router must return `undefined` for the assignment case so it falls through to the PATTERNS section. The `set` canonical matches both `set key in scope to value` (map set) and `set x = 5` (assignment). The router handles map_set and data_shape, returns `undefined` for everything else.

### Phase E: Router functions for remaining branches (Task 2, batch 3)

**Read first:** parser.js — remaining if/else branches

Migrate these into RAW_DISPATCH or CANONICAL_DISPATCH:

1. `database` (raw) — inline parsing, add to RAW_DISPATCH
2. `call_api` (canonical) — config block parsing, add to CANONICAL_DISPATCH
3. `chart` (raw) — conditional match, add to RAW_DISPATCH
4. `script` (raw) — block collection, add to RAW_DISPATCH
5. `agent` (raw) — add to RAW_DISPATCH
6. `tab` (raw) — add to RAW_DISPATCH
7. `retry`, `first`, `when` (raw) — add to RAW_DISPATCH
8. `text_input`/`number_input`/`heading`/`subheading`/content types (canonical) — add to CANONICAL_DISPATCH
9. `as_format` (transaction), `with` (timeout), `function`, `background_job` — add to CANONICAL_DISPATCH
10. `get_key`, `add`, `sort_by` already dispatched — verify and clean up any remaining refs

Each removal: run tests immediately.

### Phase F: Clean up — verify 0 remaining if/else keyword branches

1. Grep for `firstToken.canonical ===` and `firstToken.value ===` inside parseBlock
2. Only remaining should be: `isAssignmentLine` check (the fallback) and STRING-first patterns
3. Update parser.js TOC to reflect new dispatch architecture
4. Run tests → 1337 pass

---

## 🧪 TESTING STRATEGY

**Command:** `node clear.test.js`
**Expected:** 1337 pass + 3 new zone resolution tests = 1340

**Per-step testing:**
- Run tests after EVERY individual change (not per phase)
- If > 3 tests fail, STOP and revert — the change is wrong
- Compile canonical todo app, verify byte-identical output

**Success criteria:**
- [ ] All tests pass after each phase
- [ ] `rawValue` field present on all KEYWORD tokens
- [ ] `resolveCanonical()` returns zone overrides when zone is specified
- [ ] parseBlock has 0 if/else keyword branches (only assignment fallback + STRING patterns)
- [ ] Compiled output identical for all existing programs
- [ ] TOC in parser.js updated
- [ ] SYNONYM_VERSION bumped in synonyms.js

---

## 📎 RESUME PROMPT

```
Implementing context-sensitive synonyms + router dispatch:
plans/plan-context-synonyms-and-router-dispatch-04-08-2026.md

Phase A: Add rawValue to tokenizer KEYWORD tokens
Phase B: Wire resolveCanonical() with zone overrides
Phase C: Router functions for show, if, define
Phase D: Router functions for set, remove, respond
Phase E: Remaining branches into dispatch Maps
Phase F: Clean up, verify 0 remaining keyword branches

Read the plan, then start Phase [X]. Run tests after every change.
```

**Final step:** Run `update-learnings` skill to capture lessons.
