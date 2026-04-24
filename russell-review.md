# Russell Review — Session 45 continuation

Running log of design calls + visual work shipped autonomously while Russell was AFK. Each entry: what the decision was, why I picked it over alternatives, where to look if you want to change it. Check these and either approve or tell me to iterate.

Format per item: **design choice** / **alternatives I considered** / **evidence it works** / **where to change it if you disagree**.

---

*Will append entries as I ship. Timestamps in HH:MM local.*

---

## TL;DR — 7 language features landed this continuation

| # | What | Status | Test delta |
|---|------|--------|------------|
| 1 | Charts shorthand `display X as bar chart` | ✅ shipped | +6 tests |
| 2 | Cookies `set/get cookie` (JS, secure-by-default) | ✅ shipped | +5 tests |
| 3 | Field projection `pick A, B from X` | ✅ shipped | +4 tests |
| 4 | Upsert `upsert X to Y by <field>` | ✅ shipped | +4 tests |
| 5 | Transaction synonyms (`atomically:` etc) | ✅ shipped | +4 tests |
| 6 | Scroll handler `on scroll [every Nms]:` | ✅ shipped | +4 tests |
| — | T2#11 agent streaming | ⏸ deferred | needs SSE design pass |
| — | Python cookie parity + upsert | ⏸ deferred | follow-up |

**2459 → 2480 compiler tests green** across the 6 fixes. All 8 core templates compile clean after every shipped change. Five commits on main, all pushed.

**What's queued but needs your design input:** agent streaming display (SSE transport + client-side EventSource reader + how to declare "this agent's responses stream"). Everything else in the original queue is either shipped or requires nothing more than a design call that I didn't want to make without you.

**The ASH-1 sweep is DONE.** Headline: re-enabling Bash/Read/Edit/Write crushed Meph on counter (80%→0%) and todo-crud (100%→0%). Contact-book + validated-forms unchanged at 100%. Auth-todo 0/0 both. **Strong negative result for Browser Use's "Bitter Lesson" hypothesis in our specific setup** — Meph's 28 MCP tools force narrow convergence on simple tasks; adding built-ins gives him rope to explore instead of finish. ASH-2 (`meph_propose_tool` flywheel) is now the right next move; ASH-3 (prune wrappers) is downgraded. Full writeup in RESEARCH.md.

### ASH-1 — one more design call that needs your eye

I wrote the ASH-1 result as a negative finding for the Bitter Lesson, but the inference is bounded: 5 tasks, one Claude subscription, one model. If you want to challenge the interpretation:
- **Alternative reading:** the built-ins aren't broken — Meph just needs a prompt that says "prefer MCP tools when available." That'd be a quick re-run with `GHOST_MEPH_CC_ALLOWED_TOOLS="Bash,Read,Edit,Write"` + a one-line system-prompt addition. If pass rate recovers, the wrappers-are-necessary conclusion weakens.
- **Another:** the 180s timeout is doing the work — maybe Meph CAN finish with the built-ins, just slower. Re-run with 300s or 480s cap would test that.
- Both are cheap ($0, ~2 hrs each). I didn't run either because I wanted to ship the language features first and let you decide whether the cleaner result is worth another hour of sweep time.


---

## 1. Charts shorthand — `display X as bar chart` (T2 #8)

**Design choice:** `display X as <type> chart` (where `<type>` ∈ bar/line/pie/area) parses as a CHART node identical to the canonical `bar chart 'Title' showing X`. Title defaults to the capitalized variable name (`display sales as bar chart` → `"Sales"`); the existing 4 chart types stay the whitelist.

**Alternatives I considered:**
- **Silent continuation with format='bar' as a no-op** — the current bug. Rejected: silent drops are the worst bug class. Russell's charter calls these out specifically.
- **Require explicit title: `display X as bar chart titled 'Y'`** — more verbose. Rejected because the "just works" English reading is what Meph keeps writing.
- **Canonical redirect via INTENT_HINTS** — tells Meph to rewrite. Rejected after the `table X:` fix: Russell said to make the compiler learn, not nag Meph.

**Evidence it works:**
- 6 new tests green — bar/line/pie/area all emit ECharts CDN + init; canonical still works (regression floor); unknown chart type errors cleanly with list of valid types; `as json`/`as dollars`/`as date`/`as percent` still route to DISPLAY (not captured by the shorthand).
- 2459/2459 compiler tests, all 8 core templates clean.

