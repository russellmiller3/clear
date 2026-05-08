# Handoff — 2026-05-08 (Meph requirements/Ralph loop + UI compiler gates)

## Where you are

- **Branch:** `feature/meph-requirements-ralph-loop`.
- **Latest committed baseline:** `5da2a07 Cap live pattern probe iterations`.
- **Current wrap work:** requirements quality gate tightened, Ralph detector tightened, compiler UI dead-route gates added, pattern-probe artifacts added, capped broad A/B harness added.
- **Paid probe spend:** latest run **$0.43**, running total **$3.34** of the $5 authorization.

## What changed in this wrap

- Complex-app requirements must now be end-to-end before approval unlocks mutation: storage, create/submit, read/list/detail, update/decision actions, roles/routing/rules, and UI reachability when UI matters.
- The server reruns requirement validation on user-approved requirements. Invalid chunky/compound requirements stay unapproved even if the approval ids match.
- The live smoke now stops after the first paid call when requirements are invalid, instead of spending a second build call on junk.
- Ralph no longer treats parenthesized status examples as separate fields.
- Ralph no longer treats `Pending` status alone as manager approval. Approval routing needs manager/VP assignment, queue, role, or approver evidence.
- The compiler now hard-errors internal app calls to missing `/api/...` endpoints and nav/link controls that point at missing pages.
- The broad pattern-probe harness now writes durable per-trial artifacts, revises invalid requirements before spending the build turn, and caps paid Meph build loops at 12 iterations by default (`MEPH_PATTERN_PROBE_MAX_ITER` overrides).

## Live smoke result

The useful result was fail-closed, not "Gemini passed."

- First follow-up Gemini Flash run: 3 chunky requirements, rejected by the tightened quality gate. Cost **$0.39**, total **$1.46**.
- Second follow-up Gemini Flash run: 6 smaller CRUD/lifecycle requirements, compiled cleanly, used screenshot/browser evidence, then Ralph blocked the app because manager approval was only a `Pending` status string. Cost **$0.33**, total **$1.80**.
- Capped broad A/B smoke on `revenue-ops-dashboard-app`: docs-only failed (**42/100**, did not compile); full hook passed (**95/100**, compiled). Cost **$0.43**, total **$3.34**. Artifact folder: `studio/sessions/pattern-probes/2026-05-08T16-15-00-305Z/`.

That is the right product behavior: Meph can build a plausible app, but Ralph refuses false done when the app has no real approval assignment/queue.

## Tests run

- `node clear.test.js` — **3024/3024 passing** after the compiler UI gates.
- Earlier in this wrap: requirements contract, requirements audit, live-smoke harness, and Studio server tests all passed after the gate changes.

## Next critical path

1. Run at most two more capped broad-app A/B pairs under the remaining budget, then stop and summarize. Do not run the full seven-app suite unless Russell raises the cap again.
2. Next feature lane: expand compiler-owned UI failures beyond static route checks into generated browser-walker failures for accordions, button event wiring, modal open/close, and layout overflow.
3. Promote browser/state evidence into the pattern-probe artifacts so the harness can score actual app behavior, not only source shape.

---

# Handoff — 2026-05-07 (marathon session, 9 commits, three Python parity gaps closed)

## Where you are

- **Branch:** `main`. WIP=0. Working tree: untracked `playground/` only (longstanding noise — old folder, real code lives in `studio/`).
- **Last commit:** `0589d44` docs(user-guide): drop stale Appendix + replace empty What's Next.
- **Tests:** 3006/3006 green at last full run.
- **Critical-path standing:** Python parity epic — three of the five launch-relevant gaps closed this session (durable user accounts, audit log emit, tenant scope auto-injection). Hartl tutorial track is fully shipped (Chapters 1-12); reference-track cleanup has started (2 small prunes done, ~5-6 chapters of light rewrite remaining).

## What this session shipped (9 commits on main, all pushed)

