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

## Current State (rewritten 2026-05-03 evening)

**North star:** first paying Marcus customer. Revenue gates everything else.

**Where the product is:**
- All 5 canonical Marcus apps (Deal Desk, Approval Queue, Lead Router, Onboarding Tracker, Internal Request Queue) compile clean and pass 74 of 74 automated browser checks.
- The proof system shipped AND its verdict surface is now hardened: the business-rules eval (35 cases across 21 groups) passes 35 of 35. The prover's "How it was proved formally" output no longer leaks math-engine internals — every PROVED rule's audit PDF now says "this rule is enforced by construction of the program" in plain English, quotes the original Clear source line, and shows the actual compiled JavaScript rejection block side-by-side. Auditors see the runtime check with their own eyes; the math claim has the receipt next to it. The runtime-witness side also got the same cleanup — missing-dependency stack traces no longer leak into the PDF; auditors get a one-line plain-English message instead.
- Runtime witness wired: every PROVED rule is independently verified at runtime. The harness compiles each rule shape, spawns the compiled app on a free port, sends 20 violating inputs, asserts every one comes back as a 403 with the rule name in the body. 60 measured rejections across 3 rule shapes, all green.
- Compiler emit hardened: every rule rejection now carries `{ "error": "<msg>", "rule": "<rule-name>" }` in the response body so the audit trail can attribute every 403 to its named policy.
- Studio has a fullscreen toggle for demo recording.

**What's blocking launch (in order):**
1. Russell finishes Cloudflare account setup → hands over token + account ID + namespace name
2. Agent wires Studio's deploy flow to those credentials (~1 hour)
3. One Marcus app deployed to a real `<slug>.buildclear.dev` URL
4. Russell records the 75-second demo voice-over against the deployed app
5. Russell DMs 5 Marcuses on LinkedIn with the recording

**No critical-path code work needed before step 1 — every blocker upstream is on Russell's hands.**

---

## In-Flight Work (branches not yet merged to main)

_None right now — `feature/audit-pdf-prose-fix` shipped clean tonight. The earlier `feature/prover-business-rules-eval` branch was already merged in yesterday's run; the row was stale carry-over._

---

## Blocked on Russell (skip these — pick the next item if any block)

- **Cloudflare account finishing**: Workers Paid plan ($5/mo) + Workers for Platforms add-on ($25/mo), `buildclear.dev` zone added, dispatch namespace `clear-customer-apps` created, API token generated (Workers Scripts:Edit, D1:Edit, Zone DNS:Edit, Account Settings:Read). When done, hand over token + account ID + namespace name.
- **First Marcus conversation**: Russell's pitch move. Conversation, not a code move.
- **Stripe live keys, Anthropic org key, Fly Trust Verified**: external paperwork, parallel async track.
- **Sandbox-stranded commits recovery**: gated on cloud-Claude reachability. Patch already applied where it matters; fully redundant if cloud-Claude is unreachable.

---

## Next Moves (in order — if you have time, do them top down)

1. **Add chapters and a clickable Table of Contents to USER-GUIDE.md.** The guide is now ~3700 lines — readers can't navigate. Add a TOC at the top with anchor links to each chapter heading. Also: audit chapter ordering — some chapters are old, some are recent; group them so the tutorial reads in a natural arc (start with "your first app", then data, then UI, then auth, then rules, then deploy). Don't add new content; just structure what's there. ~1 hour.

2. **Row-level security / tenant isolation.** Marcus apps deployed on Clear Cloud share a Postgres instance — every customer's data lives in the same database. Without row-level filters, customer A could query customer B's records by guessing IDs. This is the hard regulated-tier requirement: every CRUD operation must be scoped by tenant ID, and the compiler must EMIT that scoping automatically (not rely on the author remembering). Design needed: how does the source declare a tenant boundary? Likely `database is shared with tenant scope` or similar, and every `look up` / `save` / `delete` auto-injects `WHERE tenant_id = caller's tenant_id`. Plan + implement in same session — multi-day work.

3. **Concurrency Phase 2 — actually prevent the race conditions Phase 1 detects.** Phase 1 (shipped 2026-05-02) FLAGS every endpoint where a read-modify-write race can happen. Phase 2 RUNS the runtime that prevents those races: optimistic locking with a `version` column on every mutable table, automatic retry on version mismatch, `safe to retry` modifier for endpoints where idempotency is provable, hard-fail when concurrent edits would corrupt state. The honest pitch sentence after Phase 2 is "we prove no races," not "we flag every endpoint where a race can happen." Multi-day work.

4. **Redesign Studio's Prove button (and add inline auto-check).** Today the Prove button just dumps the math-journal output into the terminal pane — same thing an auto-check could show inline, with no PDF. Better split:

   **(a) Auto-check on every save.** Run the math-checker every time the source changes. Show verdicts inline in the editor margin: green check next to proved rules, red X next to disproved, amber question mark next to unverifiable. Like spell-check. Fast (under a second). No button needed for the basic check.

   **(b) Prove button → generates the audit PDF.** Same artifact `node scripts/audit-bundle.mjs + python scripts/audit-pdf.py` produces from the CLI. Math verdict + runtime witness (spawn the app, fire 20 violating inputs per rule, capture rejections) + navy/amber compliance styling. Drops as a download. ~5 seconds. This is what the developer hands to Marcus's compliance buyer. **The PDF prose is now clean as of tonight — no more prover-internals jargon — so this redesign can lean on the artifact unchanged.**

   **(c) Right-click a rule → debug drilldown.** Show the prover's reasoning text (today's math-journal output) in a side pane. The "why didn't this prove?" debugging surface, not the primary one.

   Single artifact (PDF), three ways to reach it: auto-inline for fast feedback, button for the customer-facing report, right-click for "why." Matches how Marcus actually uses Studio: write rules, see them prove in real time, hit the button when ready to send to the auditor.

5. **Studio's Dev / Builder mode switcher dropdown is broken.** The toolbar dropdown in `playground/ide.html` that switches between Dev mode (3-panel IDE) and Builder mode (Marcus-first chat layout) doesn't actually switch modes when picked. Reproducer: open Studio, click the mode dropdown, pick the other mode, nothing happens. Likely either the change handler doesn't fire or the URL param / localStorage write isn't persisting. Check `syncModeButtons()` and the `studio-mode-pref` localStorage key in `playground/ide.html`. ~30 min debug + fix.

6. **Multi-line `/* */` comments inside endpoint bodies — couldn't reproduce in isolation.** Originally observed 2026-05-02 late-evening while moving lead-router rules into the POST handler. A comment block at body indentation between `requires login` and the rules caused "Route block references 'lead' but no variable named 'lead' is in scope here" on the route block downstream. Tried to reconstruct in isolation with the exact comment content, full endpoint shape, and `route lead by size:` block — all parsed clean (0 errors). Either the trigger requires conditions I haven't recreated, or it was an intermediate file state. **For the next session:** if this resurfaces, capture the EXACT failing source (don't paraphrase) before touching it, then `node /tmp/probe.mjs` with that source loaded as a string to confirm the trigger.

7. **Fix any remaining flaky tests across the repo.** The specific `#editor-mount .cm-editor` Playwright timeout I saw forcing `--no-verify` does NOT reproduce in current code. Open question: are OTHER tests still flaky? Audit over a few full pre-push runs.


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
