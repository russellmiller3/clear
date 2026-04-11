# Handoff — 2026-04-11

## Current State
- **Branch:** `fix/agent-bugs` (on top of `main`)
- **Last commit:** `8b02135` (not yet committed — changes staged)
- **Tests:** 1643 compiler (3 new regression tests added)

## What Was Done This Session
### CRITICAL: Agent system completely broken → fixed end-to-end
1. **T1 #3 — Agent returns empty `{}`** — Root cause: agents defaulted to streaming (`async function*` generators). `await generator()` returns the generator object, which serializes as `{}`. Fix: agents now default to non-streaming (`async function`), only stream when explicitly requested with `stream response`. `send back` compiles to `return`, `ask agent` compiles to `await fn()`.
2. **T1 #4 — Agent code leaks to frontend** — Root cause: AGENT, WORKFLOW, SKILL, PIPELINE, PARALLEL_AGENTS, and POLICY nodes were not in `BACKEND_ONLY_NODES` set. Fix: added all server-only node types. Frontend output now has zero agent code, zero system prompts, zero `_askAI` references.
3. **T2 #1 — `post to` in button handler** — Root cause: `post to '/url' with data` was parsed as a variable reference `post_to`. Fix: added `post_to` handling in assignment expression parser, produces API_CALL node. Compiler generates proper `fetch()` POST with field serialization, async handler, validation, loading spinner.
4. **T2 #6-7 — Policy guards leak to frontend** — Root cause: POLICY node type missing from BACKEND_ONLY_NODES. Fix: same as #2 — added to the set.
5. **T2 #10 — `fetch from` URL concat dropped + Python missing `import httpx`** — Two bugs: parser only captured string literal URL (dropped `+ variable` concat), and Python backend never imported httpx for assignment-form fetch. Fix: parser now handles `fetch from 'url' + expr` as BINARY_OP concat, Python backend detects EXTERNAL_FETCH in AST and emits `import httpx`.
6. **Python `_ask_ai_stream` tree-shaking** — `_ask_ai_stream` utility was always emitted when agents existed, even non-streaming. Fix: only emit when at least one agent has `streamResponse === true`.

## What's In Progress
Nothing — session ready to commit. Next: more bugs from requests.md.

## Key Decisions Made
- **Agents default to non-streaming.** This is the correct behavior — `await fn()` works with regular async functions but not generators. Streaming is opt-in via `stream response` directive.
- **Server-only node types expanded.** AGENT, WORKFLOW, SKILL, PIPELINE, PARALLEL_AGENTS, POLICY all added to BACKEND_ONLY_NODES. This is a blanket fix — any future server-only code in pages won't leak.

## Known Issues / Bugs
Remaining backlog in `requests.md`:

### TIER 1 — Blockers (13 remaining)
1. T1 #5 — Workflow returns no output
2. T1 #7 — Workflow step agents undefined
3. T1 #8-15 — Python bugs (send back scalar, DELETE, PUT, auth, agents, workflow)
4. T1 #16-17 — Scheduled task crashes
5. T1 #18-21 — File input/upload, login auth

### TIER 2 — Major Gaps (6 remaining)
1. T2 #8 — Charts: no library imported
2. T2 #9 — DB relationships: `belongs to` ignored
3. T2 #11-15 — Agent streaming display, compile tool, scheduled task errors, Python deprecated API, file upload middleware

### TIER 3 — Quality of Life (9 remaining)
- Same as before

## Files Changed
| File | What |
|------|------|
| `compiler.js` | BACKEND_ONLY_NODES expanded, agent streaming default flipped, API_CALL assignment handling, Python httpx import, Python _ask_ai_stream tree-shaking |
| `parser.js` | `post to` assignment parsing, `fetch from` URL concatenation |
| `clear.test.js` | 25 tests updated for non-streaming default, 3 new regression tests |
| `requests.md` | 6 bugs marked RESOLVED |

## Resume Prompt
> Read HANDOFF.md and continue from where we left off. The task is fixing compiler bugs from requests.md. Next priorities: T1 #5 (workflow returns no output), T1 #7 (workflow step agents undefined), and the Python bug cluster (T1 #8-15). Read requests.md for full reproduction steps. Run tests first: `node clear.test.js` (expect 1643 passing).
