# Clear Language — Changelog

Session-by-session history of what shipped. Moved out of ROADMAP.md on 2026-04-21 so the roadmap can focus on what's *next*. Capability reference (what features exist today) lives in `FEATURES.md`. Node-type spec lives in `intent.md`.

Newest entries at the top.

---

## 2026-04-22 — GM-2 refactor finish + cc-agent tool mode + meph-helpers extraction

13 commits on `feature/gm-2-tool-use-rest` (not merged to main yet — Russell reviews first). The "Ghost Meph cc-agent with tools" architecture lands in three layers: every Meph tool lives in one module behind one dispatcher, the MCP server exposes them all to Claude Code, and cc-agent.js can spawn Claude Code with MCP configured to translate stream-json events back into Anthropic SSE for /api/chat. Opt-in via `GHOST_MEPH_CC_TOOLS=1` until Russell validates the stream-json format against his real `claude` CLI.

### GM-2 refactor — every tool ported, executeTool extracted (9 commits)

Started the session at 21/27 tools ported. Finished with 28/28 plus the full `executeTool` switch extraction.

- **screenshot_output** — Playwright page + running-port through MephContext callbacks (`getPage`, `getRunningPort`). Deleted the dead `__ASYNC_SCREENSHOT__` marker and the loop's inline screenshot special-case. Commit `69a075c`.
- **run_app** — subprocess spawn + port allocation + build-output materialization. MephContext grows `getRunningChild` / `setRunningChild` / `allocatePort` lifecycle callbacks. Commit `4b3dc26`.
- **run_tests** — stdout parsing via injected `parseTestOutput`. MephContext grows `apiKey` field. Commit `c0556a3`.
- **run_evals + run_eval** — tiny wrappers around `runEvalSuite`. Per-spec progress events fan out through `ctx.send`. Commit `44af696`.
- **http_request** — fetch + timeout + response parsing. Deleted the loop's special-casing for http_request AND screenshot_output; both flow through `executeTool` like every other tool. Commit `92abef3`.
- **compile** — the 480-line beast. MephContext grows 6 fields (factorDB, sessionId, sessionSteps, pairwiseBundle, ebmBundle, hintState). The 8 reranker/classifier helpers come in through a third-arg bundle. Commit `b86a02f`.
- **executeTool extraction** — the 330-line inline switch in `/api/chat` becomes an 80-line wrapper that builds one fat MephContext, hands to `dispatchTool` from meph-tools.js, and mirrors back mutated state. Commit `b49243a`.

MephContext grew to ~30 fields. Every one has at least one consumer — lazy-growth discipline held. Tests: 254/254 meph-tools (+75 new), 2097/2097 compiler.

### MCP server wiring — all 28 tools exposed (commit `8981306`)

Before this session, the MCP server had 2 tool entries (one real, one stub). After: 28 tool definitions auto-generated from a declarative array, each with a handler that routes through `dispatchTool`. Module-level state (currentSource, currentErrors, lastCompileResult, mephTodos, hintState) mirrors what `/api/chat` tracks. Claude Code can now drive a multi-turn build-compile-test loop through the MCP protocol the same way Studio does.

MCP server tests: 102/102 (+72 new; was 30 at session start). Phase 5 integration covers edit_code write→read round-trip (verifies module state), meph_compile runs real compileProgram against stored source, schema errors surface as `isError=true`, and `meph_http_request` fails clean with "No app running" when no child is up.

### cc-agent tool mode — MCP + stream-json (commit `33d4eea`)

New module `playground/ghost-meph/cc-agent-stream-json.js` translates Claude Code's `--output-format stream-json` events into Anthropic SSE. The tricky bit: `stop_reason` must be `end_turn` (not `tool_use`) because Claude Code already ran the tools internally via MCP — the outer /api/chat loop would re-run them if we signaled tool_use.

Event table:
- `system/init` → `message_start`
- `assistant.content[].text` → `content_block_start(text)` + `content_block_delta(text_delta)` + `content_block_stop`
- `assistant.content[].tool_use` → `content_block_start(tool_use)` + `content_block_delta(input_json_delta)` + `content_block_stop`
- `user.content[].tool_result` → SKIPPED (tool already ran; emitting would cause /api/chat to re-run)
- `result` → `message_delta(stop_reason=end_turn)` + `message_stop`

