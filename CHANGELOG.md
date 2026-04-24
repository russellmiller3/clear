# Clear Language — Changelog

Session-by-session history of what shipped. Moved out of ROADMAP.md on 2026-04-21 so the roadmap can focus on what's *next*. Capability reference (what features exist today) lives in `FEATURES.md`. Node-type spec lives in `intent.md`.

Newest entries at the top.

---

## 2026-04-24 — Transaction synonyms: `atomically:` / `transaction:` / `begin transaction:` (TIER 2 #48)

Canonical `as one operation:` was the only transaction form that parsed. Three natural English alternatives that Meph (and humans) reach for added as synonyms — all route to the same `NodeType.TRANSACTION` node, identical semantics:

```clear
atomically:
  subtract amount from sender's balance
  add amount to receiver's balance

transaction:
  ...

begin transaction:
  ...

as one operation:    # canonical — still works
  ...
```

Parser: three new keyword handlers (`atomically`, `transaction`, `begin` + next-token check for `transaction`). Compiler untouched — same TRANSACTION emit covers all four forms.

4 new tests + regression floor on canonical. 2472 → 2476 green, zero regressions, 8 templates clean.

Closes TIER 2 #48.

---

## 2026-04-24 — Upsert: `upsert X to Y by <field>` (TIER 2 #47)

Genuinely missing syntax. The canonical workaround was `look up X where email is Y's email` → `if X is nothing: save Y as new Y else save Y to Y`. Ugly and easy to get wrong.

New: `upsert profile to Users by email` — one statement. Parser: new `upsert` keyword handler builds a CRUD node with `operation='upsert'` + `matchField='email'`. Compiler: emits findOne by match field → if exists, update preserving id + re-fetch; else insert with `_pick` mass-assignment protection. Either path uses `_clearTry` for consistent error wrapping.

```clear
when user calls POST /api/users receiving profile:
  upsert profile to Users by email
  send back profile
```

The source variable gets updated via `Object.assign` so `send back X` returns the canonical record either way — callers don't need to branch on insert-vs-update.

4 new tests: findOne emission, update-branch id preservation + re-fetch, insert-branch mass-assign protection, non-email match field. 2468 → 2472 green, zero regressions, 8 templates clean.

Closes TIER 2 #47. Follow-ups: Cloudflare D1 upsert path, Python backend parallel emit, `save X to Y or update by email` alias.

---

## 2026-04-24 — Field projection: `pick a, b from X` (TIER 2 #44)

Missing syntax — requests.md asked for `transform X to include only a, b`. Shipped a cleaner expression form: `pick a, b, c from X` returns a new record (or list of records) with only those fields.

Polymorphic at runtime: `Array.isArray(X)` branches to `.map(r => ({ a: r.a, b: r.b }))` for lists or `{ a: X.a, b: X.b }` for single objects — callers don't need to know the shape. Python backend emits the dict-comprehension equivalent.

Usage:
```clear
slim_items = pick id, name, price from all_items   # list → list of slim records
safe_user  = pick id, name, email from user        # record → slim record (mask password)
```

Parser: new PICK node-type + parsePrimary branch that reads field names until `from`, accepts comma + `and` separators. Compiler: both JS and Python backends.

4 new tests: list projection strips unwanted fields, single-object projection, `and`-separator, Python dict-comp output. 2464 → 2468 green, zero regressions, 8 templates clean.

Closes TIER 2 #44.

---

## 2026-04-24 — Cookies — `set cookie` / `get cookie` on JS backend (TIER 2 #42)

Cookies were genuinely missing. `req.cookies` was always undefined because `cookie-parser` wasn't wired; `res.cookie` was unreachable from Clear source. Auth-via-cookie flows had to use raw `script:` escapes.

**Fix (JS backend):** two new node types, `COOKIE_SET` and `COOKIE_GET`. Canonical syntax:

```clear
set cookie 'session' to token
maybe_session = get cookie 'session'
```

