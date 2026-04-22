# Handoff — 2026-04-22

## Current State

- **Branch:** `feature/gm-2-tool-use-rest` (long-running, pushed to origin, NOT merged to main).
- **Last commit:** `34b3a47` docs(handoff): rewrite for end of autonomous /loop session.
- **Main:** at `2a9eee3` (`Merge feature/ghost-meph-port-stop-app-db-inspect`). 30+ commits this session already merged + pushed.
- **Working tree:** dirty with pre-existing files unrelated to this session (`.claude/settings.local.json`, `index.html`, `meph-memory.md`, `requests.md`, `style.css`, `playground/factor-db.sqlite-shm/-wal`, `playground/sessions/`, etc.) — ignore.

## What's Wrapped at the End of This Session

### Done + merged to main this session
- **Queue B (P0 GTM) — 4/5:** deal-desk hero app, marcus.html headline, pricing.html, Studio first-visit onboarding.
- **Queue C — 3/3 + followups:** doc-drift checker + findings, 1:1-mapping audit + AUTH_SCAFFOLD provenance, ROADMAP Marcus-bias trim. Plus Core 7→8 fix, USAGE_LIMIT/OAUTH_CONFIG removal, test count sync.
- **Queue D — 2/2:** BM-6 tile gallery, Builder Mode v0.3 (3-ship counter + click-to-edit).
- **Queue E backends:** GM-1 router, GM-2 cc-agent text-only MVP, GM-4 Ollama, GM-3 OpenRouter, MCP server skeleton (`playground/ghost-meph/mcp-server/`).
- **GM-2 tool-use refactor — first 20 tools:** ported through `MephContext` to `playground/meph-tools.js`, all merged to main as separate commits.

### Wrapped on `feature/gm-2-tool-use-rest` (not merged)
- 21st tool ported (`run_command`) sits on this branch. The remaining 6 tools + executeTool extraction + cc-agent stream-json bridge stack here.

## The GM-2 Workstream — Where It Stands

**Goal:** turn `MEPH_BRAIN=cc-agent` into a real working backend so curriculum sweeps + Meph evals run on Russell's $200/mo Claude Code subscription instead of the production Anthropic key.

**21 of 27 tools ported.** Both `/api/chat` and the future MCP server can call these from one shared module. Only one MCP server stub (`meph_read_file`) is wired to its real handler — the others stay stubbed until executeTool fully extracts.

| Group | Ported | Remaining inline |
|---|---|---|
| Stateless | read_file, highlight_code, browse_templates, edit_file | — |
| Stateful | source_map, edit_code, patch_code, read_terminal, list_evals, todo | **compile** (480 lines, Factor DB + hint tracking — biggest), **run_tests**, **run_evals**, **run_eval** |
| Bridge | click_element, fill_input, inspect_element, read_storage, read_dom, read_network, websocket_log | — |
| Subprocess | stop_app, db_inspect, run_command | **run_app** (port allocation, child_process spawn), **screenshot_output** (async marker) |
| Fetch | read_actions | **http_request** (async deferred path in tool-use loop) |
| Helpers | validateToolInput, describeMephTool | — |
| Class | MephContext (16 fields + 8 callbacks, lazy-grow) | — |

**Tests:** `node playground/meph-tools.test.js` → 179/179. `node clear.test.js` → 2096/2096. `node playground/ghost-meph.test.js` → 59/59. `node playground/ghost-meph/mcp-server.test.js` → 30/30.

## Next Session Priority Order (REVISED — Russell direction 2026-04-22)

### 1. Finish the GM-2 tool-use refactor (~1-2 days)
Stack the remaining work on `feature/gm-2-tool-use-rest`. Port the 6 tools in ascending complexity order:

1. `screenshot_output` (async marker, trivial — returns `__ASYNC_SCREENSHOT__` for the loop to handle)
2. `run_app` (subprocess + port allocation, ~80 lines — needs `runningChild` + port-allocator callbacks on MephContext)
3. `run_tests` / `run_evals` / `run_eval` (each subprocess + send + Factor DB write — share infrastructure, port together)
4. `http_request` (async deferred — needs special handling in the tool-use loop's async dispatch path)
5. `compile` (480-line beast with Factor DB integration + hint tracking — save for last; will substantially expand MephContext)

After all 27 ported, do the **executeTool full extraction** — replace the inline switch in `playground/server.js` with a `dispatchTool(name, input, ctx)` import from `meph-tools.js`. /api/chat's closure shrinks dramatically.

### 2. Build the cc-agent path end-to-end via Claude Code (THE ACTUAL UNLOCK)
This is what Russell asked for — finish GM-2, then immediately wire cc-agent to use Claude Code (the local subscription) to drive Meph workflows. 1-2 days of focused work after step 1:

a. **Wire MCP server real handlers** for all ported tools. Today only `meph_read_file` is real; the others stay stubbed. Loop through `meph-tools.js` exports, register each as a `meph_<name>` MCP handler. ~30 lines + tests.

b. **Update `cc-agent.js` to spawn Claude Code with MCP + stream-json.** Replace `claude --print "<text>"` with `claude --mcp-config=<path> --output-format stream-json -p "<text>"`. ~50 lines.

c. **Parse stream-json → Anthropic SSE.** Each line of CC's stdout is a JSON event. `tool_use` events translate to Anthropic's `content_block_start` / `input_json_delta` / `content_block_stop` sequence. `text_delta` events pass through. `message_stop` becomes Anthropic's `message_delta` with `stop_reason`. ~150 lines, mostly pattern-matching.

d. **Tool result feedback loop.** When /api/chat runs the tool and posts the result back as a `tool_result` message, forward it to Claude Code's stdin (or re-spawn with full history — simpler, costs 2-3s/turn).

After this lands: `MEPH_BRAIN=cc-agent` works with tools, curriculum sweeps cost $0, pre-push Meph eval stops being skipped, Factor DB starts filling for free, Queue F unblocks.

Full architecture spec: `plans/plan-ghost-meph-cc-agent-tool-use-04-21-2026.md`.

### 3. Then Clear Cloud (Russell's CC pivot)

Read `plans/plan-clear-cloud-master-04-21-2026.md` first. Phase 85a (Russell's paperwork — domain, Fly Trust Verified, Stripe, Anthropic org key, Postgres) **status unknown** — confirm with Russell before running anything that hits real infrastructure.

Even without 85a, **scaffold work is doable now**:

a. **CC-1a Tenants DB schema.** Create `playground/tenants-db/migrations/001-tenants.sql` with tables `tenants`, `apps` (tenant_id, slug, subdomain, fly_app_name, fly_db_conn_str), `deploys` (app_id, version, image, status), `usage_rows` (app_id, ts, tokens_in, tokens_out, cost_usd). Branch: `feature/cc1-tenants-schema`. Test against local dev Postgres. Don't merge to main until 85a done.

b. **CC-1b Subdomain router.** HTTP middleware that extracts subdomain from `Host:` header, looks up the tenant app, proxies to the right Fly app's internal URL. Branch: `feature/cc1-subdomain-router`. Mock the deploy target until real Fly Trust Verified is live.

c. **CC-2a/b buildclear.dev auth.** users + sessions tables, signup/login endpoints, team membership tables. Branch: `feature/cc2-auth`. Local dev Postgres.

All Queue G — open as branches, **DO NOT merge to main** until Russell confirms Phase 85a is done.

### 4. Then Queue F (RL flywheel) — unlocks once cc-agent tool-use lands
- RL-3 classifier fuzzy-match fixes (~30 min)
- RL-4 step seeds on 28 curriculum tasks (~1hr)
- RL-5 archetype task hints (~30 min)
- RL-6 first full Ghost-Meph re-sweep (overnight, free)
- RL-8 honest-helpful retrain (when ~50 tags accumulate)

## Engineering Rules (unchanged)

- **Long-running branch for GM-2:** stack all remaining ports + executeTool + cc-agent bridge work on `feature/gm-2-tool-use-rest`. Don't merge until Russell reviews the GM-2 piece as one cohesive PR.
- **Verify branch before commit:** `git branch --show-current` after `git checkout -b`. Earlier this session GTM-1 somehow committed straight to main even though I'd just branched.
- **`SKIP_MEPH_EVAL=1 git push --no-verify`** for the 7 pre-existing `todo-fullstack` failures in `playground/e2e.test.js`. Documented multiple times.
- **Doc-only commits get `--no-verify` on commit too.**
- **Run after every port:** `node playground/meph-tools.test.js` (current 179) + `node clear.test.js` (current 2096). Both must stay green.
- **Pass heavy deps as arguments, not module imports.** `compileProgram`, `patch`, `compileForEval`, `Database` (better-sqlite3) get passed into tool functions rather than imported into `meph-tools.js`. Keeps the module tree-shakable.
- **Lazy-grow MephContext.** Add fields only when the tool being ported needs them. By the time all 27 ports land, every field has at least one consumer.

## Known Issues / Bugs

- **Pre-existing e2e failures** (7 tests) in todo-fullstack seed/CRUD/search. Not introduced this session — present on main before any of this. Pushes use `--no-verify` to bypass.
- **MCP server `meph_read_file` is the only real handler.** `meph_compile` still returns "not yet wired" stub. Wired up as part of cc-agent path step 2a above.
- **Compiler test count baseline: 2096** after USAGE_LIMIT + OAUTH_CONFIG removal. If anyone else changes the count, run `node scripts/check-doc-drift.cjs` to catch divergence across docs.

## Files to Read First

| File | Why |
|------|-----|
| `HANDOFF.md` (this file) | Mandate + revised priority order |
| `plans/plan-ghost-meph-cc-agent-tool-use-04-21-2026.md` | Architecture for the cc-agent unlock (steps 1 + 2 next session) |
| `plans/plan-clear-cloud-master-04-21-2026.md` | Required reading before any Clear Cloud work (step 3 next session) |
| `playground/meph-tools.js` | Current state of the shared tool module — pattern to copy for the 6 remaining ports |
| `playground/meph-context.js` | The MephContext class — add fields here lazily as remaining tools need them |
| `playground/server.js` `executeTool` (~line 2780+) | The 6 remaining tool cases + the tool-use loop |
| `playground/ghost-meph/mcp-server/tools.js` | Where to wire MCP handlers to ported tools (cc-agent path step 2a) |
| `playground/ghost-meph/cc-agent.js` | Current text-only MVP — gets stream-json upgrade in cc-agent path steps 2b/c/d |
| `CHANGELOG.md` top entry | What shipped this session in narrative form |
| `CLAUDE.md` (project) + `~/.claude/CLAUDE.md` (global) | Rules + voice |

## Resume Prompt

> Read `HANDOFF.md`. Continue on `feature/gm-2-tool-use-rest`. Priority: finish the 6 remaining GM-2 tool ports (start with `screenshot_output`, end with `compile`), then do the executeTool full extraction, then build the cc-agent path end-to-end (steps 2a-d in HANDOFF) — that's the budget unlock and Russell's #2 priority. Only after the cc-agent path works should you start Clear Cloud scaffold work (Queue G, branch per CC item, **don't merge to main until Russell signals Phase 85a done**). Use `SKIP_MEPH_EVAL=1 git push --no-verify` for pre-existing todo-fullstack e2e failures. Verify branch with `git branch --show-current` before every commit.

---

Handoff saved to `HANDOFF.md`. Start next session with: `Read HANDOFF.md and continue from where we left off.`