cc-agent.js changes: added `chatViaClaudeCodeWithTools()` path, `writeMcpConfigOrNull()` for tmp config gen, `runClaudeCliStreamJson()` that spawns claude with the new flags. Gated by `GHOST_MEPH_CC_TOOLS=1` — text-mode MVP stays default until Russell's real claude CLI validates the format.

Tests: 46/46 new stream-json parser tests (fixture-driven; add a failing fixture → fix the parser → land), 66/66 ghost-meph (+7 Phase 10 covering MCP config generation, env-gate routing, graceful fallback on missing CLI for both text + tool modes).

### meph-helpers extraction (commit `268dd5c`)

`parseTestOutput` + `compileForEval` moved from `server.js` closures into new `playground/meph-helpers.js`. These are pure functions both `/api/chat` and the MCP server need. Server.js re-exports parseTestOutput so the existing test import keeps working. MCP server's `meph_list_evals` and `meph_run_tests` handlers now route to real implementations instead of throwing "helper is not a function".

Tests: 20/20 new meph-helpers tests (parseTestOutput pass/fail/mixed/`[clear:N]`-tag/legacy-dash-dash + compileForEval empty/whitespace/errors/happy-path/throws).

### User rule add (global CLAUDE.md)

New **Periodic Progress Checkpoints** rule — narrate "X of Y done, moving to Z" at chunk boundaries. Different cadence from the per-action Science Documentary Rule; this one is the META status that keeps Russell oriented across a long session without him having to ask "where are we?".

### Why this matters

The $200/mo Claude Code subscription is one hop from being Meph's execution backend. Before this session: two reimplementations of 28 tool handlers would have been needed. After: one codebase (meph-tools.js), two consumers (/api/chat + MCP server), one translation layer (cc-agent-stream-json). The cost break — `$168/day → $0/day` on Meph evals + curriculum sweeps — is what makes re-ranker hint experiments and step-seed curriculum tractable.

### Known gaps (next session)

1. **State sharing.** MCP server's module-level currentSource is isolated from Studio's /api/chat closure. Mid-turn edits via `meph_edit_code` don't show up in Studio's editor. Fix: HTTP bridge from MCP server to a new Studio endpoint `/api/meph-live-state`.
2. **runEvalSuite extraction.** Still tied to Studio's `evalChild` subprocess lifecycle. Harder than parseTestOutput/compileForEval — the child needs port allocation + auth bootstrap. Unblocks `meph_run_evals` / `meph_run_eval` in MCP mode.
3. **Real-claude validation.** Parser assumptions about stream-json shape are based on published Claude Code docs; the format isn't a documented stable interface. Fixture-driven tests in `cc-agent-stream-json.test.js` are the iteration surface.

---

## Autonomous session rollup (2026-04-21 evening) — Queues B + C + D + half of E

Russell kicked off an autonomous "plough-through" session before going to sleep. Mandate from `HANDOFF.md`: ship Queue B → C → D → E → F in priority order, branch per feature, no per-session cost tracking under his $200/mo Anthropic unlimited plan, but DO NOT call the production `/api/chat` endpoint until Ghost Meph cc-agent has tool-use support. Result: 26 commits, 13 merge commits, 4 queues meaningfully advanced. Test counts: 2108 compiler / 33 builder-mode / 59 ghost-meph pass; 7 pre-existing todo-fullstack e2e failures unchanged.

### Queue B — P0 GTM (4/5 shipped; GTM-4 LinkedIn DMs blocked on Russell)

- **GTM-1 deal-desk hero app** — `apps/deal-desk/main.clear` (161 lines, 14/14 tests). Discount approval workflow: rep submits a discount, ≤20% auto-approves, >20% routes to CRO queue. AI-drafted approval summaries shipped in seed data + a separate `/api/deals/draft` endpoint that calls a `draft_approval()` function with structured output. Hero demo for the Marcus landing page. Branch `feature/gtm-deal-desk`, merged `2827cf1`.
- **GTM-2 Marcus landing headline restored** — `landing/marcus.html` reverted to Session-35-locked headline: *"That backlog of internal tools nobody's going to build? Ship the first one this Friday."* Was drifting to a punchier-but-vaguer iteration. Branch `feature/gtm-marcus-landing`, merged `19f3e51`.
- **GTM-3 pricing page** — new `landing/pricing.html` (~430 lines). Free / Team $99 / Business $499 / Enterprise tiers locked Session 35. Per-tier quotas (apps, seats, agent calls, storage, custom domains, SSO), full compare table, "why no per-seat" Marcus-pain narrative, 8 FAQs. Wired pricing nav links across `marcus.html`. Branch `feature/gtm-pricing`, merged `fabd076`.
- **GTM-5 Studio first-visit onboarding** — `playground/ide.html` adds an inline welcome card prepended to `#chat-messages` on first load, gated by `localStorage['clear-onboarding-seen']`. Auto-focuses chat input. Per-mode copy (different examples for builder vs classic). Dismissed on first keystroke or × click. 50 lines, no new deps. Branch `feature/gtm-onboarding`, merged `7979736`.