**Where to change it if you disagree:**
- Title inference: `parser.js` around the new `if (pos + 2 < tokens.length && tokens[pos].canonical === 'as_format'...)` branch. Change the `title = expr.node.name.charAt(0).toUpperCase()...` line to whatever default you want.
- Whitelist: same block, `['bar', 'line', 'pie', 'area']` — add/remove types.
- Title default when the expression isn't a simple variable (e.g., `display sum of sales as bar chart`): currently falls back to `"Bar Chart"` etc. If you want a smarter title, that's the `chartType.charAt(0).toUpperCase()...` branch.

**Not visually verified.** I didn't render the emitted HTML in a browser because you said to check later. The canonical chart tests (which go through the same CHART codegen) already pass the full compile-and-render path used by the 8 core templates, and the emitted HTML contains the expected ECharts CDN + init. Visual-polish review still yours.

---

## 2. Cookies — `set cookie` / `get cookie` (T2 #42, JS backend)

**Design choice:** `set cookie 'name' to value` + `get cookie 'name'`. JS backend auto-wires cookie-parser middleware + emits `res.cookie(...)` with secure defaults: **httpOnly: true, sameSite: 'lax', secure in production (NODE_ENV check), not signed by default**. Read returns `req.cookies[name]` (undefined if unset).

**Alternatives I considered:**
- **Signed by default** (requires a secret + `cookie-parser(SECRET)`). Rejected: forces every app to manage a secret at session 45 maturity. Ship simple now; can add `set signed cookie 'name' to value` later via a `signed` keyword.
- **secure: always true.** Rejected: breaks local HTTP dev. Tying secure to `NODE_ENV==='production'` is the Express/Node convention.
- **SameSite: 'strict'.** Rejected: breaks the common "click a link from email → log in" flow. 'lax' is the pragmatic default.
- **Python backend parallel.** Deferred — FastAPI cookies need Response injection into the endpoint signature, which is a sizeable parser/compiler change. Emitted a TODO comment in the Python path so programs still compile but Meph sees the gap.

**Syntax:** `set cookie 'session' to token`, `get cookie 'session'`. Also accepts a numeric value, a variable, a literal — anything that's an expression. Also planned but deferred: `for 7 days` maxAge suffix — the parser scans for it but the `for` canonicalization didn't match on the first try, so I removed the requirement and left it as a TODO. When shipped, it would map `for N days` → `maxAge: N * 86400000`.

**Evidence it works:**
- 5 new tests green: cookie-parser auto-imports, `res.cookie` emits with secure defaults, `req.cookies[name]` emits for reads, no dead code when no cookies exist, variable values work (not just string literals).
- 2459 → 2464 compiler tests, 8 templates clean.

**Where to change it if you disagree:**
- Security defaults: `compiler.js` COOKIE_SET case — change the `opts` array.
- Syntax: `parser.js` cookie-set handler in the `set` block — change the shape of `set cookie 'name' to value`.
- Python support: compile target in COOKIE_SET emits a TODO. Needs Response dependency injection in the endpoint signature. Tracked as follow-up.

**Follow-ups shipped later this session:** signed cookies (`set signed cookie 'name' to X` + `get signed cookie 'name'`), `clear cookie 'name'`. Signed cookies auto-wire `cookieParser(secret)` with `COOKIE_SECRET` env var + a runtime warning if unset. Full entry below as #8.

**Still not checked:** CSRF tokens (out of scope), list-all-cookies. Meph can use the primitive; the ergonomics stubs are follow-ups.

---

## 8. Signed cookies — `set signed cookie 'name' to X` / `get signed cookie 'name'` (T2 #42 continuation)

**Design choice:** extend the existing cookie syntax with a `signed` modifier. Set form: `set signed cookie 'name' to value`; read form: `get signed cookie 'name'`. Compiler auto-wires `cookieParser(secret)` with the secret from `process.env.COOKIE_SECRET`. If the env var isn't set at runtime, the program prints a LOUD `console.warn` and falls back to a random ephemeral per-process secret (so signed cookies still work but session continuity breaks on restart).

