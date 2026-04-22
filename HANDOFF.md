# Handoff — 2026-04-22 (end of GM-2 + cc-agent session)

## Current State

- **Branch:** `feature/gm-2-tool-use-rest` (long-running, 11 commits added this session, NOT pushed to origin yet, NOT merged to main).
- **Last commit:** `33d4eea` feat(ghost-meph/cc-agent): tool mode via MCP + stream-json (GM-2 steps 2b/2c).
- **Main:** unchanged from prior handoff at `2a9eee3`.
- **Working tree:** dirty with pre-existing files unrelated to this session (`.claude/settings.local.json`, `index.html`, `meph-memory.md`, `requests.md`, `style.css`, `playground/factor-db.sqlite-shm/-wal`, `playground/sessions/`, etc.) — ignore.

## What Landed This Session

### On `feature/gm-2-tool-use-rest` (11 commits, all local)

Two wins this session:

1. **GM-2 refactor COMPLETE.** All 28 Meph tools now live in `playground/meph-tools.js` behind a single `dispatchTool(name, input, ctx, helpers)` export. The inline 330-line switch in `playground/server.js` is gone; `/api/chat`'s `executeTool` is an ~80-line wrapper that builds one fat MephContext, hands it to `dispatchTool`, and mirrors back the state fields the tools mutated.

2. **cc-agent tool mode SHIPPED (steps 2a/2b/2c).** MCP server now exposes every Meph tool. `cc-agent.js` can spawn `claude --print --mcp-config=<tmp> --output-format stream-json` and translate the NDJSON event stream into Anthropic SSE events for /api/chat. Opt-in via `GHOST_MEPH_CC_TOOLS=1` so the text-only MVP is still default until the stream-json format is validated against real `claude` CLI in Russell's environment.

| Commit | What shipped |
|---|---|
| `69a075c` | Port `screenshot_output` (Playwright page through MephContext callbacks) |
| `4b3dc26` | Port `run_app` (subprocess + port allocation; lifecycle callbacks) |
| `c0556a3` | Port `run_tests` (stdout parsing injected as third arg) |
| `44af696` | Port `run_evals` + `run_eval` (runEvalSuite as third arg) |
| `92abef3` | Port `http_request` + delete loop special-casing for screenshot/http |
| `b86a02f` | Port `compile` — the 480-line beast (Factor DB + 4-tier re-ranker + hint state) |
| `b49243a` | executeTool → dispatchTool full extraction |
| `8981306` | MCP server wired to all 28 tools via dispatchTool (cc-agent step 2a) |
| `837a002` | HANDOFF checkpoint (GM-2 refactor complete) |
| `33d4eea` | cc-agent tool mode via MCP + stream-json (steps 2b/2c) |

Plus one user-level rule add: `~/.claude/CLAUDE.md` → **Periodic Progress Checkpoints** (narrate session-level status at chunk boundaries; different cadence from the per-action Science Documentary Rule).

### Tests green at every step
- `node clear.test.js` → **2097/2097**
- `node playground/meph-tools.test.js` → **254/254** (was 179 at session start — 75 new)
- `node playground/ghost-meph.test.js` → **66/66** (was 59 — 7 new in Phase 10)
- `node playground/ghost-meph/mcp-server.test.js` → **99/99** (was 30 — 69 new; 28 tools exposed, Phase 5 integration for write→read→compile flow)
- `node playground/ghost-meph/cc-agent-stream-json.test.js` → **46/46** (new this session — pure parser unit tests)

### MephContext shape

`playground/meph-context.js` has grown to ~30 fields supporting every tool's needs. Fields were added lazily — every one has at least one consumer. Key groups:
- **Source/compile:** `source`, `errors`, `sourceBeforeEdit`, `lastCompileResult` + setter callbacks
- **Diagnostic buffers:** `terminal`, `frontendErrors`, `networkBuffer`, `websocketBuffer`
- **Callbacks:** `send`, `termLog`, `onSourceChange`, `onErrorsChange`
- **Bridge/subprocess:** `isAppRunning`, `sendBridgeCommand`, `stopRunningApp`, `getRunningChild`, `setRunningChild`, `allocatePort`, `getPage`, `getRunningPort`
- **File/exec:** `rootDir`, `buildDir`, `allowedCommandPrefixes`, `apiKey`
- **Todos/actions:** `todos`, `onTodosChange`, `mephActionsUrl`
- **Compile-only (Factor DB + reranker):** `factorDB`, `sessionId`, `sessionSteps`, `pairwiseBundle`, `ebmBundle`, `hintState` (mutable object the tool writes to)