### Queue C — Repo Readthrough (3/3 shipped)

- **RR-1 doc-drift checker** — new `scripts/check-doc-drift.cjs` (~190 lines, no deps). Scans 16 canonical docs for shared metrics that drift across sessions (compiler test count, node-type count, template count, curriculum tasks, Marcus apps, doc-rule surfaces). First run found 6 drifts; fixed unambiguous ones (compiler count 1089/1850/1954 → 2108; doc-rule surfaces 9 → 11 in FAQ). Wrote `docs/doc-drift-findings.md` for the harder ones (Core 7 vs 8, curriculum count metric ambiguity, node-type count). Branch `fix/rr-doc-drift`, merged `6ea720c`.
- **RR-2 1:1-mapping audit** — new `docs/one-to-one-mapping-audit.md`. Walked the parser+compiler looking for keywords that emit many lines of compiled JS/Python. The handoff-named CHECKOUT/OAUTH_CONFIG/USAGE_LIMIT turned out to already be 1:1 (config-only emits with header comments). Real worst offenders identified: AUTH_SCAFFOLD (~70 lines emitted from `allow signup and login`), AGENT_DEF (~80–150 lines), WEBHOOK (~25–40 lines). Implemented one fix: provenance comment block on AUTH_SCAFFOLD output that names the source line and lists every endpoint+middleware emitted. Branch `feature/rr-1to1-audit`, merged `c43d814`.
- **RR-3 ROADMAP Marcus-bias trim** — deleted stale "Mechanical Test Quality Signals" subsection (all done — moved to CHANGELOG). Relocated 5 orphaned "Next Up Session 34" items: 4 eval-tooling items into "Future (Not Committed)", 1 SQLite WIP into Refactoring Backlog as R9. Net 24 deletions, 9 insertions. Branch `docs/rr-marcus-bias`, merged `f845dde`.

### Queue D — Builder Mode follow-ons (2/2 shipped)

- **BM-6 tile gallery (Builder Mode v0.2)** — `playground/ide.html` adds a Marcus-first tile gallery on the empty preview pane in builder mode. 5 featured tiles (deal-desk first), "See more" expander for the remaining 9. Click loads template via existing `/api/template/<name>` flow. Sibling-of-preview-content positioning with `position: absolute` so `showTab()` innerHTML wipes don't nuke it. Added `deal-desk` to `FEATURED_TEMPLATES` in server.js. Branch `feature/builder-mode-bm6`, merged `ea21b28`.
- **Builder Mode v0.3 — BM-3 full + BM-4** — BM-3 full: localStorage `clear-bm-ships-counter`. First 3 successful Publishes the source pane defaults visible (onboarding); ship #3+ source defaults hidden. Counter increments inside `doDeploy()`'s success branch. BM-4: when in builder mode, every iframe click event ALSO prefills the chat input with `Change the "<text>" button/link — ` (cursor at end). Skips if user already typed something. 2 new builder-mode tests (33 total). Branch `feature/builder-mode-v03`, merged `55ef2f2`.

### Queue E — Ghost Meph (4/6 shipped + plans for the rest)

The architecture that lets `/api/chat` route through local backends instead of paying Anthropic per call. Four real backends now wired; tool-use support is the remaining unlock.

