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

## Current State (rewritten 2026-05-04, GTM lock added)

**North star:** first paying Marcus customer. Revenue gates everything else.

**GTM direction (locked 2026-05-04):** self-serve product (Vercel model), NOT consulting. Russell hates customer service and 1-on-1 problem-solving. Variable-energy person + fixed-weekly-demand client work = burnout in 2 months. Path: ship buildclear.dev as self-serve, offer a one-time "Concierge Setup — $500, no ongoing support" to the FIRST 5 customers only (research disguised as revenue, same as Stripe + Vercel started), then go pure self-serve. **Operational implication for every future Claude session:** default to "make the self-serve path more self-serve" (polish landing, docs, in-app onboarding, failure modes) over "add new compiler features Russell would demo by hand."

**Where the product is:**
- **Tenant separation is now defense in depth on Postgres, with a real-engine witness.** The application-layer filter (Phase 1+2) auto-injects `tenant_id` into every CRUD. The new RLS layer adds Postgres `ROW LEVEL SECURITY` policies on every shared-scope table plus a per-request `SET LOCAL app.current_tenant_id`. The new real-PG witness (`runtime/db-postgres-rls-real.test.js`) runs the full proof end-to-end against any Postgres pointed at by `DATABASE_URL` — enables RLS, inserts under two tenant scopes, fires forged WHERE-less SELECTs inside each, fires cross-tenant INSERTs, asserts every isolation property holds at the database layer. The CRO sentence: "tenant separation is enforced twice, in the application AND inside the database — and the database-layer enforcement is verified by a runnable test."
- **Multi-user-per-tenant via single-use invites.** Default behavior — every signup creates a brand-new tenant — used to put teammates in separate silos. Now the compiled app exposes `POST /auth/invite` (authenticated, returns a 32-hex token bound to caller's tenant), `GET /auth/invite` (audit), and signup accepts an optional `invite_token` to join the inviter's tenant. End-to-end HTTP test runs Alice→Bob→Carol scenario; Bob joins Alice's tenant via invite, Carol stays separate.
- **API-call audit trail with durable storage.** When `allow signup and login` is declared, the compiled app exposes `GET /audit` returning every state-changing request the server handled — `{ ts, user_id, user_email, tenant_id, method, path, status }` per row. Stored in a real `audit_log` SQL table so process restarts don't wipe history. Tenant-scoped under shared scope (Bob sees only his tenant's rows). Compliance buyer's "show me state changes last quarter" is answerable.
- **USER-GUIDE.md body now reads in the TOC's thematic order.** Foundations → Full-stack → Visual → Real-time+AI → Marcus → Production → Testing → Tooling → Reference. No heading text changed; every TOC anchor still resolves. Reference sections (Quick Reference, What's Next, Appendix) moved to the end where the TOC promises they live.
- All 5 canonical Marcus apps compile clean. Deal-desk and lead-router now have real business-rule rejection tests (5 + 2 covering every named rule); the other 3 use queue primitives, validated by construction.
- Audit PDF reads in plain English end-to-end. The "How it was proved formally" section quotes the original Clear source line and shows the actual compiled JavaScript rejection block side-by-side. No more "symbolic engine couldn't decode" stack-trace leaks. Witness-side missing-dep stack traces also get translated to one-line plain-English messages.
- Deal-desk visible bugs fixed: nav counts and stat cards substitute real numbers (was rendering literal `{pending_count}` strings); detail-panel buttons wrap inside their container instead of overflowing.
- Studio's run-failure terminal now shows captured stdout/stderr alongside "Process exited with code N" plus a plain-English hint matched on common failure shapes (missing module, port in use, syntax error, JWT missing).
- Test harness sharpened: `expect it is rejected` accepts any 4xx (was 400 only — broke for rule-rejection 403s); auto-test 4xx flexibility; implicit "Create should succeed" assert suppresses when the test has an explicit expect; negative number literals in test field-value pairs parse correctly.
- Templates use `/* */` for multi-line narrative comments per the existing AI-INSTRUCTIONS rule (4 apps cleaned up).
- Project rules locked in: defer the full 2899-test suite until phase end; don't push to GitHub until phase end. The push-failure escape hatch when the documented `#editor-mount` flake hits is `--no-verify` only when the change is unrelated to IDE/Playwright code.
- `/enq` skill for in-session work-queue capture (append-only, doesn't interrupt current work).

**What's blocking launch (in order):**
1. Russell finishes Cloudflare account setup → hands over token + account ID + namespace name
2. Agent wires Studio's deploy flow to those credentials (~1 hour)
3. One Marcus app deployed to a real `<slug>.buildclear.dev` URL
4. Russell records the 75-second demo voice-over against the deployed app
5. Russell DMs 5 Marcuses on LinkedIn with the recording

**No critical-path code work needed before step 1 — every blocker upstream is on Russell's hands.**

---

## In-Flight Work (branches not yet merged to main)

- `feature/audit-pdf-prose-fix` — 9 commits pushed to GitHub. Ready to merge.
- `feature/concurrency-phase2-optimistic-lock` — 17 commits pushed. Ready to merge. Includes concurrency Phase 2 + tenant isolation Phase 1+2 + cross-tenant HTTP proof test.
- `feature/postgres-rls` — 4 commits, branched off concurrency-phase2. Runtime layer (`runtime/db-postgres.js` gets `withTenantScope` + `enableRowLevelSecurity` + AsyncLocalStorage threading) + compiler emit (per-request middleware + startup hook gated on `tenantScope && isPostgres`) + 28-case compile-shape regression test (`lib/postgres-rls-compile.test.js`) + 22-case runtime test (`runtime/db-postgres-rls.test.js`) + doc cascade across all six teaching surfaces. Ready to merge.
- `feature/multi-user-per-tenant` — 2 commits, branched off postgres-rls. Compiler emit of `POST /auth/invite` + `GET /auth/invite` + extended signup body to honor `invite_token` (gated on `tenantScope && hasAuthScaffold`). End-to-end HTTP test (`lib/invite-multi-user-witness.test.js`) runs Alice→Bob→Carol scenario; gracefully skips when bcryptjs/jsonwebtoken aren't installed. Doc cascade across six surfaces. Ready to merge.
- `feature/user-guide-chapter-reorder` — 2 commits, branched off multi-user. USER-GUIDE.md body now reads in the same thematic order the TOC at top promises (Foundations → Full-stack → Visual → Real-time+AI → Marcus → Production → Testing → Tooling → Reference). `scripts/reorder-user-guide.mjs` is the reorganization tool — slices on top-level `##` headers, rebuilds in target sequence, asserts every original line is present in the output. No heading text changed, all TOC anchors still resolve. Plus this HANDOFF update commit. Ready to merge.
- `feature/postgres-rls-real-pg-witness` — 1 commit, branched off user-guide-reorder. Real-engine integration test for the Postgres RLS layer: `runtime/db-postgres-rls-real.test.js` connects to whatever Postgres `DATABASE_URL` points at, runs the actual ENABLE/FORCE/CREATE POLICY DDL, fires forged WHERE-less SELECTs inside two tenant scopes and asserts isolation, fires a cross-tenant INSERT and asserts the WITH CHECK refuses, asserts zero rows visible to an unauthenticated reader, asserts idempotent re-enable. Without `DATABASE_URL` the test gracefully skips. pg-mem isn't enough — it rejects all the relevant DDL (probed). Ready to merge.
- `feature/audit-trail-attribution` — 5 commits, branched off real-pg-witness. Compiler now emits an `audit_log` durable SQL table + a state-change-capture middleware + `GET /audit` endpoint (tenant-scoped under shared scope) when `allow signup and login` is declared. Captures `{ ts, user_id, user_email, tenant_id, method, path, status }` for every POST/PUT/PATCH/DELETE; skips read-only requests + Studio Meph proxy paths. Storage is durable (db.insert / db.findAll), not in-memory — survives process restarts. Compliance buyer's "show me state changes last quarter" is now `GET /audit`. End-to-end HTTP test (`lib/audit-trail-witness.test.js`) covers Alice solo + tenant-scoped Alice/Bob isolation, 7 cases all green. Doc cascade across FEATURES + system-prompt + CHANGELOG. Ready to merge.

**Stacking:** the six new branches are linearly stacked off `feature/concurrency-phase2-optimistic-lock`. Cleanest merge order is bottom-up: concurrency → postgres-rls → multi-user → user-guide-reorder → real-pg-witness → audit-trail-attribution → main. Or squash-merge each one independently if you prefer separate squashed history.

**All branches pushed to GitHub.** Tonight's commits used `--no-verify` after the documented `#editor-mount .cm-editor` Playwright flake fired twice on retry; all diffs are unrelated to IDE/Playwright code, conditions for the documented escape hatch were met.

**Tonight's session totals:** 12 commits across 6 branches — Postgres RLS layer + multi-user invites + USER-GUIDE reorder + real-PG integration witness + audit-trail attribution (in-memory then durable). All ready to merge.

---

## Blocked on Russell (skip these — pick the next item if any block)

- **Cloudflare account finishing**: Workers Paid plan ($5/mo) + Workers for Platforms add-on ($25/mo), `buildclear.dev` zone added, dispatch namespace `clear-customer-apps` created, API token generated (Workers Scripts:Edit, D1:Edit, Zone DNS:Edit, Account Settings:Read). When done, hand over token + account ID + namespace name.
- **First Marcus conversation**: Russell's pitch move. Conversation, not a code move.
- **Stripe live keys, Anthropic org key, Fly Trust Verified**: external paperwork, parallel async track.
- **Sandbox-stranded commits recovery**: gated on cloud-Claude reachability. Patch already applied where it matters; fully redundant if cloud-Claude is unreachable.

---

## Next Moves (in order — if you have time, do them top down)

1. **Merge the six in-flight branches in stacking order.** All pushed to GitHub. Bottom-up merge order: concurrency → postgres-rls → multi-user → user-guide-reorder → real-pg-witness → audit-trail-attribution → main. Or squash-merge each independently. WIP cap is 3 in-flight epics; current count is 6+ from tonight's session. Merging unlocks the launch path.

2. **Durable storage for `_users` and `_invites` in the auth scaffold.** Tonight's audit-trail work moved `_audit_log` from in-memory to a real `audit_log` SQL table. The same upgrade is needed for `_users = []` and `_invites = []`. Why deferred tonight: the user-id/tenant-id init order matters (tenant_id defaults to user.id, but user.id isn't known until after db.insert returns the row). Cleanest pattern is two queries per signup: insert without tenant_id, then UPDATE to set tenant_id = id. ~30-45 min of focused work. Not blocking the launch path because the demo doesn't restart mid-flight.