## Next Session Priority Order

### 1. Validate cc-agent tool mode against the REAL claude CLI

The architecture is in place — parser tested with synthetic events, MCP server wired, config generation landed. What remains is proving it works against Russell's actual `claude` binary.

**Smoke test sequence (needs `claude` on PATH):**
```
GHOST_MEPH_CC_TOOLS=1 MEPH_BRAIN=cc-agent node playground/eval-meph.js
```
Expected: all 16 eval scenarios run at $0 (via subscription). Any that fail: look at `stream-json` output shape vs. the parser's assumptions in `cc-agent-stream-json.js`. The fixture-driven tests in `cc-agent-stream-json.test.js` are how you fix the parser — add a failing fixture, fix the translation, land.

**Likely iteration points** (stream-json isn't a documented stable interface):
- `assistant.message.content` may be an object (not an array) for single-block messages
- `result.usage` field may be named differently (`input_tokens` vs `inputTokens` etc.)
- `tool_use.input` may be a JSON string (not an object) depending on claude version
- There may be additional event types we haven't mapped (e.g. `thinking`, `partial_json` deltas)

**State sharing — FIXED post-turn.** Previously a known gap; now closed. The stream-json event log already carries every `meph_edit_code` tool_use with its full input (including action="write" and the new source). `extractFinalSourceFromStreamJson` scans the log at end-of-turn, grabs the LAST write, and cc-agent.js attaches it to the Response as a sidecar. `/api/chat` mirrors that back into its closure + fires a `code_update` SSE event so Studio's editor re-renders. No IPC bridge needed — the data was already in the event log. Mid-turn updates (during a multi-edit session) still aren't visible in real-time, but end-of-turn sync means every /api/chat cycle leaves Studio's state coherent with what Meph produced. Follow-up if mid-turn visibility matters later: parse the stream-json line-by-line as it arrives instead of buffering, and emit `code_update` events in the SSE stream alongside the `content_block_delta` events.

### 2. Extract `parseTestOutput` + `compileForEval` from server.js

The MCP server's `buildHelpers()` has four TODOs (comments saying "stays unwired until we extract from server.js"): `compileForEval`, `parseTestOutput`, `runEvalSuite`. These live inside `server.js` closures and can't be imported without starting the Studio server (which listens on a port).

Work: pull each into a pure helper module (`playground/meph-helpers.js` or similar). `parseTestOutput` is already pure — just needs to move. `compileForEval` just calls `compileProgram` twice. `runEvalSuite` is harder — it manages an `evalChild` subprocess lifecycle that the MCP child would also need. Start with the easy two.

Once extracted, the MCP server's `run_tests`, `list_evals`, `run_evals`, `run_eval` handlers will work — Claude Code can run full compile-test-eval cycles against the local subscription.

### 3. Clear Cloud (Russell's CC pivot) — unchanged from prior handoff

Read `plans/plan-clear-cloud-master-04-21-2026.md` first. Phase 85a (Russell's paperwork) status unknown — confirm before running anything that hits real infrastructure.

Scaffold work is doable without 85a. Branch per CC item, **do NOT merge to main** until Russell confirms 85a done.

- **CC-1a** Tenants DB schema (`playground/tenants-db/migrations/001-tenants.sql`)
- **CC-1b** Subdomain router
- **CC-2a/b** buildclear.dev auth

### 4. Queue F (RL flywheel) — unlocks after cc-agent tool-use lands

- RL-3 classifier fuzzy-match fixes
- RL-4 step seeds on 28 curriculum tasks
- RL-5 archetype task hints
- RL-6 first full Ghost-Meph re-sweep (overnight, free)
- RL-8 honest-helpful retrain (when ~50 tags accumulate)

## Engineering Rules (unchanged)

- **Long-running branch for GM-2:** the refactor + MCP wiring live on `feature/gm-2-tool-use-rest`. Push when Russell signals OK to open a cohesive PR.
- **Verify branch before commit:** `git branch --show-current` after `git checkout -b`.
- **`SKIP_MEPH_EVAL=1 git push --no-verify`** for pre-existing todo-fullstack e2e failures.
- **Doc-only commits get `--no-verify` on commit too.**
- **Run after every port:** `node playground/meph-tools.test.js` + `node clear.test.js`. Both must stay green.
- **Pass heavy deps as arguments, not module imports.** `meph-tools.js` stays dependency-light — caller injects `compileProgram`, `patch`, `parseTestOutput`, `runEvalSuite`, `classifyArchetype`, reranker exports, etc.

## Known Issues / Bugs

- **Pre-existing e2e failures** (7 tests) in todo-fullstack seed/CRUD/search. Not introduced this session. Pushes use `--no-verify` to bypass.
- **MCP server subset in MCP-only mode:** tools that need live infrastructure (Playwright, running child, Factor DB) surface "No app running" or similar clean errors instead of crashing. Full functional parity with Studio arrives when `parseTestOutput` + `compileForEval` extract (next-priority item 2).
- **Compiler test count baseline: 2097** (was 2096 at start of session — drift from elsewhere; verify with `node scripts/check-doc-drift.cjs` if it changes).
- **Meph tool test count baseline: 254**, MCP server test count baseline: **99**. Both should only go UP from here.

## Files to Read First Next Session

| File | Why |
|------|-----|
| `HANDOFF.md` (this file) | Mandate + priority order |
| `plans/plan-ghost-meph-cc-agent-tool-use-04-21-2026.md` | Architecture reference |
| `playground/ghost-meph/cc-agent.js` | Two-mode implementation (text + tool) |
| `playground/ghost-meph/cc-agent-stream-json.js` | Parser — edit here first when claude's format shifts |
| `playground/ghost-meph/cc-agent-stream-json.test.js` | Fixture-driven tests — add failing fixture → fix parser → land |
| `playground/ghost-meph/mcp-server/tools.js` | All 28 tools wired — ready to use |
| `playground/meph-tools.js` | `dispatchTool` is the single entry point |
| `playground/meph-context.js` | MephContext shape — every ctx field documented |
| `playground/server.js` `executeTool` (~line 2743) | Reference for how /api/chat builds ctx + helpers |
| `CHANGELOG.md` top entry | Session narrative |
| `CLAUDE.md` (project) + `~/.claude/CLAUDE.md` (global) | Rules + voice (periodic-progress rule just added) |

## Resume Prompt

> Read `HANDOFF.md`. Continue on `feature/gm-2-tool-use-rest`. GM-2 refactor + MCP server + cc-agent tool mode all DONE architecturally. Next priority: validate the whole cc-agent path against Russell's real `claude` CLI. `GHOST_MEPH_CC_TOOLS=1 MEPH_BRAIN=cc-agent node playground/eval-meph.js` should run the 16 eval scenarios at $0 cost. If the parser fixtures are off, edit `playground/ghost-meph/cc-agent-stream-json.js` fixture-by-fixture until real claude output matches. After that, add an HTTP bridge from MCP server back to Studio's `/api/set-source` so mid-turn source edits show up in the editor. Then extract `parseTestOutput` + `compileForEval` from `server.js` into a shared helpers module so the MCP-side `run_tests` / `list_evals` handlers can wire up. Only after cc-agent is battle-tested should you start Clear Cloud scaffold (Queue G, branch per CC item, **don't merge to main until Russell signals Phase 85a done**). Use `SKIP_MEPH_EVAL=1 git push --no-verify` for pre-existing todo-fullstack e2e failures. Verify branch with `git branch --show-current` before every commit.

---

Handoff saved to `HANDOFF.md`. Start next session with: `Read HANDOFF.md and continue from where we left off.`