Parser: `set cookie 'name' to value` routes in the `set` keyword handler; `get cookie 'name'` is a parsePrimary extension that runs before the `get_key ... from` dynamic-map path so it doesn't get eaten. Compiler: `res.cookie('name', String(value), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })` + `req.cookies['name']` reads. `cookie-parser` middleware auto-imported + installed ONLY when cookies are used — no dead code on apps that don't touch them.

**Secure-by-default:** httpOnly blocks JS-readable session cookies (mitigates XSS session theft). sameSite='lax' blocks cross-site POST (mitigates CSRF). secure is gated on NODE_ENV so local HTTP dev still works. Not signed by default — keep it simple; can add `set signed cookie 'name' to value` later.

**Python backend:** emits a TODO comment, not an error. Full Python parity needs Response dependency-injection in the endpoint signature — tracked as follow-up.

5 new tests: middleware auto-import, res.cookie emission with all security defaults, req.cookies read, no-dead-code negative case, variable-value support. 2459 → 2464 green, zero regressions, all 8 core templates compile clean.

Closes TIER 2 #42 for the JS path.

---

## 2026-04-24 — `display X as bar chart` shorthand (TIER 2 #8)

Meph kept writing `display sales as bar chart` expecting it to render a chart — natural English for "show this as a bar chart." The parser accepted the line (it looked like `display X as <format>` with format=bar), but the compiler had no `bar` display format, so nothing was emitted. No ECharts CDN, no chart DOM, no `echarts.init` call. Worst kind of silent drop — chart-less dashboards with zero compile errors.

**Fix:** parseDisplay now detects `as <type> chart` at the `as_format` position and rewrites to a CHART node identical to what the canonical `bar chart 'Title' showing X` produces. Supports bar/line/pie/area. Title defaults to the capitalized variable name (`sales` → `"Sales"`). Unknown chart types (`as neon chart`) emit a helpful error listing valid types instead of silently falling through.

6 new tests in `` `display X as bar chart` shorthand parses as CHART ``:
- Bar, line, pie, area all emit ECharts CDN + chart DOM
- `show X as line chart` (show synonym) works too
- Canonical `bar chart 'Title' showing data` unchanged (regression floor)
- Unknown chart type errors instead of silently dropping
- `as json` / `as dollars` / `as date` / `as percent` still route to DISPLAY (not captured by the shorthand)

2453 → 2459 tests green, zero regressions, all 8 core templates compile clean. Closes TIER 2 #8.

Per Russell's directive: "if errors meph does should be features, edit the compiler too." The shorthand is the feature; the silent-drop was the bug.

---

## 2026-04-24 — `table X:` shorthand + ASH-1 tool-allowlist config

Two things in one commit because they surfaced from the same Meph session triage.

**Language feature — `table X:` shorthand.** Meph kept writing `table Sales:` (no `create a` prefix) expecting it to parse as a table declaration, because `table` is already listed as a synonym for `data_shape` in synonyms.js. It didn't work — the parser only wired `create a X table:` into `parseDataShape`, and the bare `table X:` lead fell through to assignment parsing. Which then errored on fields like `amount is number` because `number` wasn't defined. Russell's call: this isn't a misuse, it's a missing language feature — fix the compiler.

Added a `data_shape` keyword handler in parser.js that routes `table X:` to `parseDataShape`. Both field forms (`price, number` and `price is number`) already worked inside the block; they just never got reached because the block wasn't recognized. Now `table Users:` + `amount is number` + `name, text, required` all compile clean. Five new compiler tests lock the shorthand in as a first-class form alongside the canonical `create a Users table:` and the long form `create data shape User:`.

Docs updated: SYNTAX.md new "Table shorthand" section listing all three equivalent forms + both field forms. AI-INSTRUCTIONS.md "Data Tables" section expanded with the three-forms block + two-field-forms block.

