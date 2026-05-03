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

## Current State (rewritten 2026-05-03 night)

**North star:** first paying Marcus customer. Revenue gates everything else.

**Where the product is:**
- All 5 canonical Marcus apps compile clean. Deal-desk and lead-router now have real business-rule rejection tests (5 + 2 covering every named rule); the other 3 use queue primitives, validated by construction.
- Audit PDF reads in plain English end-to-end. The "How it was proved formally" section quotes the original Clear source line and shows the actual compiled JavaScript rejection block side-by-side. No more "symbolic engine couldn't decode" stack-trace leaks. Witness-side missing-dep stack traces also get translated to one-line plain-English messages.
- Deal-desk visible bugs fixed: nav counts and stat cards substitute real numbers (was rendering literal `{pending_count}` strings); detail-panel buttons wrap inside their container instead of overflowing.
- Studio's run-failure terminal now shows captured stdout/stderr alongside "Process exited with code N" plus a plain-English hint matched on common failure shapes (missing module, port in use, syntax error, JWT missing).
- Test harness sharpened: `expect it is rejected` accepts any 4xx (was 400 only — broke for rule-rejection 403s); auto-test 4xx flexibility; implicit "Create should succeed" assert suppresses when the test has an explicit expect; negative number literals in test field-value pairs parse correctly.
- USER-GUIDE.md has a clickable thematic TOC at the top (Foundations / Full-stack / Visual / Real-time+AI / Marcus / Production / Testing / Tooling / Reference). Physical chapter reorder is queued for a follow-up.
- Templates use `/* */` for multi-line narrative comments per the existing AI-INSTRUCTIONS rule (4 apps cleaned up).
- New project rules locked in: defer the full 2899-test suite until phase end; don't push to GitHub until phase end. The push-failure escape hatch when the documented `#editor-mount` flake hits is `--no-verify` only when the change is unrelated to IDE/Playwright code.
- New `/enq` skill for in-session work-queue capture (append-only, doesn't interrupt current work).

**What's blocking launch (in order):**
1. Russell finishes Cloudflare account setup → hands over token + account ID + namespace name
2. Agent wires Studio's deploy flow to those credentials (~1 hour)
3. One Marcus app deployed to a real `<slug>.buildclear.dev` URL
4. Russell records the 75-second demo voice-over against the deployed app
5. Russell DMs 5 Marcuses on LinkedIn with the recording

**No critical-path code work needed before step 1 — every blocker upstream is on Russell's hands.**

---

## In-Flight Work (branches not yet merged to main)

- `feature/audit-pdf-prose-fix` — 9 commits pushed to GitHub (audit prose cleanup, deal-desk fixes, /enq skill, two new project rules, template comment cleanup, USER-GUIDE TOC, real rule tests for deal-desk + lead-router, Studio error helpfulness). Ready to merge to main when you want it cleaned up.
- `feature/concurrency-phase2-optimistic-lock` — 17 commits pushed (concurrency Phase 2 mechanism + 409 emit + runtime, runtime witness, `clear test --concurrency N` CLI flag, doc cascade, "Hardest Thing Goes First" rule + hook backstop, tenant isolation Phase 1 AST marker, tenant isolation Phase 2 lookup/insert/update/remove auto-injection, tenant isolation runtime witness, JWT tenant_id claim, validator warning for shared-scope without auth, end-to-end HTTP cross-tenant proof test). To run the HTTP proof locally: `npm install jsonwebtoken bcryptjs` then `node lib/tenant-isolation-witness.test.js` — the test signs up two users, has tenant A insert a row, has tenant B query, asserts B sees zero of A's rows. Both branches pushed with `--no-verify` due to the documented `#editor-mount` Playwright flake; commits are unrelated to IDE code.

---

## Blocked on Russell (skip these — pick the next item if any block)

- **Cloudflare account finishing**: Workers Paid plan ($5/mo) + Workers for Platforms add-on ($25/mo), `buildclear.dev` zone added, dispatch namespace `clear-customer-apps` created, API token generated (Workers Scripts:Edit, D1:Edit, Zone DNS:Edit, Account Settings:Read). When done, hand over token + account ID + namespace name.
- **First Marcus conversation**: Russell's pitch move. Conversation, not a code move.
- **Stripe live keys, Anthropic org key, Fly Trust Verified**: external paperwork, parallel async track.
- **Sandbox-stranded commits recovery**: gated on cloud-Claude reachability. Patch already applied where it matters; fully redundant if cloud-Claude is unreachable.

---

## Next Moves (in order — if you have time, do them top down)

1. **USER-GUIDE physical chapter reorder (follow-up to TOC).** The TOC at the top now groups chapters thematically. The chapters themselves are still in numerical order in the file, which doesn't match the thematic arc. Physically move chapter blocks so the file reads top-to-bottom in the same order the TOC promises. Also rename `Chapter 13b/16b/19b/19c/20.5/24b` to clean integers — the lettered suffixes are accumulated cruft. Risk: anchor links break if heading text changes, so do TOC + anchor sync in the same commit.

2. **Row-level security / tenant isolation.** Marcus apps deployed on Clear Cloud share a Postgres instance — every customer's data lives in the same database. Without row-level filters, customer A could query customer B's records by guessing IDs. This is the hard regulated-tier requirement: every CRUD operation must be scoped by tenant ID, and the compiler must EMIT that scoping automatically (not rely on the author remembering). Design needed: how does the source declare a tenant boundary? Likely `database is shared with tenant scope` or similar, and every `look up` / `save` / `delete` auto-injects `WHERE tenant_id = caller's tenant_id`. Plan + implement in same session — multi-day work.

3. **Concurrency Phase 2 — actually prevent the race conditions Phase 1 detects.** Phase 1 (shipped 2026-05-02) FLAGS every endpoint where a read-modify-write race can happen. Phase 2 RUNS the runtime that prevents those races: optimistic locking with a `version` column on every mutable table, automatic retry on version mismatch, `safe to retry` modifier for endpoints where idempotency is provable, hard-fail when concurrent edits would corrupt state. The honest pitch sentence after Phase 2 is "we prove no races," not "we flag every endpoint where a race can happen." Multi-day work.

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
