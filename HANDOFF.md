# Handoff — 2026-04-26 (Phase 2 sidebar nav committed, ready to merge)

> **Fresh AFK handoff is at the bottom of this file. Read that section first.**
> The older section below is stale: shell phases 2-7 are already merged and pushed to `main`.

## Where you are when you sit down

You're on **`feature/shell-upgrade-phase-2`** — Codex built Phase 2 (sidebar nav with counts, icons, route-based active state) overnight. I reviewed it, it was ship-quality, I committed it (`b554007`) and pushed the branch to remote. **Not yet merged to main** — Russell decides whether to ship it via `/ship` or merge manually.

The cloud-one-click branch (`origin/cloud-one-click-04-26-2026`) was already merged into main as part of the overnight branch — no-op.

Tests **2616/0** in `clear.test.js` + **2/0** in the new `chrome-checks.test.js`. All 8 reference apps compile clean. Pre-commit hook ran the full suite green.

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

## Next session priority order

1. **Merge Phase 2 to main, then keep going on phases 3–7.** Plan: `plans/plan-full-shell-upgrade-04-25-2026.md`. Phase 1 (slate-on-ivory chrome), Phase 2 (sidebar nav — committed on `feature/shell-upgrade-phase-2`, awaiting merge), and Phase 5 (data tables) are done. Phase 2 was Codex's work — quality high, hit all 5 plan deliverables (compiler + 11-doc cascade + Meph prompt + curriculum task + chrome-check eval signal), one improvement over plan (route-based active state listens to back-button + hash changes, not just clicks). Run `/ship` to merge to main. The four remaining phases all matter for "deal-desk looks like Linear, not a tech demo":
   - **Phase 3** — page header + tab strip (one session)
   - **Phase 4** — stat cards + sparkline (one session)
   - **Phase 6** — right detail panel (one session)
   - **Phase 7** — Marcus app port + visual matching the mock to 95% (one session — the final pass that makes the demo look real)
   Order matters: 3 → 4 → 6 → 7. Phase 7 is the highest-leverage but depends on the others being done. Run the plan through red-team-plan first, then execute-plan.

2. **Fix the sweep three-fer (after shell upgrade).** See "Sweep is broken in three real ways" below. The training pipeline is silent until #1 (the database-write hole) gets fixed. But the shell upgrade is the higher critical-path move — Marcus has to want to use the product before the training-signal flywheel matters.

3. **Run the UAT checklist below** before you sit Marcus down. Each app needs to actually work end-to-end, not just compile clean.

4. **Write the Cloud Studio plan (no code yet, just the plan file).** Today the editor runs only on Russell's laptop. Cloud Studio = a customer opens `studio.buildclear.dev` in their browser and uses Studio without installing anything. Multi-session epic when it comes time to build, but the plan itself is one session of work. Cover at minimum: hosted Studio environment, per-customer authentication, per-customer sandboxes for app preview (so two customers don't collide), how Meph's local-AI path translates to a hosted setup, billing wiring, free-tier vs paid-tier boundaries. Use the `write-plan` skill — it'll save to `plans/plan-cloud-studio-MM-DD-YYYY.md` with a load-bearing Phase Order block at the top. Cloud Studio is **NOT** on the critical path to the first paying Marcus customer (he uses the deployed deal-desk app, not Studio), but the plan needs to exist before we can scope it for after-launch.

---

## UAT — features Marcus will actually use, testable per-app