- **GM-1 env-gated /api/chat router** — new `playground/ghost-meph/router.js` (~150 lines). `MEPH_BRAIN` env var dispatches to backend; absent = real Anthropic (no behavior change). Stub returns Anthropic-shaped SSE with `stop_reason='end_turn'` so /api/chat tool loop doesn't spin. /api/chat skips the API-key 400 when ghost is active. 34 tests. Branch `feature/ghost-meph-stub`, merged `964d69c`.
- **GM-2 cc-agent text-only MVP** — new `playground/ghost-meph/cc-agent.js` (~170 lines). `MEPH_BRAIN=cc-agent` spawns `claude --print` subprocess, pipes the latest user message via stdin, wraps captured stdout as Anthropic SSE. System prompt loaded from `playground/system-prompt.md`. Failure modes (missing CLI, timeout, non-zero exit) surfaced as Anthropic-shaped error streams. 6 more tests. **Tool support deferred** — see `plans/plan-ghost-meph-cc-agent-tool-use-04-21-2026.md` for the ~5-day MCP-server implementation. Branch `feature/ghost-meph-cc`, merged `57c10e6`.
- **GM-4 Ollama backend + shared format-bridge** — new `playground/ghost-meph/format-bridge.js` (~145 lines): Anthropic ↔ OpenAI translation (string + array content, system field both forms, tool_use blocks dropped for text-only MVP). `accumulateOpenAIText()` + `wrapOpenAIStreamAsAnthropicSSE()` helpers. New `playground/ghost-meph/ollama.js` (~80 lines): `MEPH_BRAIN=ollama:<model>` routes to Ollama's OpenAI-compatible endpoint at `OLLAMA_HOST` (default `http://localhost:11434`). ECONNREFUSED / TimeoutError / HTTP-error all become Anthropic-shaped error streams with Marcus-readable hints. 14 tests. Branch `feature/ghost-meph-ollama`, merged `d25ecdc`.
- **GM-3 OpenRouter backend** — new `playground/ghost-meph/openrouter.js` (~110 lines). `MEPH_BRAIN=openrouter` (or `openrouter:qwen`) routes to OpenRouter's `/v1/chat/completions` endpoint. Default model `qwen/qwen3.6-plus-preview:free`; override with `OPENROUTER_MODEL`. Requires `OPENROUTER_API_KEY`. Handles missing-key, 429 rate limits (no auto-retry — surfaces clearly), 404/400 preview-tier-disappears, timeout. Includes `HTTP-Referer` + `X-Title` attribution headers. Reuses format-bridge from GM-4 — only ~110 lines of new code. 5 more tests. Branch `feature/ghost-meph-openrouter`, merged `f416bcb`.

**Plans for the remaining Queue E items (read before implementing):**
- `plans/plan-ghost-meph-cc-agent-tool-use-04-21-2026.md` — full architecture for tool dispatch through cc-agent. 3 options (MCP server / stream-json parse / hybrid). Recommendation: Option A (MCP server). ~5 days estimated.
- `plans/plan-ghost-meph-openrouter-ollama-04-21-2026.md` — GM-3 + GM-4 designs (now both shipped) + GM-5 calibration harness + GM-6 default-switch follow-ups.

**Fresh `HANDOFF.md`** — rewrites the previous handoff with this session's ship pile, the budget rules (still in effect — restriction lifts after cc-agent gets tool support), priority queue (GM-2 tool-use → GM-5 → GM-6 → Queue F), open design questions for Russell, and the explicit branch-verification rule (after `git checkout -b`, run `git branch --show-current` — earlier this session GTM-1 somehow committed straight to main even though I'd just branched). Branch `docs/handoff-next-session`, merged `0a77df0`.

---

## Builder Mode v0.1 — Marcus-first Studio layout (2026-04-21)

Feature-flagged Studio layout flip via `?studio-mode=builder` URL param. Four changes:

- **BM-1 chat-as-driver** — chat pane drops to bottom 40vh in builder mode, full-width. Placeholder updated to "What do you want to build today, or which app to change?"
- **BM-2 preview-as-hero** — preview pane rises to top 60vh, full-width. `order: 0` flips DOM order (chat is earlier in markup).
- **BM-3-minimal Source toggle** — editor hidden by default; toolbar `Show Source ◀ / Hide Source ▶` button overlays editor as right-side rail (`position: absolute`, `z-index: 20`, `width: min(400px, 85vw)`). Full 3-session auto-hide logic deferred.
- **BM-5 Publish button** — `#deploy-btn` renamed to "Publish" and gains `.publish-btn` class in builder mode. Accent-filled background, bolder type, hover lift, focus glow. Same handler, same `/api/deploy` endpoint.

Classic 3-panel layout remains default. Preference persists in localStorage. Private-browsing safe (localStorage wrapped in try/catch).

Tests: `playground/builder-mode.test.js` (new, 31 assertions, all passing). `playground/ide.test.js` and `playground/deploy.test.js` regressions clean.

Deferred to later PRES cycles: BM-3 full (3-session auto-hide counter), BM-4 click-to-edit on preview, BM-6 "what are you building?" tile gallery, status bar, `cmd+.` revert shortcut.

