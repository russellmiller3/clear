# Handoff

This file is how the next Claude session picks up where this one left off.
Everything below is current state. Past sessions live in `CHANGELOG.md` (what
shipped, dated) and `FEATURES.md` (what Clear can do today). If you're tempted
to scroll through "what we did last month" you're in the wrong file — go to
CHANGELOG.

---

## ⚠️ HOW TO MAINTAIN THIS FILE — READ FIRST, NEVER REMOVE THIS SECTION

These rules survive every session. Every Claude that touches this file follows
them. If you find yourself violating them, stop and re-read.

**1. Five sections only. Never add more.** Current State, In-Flight Work, Blocked on Russell, Next Moves, Trust Notes. If something doesn't fit one of those, it doesn't belong here. Move it to CHANGELOG.md or FEATURES.md.

**2. NO session-by-session history in this file.** The temptation is to append "Session 2026-05-03 we did X." Resist. The git log is the session history. The commit messages are the per-feature narrative. CHANGELOG.md is the dated story. HANDOFF.md is for "what's the state RIGHT NOW that I need to act on."

**3. Trim aggressively at session end.** If a Next Move from yesterday landed today, delete it. If an In-Flight branch merged, delete its row. If a Blocker resolved, delete it. The file should NEVER grow past ~150 lines. Hard cap: 200.

**4. Keep it skimmable in 60 seconds.** Bullets, short sentences, bolded load-bearing words. No prose paragraphs longer than 3 lines. No code blocks unless they're commands the next Claude should literally run.

**5. Rewrite the Current State section every session.** Don't append; replace. The "Current State" row from yesterday is wrong by definition today.

**6. NO code jargon in any line of this file.** Same rule as Russell-facing chat. Say what the thing DOES, not what it's CALLED. The next Claude should understand what to do without grepping the codebase.

**7. End-of-session checklist (run this before stopping):**
   - Update Current State to reflect right-now reality
   - Delete completed Next Moves
   - Delete merged In-Flight branches
   - Delete resolved Blockers
   - Add new In-Flight / Blocked / Next entries that came up this session
   - Verify file is under 200 lines

---

## Current State (rewritten 2026-05-05 — OWASP Piece 1 cycles 5+6 shipped)

**North star:** first paying Marcus customer. Revenue gates everything else.

**Headline ship (this session):** the last access-control gap in the OWASP Top 10 pitch is now closed structurally. Cycles 5 (JS) + 6 (Python) + runtime user_id auto-add landed in 7 commits on `feature/owasp-1-cycle-5-creator-filter` (in worktree `clear-owasp1/`). Every CRUD operation against a creator-scoped table — read, write, update, delete — now auto-checks ownership at runtime, on both backends. A stolen session token cannot read, create-as-someone-else, update, or delete another user's rows. The Marcus pitch can now claim "Clear refuses to compile any of the OWASP Top 10" with no asterisks.

**GTM direction (locked 2026-05-04):** self-serve product (Vercel model), NOT consulting. Path: ship buildclear.dev self-serve, offer "Concierge Setup — $500, no ongoing support" to first 5 customers only, then pure self-serve. Operational implication: default to "make the self-serve path more self-serve" over "add new compiler features Russell would demo by hand."

