# Handoff -- 2026-04-12

## Current State
- **Branch:** `main`
- **Tests:** 1725 compiler (all passing), 0 failures
- **Roadmap:** All 12 gaps closed. Refactoring backlog (R1-R3) identified.

## What Was Done This Session

### Roadmap Items 1-4 (from previous session, already on main)
1. Auth scaffolding (`allow signup and login`)
2. DB relationships (`belongs to`)
3. Validation fix (collect all errors as array)
4. Aggregate fix (`sum of amount in orders`)

### Roadmap Items 5-12 (this session)
5. **Full text search** — `search Posts for query` compiles to case-insensitive filter across all fields
6. **Broadcast** — `broadcast to all message` new BROADCAST node type, compiles to `wss.clients.forEach`
7. **Agent memory fix** — postamble (conversation save) injected before return, was dead code
8. **Agent tool schema fix** — params serialize as proper names, was `[object Object]`
9. **String concat** — verified working in all modes, regression tests added
10. **Python frontend serving** — FastAPI serves `index.html` + static files via `StaticFiles`
11. **`has many`** — nested endpoints auto-generated (GET /api/parent/:id/children)
12. **Agent guardrails** — `block arguments matching 'pattern'` adds regex filter on tool inputs

### Click-to-Highlight Source Mapping
- Click a Clear source line → switches to Code tab, scrolls to and highlights corresponding compiled output
- Click a compiled line → jumps back to the Clear source line with flash animation
- Meph `source_map` tool — query what any Clear line compiles to
- Only works for JS/Python output (not HTML — frontend pages have no markers)

### IDE Fixes
- Context meter CSS bug fixed (duplicate `display` property)
- Warning text color darkened for readability
- Data view field names stripped of trailing commas
- Compile animation capped at ~5 seconds

### Refactoring
- Function params normalized to always `{name, type}` objects (was mixed strings/objects)
- SYNONYM_VERSION test checks semver format, not hardcoded value
- `requires login` preferred over `requires auth` in all docs + 33 template apps

## Known Issues
- Click-to-highlight only works for compiled JS/Python, not HTML output
- Server test suite has 2 pre-existing failures (stale template count, SSE JSON parse crash)
- Compile animation still plays even when user just wants to see the code

## Resume Prompt

> All 12 roadmap gaps are closed. 1725 tests pass. Next priorities:
> 1. GAN loop test — spin up Studio, have Meph build an app, grade it, iterate
> 2. Refactoring backlog (R1: decompose compileAgent, R2: dedup JS/Python CRUD, R3: frontend source maps)
> 3. Real app stress test — build something complex end-to-end, find what breaks
> 4. Fix server.test.js pre-existing failures (template count, SSE parsing)