1. **`94413cf`** — Hartl Chapter 12 (the agent's ship). Provable business rules + `clear prove` + audit PDF. Renamed the existing Chapter 12 (Security) to Chapter 25 to avoid the duplicate-heading collision.
2. **`7019b5b`** — Hartl FEATURES + FAQ pass on Chapters 6, 8, 12. Added the audit-log subsection to Chapter 12, the "audit log for free" mention to Chapter 8, and the sensitive-fields side note to Chapter 6.
3. **`d0d5222`** — Python inline `_DB` stub method-name harmonization. The stub now exposes `find_all` / `find_one` / `insert` alongside the legacy names (delegation). Unblocks the auth scaffold rewrite that follows.
4. **`39c91a6`** — Python auth scaffold uses durable user storage. The `_users = []` list is gone. `db.create_table("_auth_users", ...)` at scaffold init; `db.find_one` + `db.insert` in signup / login / `/auth/me`.
5. **`c63c92b`** — Mid-session handoff update.
6. **`5a790e0`** — Python audit log emit. `audit_log` SQL table, body-sanitization helper, FastAPI `@app.middleware("http")` capturing every state-change, `GET /audit` + `GET /audit.csv` + `POST /audit/cleanup`, 90-day retention with `AUDIT_RETENTION_DAYS` env var.
7. **`973eb14`** — Python tenant scope auto-injection on CRUD. Lookup wraps with `tenant_id`, insert stamps `tenant_id`, update on `:id` switches to 3-arg form with `tenant_id` in WHERE, remove includes `tenant_id` in filter. Composes with creator policy.
8. **`6139145`** — Hartl reference cleanup pass 1. Dropped Chapter 20.5 (Ship It) — duplicate of Chapter 18. ~90 lines pruned + TOC entry removed.
9. **`0589d44`** — Hartl reference cleanup pass 2. Dropped stale Appendix (Meph tool list — already in Studio docs); replaced empty `What's Next?` heading with a tight `You Did It` closing beat. Net -47 lines.

## Python parity status — 3 of 5 launch-relevant gaps closed

| # | Gap | Status |
|---|-----|--------|
| 1 | Durable user accounts on Python | ✅ shipped commit `39c91a6` |
| 2 | Audit log emit on Python | ✅ shipped commit `5a790e0` |
| 3 | Multi-customer separation (tenant scope) | ✅ shipped commit `973eb14` |
| 4 | AI assistant calls on Python (`ask claude`, agents, workflows) | ❌ remains — Anthropic SDK plumbing on Python is the biggest single chunk |
| 5 | Optimistic-lock on Python | ⚠️ probably already shipped (commit `a91fedd` from yesterday) — needs ~5 min audit verification |

The audit script reports 5 HIGH-severity NodeType gaps still. Some are likely false positives (script's slice-detection misses shared handlers — the audit fix from yesterday only handled some patterns). Worth re-running the audit and triaging the remaining 5 manually next session.

## Hartl status — tutorial DONE, reference cleanup ~5-6 chapters left

- Tutorial track Chapters 1-12: **fully shipped this session**.
- Reference track:
  - **Dropped:** Chapter 20.5 (duplicate of 18), Appendix (stale Meph reference).
  - **Still to drop / merge:** Chapter 6.5 → fold into Ch 6 expanded; Chapter 11 (Making It Pretty) → fold into Ch 7 expanded; Chapter 19b → fold into Ch 9; Chapter 21 (Policies) → fold into Ch 12; Chapter 8 (Multi-Page Apps) → drop, covered by Ch 7; Chapter 10b (Chat Interfaces) → keep, NOT a duplicate of Ch 11 (chat is conversational, drafter is one-paragraph summary).
  - **Light rewrite remaining:** Chapters 13, 13b, 14, 15, 16, 16b, 17, 19, 19c, 22, 23, 24, 24b — each needs a "this assumes you have deal-desk from Chapters 1-12" opening sentence + a syntax-currency check against current SYNTAX.md.
  - Plan: `plans/plan-user-guide-hartl-05-06-2026.md` (note chapter numbers in the plan are stale relative to where Security ended up after the agent's renumber; treat as guidance, not law).

## Next session — priority order

1. **AI assistant calls on Python** (~1 focused session). The biggest remaining Python parity gap. `ask claude` + `agent` + `workflow` primitives don't yet emit real Anthropic API calls on Python. The runtime helper `_ask_ai` already exists in `compileToPythonBackend` (line ~15812 — seen during this session's audit log work) but the AGENT / WORKFLOW node-type handlers may not be wired. Read the JS pattern at `compileToJSBackend` for `NodeType.AGENT` and `NodeType.WORKFLOW`; mirror on Python. **Why for Marcus:** the AI drafter from Chapter 11 is the most visible value-prop; if a customer picks Python and `ask claude` doesn't emit, the demo breaks immediately.

2. **Verify optimistic-lock on Python is actually wired** (~5 min). Yesterday's commit `a91fedd` says it shipped. The audit still flags it. One of the two is wrong. Re-run `node scripts/python-parity-audit.mjs` and inspect — if false positive, fix the audit's slice detection; if real gap, port the JS pattern.

3. **Hartl reference-track light rewrites** (~3 sessions, ~30-45 min per chapter). Pick a batch (suggest Chapters 13, 13b, 14 for one session; 15, 16, 16b, 17 for another; 19/19c/22/23/24/24b for a third).

4. **Marcus walker auth-flow** (~1 focused session). Walker hits creator-scoped pages without signing in first; ownership filter (correctly) returns 0 rows. Pattern: line 739 of each `apps/<app>/browser-uat.mjs` — replace skip-auth-pages with "hit signup, capture token, set Authorization header on subsequent requests."

5. **Multi-user-per-tenant invite endpoints on Python** (~1 session). The JS scaffold has `POST /auth/invite` + `GET /auth/invite` + signup-with-invite-token. Now that Python tenant scope is wired, this is the natural follow-up.

## Blocked on Russell (skip these, work around)

- **Cloudflare account finishing**: Workers Paid + Workers for Platforms add-on, `buildclear.dev` zone, dispatch namespace, API token. When done, hand over token + account ID + namespace name.
- **First Marcus conversation**: Russell's pitch move.
- **Stripe live keys, Anthropic org key, Fly Trust Verified**: external paperwork, parallel async track.
- **Meph eval can't run from a Claude subprocess.** No `ANTHROPIC_API_KEY` value lives in any user shell-init file (none of `.bashrc` / `.bash_profile` / `.profile` / `.zshrc` exist on this machine), only in Studio's stored-key memory or Russell's Windows env. To run the eval, run it from Studio's "Run Eval" button OR from a Windows terminal with `set ANTHROPIC_API_KEY=...` exported first.

## Tested vs assumed

- ✅ **Tested + saw work this session:** all 13 new tests on Python parity green at compile-output level. 3006 / 3006 unit tests green. Five committed pushes through the pre-commit hook (which runs the full compiler test suite). Hartl chapter edits all on doc-only commits using `--no-verify` per the doc-only rule.
- ⚠️ **Assumed worked, NOT driven end-to-end on Python:** the durable user storage, audit log middleware, and tenant scope injection are verified at compile-output level only. Nobody has booted a real Python app with `database is local file` and signed in / hit `/audit.csv` / written-then-read across two tenants. The JS path of each has end-to-end witness tests (`lib/invite-multi-user-witness.test.js`, `runtime/db-postgres-rls.test.js`); Python doesn't yet. Worth a small witness suite before someone tries to use the Python target in anger.
- ⚠️ **The auto-issued id behavior** depends on whether the inline stub's `next_id` counter and the real `runtime/db.py` SQLite AUTOINCREMENT both emit the id back from `db.insert(...)`. The inline stub at compiler.js:15554 returns `{**record, "id": store["next_id"]}`. `runtime/db.py:insert` should return the inserted row with id (matches SQLite AUTOINCREMENT). If a future cycle finds `user["id"]` is None on Python after signup, that's the place to look.
- ⚠️ **Python audit middleware reads body before `call_next`.** Starlette caches body on first read, so the handler can still consume it via `await request.json()`. This is the documented FastAPI pattern but worth confirming against a real Python app the first time someone uses it. If body shows up empty in handlers, look at the `request._body` cache.

## Resume prompt (paste into fresh session)

> Read HANDOFF.md and start on item 1 (AI assistant calls on Python). The runtime helper `_ask_ai` already exists in compileToPythonBackend (line ~15812). The gap is the AGENT and WORKFLOW node-type handlers — they don't yet wire the helper into compiled Python apps. Mirror the JS scaffold's `compileToJSBackend` AGENT/WORKFLOW patterns. Apply the gotchas from learnings.md: substring collisions on JS keywords inside Python strings (no `let` / `const` / `function` / `return` / `=>` / `;` in any docstring or comment the Python emit embeds), the find_one / insert canonical names are now available on every Python database backend so use them. Current main commit: `0589d44`.
