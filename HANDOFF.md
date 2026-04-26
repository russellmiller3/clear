# Handoff — 2026-04-26 (overnight branch merged to main, all shipped)

## Where you are when you sit down

You're on **main**. The overnight branch (`feature/overnight-04-25-2026`) merged in cleanly at commit `8d431dd` and is now on remote — your day-prior cleanup work at 89189d1 is preserved underneath it.

Tests **2614/0** in `clear.test.js`. All 8 reference apps compile clean. **$0 API spend** across the entire 12+ hour overnight + morning run.

## Critical path to first paying customer

The product is meaningfully ready. The gating items are mostly setup work you own.

**1. ✅ Push the branch — DONE 2026-04-26.** Overnight branch landed on main, force-pushed cleanly with your earlier cleanup preserved.

**2. ✅ Register `buildclear.dev` domain — DONE 2026-04-26.** Means every customer app gets a real-looking URL like `their-deal-desk.buildclear.dev` instead of `random-id.fly.dev`. Stripe also verifies the domain matches the business when issuing live keys, so this had to land before #4.

**3. Fly.io Trust Verified app.** Fly.io is the cloud where customer apps actually run. "Trust Verified" is a status Fly grants once they've reviewed Clear as a company — it stops payment processors and abuse-detection systems from flagging traffic through customer apps as suspicious. Without it, real card payments through any customer app could get auto-declined. *Submit the form, Fly's review takes a day or two.*

**4. Stripe live keys.** Test keys (which you have) accept fake credit card numbers for development. Live keys accept real cards. Gated on #2 (Stripe checks the domain) and #3 (so payments aren't flagged as suspicious). Without these, no actual money can change hands. *~30 min once #2 + #3 are done.*

**5. Anthropic org key for paid Meph sessions.** When a customer's app calls Claude (the deal-desk asking Claude to summarize a contract, the helpdesk-agent answering a ticket), each call costs money. Today's keys are tied to your personal billing — running customer usage on those would charge you for every customer's AI calls. An organization key with the customer usage billed back to Clear is needed before any customer can use the AI features. *~15 min in the Anthropic console.*

**6. Postgres provision (managed Fly Postgres or Neon).** Every customer app needs its own real database for their data. The demo path uses SQLite, which lives inside the app's container and gets wiped on every restart. Real customer data needs a managed Postgres — automatic backups, doesn't lose anything on restart, scales as the app grows. Either Fly Postgres or Neon works. *~30 min to provision + 1-line config change in the tenants store.*

**7. First Marcus conversation.** Someone with a real backlog of internal tools — deal desk, helpdesk, expense tracker, whatever real-business stuff — who'll let us put Clear on one. Without a real customer trying to do real work, there's no first paying customer. *Conversation move, not a code move.*

**8. Watch them build their first one — fix what bites.** When the customer hits a compile error or a confusing bit of syntax, that's the highest-leverage signal Clear will get all year. Every fix compounds across every future customer because the compiler accumulates quality. *After #7, you + Claude pair.*

## What landed in the overnight (now on main)

**Visual layer — every Clear app stops looking like a tech demo:**
- App shell (sidebar / header / content area) compiles to slate-on-ivory chrome from one line of Clear
- Tables compile to status pills + avatar circles + money formatting + sortable headers + selectable rows + hover-revealed action buttons
- Marcus landing page leads with the action ("Ship the first internal tool on your backlog this Friday")
- Builder Mode is the default for new Studio users

**AI-builder layer — Meph (the in-Studio AI) gets meaningfully less stupid:**
- **`give claude X with prompt: 'Y'`** — new canonical AI call form. Verb-led, data-first, prompt-as-noun. Reads like a sentence: "give claude the user's message with prompt 'be concise'." Old form still parses; migration is additive.
- **TBD placeholders** — drop `TBD` anywhere a value belongs; program builds, runtime throws clean error if hit, tests at that spot report SKIPPED instead of FAILED
- **Shape-search retrieval** — Meph also retrieves canonical examples that look structurally like what he's writing, on every compile (not just on errors)
- **Open-capability surface** — Meph's per-turn context shows "what's still open" (TBDs, failing tests, unresolved errors) before he writes code

**Training-signal layer — wins now compound the same way errors do:**
- Winner-harvest scorer ranks every passing build by exemplariness
- Held-out test set (5 curriculum tasks) gives an uncontaminated measurement signal as the training pipeline grows
- Initial canonical-examples draft pulled from top winners (waiting for your curation pass)
- Friction snapshot saved (`snapshots/friction-baseline-04-26-2026.txt`) — top compile errors ranked by minutes-cost-to-Meph

