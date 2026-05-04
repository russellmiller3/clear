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

**Empty.** All previously-listed branches are merged into `origin/main` or deleted. Verified 2026-05-04 by walking the remote and asking `git merge-base --is-ancestor` for every branch the prior HANDOFF named. WIP count: **0**, well under the cap of 3. Net: anyone walking into a fresh session starts on a clean main with no merge backlog.

---

## Blocked on Russell (skip these — pick the next item if any block)

- **Cloudflare account finishing**: Workers Paid plan ($5/mo) + Workers for Platforms add-on ($25/mo), `buildclear.dev` zone added, dispatch namespace `clear-customer-apps` created, API token generated (Workers Scripts:Edit, D1:Edit, Zone DNS:Edit, Account Settings:Read). When done, hand over token + account ID + namespace name.
- **First Marcus conversation**: Russell's pitch move. Conversation, not a code move.
- **Stripe live keys, Anthropic org key, Fly Trust Verified**: external paperwork, parallel async track.
- **Sandbox-stranded commits recovery**: gated on cloud-Claude reachability. Patch already applied where it matters; fully redundant if cloud-Claude is unreachable.

---

## Next Moves (in order — if you have time, do them top down)

1. **Studio Prove redesign — auto-check inline (4a) + right-click drilldown (4c).** 4(b) shipped previously: clicking Prove downloads the audit PDF. The two remaining modes:
   - **(a) Auto-check on every save.** Run the prover every time the source changes. Show verdicts inline in the editor gutter: green check next to proved rules, red X next to disproved, amber question mark next to unverifiable. Like spell-check. Sub-second. CodeMirror gutter integration.
   - **(c) Right-click a rule → debug drilldown.** Side pane showing the prover's reasoning (the math journal text that USED to dump to terminal under the old Prove button). The "why didn't this prove?" debug surface.

   Both need CodeMirror gutter / context-menu integration — fresh-head work, not late-session fix-it.

2. **Direct Edit follow-ups (small, when convenient):**
   - Add a CSS rule `body.direct-edit-mode #preview-content iframe { cursor: crosshair; }` so the cursor visibly changes over the preview when toggle is on. Today the iframe sets its own body cursor via the bridge but the iframe boundary may swallow it on hover.
   - Update Meph's `playground/system-prompt.md` so he knows that "Help me edit this:" + a fenced clear block means a focused edit on that snippet — don't refactor the whole file.
   - Russell's three landing-page calls remain open if he wants to tweak the live page: hero pain line aggression, naming competitors, dropping Marcus framing. The page shipped with all three answered "ship it as designed" by default — easy to soften any of them.

3. **Validator friction-driven error rewrites.** Friction script's top items are historical noise (already covered by INTENT_HINTS). Defer until a fresh sweep batch generates new actionable failure rows.

4. **Audit log CSV export endpoint.** Compliance tools (SOC 2 evidence collectors) ingest CSV more naturally than JSON. A `GET /audit.csv` adjacent to `GET /audit` would close that gap. Small (~20 min). Not urgent; the JSON endpoint is enough for the demo path.

5. **Audit log retention / archive.** As `audit_log` grows, queries slow. Need a retention policy (e.g. 90 days) or an archive table. Compliance buyers often ask "how long do you retain audit data?"

6. **Multi-line `/* */` comments inside endpoint bodies — couldn't reproduce.** If this resurfaces, capture the EXACT failing source verbatim before touching it.


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