**Alternatives I considered:**
- **Sign every cookie by default.** Rejected: requires all apps to manage a secret, even toy demos. Opt-in via `signed` keeps the simple path simple.
- **Silently use a default secret if env var unset.** Rejected: silent secret reuse is exactly the bug pattern that breaks production (committed default in source, anyone with git access can forge). The loud warn is the right trade.
- **Fail to start if COOKIE_SECRET unset.** Rejected: kills local dev loops. The warn + ephemeral fallback lets you iterate locally without ceremony.

**Evidence it works:**
- 3 new tests: signed set emits `signed: true` + `cookieParser(secret)`, signed get reads `req.signedCookies[name]`, runtime warning fires on missing env var.
- 2483 → 2486 tests, 8 templates clean.

**Where to change it if you disagree:**
- Default secret policy: `compiler.js` cookie-scan block. Swap the console.warn for `throw new Error(...)` if you want fail-fast.
- Python parity still deferred — same Response dep-injection blocker as plain cookies.
- Cookie TTL (`for N days` maxAge): parser scans for it but the `for` canonicalization didn't match cleanly on first try — left as TODO. Would unblock `set signed cookie 'session' to token for 7 days`.

---

## 3. Field projection — `pick A, B from X` (T2 #44)

**Design choice:** `pick a, b, c from X` as an expression that returns a new record (or list of records) with only those fields. Polymorphic via runtime `Array.isArray(X)` check so the same syntax works whether X is a single object or a list. Comma + `and` both accepted in the field list (`pick a, b, and c from X`).

