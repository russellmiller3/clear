# Plan: Clear Cloud on Cloudflare Workers for Platforms

**Branch:** `claude/cloudflare-temporal-setup-PvwvL` (in use)
**Date:** 2026-04-23
**Status:** Red-teamed 2026-04-23 — 3 P0 + 8 P1 findings patched. Ready for execute.
**Supersedes (partial):** `plans/plan-one-click-deploy-04-17-2026.md` — keeps UI, tenants.js, billing, session cookies, /api/deploy endpoint shapes. Replaces the Fly builder service + builder-machine architecture with direct Cloudflare Workers for Platforms (WFP) API calls from Studio.
**Sibling plan:** `plans/plan-click-to-edit-04-23-2026.md` (stub) — Marcus UX work, strictly after this plan ships.

---

## 🎯 The Problem

Marcus wants to click Publish and see his app live at `<slug>.buildclear.dev` in under 10 seconds, without knowing what Cloudflare is, without installing wrangler, without a token. Today's deploy flow targets Fly.io via an always-on builder machine; that architecture has three problems at our stage:

1. **Cold-start economics.** Fly machines cost ~$3/mo idle, ~$5–8 active. At 10,000 Marcus users that's $30k+/mo just for idle apps nobody opens today. WFP scales to zero structurally (cold-start-free edge execution) and costs ~$650/mo at the same scale — 50× cheaper.
2. **Durable workflows.** `runs on temporal` compiles today but has no deployment wiring. Users with multi-step agent workflows need a durable execution engine; Cloudflare Workflows is native to Workers and doesn't require a second vendor or worker bundle.
3. **Second vendor.** Keeping Fly means maintaining two infra stacks (Fly machines + Cloudflare DNS) plus a Postgres host. Single-vendor WFP gives us Workers + D1 + Workflows + Durable Objects + Cron + KV in one API.

The fix: swap the deploy backend from Fly builder → direct WFP API calls from Studio. Keep everything else the UI/billing/tenants/sanitize team built in the 04-17 plan.

---

## 🔧 The Fix — Studio Calls Cloudflare API Directly

```
Marcus's browser            Studio (Vercel/Fly)            Cloudflare API
────────────────            ───────────────────            ──────────────
[Publish] button ─POST─→    /api/deploy
                            auth → tenantSlug
                            canDeploy(tenant) gate
                            compileProgram(src, target:'cloudflare')
                            packageBundle → {wrangler.toml, src/index.js, migrations/, static/}
                            POST /accounts/{id}/d1/database ──→ (returns db_id)
                            POST /accounts/{id}/d1/database/{db_id}/query (migrations) ──→
                            PUT /accounts/{id}/workers/dispatch/
                              namespaces/{ns}/scripts/{slug} ──→ (uploads bundle)
                            PUT /accounts/{id}/workers/dispatch/
                              namespaces/{ns}/scripts/{slug}/secrets ──→
                            POST /accounts/{id}/workers/dispatch/
                              namespaces/{ns}/scripts/{slug}/domains ──→ (<slug>.buildclear.dev)
                            record in tenants-db
                            ←── { ok: true, url, jobId }
         ←── URL ────────
         "Live at deals-acme.buildclear.dev"

                            User traffic → *.buildclear.dev → dispatch Worker → user Worker
                            user Worker's `ask claude` → fetch(env.AI_PROXY) → Durable Object → Anthropic
                            `runs on temporal` → env.MY_WORKFLOW.create({...}) → Cloudflare Workflow
                            scheduled agents → Worker's scheduled() handler (wrangler.toml crons)
```

### Why this works

- **No builder machine.** Studio compiles directly and POSTs script content to CF. Removes the always-on Fly VM from the architecture.
- **Scale to zero.** WFP scripts don't run until a request arrives. 10k idle apps cost nothing.
- **Durable workflows native.** `runs on temporal` re-points to Cloudflare Workflows emission — same AST node, different emit.
- **Single-vendor for the user-facing deploy path.** CF covers Workers + D1 + Workflows + DO + Cron + KV for the deployed app surface. One API token, one billing line for tenant deploys. *Caveat:* `playground/ai-proxy/` (the metered Anthropic gateway) stays on Fly in this plan — users Workers fetch out to it. True single-vendor requires moving ai-proxy into a Durable Object, which is tracked as a follow-up plan stub (see Phase 10 docs task: file `plans/plan-ai-proxy-to-durable-object-STUB.md`). Until then, we are honestly single-vendor-for-deploy + two-vendor-for-AI.
- **Keeps the tested UX.** Deploy button, modal, progress polling, secret prompting, custom domain, rollback — all stay.

---

## ⚠️ Architectural Shift Flagged

**The `runs on temporal` emission path flips from Temporal SDK to Cloudflare Workflows SDK.** The parser and AST don't change. `compiler.js:compileWorkflow()` gains a `target === 'cloudflare'` branch. Apps compiled with the Node target still get the Temporal SDK output — we don't delete the code path. But all WFP-deployed apps use Cloudflare Workflows.

**Why flag:** Temporal emission was marked Phase 88 DONE in `ROADMAP.md`. This plan effectively changes what "DONE" meant — we have two durable-execution targets now. Not a regression, but a doc sync is needed.

**Decision:** keep both emission paths. Short-term every deploy uses Cloudflare Workflows. If we ever re-activate Temporal (Dave target with self-hosted Temporal), the code is still there.

---

## 🚫 Out of Scope (explicit)

- Dave/CLI path. `clear package --target docker` is v2.
- End-user Cloudflare account signup or wrangler install. Never — Russell owns the CF account; users never touch it.
- Migrating existing Fly-deployed apps. Zero production users on Fly.
- Replacing `pg` in existing CC modules. D1 adapter is additive, not a replacement.
- Temporal Cloud integration. Emission path stays, inactive.
- Click-to-edit UX (covered in `plan-click-to-edit-04-23-2026.md`).
- Builder Mode chrome (covered in `plan-builder-mode-v0.1-04-21-2026.md`).

---

## 📁 Files Involved

### New files
| File | Purpose |
|------|---------|
| `runtime/db-d1.js` | D1 adapter — same interface as `runtime/db.js` but binds to `env.DB` instead of pg/SQLite |
| `runtime/auth-webcrypto.js` | PBKDF2 password hashing via `crypto.subtle` — replaces bcryptjs for Workers target |
| `lib/packaging-cloudflare.js` | Emits wrangler.toml + src/index.js + D1 migrations; called by `packageBundle()` when `target === 'cloudflare'` |
| `lib/packaging-cloudflare.test.js` | Unit tests — canonical fixture apps compile to Workers bundle |
| `playground/wfp-api.js` | Thin wrapper around Cloudflare API: upload-script, D1 provision, secrets, domains, delete |
| `playground/wfp-api.test.js` | Mocks CF API; verifies request shapes |
| `playground/deploy-cloudflare.js` | WFP-flavored `deploySource()` — replaces the builder-POST path in `playground/deploy.js` |
| `playground/deploy-cloudflare.test.js` | End-to-end test with mocked CF API |