Plan: `plans/plan-builder-mode-v0.1-04-21-2026.md`. Full spec: `ROADMAP.md` → "Builder Mode — Marcus-first Studio layout".

---

## Recently Completed

| Feature | Syntax | Status |
|---------|--------|--------|
| **Live App Editing — Phase A** (LAE-1, LAE-2, LAE-3 additive, LAE-7) | Studio `/__meph__/widget.js` + `/propose` + `/ship` endpoints; owner-gated Meph widget; 3 additive tools (field/endpoint/page); AST-diff classifier with additive/reversible/destructive taxonomy | Done — 67 tests + 10/10 real-Meph eval |
| **Live App Editing — Phase B** (LAE-3 reversible, LAE-4, LAE-6) | `, hidden` and `, renamed to X` field modifiers; `db.findAll`/`findOne` strip hidden by default; snapshot + rollback primitives; ship auto-snapshots; `/__meph__/api/rollback` + `/snapshots`; widget Undo button; sessionStorage form-state preservation across reload | Done — 44 more tests + 11/11 real-Meph eval |
| **Live App Editing — compiler integration** | Widget script + `/__meph__/*` proxy auto-injected into every compiled Clear app that declares `allow signup and login`. `STUDIO_PORT` env var wires the child's proxy to Studio; clean 503 in production. Studio copies `runtime/meph-widget.js` into `clear-runtime/` on every `/api/run`. | Done — 7 tests, landing page rewritten in Marcus's voice |
| Intent classification | `classify X as 'a', 'b', 'c'` | Done — Claude Haiku call |
| Extended RAG | `knows about: 'https://url'`, `'file.pdf'`, `'doc.docx'` | Done — URLs + files + tables |
| Send email inline | `send email to X:` + subject/body block | Done |
| Scheduled at time | `runs every 1 day at '9:00 AM'` | Done — node-cron |
| `find all` synonym | `find all Orders where status is 'active'` | Done |
| `today` literal | `where created_at is today` | Done |
| Multi-context ask ai | `ask ai 'prompt' with X, Y, Z` | Done |
| Store-ops GAN target | 230-line e-commerce agent demo | Done — compiles + runs |
| Error throwing | `send error 'message'` / `throw error` / `fail with` / `raise error` | Done — P1 |
| Finally blocks | `try:` ... `finally:` / `always do:` / `after everything:` | Done — P2 |
| First-class functions | Pass function refs as arguments | Done — P3, works natively |
| Async function await | User-defined async fns auto-get `await` at call sites | Done — pre-scan + transitive |
| Postgres adapter | `database is PostgreSQL` → `pg.Pool` runtime adapter | Done — `runtime/db-postgres.js`, same API as SQLite |
| Railway deploy | `clear deploy app.clear` → package + `railway up` | Done — auto-detects db backend, correct deps |
| Studio Test Runner | Tests tab in IDE with Run App/Compiler buttons | Done — `/api/run-tests`, Meph `run_tests` tool |
| Intent-based tests | `can user create/view/delete`, `does X require login`, `expect it succeeds` | Done — `TEST_INTENT` + extended `EXPECT_RESPONSE` |
| English test names | Auto-generated tests use readable names ("Creating a todo succeeds") | Done — `generateE2ETests` rewrite |
| CRUD flow tests | "User can create a todo and see it in the list" | Done — auto-generated from table + endpoint AST |
| `dbBackend` field | `compileProgram()` exposes `result.dbBackend` | Done — used by CLI deploy/package |
| Nameless test blocks | `test:` + body (first line = name) | Done — zero-redundancy test syntax |
| Auto-test on Run | Tests auto-run when Run clicked, switch to Tests tab on failure | Done — Studio IDE integration |
| Test runner rewrite | `clear test` starts server, installs deps, shares JWT | Done — replaces legacy test extraction |
| Studio Bridge | Shared iframe between user + Meph via postMessage | Done — `?clear-bridge=1` / `<meta name="clear-bridge">` gate, compiler-injected |
| Bridge tools | `read_actions`, `read_dom` + `click/fill/inspect/read_storage` via bridge | Done — replaces separate Playwright page |
| Friendly test failures | Plain-English errors with hints for 200/201/204/400/401/403/404/409/422/429/5xx | Done — `_expectStatus`/`_expectBodyHas`/etc helpers |
| Click-to-source on failures | `[clear:N]` tag in error → IDE jumps editor to line | Done — `parseTestOutput` extracts `sourceLine` |
| Fix with Meph button | Failure row → submit `{name, error, sourceLine, snippet}` to Meph | Done — auto-prompts in chat |
| Meph sees user test runs | IDE snapshots `testResults` into chat body | Done — `buildSystemWithContext` appends to system prompt |
| Unified terminal timeline | `[stdout]`/`[stderr]`/`[user]`/`[browser]`/`[meph]` interleaved | Done — single `terminalBuffer`, mirrored from all sources |
| Fix Windows libuv shutdown | Single SIGTERM handler awaits browser close before exit | Done — eliminates `UV_HANDLE_CLOSING` assertion |
| Meph tool eval | 16-scenario script + Meph self-report per tool | Done — `playground/eval-meph.js`, 15/15 verified |
| `incoming` scanner walks wrapper nodes | SEARCH/FILTER `.query` field now triggers binding | Done — `incoming?.q` in compiled output now has matching `const incoming = req.query` |
| User-test HTTP path tokenizer fix | `/api/todos` no longer collapses to `/` in `_lastCall` | Done — friendly errors show real path |
| E2E auth helper | JWT signed via node crypto + pinned `JWT_SECRET` on child spawn | Done — 77/77 pass with `requires login` POSTs |
| `highlight_code` tool case | Was missing from executeTool switch | Done — found by Meph eval self-report |
| Rich text editor input | `'Body' is a text editor saved as body` | Done — Quill via CDN, toolbar, live `_state` binding |
| Multi-page Express routing | `page 'X' at '/new':` emits `app.get('/new', ...)` | Done — previously only `/` was served so direct URLs 404'd |
| Client-side pathname router | Reads `location.pathname`, falls back to hash, intercepts `<a>` clicks for SPA nav | Done — was hash-only, broke every multi-page app on refresh |
| Studio route selector | Dropdown above preview listing every `page 'X' at '/route'` | Done — includes back/forward/refresh, full-stack apps use real http iframe (not srcdoc) |
| Layout nesting warning | `page_hero`/`page_section` inside `app_layout` → compiler warning | Done — silent clipping trap now caught |
| Honest test labels | `UI: ...` vs `Endpoint: ...` based on real UI detection | Done — walks AST for `API_CALL` POSTs in pages, renames flow tests accordingly |
| Unwired-endpoint warning | POST endpoint with validation but no UI button wired → warning | Done — emitted with the endpoint's line number |
| `send X as a new post to URL` parser fix | Greedy `post to` synonym was eating resource word, dropping entire send line | Done — respond handler accepts `post_to`/`put_to`/`get_from`/`delete_from` as URL connectors |
| Express 5 `sendFile` root option | `res.sendFile(absolutePath)` 404'd on non-root URLs under send module | Done — switched to `{ root: __dirname }` form |
| Streaming is the default | `ask claude 'X' with Y` inside POST endpoint auto-streams; `get X from URL with Y` on frontend auto-reads SSE | Done — no `stream` keyword needed anywhere |
| Streaming opt-out | `without streaming` → single `res.json({ text })` response | Done — matching frontend auto-detects, uses plain POST + JSON |
| `_askAIStream` prompt bugfix | Parser used non-existent `NodeType.STRING_LITERAL`, compiler silently emitted `/* ERROR */` in every streaming endpoint | Done — fixed both code paths, `LITERAL_STRING` is correct |
| Compile badge in Studio | `NwordsClear → NwordsJS · Nx · Nms` toolbar chip + auto-tests badge | Done — visible proof of compiler leverage |
| Meph voice mode | 🔊 toggle in chat pane — continuous mic + spoken replies in refined British male voice | Done — zero-deps Web Speech API, auto-pause during speech, sentence-buffered TTS, persistent across reloads |
| Eval criteria clarity | Rubric leads; "non-empty response" check demoted to dim italic footnote | Done — applied to Studio Tests pane + exported Markdown reports |
| Test runner timeouts | 30s → 120s CLI / 180s Studio; override via `CLEAR_TEST_TIMEOUT_MS`, `CLEAR_STUDIO_TEST_TIMEOUT_MS`, `CLEAR_NPM_INSTALL_TIMEOUT_MS` | Done — cryptic Windows `spawnSync cmd.exe ETIMEDOUT` translated to plain-English guidance |
| Stray diff-marker detection | Leading `-` / `+` on a source line → plain-English error naming the real cause instead of "undefined variable 'send back'" | Done — validator catches the multi-word-keyword-as-identifier case; AI-INSTRUCTIONS + Meph system prompt updated so edits don't leave diff artifacts |
| Voice mode tri-state | Off / 🔊 Speak / 🎤 Converse segmented control in chat pane | Done — Speak = TTS only (no mic), Converse = TTS + continuous STT; mic-denial falls back to Speak |
| SSE grading for structured payloads | Agent endpoints that stream `send back { score, reason }` now land in the grader with full JSON body | Done — session 32 widest-blast-radius bug; 14 unit tests in `playground/sse-drain.test.js` |
| Terminal newest-first ordering | Newest event at top, accent-highlighted; older entries fade | Done — removed the double-reverse that was burying new entries at the bottom |
| Eval score-gap display | Rubric scores render with tinted chip showing gap from threshold (+0.2 / -0.4) — green when clear, yellow when borderline, red when clearly failing | Done — flakiness reads as borderline case, not regression. Same format in exported MD reports. |
| Auto-rerun on eval fail | Failed rubric-graded specs auto-rerun once; pass on retry = flagged "borderline" with prior-attempt score exposed | Done — catches T=0 sampling jitter at ~2x cost on genuine failures only. Override with `CLEAR_EVAL_NO_RERUN=1`. |
| Probe honors `validate incoming:` | e2e/role/format probes now merge the endpoint's required fields into the body so probes don't 400 before the agent runs | Done — new `buildEndpointBody()` helper. Unblocked page-analyzer + lead-scorer end-to-end. |
| Concrete sample values | Field-level sample generator emits `"Acme Corp"` / `"quantum computing"` / `"alice@example.com"` instead of `"sample X"` | Done — generic strings made Claude-backed agents refuse ("I need more context"). Real values ground the grader + agent. |
| Eval child shutdown race | `killEvalChildAndWait()` awaits exit + 200ms OS socket grace before respawn | Done — sync kill was racing the next spawn on port 4999, surfacing as cascading "fetch failed." |
| Extended eval idle timer | `EVAL_IDLE_MS` 60s → 300s | Done — multi-agent suites run 3+ min; child was being reaped mid-run when grader bursts spanned 60s between probe hits. |
| **Agent+auth template evals all pass** | page-analyzer, lead-scorer, helpdesk-agent, ecom-agent, multi-agent-research | **29/29** specs pass end-to-end (was 15/29 at session 32 baseline). Real-API validation of the whole eval stack. |
| **Phase 85 — One-click deploy (Studio → Fly)** | Session 37 | Deploy button in Studio ships compiled apps to a live URL in seconds. Shared builder + metered AI proxy + tenant/billing layer + cross-tenant isolation. 72 passing tests across packaging, builder, proxy, billing, deploy, security. External prerequisites (Fly sales email, Stripe signup, domain registration, Anthropic org key) still required before first real deploy. |

