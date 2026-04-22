# Clear FAQ

How the system works, where things live, and why we made key decisions.
Search this before grepping. If the answer isn't here, add it after you find it.

**For RL, self-play, re-ranker architecture, and the oracle problem — see [RESEARCH.md](RESEARCH.md).**

---

## New Capabilities (Session 38 — plain English)

**The flywheel closed the loop.** Session 37 plumbed the Factor DB + dashboard. Session 38 trained the first reranker on real data and wired it into `/api/chat`. Now every compile error triggers retrieval → reranker rescoring → top-3 hints injected into Meph's next turn. Boot log confirms: `EBM reranker loaded: 24 features, intercept=0.368`. Absent bundle falls back to raw BM25 (no regression).

**Step-decomposition labeling is live.** Every compile row is tagged with which task milestone Meph has hit (e.g. "Todos table defined" vs "GET single endpoint"). Sweep reports show per-step pass rates. First step-decomposed insight: Meph nails the first 3 steps of most tasks and falls apart at step 7 (-0.31 contribution in the EBM shape function).

**Reranker model chosen: EBM (glass-box Generalized Additive Model).** XGBoost rejected — we want every hint Meph sees to be auditable as a sum of plottable feature contributions. Lasso also competitive at current data scale (0.39 vs EBM 0.30 val R²). Both trained from the same pipeline; production uses whichever wins per retrain. See `RESEARCH.md` "The EBM Re-Ranker" chapter.

**Haiku 4.5 is default.** 3× cheaper per row than Sonnet, 94% of Sonnet's eval-meph score (15/16 vs 16/16). Override with `MEPH_MODEL=claude-sonnet-4-6`. Meph's iteration limit bumped 15 → 25 (unblocked the L3-L6 CRUD dead zone where short iterations starved full-CRUD tasks).

**Inline record literals** (`send back { received is true }`) — the parser now supports the object-expression form that SYNTAX.md had documented but the parser didn't implement. Before this, every webhook task silently abandoned before compiling. Both `is` and `:` (JSON-style) separators work.

**16 archetypes, proper routing.** Added `kpi` (single-chart-plus-aggregates pages — the common RevOps reporting shape). Fixed classifier ordering so dashboards with status-column + auth don't misroute to queue_workflow.

**Compiler Flywheel — Phase 2 designed, not yet built.** A second-order moat where production runtime data (latency, crash rate per emit pattern) drives compiler emit-strategy selection. 4-tier plan in `ROADMAP.md` + `plans/plan-compiler-flywheel-tier1-04-19-2026.md`.

**What this buys Marcus:** when Meph hits an error during an app build, he sees 3 past working fixes automatically injected as text. No more "why does this keep failing the same way" — the flywheel remembers for him. Every Marcus who uses Clear feeds every other Marcus.

---

## Previous Capabilities (Session 37 — plain English)

**Meph now learns across sessions.** Before, every Meph chat started with zero memory. Now every compile he does writes to a local database (`playground/factor-db.sqlite`). When he hits an error, the system finds 3 past sessions where someone hit the same error and fixed it, and shows them to Meph as hints. He stops re-discovering the same bugs.

**A live dashboard in Studio.** Open the IDE, click the new **Flywheel** tab. Shows the database growing, which kinds of apps are being built (approval queues, CRUDs, AI agents...), progress toward the re-ranker training threshold, and a banner telling you whether the Anthropic API is reachable. Updates every 3 seconds.

**5 new template apps in the dropdown.** Open Studio, pick one — all working in 10 seconds:
- **Approval Queue** — submit → pending → approved/rejected
- **Lead Router** — intake + auto-assign by company size
- **Onboarding Tracker** — customer + step checklist
- **Support Triage** — AI classifies tickets into categories + priority
- **Internal Request Queue** — IT/HR/Facilities triage

These match what Marcus's RevOps team actually builds. They're the demo.

**Meph writes cleaner Clear.** Around ten specific things he used to get wrong now come with targeted compiler suggestions or new syntax support:
- Write `send back all Users` — no more throwaway intermediate variables
- Use `this id` anywhere in an expression, not just in specific forms
- The compiler tells him "use `look up X with this id`" instead of guessing "did you mean 'send'?" when he writes `find`
- Auth-required mutations get a corrected example showing exactly where to put `requires login`
- Test blocks accept natural English: `can user submit a request`, `can user add a lead`, etc.

**The compounding part.** Every time we fix a bug at the system level (compiler, docs, system prompt), every future Meph session benefits for free. Every successful Meph session also feeds the database. Over months, the accumulated wins compound.

**What's blocking full value realization:** we need ~200 rows where Meph built something that passed its tests before the ranking model becomes useful. We have 38. At ~8 per automated sweep, we're roughly 20 sweeps away. Or fewer if real users build real apps (richer trajectories than curriculum skeletons).

---

## Table of Contents

