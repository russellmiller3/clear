# Handoff — 2026-04-22 (GM-2 branch — cc-agent VALIDATED against real claude)

## Current State

- **Branch:** `feature/gm-2-tool-use-rest` (24+ commits, NOT pushed to origin, NOT merged to main).
- **Last commit:** `455349e` fix(ghost-meph): missing-binary tests now use CLAUDE_CLI_PATH override.
- **Sibling branch:** `feature/clear-cloud` (independent) carries the 4 consolidated Clear Cloud scaffolds + CC-2b TDD. Check that branch too; it's a whole separate body of work.
- **Main:** unchanged from prior handoff at `2a9eee3`.
- **Working tree:** dirty with pre-existing files unrelated to this session (`.claude/settings.local.json`, `index.html`, `meph-memory.md`, `requests.md`, `style.css`, `playground/factor-db.sqlite-shm/-wal`, `playground/sessions/`, etc.) — ignore.

## The Big Landing (commits 837a002–455349e)

**cc-agent tool mode validated end-to-end against Russell's real `claude` 2.1.111 binary.** Smoke test:
```
GHOST_MEPH_CC_TOOLS=1 MEPH_BRAIN=cc-agent node playground/server.js  &
node playground/smoke-cc-agent.js
```
Produces: `tool_start → mcp__meph__meph_edit_code → code_update → done`. Cost: $0.07. The $200/mo subscription path works; curriculum sweeps + Meph evals can move off the metered API.

### Three real-world blockers surfaced and fixed in sequence

1. **`claude` binary not on PATH.** Windows installer drops it in `%APPDATA%/Claude/claude-code/<version>/claude.exe` — not visible to the shell Studio was launched from. Fix: `resolveClaudeBinary()` in `cc-agent.js` probes PATH first, then falls back to known install locations on Windows (`%APPDATA%/Claude/claude-code` + `claude-code-vm`, newest versioned subdir by mtime) and Unix (`~/.claude/local`, `/usr/local/bin`, `/opt/homebrew/bin`). `CLAUDE_CLI_PATH` env override for tests + shims.

2. **`claude --print --output-format=stream-json` requires `--verbose`.** Without it, claude 2.x exits 1 with a clear error. Added `--verbose` to the spawn args — doesn't make stdout noisier in stream-json mode, just satisfies the flag-combo constraint.

3. **MCP tool calls hit a permission prompt.** Default claude behavior is to ask the user before running MCP tools. Added `--permission-mode=bypassPermissions` — safe here because the MCP server only exposes Meph's scoped surface (no Bash, no arbitrary file writes outside `meph_edit_code`/`meph_edit_file` allowlist).

### Post-turn source sync — state-sharing gap closed

Claude Code's MCP child runs in a separate process from Studio's `/api/chat` closure. Before this session, edits via `meph_edit_code` updated the MCP child's state but Studio's editor stayed stale. Fixed by `extractFinalSourceFromStreamJson` — scans the stream-json event log for the LAST `meph_edit_code` write, returns the code string. cc-agent.js attaches it to the Response as a `ccAgentFinalSource` sidecar; `/api/chat` mirrors it back into `currentSource` and fires a `code_update` SSE event. No IPC bridge, no new endpoint — the data was already in the event log we were discarding.

### runEvalSuite HTTP proxy — last MCP-side gap

`meph_run_evals` / `meph_run_eval` used to fail with "helpers.runEvalSuite is not a function" because the eval runner is tied to Studio's `evalChild` lifecycle. Fixed by making the MCP-side `runEvalSuite` helper a thin HTTP client that POSTs `{source, id}` to Studio's existing `/api/run-eval` endpoint. `cc-agent.js` sets `STUDIO_URL` in the MCP config's env so the child knows where to call. Every Meph tool now works in cc-agent mode.

### Defensive parser normalization

Two stream-json shape variants I didn't see on the happy-path smoke but that would bite real sessions:
- `assistant.message.content` as a STRING (not array) → wrap as `[{type:"text", text}]`
- `tool_use.input` as a JSON STRING (not object) → JSON.parse at the boundary

### `parseTestOutput` + `compileForEval` extracted

Moved out of server.js closures into `playground/meph-helpers.js`. Now importable by the MCP server so `run_tests` + `list_evals` work in cc-agent mode without starting Studio on a port. `runEvalSuite` stays in server.js (too tied to the `evalChild` lifecycle); MCP reaches it via the HTTP proxy above.

### Drift guard + realistic fixture

- MEPH_TOOLS drift guard: every name in the MCP registry must be recognized by `dispatchTool`'s validator. Catches silent skew if someone adds an MCP tool without wiring the dispatcher.
- Realistic full-turn fixture: claude-style stream-json of a compile→fix→recompile flow, 24 SSE frames, asserts `stop_reason=end_turn` and correct block-index monotonicity.

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

### Tests green (end-of-session totals on this branch)
- `node clear.test.js` → **2097/2097**
- `node playground/meph-tools.test.js` → **254/254**
- `node playground/meph-helpers.test.js` → **20/20**
- `node playground/ghost-meph.test.js` → **66/66**
- `node playground/ghost-meph/mcp-server.test.js` → **139/139**
- `node playground/ghost-meph/cc-agent-stream-json.test.js` → **69/69**
- **Total: 2645 passing, zero failures introduced by this session**

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

### 1. Russell reviews + merges both branches to main

Real CLI validation passed. This branch is ready for Russell to look at as a cohesive PR (or fast-forward if he's OK skipping that). Sibling branch `feature/clear-cloud` has the CC scaffolds + TDD'd cloud-teams — also ready for a review pass.

After merge: pre-push hook stops skipping Meph eval (cc-agent path now works), curriculum sweeps can opt into `MEPH_BRAIN=cc-agent` for $0 runs, Factor DB starts filling from sweep rows, Queue F (RL flywheel) unblocks.

### 2. Continue TDD on cloud-teams (sibling branch `feature/clear-cloud`)

10 TDD cycles done there. Remaining: `revokeInvite`, `listPendingInvites`, `updateMemberRole`, owner-transfer flow. Each under full RED→GREEN→commit discipline per the new "TDD — Red Before Code, Always" HARD RULE in global CLAUDE.md.

### 3. Optional follow-ups on THIS branch (cc-agent)

**Mid-turn source sync.** Current sync happens post-turn (at end of `/api/chat` response). For a multi-edit Meph session, Studio's editor only updates once at the end. Fix: stream-parse the claude NDJSON line-by-line as it arrives, emit `code_update` events alongside `content_block_delta`s. ~30 lines change in `cc-agent.js`, test via extending the existing fixtures.

**More fixture coverage.** The smoke test against real claude produced one specific event-shape pattern. Running more Meph prompts (different task types, error paths, longer turns) would surface other patterns the defensive parser hasn't yet been exercised against.

### 2. Clear Cloud (Russell's CC pivot) — unchanged from prior handoff

Read `plans/plan-clear-cloud-master-04-21-2026.md` first. Phase 85a (Russell's paperwork) status unknown — confirm before running anything that hits real infrastructure.

Scaffold work is doable without 85a. Branch per CC item, **do NOT merge to main** until Russell confirms 85a done.

- **CC-1a** Tenants DB schema (`playground/tenants-db/migrations/001-tenants.sql`)
- **CC-1b** Subdomain router
- **CC-2a/b** buildclear.dev auth

### 3. Queue F (RL flywheel) — unlocks after cc-agent tool-use lands

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
