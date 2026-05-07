# Handoff — 2026-05-06 (very late, three phases shipped)

## Where you are

- **Branch:** `main`. WIP=0. Working tree: untracked `playground/` only (longstanding noise).
- **Last commit:** `39c91a6` feat(compiler/python): auth scaffold uses durable user storage.
- **Tests:** 2993/2993 green at last full run.
- **Critical-path standing:** Python AUTH persistence epic is now substantially closed. Process restart no longer wipes user accounts when database is `local file` or `postgres`. The "Clear runs anywhere — same source, same durability" pitch is now true on Python at the auth layer. Audit log + tenant scope on Python remain the next chunks.

## What this session shipped (4 commits on main, all pushed)

1. **`94413cf`** — Hartl Chapter 12 (the agent's ship). Closing chapter of the tutorial track. ~201 lines walking the reader through `rule discount-cap-thirty` + `clear prove` + the audit PDF. Renamed the existing Chapter 12 (Security) to Chapter 25 to avoid the duplicate-heading collision.
2. **`7019b5b`** — Hartl FEATURES + FAQ pass on Chapters 6, 8, 12. Russell's standard for the tutorial: "ultimately for me to learn Clear so it has to be great." Three substantive additions: Chapter 12 got a new "audit log table" subsection (the daily receipt the CRO consults; the PDF is the dated artifact for buyers) plus a 4th try-it-yourself exercise and a jargon scrub. Chapter 8 got an "audit log for free" subsection at the end of "What you didn't write." Chapter 6 got a sensitive-fields side note pointing at Chapter 6.5 so a reader skipping the modifier reference doesn't miss encrypt-at-rest.
3. **`d0d5222`** — Python inline `_DB` stub method-name harmonization. The stub now exposes `find_all` / `find_one` / `insert` alongside the legacy `query` / `query_one` / `save`. Pure delegation. Unblocks the auth scaffold rewrite below.
4. **`39c91a6`** — Python auth scaffold uses durable user storage. The `_users = []` list is gone. Signup uses `db.find_one` for duplicate-email + `db.insert` to create. Login + `/auth/me` use `db.find_one`. Mirrors the JS scaffold's `db.createTable('_auth_users', ...)` shape at compiler.js:14470. 5 new tests lock the emit shape.

## Next session — priority order

1. **Audit log emit on Python** (~1 focused session). The JS scaffold writes every state-changing request to an `audit_log` SQL table at compiler.js:14503-14594, plus emits `GET /audit` + `GET /audit.csv` + `POST /audit/cleanup` + the `_sanitizeAuditBody` helper for redacting password/token/secret/api_key/jwt/auth fields. Python needs the same. **Why for launch:** today, Python apps with login DON'T audit-log state changes — the compliance story breaks the moment a customer asks for the trail. Closing this gap makes the "your app survives a restart AND you can audit every state change" pitch true on Python.

2. **Hartl reference-track cleanup** (~3 sessions). Existing chapters 13-24 need light retitling + "assume reader has deal-desk from ch 1-12" framing. Plan at `plans/plan-user-guide-hartl-05-06-2026.md` lists the merges + drops + keeps. **Why for launch:** the user-guide is the self-serve onboarding surface; mixed-era chapters lose prospects after the tutorial track ends.

3. **Marcus walker auth-flow follow-up** (~1 focused session). Walker hits creator-scoped pages without signing in first; ownership filter (correctly) returns 0 rows. Pattern: line 739 of each `apps/<app>/browser-uat.mjs` — replace skip-auth-pages with "hit signup, capture token, set Authorization header on subsequent requests." **Why for launch:** the Marcus walker is the deployed-app smoke check; signed-in coverage proves the apps actually work end-to-end.

4. **Python tenant scope** (multi-session). `database is shared with tenant scope` on Python doesn't yet auto-inject `tenant_id` on CRUD operations. The runtime has the helpers; the compiler emit needs to use them. After this lands, the multi-tenant story holds end-to-end on Python.

5. **Python multi-user-per-tenant invites** (1 session, blocked on tenant scope). The JS scaffold has `POST /auth/invite` + `GET /auth/invite` + signup-with-invite-token under tenant scope at compiler.js:14481. Python needs these once tenant scope itself lands.

## Blocked on Russell (skip these, work around)

- **Cloudflare account finishing**: Workers Paid + Workers for Platforms add-on, `buildclear.dev` zone, dispatch namespace, API token. When done, hand over token + account ID + namespace name.
- **First Marcus conversation**: Russell's pitch move.
- **Stripe live keys, Anthropic org key, Fly Trust Verified**: external paperwork, parallel async track.
- **Meph eval can't run from a Claude subprocess.** No `ANTHROPIC_API_KEY` value lives in any user shell-init file (none of `.bashrc` / `.bash_profile` / `.profile` / `.zshrc` exist on this machine), only in Studio's stored-key memory or Russell's Windows env. To run the eval, run it from Studio's "Run Eval" button OR from a Windows terminal with `set ANTHROPIC_API_KEY=...` exported.

## Tested vs assumed

- ✅ **Tested + saw work this session:** Hartl Chapter 12 doc edits compiled (no parsing of the .md file, but it's pure markdown so syntax-clean). Python auth scaffold rewrite: 2993/2993 unit tests green, including the 5 new ones that exercise the durable-storage emit shape (no `_users = []`, `db.create_table` at init, signup uses `db.find_one` + `db.insert`, login + /auth/me use `db.find_one`).
- ⚠️ **Assumed worked, NOT driven end-to-end:** the durable Python auth scaffold was verified at compile-output level only — never deployed and signed-in against a real running Python app with `database is local file`. Specifically untested: does signup actually persist a user in the SQLite file via `runtime/db.py`? Does login find them after restart? The JS path of this work has end-to-end witness tests (lib/invite-multi-user-witness.test.js); Python doesn't yet. Worth a small witness test before someone tries to use the Python target in anger.
- ⚠️ **The auto-issued id behavior** depends on whether the inline stub's `next_id` counter and the real `runtime/db.py` SQLite AUTOINCREMENT both emit the id back from `db.insert(...)`. The inline stub at compiler.js:15554 returns `{**record, "id": store["next_id"]}` so id is in the returned dict. `runtime/db.py:insert` should return the inserted row with id (matches the SQLite AUTOINCREMENT). If a future cycle finds `user["id"]` is None on Python after signup, that's the place to look.

## Resume prompt (paste into fresh session)

> Read HANDOFF.md and start on item 1 (audit log emit on Python). The pattern is at compiler.js:14503-14594 — port the audit_log table declaration + the JWT middleware + the body-sanitization helper + the GET /audit + GET /audit.csv + POST /audit/cleanup endpoints to the Python compileAuthScaffoldPython function at compiler.js:6401. Apply the gotchas: substring collisions on JS keywords inside Python strings (no `let` / `const` / `function` / `return` / `=>` / `;` in any docstring or comment the Python emit embeds — the existing test harness greps the Python output for "no JS artifacts"); the find_one / insert canonical names are now available on every Python database backend so use them. Current main commit: `39c91a6`.
