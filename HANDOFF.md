# Handoff -- 2026-04-12 (Session 2)

## Current State
- **Branch:** `feature/core-7-templates` (not yet merged to main)
- **Tests:** 1725 compiler (all passing)
- **Templates:** All 7 core templates rewritten and compiling clean

## What Was Done This Session

### Roadmap Items 5-12 — All Gaps Closed
- Full text search, broadcast, agent memory fix, tool schema fix, string concat verified,
  Python serving, has many, agent guardrails — all implemented and tested

### Click-to-Highlight Source Mapping
- Bidirectional: click Clear line → highlights compiled output, click compiled → jumps to source
- Meph `source_map` tool for querying mappings
- Three bugs found and fixed (CM6 virtual rendering, animation blocking, missing sourceMap option)

### Core 7 Templates Rewritten
All templates now use new features (search, belongs to, has many, broadcast, guardrails):
1. **todo-fullstack** (95 lines) — categories, relationships, search, validation
2. **crm-pro** (214 lines, was 367) — 3 tables with relationships, search, aggregates
3. **blog-fullstack** (119 lines) — authors/categories with belongs to + has many
4. **live-chat** (55 lines) — WebSocket with subscribe + broadcast (replaced SSE)
5. **helpdesk-agent** (145 lines, was 353) — all 5 agent features
6. **booking** (142 lines) — rooms has many bookings, search, validation
7. **expense-tracker** (132 lines) — categories, aggregates, search

### Other Changes
- `requires login` preferred over `requires auth` across all docs + 33 apps
- Rotating inspirational quotes in Studio status bar
- Meph `browse_templates` tool — can read any template's source
- Philosophy rules 15 (Meph access) + 16 (error messages first-class)
- Compiled view font size matches editor (13px), line numbers darkened
- Data view field names stripped of trailing commas
- Compile animation capped at ~5 seconds
- Context meter CSS fix, warning text color fix
- ROADMAP: N1-N7 (ClearMan, Playwright, auto-tests, download, GAN, batteries)
- Refactoring backlog R1-R3 identified

## Error Message Bugs Found (not yet fixed)

| Bug | Severity | Description |
|-----|----------|-------------|
| Query param false positive | High | `'/api/search?q={x}'` flagged as missing endpoint — should strip `?` before matching |
| "Did you mean 'if'?" for `a` | High | `show a heading` triggers wrong suggestion — should explain UI syntax |
| `has many` standalone vs field | Medium | SYNTAX.md shows standalone form but only field-modifier works |
| PUT auth warning says `requires auth` | Low | Should say `requires login` |

## Resume Prompt

> On branch `feature/core-7-templates`. 7 templates rewritten and compiling. Next:
> 1. Fix the 4 error message bugs in the table above (validator.js, compiler.js)
> 2. Update SYNTAX.md to document correct `has many` field-modifier form
> 3. Write Playwright e2e tests for each core 7 template (compile → run → CRUD works)
> 4. Merge to main, ship
>
> Key files: validator.js (query param check), parser.js (has many), SYNTAX.md, playground/e2e.test.js
