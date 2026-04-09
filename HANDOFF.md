# Handoff — 2026-04-08 (Session 12)

## Current State
- **Branch:** main
- **Compiler tests:** 1482 (all passing)
- **Playground tests:** ~241 across 4 test files
- **Node types:** 99
- **Template apps:** 43+

## What Was Done This Session

### 1. Full E2E Test Infrastructure for Playground
Added three new test files alongside the existing `server.test.js`:

**`playground/e2e.test.js`** — Template + endpoint tests
- All 43 templates compile with 0 errors
- Full CRUD tests: todo-api, blog-api, book-library, chat-backend, url-shortener
- Auth-protected endpoints (PUT/DELETE) return 401 as expected
- Runs without API key; Claude chat test auto-enabled when `ANTHROPIC_API_KEY` is set

**`playground/ide.test.js`** — Playwright IDE UI tests (46 tests)
- Page load, CodeMirror editor, toolbar buttons, template dropdown
- Compile button, tab switching, panel display, keyboard shortcuts (Ctrl+S, Ctrl+K)
- Theme toggle, status bar, error display

**`playground/agent.test.js`** — Claude agent full tool loop tests (50 tests)
- Phase 1: Agent builds a contacts API from scratch → compiles with 0 errors
- Phase 2: Agent runs app, tests CRUD via http_request; test verifies independently
- Phase 3: Agent patches to add a new endpoint (count)
- Phase 4: Agent uses write_file + run_command for CLI tools (check, lint)
- Phase 5: Test starts patched app, verifies new endpoint works
- Phase 6: Agent runs all 4 CLI commands (check, lint, info, build) directly
- Phase 7: Playwright verifies every button, every panel, all keyboard shortcuts

### 2. Bug Fixes in playground/server.js
- **Race condition:** Old child's `on('exit')` handler was nulling `runningChild` after a new child had already started — causing sequential test failures. Fixed with identity check: `if (runningChild === child) runningChild = null`.
- **Port readiness polling:** Rewrote to use a `.cjs` temp file in build dir (bypasses ESM `require` restriction). Previously failed with `require is not defined`.
- **Iteration limit:** Bumped agent loop from 10 → 15 iterations for complex multi-phase tasks.
- **ws package:** Chat apps require `ws` npm package. Server now writes a `package.json` before running the compiled app.

### 3. write_file Agent Tool
New agent tool: `write_file(filename, content)` — writes a `.clear` file to disk with no shell escaping. Mandatory prerequisite for the `run_command` CLI tools (`clear check`, `clear lint`, etc.). Documents the two-step pattern in system-prompt.md.

### 4. book-library Template App
`apps/book-library/main.clear` — fullstack CRUD app with:
- Books table (title, author, genre, rating, notes, read, added_at)
- GET/POST /api/books (POST no auth required), GET/PUT/DELETE /api/books/:id (PUT+DELETE auth-protected)
- Sidebar form + table display layout, ivory theme

### 5. CLI Windows ESM Fix
`cli/clear.js` — used `pathToFileURL()` for dynamic import on Windows so the CLI works cross-platform.

## Key Decisions

**Test independence:** Phases 2 and 5 in agent.test.js start their own app copy (different port) rather than relying on the agent's app still running. Makes tests deterministic.

**Phase 3 uses count endpoint not search:** Clear compiler has no query-param syntax (`incoming's q` doesn't work). Tested a `GET /api/contacts/count` patch instead, which the compiler supports. Known gap documented in learnings.md.

**write_file security:** Only `.clear` files allowed. Content written directly to ROOT_DIR (project root), not an arbitrary path.

## Known Issues / Gaps

- **Query param filtering not supported:** `GET /api/contacts?q=alice` is not expressible in Clear. No `incoming's q` / `params's q` syntax. Tracked in learnings.md.
- **agent.test.js requires ANTHROPIC_API_KEY:** If the key is absent, the test file still runs but the agent phases are skipped/fast-fail. Set key in `.env` for full run.
- **#preview-content is shared:** All tab panels (Compiled Code, Output, Terminal) render into one `#preview-content` div. Playwright tests use this div — no per-tab containers.
- **ws must be pre-installed:** Build dir gets `package.json` + `npm install ws` before chat apps run.

## Resume Prompt

Pick up from main. The playground has full E2E coverage. Next priorities:

1. **One-click deploy** — "Deploy" button in IDE compiles + containers + returns live URL. This turns Clear from a toy into a platform.
2. **Query param support** — Add `incoming's query's q` or `url param 'q'` syntax so agents can write search endpoints.
3. **Type system (inferred)** — Catch `'hello' * 1.08` at compile time. 100% inferred, zero annotations.
4. **CodeMirror Clear mode** — Proper syntax highlighting in the hosted editor.
5. **JS module import** — `use 'stripe'` or `use './helpers.js'` for npm packages and native Node APIs.
