# Handoff — 2026-04-08 (Session 10, continued)

## Current State
- **Branch:** main
- **Tests:** 1337 passing
- **Apps:** 33 template apps, all compile
- **Working tree:** Clean

## What Was Done This Session

### Phase 47: Compiler Internal Refactor (5 systemic fixes)
- Unified HTTP_REQUEST + RAW_QUERY compilation paths (compileHttpRequest, compileRawQueryExpr)
- Normalized parser return types (removed isCrud wrapper, parseTarget returns { node })
- Tokenizer preserves colons as COLON tokens (trailing stripped at token level)
- Added COLON, LBRACE, RBRACE to TokenType enum

### Phase 47b: Context-Sensitive Synonyms + Full Dispatch Table
- Added `rawValue` field to all KEYWORD tokens in tokenizer
- Wired `resolveCanonical(token, zone)` with ZONE_OVERRIDES (first override: ui.delete → action_delete)
- **93 of 97** parseBlock branches migrated to CANONICAL_DISPATCH (60+ entries) and RAW_DISPATCH (10+ entries)
- Only **1 keyword branch** remains: the assignment fallback
- Pattern matchers stay: STRING-first inputs, math-style functions, text_block, do_all
- Router functions for complex branches: show, if, define, set, remove, respond (6 routers)
- Parser reduced from 6185 to 5888 lines (-297 lines of dead if/else code)
- 8 bugs found and fixed during migration (tab title, script empty error, content_text guard, timeout ms, function def routing, define-as routing, when→if synonym routing, set+function routing)

### Design Discussion + Planning
- Wrote design discussion: zero deps + one-op-per-line consequences
- Created + red-teamed compiler refactor plan (Phase 47)
- Created + red-teamed context synonyms + router dispatch plan (Phase 47b)

## Key Architecture Decisions
- **Two dispatch Maps**: RAW_DISPATCH (raw firstToken.value) checked before CANONICAL_DISPATCH (firstToken.canonical)
- **Router functions**: Complex branches that check tokens[1+] are wrapped in router functions inside the Maps
- **rawValue field**: Tokens keep .canonical (backward compatible) AND .rawValue (for zone overrides)
- **resolveCanonical()**: Single point for synonym resolution, zone-aware, currently identity for most cases

## Known Issues
- Browser server may 404 on some routes (untested in real browser)
- `ui's Card()` in web target crashes buildHTML (namespaced component calls)
- Full context-sensitive synonym activation (changing tokenizer to defer all single-word resolution) deferred to future session

## Resume Prompt
```
Read HANDOFF.md, learnings.md, intent.md. Session 10 completed Phase 47
(compiler refactor) and Phase 47b (dispatch tables + context synonyms).
93/97 parseBlock branches in Maps. 1337 tests. Parser 5888 lines.
Next: new feature work from ROADMAP.md, or full synonym zone activation.
```
