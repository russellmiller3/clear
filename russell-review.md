# Russell Review — Session 45 continuation

Running log of design calls + visual work shipped autonomously while Russell was AFK. Each entry: what the decision was, why I picked it over alternatives, where to look if you want to change it. Check these and either approve or tell me to iterate.

Format per item: **design choice** / **alternatives I considered** / **evidence it works** / **where to change it if you disagree**.

---

*Will append entries as I ship. Timestamps in HH:MM local.*

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

**Not checked:** signed cookies (defer), CSRF tokens (out of scope), cookie removal (`clear cookie 'session'` — should add), list-all-cookies. Meph can use the primitive; the ergonomics stubs are follow-ups.

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