**ASH-1 infrastructure — `GHOST_MEPH_CC_ALLOWED_TOOLS` env var.** Prep for the Agent Self-Heal A/B sweep queued in HANDOFF.md. `buildClaudeStreamJsonSpawnArgs` now takes an optional `allowedTools` param and also reads `GHOST_MEPH_CC_ALLOWED_TOOLS` from env, so the sweep runner can flip between `""` (MCP-only baseline) and `"Bash,Read,Edit,Write"` (ASH-1 treatment) without patching the cc-agent spawn code. Default stays `""` so existing behavior and Factor DB instrumentation are unchanged. 3 new tests cover param-wins-over-env, env-overrides-default, and default-stays-empty.

2448 → 2453 tests green, zero regressions, all 8 core templates compile clean.

---

## 2026-04-24 — Friction batch 2b: type-keyword INTENT_HINTS (items #6 + #7)

Factor DB friction ranking items #6 (`text`) and #7 (`number`) were both the "You used X but it hasn't been created yet" error firing on type keywords. Root cause from reading real sessions: Meph writes `amount is number` inside a table block thinking `is` is a type annotation, but Clear reads `is` as assignment — so `number` gets treated as an undefined variable. Same pattern for `text`, `boolean`, `timestamp`.

**Fix:** four new entries in `validator.js` INTENT_HINTS. Each tells Meph the canonical comma-form field declaration AND when relevant the value-usage alternative:

- `number` → `amount, number, required` (comma form); assignments use literals like `amount = 5`
- `text` → `title, text, required` (comma form); values use quoted strings like `title is 'Welcome'`
- `boolean` → `active, boolean` (comma form); values use `true` / `false` literals
- `timestamp` → `created_at, timestamp` (comma form); auto-fills on insert

5 new tests in `INTENT_HINTS — type keywords used as if they were values` — each type hint validates its message content PLUS a regression test that the canonical comma form still compiles clean. 2443 → 2448 tests green, zero regressions, all 8 core templates compile clean.

Friction-driven like batch 1 and 2: picked the next-highest-cost errors from the ranker, didn't invent new syntax. Each entry is a ~1-line hint that ships globally forever at \$0.

---

## 2026-04-24 — Regression net on compile-tool-source-on-error (TIER 2 #12)

Audit of T2#12 (compile tool returns no source on error) found the fix was already in place at `playground/meph-tools.js:1234` — `const wantCompiled = r.errors.length > 0 || input.include_compiled === true`. Meph gets `javascript` / `serverJS` / `html` / `python` (truncated to 4-8KB each) auto-embedded whenever errors exist, plus a `note` field explaining why.

But there was no REGRESSION TEST locking that contract in. The existing suite tested `include_compiled=true` on a clean compile, but not the "errors → auto-include" auto-behavior. One refactor aimed at token-cost reduction could have silently stripped the auto-embed and Meph would have gone blind on errors again.

Added two assertions to `playground/meph-tools.test.js`:
- Failing compile (undefined variable) → compile result MUST include `javascript` or `serverJS` in the returned JSON
- The `note` field MUST mention "errors" when auto-embed fired

Moves T2#12 from "open" to "done" with the regression floor in place. Nothing else shipped — the compiler and tool weren't touched.

---

## 2026-04-24 — Friction batch 2: auth-capability gate on mutation security check

