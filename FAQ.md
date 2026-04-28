# Clear FAQ

How the system works, where things live, and why we made key decisions.
Search this before grepping. If the answer isn't here, add it after you find it.

**For RL, self-play, re-ranker architecture, and the oracle problem — see [RESEARCH.md](RESEARCH.md).**

---

## New Capabilities (Session 46 — plain English)

**Total by default.** Every `while` loop, every recursive function, every `send email`, and every `ask claude` / `call api` now has a runtime bound. The compiler emits the counter / timeout for you. If a hallucinated bug hits the bound, you get a legible error with a copy-pasteable fix — not a silent hang.

- `while cond:` silently caps at 100 iterations (warns). Override with `while cond, max N times:` for pagination or state machines that need more.
- Recursive functions cap at 1000 depth. Override via `max depth N` (parser support pending).
- `send email` defaults to 30s timeout. Override with `with timeout N seconds/minutes`.
- `ask claude` retries 429/5xx/network transients with 1s/2s/4s exponential backoff.

**Cross-target parity (PHILOSOPHY Rule 17).** Every safety property applies equally to Node, Cloudflare Workers, browser, and Python backends. A script at `scripts/cross-target-smoke.mjs` compiles every template × every target in 10s and syntax-checks each emission — catches drift where a runtime helper ships on Node but silently regresses on Python.