Run through this checklist on the deal-desk (or whichever app you're putting in front of Marcus) before any customer conversation. Each item is something Marcus is going to try in his first 10 minutes — if any of these break, the demo is dead.

**Build + run (the basics):**
- [ ] `clear build apps/<app>/main.clear` — compiles with 0 errors, 0 warnings
- [ ] `clear test apps/<app>/main.clear` — every embedded test passes
- [ ] `clear serve apps/<app>/main.clear` — app boots without console errors
- [ ] Open the local URL in a browser — every page renders, no red console errors
- [ ] Compiled JS is syntax-valid — `node --check build/server.js` exits 0

**Auth (login + signup):**
- [ ] Signup form appears at `/signup` (or wherever the app puts it), creates a real account
- [ ] Login form appears at `/login`, accepts the new account
- [ ] After login, the JWT cookie is set, protected pages are reachable
- [ ] After logout (if the app has it), protected pages 401
- [ ] Bcrypt is doing its job — DB row stores a hash, not the raw password

**CRUD (the bread and butter):**
- [ ] Create a record from the form on the relevant page → record appears in the list
- [ ] View a single record → fields show the actual saved values, not "undefined"
- [ ] Edit a record → save persists; reload the page, edit is still there
- [ ] Delete a record → confirms (if the app uses confirm), record gone from list, gone from DB
- [ ] List view paginates / sorts / filters correctly (if the app uses any of those)

**File upload (if the app uses it):**
- [ ] File input accepts a real file (PDF / image / spreadsheet — whatever Marcus actually uploads)
- [ ] After upload, the file is reachable from the record (download link works, file is the same bytes)
- [ ] Files over the 10MB default cap reject cleanly with a real error message, not a 500
- [ ] Multiple uploads to the same record don't overwrite each other

**AI calls (the differentiator):**
- [ ] Calling Claude from the app returns a real response, not an error
- [ ] Streaming-style responses arrive word-by-word in chat-shaped UIs (helpdesk-agent, ecom-agent)
- [ ] Rate-limit retries work — slow Claude doesn't kill the request
- [ ] Errors in Claude calls show a real user-facing message, not a stack trace

**Live app editing (the "wow" moment):**
- [ ] As the owner, the 🔧 widget appears on the live deployed app
- [ ] As a non-owner, NO 🔧 widget — they can't see the edit surface
- [ ] "Add a field for region" through the widget actually adds the field, ships to live in under 5 seconds
- [ ] Existing user data is intact after the field add — new field shows empty for old rows
- [ ] Hide a field through the widget — field disappears from UI but data is preserved (Phase B reversible)
- [ ] Rename a field — old data carries over to the renamed field
- [ ] Destructive edits (drop a column) require the typed-confirmation phrase + log an audit row before shipping

**Publish + update + rollback (the ops story):**
- [ ] First Publish on a fresh app — provisions the database, attaches the domain, sets secrets, all in one click
- [ ] Second Publish (with a code change) — fast path, ~2 seconds wall-clock, no domain re-attach, no full secret push
- [ ] Schema change Publish — gets blocked with the migration confirm dialog, NOT silently auto-applied
- [ ] After confirm migration + update — schema changes apply, app comes back live
- [ ] Open version history → see at least the last few versions with timestamps
- [ ] Click Rollback on a prior version → live URL flips to that version in 1-2 seconds
- [ ] After rollback, the version timeline reads chronologically (rollback shown as its own entry)

**Mobile / responsive:**
- [ ] Open the app on a phone (or DevTools mobile emulation) — page doesn't break at narrow widths
- [ ] Touch targets are 44px+ (DaisyUI defaults handle this, but spot-check)
- [ ] No hover-only interactions block essential actions

If anything in this list fails on the deal-desk before Marcus sees it, that's the next bug to fix — it'll be the next bug Marcus sees too.

---

## Sweep is broken in three real ways — fix it next session

The summary patch only fixed the visual reporting — the underlying reasons tasks were failing are still there. The last full sweep produced 6 of 38 wins (16%), 20 timeouts at the 3-min cap (53%), and 12 silent failures (32%). Worse, even the 6 wins added **zero rows** to the training database. So the flywheel got no useful signal from that whole run.

Three priorities, in leverage order:

1. **Fix the training-database write hole (THE BOTTLENECK).** When Meph successfully calls a customer endpoint and gets a 200 back, that should write a `test_pass=1` row to the Factor DB. Today, when Meph runs through the local-AI path (cc-agent), that write doesn't reach the database — it lives in the wrong layer. The 2026-04-22 fix for this class of bug looks incomplete. Without this, the flywheel is broken: even when Meph wins, the win doesn't compound. Investigate `playground/meph-tools.js` (where the http_request tool lives) vs `playground/ghost-meph/mcp-server/tools.js` (the local-AI dispatcher) — the write needs to fire on both paths.

2. **Detect worker death + skip remaining tasks instead of fast-failing them.** When a worker child process crashes (`claude.exe` dies after multiple timeouts), the harness keeps sending it tasks for 5-7 seconds each before moving on. Currently those silent fast-fails get hidden in the "Failed" bucket. Better: detect the crash on the first ECONNRESET, mark the worker dead, skip its remaining tasks with a clear "worker-died" status (not silent fail).

3. **Investigate the 53% timeout rate.** That's much higher than expected. Either many curriculum tasks legitimately need longer than 3 minutes, OR Meph's iteration cap (25) is too low for the harder ones, OR a specific class of task (probably L7-L10) always hangs. A `--per-level-stats` flag on the sweep would surface "L1-L3 = 100% pass, L7+ = 0% pass" if that's the pattern.

Roll these into a single follow-up session — they're all the same epic (training-signal integrity).

## Recommended next moves

1. **Items #3 and #5 above are short.** Fly Trust Verified (form submission) and Anthropic org key (~15 min in their console) unblock most of the rest. About $30-50 + 2 hours total time cost across all of #3-#6.
2. **Fix the sweep three-fer above** before running another sweep — without the database-write fix, every sweep is wasted compute.
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
# Handoff - 2026-04-26 night run prep

## Read this first

Russell is going AFK. The goal is **finish as much WIP as possible without creating new sprawl**.

Stay focused:
- Work in parallel by default.
- Keep workers busy when independent work exists.
- Do code changes in the main conversation when visibility matters.
- Use workers for read-only research, test triage, and disjoint implementation slices.
- Before spawning against any plan, read the plan in this session and quote its phase order in the worker brief.
- At every phase boundary, say what shipped, why it matters, and what is next.

Current repo state:
- Branch: `main`.
- Remote: `origin/main` is synced with local `main`.
- Latest pushed commit: `ff85f58 fix(curriculum): keep detail panel skeleton compilable`.
- Only known dirty files should be local runtime DB files: `playground/factor-db.sqlite*`.
- Do **not** stage or revert those DB files unless the task explicitly decides to preserve/checkpoint Factor DB state.

What shipped today:
- Shell upgrade phases 2-7 are merged and pushed to `main`.
- Deal Desk now requires auth for customer submit and approve flows.
- Field rename/data carryover is hardened across runtime stores.
- Live app editing for cloud apps now has widget bridge, deploy history, update, schema-confirm, and rollback coverage.
- Support Triage ticket intake no longer depends on an Anthropic key.
- The broken detail-panel curriculum skeleton now compiles.
- Cloud Studio plan exists at `plans/plan-cloud-studio-04-26-2026.md`.
- `AGENTS.md` has fresh rules for active worker management, staying focused, and plain-English ADHD-friendly updates.

Verification already run:
- `node clear.test.js` passed: 2671/0.
- `node playground/e2e.test.js` passed: 75/75.
- Cross-target smoke passed: 32 app-target emissions parse clean.
- `playground/supervisor/chrome-checks.test.js` passed: 5/0.
- Six Marcus app UAT tests were run; Support Triage failed, was fixed, then passed 13/13.
- `git push origin main` passed all hooks and pushed successfully.

## Big picture

The app shell work is no longer the blocker. Clear apps now look and behave much closer to real internal tools.

The next overnight objective is **customer-readiness and flywheel integrity**:
- Customer-readiness means Deal Desk can survive Marcus's first ten minutes.
- Flywheel integrity means passing Meph work actually writes training signal.
- Avoid starting brand-new product epics unless they close one of those two loops.

## Recommended overnight order

### 1. Deal Desk deep UAT - highest priority

Goal: prove the Marcus demo path works like a customer would use it.

Run the UAT checklist below against `apps/deal-desk/main.clear`.

Focus areas:
- Build, test, run, and browser console.
- Signup/login/JWT protected pages.
- Create/view/edit/delete deal records where supported.
- Approve flow changes the pending queue.
- Responsive sanity at mobile width.
- No visible `undefined`, broken layout, or console red errors.
- Live edit owner/non-owner visibility if the local/cloud harness can exercise it safely.

If anything fails:
- Write the failing test first.
- Fix it.
- Rerun the app test and the narrow regression.
- Commit the fix.

Do not stop at compile success. Verify visible behavior.

### 2. Sweep training signal integrity - second priority

Goal: make the flywheel record wins again before any expensive sweep.

The handoff below lists the three-fer:
1. Training DB write hole.
2. Worker-death detection.
3. Per-level timeout stats.

Current best order:
- First prove whether successful local-AI endpoint calls write a `test_pass=1` row.
- Compare `playground/meph-tools.js` and `playground/ghost-meph/mcp-server/tools.js`.
- Add a runtime guard/test that fails if a successful HTTP call records nothing.
- Then fix worker death handling.
- Then add per-level timeout stats.

Cost rule:
- Do not run paid Anthropic sweeps blindly while Russell is AFK.
- Run local/unit tests and no-spend harness tests freely.
- Before any Anthropic-spending operation, estimate cost and post it.
- If the estimate crosses the session spend gate, stop and wait.

### 3. Give-Claude doc cascade and template migration

Goal: make Meph and docs teach the new canonical AI-call form.

Plan:
- Read `plans/plan-give-claude-canonical-form-04-26-2026.md`.
- Red-team the plan before editing.
- Then update docs/templates/system prompt in small chunks.
- Run compile/tests after each meaningful migration slice.

This is useful, but it comes after Deal Desk UAT and sweep signal integrity.

### 4. Canonical examples curation support

Goal: prepare the examples so Russell can make fast taste decisions later.

Do not silently rewrite the whole examples library.

Useful AFK work:
- Inspect `playground/canonical-examples.md`.
- Group candidates by archetype.
- Flag weak examples, duplicates, and gaps.
- Propose a short ranked curation list.

### 5. Cloud Studio stays after-launch

Cloud Studio is planned, not the overnight build target.

Use `plans/plan-cloud-studio-04-26-2026.md` only for red-team or follow-up planning unless the customer-readiness and flywheel work are done.

## Overnight operating instructions

Use the N-1 pattern:
- If there are N independent chunks, assign N-1 workers and keep the most integration-sensitive chunk local.
- Workers should not sit idle.
- Give workers narrow briefs and disjoint write scopes.
- Verify every worker change in the main thread before commit.

Suggested parallel split after initial Deal Desk UAT starts:
- Main thread: run and fix Deal Desk UAT.
- Worker A: read sweep write paths and identify exact missing training-write branch.
- Worker B: inspect worker-death handling and propose/patch disjoint harness fix.
- Worker C: inspect give-claude plan/docs and return a migration map only.

Commit policy:
- Commit each tested repair.
- Push after meaningful green checkpoints.
- Never stage `playground/factor-db.sqlite*` unless deliberately checkpointing the training DB.

Stop conditions:
- Destructive filesystem/git action.
- Paid API run above the allowed spend gate.
- Production credential or account-console work Russell must do.
- Ambiguous product choice with no safe default.

## Plain-English status for Russell

What got done:
- The visual shell work is landed.
- Live editing is much safer.
- Deal Desk and Support Triage have fewer demo-killing holes.
- The repo is pushed and recoverable.

What is next:
- First prove Deal Desk end-to-end.
- Then fix the flywheel so wins write training data.
- Then clean up Meph/docs so future app generation uses the new syntax.

---