Session 45 friction data showed the "DELETE/PUT needs `requires login`" security error accounted for 25 rows and ~50% give-up rate (items #2 and #5 on the ranked list). Root cause surfaced from reading real Meph sessions: the apps were toy K/V stores with NO auth set up at all — no Users table, no `allow signup and login`. The validator was demanding `requires login`, which needs a user system to check against, in programs that had none. Meph had no valid move.

**Fix:** auth-capability gate. The mutation-needs-auth check now branches on whether the program has auth capability (`allow signup and login` declaration OR a Users table with a password field):

- **Auth capability present** → unchanged hard error on each DELETE/PUT missing `requires login`. The check still catches real auth bugs.
- **No auth capability** → per-endpoint errors are batched into ONE advisory warning at the top of the file, naming every public mutation endpoint by path and line, and telling Meph exactly how to upgrade to a hard error (add `allow signup and login`) or acknowledge the public-by-design case.

Before the fix, an auth-less 3-endpoint toy K/V store emitted 3 hard errors Meph couldn't resolve. After: 0 errors, 1 advisory warning listing all three — program compiles clean.

5 new tests in `Security - auth-capability gating on mutation endpoints`: auth-less compiles clean, auth-scaffolded still errors (regression floor), Users+password still errors (capability via table), multi-endpoint summary warning, warning names every path + points to the fix. 2438 → 2443 tests green, zero regressions, all 8 core templates compile clean.

This is a friction-driven fix: the Factor DB's top-5 script ranked it #2 and #5 combined. One rewrite shipped globally forever at \$0.

---

## 2026-04-24 — Multipart file upload server middleware (TIER 2 #15)

The client half of file upload already worked: `upload X to '/api/foo'` emitted `FormData` + `fetch` POST. The server half didn't. Any endpoint that received the multipart request saw `req.body = {}` because only `express.json()` was wired — `multipart/form-data` went unparsed, the handler got nothing, the file vanished silently.

**Fix:** auto-detect uploads anywhere in the AST (`UPLOAD_TO` or `ACCEPT_FILE` nodes, including deep-nested cases like `page > button > body > upload_to`). If any upload exists:
- `const multer = require('multer')` + `const _upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10*1024*1024 } })` emitted at module top
- Upload target URLs collected into a `uploadUrls` Set, passed through ctx
- POST endpoints whose path appears in `uploadUrls` get `_upload.any()` injected as middleware: `app.post('/api/upload', _upload.any(), async (req, res) => {...})`
- Endpoints not matched stay clean — plain JSON POSTs are untouched, so `express.json()` parsing keeps working

Memory storage (not disk) is the default: files arrive as `req.files[i].buffer` — avoids `/tmp` permission issues, EPIPE on full disks, and the "where do files live in production?" footgun. Callers needing disk storage can override.

6 new compiler tests: import presence, shared `_upload` instance, middleware wiring on matching POST, **negative case** (non-upload POST endpoints stay clean), **no dead code** (no multer import when no uploads exist), and body-guard preservation (the `typeof req.body !== 'object'` check stays — multer populates `req.body = {}` for multipart-only requests, so the guard never false-positives).

2432 → 2438 tests green, zero regressions, all 8 core templates compile clean, emitted JS syntax-checks. Closes TIER 2 #15.

---

## 2026-04-24 — Scheduled-task cancellation (TIER 2 #13)

Every Clear app with `background`, top-level `cron`, or `agent ... runs every` shipped with anonymous timer handles. SIGTERM closed the HTTP server but `setInterval`/`setTimeout` loops kept running — which meant the Node process refused to exit, production deploys waited for the 30s grace-period kill, and local `ctrl-c` required a second press.

**Fix:** unified `_scheduledCancellers = []` registry at module top (emitted only when the program actually has scheduled work — no dead code otherwise). Every emit site captures its timer in a named variable and pushes a zero-arg cancel closure:

| Pattern | Handle | Canceller |
|---------|--------|-----------|
| `background ... runs every X` | `setInterval` | `() => clearInterval(_job_X)` |
| `every X minutes:` (top-level cron) | `setInterval` | `() => clearInterval(_cron_int_X_min)` |
| `every day at 9am:` (HH:MM cron) | recursive `setTimeout` (re-armed on each `_tick`) | `() => clearTimeout(_curTimer)` — closes over a mutable var, so it always cancels whichever timer is armed right now |
| `agent ... runs every X` | `setInterval` | `() => clearInterval(_interval_fnName)` |
| `agent ... runs every X at Y` | `node-cron` | `() => _cron_fnName.stop()` |

Both `SIGTERM` and `SIGINT` now drain the registry before `server.close()`. SIGINT parity means ctrl-c in local dev exits on the first press.

7 new compiler tests assert: registry declaration, canceller push, SIGTERM/SIGINT drainage, negative case (no registry when no scheduled work), and closure semantics for the HH:MM recursive-setTimeout case. 2432 tests total green, zero regressions, all 8 core templates compile clean. Closes TIER 2 #13.

---

## 2026-04-24 — Python `belongs to` JOIN emission fixed (TIER 2 #9)

Silent bug shipped in a single session: Python apps with `belongs to` FK fields compiled to code that returned disconnected rows at runtime. Two distinct failures, both fixed, both covered by new tests.

**1. Schema typo: `REFERENCES userss(id)`.** The Python schema emitter naively appended `s` to the lowercased FK target — `Users` → `users` + `s` = `userss`. The referenced table never existed, so SQLite silently ignored the FK constraint. JS did this correctly via `pluralizeName` all along. Fix: use `pluralizeName(f.fk)` in the Python path too (compiler.js:5735).

**2. No FK stitching on read.** Python's `get all Posts` compiled to `db.query("posts")` and stopped. No loop to swap the FK id for the referenced record. The user got `{author: 1}` when they expected `{author: {id: 1, name: "Alice"}}`. The JS path has had this loop forever via `ctx.schemaMap.fkFields`, but the Python backend ctx never received `schemaMap` at all. Fix: populate `pySchemaMap` alongside `pySchemaNames` in the Python compile entry (compiler.js:12196), then mirror the JS stitching loop in the Python lookup branch (compiler.js:4200).

**User-visible outcome proven with runtime smoke** (temp-py-stitch-smoke.py):
```python
# Before: {'title': 'hello world', 'author': 1, 'id': 1}
# After:  {'title': 'hello world', 'author': {'name': 'Alice', 'id': 1}, 'id': 1}
```

5 new tests added to clear.test.js covering: `REFERENCES` pluralization correctness (double-s regression floor + -es plural + singular-needs-pluralize), Python stitching loop emission, and negative-case (no FK → no loop). 2426 compiler tests green, all 8 core templates compile clean, zero regressions.

Landed in a single commit on `fix/belongs-to-python-joins`. Closes TIER 2 #9.

---

## 2026-04-23 evening — Session 44 three-track push (research A/B + LAE hardening + LAE Phase B scaffolding)

9 commits on `feature/research-ab-tooling` (pushed to origin; merge to main pending Phase B 3.3+3.4+4-6). Three simultaneous tracks in one long session: close the hint-effect measurement gap, production-harden Live App Editing Phase A, and build 60% of the cloud-shipping path for Phase B.

### Track 1 — research A/B: hints measurably lift CRUD pass rate

First empirical proof the re-ranker is load-bearing. 40-trial paired sweep (counter L3 + todo-crud L4, 10 trials per condition per task, cc-agent on the Claude subscription, $0). Result:

| Task | hint_on | hint_off | Lift | avg_on | avg_off |
|------|---------|----------|------|--------|---------|
| counter (L3) | 8/10 (80%) | 8/10 (80%) | +0.0 pp | 157s | 157s |
| todo-crud (L4) | **10/10 (100%)** | 7/10 (70%) | **+30 pp** | **83s** | 115s |

CRUD shows +30 percentage points AND ~28% faster avg trial time. Single-endpoint counter shows flat — hints only earn their keep on error-rich archetypes. Full writeup with methodology, mechanism, and follow-up experiments in `RESEARCH.md` Session 44 evening section.

Supporting infrastructure shipped for the A/B:
- **Per-session NDJSON transcript persistence** — every cc-agent turn appends its raw claude stream-json to `playground/sessions/<session-id>.ndjson` with a turn-marker envelope. Replaces the GHOST_MEPH_CC_DEBUG tmpdir overwrite. Unlocks deterministic replay of any trial against alternate ranker/prompt/hint configurations at $0. (`8c53be1`)
- **CLEAR_HINT_DISABLE=1 env flag** — short-circuits the entire Factor DB retrieval block in meph-tools.js compile tool. Keeps the hint-off A/B arm at zero DB-query cost so measurement is hint *effect*, not hint *compute overhead*. (`8c53be1`)
- **AB sweep runner** — `playground/supervisor/ab-hint-sweep.js` with pure `expandTrials` + `summarizeAbResults` + `formatSummaryTable` helpers (17 test assertions). Spawns workers with the right env, interleaves trials, writes an audit-trail JSON artifact. (`6b6691b`)

### Track 2 — LAE Phase A production hardening

Closed the April-18 Security TODO that let anyone forge an `{"role":"owner"}` JWT and pass the live-edit owner gate. `liveEditAuth` in `playground/server.js` now runs every Bearer token through `verifyLegacyEvalAuthToken` — constant-time HMAC-SHA256 comparison via `crypto.timingSafeEqual`, expiry enforcement, rejection for every malformed shape (null, empty, 1-part, 3-part, non-string, signed-non-JSON-payload). 13 new assertions lock the contract.

Also dropped `owner is 'owner@example.com'` into todo-fullstack, crm-pro, blog-fullstack. Before this, the compiler emitted the widget tag but no template declared an owner, so the widget was never actually visible in any demo. Now Marcus can open a template, log in as owner, see the widget immediately. (`39f2f0e`)

### Track 3 — LAE Phase B cloud shipping scaffolding

Wrote the lean Phase B plan at `plans/plan-live-editing-phase-b-cloud-04-23-2026.md` (187 lines, 6 phases, 16 cycles) cherry-picking cloud mechanics from the one-click-updates plan. Executed Phases 1-3:

- **Phase 1 — tenants-db versions** (`a0b45ea`). `InMemoryTenantStore` grew `getAppRecord`, `recordVersion`, `updateSecretKeys` + `markAppDeployed` extended to seed `versions[]` with `secretKeys: string[]`. MAX_VERSIONS_PER_APP=20 with oldest-trim on insert. Security invariant: stores key NAMES only, never values. 40 new assertions across cycles 1.0-1.5.
- **Phase 2 — deploy-cloudflare mode:update** (`b34ebfb`). `deploySource({mode:'update'})` routes to a new `_deployUpdate` helper that skips provisionD1/applyMigrations/attachDomain (permanent setup from first deploy), runs a filtered setSecrets (only keys not already in lastRecord.secretKeys), uploads the new script, resolves the versionId via `_captureVersionId` (fast-path uses uploadScript response; slow-path calls listVersions + newest-by-created_on), appends to versions via `recordVersion`. 10 new assertions including via-tag forwarding and DeployLockManager coverage.
- **Phase 3 partial — applyShip cloud routing** (`9bd91f5`). `lib/ship.js` detects cloud-deployed apps via `io.getCloudRecord` + `io.shipToCloud` hooks; when both present AND getCloudRecord returns non-null, short-circuits local write/compile/spawn and delegates to shipToCloud. Safe defaults: any missing hook falls through to existing local path. 5 new assertions + regression floor.

Studio-side wiring (Phase 3 cycles 3.3-3.4: thread `tenantSlug + appSlug + store + deployApi` through applyShip closure) and widget Undo UX (Phase 4) deferred to next session.

### Numbers (mid-session)

2399 → 2408 compiler tests (Phase 3 lib/ship.test.js additions). 75 new test assertions across eval-auth, tenants, deploy-cloudflare update-mode, ab-sweep helpers, ship cloud routing. 0 regressions.

### Later-in-session work (A/B completed, friction-fix + Phase B completion)

After the background A/B finished (40 trials, 85.6 min wall-clock, result: todo-crud +30pp pass-rate lift with hints on, counter flat 80%/80%), executed four additional commits that close the "push Phase B to completion" loop:

- **`0f75a0f` RESEARCH.md Session 44 writeup** — full methodology + mechanism + three follow-up experiments (5-task expansion, tier attribution via replay, L5-L7 harder-archetype sweep).
- **`878bcf9` ROADMAP + friction tool** — SK-5/6/7/8 new research threads (self-play synthetic tasks, tiny model distillation, test-time compute scaling, safety-by-construction paper); updated OL-3 "error-message learning loop" from Idea to In-progress. Shipped `scripts/top-friction-errors.mjs` — mines Factor DB for top-friction compile errors by Meph-minutes-burned. First run surfaced the key finding below.
- **`08866da` friction-score fix — top 4 errors rewritten in one commit**. Factor DB analysis showed 7 of the top-10 highest-friction errors were the SAME "you used X but X hasn't been created yet" message mis-firing on reserved words and Clear-specific keywords. One validator rewrite fixes 4 of them at once: reserved structural words (`the`, `of`, `in`, etc.) now get a specific "reserved structural word" message; `body`, `remember`, `calls` now redirect to their canonical forms via INTENT_HINTS. Compiler tests 2408 → 2413.
- **`f1120d5` Phase B cycles 3.3 + 3.4 — cloud ship wiring end-to-end**. `lib/edit-api.js` threads `{tenantSlug, appSlug}` from POST body through as cloudContext; `playground/deploy.js` exports `getDeployDeps()` so sibling modules share the singleton store + WfpApi; Studio's applyShip closure now routes widget-Ship to `deploySourceCloudflare({mode:'update', via:'widget'})` when the app is cloud-deployed. Compiler tests 2413 → 2415.
- **`dfb007e` Phase B Phase 4 cycle 4.1 — cloud rollback endpoint + Studio wiring**. New `/__meph__/api/cloud-rollback` route + `applyCloudRollback` closure that calls `rollbackToVersion` on Cloudflare and records a `widget-undo-to-<hash>` version so history stays linear. Error codes: CLOUD_NOT_CONFIGURED / NOT_DEPLOYED / VERSION_GONE / ROLLBACK_FAILED. Compiler tests 2415 → 2421.
- **`f171c24` Phase B cycle 4.2 — widget JS cloud routing**. `runtime/meph-widget.js` reads a `<meta name="clear-cloud">` tag at load; when present, Ship forwards slugs (cloud path), Undo calls cloud-rollback instead of snapshot-restore, VERSION_GONE surfaces a specific error message. Progressive — missing tag is safe-default local (Phase A unchanged). Widget syntax-checks clean; compiler meta-tag emission is cycle 4.2b for next session.

### Session-wide numbers (final)

- **15 commits** on `feature/research-ab-tooling` (pushed to origin, ready for main merge)
- **Compiler tests: 2399 → 2421** (+22)
- **Helper suite:** 40 new tenants assertions, 10 new deploy-cf update-mode assertions, 5 new ship cloud-routing assertions, 13 new eval-auth assertions, 17 new ab-sweep helpers assertions, 8 new cloud-rollback assertions, 11 new transcript-persistence assertions, 5 new hint-disable assertions, 5 new keyword-misuse assertions. **~125 net new assertions across the evening.** 0 regressions.
- **Shipped: \$0 in API spend.** A/B ran on the Claude subscription via cc-agent.
- **A/B result:** todo-crud +30pp pass-rate lift (100% vs 70%), avg trial time −28% (83s vs 115s). First empirical proof the re-ranker's hints lift live pass rate. counter L3 flat at 80% as expected (no error-rich surface).
- **Flywheel progress:** Factor DB 1686 → 1722 rows (+36), 634 → 667 passing (+33).
- **Friction-fix impact projection:** 4 of top-10 errors replaced with targeted messages. If those four classes were burning ~860 Meph-minutes (sum of friction scores = 300+211+181+91 for remember, or ~783 for the four we fixed), expected Meph-minutes saved per future sweep is proportional. Compiler accumulates quality literally.

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
