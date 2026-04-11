# Handoff — 2026-04-11

## Current State
- **Branch:** `main` (just merged `feature/npm-imports-run-command`)
- **Tests:** 1588 passing / 0 failing (compiler) + 9 sandbox integration tests
- **Synonym version:** 0.13.0

## What Was Done This Session

### npm Package Imports
- `use npm 'stripe' as Stripe` → `const Stripe = require('stripe');` at top of server.js
- Alias defaults to sanitized package name if `as` omitted
- Validator adds npm aliases to declared variables (prevents false "undefined variable" errors)
- CLI `package` command includes npm deps in generated `package.json`

### Shell Commands
- `run command 'git pull'` → `execSync(cmd, { stdio: 'inherit' })` in JS / `subprocess.run()` in Python
- `child_process` / `subprocess` auto-imported only when used

### P1 — Inferred Type System
- `price = 'hello'` then `price * 1.08` → **compile error** (not warning)
- Tracks literal-assigned variable types, flags arithmetic on text variables
- Error message: `'price' is text, not a number — can't use it in * arithmetic`
- Wired into `validate()` via `validateInferredTypes()`

### P2 — Structured Eval Stats
- `compileProgram()` now returns `result.stats` with: `ok, endpoints, tables, pages, tests.defined, functions, agents, workflows, npm_packages, has_auth, has_database, lines, warnings`
- `ok` is `false` if any errors exist
- Used as the reward signal for RL training loops

### P3 — Source Maps
- Backend JS always emits `// clear:N` before each statement (even inside endpoint bodies — indent ≤ 2 in backend mode)
- `_clearLineMap` injected as line 2 of every compiled server: `{ jsLine: clearLine }`
- `_clearError` now parses `err.stack`, finds `server.js:LINE`, looks up in `_clearLineMap`, reports actual failing Clear line
- Stack-traced line takes priority over endpoint-level `ctx.line`

### P4 — Sandbox Runner (`sandbox.js`)
- `runClear(source, { timeout, tests })` → compiles, writes to temp dir, symlinks node_modules, spawns server, runs HTTP assertions, returns `{ ok, exitCode, testResults, stats, stdout, stderr }`
- Parallel RL episodes: each `Sandbox` instance gets unique port from 14000+ pool
- 9 integration tests in `sandbox.test.js`

### Page Auto-Slug
- `page 'HN Daily Digest':` → route `/hn-daily-digest` (no `at` required)
- Explicit `page 'Home' at '/':` still overrides
- Single-page apps unaffected (`hasRouting = pages.length > 1` gates routing independently)

## What's Next

Priority order (from ROADMAP.md):

1. **P5 — HTTP Test Assertions in Clear** — `test 'create user': call POST /api/users...` — closes the loop so reward function lives IN the Clear program
2. **OAuth / Social Login** — `allow login with Google` — #1 real-app blocker
3. **File Upload / Download** — `save file to 'uploads/'`
4. **Built-in Email** — `send email to user's email with subject '...'`
5. **Cron / Scheduled Tasks** — `every day at 9am:`
6. **P6 — Curriculum Task Library** — 20 benchmark tasks with acceptance criteria for RL

## Resume Prompt

"Continue Clear language development. Run tests first (`node clear.test.js`). Check ROADMAP.md for the priority queue — P5 (HTTP test assertions in Clear syntax) is next, then OAuth. Narrate what you're doing and why as you go (Science Documentary Rule in CLAUDE.md)."

## Known Issues / Caveats

- Sandbox symlink requires Windows junction type (`'junction'` arg to symlinkSync) — may need admin on some Windows setups
- `_clearLineMap` off-by-one: if injection point changes (not line 2), the `idx + 2` offset in map-building must be updated
- Source map granularity: markers only at indent ≤ 2 in backend mode — deeply nested branches (if/else inside endpoint) don't get per-statement markers yet