### Modified files
| File | Change |
|------|--------|
| `lib/packaging.js` | `packageBundle()` dispatches on `opts.target`: default = existing Node/Dockerfile emit, `'cloudflare'` = call into `lib/packaging-cloudflare.js` |
| `compiler.js` | Three emission paths gain a `target === 'cloudflare'` branch: (a) `_askAI` utility — fetch-only, no `/tmp` fallback; (b) `compileWorkflow()` — emit Cloudflare Workflows classes instead of Temporal SDK; (c) scheduled agents — emit `scheduled()` handler + signal to packaging for `[triggers] crons = [...]`; (d) `knows about:` — emit lazy-load-on-first-call instead of startup |
| `playground/deploy.js` | `deploySource()` dispatches: if tenant opts into Cloudflare target (or it's the default in v1), call `deploy-cloudflare.js`; else existing builder path. `/api/deploy` endpoint body stays identical |
| `cli/clear.js` | Delete `deployCommand` (Railway path) — no replacement. Update help output + `commands` list |
| `playground/clear-compiler.min.js` | Rebuild after compiler changes (automated) |

### Files kept AS-IS (load-bearing, do not touch)
| File | Why not touched |
|------|-----------------|
| `playground/ide.html` Deploy button + modal | UX is correct; only backend swaps |
| `playground/tenants.js` | Tenant store, canDeploy, plan gating — all still applies |
| `playground/billing.js` | Stripe orchestration unchanged |
| `playground/sanitize.js` | Slug/domain/ownership validators still apply |
| `playground/ai-proxy/` | Continues to exist; either stays on Fly (simplest) or moves to Durable Object (future phase, not in this plan) |

---

## 🔁 Data Flow — What Cloudflare API Calls Fire, in Order

Every Publish runs this sequence in `playground/deploy-cloudflare.js`:

```
1. compileProgram(source, { target: 'cloudflare' })
   → result.workerBundle = { 'src/index.js', 'src/workflows/*.js', 'migrations/*.sql', 'wrangler.toml', 'static/*' }
   → result.secretsNeeded = ['STRIPE_KEY', ...]
   → result.cronTriggers = ['*/10 * * * *', ...]
   → result.workflowClasses = ['OnboardingWorkflow', ...]

2. Provision or fetch D1 database
   → If tenants-db has a d1_database_id for (tenant, appSlug): reuse it
   → Else: POST /accounts/{id}/d1/database { name: '<tenant>-<app>' } → d1_database_id
   → Apply migrations: POST /accounts/{id}/d1/database/{d1_id}/query { sql: migrations.join('\n') }

3. Upload script + bindings via multipart form
   → PUT /accounts/{id}/workers/dispatch/namespaces/{ns}/scripts/{slug}
   → Body: multipart form
     - metadata: { main_module: 'src/index.js', bindings: [D1, Workflows, AI_PROXY service, KV for knowledge], compatibility_date, compatibility_flags }
     - module files: src/index.js, src/workflows/*.js
     - wrangler.toml derived fields mirror into metadata

4. Set secrets (one call per secret)
   → PUT /accounts/{id}/workers/dispatch/namespaces/{ns}/scripts/{slug}/secrets
   → Body: { name, text, type: 'secret_text' }
   → ANTHROPIC_PROXY_URL + TENANT_JWT auto-added for AI-enabled apps

5. Attach custom domain if requested, else assign default
   → Default: <slug>.buildclear.dev — handled by the dispatch Worker's route config
   → Custom: POST /accounts/{id}/workers/dispatch/namespaces/{ns}/scripts/{slug}/domains { hostname }

6. Record in tenants-db
   → UPDATE apps SET wfp_script_name, d1_database_id, deployed_at WHERE tenant_slug=$1 AND app_slug=$2
   → INSERT into deploys with status='ok'

7. Return to UI
   → { ok: true, url: 'https://<slug>.buildclear.dev', jobId, d1_database_id }
```

### Failure modes mapped to user-visible errors

| Stage | Failure | UI shows |
|-------|---------|----------|
| compile | syntax errors in source | "Fix these errors first" + line numbers |
| D1 provision | CF API 500 | "Database provisioning failed — retry" |
| D1 migrations | migration SQL invalid | "Schema error: <sql error>" (rare — compiler emits migrations) |
| upload | multipart malformed OR script exceeds 10MB | "App too big — try splitting it" |
| upload | compat errors (bad binding, missing module) | "Deploy failed: <CF error reason>" |
| secrets | secret name invalid | sanitized before send, shouldn't hit |
| domain | hostname taken OR DNS not verified | "Custom domain not attached — we kept your default URL" |
| tenants-db | DB unreachable | rollback: delete the uploaded script so we don't leak scripts |

---

## 🏗️ Phase 0 — Russell's Prerequisites (one-time, not code)

None of the engineering phases work without these. Blocking until done.

**0.1 — Cloudflare account on the Workers Paid plan.**
- Sign up / log in at cloudflare.com
- Workers & Pages → Plans → upgrade to Paid ($5/mo)
- **Add Workers for Platforms ($25/mo base).** Dashboard → Workers & Pages → Platforms → Create Namespace.
- Name it `clear-apps` (or whatever — read from env; see `CLOUDFLARE_DISPATCH_NAMESPACE` below).

**0.2 — API token with the right scopes.**
Create a token at dash.cloudflare.com/profile/api-tokens → Create Token → Custom:
- Zone · Workers Routes · Edit
- Account · Workers Scripts · Edit
- Account · Workers R2 Storage · Edit
- Account · D1 · Edit
- Account · Workers KV Storage · Edit
- Account · Workers Pipelines · Edit (future; harmless to include)
- Account · Account Settings · Read

Token stays only in Russell's env. Never committed. Never in user Workers' bindings. Studio reads it from `CLOUDFLARE_API_TOKEN` at server start.

**0.3 — DNS for `buildclear.dev`.**
- Domain registered + Cloudflare is the authoritative nameserver (move DNS to Cloudflare).
- Add a wildcard CNAME: `*.buildclear.dev` → your dispatch Worker's route.
- Or use Workers Custom Domains — bind the dispatch Worker to `*.buildclear.dev` directly.

**0.4 — Env vars on Studio host.**
```
CLOUDFLARE_ACCOUNT_ID=<32-char hex>
CLOUDFLARE_API_TOKEN=<from 0.2>
CLOUDFLARE_DISPATCH_NAMESPACE=clear-apps
CLEAR_CLOUD_ROOT_DOMAIN=buildclear.dev
```
Document these in `.env.example` (Phase 1 task).

**0.5 — Dispatch Worker exists.**
This is a one-time Worker Russell deploys BEFORE any tenant Worker. It routes `*.buildclear.dev` requests to the right script inside the namespace. Written by us (see Phase 7) but deployed manually once via wrangler. After that, every Publish is API-only.

**Exit criteria for Phase 0:** can run `curl -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/dispatch/namespaces/$CLOUDFLARE_DISPATCH_NAMESPACE` and get a 200 listing the namespace (even if empty).

If 0.1–0.5 aren't done, Phase 1 engineering CAN still happen (everything tests against mocked CF API) but the real-deploy smoke in Phase 8 will block.

---

## Phase 1 — `--target cloudflare` compilation → Workers bundle

**Goal:** `compileProgram(source, { target: 'cloudflare' })` returns a bundle that `packageBundle()` can write to disk as a valid Workers project. No deploy yet — just the bundle.

**Files this phase touches:**
- Read: `intent.md`, `compiler.js` TOC, `lib/packaging.js`, `playground/server.js` (fetch-handler equivalent patterns)
- New: `lib/packaging-cloudflare.js`, `lib/packaging-cloudflare.test.js`
- Modified: `lib/packaging.js` (dispatch on target), `compiler.js` (plumb `ctx.target` through)

### TDD Cycles — Phase 1

| # | 🔴 Test (RED) | 🟢 Minimal code (GREEN) | Commit |
|---|---------------|--------------------------|--------|
| 1.1 | `compileProgram` with `target: 'cloudflare'` returns a result object with `result.workerBundle` defined as `{}` | Plumb `target` through ctx; add empty `workerBundle` to result object when target matches | `feat(cf-1.1): plumb target=cloudflare through compileProgram` |
| 1.2 | For a hello-world app (one endpoint, no DB), `workerBundle['src/index.js']` exists and contains `export default { fetch(request, env, ctx)` | Add a Workers-target codegen stub: wraps endpoint dispatch in a single `fetch` handler routing by URL.pathname | `feat(cf-1.2): emit fetch handler for Workers target` |
| 1.3 | Compiled `src/index.js` passes `node --check` (valid JS syntax) and `esbuild --bundle` round-trips clean | Fix any template-literal or import issues in the emitted code | `fix(cf-1.3): Workers emit passes node --check + esbuild` |
| 1.4 | `workerBundle['wrangler.toml']` is valid TOML with pinned values: `name`, `main = "src/index.js"`, `compatibility_date = "2025-04-01"` (stable, recent, supports `nodejs_compat_v2`), `compatibility_flags = ["nodejs_compat_v2"]` (enables a minimal Node stdlib subset — crypto, buffer, streams — without pulling in fs/child_process) | Emit wrangler.toml from a template with constants `CF_COMPAT_DATE = '2025-04-01'` and `CF_COMPAT_FLAGS = ['nodejs_compat_v2']` defined in a single place (`lib/packaging-cloudflare.js`) so upgrades are one-line | Extract a `wranglerTomlTemplate()` pure function for easy testing | `feat(cf-1.4): emit wrangler.toml with pinned compat date + flags` |
| 1.4b | **data-clear-line preservation drift-guard:** compile a template with a button + heading + input with target=cloudflare, assert emitted `src/index.js`'s embedded HTML string contains `data-clear-line="N"` for each element. Click-to-edit (future plan) depends on this. | No code change expected (compiler already emits these at `compiler.js:8441`); this is a regression guard | — | `test(cf-1.4b): data-clear-line attrs survive Workers emit` |
| 1.5 | Compile all 8 core templates with `target: 'cloudflare'` — each produces a `workerBundle` with 0 errors | Fix edge cases the templates surface (agent apps, CRUD apps, chat apps) | Update the template smoke-test helper to accept a target param | `feat(cf-1.5): 8 core templates compile clean for Workers target` |
| 1.6 | `packageBundle(result, outDir, { target: 'cloudflare' })` writes bundle files to outDir matching a golden fixture | Implement `lib/packaging-cloudflare.js`; `lib/packaging.js` dispatches on `opts.target` | `feat(cf-1.6): packageBundle writes Workers bundle to disk` |
| 1.7 | Smoke test: run `npx wrangler dev src/index.js --local` against the packaged hello-world, curl `/` → 200 | Fix whatever the smoke surfaces. Guard with `SKIP_WRANGLER_SMOKE` env for CI | `test(cf-1.7): wrangler dev smoke green for hello-world` |
| 1.8 | 📚 Run `update-learnings` — capture Workers-target pitfalls (ESM-only, no `require`, no `fs`, compat dates) | Write to `learnings.md` | (no separate commit, folds into 1.7) |

**Phase 1 exit criteria:**
- [ ] 8/8 core templates compile with `target: 'cloudflare'` — 0 errors
- [ ] Hello-world bundle passes `wrangler dev` smoke
- [ ] 2800+ existing tests still green (nothing regressed on default target)
- [ ] New unit tests in `packaging-cloudflare.test.js`: ≥12

---

## Phase 2 — D1 runtime adapter

**Goal:** compiled Workers apps read/write via `env.DB` (D1 binding) with the same `runtime/db.js` interface the rest of Clear uses. Migrations emit as SQL files that the deploy step applies via CF API.

**Files this phase touches:**
- Read: `runtime/db.js` (current pg + SQLite adapter), `compiler.js` CRUD emit (save / look up / where / delete)
- New: `runtime/db-d1.js`, `runtime/db-d1.test.js`
- Modified: `compiler.js` — when `ctx.target === 'cloudflare'`, emit `env.DB.prepare(...)` calls instead of `db.query(...)`

### TDD Cycles — Phase 2

| # | 🔴 Test (RED) | 🟢 Minimal code (GREEN) | Commit |
|---|---------------|--------------------------|--------|
| 2.1 | `save user_data as new User` compiled with target=cloudflare emits `env.DB.prepare('INSERT INTO users (...) VALUES (?, ?)').bind(...).run()` — NOT `db.insert(...)` | Add D1 emit branch to the SAVE compiler case | `feat(cf-2.1): SAVE emits D1 prepare/bind/run` |
| 2.2 | `look up all records in Users table` emits `env.DB.prepare('SELECT * FROM users').all()` returning `result.results` | Add D1 branch to LOOKUP case | `feat(cf-2.2): look up emits D1 all()` |
| 2.3 | `where` clauses emit parameterized `.bind(...)` — never string interpolation (SQL injection guard) | Force all `where` values through `.bind()` | `feat(cf-2.3): where clauses parameterized via D1 bind` |
| 2.4 | `delete the User with this id` emits `env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run()` | Add D1 branch to DELETE case | `feat(cf-2.4): DELETE emits D1 parameterized` |
| 2.5 | `update` forms emit `UPDATE users SET ... WHERE id = ?` — require id present, throw helpful error if missing (mirrors the runtime fix landed in session 42) | Port the runtime "no-id throws 400" invariant to the D1 compile path | `feat(cf-2.5): D1 UPDATE requires id, instructive error` |
| 2.6 | Migrations for every table definition emit into `result.workerBundle['migrations/001-init.sql']` as CREATE TABLE statements, SQLite-dialect (D1 = SQLite) | Move/duplicate the migration emitter; make dialect a parameter | `feat(cf-2.6): emit D1 migrations alongside bundle` |
| 2.7 | `runtime/db-d1.js` wraps `env.DB` with the same interface `runtime/db.js` exposes (insert, find, update, delete, query) — shim for any code path that doesn't emit raw D1 calls | Implement the shim; 15+ contract tests against an in-memory SQLite mock | `feat(cf-2.7): runtime/db-d1.js shim matches runtime/db.js interface` |
| 2.8 | All 8 core templates that use tables compile + miniflare-run successfully with D1 | Fix whatever breaks; templates are the regression net | `test(cf-2.8): 8 templates green under D1 + miniflare` |
| 2.9 | 📚 Update learnings — D1 prepared statements, SQLite dialect quirks, migration ordering | `learnings.md` | folds into 2.8 |

**Phase 2 exit criteria:**
- [ ] All CRUD node types have a D1 emit branch
- [ ] No string-interpolated SQL anywhere in D1 emit (security)
- [ ] Migrations emit as standalone `.sql` files in bundle
- [ ] 8/8 core templates work end-to-end under miniflare + D1
- [ ] ≥25 new D1-specific tests

---

## Phase 3 — Agent + Auth runtime Workers-safe (RESTRUCTURED: emit-time branching, not runtime gates)

**Goal:** `ask claude` works inside a Worker (fetch-only, no fs, no `require()`). `allow signup and login` password hashing works inside a Worker (Web Crypto, no bcryptjs). Critically, the compiled Workers-target bundle must contain ZERO `require()` / `fs.*` / `child_process` / `/tmp` strings — not gated, not dead-code, simply absent. Workers bundlers fail on CommonJS `require()` and `fs.*` won't exist at runtime.

**Verified ground truth (2026-04-23):** `compiler.js:404–414` emits the following as compiled runtime code:
```js
const { execSync } = require("child_process");
const tmp = "/tmp/_askAI_" + Date.now() + ".json";
require("fs").writeFileSync(tmp, payload);
// ... curl fallback ...
```
This is the `_askAI` helper's HTTP_PROXY fallback. Also `compiler.js:503–509` emits `require('pdf-parse')` and `require('mammoth')` for PDF/DOCX knowledge loading. None of these run in Workers. **We must emit a separate, strictly-ESM-and-fetch-only `_askAI` when target=cloudflare, with no shared code that references fs/proc.**

**Files this phase touches:**
- Read (verify line numbers before editing): `compiler.js` UTILITY_FUNCTIONS array (the `_askAI` helper, lines 323–450 as of 2026-04-23), `runtime/auth.js`
- New: `runtime/auth-webcrypto.js`, `runtime/auth-webcrypto.test.js`
- Modified: `compiler.js` — add a `UTILITY_FUNCTIONS_WORKERS` parallel set that the Workers-target codegen pulls from; auth emit picks webcrypto variant when target=cloudflare

### TDD Cycles — Phase 3

| # | 🔴 Test | 🟢 Code | 🔄 Refactor | Commit |
|---|---------|---------|------------|--------|
| 3.0 | Compile hello-world + a single `ask claude` call with target=cloudflare; grep the emitted `src/index.js` for `require(`, `child_process`, `fs.`, `/tmp`, `execSync` → ALL must return 0 matches (hard fail if any present, not "acceptable in dead code") | Split `_askAI` into two helpers: `_askAI_node` (current, with curl fallback) and `_askAI_workers` (new, fetch-only, no Node globals). Compiler emits exactly one, selected by `ctx.target`. | Extract a shared `_askAI_core` pure function for prompt-formatting logic both helpers can call | `feat(cf-3.0): split _askAI into Node/Workers variants` |
| 3.1 | `_askAI_workers` uses `env.ANTHROPIC_PROXY_URL || 'https://api.anthropic.com/v1/messages'` and calls `fetch()` only | Implement emit path; take `env` as second param since Workers doesn't have module-scope process.env | — | `feat(cf-3.1): _askAI_workers fetch-only` |
| 3.2 | `_askAI_workers` reads `env.ANTHROPIC_API_KEY` directly when no proxy, `env.TENANT_JWT` when proxy is set | Emit env reads in the generated helper | — | `feat(cf-3.2): env-based auth in _askAI_workers` |
| 3.3 | `_askAIStream_workers` variant streams via Workers-native `ReadableStream` and forwards Anthropic's SSE stream body-pass-through. NO Node `Readable` | Emit `new ReadableStream({ async start(controller) {...} })` | Share SSE parsing helpers with Node variant | `feat(cf-3.3): streaming via ReadableStream` |
| 3.4 | `_askAIWithTools_workers` tool-marshaling: pure JS, no fs, no process. Copy Node variant's logic, strip any platform refs | Implement | — | `feat(cf-3.4): tool-use Workers-safe` |
| 3.5 | `runtime/auth-webcrypto.js` exports `hashPassword(plain)` using PBKDF2 via `crypto.subtle.deriveBits`, 600k iterations, 128-bit random salt via `crypto.getRandomValues`, SHA-256, returns `v1:<salt-hex>:<hash-hex>` format (versioned for future algorithm swaps) | Implement; mirror bcryptjs interface shape | Extract `_bytesToHex` / `_hexToBytes` helpers | `feat(cf-3.5): auth-webcrypto hashPassword` |
| 3.6 | `verifyPassword(plain, stored)` parses version prefix, does constant-time compare via `crypto.subtle.timingSafeEqual` if available else manual XOR-sum | Implement | — | `feat(cf-3.6): verifyPassword constant-time` |
| 3.7 | Compiled `allow signup and login` with target=cloudflare imports from `auth-webcrypto` — grep emitted output for `bcryptjs` → 0 matches | Add emit branch for AUTH_UTILITY | — | `feat(cf-3.7): auth emits webcrypto for CF target` |
| 3.8 | End-to-end: compile a template with `allow signup and login` + `ask claude`, run under miniflare, signup → login → agent call all green | Fix integration gaps | — | `test(cf-3.8): signup + login + agent in miniflare` |
| 3.9 | 📚 Learnings — emit-time vs runtime-gate tradeoffs; why Workers bundlers fail on `require()`; PBKDF2 iteration choices; versioned hash format | `learnings.md` | — | folds into 3.8 |

**Phase 3 exit criteria:**
- [ ] **Hard test (cycle 3.0):** compile 8 core templates + 3 agent templates with target=cloudflare; grep ALL emitted `.js` files for `require(`, `child_process`, `fs.`, `/tmp`, `execSync`, `spawn` → **every file must return 0 matches**. This is a drift-guard test added to `clear.test.js`.
- [ ] Default (Node) target bundle UNCHANGED — `_askAI_node` still emits everything it emits today. Run `clear.test.js` Temporal + AI tests, all green.
- [ ] PBKDF2 iterations ≥ 600,000 (OWASP 2024)
- [ ] Versioned hash format `v1:...` so a future PBKDF2 upgrade is non-breaking
- [ ] Signup/login/agent flow works end-to-end under miniflare
- [ ] **Scope clarification:** this phase addresses DEPLOYED user apps only. `playground/cloud-auth/index.js` (buildclear.dev platform auth — used by Studio itself) stays on bcryptjs because Studio runs on Node. If buildclear.dev dashboard ever moves to Workers, `cloud-auth` needs parallel treatment — tracked in a separate future plan.

---

## Phase 4 — `knows about:` lazy-load for Workers target

**Goal:** agents with `knows about: Products table`, `knows about: 'docs.md'`, `knows about: 'https://...'`, OR `knows about: 'manual.pdf'` / `.docx` work inside a Worker. No module-startup phase — lazy-load. Binary formats (PDF/DOCX) get TEXT-EXTRACTED AT STUDIO COMPILE TIME and inlined as strings — Worker never sees `pdf-parse` or `mammoth`.

**Verified ground truth (2026-04-23):** `compiler.js:503–509` emits at runtime:
```js
if (ext === 'pdf') { const pdf = require('pdf-parse'); const buf = fs.readFileSync(filePath); const data = await pdf(buf); return data.text; }
if (ext === 'docx') { const mammoth = require('mammoth'); const result = await mammoth.extractRawText({ path: filePath }); return result.value; }
```
Both `pdf-parse` and `mammoth` are Node-only — they read from fs, use Node `Buffer`. Workers will reject bundle. Fix: do extraction Studio-side at compile time.

**Files this phase touches:**
- Read (verify line numbers): `compiler.js` KNOWS_ABOUT emit (search for `knowledge_url` / `knowledge_file`), `compiler.js:503–509` `_loadFileText`
- Modified: `compiler.js` — Workers branch; `lib/packaging-cloudflare.js` (from Phase 1) — file extraction hook

### TDD Cycles — Phase 4

| # | 🔴 Test | 🟢 Code | 🔄 Refactor | Commit |
|---|---------|---------|------------|--------|
| 4.1 | `knows about: Products table` with target=cloudflare emits lazy getter: `let _products_cache = null; async function _load_products(env) { if (_products_cache) return _products_cache; _products_cache = await env.DB.prepare('SELECT * FROM products').all(); return _products_cache; }`. No module-scope `await` | Add Workers branch to KNOWS_ABOUT emitter for tables | Extract `_lazyCacheHelper` template | `feat(cf-4.1): knows about Table lazy-loads` |
| 4.2 | `knows about: 'https://example.com/docs'` lazy-fetches on first agent call, caches in module scope | Same pattern, fetch instead of DB | — | `feat(cf-4.2): knows about URL lazy-fetches` |
| 4.3 | `knows about: 'prompts/rules.md'` AND `.txt` — compiler reads the file AT COMPILE TIME, emits `const _knowledge_rules = "<escaped content>"` as a module-scope string constant. No runtime file reads. | Compile-time fs.readFileSync + escape + inline | — | `feat(cf-4.3): text knowledge inlines at compile` |
| 4.4 | `knows about: 'manual.pdf'` — compiler invokes `pdf-parse` AT STUDIO COMPILE TIME (Studio runs on Node), extracts text, inlines as string constant. Emitted Worker bundle has ZERO references to `pdf-parse`, `mammoth`, `require`. Drift-guard: grep emitted file for `pdf-parse|mammoth|require\\(` → 0 matches | Factor the existing `_loadFileText` into a Studio-side helper `extractTextAtCompileTime(filePath)` that's called during packaging when target=cloudflare | Move pdf-parse/mammoth deps from deployed-app runtime into compile-time only (Studio dep, not runtime dep). Update packaging tests | `feat(cf-4.4): pdf/docx extracted at compile time` |
| 4.5 | `knows about: 'audio.mp3'` or other unsupported-at-compile format → compile error: "Clear doesn't know how to extract text from .mp3 at compile time. Supported knowledge file formats for Cloudflare target: .txt, .md, .pdf, .docx. For others, convert to text first." | Add supported-format table + error emission | — | `feat(cf-4.5): unsupported format compile error` |
| 4.6 | If inlined file > 512KB, emit a WARNING: "Knowledge file `<name>` is <size>KB. Inlining grows bundle — consider moving to D1/R2 for files > 1MB." AND hard-fail if > 1MB (Workers bundle cap) | Size check in packaging | — | `feat(cf-4.6): warn/fail on oversized knowledge` |
| 4.7 | `helpdesk-agent` template compiles + miniflare-runs with `knows about: Products` table + answers a question | End-to-end smoke | — | `test(cf-4.7): helpdesk-agent end-to-end` |
| 4.8 | Same template but with `knows about: 'faq.pdf'` (a 50KB test PDF fixture) — compile extracts text, agent can answer from it | Fixture-driven test | — | `test(cf-4.8): pdf knowledge extraction works` |
| 4.9 | 📚 Learnings — compile-time vs runtime extraction; file format support matrix; bundle size tradeoffs | `learnings.md` | — | folds into 4.8 |

**Phase 4 exit criteria:**
- [ ] No `await` at module top-level in Workers emit
- [ ] No `require(`, `pdf-parse`, `mammoth`, `fs.` in Workers-target emit — drift-guard test enforces
- [ ] Knowledge loads are idempotent (second call returns cached value)
- [ ] helpdesk-agent + ecom-agent templates work on Workers with both table and file knowledge
- [ ] Bundle size limit (1MB hard cap on inlined knowledge, 512KB warning) enforced at package time

---

## Phase 5 — Scheduled agents → Cloudflare Cron Triggers

**Goal:** `runs every hour` on an agent or background block fires via Cloudflare's Cron Triggers, not `node-cron` or `setInterval`.

**Files this phase touches:**
- Read: `compiler.js` — where `runs every` is emitted (background blocks, scheduled agents)
- Modified: `compiler.js` — Workers branch; `lib/packaging-cloudflare.js` — emits `[triggers] crons = [...]` in wrangler.toml

### TDD Cycles — Phase 5

| # | 🔴 Test | 🟢 Code | Commit |
|---|---------|---------|--------|
| 5.1 | A `background 'cleanup': runs every 1 hour` block compiled with target=cloudflare emits NO `node-cron` import, NO `setInterval` | Gate node-cron emit on target !== 'cloudflare' | `fix(cf-5.1): no node-cron for Workers target` |
| 5.2 | Instead emits a `scheduled(event, env, ctx)` handler that dispatches on cron expression — one handler, dispatches by the event.cron pattern to the right block | New Workers codegen path | `feat(cf-5.2): scheduled() handler dispatches cron blocks` |
| 5.3 | `wrangler.toml` gets `[triggers]\ncrons = ["0 * * * *"]` (one entry per `runs every` block, all coalesced) | Packaging computes the cron array from compile result | `feat(cf-5.3): wrangler.toml emits cron triggers` |
| 5.4 | Translate "every 1 hour" → "0 * * * *", "every 10 minutes" → "*/10 * * * *", "every day at 9am" → "0 9 * * *" | Small translator table in compiler | `feat(cf-5.4): duration phrases → cron expressions` |
| 5.5 | If compiled WITHOUT the scheduled handler but wrangler declares cron, CF rejects the deploy — so emit the handler unconditionally when any cron exists | Wire the guard | `fix(cf-5.5): always emit scheduled handler when crons declared` |
| 5.6 | Template with a scheduled agent compiles + miniflare `--test-scheduled` invokes the handler | End-to-end | `test(cf-5.6): scheduled agent fires in miniflare` |
| 5.7 | 📚 Learnings — CF cron granularity (1 min minimum), timezone is UTC, max 3 crons on free tier, unlimited on paid | `learnings.md` | folds |

**Phase 5 exit criteria:**
- [ ] `node-cron` import absent from Workers-target bundles
- [ ] Every `runs every` phrase in the language has a cron-expression mapping with a unit test
- [ ] miniflare scheduled smoke green

---

## Phase 6 — `runs on temporal` → Cloudflare Workflows

**Goal:** `compiler.js:compileWorkflow()` gains a `target === 'cloudflare'` branch emitting a Cloudflare Workflow class instead of Temporal SDK code. Same AST node, different output.

**Files this phase touches:**
- Read: `compiler.js:4011` (`compileWorkflow`), `parser.js:3905` (parses `runs on temporal`), `clear.test.js` tests pinning Temporal emission
- Modified: `compiler.js`

**Background:** Cloudflare Workflows API — a workflow is a class that extends `WorkflowEntrypoint`, has an `async run(event, step)` method. Durable steps use `step.do('label', async () => {...})`; sleeps use `step.sleep(ms)` or `step.sleepUntil(date)`. Bindings in `wrangler.toml`: `[[workflows]] binding = "MY_WORKFLOW" name = "my-workflow" class_name = "MyWorkflow"`. Invocation: `await env.MY_WORKFLOW.create({ params })`.

### TDD Cycles — Phase 6

| # | 🔴 Test | 🟢 Code | Commit |
|---|---------|---------|--------|
| 6.1 | `workflow 'onboard' runs on temporal: ...` with target=cloudflare emits `export class OnboardWorkflow extends WorkflowEntrypoint { async run(event, step) { ... } }` in `src/workflows/onboard.js` — NOT Temporal SDK calls | Add cloudflare branch to compileWorkflow | `feat(cf-6.1): workflow emits Cloudflare Workflow class` |
| 6.2 | Each `step 'label':` child of the workflow emits `await step.do('label', async () => { ... })` | Walk the step children, wrap each | `feat(cf-6.2): step: emits step.do()` |
| 6.3 | `wait 5 minutes` inside a workflow emits `await step.sleep('5 minutes')` | Map durations | `feat(cf-6.3): wait emits step.sleep` |
| 6.4 | `wait until next monday 9am` emits `await step.sleepUntil(new Date(...))` | Parse time phrase → Date | `feat(cf-6.4): wait until emits step.sleepUntil` |
| 6.5 | `if there's an error:` inside a step emits `try { ... } catch(e) {...}` wrapping just that step (retries are a Cloudflare-Workflow-level configuration) | Make error handling compatible | `feat(cf-6.5): error handling inside workflow steps` |
| 6.6 | An endpoint that triggers a workflow (`start workflow 'onboard'`) emits `await env.ONBOARD_WORKFLOW.create({ id: crypto.randomUUID(), params: {...} })` | Add invocation codegen | `feat(cf-6.6): start workflow emits env.WORKFLOW.create()` |
| 6.7 | wrangler.toml gains `[[workflows]] binding = "ONBOARD_WORKFLOW" name = "onboard" class_name = "OnboardWorkflow"` for every workflow block | Packaging emits the bindings | `feat(cf-6.7): wrangler.toml workflow bindings` |
| 6.8 | **FIRST update the three existing Temporal tests in `clear.test.js` (verified 2026-04-23 at lines 19894, 19923, 20102) to set target EXPLICITLY in the source program** (`build for javascript backend` as the first line of each test's source). Currently they rely on undefined default — flipping the default silently regresses them. After the test update lands + is green, gate Temporal emit on `target === 'node' || target === 'js' || target === 'javascript' || target === 'python' || !target` (inclusive list — defensive, not exclusive) | Update tests first with an explicit target; THEN add the cloudflare branch to compileWorkflow | Document the rule "no test should rely on undefined target" in `learnings.md` | `fix(cf-6.8): existing Temporal tests pin explicit target; add CF Workflows branch` |
| 6.9 | A booking template with a multi-step workflow compiles + miniflare Workflows simulator executes the full chain | End-to-end | `test(cf-6.9): booking workflow runs under miniflare` |
| 6.10 | 📚 Learnings — Workflows vs Temporal API differences, step.do idempotency, sleepUntil precision | `learnings.md` | folds |

**Phase 6 exit criteria:**
- [ ] Both emission paths coexist: Node target → Temporal SDK, CF target → Cloudflare Workflows
- [ ] `booking` template's workflow block runs end-to-end under miniflare
- [ ] No existing Temporal tests regressed

---

## Phase 7 — Swap `/api/deploy` backend: Fly builder → Cloudflare WFP API

**Goal:** `playground/deploy.js`'s `deploySource()` no longer posts a tarball to a Fly builder. Instead it calls Cloudflare's API directly (provision D1, upload script, set secrets, attach domain). Request/response shape of `/api/deploy` stays identical — UI is untouched.

**Files this phase touches:**
- Read: `playground/deploy.js` (current flow), `playground/tenants.js`, `playground/sanitize.js`
- New: `playground/wfp-api.js`, `playground/wfp-api.test.js`, `playground/deploy-cloudflare.js`, `playground/deploy-cloudflare.test.js`
- Modified: `playground/deploy.js` — `deploySource()` delegates to `deploy-cloudflare.js`

### TDD Cycles — Phase 7

| # | 🔴 Test | 🟢 Code | Commit |
|---|---------|---------|--------|
| 7.1 | `wfp-api.uploadScript({ scriptName, bundle, bindings, compatibilityDate })` produces a correct multipart/form-data PUT to `/accounts/{id}/workers/dispatch/namespaces/{ns}/scripts/{slug}` with metadata JSON + module files | Implement uploadScript; mock fetch | `feat(cf-7.1): wfp-api.uploadScript` |
| 7.2 | `wfp-api.provisionD1({ tenantSlug, appSlug })` constructs db name as `${tenantSlug}-${appSlug}` (tenant-prefixed to avoid cross-tenant collisions like two tenants both deploying "crm"), POSTs to `/accounts/{id}/d1/database`, returns `{ d1_database_id }`. On 409 (name taken — can happen after soft-delete + re-deploy within the CF deletion grace window), append `-<4-hex>` suffix and retry up to 3 times | Implement provisionD1 with collision-guard retry | Extract `d1NameFor(tenant, app)` pure function | `feat(cf-7.2): wfp-api.provisionD1 with tenant-prefixed name + collision retry` |
| 7.2b | `wfp-api.listD1({ namePrefix })` lists databases matching a prefix — used by rollback/cleanup to detect leaked D1s | Implement; uses CF API list endpoint | — | `feat(cf-7.2b): list D1 by name prefix` |
| 7.3 | `wfp-api.applyMigrations({ d1_database_id, sql })` POSTs to the D1 query endpoint with migrations joined by `;\n` | Implement applyMigrations; surface SQL errors structured | `feat(cf-7.3): wfp-api.applyMigrations` |
| 7.4 | `wfp-api.setSecrets({ scriptName, secrets })` emits one PUT per secret — never batch (CF has no batch endpoint) | Loop with concurrency=3 | `feat(cf-7.4): wfp-api.setSecrets` |
| 7.5 | `wfp-api.attachDomain({ scriptName, hostname })` POSTs to the domains endpoint, 200 on success, 409 on taken | Implement with error mapping | `feat(cf-7.5): wfp-api.attachDomain` |
| 7.6 | `wfp-api.deleteScript({ scriptName })` DELETEs — used for rollback on failure | Implement | `feat(cf-7.6): wfp-api.deleteScript` |
| 7.7 | `deploy-cloudflare.js:deploySource()` orchestrates the sequence: **(1) compile → (2) provision D1 → (3) apply migrations → (4) upload script → (5) set secrets → (6) attach domain → (7) record in tenants-db**. Rollback on failure: **reverse order, skipping steps that didn't run yet**. Step 4 fails? Delete D1 from step 2. Step 5 fails? Delete script + delete D1. Step 6 fails? Don't delete — attempts log and return degraded success (user gets default URL, custom domain didn't attach, clear error message). Step 7 fails? Script + D1 stay (tenants-db record failure is recoverable by a reconcile job, not by rollback) | Implement with try/catch per step + explicit rollback log + per-step cleanup | Extract `rollbackTo(step, context)` state-machine helper with its own tests | `feat(cf-7.7): deploy-cloudflare orchestration with explicit rollback ladder` |
| 7.7b | **Double-click idempotency:** `deploySource()` acquires a lock on `${tenantSlug}:${appSlug}` before starting. Lock key stored in a module-scope `Map<string, { jobId, startedAt }>`. If a second request for same key arrives while the first is in-flight (< 120s old), return `409 Conflict` with `{ existingJobId, hint: 'Deploy already in progress for this app' }` — UI polls the existing jobId. Stale locks (> 120s) are cleared and the new request proceeds | Implement with a `DeployLockManager` class — tests cover: acquire, release on success, release on failure, stale-clear, 409-on-concurrent | Cover with a torture test: 10 parallel deploys for same key → exactly 1 succeeds | `feat(cf-7.7b): deploy idempotency lock prevents double-click duplicates` |
| 7.7c | **Reconcile job:** weekly cron script (`scripts/reconcile-wfp.js`) lists all scripts in the namespace + all D1 databases with our prefix, cross-references tenants-db. Reports orphans (in CF but not tenants-db). Does NOT auto-delete — emits a report to Russell. Catches: step-7 failures, manual CF dashboard edits, partial rollback states | Stub-implement the script + add to ops docs. Not a cron in this phase — just an invocable script | — | `feat(cf-7.7c): reconcile script detects orphaned CF resources` |
| 7.8 | `canDeploy(tenant)` still gates (plan, quota) — reuse unchanged | Import from existing `tenants.js` | `feat(cf-7.8): reuse canDeploy gate` |
| 7.9 | `sanitizeAppSlug`, `sanitizeDomain`, `assertOwnership` still gate — reuse unchanged | Import from existing `sanitize.js` | `feat(cf-7.9): reuse input validators` |
| 7.10 | `/api/deploy` endpoint in `playground/deploy.js` delegates to `deploy-cloudflare.js` when `CLEAR_DEPLOY_TARGET === 'cloudflare'` (default in v1), else falls through to existing Fly path | Add the env switch; default to cloudflare once Phase 8 smoke passes | `feat(cf-7.10): /api/deploy dispatches on target` |
| 7.11 | `/api/deploy-status/:jobId` — jobs are cheap in WFP (deploy is synchronous-ish, ~5-8s), keep a tiny in-memory job map: `{jobId → {status, result}}`. UI polls it. | Replace builder /status call with in-memory lookup | `feat(cf-7.11): job status from in-memory map` |
| 7.12 | `/api/rollback` — use WFP script-versions API to revert to previous version | Implement in wfp-api + wire | `feat(cf-7.12): rollback via WFP versions API` |
| 7.13 | `/api/custom-domain` — delegates to `wfp-api.attachDomain` | Wire | `feat(cf-7.13): custom-domain via WFP` |
| 7.14 | All existing server tests in `playground/deploy.test.js` still green — request/response shape unchanged | Fix any surface drift | `test(cf-7.14): deploy.test.js green after backend swap` |
| 7.15 | 📚 Learnings — WFP multipart gotchas, D1 migration batching, rollback sequencing | `learnings.md` | folds |

**Phase 7 exit criteria:**
- [ ] `/api/deploy` returns `{ ok: true, url, jobId }` pointing at `<slug>.buildclear.dev` (or `<slug>.workers.dev` pre-DNS) when using mocked CF API
- [ ] Rollback on any step-failure works: no leaked scripts, no leaked D1 databases
- [ ] `playground/deploy.test.js` suite passes without ANY UI change
- [ ] New tests in `wfp-api.test.js`: ≥30

---

## Phase 8 — Real-Cloudflare end-to-end smoke (HITL)

**Goal:** the first real deploy, end-to-end, against live Cloudflare. Not TDD — this phase is a human-in-the-loop checklist that either passes or produces a punch list.

**Prerequisites:** Phase 0 done. Phases 1–7 green.

### 8.0 — Phase 0 verification gate (BLOCKING)

Phases 1–7 all run against mocked CF API — they pass with no real infra. This gate is the FIRST action in Phase 8 to catch the "Phase 0 silently skipped, Phase 8 explodes" failure mode.

Run this curl before any deploy attempt:

```bash
curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/dispatch/namespaces/$CLOUDFLARE_DISPATCH_NAMESPACE" \
  | python3 -m json.tool
```

- [ ] Returns 200 (not 401 / 404 / 403)
- [ ] JSON response has `success: true`
- [ ] The namespace's script count is visible
- [ ] Also verify: `curl https://<dispatch-worker-url>` returns 404 or 200 (dispatch Worker exists — Phase 0.5)

If ANY of the above fails, STOP. Phase 0 work is incomplete; Phase 8 can't proceed. Do not continue to 8.1 until this gate is green.

### The smoke checklist

Run in order. Each step either passes (check the box) or produces a concrete bug to file.

**8.1 — Studio starts with CF env set.**
- [ ] `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_DISPATCH_NAMESPACE`, `CLEAR_CLOUD_ROOT_DOMAIN`, `CLEAR_DEPLOY_TARGET=cloudflare` all set
- [ ] `node playground/server.js` boots without error, server.test.js still green

**8.2 — Seed a test tenant.**
- [ ] POST `/api/_test/seed-tenant` with a test slug; cookie comes back
- [ ] `InMemoryTenantStore` or real tenants-db row visible

**8.3 — Deploy hello-world.**
- [ ] Paste hello-world Clear into Studio, compile succeeds
- [ ] Click Deploy, pick slug
- [ ] Modal shows "deploying…" → "live"
- [ ] Receive a URL; `<slug>.workers.dev` (first) or `<slug>.buildclear.dev` (once DNS wired)

**8.4 — Curl the live URL.**
- [ ] `curl https://<url>` → 200 with the hello-world response
- [ ] CF dashboard shows 1 script in the dispatch namespace

**8.5 — Deploy a CRUD app with D1.**
- [ ] Paste todo-fullstack, compile, deploy
- [ ] Create a todo via the UI, list it, delete it — all via the deployed URL
- [ ] CF dashboard shows 1 D1 database with rows

**8.6 — Deploy an agent app.**
- [ ] Paste helpdesk-agent (adjusted for CF: `knows about:` over a table), deploy
- [ ] `ask claude` calls work — response arrives in <5s
- [ ] `ANTHROPIC_PROXY_URL` secret set on the script (or direct call works)

**8.7 — Deploy a workflow app.**
- [ ] Paste booking with a `runs on temporal` workflow
- [ ] Trigger the workflow endpoint
- [ ] CF dashboard → Workflows → see the instance run through its steps

**8.8 — Deploy a scheduled agent.**
- [ ] Paste something with `runs every 1 hour`
- [ ] CF dashboard → Triggers → see the cron listed
- [ ] Manually invoke via `wrangler cron trigger <slug>` → scheduled handler runs

**8.9 — Rollback.**
- [ ] Click rollback, confirm previous version restored
- [ ] Curl URL → old behavior

**8.10 — Delete.**
- [ ] Delete the script via `/api/deploy` DELETE (if exists) or CF dashboard
- [ ] tenants-db row marked deleted

**Exit criteria:** every checkbox above. Any gaps become a Phase 8b punch list before Phase 9.

**Out of scope for 8:** load-testing, multi-tenant concurrency, DDoS resilience. That's post-ship.

---

## Phase 9 — Cleanup: delete Railway CLI path + archive Fly builder code

**Goal:** remove dead/obsolete code paths now that Cloudflare is the active deploy target. Don't delete the Fly builder scaffolds (someone may want to reactivate for binaries in v2) — mark them deprecated and move to `archive/`.

**Files this phase touches:**
- Modified: `cli/clear.js` — delete `deployCommand` + remove from commands list
- Modified: `CLAUDE.md` — remove "Deploy Railway" line from CLI block
- Moved: `playground/builder/` → `archive/fly-builder/` (if builder dir exists) — plain move
- Modified: `playground/deploy.js` — remove `postToBuilder` paths once CF is default

### TDD Cycles — Phase 9

| # | 🔴 Test | 🟢 Code | Commit |
|---|---------|---------|--------|
| 9.1 | `clear deploy <file>` returns helpful error pointing to Studio Publish button — NOT Railway | Delete `deployCommand`, replace with stub that prints "CLI deploy removed in v1 — use Studio Publish button" | `chore(cf-9.1): remove Railway CLI deploy` |
| 9.2 | `clear --help` no longer mentions `deploy` | Remove from `commands` array + help text | `chore(cf-9.2): remove deploy from CLI help` |
| 9.3 | `playground/deploy.js` dead Fly paths gated behind `CLEAR_DEPLOY_TARGET !== 'cloudflare'` — default path = cloudflare | Flip default, keep Fly path for explicit opt-in | `chore(cf-9.3): Fly deploy path opt-in, CF default` |
| 9.4 | If `playground/builder/` exists on disk, move to `archive/fly-builder/` with a README explaining it's paused, not deleted | `git mv` the dir, add README | `chore(cf-9.4): archive Fly builder scaffold` |
| 9.5 | All tests green | Confirm | `test(cf-9.5): full suite green post-cleanup` |

**Phase 9 exit criteria:**
- [ ] No `deploy` command in CLI help
- [ ] `clear deploy` prints migration message
- [ ] Fly builder code still exists but isolated (archived, not live path)
- [ ] 2800+ tests still green

---

## Phase 10 — Docs sync (mandatory per CLAUDE.md Documentation Rule)

**Goal:** every Clear documentation surface reflects the Cloudflare deploy target. Nothing ships without this phase landing.

### Checklist (one commit per file where practical)

- [ ] **Supersession marker:** add to TOP of `plans/plan-one-click-deploy-04-17-2026.md`:
  > **⚠️ PARTIALLY SUPERSEDED by `plans/plan-clear-cloud-wfp-04-23-2026.md`** — the deploy backend (builder service, Fly Machines API, registry.fly.io) is replaced by direct Cloudflare Workers for Platforms calls. `tenants.js`, `billing.js`, `sanitize.js`, `/api/deploy` request/response shape, and the Deploy modal UX are STILL ACTIVE REFERENCE — the new plan reuses them unchanged.
- [ ] **Stub file creation:** create `plans/plan-ai-proxy-to-durable-object-STUB.md` — one-paragraph placeholder for the follow-up work to move ai-proxy from Fly → CF Durable Object. References this plan's "caveat" note
- [ ] **`intent.md`** — add `build for cloudflare` as a build target row; reference from WORKFLOW + SCHEDULED_AGENT + AGENT tables ("compiles to Cloudflare Workflows / Cron Triggers / Workers fetch when target=cloudflare")
- [ ] **`SYNTAX.md`** — new "Deploying to Cloudflare" section: Publish button, `<slug>.buildclear.dev` URL, that durable workflows + scheduled agents Just Work, no CLI needed
- [ ] **`AI-INSTRUCTIONS.md`** — convention note: when writing Clear apps for the Cloudflare target, avoid patterns that assume long-lived process state; document the lazy-load behavior of `knows about:`
- [ ] **`USER-GUIDE.md`** — new chapter "Publishing Your App" walking Marcus through clicking Publish and seeing it live; explain the durable workflow + scheduled agent behavior in plain English (no jargon)
- [ ] **`ROADMAP.md`** — mark Phase 89 (this) complete, update test counts, update "What's Next" section (CC-2c dashboard, custom domains, click-to-edit UX)
- [ ] **`FEATURES.md`** — add row "Publish to Cloudflare in one click"; "Durable multi-step workflows via Cloudflare Workflows"; "Scheduled agents via Cron Triggers"
- [ ] **`CHANGELOG.md`** — session-dated entry summarizing the pivot
- [ ] **`FAQ.md`** — entries: "Where does the Publish flow live?", "How do I deploy a Clear app?", "Why Cloudflare over Fly?", "How does `runs on temporal` work on Cloudflare?"
- [ ] **`RESEARCH.md`** — no training-signal change, skip (call this out as "no update" in the commit)
- [ ] **`landing/*.html`** — update `landing/marcus.html` demo recording ("15s idea → live URL"), update pricing tier copy if WFP-based pricing is ready; grep all landing pages for "Fly" mentions and replace or contextualize
- [ ] **`playground/system-prompt.md`** — teach Meph: target defaults to cloudflare; when building agent apps, rely on `knows about:` lazy-load; use `runs on temporal` for any multi-step durable process; the Publish button is the deploy path
- [ ] **`playground/clear-compiler.min.js`** — rebuild: `npx esbuild index.js --bundle --format=esm --minify --outfile=playground/clear-compiler.min.js`
- [ ] **`CLAUDE.md`** — update the CLI block (remove `deploy`), add a note under "Core Design Principles" about the Workers target invariants

### Rebuild + final smoke

- [ ] Run full test suite: `node clear.test.js && node playground/server.test.js` → all green
- [ ] Compile all 8 core templates with `target: 'cloudflare'` — 0 errors
- [ ] Run the full Studio e2e test
- [ ] Publish smoke test one more time to confirm no doc-sync regression

### Commit + push

- [ ] Final commit aggregating doc updates
- [ ] `git push -u origin claude/cloudflare-temporal-setup-PvwvL`
- [ ] (If Russell requests) open PR — no auto-PR per CLAUDE.md

**Phase 10 exit criteria:**
- [ ] All 11 doc surfaces updated
- [ ] Compiler bundle rebuilt
- [ ] Full test suite green
- [ ] Branch pushed to origin

---

## 🚨 Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| WFP multipart script upload format is quirky; first real upload fails | High | Medium | Phase 1.7 smoke via `wrangler dev` catches locally; Phase 8.3 first real smoke is HITL. Fallback: model the upload on the `workers-for-platforms-example` GitHub repo byte-for-byte. |
| D1 migrations exceed the batch size limit (D1 has ~100KB/statement ceiling) | Medium | Medium | Split migrations by CREATE TABLE; emit one statement per API call if batch too big. Add a test with a big template. |
| Cloudflare Workflows API changed since docs were checked | Medium | High | Phase 6.9 miniflare test catches drift. If CF changes the API mid-build, the drift-guard fires and the plan pauses for a 6b cycle. |
| bcryptjs → PBKDF2 changes password hash format; existing seeded accounts can't log in | Low (zero production users) | High (in production) | Note in learnings; flag as breaking change in CHANGELOG. Seed-test accounts get re-created. |
| `knows about:` inlined file > 1MB balloons the Worker bundle past the 10MB limit | Low | High | 4.4 warning + hard fail at 1MB. Tell user to split or move to KV. |
| `runs on temporal` emits two different things (Temporal SDK for Node target vs Workflows for CF target) — users get confused | Medium | Low | Doc it clearly in SYNTAX.md and USER-GUIDE.md; compiled code carries a comment `// Cloudflare Workflows target` so debugging is obvious. |
| Rollback on partial failure leaks D1 databases or scripts (costs money silently) | High | Medium | Phase 7.7 transactional rollback; integration test asserts no leak after induced failure. Add a weekly cron in Russell's account to list stale scripts. |
| Dispatch Worker routing config drifts when new tenants are added | Low | High | Single wildcard route `*.buildclear.dev` → dispatch Worker handles all tenants. No per-tenant route config — tenancy lives inside the dispatch Worker, not in CF routes. |
| WFP free-tier cap of 1000 scripts — we exceed it at 1001 Marcus users | Medium by month 6 | Medium | Overage pricing is $0.02/script/mo — trivial. Docs note it. Alert when script count > 950. |
| Tenant's WFP script name collides (someone else in Russell's account already took `acme`) | Medium | High | Phase 7 upload emits `<tenant>-<appSlug>` as script name, not `<appSlug>` alone — namespaces collisions. Test. |
| Cloudflare Workflows billed separately from Workers | Certain | Low | CF Workflows pricing (~$0.0005/invocation + $0.0001/step) is a separate line item from Workers requests. At Marcus scale (10k users × ~10 workflow invocations/mo = 100k invocations = $50/mo) the cost is negligible, but document it explicitly in `FAQ.md` so we don't claim "durable workflows included for free." Phase 10 docs surface this. |
| D1 eventual consistency — read-after-write in same request may see stale data in some edge regions | Low (D1 is strongly consistent within one primary region) | Medium | For apps doing `save X then look up X in same endpoint`, D1's session mode (PITR is strongly consistent) covers it. Document the pattern in `AI-INSTRUCTIONS.md`; the compiler can auto-emit `DB.withSession('first-primary')` on endpoints that do read-after-write. Track as Phase 2.10 if it surfaces during 8.5 smoke. |

---

## ⏱️ Estimate

**Phase-level estimates, cumulative (assuming focused work):**

| Phase | Estimate | Cumulative |
|-------|----------|-----------|
| 0 (Russell's prereqs) | 2 hours | 2h |
| 1 (Workers bundle emit) | 2–3 days | 2–3d |
| 2 (D1 adapter) | 2 days | 4–5d |
| 3 (Workers-safe runtime) | 1.5 days | 5.5–6.5d |
| 4 (knows about lazy-load) | 1 day | 6.5–7.5d |
| 5 (Cron Triggers) | 0.5 day | 7–8d |
| 6 (Cloudflare Workflows) | 2 days | 9–10d |
| 7 (deploy.js backend swap) | 2 days | 11–12d |
| 8 (HITL smoke) | 0.5 day | 11.5–12.5d |
| 9 (cleanup) | 0.5 day | 12–13d |
| 10 (docs) | 1 day | 13–14d |

**Total: ~13–14 focused days.** Red-team typically trims 15–25%.

---

## 📎 Copy-Paste Resume Prompt (for a fresh session mid-execute)

> I'm executing `plans/plan-clear-cloud-wfp-04-23-2026.md`, Clear's pivot to Cloudflare Workers for Platforms. Branch `claude/cloudflare-temporal-setup-PvwvL`. Before starting, read: (1) this plan file end-to-end, (2) `HANDOFF.md` for current state, (3) `PHILOSOPHY.md` rules, (4) `COMPETITION.md` for strategic framing (why we're doing this), (5) `plans/plan-click-to-edit-04-23-2026.md` (stub — don't execute yet, but verify the Workers-target emit preserves `data-clear-line` attrs per Phase 1 requirement). Then report which phase I should pick up at — check existing green tests, grep for `cf-<phase>.` commit messages to see how far we've gotten, and tell me the next TDD cycle to start.

---

## Metadata

- **Plan file:** `plans/plan-clear-cloud-wfp-04-23-2026.md`
- **Branch:** `claude/cloudflare-temporal-setup-PvwvL`
- **Related plans:** `plans/plan-one-click-deploy-04-17-2026.md` (superseded in part), `plans/plan-click-to-edit-04-23-2026.md` (stub — do after), `plans/plan-builder-mode-v0.1-04-21-2026.md` (related UX)
- **Related docs:** `COMPETITION.md` (strategic thesis), `HANDOFF.md` (current state)
- **Written:** 2026-04-23
- **Red-teamed:** 2026-04-23 (3 P0 + 8 P1 patched: emit-time branching for fs/require removal, PDF/DOCX compile-time extraction, explicit Temporal test targets, pinned compat_date, rollback ladder, deploy idempotency lock, tenant-prefixed D1 names, ai-proxy single-vendor caveat, Phase 0 verification gate, data-clear-line drift-guard, bcryptjs scope clarified)
- **Executing:** ready — run `execute-plan` on this file next