**Compiler quality at the bottom of the stack:**
- Sweep cleanup helper kills the duplicate-session-id crash that was breaking training runs
- Sweep summary now prints the hidden "Failed" bucket + sample errors (was silently dropping ~30% of failed runs)
- Cold-start no longer fires on import (was running a full Factor DB seed pass any time someone imported the helper module for testing)
- `live:` keyword reverted (Path B over-reach per your call); Path A defaults — while-cap, recursion-cap, email/DB timeouts — were already shipped and remain the totality story
- Decidable Core Path B Phase 1 (`live:` keyword) saved on branch `save/live-keyword-04-25-2026` in case Phase B-2 ever lands on real measurement evidence

**Harness layer — three new hooks installed to prevent the kinds of mistakes that bit me overnight:**
- **Read-the-plan hook** — before any background-worker spawn against a `plans/plan-*.md` file, the hook checks the session for a Read on that file. Hard-blocks if missing. Catches the wrong-phase shipment class (the `live:` mistake).
- **Clear cheat-sheet hook** — every time I'm about to Write or Edit a `.clear` file OR a Meph-facing teaching doc (system-prompt, USER-GUIDE, AI-INSTRUCTIONS, SYNTAX, intent), the canonical-syntax sections get freshly extracted and injected as a cheat sheet. Memory drift can't catch me because the canonical forms reappear at the moment of risk.
- **Landing-page design hook** — same pattern for `landing/*.html` writes. Injects the 10 hard UI rules + no-emoji ban + visual-target reminder.
- New PHILOSOPHY rule (Rule 22) — "One Thought Per Line — No Expression Chaining" — bans the kind of compound-mental-load syntax I almost shipped before you caught it.

## Things to know before you act

- **Branch `feature/overnight-04-25-2026` is now merged into main and on remote.** The merge commit is `8d431dd` and includes both your earlier cleanup work (89189d1 and its 14 prior commits) and all 83 overnight commits.
- **`give-claude` doc cascade + template sweep are deferred.** The new form parses and compiles correctly, and the old `ask claude '...' with X` form still parses (additive, no migration breakage). But the 14+ examples in SYNTAX.md, AI-INSTRUCTIONS.md, USER-GUIDE.md, and Meph's system prompt still show the old form, and apps in `apps/` still use the old form. That's a separate session of work — the plan is at `plans/plan-give-claude-canonical-form-04-26-2026.md`.
- **The give-claude plan was not red-teamed.** The execute-plan flow ran into a stuck worker; I salvaged the parser/compiler/validator code from the worker's worktree and shipped that. The plan is still ready for a clean execute-plan + red-team-plan pass when you want the doc cascade and template migration done properly.

## Recommended next moves

1. **Items #3 and #5 above are short.** Fly Trust Verified (form submission) and Anthropic org key (~15 min in their console) unblock most of the rest. About $30-50 + 2 hours total time cost across all of #3-#6.
2. **Run a fresh sweep with the patched summary** — `node playground/supervisor/curriculum-sweep.js --workers=3` (free, gm path). The new "Failed" bucket print should give you a much sharper picture of where Meph is breaking.
3. **Curate `playground/canonical-examples.md`** — initial draft is ready; pick / improve / swap / drop the 10 examples to your taste. Once curated, wire it into Meph's prompt and shape-search retrieval has real material to match against.
4. **When you're ready to do the give-claude doc cascade + template sweep**, run the plan through red-team-plan first then execute-plan. The plan is comprehensive; the execution just got interrupted last time.

## Files to read for fuller context

| File | Why |
|------|-----|
| `CHANGELOG.md` | Session-by-session history; latest entries describe today's work in narrative form |
| `snapshots/friction-baseline-04-25-2026.txt` | Top-20 compile errors ranked by minutes-cost-to-Meph |
| `snapshots/sweep-diagnosis-04-26-2026.md` | Why the sweep summary was misleading + the patch that fixed it |
| `snapshots/winner-rankings-04-26-2026.txt` | The cleanest 564 passing builds ranked by exemplariness |
| `plans/plan-give-claude-canonical-form-04-26-2026.md` | The plan for the doc cascade + template migration that's still pending |
| `plans/plan-decidable-core-04-24-2026.md` | The original termination-safety plan (Path A is shipped; Path B reverted) |
