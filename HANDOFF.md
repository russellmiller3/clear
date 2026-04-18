# Handoff — 2026-04-17 (Session 36b — Mechanical Test Quality Signals + FAQ)

## Current State
- **Branch:** `main` (just merged from `fix/function-def-return`)
- **Last commit on main:** the merge of `fix/function-def-return`
- **Working tree:** CLEAN on main

## What Was Done This Session

### Fix: `send back` in `define function` now compiles to `return`

**The bug:** Writing `send back x` inside a `define function` block was emitting `res.json(x)` instead of `return x`. This caused runtime crashes when calling user-defined functions from test blocks or other code.

**Root cause:** `compileBody` was called without `insideFunction: true`, so `compileRespond()` fell through to the HTTP path.

**The fix (two lines):**
1. `compileRespond()` now checks `ctx.insideFunction || ctx.insideAgent` before deciding between `return` and `res.json`
2. `FUNCTION_DEF` case now passes `{ insideFunction: true }` to `compileBody`

**User-defined function shadowing:** Added `_findUserFunctions` pre-scan (mirrors `_findAsyncFunctions` pattern). User-defined names now take priority over ALL built-in aliases in CALL resolution. Writing `define function sum(a, b):` works — it doesn't get rerouted to `_clear_sum`.

### Feat: UNIT_ASSERT value-level assertions in test blocks

`expect result is 5`, `expect x is greater than 10`, `expect name is not empty` etc. compile to `_unitAssert(value, 'eq', 5, line, 'x')` calls with rich error messages. Full operator set: eq, neq, gt, lt, gte, lte, empty, not_empty.

### Docs: Full documentation update across all surfaces
- `intent.md` — UNIT_ASSERT rows added
- `SYNTAX.md` — function TDD section added
- `AI-INSTRUCTIONS.md` — TDD-first for functions, shadowing rules, gotchas
- `USER-GUIDE.md` — "TDD with Functions" tutorial added to Chapter 17
- `playground/system-prompt.md` — Meph now knows TDD with `define function`
- `.claude/skills/write-clear/SKILL.md` — function TDD pattern added
- `ROADMAP.md` — phase marked complete

### Integration test: Meph TDD loop verified
`playground/test-tdd-loop.js` — drives a live Meph session with task "build apply_discount using TDD." Checks that Meph: writes test first (edit_code before first run_tests), sees RED on first run, then GREEN on final run. Passes 5/5 assertions.

### Plan: Supervisor multi-session architecture
`plans/plan-supervisor-multi-session-04-17-2026.md` — comprehensive plan for running N worker Meph sessions orchestrated by a supervisor. Covers session registry, supervisor loop, task distribution, merge step, shared memory discipline, observability, and GA-based candidate generation. Red-teamed and patched. Not implemented yet.

## Key Decisions Made

- **No backward compat for `sum` collision.** User-defined functions always shadow built-ins. CALL resolution checks `_userFunctions` before `mapFunctionNameJS`. Clean and correct.
- **`send back` → `return` is the canonical path for pure functions.** Previously it only worked correctly inside agents. Now it works for any `define function` block.
- **Integration test lives in `playground/test-tdd-loop.js`**, not in the main test suite. Needs a live server + API key. Run manually or via CI with key set.

## Also Done This Session (Session 36b)

- **FAQ.md** created at repo root — 35 questions, 4 sections (Where/How/Why/What). Full system map. Check here before grepping.
- **ROADMAP.md** — Big Thesis and RL sections moved to FAQ. ROADMAP now stays focused on what's built/planned.
- **User-level CLAUDE.md** — coffee shop tone rule, Next Steps Rule, Strong Opinion Rule, Branching, Science Documentary Rule, No Invisible Agent Work, Test Before Declaring Done, Quality Bar, Console First Rule all added.
- **User-level memory** — `~/.claude/memory/` created with 5 universal feedback files.
- **docs skill** — FAQ.md added as step 0 in the doc update checklist.

## What's Next (priority order)

### 1. Mechanical Test Quality Signals (ready to implement — branch: `feature/test-quality-signals`)

Three pieces. Each is small. Total: ~2-3 TDD cycles.

**Piece 1 — Static lint (compiler.js):**
In the `UNIT_ASSERT` compile case, check if the assertion is trivially weak. Weak patterns:
- `check === 'neq'` AND right is `nothing` or `empty` → weak
- `check === 'eq'` AND right is `true` (bare boolean) → weak
- Single `expect` in entire test block → yellow flag

Push a warning to `r.warnings[]` with a message like `"Weak assertion: 'expect X is not empty' doesn't verify the actual value."`. Same infrastructure as existing `clear lint` warnings. Do NOT show to Meph or end user — internal only.

**Piece 2 — Process lint (playground/server.js):**
At the end of the `/api/chat` handler (after building `toolResults`, before sending `done`), compute:
```js
const testCalls = toolResults.filter(t => t.name === 'run_tests');
const redStepObserved = testCalls.some(t => t.result?.ok === false || t.result?.error);
const weakAssertionCount = /* from compiler warnings in the session */;
```
Store both on a session record. Don't emit them to the client SSE stream.

**Piece 3 — Storage (playground/server.js):**
Short term: write `playground/sessions/[sessionId].json` at end of each `/api/chat`. Shape:
```json
{
  "id": "...",
  "task": "...",
  "started_at": 1713400000,
  "ended_at": 1713400060,
  "tool_calls": [...],
  "weak_assertion_count": 0,
  "red_step_observed": true,
  "final_source": "..."
}
```

Dev-only endpoint: `GET /api/session-quality` — returns the last N session records. Hidden from Studio UI. For debugging the re-ranker only.

**Do NOT expose to Meph or user.** Meph would game the score. The user doesn't need it. It's a training signal.

### 2. Execute the Supervisor plan
`plans/plan-supervisor-multi-session-04-17-2026.md`. Branch: `feature/supervisor-multi-session`. Start with Phase 1 (session registry + `/api/sessions` endpoint). The mechanical quality signals from #1 plug directly into the sessions table.

### 3. Execute the PERF plan
`plans/plan-perf-pagination-aggregation-04-16-2026.md`. Branch: `feature/perf-pagination`. Default LIMIT 50 on `get all` + SQL aggregations.

### 4. Fly.io deploy
`plans/plan-fly-deploy-04-16-2026.md`. Needs one more red-team pass first.

## Resume Prompt

"Session 36 + 36b shipped: `send back` → `return` fix, UNIT_ASSERT, Meph TDD mandate, FAQ.md (35 questions, full system map), user-level CLAUDE.md updated with universal rules. Next up: implement mechanical test quality signals (static lint on weak assertions + process lint on red-step + session JSON storage). Branch: `feature/test-quality-signals`. Three pieces, ~2-3 TDD cycles. Start there, then move to supervisor plan execution."
