# Handoff — 2026-04-11

## Current State
- **Branch:** `main` (just merged `feature/compiler-requests`)
- **Tests:** 1633 passing / 0 failing (compiler) + 9 sandbox integration tests
- **Synonym version:** 0.13.0

## What Was Done This Session (feature/compiler-requests)

### Compiler Requests from AI Field Testing
Addressed issues discovered when Claude built real apps (HN Digest Agent) inside Clear:

- **P1-4: Better Error Messages** — keyword guard before bare-expression fallback catches unrecognized syntax (`call external url`, `ask AgentName`) with helpful hints instead of confident wrong guesses. `EXPRESSION_SAFE_KEYWORDS` whitelist prevents false positives on content types.
- **P2-1: Nested JSON Save** — `_pick` auto-serializes nested objects to JSON strings for SQLite. `_revive` auto-parses JSON strings back on retrieval. Wrapped `findOne`/`findAll` with `_revive`.
- **P2-3: write_file Supports More Extensions** — Playground `write_file` tool now accepts `.md`, `.json`, `.txt`, `.csv`, `.html`, `.css`, `.js`, `.py` (was `.clear` only).
- **P3-1: Multiline run command** — `run command:` with indented block joins lines with ` && `.

### Structural Safety
- **Optional chaining** — MEMBER_ACCESS compiles to `?.` for null-safe possessive access. Exception: `error.message` uses hard `.`.
- **Chain depth warnings** at 4+ levels of nested property access
- **Expression complexity warnings** at 3+ binary operators per expression

### P5 — HTTP Test Assertions in Clear
User-written `test` blocks now compile into the auto-generated E2E test file:
```
test 'create user':
  call POST /api/users with name is 'Alice'
  expect response status is 201
  expect response body has id
```
Parser: `HTTP_TEST_CALL` and `EXPECT_RESPONSE` node types. Compiler: fetch + assertion output. Test harness: `expect()` shim bridging styles.

### P6 — Curriculum Task Library
20 benchmark tasks across 10 difficulty levels in `curriculum/tasks/`. Each task: JSON with `id, level, title, description, skeleton, tests[]`. From "Hello World API" (L1) to "Full SaaS Project Tracker" (L10). 63 total test assertions. API: `getTask('todo-crud')`, `getLevel(4)`, `listTasks()`.

### P7 — Program Diff/Patch API
`patch.js` — 11 structured operations: `add_endpoint`, `add_field`, `remove_field`, `add_test`, `fix_line`, `insert_line`, `remove_line`, `add_validation`, `add_table`, `add_agent`. This is the RL action space — agents make surgical edits instead of rewriting files.

### P10 — Cron / Scheduled Tasks
```
every 5 minutes:
  clean up old sessions

every day at 9am:
  send digest emails
```
Interval mode: `setInterval`. At-time mode: daily scheduler with `setTimeout` + `_nextMs()`. Both JS and Python backends. Multi-token time parsing handles `2:30pm`.

### P14 — Output Capture from Commands
`result = run command 'node --version'` captures stdout as trimmed string. Statement form still uses `stdio: inherit`.

## What's Next

Priority order (from ROADMAP.md — P1-P11, P14 done):

1. **P12 — OAuth / Social Login** — `allow login with Google` — #1 real-app blocker
2. **P13 — Streaming Responses** — native `stream back` sugar (STREAM node exists, needs syntax polish)
3. **Wire curriculum into sandbox** — `sandbox.run(taskId)` loads task, compiles solution, scores against tests. Closes the RL training loop.
4. **Playground template refresh** — update templates to use new features (cron, test blocks, agents)

## Resume Prompt

"Continue Clear language development. Run tests first (`node clear.test.js` — expect 1633). Check ROADMAP.md — P12 (OAuth) is the next feature. Or wire the curriculum into sandbox.js to close the RL training loop. Narrate as you go (Science Documentary Rule)."

## Known Issues / Caveats

- Sandbox symlink requires Windows junction type (`'junction'` arg to symlinkSync) — may need admin on some Windows setups
- `_clearLineMap` off-by-one: if injection point changes (not line 2), the `idx + 2` offset in map-building must be updated
- Source map granularity: markers only at indent ≤ 2 in backend mode — deeply nested branches don't get per-statement markers yet
- Curriculum tasks with `{{token}}` placeholders in tests need a test runner that handles auth flow (login → extract token → use in subsequent requests)
- `patch.js` `add_field` table detection uses lowercase string matching — may miss oddly-cased table definitions
