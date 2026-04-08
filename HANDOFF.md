# Handoff — 2026-04-08 (Session 10)

## Current State
- **Branch:** main
- **Tests:** 1337 passing
- **Apps:** 33 template apps, all compile
- **Working tree:** Clean

## What Was Done This Session

### Compiler Internal Refactor (Phase 47)
Five systemic fixes from learnings.md analysis. All internal-only — no language surface changes, identical compiled output.

1. **Parser Dispatch Tables** — Replaced parseBlock's 97-branch if/else waterfall with `CANONICAL_DISPATCH` (60 entries) and `RAW_DISPATCH` (2 entries) Maps. 63 branches migrated. Assignment is guaranteed last. Adding a new keyword = adding one Map entry.

2. **Normalized Return Types** — Removed `isCrud` wrapper from parser return types. `parseTarget` returns `{ node }` instead of `{ value }`. Callers check `parsed.node` instead of `parsed.isCrud`.

3. **Unified Compilation Paths** — Extracted `compileHttpRequest()` and `compileRawQueryExpr()` from compiler.js. Both statement and expression paths call the same function. No more dual-path drift.

4. **Tokenizer Preserves Colons** — Colons tokenized as COLON tokens instead of stripped from raw strings. Trailing COLON (block opener) popped at token level. Mid-line colons preserved for route params. Added COLON, LBRACE, RBRACE to TokenType.

5. **resolveCanonical Foundation** — Added `resolveCanonical(token, zone)` function and `ZONE_OVERRIDES` definitions for ui, crud, and comparison contexts. Currently identity behavior — ready for full activation.

### Design Discussion
- Wrote `docs/design-discussion-zero-deps-one-op.md` — analysis of why zero dependencies and one-op-per-line are the load-bearing walls of Clear's architecture
- Created and red-teamed `plans/plan-compiler-refactor-04-08-2026.md`

## What's Not Done (deferred)
- **Full context-sensitive synonyms:** Changing tokenizer to defer single-word synonym resolution to parser. Highest risk change — needs its own focused session. `resolveCanonical()` foundation is ready.
- **Remaining 34 router branches:** Complex branches that check tokens[1+] (show, if, define, set, remove, respond, database, call_api, when). These have multi-condition logic that doesn't fit a simple Map entry.

## Key Architecture Decisions
- **Two Maps, not one:** 13 branches dispatch on raw value (not canonical) because the word isn't in the synonym table or its canonical conflicts. `RAW_DISPATCH` checked before `CANONICAL_DISPATCH`.
- **targetValue propagation:** Map handlers set `ctx._targetValue`, dispatch lookup propagates back to parseBlock local variable.
- **Token-level colon stripping:** Tokenizer pops trailing COLON after tokenizeLine(), before storing in result array. All sub-parsers see clean tokens.

## Known Issues
- Browser server may 404 on some routes (untested in real browser)
- `ui's Card()` in web target crashes buildHTML (namespaced component calls)
- DaisyUI v5 themes use `--color-base-100: oklch(%)` format

## Resume Prompt
```
Read HANDOFF.md, learnings.md, intent.md. Session 10 completed compiler
internal refactor (Phase 47): dispatch tables, normalized returns, unified
compilation, tokenizer colon preservation, resolveCanonical foundation.
1337 tests passing. Next: full context-sensitive synonyms (Phase 2
deepening) or new feature work from ROADMAP.md.
```