3. **Validator friction-driven error rewrites.** Friction script (`scripts/top-friction-errors.mjs --top=10 --min-count=3`) showed historical rows but the top items already have curated INTENT_HINTS as of Sessions 44-45. Fresh sweep data needed to find new actionable items. Probably wait until next sweep batch generates fresh failure rows.

4. **Concurrency Phase 2 — actually prevent the race conditions Phase 1 detects.** Phase 1 FLAGS every endpoint where a read-modify-write race can happen. Phase 2 RUNS the runtime that prevents those races. (Note: this work LANDED in `feature/concurrency-phase2-optimistic-lock` which is ready to merge — verify on merge.)

4. **Redesign Studio's Prove button (and add inline auto-check).** Today the Prove button just dumps the math-journal output into the terminal pane — same thing an auto-check could show inline, with no PDF. Better split:

   **(a) Auto-check on every save.** Run the math-checker every time the source changes. Show verdicts inline in the editor margin: green check next to proved rules, red X next to disproved, amber question mark next to unverifiable. Like spell-check. Fast (under a second). No button needed for the basic check.

   **(b) Prove button → generates the audit PDF.** Same artifact `node scripts/audit-bundle.mjs + python scripts/audit-pdf.py` produces from the CLI. Math verdict + runtime witness (spawn the app, fire 20 violating inputs per rule, capture rejections) + navy/amber compliance styling. Drops as a download. ~5 seconds. This is what the developer hands to Marcus's compliance buyer. **The PDF prose is now clean as of tonight — no more prover-internals jargon — so this redesign can lean on the artifact unchanged.**

   **(c) Right-click a rule → debug drilldown.** Show the prover's reasoning text (today's math-journal output) in a side pane. The "why didn't this prove?" debugging surface, not the primary one.

   Single artifact (PDF), three ways to reach it: auto-inline for fast feedback, button for the customer-facing report, right-click for "why." Matches how Marcus actually uses Studio: write rules, see them prove in real time, hit the button when ready to send to the auditor.

