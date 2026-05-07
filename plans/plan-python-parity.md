# Python Parity — Audit + Closure Plan

**Status:** drafted 2026-05-06. Not yet executed.

## The question

Clear's pitch is "same Clear file → Node + Express, OR Python + FastAPI, OR Cloudflare Workers + D1." But every feature ships on the JS path first; Python is "supposed to" follow but lags in real audits. CLAUDE.md has a hard rule about cross-target parity ("Build Python Alongside JS — No Drift Tax"), but rules don't enforce themselves. We need the audit + closure pass.

## The audit

For every feature shipped on the JS backend, verify the Python emit matches. The audit is a single CSV with one row per feature × target.

### Source of truth for "JS shipped"

Three lists, intersected:
1. Every `case NodeType.X:` in `compileNode()` (compiler.js JS path)
2. Every `case NodeType.X:` in `compileToPythonBackend()` (compiler.js Python path)
3. Every NodeType in `parser.js`

Anything in #1 + #3 but missing from #2 is a parity gap. Same for the reverse.

### Runtime helpers

Both adapters share an API surface; mismatches there are the most expensive bugs:

| Function | runtime/db.js (JS) | runtime/db-postgres.js (Python equivalent should be runtime/db.py) |
|---|---|---|
| createTable | ✓ | ? |
| findAll / findOne | ✓ | ? |
| insert | ✓ | ? |
| update | ✓ | ? |
| updateWithVersion (optimistic lock) | ✓ | ? |
| remove | ✓ | ? |
| auto-add user_id / tenant_id / _version columns | ✓ | ✓ (added 2026-05-06) |
| sensitive field encrypt-at-rest | ✓ (2026-05-06) | ? |
| name-based redaction in audit body summary | ✓ | ? |
| RLS policies (Postgres) | ✓ via SET LOCAL | n/a (Python uses same Postgres adapter) |

### Runtime helpers — specific gaps to scan for

| Helper | JS source | Python equivalent | Scope |
|---|---|---|---|
| `runtime/auth.js` (bcrypt + JWT) | exists | `runtime/auth.py`? | required for Python apps with `allow signup and login` |
| `runtime/rateLimit.js` | exists | `runtime/rateLimit.py`? | required for OWASP Piece 4 auto-login-rate-limit |
| `runtime/sensitive-crypto.js` (AES-256-GCM) | shipped 2026-05-06 | `runtime/sensitive-crypto.py`? | required for OWASP Piece 3 |
| Audit-log emit + retention helper | inline in compiler.js | `?` in Python emit | required for Python apps to ship the same audit-trail story |

### OWASP Pieces 1-5 specifically

| Piece | JS shipped | Python shipped |
|---|---|---|
| 1 — per-row creator filter | cycle 5 (JS) + cycle 6 (Python) ✓ | ✓ |
| 1 — runtime user_id auto-add | SQLite ✓ + Postgres ✓ (2026-05-06) | n/a (no Python-only DB; uses same runtime) |
| 2 — outgoing requests allowlist | validator pass ✓ (target-agnostic) | ✓ (validator) |
| 3 — sensitive field tag, parser + schema flag | ✓ | ✓ (parser is target-agnostic) |
| 3 — encrypt-at-rest runtime | JS db.js ✓ (2026-05-06) | **GAP — runtime/db.py doesn't exist; need Python crypto helper** |
| 3 — `can return sensitive data` endpoint marker | parser ✓ | parser ✓; compiler emit unverified for FastAPI |
| 4 — auto login rate-limit | JS compiler ✓ (2026-05-06) | **GAP — Python compiler emit needs the same `rateLimit` middleware wire** |
| 5 — hardcoded-secrets linter | validator pass ✓ (target-agnostic) | ✓ (target-agnostic) |

## The audit script