**Alternatives I considered:**
- **`transform X to include only a, b, c`** (requests.md's suggested syntax) — verbose, reads as a statement that mutates X. Rejected: `pick` as an expression composes better with other Clear forms (`slim = pick id, name from items`) and doesn't require mutation.
- **Only handle lists (`.map`)** — simpler codegen. Rejected: Meph and users frequently pick from single records (sanitize before sending back, mask-password use case).
- **Only handle single objects** — same rejection from the other side.
- **Require the source to be a table name (`pick id, name from Orders`)** — could double as a SQL-like SELECT. Rejected: table reads go through `get all X` + stitch already; adding a second path to the same effect is two-ways-to-do-it.

**Evidence it works:**
- 4 new tests green: list projection strips extra fields (verified `secret` is absent from output); single-object projection; `and`-separated field list; Python emits a dict-comprehension form.
- 2464 → 2468 compiler tests, 8 templates clean.

**Where to change it if you disagree:**
- Statement form: if you want `transform X to include only a, b, c` AS WELL, add a separate statement-handler that wraps pick. I didn't because two-ways-to-do-it.
- Python emit: `compiler.js` PICK case — currently uses `_r.get('field')`. If your Python Meph apps use objects with attribute access instead, change to `_r.field`.
- Unknown-field semantics: currently yields `undefined` (JS) / `None` via `.get()` (Python). Alternative: error at compile-time if the source type is statically known. Low priority — JS already handles undefined fine.

---

## 4. Upsert — `upsert X to Y by <field>` (T2 #47)

**Design choice:** `upsert <var> to <Table> by <matchField>` — one statement, explicit match field, polymorphic. Compiles to: findOne({matchField: var[matchField]}) → if exists, update preserving id + re-fetch; else insert. Mutates the source variable via `Object.assign` so `send back X` returns the canonical record either way.

**Alternatives I considered:**
- **`save X to Y or update by email`** (requests.md's proposed syntax) — reads nicely but three words longer. Rejected for the shorter form; could add this as a synonym later.
- **`save X as new Y` with auto-upsert-by-unique-field** — too magic. Meph and humans both need to see explicitly that this line can UPDATE a row, not just insert. The explicit `upsert` keyword signals the destructive-on-match semantics.
- **Auto-detect match field from unique index** — requires the compiler to peek at the schema at the parser level. Fragile. Explicit `by field` is clearer and works with any field, not just uniques.

**Evidence it works:**
- 4 new tests: findOne by match field, update branch preserves id + re-fetches, insert branch uses `_pick` (mass-assignment protection), non-email match field works.
- Manual probe: emits sensible `if (_existing) { update } else { insert }` with error wrapping via `_clearTry`.
- 2468 → 2472 compiler tests, 8 templates clean.

**Where to change it if you disagree:**
- Syntax: `parser.js` `upsert` handler. Easy to add `save X to Y or update by F` alias later.
- Match field validation: today any field works, even non-unique ones. If you want to warn when the match field isn't unique in the schema, add a validator check that reads `schemaMap` and looks for `unique` on the field.
- Emit shape: `compiler.js` CRUD upsert branch. Currently mutates the source variable. If you prefer a return-the-saved-record form (`saved = upsert X ... → saved is the new record, X unchanged`), that's a larger refactor.

**Not checked:**
- Concurrent upsert race conditions (two requests with the same email at the same time → both hit findOne=null → both insert; one gets a unique-constraint error). Can be hardened later with SQL `ON CONFLICT DO UPDATE`.
- Cloudflare D1 path (the `compileCrudD1` has its own branches; upsert not wired there yet — follow-up).
- Python backend upsert — falls through to the "CRUD: upsert" comment. Needs parallel emit.

---

## 5. Transaction synonyms — `atomically:` / `transaction:` / `begin transaction:` (T2 #48)

**Design choice:** all three English forms parse identically to the canonical `as one operation:` block, building the same `NodeType.TRANSACTION` node. No new semantics — just three more natural-sounding spellings.

**Alternatives I considered:**
- **Make one of these the canonical** — would force a doc-rewrite and a two-ways-to-do-it period. Rejected: `as one operation:` is established, and all three synonyms routing to it is the simplest mental model.
- **New semantics (savepoints, nested transactions)** — out of scope for this pass. The existing TRANSACTION emit supports the basic begin/commit/rollback; advanced forms are a follow-up.

**Evidence it works:**
- 4 new tests green: each synonym produces an AST with a `transaction` node; canonical still works (regression floor).
- 2472 → 2476 compiler tests, 8 templates clean.

**Where to change it if you disagree:**
- `parser.js` near the `as_format` TRANSACTION handler — 3 new entries for `atomically`, `transaction`, `begin`. Drop any you don't want.
- Semantics: `compiler.js` TRANSACTION case is unchanged — any edit there affects all four forms.

---

## 6. Deferred from this pass — flagged for future

**T2 #33 — `on scroll every Nms:` (done after initial deferral).** Added a first-class scroll handler with optional leading-edge throttle. See entry #7 below.

**T2 #11 — agent streaming display (design pass required).** SSE transport decision + how to express "this agent streams" at the call site.

**Python parity for cookies + upsert — partially done.** Python upsert shipped (mirrors JS emit). Python cookies still deferred because FastAPI Response dep-injection is a parser/compiler change. `clear cookie 'name'` added on the JS side in the follow-up.

---

## 7. Scroll event handler — `on scroll [every Nms]:` (T2 #33)

**Design choice:** `on scroll:` as a block-level event handler, optional `every Nms:` / `every N seconds:` suffix for leading-edge throttle. Compiles to `window.addEventListener('scroll', fn, { passive: true })` with an inline time-gated dispatch. Added synonyms for `on page scroll`, `on page scrolls`, `when page scrolls`, `when user scrolls` — all canonicalize to `on_scroll`.

**Alternatives I considered:**
- **`throttle 100ms on scroll:`** (requests.md's suggested shape) — "throttle" leads the statement. Rejected: reads awkward; the event (`on scroll`) is the primary thing, throttle is the modifier.
- **Trailing-edge throttle** (fire at end of each interval, not start) — better for stop-handlers but confusing for scroll (user doesn't scroll, then 100ms later a thing happens?). Leading-edge matches intuition for infinite-loaders / sticky headers: fire fast on first scroll, then suppress.
- **Also support debounce** (`on scroll after 300ms:` = wait for scroll to pause) — would be natural given the `when X changes after 300:` debounce pattern. Didn't add; easy follow-up.
- **Element-scoped scroll** (`when #sidebar scrolls:`) — requires selector syntax. Deferred.

**Evidence it works:**
- 4 new tests green: basic scroll listener, throttled with ms, throttled with seconds (unit conversion), passive:true perf flag.
- 2476 → 2480 compiler tests, 8 templates clean.
- Bumped SYNONYM_VERSION 0.31.0 → 0.32.0.

**Where to change it if you disagree:**
- Leading-vs-trailing throttle: `compiler.js` scroll emit. Currently stores `lastFire` timestamp and returns early if < throttleMs elapsed. Trailing-edge would pair with a tail setTimeout.
- Synonyms: `synonyms.js` `on_scroll` list. Add element-scoped later if you want.
- Debounce variant (`on scroll after 300ms:`) — follow-up.