**Python tool-agents work.** Fixed three pre-existing emission bugs: `const _tools = [...]` was emitting JS into Python files, `TEST_DEF` was emitting JS `fetch()` calls, and `FUNCTION_DEF` didn't auto-detect async from body-has-`await`. Tool-use agents now compile cleanly to Python with a real `_ask_ai_with_tools` runtime helper.

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
- [Where is the incremental update logic for Cloudflare deploys?](#where-is-the-incremental-update-logic-for-cloudflare-deploys)
- [How do I rollback a Cloudflare app?](#how-do-i-rollback-a-cloudflare-app)
- [Why do schema changes require explicit confirmation during an update?](#why-do-schema-changes-require-explicit-confirmation-during-an-update)
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
- [Where does the queue primitive live?](#where-does-the-queue-primitive-live)

**How do I do X?**
- [How do I try Builder Mode (Marcus-first Studio layout)?](#how-do-i-try-builder-mode-marcus-first-studio-layout)
- [How do I add a new approval action?](#how-do-i-add-a-new-approval-action)
- [How do I add sidebar navigation to an app shell?](#how-do-i-add-sidebar-navigation-to-an-app-shell)
- [How do I add a page header and routed tabs?](#how-do-i-add-a-page-header-and-routed-tabs)
- [How do I add KPI stat cards?](#how-do-i-add-kpi-stat-cards)
- [How do I add a right detail panel?](#how-do-i-add-a-right-detail-panel)
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
- [Why is `queue` separate from `workflow`?](#why-is-queue-separate-from-workflow)
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

### Where is the incremental update logic for Cloudflare deploys?

**`playground/deploy-cloudflare.js` → `_deployUpdate(opts)`** is the fast-path branch. The orchestrator `deploySource()` reads `opts.mode` — `'update'` routes to `_deployUpdate`, anything else falls through to the original `_deployInitial()` full-provision path. The dispatcher that decides which mode to pass lives one layer up in **`playground/deploy.js` → `/api/deploy` handler**, which calls `store.getAppRecord(tenantSlug, appSlug)` before invoking the orchestrator and sets `mode: 'update'` if a record comes back.

**What `_deployUpdate` skips:** `provisionD1` (binding is permanent), `applyMigrations` (unless schema diff requires it — see below), `attachDomain` (already bound), and the full `setSecrets` push (only NEW keys not in `lastRecord.secretKeys` get sent).

**What it adds:** `_captureVersionId` round-trip to `api.listVersions` after `uploadScript`, then `store.recordVersion` to append the new entry to the per-app `versions[]` array.

**Schema-change gate:** `migrationsDiffer(oldBundle, newBundle)` byte-compares every `migrations/*.sql` file plus `wrangler.toml`. Any difference returns `{ ok: false, stage: 'migration-confirm-required', migrationDiff: [...] }` from the orchestrator, which the handler surfaces as `409 MIGRATION_REQUIRED`. Re-POST with `confirmMigration: true` unblocks: `applyMigrations` runs first, then `uploadScript`, then `recordVersion`.

Tests: `playground/deploy-cloudflare.test.js` covers all of the above; `playground/deploy.test.js` covers the handler-level routing.

---

### How do I rollback a Cloudflare app?

In Studio, open the **Publish** window on the app you want to roll back. The window has a **Version history** link — click it to expand the panel showing the last 20 versions with timestamps. Each non-current version has a **Rollback** button; the currently-live version has a "Current" label instead.

Clicking Rollback calls `POST /api/rollback { appName, version }`, which uses Cloudflare's `/deployments` endpoint via `wfp-api.js:rollbackToVersion` to flip the live URL to the chosen version (~1-2s wall clock). The handler then writes a new `recordVersion` entry to tenants-db with `note: 'rollback-from-vN'` so the version timeline reads chronologically (no branching). Your data isn't touched — rollback only swaps the Worker bundle.

If the version no longer exists on Cloudflare's side (someone deleted it from the dashboard, or it aged out of retention), the modal shows "This version no longer exists on Cloudflare — the history has been refreshed" and reloads the panel from `/api/app-info`.

For older versions beyond the in-Studio cap of 20, call `wfp-api.listVersions({ scriptName })` directly — Cloudflare keeps versions until explicitly deleted.

---

### Why do schema changes require explicit confirmation during an update?

**Because SQLite has no atomic schema swap.** D1 is SQLite under the hood. If Clear silently applied the new schema mid-update, there's a brief window where the schema has changed but the new code isn't serving yet — any in-flight request hits the OLD code against the NEW schema and errors. Worse, if the migration is destructive (drops a column, renames a table) and the upload-script step fails after the migration applies, the old code can't go back to reading the old schema because the column is gone.

So Clear treats any change to `migrations/*.sql` or `wrangler.toml` as schema-class and pauses the update for explicit user confirmation. The Studio modal shows the diff and a button labelled "Apply migration + update" that re-POSTs with `confirmMigration: true`. Auto-rollback of failed schema changes is intentionally out of scope today — if the migration applies but upload-script fails, the user has to manually re-apply the old migration SQL via the D1 console. That tradeoff lives in `plans/plan-one-click-updates-04-23-2026.md` § Section 3 (D4) and § Section 9 (known follow-ups).

---

### Where does the queue primitive live?

The `queue for X:` primitive is a brand-new Clear node type added 2026-04-27. End-to-end:

- **Parser** — `parser.js`: `parseQueueDef` lives next to `parseWorkflow` (search for `CANONICAL_DISPATCH.set('queue'`). Produces a `QUEUE_DEF` AST node with `entityName`, `reviewer`, `actions`, and `notifications`.
- **Compiler** — `compiler.js`: `case NodeType.QUEUE_DEF:` near the `ENDPOINT` dispatch site. Calls `compileQueueDef`, which emits the `<entity>_decisions` audit table, the optional `<entity>_notifications` outbound queue, the filtered `GET /api/<entity>s/queue` handler, and a login-gated `PUT /api/<entity>s/:id/<action>` for each action.
- **Validator** — `validator.js`: warns when `notify <role> on …` references a role with no `<role>_email` field on the entity.
- **Tests** — `clear.test.js`: search for `Queue primitive — parser`, `Queue primitive — compiler tables`, `Queue primitive — compiler URLs`. The Phase 8 migration tests live alongside the Deal Desk UAT block.
- **Real app using it** — `apps/deal-desk/main.clear` is the proof of value. Approval Queue, Onboarding Tracker, and Internal Request Queue also migrated.

Plan: `plans/plan-queue-primitive-tier1-04-27-2026.md`. Changelog entry at top of `CHANGELOG.md`.

### Where does the triggered email primitive live? (top-level `email <role> when <entity>'s status changes to <value>:`)

The second of three primitives unlocking Marcus's workflow apps, added 2026-04-28. End-to-end:

- **Parser** — `parser.js`: `parseEmailTrigger` lives next to `parseQueueDef` (search for `CANONICAL_DISPATCH.set('email'`). Produces an `EMAIL_TRIGGER` AST node with `recipientRole`, `entityName`, `triggerField` (always `'status'` for now), `triggerValue`, `subject`, `body`, `provider`, `replyTracking`. Dispatch fires only when the third token is the literal `when` (other top-level uses of `email` fall through). Validates the entity references a declared table; hard-fails on missing required body fields and on unknown body lines (F1 pattern).
- **Compiler — table emit** — `compiler.js`: `case NodeType.EMAIL_TRIGGER:` near the `QUEUE_DEF` dispatch. Calls `compileEmailTrigger`, which emits the shared `workflow_email_queue` table once per app (deduped via `ctx._workflowEmailQueueEmitted`) plus a comment marking each trigger's location.
- **Compiler — queue-action injection** — `compileQueueDef`'s per-action PUT loop now reads `ctx._astBody`, finds matching `EMAIL_TRIGGER` nodes (entityName + triggerValue match the action's `actionToTerminalStatus(action)`), and emits a `db.insert('workflow_email_queue', {...})` after the audit + notify inserts. Recipient resolution uses the `<role>_email` field-on-entity convention (same as the queue's notify clauses).
- **Compiler — user-defined endpoint injection (Phase 4.1-extension)** — `compileEndpoint` scans every endpoint body for `<entity>.status = <literal>` assignments. When the assignment matches an `EMAIL_TRIGGER`, splice the same `db.insert('workflow_email_queue', {...})` into the compiled body BEFORE the response statement. Without this, hand-written handlers (or apps that skip the queue primitive entirely) silently dropped triggers — the insert lived only in the queue auto-PUT path.
- **Validator — silent-bug guards (Phases 4.3 + 5.2)** — `validateEmailTriggers` walks every email_trigger and checks: (a) at least one URL handler (queue action OR user-defined endpoint) sets the entity's status to the trigger value, otherwise warn "never fires"; (b) the entity table declares `<role>_email`, otherwise warn "queue rows land with empty recipient_email"; (c) `body` and `subject` `{ident}` references match an entity field, otherwise warn "the customer will see literal '{ident}' text" (interpolation is not yet a runtime feature).
- **Tests** — `clear.test.js`: search for `Triggered email — parser (Phase 1)`, `Triggered email — compiler tables (Phase 3)`, `Triggered email — queue-action integration (Phase 4)`. Phase 3 includes a regression guard that asserts NO real provider URLs (api.agentmail.to, api.sendgrid.com, etc.) appear in default-build compiled output. Phase 4 covers BOTH queue auto-PUT and user-defined endpoint paths plus the validator silent-bug guards.
- **Real app using it** — `apps/deal-desk/main.clear` exercises the new top-level block alongside the queue's `counter` action: status transitions to `'awaiting'` queue an email to the customer.

Plan: `plans/plan-triggered-email-primitive-04-27-2026.md`. Phase B-1 (live email delivery worker — real sends through agentmail / sendgrid / etc.) is the only deferred chunk; everything else has shipped. Changelog entry at top of `CHANGELOG.md`.

### Where do the Clear Cloud auth URLs live? (signup, login, me, logout)

**The URL handlers:** `playground/cloud-auth/routes.js` — `mountCloudAuthRoutes(app, { pool })` wires four routes on Studio's Express app:
- POST `/api/auth/signup` → creates a user + auto-logs in + sets cookie
- POST `/api/auth/login` → verifies bcrypt + sets cookie
- GET  `/api/auth/me` → reads cookie, returns the authed user (or 401)
- POST `/api/auth/logout` → revokes session + clears cookie

**The auth helpers** (the SQL these routes hit): `playground/cloud-auth/index.js` — `signupUser`, `loginUser`, `validateSession`, `revokeSession`, `logoutAllSessions`, `issueEmailVerifyToken`, `verifyEmailToken`, `issuePasswordResetToken`, `resetPassword`. bcryptjs hashing, 32-byte hex tokens hashed with SHA-256 before storage, 30-day hard TTL + 7-day idle timeout (configurable via env).

**The schema:** `playground/db/migrations/0002_users_sessions.sql` — runs through the regular migrations runner alongside CC-1's init. Two tables (`users`, `sessions`) at the public schema, separate from `clear_cloud.*` which holds tenant-deploy state. Same logical Postgres DB, two concern-scoped namespaces.

**The pages that call these URLs:** `playground/{login,signup,dashboard}.html`. Login + signup auto-redirect signed-in users to /dashboard; dashboard auth-gates and bounces unauth'd users to /login.

**The Studio wiring:** `playground/server.js` calls `mountCloudAuthRoutes(app, { pool: _cloudTenantHandle.pool })` after the tenant-store factory. When DATABASE_URL is unset (Studio dev mode), the pool is null and every auth URL returns 503 `auth_not_configured` — Studio dev keeps working without auth.

**Why two auth systems?** Clear apps generated via `allow signup and login` have their own auth layer that lives INSIDE each customer's app (per-tenant SQLite, JWT cookies). Clear Cloud's auth is for buildclear.dev itself — accounts, sessions, and the dashboard that lists a customer's apps. Same bcryptjs dep, same cost factor, separate schemas.

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
| `playground/supervisor/curriculum-sweep.js` | Drives curriculum tasks through N parallel workers. CLI: `--workers=3 --tasks=... --timeout=150 --per-level-stats`. Has pre-flight API check, worker-death classification, and per-level sweep rollups. |
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
- Factor DB write hook in `/api/chat` and cc-agent/MCP: every `compile` tool call → row; every `run_tests` OR `http_request` 2xx → row marked passing. MCP endpoint verification creates the missing row first when Meph used `edit_code` auto-compile.
- Factor DB hint injection: compile errors pull 3 tier-ranked past examples into the compile tool result's `hints` field

**Phase status (see PROGRESS.md for full HITL fix table):**
- Phase 1 (Session Registry) ✅
- Phase 2 (Worker Spawner) ✅
- Phase 3 (Supervisor Loop) ✅
- Phase 4 (Task Distribution) ✅ — verified via curriculum-sweep
- Phase 5 (Factor DB + archetype + cold start + live logging) ✅
- Phase 6 (Merge Step) ⬜ Deferred until needed
- Phase 7 (Observability — Studio panel) ✅ — Flywheel tab + Supervisor tab

~50 tests across supervisor modules; 2097 compiler tests still green.

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

### How do I add a new approval action?

Add it to the `actions:` list in the queue block. The compiler does the rest — new login-gated URL, status transition, audit row, notification fan-out if a `notify` clause matches.

```clear
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject, counter, awaiting customer, escalate
  notify customer on counter, awaiting customer
  notify rep on approve, reject, escalate
```

Recompile. You now have `PUT /api/deals/:id/escalate` — login-gated, sets the deal's status to `'escalate'`, inserts an audit row, and (because of the `notify rep on … escalate` clause) inserts a notification row for the rep.

If the action name has multiple words, the URL uses the first word (`awaiting customer` → `/awaiting`). The status transitions follow these defaults: `approve` → `'approved'`, `reject` → `'rejected'`, `counter` → `'awaiting'`, `awaiting customer` → `'awaiting'`. Anything else uses the action name as the status verbatim.

To wire a button for the new action, add it to your queue page's `with actions:` block:

```clear
display pending as table showing customer, status with actions:
  'Approve' is primary
  'Reject' is danger
  'Escalate' is secondary
```

Clear matches the button label (case-insensitive) to the action and binds it to the right login-gated URL.

### How do I add sidebar navigation to an app shell?

Use explicit `nav section` and `nav item` rows inside `app_sidebar`.

For multi-page apps, declare `app_layout` once on the shell page (`/`); other pages contain just content. The compiler emits a shell-page router that parks/unparks page content into the shell's outlet on route change — sidebar persists, no double-sidebar. See "Where does the shell-page router live?" below for internals.

### Where does the shell-page router live? (multi-page apps with a persistent sidebar)

**`compiler.js`** emits the router into the compiled HTML. Two pieces:

1. **`buildHTML` walker** (around the `case NodeType.SECTION` for `app_layout` / `app_content`): the first page that wraps its body in `app_layout` becomes THE shell — its `app_layout` div gets `data-clear-shell-root="true"`, its `app_content` div gets `data-clear-shell-outlet="true"`, and the shell's content body is wrapped in `<div data-clear-routed-content="<shellPageId>">...`. Non-shell pages get `data-clear-routed-content="<pageId>"` on their outer page div.
2. **`compileToHTML` router emit** (around the `_routes` map): when at least one page has `hasShell=true`, the compiler emits three runtime helpers — `_clearTemplateHost`, `_clearParkMountedRoutes`, `_clearRenderRouteIntoShell` — and `_router()` calls them before falling back to the simple show/hide path. After every route swap the router calls `_recompute()` via `requestAnimationFrame` so visible tables re-bind to already-fetched data.

Apps without `app_layout` use the original simple show/hide router (no shell, no outlet, no behavior change).

The 5 regression tests live in `clear.test.js` under `describe('Shell-page router (chunk #10) — fixes empty-tables-after-route-change', ...)`.

```clear
section 'Sidebar' with style app_sidebar:
  heading 'Deal Desk'

  nav section 'Approvals':
    nav item 'Pending' to '/cro' with count pending_count with icon 'inbox'
    nav item 'Approved' to '/approved' with count approved_count with icon 'check-circle-2'

  nav section 'System':
    nav item 'Settings' to '/settings' with icon 'settings'
```

`with count` can be a page variable or literal. `with icon` uses Lucide icon names;
quote hyphenated names. The compiled sidebar marks the matching route active.
Legacy `text` and `link` children still render, but do not use them for real
dashboard navigation.

### How do I add a page header and routed tabs?

Put `page header` and `tab strip` at the top of `app_content`.

```clear
section 'Content' with style app_content:
  page header 'CRO Review':
    subtitle '5 deals waiting'
    actions:
      button 'Refresh'
      button 'Export'

  tab strip:
    active tab is 'Pending'
    tab 'Pending' to '/cro'
    tab 'Approved' to '/approved'
    tab 'Escalated' to '/escalated'
```

`page header` renders the workbench title row. `tab strip` renders real route
links and marks the current path active. Use this for queues, CRMs, and admin
views with multiple states.

### How do I add KPI stat cards?

Use `stat strip` under `app_content`, usually after the page header and tabs.

```clear
stat strip:
  stat card 'Pending Count':
    value pending_count
    delta '+1.8 pts vs last week'
    sparkline [3, 4, 6, 5, 8]
    icon 'inbox'
```

Each `stat card` needs one `value` line. `delta`, `sparkline`, and `icon` are
optional. Use quoted Lucide icon names.

### How do I add a right detail panel?

Use `detail panel for selected_row:` next to the selectable table it explains.

```clear
detail panel for selected_deal:
  text selected_deal's customer
  display selected_deal's amount as dollars called 'Value'
  text selected_deal's status
  actions:
    button 'Reject'
    button 'Counter'
    button 'Approve'
```

The body can use normal Clear UI primitives. Put final decisions inside
`actions:` so they render as the sticky bottom action bar.

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

### Why is `queue` separate from `workflow`?

They look related — both are multi-step, both have state — but the shape is fundamentally different.

A `workflow` is for chaining AI agents in sequence with state passed through. The "actor" at each step is an agent. Branches and retries are computed; humans don't intervene mid-flow.

A `queue` is for a **single human reviewer** to decide on items piling up in a list. The "actor" is a person (the reviewer). The audit log is load-bearing — you need to know who clicked what, when, with what note. The decision URL has to be auth-gated. Notifications need to fan out to humans (the rep, the customer) — not other agents.

Folding both into one primitive would compromise both. The workflow primitive gives up state-passing semantics it needs. The queue primitive picks up agent-orchestration knobs it doesn't want.

There's also a Tier 2 future for queues: multi-stage (Manager → Director → CRO). That's still a different shape from workflow — it's a sequence of human gates, not a sequence of agent calls. Tier 2 lands when a second multi-stage app surfaces; until then, the single-stage primitive covers Marcus's actual flows.

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

### Why does Clear Cloud beat Retool and Lovable at deploy specifically?

Both have "Publish" buttons. Both ship to a URL in seconds. But both have shapes Clear can beat on structural grounds, not just UX polish.

| Dimension | Retool | Lovable | **Clear Cloud** |
|---|---|---|---|
| Source of truth | Proprietary visual config (JSON in their DB) | Generated React/Next.js in GitHub | **Plain-English `.clear` file** |
| Can you leave? | Self-host ($$$) or trapped | `git clone`, deploy elsewhere | **`clear export` → portable Docker, runs anywhere** |
| Reads like English? | No (visual blocks) | No (React/TypeScript) | **Yes — the whole point** |
| AI edits the app safely? | Retool AI can't edit structure, only inside components | Lovable prompts edit React — works but output is opaque | **Meph edits Clear source directly; 1:1 compile makes diffs reviewable** |
| Live edit running prod app? | No — rebuild/redeploy cycle | No — regenerate/redeploy cycle | **Yes (Live App Editing — flagship)** |
| Multi-tenant hosted? | Yes | Yes | Yes (Phase 85 + Clear Cloud) |
| Custom domain | One-click (paid) | One-click (Pro $25/mo) | One-click (Team $99/mo) |
| Agent-first | Bolted onto visual platform | Generates code | **Native primitive (`ask claude`, `has tools:`)** |
| AI cost safety? | Manual | None — runaway agent burns your card | **AI Gateway (rate limits + caps + caching) — v2** |

**The four structural differentiators:**

1. **Portability without penalty.** Retool traps you in their visual editor. Lovable's React is portable but no human reviews it. Clear is portable AND readable — Marcus's CFO can read the deal-desk app and understand it.
2. **Live editing a running prod app.** Live App Editing reshapes apps with data/session preservation. Retool and Lovable both require a rebuild-redeploy cycle.
3. **AI cost safety baked in.** Retool and Lovable let runaway agents burn $500 overnight. Clear's v2 wraps every `ask claude` in Cloudflare AI Gateway automatically.
4. **Agents are first-class, not bolted on.** Building an agent app in Clear is ~20 lines; in Retool it's a stitched workflow; in Lovable it's React + vendor SDK.

**The one place Retool/Lovable currently win:** time from signup to first working app. They have years of templates and matured editors. Clear has Studio + Meph + the Core 8 templates. Gap closes with: more templates, Builder Mode, click-to-edit (all on the near-term roadmap).

---

### Why is the competitive landscape what it is?

Researched Session 35 (Sep 2026) from G2, Capterra, Reddit, product pages.

**Direct competitors (AI-native app builders):**

- **Retool** — $450M+ raised, incumbent. Developer-only (needs JS + SQL). $10–50/seat/mo. Large apps "extremely cumbersome to maintain, nearly impossible to test." 2023 breach exposed 27 cloud customers. Clear's edge: no developer needed, readable source, auto-generated tests, compile-time security.
- **Superblocks** — $60M raised, enterprise-focused. $49/creator/mo. G2 reviewers call lack of automated testing "a deal breaker." Has "Clark" AI agent but generates black-box output. Clear's edge: readable source, deterministic compilation, built-in tests.
- **Zite** — Closest competitor. 100K+ teams. AI-native, prompt-to-app. $0/15/55/mo, unlimited users on all plans. SOC 2 Type II, SSO, Salesforce, custom domains. Weakness: black-box output, no agent primitives, no compile-time guarantees, "modify with follow-up prompts" = re-prompt and hope. Clear-side gap: they have hosting, compliance, integrations, marketplace, 100K users.
- **Lovable** — AI app generator. Gets you "70% of the way there." Users report "unable to diagnose problems hidden deep within code they couldn't read." Credits burn on AI mistakes.
- **Bolt.new** — AI app generator. "Rewrites the entire file, breaks your UI, and still fails to fix the original problem." Users spend "$1,000+ on tokens just debugging." Context degrades past 15–20 components.

**Developer-only tools (different category — Marcus can't use these):**

- **Appsmith** — Open source, self-hosted. G2 4.7/5. Needs SQL + JS. Performance degrades with large datasets.
- **Budibase** — Open source. G2 4.5/5. Licensing changes angered community. Automations are fragile.
- **ToolJet** — Open source. 25K stars. Best visual design quality. $19/builder/mo.

**Simple/portal tools (too limited for Marcus):**

- **Softr** — Best for non-technical IF data lives in Airtable. Pricing pivot destroyed trust. Customization ceiling low.
- **Noloco** — Airtable/Sheets integration. Imposed 50K row limit mid-flight. Reliability degrades at scale.

**New AI-native entrants (watch list):**

- **AgentUI** — Claims 500+ teams. No independent reviews yet.
- **Bricks.sh** — 1.6M EUR pre-seed (Jan 2026). One-click admin panels. Too early to evaluate.

**Clear's unique combination:**
1. Readable source code a non-technical person can understand
2. Deterministic compilation (same input = same output, always)
3. Built-in AI agent primitives with guardrails
4. Compile-time security guarantees (27 bug classes eliminated)
5. Auto-generated tests from the source
6. Portable output (cancel the platform, keep your compiled JS)

Every competitor either requires a developer (Retool, Appsmith, Budibase, ToolJet) OR generates black-box output the user can't read (Lovable, Bolt, Zite). Nobody gives you all six. Gap to close: hosting, compliance, integrations, marketplace, users.

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
| Browser server may 404 on some routes | Untested in real browser — verify if you hit this |