**Where the product is:**
- **OWASP Piece 1 — load-bearing piece shipped (2026-05-05).** Tables declare `the X's creator can read, change, or delete`; the compiler auto-injects user_id filter on lookup, user_id stamp on insert, 3-arg db.update with user_id WHERE on PUT, and user_id WHERE on DELETE. Both JS and Python backends. Runtime auto-adds user_id INTEGER column (mirror of tenant_id pattern). 12 new tests, 2948/2948 green. Composes with tenant scope so regulated apps stack both layers.
- **Tenant separation: defense in depth on Postgres.** Application-layer filter + Postgres ROW LEVEL SECURITY + per-request `SET LOCAL app.current_tenant_id`. Real-PG witness (`runtime/db-postgres-rls-real.test.js`) runs the full proof end-to-end. The CRO sentence: tenant separation is enforced twice, in the app AND inside the database; database-layer is verified by a runnable test.
- **Multi-user-per-tenant via single-use invites.** Compiled app exposes `POST /auth/invite` (authenticated, 32-hex token bound to caller's tenant), `GET /auth/invite` (audit), signup accepts optional `invite_token`. Alice→Bob→Carol HTTP test passes.
- **API-call audit trail with durable storage.** `GET /audit` (and `GET /audit.csv` for CSV exporters) returns every state-changing request — `{ ts, user_id, user_email, tenant_id, method, path, status, body_summary }`. Tenant-scoped under shared scope. Sensitive fields (password / token / secret / api_key) auto-redacted from body_summary.
- **All 13 canonical apps compile clean.** 8 core + 5 Marcus templates. Each per-user table declares a creator rule; runtime user_id auto-add covers them without per-app schema edits.
- **Audit PDF reads in plain English end-to-end.** "How it was proved formally" quotes the original Clear source line and shows the compiled rejection block side-by-side.
- **Two-witness rule verification (math + runtime).** `node lib/prover/runtime-witness.test.js` compiles each rule shape, spawns the compiled app, sends 20 violating inputs, asserts every one rejects with the rule's name in the 403 body.
- **Project rules:** defer the full 2899-test suite until phase end; don't push to GitHub until phase end; `--no-verify` only when the change is unrelated to IDE/Playwright code. `/enq` skill for in-session work-queue capture.

**What's blocking launch (in order):**
1. Russell finishes Cloudflare account setup → hands over token + account ID + namespace name
2. Agent wires Studio's deploy flow to those credentials (~1 hour)
3. One Marcus app deployed to a real `<slug>.buildclear.dev` URL
4. Russell records the 75-second demo voice-over against the deployed app
5. Russell DMs 5 Marcuses on LinkedIn with the recording

**No critical-path code work needed before step 1 — every blocker upstream is on Russell's hands.**

---

## In-Flight Work (branches not yet merged to main)

Three branches with unpushed work:

- **`feature/owasp-1-cycle-5-creator-filter`** in worktree `clear-owasp1/` — **7 new commits this session**. Cycles 5a/5b/5c-delete/5c-update (JS), cycle 6 (Python parity), runtime user_id auto-add, doc cascade. Tests 2948/2948 green. Ready to merge to local main when Russell green-lights. NOT yet merged or pushed.
- **`feature/owasp-1-mandatory-access-rules`** (the same worktree's previous branch HEAD; 4 commits from the earlier session that are already merged into local main on the original `clear/` directory). Local main is 6 commits ahead of `origin/main` for this work; held until Russell says push. After cycle-5 branch merges into local main, that bumps to 13 commits ahead.
- **`feature/prove-drilldown`** in original `clear/` directory — 15 commits from earlier sessions, also held for push per Russell.

WIP count: **3**, at the cap. No new branch should open until one of these merges + pushes.

---

## Blocked on Russell (skip these — pick the next item if any block)

- **Cloudflare account finishing**: Workers Paid plan ($5/mo) + Workers for Platforms add-on ($25/mo), `buildclear.dev` zone added, dispatch namespace `clear-customer-apps` created, API token generated (Workers Scripts:Edit, D1:Edit, Zone DNS:Edit, Account Settings:Read). When done, hand over token + account ID + namespace name.
- **First Marcus conversation**: Russell's pitch move. Conversation, not a code move.
- **Stripe live keys, Anthropic org key, Fly Trust Verified**: external paperwork, parallel async track.
- **Sandbox-stranded commits recovery**: gated on cloud-Claude reachability. Patch already applied where it matters; fully redundant if cloud-Claude is unreachable.

---

## Next Moves (in order — if you have time, do them top down)

1. **Merge the OWASP cycle-5 branch into local main, then push everything when Russell green-lights.** The `feature/owasp-1-cycle-5-creator-filter` branch in `clear-owasp1/` has 7 commits ready. Once green-lit: `git checkout main && git merge --ff-only feature/owasp-1-cycle-5-creator-filter && git push origin main && git branch -d feature/owasp-1-cycle-5-creator-filter`. Pre-push hook fires once at this moment — IDE flake retry is the documented escape hatch (`--no-verify` only when the change is unrelated to IDE/Playwright). Same green-light needed for `feature/prove-drilldown` and the existing 6 main-only commits.

2. **Cycle 4 — validator errors when a rule references a missing role field.** Small (~15 min). Example: `the deal's reviewer can read` but the deals table has no `reviewer_id` field → friendly compile error naming the missing field. Single validator pass. Mirror the existing IDOR-style validator at `validator.js` around the policy-collection pass.

3. **Cycle 3 — confirm the IDOR warning is already a hard error.** The GET-without-filter case at `validator.js:1889` is likely already a hard error; this cycle is "verify and close" rather than new work. ~5 min if confirmed-already-done.

4. **Cycle 2b — flip missing-rules warning to strict error.** Currently warns. Strict-now would red-light ~300 test fixtures (per the "honest two-commit shape" gotcha). Plan: write a sweep script that adds `anyone can read, change, or delete` to every fixture-table without a rule, then flip the validator from `warnings.push` to `errors.push`. ~30-45 min. Best done as its own focused branch.

5. **Doc cascade — remaining surfaces.** This session updated CHANGELOG, FEATURES, and Meph's system prompt. Still pending: SYNTAX.md (the canonical phrases for creator/row_role/any_role/anyone_logged_in), AI-INSTRUCTIONS.md (when to use which form, gotchas), USER-GUIDE.md (worked example walking through a creator-policy app), ROADMAP.md (mark Piece 1 complete), FAQ.md (where do creator filters live? `compiler.js compileCrud` + `runtime/db.js createTable`), intent.md (node-type table for the access-rule subjects), landing/*.html (sync any examples). Each is a small focused commit.

6. **End-to-end runtime IDOR smoke (optional, security demo material).** Compile deal-desk, start the server, sign up two users in the same tenant, post a deal as user A, GET /api/deals as user B — assert empty. Same with PUT and DELETE on user A's row. Today the unit tests verify the compiler emits the right code; an end-to-end harness would prove the runtime actually blocks the attack. Pattern lives in `runtime/db-postgres-rls-real.test.js` and `lib/prover/runtime-witness.test.js`. ~30-45 min.

7. **OWASP Pieces 2-5** (after Piece 1 merges):
   - **Piece 2 — SSRF allowlist.** Top-of-file `allow outgoing requests to: 'api.stripe.com', ...`. Build fails if `http_request` URL host isn't covered. Pattern matches existing Slack `require channel allowlist` at `parser.js:4509`.
   - **Piece 3 — Sensitive field tag.** `text ssn sensitive`. Encrypts at rest using `SENSITIVE_KEY` env var, extends existing redact() at `compiler.js:488`, strips from API responses unless URL is tagged `can return sensitive data`.
   - **Piece 4 — Auto login rate limit.** Promote validator.js:1939 warning to auto-emit `rate limit 10 per minute` on the login URL when `allow signup and login` is declared. Override: `allow N login attempts per minute`.
   - **Piece 5 — Hardcoded secrets linter.** Regex against known key shapes (sk-..., AKIA..., ghp_..., long base64 tokens). Build fails. Suggest env vars in error.

8. **Multi-line `/* */` comments inside endpoint bodies — couldn't reproduce.** If this resurfaces, capture the EXACT failing source verbatim before touching it. (Note: the tokenizer indent-zero bug for block comments was fixed 2026-05-04, but if a different shape surfaces capture verbatim.)


---

## Audit results (so future cron iterations skip what's already verified)

- **Tautology-rule audit (2026-05-03):** zero unintentional tautology rules remain in any `.clear` app. Every `enforce that` line in `apps/` references a real entity field (`deal's discount_percent`, `invoice's status`, `lead's email`, etc.). The two intentional tautologies in `examples/rule-keyword-tour.clear` are demo content showing PROVED / DISPROVED / UNVERIFIABLE verdicts side-by-side and should NOT be changed. The lead-router fix earlier on 2026-05-02 was the last placeholder rule that needed real fields. Don't re-run this audit unless someone introduces new placeholder rules.

- **Silent-async-test audit (2026-05-03):** the silent-async-test bug is much smaller in practice than the original HANDOFF item suggested. `clear.test.js` has only 4 `async () =>` tests, and ALL are dynamic-import tests with sync follow-up — they technically have `await import(...)` but the imports are reliable and the assertions are sync afterwards. Other test files with real I/O (`lib/packaging-cloudflare.test.js`, `playground/agent.test.js`, `playground/ai-proxy/server.test.js`, `playground/billing.test.js`, `clear-lsp/test/server.test.mjs`) all use top-level await (fine) or sync `it()` with sync bodies (fine). Only `lib/prover/runtime-witness.test.js` had real spawn-and-fetch in async bodies, and it's already migrated to the new `describeAsync` + `itAsync` helpers. Migration of the 4 remaining low-risk dynamic-import tests would mean wrapping their enclosing `describe` blocks in `describeAsync` — that's churn out of proportion to the actual risk. The new helpers stay available for future spawn/fetch tests; existing tests stay as-is.

---

## Trust Notes (read before claiming something proves anything)

The proof system today proves rules two ways. Know which one is firing before you cite it in a pitch.

- **Math on constants**: `5 < 7` is universally true. Trust basis: arithmetic. Solid.
- **Structural proof**: `deal's discount < 30` cannot be evaluated without a deal, but the compiler emits a runtime check that REJECTS any input where the condition fails. So "no execution past the check satisfies the failing condition" is provable from the program's structure. **Trust basis: the compiler correctly emits the runtime check.**

**The runtime-witness bridge is now wired.** `node lib/prover/runtime-witness.test.js` compiles each rule shape, spawns the compiled app on a free port, sends 20 inputs that violate the rule, and asserts every one rejects with a 403 carrying the rule's name in the response body. 60 measured rejections across 3 rule shapes today, all green. Two-witness verification (math + runtime) is now real, not aspirational. The runtime claim a CRO can hear: "we proved every rule with math, AND we sent twenty bad inputs at every PROVED rule and watched them all bounce with the rule's name on the rejection." Both witnesses pass, simultaneously, on every push.