Write `scripts/python-parity-audit.mjs`. It:
1. Walks the AST nodes via parser.js's NodeType enum.
2. For each NodeType, greps compiler.js for `case NodeType.X` in both JS-backend and Python-backend functions.
3. Reports missing Python cases as a CSV: `node_type, js_handled, python_handled, severity`.
4. Severity ranking: HIGH (security primitives, auth, encryption, audit trail), MEDIUM (data-shape modifiers, CRUD), LOW (UI directives — Python doesn't render HTML).
5. Append a per-runtime-helper row checking file existence in `runtime/` for `.py` peers.

Run it. The output IS the closure list.

## The closure pass

Iterate the audit's HIGH-severity rows in three commits per gap:

1. **Test (RED)** — write a Python-target test that asserts the missing emit. Should fail because the emit doesn't exist.
2. **Implement (GREEN)** — port the JS emit to the Python branch. Match the JS test's structure.
3. **Cross-target smoke** — run `node scripts/cross-target-smoke.mjs` to confirm all 13 templates × 4 targets emit clean.

For runtime helpers (Python files that don't exist yet), write the helper, port the test, run it. Each runtime helper is one focused branch + commit + merge.

## Priority order

| Order | Gap | Why first |
|---|---|---|
| 1 | `runtime/sensitive-crypto.py` | OWASP Piece 3 doesn't work on Python without it. Marcus pitch can't claim "Python target also closes OWASP Top 10" without this. |
| 2 | `runtime/auth.py` (if missing) | Auth scaffold can't ship on Python without bcrypt + JWT helpers |
| 3 | `runtime/rateLimit.py` | OWASP Piece 4 (auto login rate-limit) parity |
| 4 | Audit-log emit on Python target | If we want Python apps to ship the same audit story |
| 5 | Compiler-emit gaps from the audit CSV in severity order | Whatever the script surfaces |

## Definition of done

- `scripts/python-parity-audit.mjs` exists, runs in <10 seconds, prints zero HIGH-severity gaps.
- Every Marcus-spec'd app (5 apps) compiles to BOTH `target: backend` (Node) AND `target: python` (FastAPI) cleanly with zero errors.
- The runtime test suite has a Python tier that exercises every helper end-to-end.
- CHANGELOG entry naming what was closed and the audit baseline.

## Why this matters for Marcus

Right now Marcus apps deploy as Node. That's fine. But the cross-target pitch is part of the strategic moat: "we don't lock you into one runtime — your business logic is portable." A prospect who hears that pitch and tries `target: python` then finds a missing helper has a worse experience than someone who never heard the pitch.

We either close the gap or stop advertising the gap-having-feature. CLAUDE.md says close it; this plan is the closure path.

## Estimated cost

- Audit script: 1-2 hours.
- Each runtime helper port: 2-3 hours of focused work (test + implement + smoke).
- Compiler-emit gaps depend on count. If <10 HIGH severity, half a day. If >20, a multi-session focused arc.

## When to execute

After Marcus signs (revenue funds the focused time), OR when a prospect asks for Python and we want to credibly say yes. Until then, the audit script alone (1-2 hours) is worth running so we have honest answers when the question comes up.

---

## Status update — 2026-05-06 late evening

**Audit script + 5 of 5 runtime helpers SHIPPED.**

- `scripts/python-parity-audit.mjs` — runs in <1s. Surfaces 21 HIGH-severity NodeType gaps + (yesterday morning) 5 of 5 runtime helper file gaps. Exit 1 when any HIGH gap exists.
- `runtime/sensitive_crypto.py` — AES-256-GCM, byte-for-byte interop with the JS sibling.
- `runtime/auth.py` — login + JWT, ZERO PyPI deps (matches JS stdlib HMAC + PBKDF2 instead of bcrypt + PyJWT, preserving cross-runtime password + token interop).
- `runtime/db.py` — persistent SQLite via stdlib `sqlite3`. Same on-disk file as JS via better-sqlite3.
- `runtime/rate_limit.py` — FastAPI dependency for OWASP Piece 4. Stdlib only.
- `runtime/db_postgres.py` — psycopg3 sync API. Same column shapes as JS Postgres adapter.
- `.claude/hooks/python-first-class.mjs` — PostToolUse hook on edits to runtime/* and compiler.js / parser.js / synonyms.js. Surfaces audit's HIGH gap count + reminds about the rule.

**Remaining (the load-bearing piece): compiler-emit wiring in `compileToPythonBackend`.** Compiled Python apps still inline the in-memory `_DB` stub at compiler.js lines ~15504-15557 instead of importing the real helpers. Until this lands, "Python target works as advertised" remains aspirational.

### First-session scope for the compiler-emit wiring (next pickup)

Replace the inline `_DB` emission in `compileToPythonBackend` with helper imports:

- **`database is local memory`** — keep the inline stub (it's the in-memory mock for local dev / tests; some existing tests depend on it).
- **`database is local file`** — emit `from clear_runtime import db` (uses `runtime/db.py`, real SQLite). The CLI's runtime-copy step needs to drop `runtime/db.py` into the compiled app's `clear-runtime/` directory next to the existing `runtime/db.js` copy logic.
- **`database is postgres`** — emit `from clear_runtime import db_postgres as db` (aliased so call sites match the SQLite path verbatim). CLI copies `runtime/db_postgres.py`.

The `database is local file` keyword may not exist for Python yet — check the parser. If not, add it as a parser change in the same arc.

### TDD shape for the wiring (when picked up)

1. Add a passing-today test that locks the existing `database is local memory → inline stub` behavior (currently tested at clear.test.js:14932 — verify it stays green).
2. Add a failing test that asserts `database is local file` → `from clear_runtime import db` (and no inline stub).
3. Add a failing test that asserts `database is postgres` → `from clear_runtime import db_postgres as db`.
4. Make the new tests green by:
   - Add `database is local file` parser support if missing.
   - Branch the Python `_DB` emission on `dbBackend` (local-memory vs file vs postgres).
   - Skip the stub emission for the file/postgres cases and emit the import line instead.
5. Add CLI runtime-copy support for `runtime/db.py` and `runtime/db_postgres.py` (the JS files have a parallel copy step in cli/clear.js).
6. Cross-target smoke (`scripts/cross-target-smoke.mjs`) compiles every template against Python; verify no regressions.

### Status update — 2026-05-06 (even later)

**Step 1 of the auth scaffold rewrite shipped: method-name harmonization.** The inline `_DB` stub now exposes `find_all` / `find_one` / `insert` alongside the legacy `query` / `query_one` / `save`. The new methods delegate to the legacy ones — same behavior, canonical PEP 8 names available. Four new tests at `clear.test.js` lock the aliases in. This unblocks the auth scaffold rewrite that follows because the auth code can now call `db.find_one("_auth_users", {"email": email})` regardless of which database backend is in scope.

**Next pickup (session N+1):** rewrite `compileAuthScaffoldPython` in `compiler.js:6401` to:
- emit `db.create_table('_auth_users', {...})` once at the top of the scaffold (mirroring the JS scaffold's `db.createTable` at compiler.js:14470)
- replace `_users = []` + `any(u["email"] == email for u in _users)` with `db.find_one("_auth_users", {"email": email})`
- replace `_users.append(user)` with `await db.insert("_auth_users", user_record)` — handle the async/sync split (real db.py is sync, signup handler is currently `async def`)
- replace the user lookup in `/auth/me` with `db.find_one("_auth_users", {"id": payload["id"]})`

The id-vs-tenant_id init-order gotcha (from learnings.md 2026-05-03 night) applies — when the JS scaffold added durable users, it had to do a two-step insert+update because `tenant_id = user.id` and id is auto-issued. The Python rewrite will hit the same shape and needs the same fix.

### Gotchas to apply (from learnings.md, surfaced 2026-05-06)

- **Thread the new `dbBackend` ctx field through ALL ctx build sites.** Missed one cycle 5 = silent no-op. The Python ctx-build site is around compiler.js:15770. Verify every `mode: 'backend'` ctx literal has the new field after the change. (Pattern: `grep -nE "mode:.*'backend'" compiler.js`.)
- **Substring collisions on common JS keywords inside Python strings.** Don't put words like `let`, `const`, `function`, `return`, `=>`, `;` in any docstring or comment that the Python compiler embeds — the existing test harness greps the Python output for "no JS artifacts" and substring matches will fail it.
- **Runtime files are COPIED at build, not imported.** The compiler doesn't import `runtime/db.py`; the CLI copies it into compiled apps' `clear-runtime/` dir. Emitting `from clear_runtime import db` is HALF the change; the other half is the CLI copy step.

### Test-floor invariant after the wiring lands

- The existing test at clear.test.js:14932 ("Python local memory still uses db stub") MUST stay green. The wiring is opt-in via the new `local file` / `postgres` declarations.
- Cross-target smoke pre-push hook must pass on all 13 canonical apps for both JS and Python targets.
- The python-parity audit's HIGH NodeType gap count drops by at least 6 (CRUD's 6 hits — that's the immediate unblocker).

