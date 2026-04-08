# Handoff — 2026-04-08 (Session 10)

## Current State
- **Branch:** main
- **Tests:** 1422 passing
- **Apps:** 42 total (6 new GAN stress-test apps this session)
- **Parser:** 6166 lines, 97/97 dispatch Map entries
- **Working tree:** Clean

## What Was Done This Session

### Phase 47: Compiler Internal Refactor
- Unified HTTP_REQUEST + RAW_QUERY compilation (compileHttpRequest, compileRawQueryExpr)
- Normalized parser return types (removed isCrud, parseTarget returns { node })
- Tokenizer preserves colons as COLON tokens, added LBRACE/RBRACE
- rawValue field on all KEYWORD tokens

### Phase 47b: Full Dispatch Table + Context-Sensitive Synonyms
- 97/97 parseBlock branches in CANONICAL_DISPATCH + RAW_DISPATCH Maps
- Router functions for show, if, define, set, remove, respond
- resolveCanonical(token, zone) with ZONE_OVERRIDES (ui, crud, agent)
- Panel actions (toggle/open/close) in RAW_DISPATCH

### Bug Fixes Found by GAN
- **stream: block** not wrapped in Express route (res is not defined)
- **data from** multi-word synonym collision (ate variable names mid-line)
- Both fixed and verified by E2E deployment of all 6 GAN apps

### Syntax Improvements
- CORS canonical: `allow server to accept requests from frontend`
- All old forms kept as silent aliases

### Documentation
- **USER-GUIDE.md** — 18 chapters, 53 tested examples, Rails Tutorial style with humor
- **Tier 8 roadmap** — formal grammar, LSP, type system, source maps, deploy, packages
- **Design discussion** — zero deps + one-op-per-line consequences

## Key Decisions
- Two dispatch Maps (RAW before CANONICAL) — order-independent keyword dispatch
- rawValue field for backward-compatible zone overrides
- data_from only matches at line start (prevents mid-line collision)
- stream: wraps in app.get('/stream', ...) Express route

## Resume Prompt
```
Read HANDOFF.md, CLAUDE.md, learnings.md. Session 10: full compiler
refactor (dispatch tables 97/97, context synonyms, stream fix,
data-from fix). 1422 tests. 42 apps. USER-GUIDE.md with 53 tested
examples. Tier 8 roadmap (grammar→LSP→types→maps→deploy→packages).
Next: formal grammar (PEG/EBNF) or build more GAN apps.
```