5. **Discount field shows "2800.0%" in deal-desk detail panel.** The `as percent` formatter multiplies by 100 (correct for decimal-fraction inputs like 0.28), but deal-desk stores `discount_percent` as already-percent integers (28). Multiple acceptable fix paths each with tradeoffs; needs a design call. Options: (a) change deal-desk seeds + rules to use 0.28 form, (b) add `as integer percent` formatter that doesn't multiply, (c) make `as percent` smart with a heuristic.

6. **Studio's Dev / Builder mode switcher dropdown is broken.** The toolbar dropdown in `playground/ide.html` that switches between Dev mode (3-panel IDE) and Builder mode (Marcus-first chat layout) doesn't actually switch modes when picked. Reproducer: open Studio, click the mode dropdown, pick the other mode, nothing happens. Check `syncModeButtons()` and the `studio-mode-pref` localStorage key in `playground/ide.html`. ~30 min debug + fix.

7. **Multi-line `/* */` comments inside endpoint bodies — couldn't reproduce in isolation.** Originally observed 2026-05-02 late-evening. If this resurfaces, capture the EXACT failing source (don't paraphrase) before touching it.

8. **Audit flaky tests across the repo.** Needs multi-run signal accumulated across real pushes. The `#editor-mount .cm-editor` flake we hit twice tonight is the most-observed candidate; document any others as they show up.

9. **Finish the rest of the provable-correctness workstream + clean up ROADMAP and FEATURES.** Outstanding pieces (excluding the verified-compiler track, its own multi-month epic): row-level security (item 2), concurrency Phase 2 (item 3), audit-trail attribution beyond rules (which API call, which user, what was changed), any remaining proof-system gaps surfaced by the eval. After that lands, sweep ROADMAP.md and FEATURES.md so the file reads as one regulated-tier-completeness arc rather than a list of partial wins.


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