**Where is X?**
- [Where is the feature list / what can Clear do today?](#where-is-the-feature-list--what-can-clear-do-today)
- [Where is the changelog / what shipped recently?](#where-is-the-changelog--what-shipped-recently)
- [Where is the Clear Cloud product decision documented?](#where-is-the-clear-cloud-product-decision-documented)
- [Where does Ghost Meph live?](#where-does-ghost-meph-live)
- [How does Ghost Meph route requests?](#how-does-ghost-meph-route-requests)
- [Where does the Studio server run?](#where-does-the-studio-server-run)
- [What ports does everything use?](#what-ports-does-everything-use)
- [Where does a compiled app run?](#where-does-a-compiled-app-run)
- [What is BUILD_DIR?](#what-is-build_dir)
- [Where does a Meph session start and end?](#where-does-a-meph-session-start-and-end)
- [Where is the tool call log?](#where-is-the-tool-call-log)
- [Where are Meph's tools defined?](#where-are-mephs-tools-defined)
- [Where does Meph's system prompt live?](#where-does-mephs-system-prompt-live)
- [Where does the compiler pipeline start?](#where-does-the-compiler-pipeline-start)
- [What does compileProgram() return?](#what-does-compileprogram-return)
- [Where does test quality get measured?](#where-does-test-quality-get-measured)
- [Where is session data stored?](#where-is-session-data-stored)
- [Where does the re-ranker get its training signal?](#where-does-the-re-ranker-get-its-training-signal)
- [Where does weak assertion lint run?](#where-does-weak-assertion-lint-run)
- [Where does the red-step check run?](#where-does-the-red-step-check-run)
- [Where does the sandbox runner live?](#where-does-the-sandbox-runner-live)
- [Where is patch.js and what does it do?](#where-is-patchjs-and-what-does-it-do)
- [Where is the curriculum?](#where-is-the-curriculum)
- [Where does the playground bundle come from?](#where-does-the-playground-bundle-come-from)
- [Where does the supervisor plan live?](#where-does-the-supervisor-plan-live)
- [Where does the archetype classifier live?](#where-does-the-archetype-classifier-live)

**How do I do X?**
- [How do I try Builder Mode (Marcus-first Studio layout)?](#how-do-i-try-builder-mode-marcus-first-studio-layout)
- [How do I add a new node type?](#how-do-i-add-a-new-node-type)
- [How do I add a new synonym?](#how-do-i-add-a-new-synonym)
- [How do I add a new Meph tool?](#how-do-i-add-a-new-meph-tool)
- [How do I run the tests?](#how-do-i-run-the-tests)
- [How do I rebuild the playground bundle?](#how-do-i-rebuild-the-playground-bundle)
- [How do auth tokens work in compiled apps?](#how-do-auth-tokens-work-in-compiled-apps)
- [How does the database layer work?](#how-does-the-database-layer-work)
- [How does WebSocket/broadcast work?](#how-does-websocketbroadcast-work)
- [How does the eval system work?](#how-does-the-eval-system-work)

**Why did we do X?**
- [Why does send back compile to return inside define function?](#why-does-send-back-compile-to-return-inside-define-function)
- [Why do user-defined functions shadow built-in aliases?](#why-do-user-defined-functions-shadow-built-in-aliases)
- [Why write the test before the function?](#why-write-the-test-before-the-function)
- [Why mechanical signals before ML for test quality?](#why-mechanical-signals-before-ml-for-test-quality)
- [Why a re-ranker before the sandbox, not after?](#why-a-re-ranker-before-the-sandbox-not-after)
- [Why is the supervisor plan GA-based?](#why-is-the-supervisor-plan-ga-based)
- [Why is there a minified bundle for the playground?](#why-is-there-a-minified-bundle-for-the-playground)

**What is X?**
- [What is Clear's big thesis?](#what-is-clears-big-thesis)
- [What is the RL training environment?](#what-is-the-rl-training-environment)
- [What is the difference between index.html and ide.html?](#what-is-the-difference-between-indexhtml-and-idehtml)
- [What are the known broken things?](#what-are-the-known-broken-things)

---

## Where is X?

### Where is the feature list / what can Clear do today?

**`FEATURES.md`** at repo root. Capability reference by category: core language, expressions, web frontend, backend, database, service integrations, data operations, AI agents, workflows, scheduling, testing, policies, Studio IDE.

Moved out of `ROADMAP.md` on 2026-04-21 so the roadmap can focus on what's *next*. If a row doesn't appear in `FEATURES.md`, Clear probably can't do it yet — but also cross-check `intent.md` (the authoritative node-type spec) and the parser before assuming, since docs have historically lagged behind the implementation.

**For each feature row, the pattern is:** `| Feature name | Canonical syntax example | Notes (synonyms, gotchas, edge cases) |`. Use this to write `.clear` quickly without re-reading every syntax file.

---

### Where is the changelog / what shipped recently?

**`CHANGELOG.md`** at repo root. Session-by-session history, newest at the top. Moved out of `ROADMAP.md` on 2026-04-21 for the same reason FEATURES.md was carved out — roadmap is forward-looking, changelog is backward-looking.

If you want "what shipped this week?", check CHANGELOG. If you want "what's been committed but not yet merged?", check `git log main..` on the active feature branch.

---

### Where is the Clear Cloud product decision documented?

**`ROADMAP.md` → `North Star: Clear Cloud (P0 — Q2 2026)`** — the short version at the top of ROADMAP: Marcus-first positioning, build on Phase-85 Fly infrastructure, five missing pieces (CC-1 through CC-5), ~6–8 weeks to ship.

**`ROADMAP.md` → `Clear Cloud — Marcus-first hosted platform strategy (2026-04-21)`** — the full strategy further down: reasoning for Marcus over Dave, what Marcus experiences, detailed breakdown of each CC-* item, competitive positioning vs Retool / Lovable / Bubble.

**`ROADMAP.md` → `Auto-hosting by app type (v2, post-Clear-Cloud)`** — the v2 plan for compiler-driven routing to Cloudflare Workers + D1 (compatible apps), Modal (Python ETL), or Fly Docker (native binaries) once Clear Cloud is stable on Fly.

Key decision locked 2026-04-21: **keep the Fly-based Phase-85 infrastructure as default**; Cloudflare auto-routing lands as v2 after Marcus is paying. Don't rebuild the hosting layer before shipping the product.

---

### Where does the Live App Editing widget live?

**The widget source:** `runtime/meph-widget.js` (pure browser JS, no imports). Gets copied into `clear-runtime/meph-widget.js` inside each compiled app's build directory on every Studio `/api/run`. Served at `/__meph__/widget.js` from the compiled app.

**The compiler emission** that makes this work: `compiler.js` function `compileToHTML` checks `hasAuthForWidget` (any `AUTH_SCAFFOLD` node in the body) and appends a `<script src="/__meph__/widget.js" defer>` tag right after the nav-items script. The `compileToJSBackend` function emits two routes inside the `hasAuthScaffold` block — `GET /__meph__/widget.js` reads the file from `clear-runtime/`, and `ALL /__meph__/api/:action` proxies to `process.env.STUDIO_PORT` (503s cleanly if unset).

**The Studio side that feeds this:** `playground/server.js` in the `/api/run` handler copies `runtime/meph-widget.js` into the child's `clear-runtime/` and injects `STUDIO_PORT` into the child's env, pointing at Studio's own port.

**The Studio endpoints the proxy forwards to:** `/__meph__/api/propose`, `/ship`, `/rollback`, `/snapshots`. Wired by `createEditApi(app, deps)` from `lib/edit-api.js`, mounted near the top of `playground/server.js`.

### Where does Ghost Meph live?

`playground/ghost-meph/` — env-gated chat-backend dispatch. When `MEPH_BRAIN` is set, `/api/chat` routes through a local backend instead of paying Anthropic per call.

| File | What |
|---|---|
| `router.js` | `isGhostMephActive()` + `fetchViaBackend(payload, headers)` dispatch. Returns Anthropic-shaped Response-like object so `/api/chat`'s reader loop is unchanged. |
| `cc-agent.js` | `MEPH_BRAIN=cc-agent` — spawns `claude --print` subprocess. Text-only MVP; tool support pending (`plans/plan-ghost-meph-cc-agent-tool-use-04-21-2026.md`). |
| `ollama.js` | `MEPH_BRAIN=ollama:<model>` — POSTs to local Ollama daemon at `OLLAMA_HOST`. Default model from `OLLAMA_MODEL` env or the brain string suffix. |
| `openrouter.js` | `MEPH_BRAIN=openrouter` (or `openrouter:qwen`) — POSTs to OpenRouter `/v1/chat/completions`. Requires `OPENROUTER_API_KEY`. Default model `qwen/qwen3.6-plus-preview:free`. |
| `format-bridge.js` | Anthropic ↔ OpenAI translation. Used by both Ollama and OpenRouter (any backend speaking OpenAI's chat-completions shape). |

Tests: `playground/ghost-meph.test.js` (~60 assertions across 9 phases). Run: `node playground/ghost-meph.test.js`. No real network or subprocess required — tests exercise deterministic failure paths (missing key, refused connection, missing CLI) so they pass without daemons or API keys.

### How does Ghost Meph route requests?

`/api/chat` checks `isGhostMephActive()` (true iff `MEPH_BRAIN` is set + non-empty). When active:
1. The API-key 400 gate is skipped (local backends don't need a key).
2. The fetch site (line ~3740 of `playground/server.js`) calls `fetchViaBackend(payload, headers)` instead of `fetch('https://api.anthropic.com/v1/messages', ...)`.
3. The router dispatches based on `MEPH_BRAIN`:
   - `cc-agent` → spawns Claude Code subprocess (text-only today)
   - `ollama:<model>` → HTTP POST to Ollama daemon
   - `openrouter` / `openrouter:qwen` → HTTP POST to OpenRouter
   - `haiku-dev` → still stub (calibration backend, future)
   - any other value → stub with "unknown backend" warning, doesn't crash

Each backend returns a Response-like object whose body streams Anthropic-shaped SSE events. The `/api/chat` reader loop consumes that unchanged — it doesn't know whether the response came from real Claude or a local backend.

**The point:** during long Meph sessions or sweeps, the dollar cost is in real Anthropic API calls. Routing through Russell's `claude` CLI subscription (cc-agent), a local Ollama model, or OpenRouter's free tier moves that cost off the production key. Once cc-agent gains tool-use support, curriculum sweeps run for free.

### Where does the Studio server run?

```
node playground/server.js
```

Opens at `http://localhost:3456`. The port is set at the bottom of `playground/server.js`:
```js
const PORT = process.env.PORT || 3456;
app.listen(PORT, ...);
```

---

### What ports does everything use?

| Port | What |
|------|------|
| 3456 | Clear Studio (the IDE you use) |
| 3459 | Studio spun up by the e2e test suite |
| 4000+ | User's compiled app (increments each run, starts at 4000) |
| 4999 | Eval child process (sandbox for running evals) |

---

### Where does a compiled app run?

`playground/server.js` spawns a child Node process from `BUILD_DIR`. The port starts at 4000 and increments on each `/api/run` call. The running port is stored in the module-level `runningPort` variable.

When you click Run App in Studio, the server writes `server.js` to `BUILD_DIR`, installs npm deps if needed, spawns the child, waits for it to log `running on port`, and returns `{ port }` to the IDE.

---

### What is BUILD_DIR?

`playground/.playground-build/` — the directory where compiled apps are written before running.

Every `/api/run` call writes `server.js` + `package.json` + `clear-runtime/` symlink to this directory, then spawns Node from it. The directory is reused across runs (old files cleaned first). Don't edit anything in here — it gets overwritten.

---

### Where does a Meph session start and end?

`playground/server.js` — the `/api/chat` POST handler, starting around line 2124.

One request = one session. The handler receives `{ messages, editorContent, apiKey }`, streams SSE events back, and ends with `{ type: 'done' }`.

`currentSource` and `currentErrors` are scoped to the request handler — they track editor state across tool calls within that single session.

---

### Where is the tool call log?

Also in the `/api/chat` handler in `playground/server.js`.

`toolResults` is an array built during the session. Each tool call appends to it. The server emits `tool_start` and `tool_done` SSE events to bracket each call — `tool_start` fires **twice** per call (once bare, once with a summary). Use a boolean `_inTool` flag to dedup, not an ID.

At session end, `toolResults` is sent with the `done` event.

---

### Where are Meph's tools defined?

`playground/server.js` — the `TOOLS` array, starting around line 1772. Each tool has:
- `name` — what Meph calls
- `description` — what Meph reads to decide when to use it
- `input_schema` — validated before execution

Tool execution is in `executeTool(name, input)`. Validation is in `validateToolInput(name, input)`. New tools need entries in all three places.

---

### Where does Meph's system prompt live?

`playground/system-prompt.md` — loaded fresh on every `/api/chat` request. Edit it and changes take effect immediately, no server restart needed.

After any change, run `node playground/eval-meph.js` to verify the 16 tool scenarios still pass.

---

### Where does the compiler pipeline start?

`index.js` — `compileProgram(source, options)` is the public entry point.

Pipeline: `tokenizer.js` → `parser.js` → `validator.js` → `compiler.js`

The tokenizer uses longest-match greedy synonym resolution. The parser builds an AST of `NodeType` nodes, each with `.type` and `.line`. The validator checks for semantic errors without generating code. The compiler walks the AST and emits JS/Python/HTML.

Context object `{ lang, indent, declared, stateVars, mode, insideFunction, insideAgent, streamMode }` threads through compilation.

---

### What does compileProgram() return?

```js
{
  errors: [],          // compile errors — empty means success
  warnings: [],        // lint warnings
  javascript: '...',   // Express server JS (backend target)
  browserServer: '...', // compiled HTML+JS for browser (frontend target)
  tests: '...',        // generated test runner code
  ast: {...},          // the parsed AST
  dbBackend: 'local memory' | 'sqlite' | 'postgres',
  stats: {
    ok: true,
    endpoints: 1,
    tables: 0,
    pages: 0,
    functions: 0,
    agents: 0,
    workflows: 0,
    npm_packages: 0,
    has_auth: false,
    has_database: false,
    lines: 3,
    warnings: { total: 0 }
  }
}
```

`javascript` is the full Express server. `browserServer` is the compiled HTML+JS for web-target apps. Check `errors.length === 0` before using either.

---

### Where does test quality get measured?

Two places, two different signals:

**Weak assertion lint (static)** — `compiler.js`, inside the `UNIT_ASSERT` compile case. Checks assertion patterns at compile time. Weak patterns: `is not empty`, `is not nothing`, `is true` (bare). Pushes to `r.warnings[]`. Not shown to Meph or the user — internal signal only.

**Red-step check (process)** — `playground/server.js`, end of `/api/chat` handler. Scans the tool call log: did `run_tests` ever return `ok: false` before the first `ok: true`? If not, Meph skipped the red step.

---

### Where does the EBM reranker live?

Three pieces (Session 38):

- **Training script:** `playground/supervisor/train_reranker.py` — Python, uses `interpret` (InterpretML) for EBM and `sklearn.linear_model.LassoCV` for the Lasso sanity check. Reads JSONL exported from Factor DB, writes both a pickle (Python inference) and a JSON shape-table (JS inference). Refuses to train below the configured `--min-passing` threshold (default 200).
- **Feature exporter:** `playground/supervisor/export-training-data.js` — reads `code_actions` rows, runs the Clear parser over `source_before` to extract AST counts, derives session-trajectory features (prev_compile_ok, error_is_novel, step_advanced), and emits 24-feature JSONL.
- **JS-side scorer:** `playground/supervisor/ebm-scorer.js` — pure JS, no ML dependency. Loads the JSON shape-table bundle, scores a feature vector via `intercept + Σ bin_score(feature_i)`. Called per candidate in `/api/chat`'s retrieval path (server.js near line 2860).

Bundle file: `playground/supervisor/reranker.json` (created manually after training by copying from `/tmp/reranker-XX.json` to here). Server loads it at boot; absent bundle = fallback to raw BM25 ordering.

### How does a hint get to Meph?

1. Meph calls the `compile` tool with current source
2. If `r.errors.length > 0`, server computes `archetype` + `error_sig`
3. `factorDB.querySuggestions()` returns top-10 candidates via tiered BM25 (same error in this archetype → same error anywhere → same-archetype gold rows)
4. If EBM bundle loaded: `rank(bundle, candidates, featurizeFactorRow)` rescores + resorts
5. Top 3 returned in `result.hints.references`, each with `tier`, `summary`, `score`, `ebm_score`, `source_excerpt`
6. Meph reads them in the tool result of his next turn

### Where is session data stored?

**Short term (built):** `playground/sessions/[session-id].json` — one file per session, written at end of `/api/chat`. Readable via `GET /api/session-quality` (dev-only, not in Studio UI).

**Medium term (supervisor plan, Phase 1):** `playground/sessions.db` — SQLite. Sessions table schema:

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  task TEXT,
  status TEXT,         -- 'running' | 'done' | 'failed'
  started_at INTEGER,
  ended_at INTEGER,
  tool_calls TEXT,     -- JSON array
  test_results TEXT,   -- JSON array
  weak_assertion_count INTEGER,
  red_step_observed    BOOLEAN,
  final_source TEXT
);
```

---

### Where does the re-ranker get its training signal?

From the `code_actions` table in the Factor DB. Each logged compile+test cycle is one training example.

**Global context features (per app — from the parser):**
- `archetype` (~15 values, from `archetype.js`)
- `num_tables`, `num_endpoints`, `num_pages` (bucketed)
- `has_auth`, `has_agent`, `has_scheduler`, `has_websocket`, `has_upload`
- `runtime` (SQLite / Postgres)
- `multi_tenant`

**Local context features (per compile cycle):**
- `error_category`, `patch_op_type`, `file_location`, `table_involved`

**Quality features (from the test quality signals work):**
- `weak_assertion_count`, `red_step_observed`

**Label:** did the final `run_tests` show `ok: true`?

~20 structured features total. XGBoost territory — small tree-based model, trains in seconds on 200 examples, interpretable. NOT a 22M-param cross-encoder. The input space is tiny (low-cardinality categoricals + booleans); using a large language model would be overkill.

Retrieval query: "in apps with this archetype AND this error category, what fixed it?" — NOT "what fixed this error anywhere."

**Upgrade path (only if XGBoost plateaus):**
- Medium term: add embedding of the compiled JS diff. Use `text-embedding-3-small` on before/after diff. Needs ~2k sessions.
- Long term: fine-tune on Clear once you have 5k+ sessions. Probably never needed.

See `RESEARCH.md` for the full architecture rationale.

---

### Where does weak assertion lint run?

`compiler.js` — in `generateE2ETests()`, before the test body is compiled. Weak patterns detected on the AST:
- `check === 'not_empty'` → existence-only check, doesn't verify actual value → `code: 'weak_assertion'`
- `check === 'eq'` AND `right.type === 'literal_boolean'` AND `right.value === true` → bare boolean → `code: 'weak_assertion'`
- `unitAsserts.length === 1` in a test block → `code: 'single_assertion'`

Output: `r.warnings[]` with `{ line, severity: 'quality', code, message }`. Not shown to Meph or user.

---

### Where does the red-step check run?

`playground/server.js`, end of `/api/chat` handler:

```js
const testCalls = toolResults.filter(t => t.name === 'run_tests');
const redStepObserved = testCalls.some(t => t.result?.ok === false || t.result?.error);
```

This mirrors the assertion logic in `playground/test-tdd-loop.js` — the integration test for the full TDD loop.

---

### Where does the sandbox runner live?

`playground/server.js` — the eval child process infrastructure:
- `ensureEvalChild()` — spawns child server on port 4999
- `killEvalChildAndWait()` — graceful shutdown with 2s SIGKILL fallback + 200ms grace (Windows holds ports briefly after exit)
- `EVAL_IDLE_MS = 300_000` — idle timeout (must exceed longest eval suite)

`playground/test-tdd-loop.js` — integration test that drives a live Meph session end-to-end and asserts the TDD sequence happened.

---

### Where is patch.js and what does it do?

`patch.js` at repo root. It's the program diff/patch API — 11 structured edit operations that let an AI agent modify a Clear program without rewriting it from scratch.

Operations: `add_endpoint`, `add_field`, `remove_field`, `add_test`, `fix_line`, `insert_line`, `remove_line`, `add_validation`, `add_table`, `add_agent`, `add_table`.

This is the **constrained action space** for RL training. Instead of free-form text generation, the agent picks from 11 typed operations. That constraint makes the action space tractable and makes outputs more reliable.

```js
import { patch } from './patch.js';
const result = patch(source, [
  { op: 'add_endpoint', method: 'GET', path: '/api/health', body: "send back 'OK'" },
  { op: 'fix_line', line: 7, replacement: "  send back user" },
]);
// result.source = new Clear source with patches applied
```

---

### Where is the curriculum?

`curriculum/` at repo root. 20 benchmark tasks across 10 difficulty levels (L1–L10). Used for RL training and eval.

Each task is a `.clear` skeleton with a goal. The RL agent must complete it. The test suite (`clear test`) grades success. Curriculum tasks are also compiled in the e2e test suite — all 20 must compile clean.

---

### Where does the playground bundle come from?

`playground/clear-compiler.min.js` — a minified ESM bundle of the compiler, built with esbuild:

```
npx esbuild index.js --bundle --format=esm --minify --outfile=playground/clear-compiler.min.js
```

Run this after any change to `index.js`, `compiler.js`, `parser.js`, `tokenizer.js`, `validator.js`, or `synonyms.js`. The bundle is what the browser loads in the playground — it's the closed-source distribution of the compiler.

---

### Where does the supervisor plan live?

`plans/plan-supervisor-multi-session-04-17-2026.md` — the original plan. Historical (plans are write-once once implementation begins).

**What's built as of Session 37 end (`feature/supervisor-multi-session`):**

| File | What it does |
|------|--------------|
| `playground/supervisor.js` | Supervisor entry point (standalone) — spawns N workers, serves REST/SSE API |
| `playground/supervisor/registry.js` | Session registry (SQLite, WAL mode) — tracks worker state |
| `playground/supervisor/spawner.js` | Worker process spawner (port availability check, killAll) |
| `playground/supervisor/loop.js` | Poll loop + state machine (TASK COMPLETE / STUCK detection) + SSE |
| `playground/supervisor/factor-db.js` | Factor DB — code_actions, ga_runs, ga_candidates, reranker_feedback |
| `playground/supervisor/archetype.js` | Shape-of-work classifier (15 categories) |
| `playground/supervisor/cold-start.js` | Seeds Factor DB with 13 gold templates + 25 curriculum skeletons |
| `playground/supervisor/curriculum-sweep.js` | Drives all 25 curriculum tasks through N parallel workers. CLI: `--workers=3 --tasks=... --timeout=150`. Has pre-flight API check. |
| `playground/supervisor/export-training-data.js` | Exports Factor DB to JSONL for XGBoost training. `--stats` for summary. |
| `playground/supervisor/train_reranker.py` | Python XGBoost trainer. Refuses below 200 passing rows with clear message. |
| `playground/supervisor/db-stats.js` | Standalone DB stats reporter (CLI, prints archetype breakdown) |
| `playground/eval-replicated.js` | Runs 16-scenario Meph eval across N parallel trials. Detects flake rate per scenario. |
| `playground/eval-scenarios.js` | Shared scenario definitions (imported by eval-meph + eval-replicated) |

**`server.js` extensions for supervisor integration:**
- `--port=` / `--session-id=` CLI args
- `_workerLastSource` / `_workerLastErrors` module-level shadow vars (mirrored from /api/chat per-request locals)
- `GET /api/worker-heartbeat` + `GET /api/current-source` — worker polling endpoints
- `GET /api/flywheel-stats` — Factor DB dashboard (archetype breakdown, recent rows, API health)
- `GET /api/supervisor/sessions` — aggregated session list
- `GET /api/supervisor/session/:id` — full trajectory for one session
- `POST /api/supervisor/start-sweep` / `GET /sweep-progress` / `POST /clear-sweep` — Studio-triggered sweeps
- Factor DB write hook in `/api/chat`: every `compile` tool call → row; every `run_tests` OR `http_request` 2xx → row marked passing
- Factor DB hint injection: compile errors pull 3 tier-ranked past examples into the compile tool result's `hints` field

**Phase status (see PROGRESS.md for full HITL fix table):**
- Phase 1 (Session Registry) ✅
- Phase 2 (Worker Spawner) ✅
- Phase 3 (Supervisor Loop) ✅
- Phase 4 (Task Distribution) ✅ — verified via curriculum-sweep
- Phase 5 (Factor DB + archetype + cold start + live logging) ✅
- Phase 6 (Merge Step) ⬜ Deferred until needed
- Phase 7 (Observability — Studio panel) ✅ — Flywheel tab + Supervisor tab

~50 tests across supervisor modules; 2108 compiler tests still green.

---

### Where does the archetype classifier live?

`playground/supervisor/archetype.js` — takes a parsed Clear program and returns one of 15 archetypes describing the *shape of work*:

**UI-forward:** `queue_workflow`, `routing_engine`, `agent_workflow`, `dashboard`, `crud_app`, `content_app`, `realtime_app`, `booking_app`, `ecommerce`

**Backend-only:** `api_service`, `etl_pipeline`, `webhook_handler`, `batch_job`, `data_sync`

**Fallback:** `general`

Deterministic rules over parser output. No ML. Runs in milliseconds. Interpretable — you can log "classified as `queue_workflow` because tables have a `status` field and the app has auth policies."

The archetype is stored as a column on `code_actions` in the Factor DB (indexed). Used by `querySimilar({ archetype })` to filter retrieval — "in queue_workflow apps with auth, when validation fails, what fixed it?" That's the engineer-parity: real engineers don't fix errors in isolation, they know the app shape.

Validation: all 8 core templates classify to the correct archetype (see `archetype.test.js`). See `RESEARCH.md` for the full rule chain and upgrade path.

---

## How do I do X?

### How do I try Builder Mode (Marcus-first Studio layout)?

Visit Studio with `?studio-mode=builder` in the URL. Example: `http://localhost:3456/?studio-mode=builder`.

**What changes in builder mode:**
- Preview fills the top 60% of the screen (full width). Chat drops to the bottom 40%. Editor is hidden.
- Chat input placeholder becomes "What do you want to build today, or which app to change?" — Marcus-first prompt instead of "Ask Meph."
- Toolbar gains a **Show Source ◀** button that opens the `.clear` editor as a right-side overlay rail.
- The Run/Deploy button becomes a loud **Publish** button (accent-filled, bolder type). Same handler, same `/api/deploy` endpoint.
- The `Hide Chat` toggle is hidden (chat can't collapse below 40vh in this layout).

**Opt-out:** `?studio-mode=classic`. Preference persists in localStorage so you don't have to keep adding the param.

**What's not in v0.1 (deferred):**
- Auto-hide source editor after 3 successful ships (BM-3 full)
- Click-to-edit on preview elements (BM-4)
- "What are you building?" tile gallery on empty state (BM-6)
- Status bar (users / agent spend / last ship)
- `cmd+.` shortcut to force classic layout

**Tests:** `node playground/builder-mode.test.js` (31 assertions, port 3459).

**Source:** `playground/ide.html` CSS block starting at "BUILDER MODE v0.1" comment, `detectStudioMode()` function near end of main script block, `window.toggleSource` next to `window.toggleChat`.

**Full spec:** `ROADMAP.md` → "Builder Mode — Marcus-first Studio layout". Plan: `plans/plan-builder-mode-v0.1-04-21-2026.md`. Changelog entry at top of `CHANGELOG.md`.

---

### How do I add a new node type?

Five steps. Don't skip any.

1. **Add to NodeType enum** — `parser.js`, the `NodeType = Object.freeze({...})` block around line 126. Add `MY_NODE: 'my_node'`.

2. **Parse it** — `parser.js`, in the appropriate `parseLine()` dispatch. Detect the keyword sequence, build `{ type: NodeType.MY_NODE, ...fields, line: ctx.line }`, push to `ctx.body`.

3. **Compile it** — `compiler.js`, in `compileNode()`. Add `case NodeType.MY_NODE:` and return the compiled string.

4. **Update both TOCs** — `parser.js` and `compiler.js` each have a TABLE OF CONTENTS at the top. Update them. Non-negotiable.

5. **Document it** — all 11 surfaces: `intent.md`, `SYNTAX.md`, `AI-INSTRUCTIONS.md`, `USER-GUIDE.md`, `ROADMAP.md` (only if the feature was on the roadmap; otherwise skip), `landing/*.html` (if user-facing), `playground/system-prompt.md` (if Meph should use it), `FAQ.md` (add a "How do I X?" or "Where does X live?" entry), `RESEARCH.md` (if it affects training-signal architecture), `FEATURES.md` (capability reference row), and `CHANGELOG.md` (session-by-session history entry). If it's not in the docs, it doesn't exist.

Then run `node clear.test.js` + template smoke test (8 core templates, 0 errors).

---

### How do I add a new synonym?

`synonyms.js` — the `SYNONYM_TABLE` object. Map the new word/phrase to its canonical form.

For multi-word synonyms: add to `MULTI_WORD_SYNONYMS` array in addition to `SYNONYM_TABLE`.

Then **bump `SYNONYM_VERSION`** at the bottom of `synonyms.js`. This invalidates any cached tokenization. Format: semver string `'0.28.0'` → `'0.29.0'`.

Then check for collisions — grep `synonyms.js` for words that could ambiguously parse in different contexts. The collision risks are documented in `CLAUDE.md` and `learnings.md`.

Run the template smoke test after any synonym change — new synonyms can break existing apps in non-obvious ways.

---

### How do I add a new Meph tool?

Three places in `playground/server.js`:

1. **`TOOLS` array** (~line 1772) — add the tool definition with `name`, `description`, `input_schema`. The description is what Meph reads to decide when to use the tool. Make it specific.

2. **`validateToolInput(name, input)`** — add a case that validates the input shape. Return an error string if invalid, `null` if ok.

3. **`executeTool(name, input)`** — add a case that runs the tool and returns a result string.

Then run `node playground/eval-meph.js` to verify Meph can discover and use the new tool. The eval drives 16 scenarios — add a new scenario for your tool if it doesn't fit an existing one.

---

### How do I run the tests?

```bash
node clear.test.js              # 1939 compiler unit tests — run this always
node sandbox.test.js            # integration tests (spawns real servers)
node playground/server.test.js  # Studio server API (85 tests)
node playground/e2e.test.js     # template compile + endpoint + curriculum (77 tests)
node playground/ide.test.js     # Playwright IDE UI (needs server running)
node playground/eval-meph.js    # Meph tool eval, 16 scenarios (~90s, ~$0.10–0.30)
```

Pre-commit hook: `node clear.test.js`
Pre-push hook: `node clear.test.js` + `node playground/e2e.test.js` + Meph eval (if `ANTHROPIC_API_KEY` set)

To skip Meph eval for one push: `SKIP_MEPH_EVAL=1 git push`

**Push from the main repo checkout, not a worktree.** The Playwright e2e test fails in worktrees because of environment differences.

---

### How do I rebuild the playground bundle?

```
npx esbuild index.js --bundle --format=esm --minify --outfile=playground/clear-compiler.min.js
```

Do this after any change to the compiler pipeline files. The bundle is checked into git and is what users get in the browser playground.

---

### How do auth tokens work in compiled apps?

Clear's `allow signup and login` compiles to a full auth scaffold:

- `POST /auth/signup` — bcrypt hashes password, creates user, returns JWT
- `POST /auth/login` — verifies password, returns JWT
- `GET /auth/me` — returns the authenticated caller from JWT

JWT secret comes from `process.env.JWT_SECRET`. Defaults to `'clear-test-secret'` in the test runner. Use a real secret in production.

Endpoints with `requires login` get JWT middleware injected. The middleware validates the token and sets `req.user`. Endpoints with `requires role X` additionally check `req.user.role`.

Two JWT formats exist in the wild (legacy vs modern templates) — the eval runner detects which one by regex-matching the emitted `serverJS`. See learnings.md → Session 32.

---

### How does the database layer work?

`runtime/db.js` — the database abstraction. Three backends:

| Backend | When | How |
|---------|------|-----|
| `local memory` | Default, no database declared | In-memory JS object, resets on restart |
| `sqlite` | `use sqlite` in Clear source | SQLite file at `.clear-db.sqlite` |
| `postgres` | `use postgres` in Clear source | Connects via `DATABASE_URL` env var |

The compiled app imports `db.js` via a symlink in `BUILD_DIR/clear-runtime/`. The runtime creates tables on first use (`db.createTable(name, schema)`). CRUD operations: `db.insert`, `db.findAll`, `db.findOne`, `db.update`, `db.delete`.

Constraints (`required`, `unique`, `email`) are enforced at the runtime layer, not the DB layer — the compiled server validates before calling `db.insert`.

---

### How does WebSocket/broadcast work?

`subscribe to X` in Clear compiles to a WebSocket endpoint. `broadcast to all` pushes to all connected clients.

The compiled server uses `ws` package. The WebSocket server shares the same HTTP server as Express. Client JS is auto-injected into the compiled HTML — it connects to the same host/port and listens for messages.

Channel names are strings. `broadcast to all watching X` sends only to clients subscribed to channel `X`.

---

### How does the eval system work?

The eval system grades Meph's app-building quality without a human.

1. **Compile** the Clear source with `generateEvalEndpoints` option — injects `/_eval/<agent>` HTTP endpoints for every agent in the app.
2. **Spawn** an eval child process on port 4999 (`ensureEvalChild()`).
3. **Run probes** — HTTP requests to `/_eval/<agent>` with synthetic inputs.
4. **Grade** — compare response shape/content against specs. Format evals are deterministic. Role/E2E evals use Claude as judge when `ANTHROPIC_API_KEY` is set.
5. **Report** — markdown or CSV output with pass/fail per scenario.

The eval child is killed between template runs (`killEvalChildAndWait()`). Idle timeout is 300s. See learnings.md → Session 34 for the bugs that were fixed here.

---

## Why did we do X?

### Why does send back compile to return inside define function?

`send back` is Clear's one keyword for "give a value back." Inside an HTTP endpoint, that means `res.json()`. Inside a `define function` block, it means a plain `return`.

The compiler uses `ctx.insideFunction: true` (set by the `FUNCTION_DEF` compile case) to route `compileRespond()` to the right path. Without it, every user-defined function silently emitted HTTP response code and crashed at runtime when called from a test block.

The fix is two lines. The bug was silent for months because nobody tested the function→test-block call chain end-to-end.

---

### Why do user-defined functions shadow built-in aliases?

If you name a function `sum`, Clear's synonym table maps `sum` to `_clear_sum` (the built-in array-sum helper). Your function was silently rerouted.

Fix: `_findUserFunctions()` pre-scans the AST for all `FUNCTION_DEF` nodes at compile time, building a Set of user-defined names. In `exprToCode()` CALL resolution, user-defined names are checked first — before `mapFunctionNameJS()`. User always wins.

This mirrors lexical scoping: inner scope shadows outer. Applies to any built-in alias (`sum`, `max`, `min`, etc.).

---

### Why write the test before the function?

**Practical:** forces you to state what "done" looks like before writing code. The test is a frozen spec — you can't game it by writing code first.

**Research:** the test becomes a machine-readable oracle. The agent authors its own success criterion before knowing the implementation. Self-supervised training signal — no human labels needed. Full explanation: **[RESEARCH.md — The Core Insight](RESEARCH.md#the-core-insight-meph-solves-the-oracle-problem)**

---

### Why mechanical signals before ML for test quality?

ML needs labeled data. You don't have it yet. Mechanical signals (weak assertion patterns, red-step check) are deterministic — they produce a quality score immediately and become features in the learned model later. Full explanation: **[RESEARCH.md — Mechanical Quality Signals](RESEARCH.md#mechanical-quality-signals-the-bootstrap)**

---

### Why a re-ranker before the sandbox, not after?

The sandbox costs 5–30s per candidate. The re-ranker filters before the sandbox runs — even 60% accuracy cuts cost significantly. Full architecture: **[RESEARCH.md — The Re-Ranker](RESEARCH.md#the-re-ranker-architecture-recommendation)**

---

### Why is the supervisor plan GA-based?

Beam search exploits, stops exploring. GA adds recombination + LLM-as-mutation (AlphaEvolve/FunSearch pattern) + MAP-Elites diversity grid. Full explanation: **[RESEARCH.md — The GA](RESEARCH.md#the-ga-why-genetic-not-beam-search)**

---

### Why is there a minified bundle for the playground?

The compiler is closed source. The playground runs in the browser and needs the compiler. The bundle (`playground/clear-compiler.min.js`) is the compiler obfuscated for distribution — users can't easily read the source. The repo itself stays private. The bundle is rebuilt after compiler changes and committed.

---

## What is X?

### What is Clear's big thesis?

Clear is an alignment layer for AI-generated software — not just an app builder.

Every other AI code generator (Lovable, Bolt, Cursor, Devin) answers "how do you know the AI shipped safe code?" with: **hope.** Clear answers it with: **the compiler won't let it.**

**The one-liner:** Clear is the language AI writes when the output has to be safe.

**Company:** Crystallized (company) / Clear (language) / Clear Studio (product)

**Fundraising sequence:**
- $3M seed: "We built a compiler that prevents AI from shipping unsafe code. Here are 200 companies using it for internal tools."
- $40M Series A: "500 companies run apps compiled by Clear. We want to generalize this to all AI-generated code."

Full thesis + hard takeoff scenario + research arc: **[RESEARCH.md](RESEARCH.md)**

---

### What is the RL training environment?

Clear's deterministic compiler, structured errors, constrained action space (patch.js), and built-in test syntax make it a natural RL gym.

| Component | Status |
|-----------|--------|
| Sandbox runner | Built — isolated child process, timeout, memory limit |
| Curriculum | Built — 20 benchmarks, 10 difficulty levels, 63 tests |
| Structured eval API | Built — `compileProgram()` returns JSON scores/stats/warnings |
| Patch API | Built — 11 structured edit operations = constrained action space |
| Source maps | Built — runtime errors map to Clear line numbers |
| HTTP test assertions | Built — `call POST /path`, `expect response status` = reward function |

**Current blocker:** No fine-tuning access. The gym is ready but can't train athletes yet.

Full RL architecture, re-ranker design, and what this doesn't buy: **[RESEARCH.md](RESEARCH.md)**

---

### What is the difference between index.html and ide.html?

`playground/index.html` — the old static playground. Loads the compiler bundle (`clear-compiler.min.js`) in the browser. No server required. Compiler-only — no Meph, no running apps, no file system access. Useful for quick syntax experiments.

`playground/ide.html` — the full Clear Studio IDE. Requires the server (`node playground/server.js`). Three-panel layout: CodeMirror editor + preview/terminal + Meph chat. Can compile, run, test, eval, and access the file system. This is what users actually use.

When someone says "Studio," they mean ide.html + server.js together.

---

### What are the known broken things?

| Issue | Workaround |
|-------|-----------|
| `needs login` on a page compiles to blank white page — JWT check hides everything but doesn't show login form or redirect | Don't use `needs login` on pages yet; use endpoint auth instead |
| `for each` loop body in HTML doesn't render child content — outputs whole object as string instead of expanding template | Use `display X as cards showing field1, field2` instead |
| `ui's Card()` in web target crashes `buildHTML` | Don't use namespaced component calls in web target |
| Browser server may 404 on some routes | Untested in real browser — verify if you hit this |