## Session 37 — Supervisor + Factor DB + Marcus apps + HITL compiler fixes

| Feature | Syntax / Where | Status |
|---------|----------------|--------|
| **Factor DB** | `playground/factor-db.sqlite` — every Meph compile writes a row: {archetype, error_sig, compile_ok, test_pass, source_before, patch_summary} | Done — SQLite, WAL, indexed. 139 rows / 49 passing. |
| **Archetype classifier** | `playground/supervisor/archetype.js` — 15 shape-of-work categories | Done — queue_workflow/routing_engine/agent_workflow/dashboard/crud_app/content_app/realtime_app/booking_app/ecommerce/api_service/etl_pipeline/webhook_handler/batch_job/data_sync/general. All 13 templates classify correctly. |
| **Flywheel loop closure** | `/api/chat` compile error → `_factorDB.querySuggestions()` → injects 3 tier-ranked past examples as `hints` in tool result | Done — v2 layered: exact error + archetype / exact error / archetype gold |
| **Studio Flywheel tab** | Live dashboard: total rows, passing rows, progress to 200-row threshold, archetype table, recent activity, API health banner | Done — polls `/api/flywheel-stats` every 3s |
| **Studio Supervisor tab** | Run-sweep control (workers/tasks/timeout), live progress (per-task ✅/❌), session browser with click-to-expand trajectory drill-down | Done — 4 new endpoints (`/api/supervisor/sessions`, `/session/:id`, `/start-sweep`, `/sweep-progress`) |
| **Session Registry** | `playground/supervisor/registry.js` — SQLite-backed session tracking (state, port, task, pass_rate) | Done — WAL mode, 4 tests |
| **Worker Spawner** | `playground/supervisor/spawner.js` — spawns `node playground/server.js --port=X --session-id=Y` child processes | Done — port availability check, killAll |
| **Supervisor Loop** | `playground/supervisor/loop.js` — polls workers, detects TASK COMPLETE / STUCK, SSE status stream | Done — state machine + SSE |
| **Curriculum sweep harness** | `node playground/supervisor/curriculum-sweep.js --workers=3` — drives 25 curriculum tasks through N parallel workers | Done — pre-flight API check, fail fast on rate limit |
| **Eval replicated** | `node playground/eval-replicated.js --trials=3` — runs full 16-scenario suite on N workers, reports flake rate per scenario | Done — same infra as curriculum-sweep |
| **Training data exporter** | `node playground/supervisor/export-training-data.js --stats` or `--out=t.jsonl` — JSONL with 15 structured features per row | Done — ready for EBM once 200 passing rows accumulate |
| **EBM trainer stub** | `python playground/supervisor/train_reranker.py t.jsonl` — refuses below 200 passing, else trains + exports ONNX | Done — skeleton ready, dormant until threshold |
| **5 Marcus apps** | `approval-queue`, `lead-router`, `onboarding-tracker`, `support-triage`, `internal-request-queue` — business-ops templates in Studio dropdown | Done — top of dropdown, matching L7-L9 curriculum tasks |
| **`send back all X` shorthand** | `send back all Users` / `send back the User with this id` / `send back all Users where active is true` — inline retrieval, no named intermediate | Done — parser desugars to `[CRUD, RESPOND]`, 6 templates updated |
| **`this X` standalone expression** | `workspace_id = this id` / `items = get all Items where owner is this user_id` — URL param access anywhere | Done — parses to `incoming?.X` |
| **Test verb aliases** | `can user submit`, `add`, `post`, `send`, `make` → canonical `create`. Plus `see/read/get/list` → `view`, `remove` → `delete`, `edit/change/modify` → `update` | Done — `TEST_VERB_ALIAS` map in parser |
| **Intent hints (validator)** | `find`, `fetch`, `search`, `query`, `lookup`, `select`, `retrieve`, `filter`, `list`, `create`, `insert`, `add`, `remove`, `destroy`, `update`, `id`, `login`, `password`, `this`, `generate`, `summarize`, `classify`, `extract`, `translate`, `rewrite`, `analyze`, `predict` — all get curated hints pointing at canonical form | Done — `INTENT_HINTS` map in `validator.js`, replaces nonsensical Levenshtein suggestions |
| **Auth guard error UX** | Missing `requires login` on POST/PUT/DELETE shows full corrected endpoint example, not just one-line fix | Done — `validator.js` error message |
| **Classifier auth detection fix** | archetype.js was checking non-existent `REQUIRES_LOGIN` node type; now checks `REQUIRES_AUTH`, `REQUIRES_ROLE`, `AUTH_SCAFFOLD` | Done — Marcus apps now correctly tagged `queue_workflow` |
| **http_request 2xx = passing signal** | `/api/chat` http_request tool 2xx response now marks the latest Factor DB row as `test_pass=1` with 0.9 score | Done — curriculum sweeps that verify via HTTP now produce passing rows |
| **Pre-flight API check** | Sweep harnesses probe API with 5-token request before spawning workers; fail in 2s on rate limit instead of burning 10 min | Done — `curriculum-sweep.js` + `eval-replicated.js` |
| **Flywheel API health banner** | `/api/flywheel-stats` reports `apiHealth` (ok/no_key/error), Flywheel tab shows red/green banner with actual error text | Done — cached 5 min to avoid quota waste |
| **Cold-start seeder** | `node playground/supervisor/cold-start.js` — seeds DB with 13 gold templates (all 8 core + 5 Marcus) + 25 curriculum skeleton attempts | Done — idempotent, BM25 retrieval works immediately |
| **HITL Rule (CLAUDE.md)** | "Meph Failures Are Bug Reports on the System" — when Meph fails, fix compiler/docs/system prompt, merge-as-you-go. Matrix of symptom → root cause layer | Done — codified as mandatory rule + in memory |
| **Documentation Rule 9 surfaces** | Added FAQ.md + RESEARCH.md to the rule (was 7, now 9). Both skills (ship + write-plan) updated | Done — no new feature ships without updating all 9 |
| **Measured lift** | Sweep 6 (all HITL fixes active) vs Sweep 4: **+75% task completions (4→7)**, 30% faster wall clock, +38% more passing rows | Done — HITL rule proved itself empirically |
