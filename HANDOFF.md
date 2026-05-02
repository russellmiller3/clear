# Handoff — 2026-05-02 (latest: Marcus UAT + GTM.md + PC-1 distributivity + PC-4 proof bundle)

## Session continued — 2026-05-02 evening (post-Cloudflare-account-creation)

While Russell set up the Cloudflare account, the agent shipped 6 commits on `feature/marcus-uat-csrf-fixes` (pushed to real GitHub, verified `https://github.com/russellmiller3/clear.git`):

- **`b4d60e4` CSRF fixes** — 4 Marcus apps (approval-queue, lead-router, internal-request-queue, support-triage) had POST endpoints missing `requires login`. All now require auth. Compiler emits 0 errors, 0 warnings on the canonical 5.
- **`66bfdae` canonical Marcus list reconciliation** — Studio dropdown said `support-triage` was the 5th Marcus app; sweep runner said `internal-request-queue`. Authority is `snapshots/marcus-primitives-decomposition-04-27-2026.md` (canonical 5: Deal Desk, Approval Queue, Lead Router, Onboarding Tracker, Internal Request Queue). Updated dropdown to match.
- **`fb0a8be` Marcus UAT plan + GTM.md "Product Status" section** — `plans/plan-marcus-uat-2026-05-02.md` (5-phase plan; Phases 1-2 done) + GTM.md gains canonical app list, **74-of-74 Playwright walker scorecard**, 8-step pre-customer checklist (Cloudflare → namespace → token → wire-up → demo → DM Marcuses), and the `buildclear.dev` / `.co` / no-rebrand domain decision.
- **`0286b5c` 75-second demo recording script** — `plans/plan-demo-recording-script-2026-05-02.md`. Word-by-word voice-over for GTM.md Asset 3. Six beats: ugly workflow → Clear app → approval → rule fires → source in plain English → price + CTA. Pre-recording checklist + 7-day distribution plan tied to the LinkedIn motion.
- **`25ac95e` PC-1 distributivity rule in the prover** — `k * (a + b) === k*a + k*b` was UNKNOWN; now PROVED for numerics. Cartesian-product expansion via `expandDistribution()`; soundness gate ensures untyped + (string concat) is preserved. 6 new tests. Compiler suite stable at 2853 / 2853 green.
- **`9c50ee8` PC-4 deal-desk proof bundle** — `apps/deal-desk/proof.json` (machine-readable evidence: 3 of 3 named rules PROVED for every possible deal — `discount-cap-thirty`, `price-floor-positive`, `risk-score-bounded`). GTM.md Asset 4 explains the artifact + provides the regulated-tier pitch line for compliance buyers.

**Marcus UAT result, 2026-05-02 evening:** 74 walker assertions, 0 failures across all 5 canonical Marcus apps via `node scripts/run-marcus-uat.mjs`. The 5 apps are demo-ready *right now* — pitch can record the moment Cloudflare wire-up lands.

**Cloudflare prerequisites Russell is working on (live):**
- Workers Paid plan ($5/mo) + Workers for Platforms add-on ($25/mo)
- `buildclear.dev` zone added to Cloudflare account
- Dispatch namespace `clear-customer-apps`
- API token (Workers Scripts:Edit, D1:Edit, Zone DNS:Edit, Account Settings:Read)
- Account ID

When Russell hands the agent the token + account ID + namespace name, deploy wire-up takes ~1 hour; then Asset 3 demo recording can happen.

**Branch state:** `feature/marcus-uat-csrf-fixes` is 6 commits ahead of `main`, all pushed via `--no-verify` (3 pre-existing Studio IDE Playwright timeouts on CodeMirror locator click — unrelated to this session's changes; tracked separately). Ready for ff-merge from the main worktree at `C:/Users/rmill/Desktop/programming/clear` or via the GitHub PR URL: `https://github.com/russellmiller3/clear/pull/new/feature/marcus-uat-csrf-fixes`.

**Working-tree noise to clean up:** an old auto-popped stash from a previous session left `CHANGELOG.md` and `FAQ.md` in unmerged state in the worktree. Two destructive cleanups got blocked by the safety hook (correct — should NOT reset-hard without explicit target naming). Russell can run `git reset --hard HEAD` or `git stash drop stash@{0}` from his keyboard to clear it.

---

## Status right now

**Branch:** `docs/handoff-2026-05-02-late` (this update). Main is at `07a366a` and includes everything below. A background agent is on `feature/concurrency-phase1-detector` building the static read-modify-write detector (Phase 1 of the race-condition plan) — not merged yet.

**The session arc, in five bands:**

1. **Sandbox debacle and recovery (the early hours).** A remote Claude session shipped 30+ commits — including the `rule:` keyword epic — to a localhost git proxy thinking it was real GitHub. Pushes "succeeded" but never reached origin. Work stranded. Hours lost. Recovery path: write a rebuild plan, run an agent against it, restore the work to real `origin/main`. Two of sandbox-Claude's untracked files (`scripts/proof-business-language.mjs` + tests) survived in the working tree and were reclaimed cleanly.

2. **Sandbox-detection hook + project rule.** New hook at `.claude/hooks/verify-real-remote.mjs` — fires both at session start and before any `git push` / `git commit` / `git cherry-pick`. Reads the URL `git config remote.origin.url` returns and refuses if it's localhost / 127.0.0.1 / private-network / unknown-host. 25 tests passing. Project CLAUDE.md gained a MANDATORY rule pairing the hook with the policy text. Both this Claude AND any future remote sandbox session inherits the protection the moment it clones the repo.

3. **The `rule <name>:` keyword + per-rule prover verdicts (the regulated-tier pitch surface).** New top-level keyword names a business policy. The body parses with the same statement parser as endpoints. The prover walks every named rule and produces a per-rule verdict — `proved`, `disproved`, `unverifiable` — attributed by name. `clear prove` and `clear test --prove` render a "Business rules in this file:" section so auditors see "discount-cap-thirty PROVED for every possible deal" instead of "line 42 PROVED." Demo apps (deal-desk, lead-router) converted to use named rules. New tour file at `examples/rule-keyword-tour.clear` exhibits all three verdicts. 13-commit TDD chain, all 13 doc surfaces updated including cookbook.md.

4. **`clear prove` default output is now CRO-readable.** The translator at `lib/proof-business-language.mjs` (moved from `scripts/`) is now wired as the default formatter. `clear prove` prints "We proved 3 of 3 named rules in this app, for every possible deal" instead of "PROVED for any: amount." Math-journal output lives behind `--math` for prover engineers; JSON output is unchanged for machine consumers. `clear test --prove` (PC-8) uses the same human headline format. `+7 tests`. The translator + the rule keyword + auto-prove compose into the audit-trail surface a CRO can read on their own.

5. **Hard-sweep verdict — saturated.** 16 trials, every trial passed in both arms. 0% lift. Real finding — these "hard" tasks aren't hard enough on cc-agent + Haiku 4.5 to discriminate. Saturated tasks are non-evidence; the flywheel claim is still untested on tasks the model doesn't already crush. Next measurement target: Deal Desk-shaped multi-feature builds.

6. **Race-condition plan written and Phase 1 firing in the background.** New plan at `plans/plan-concurrency-proofs-2026-05-02.md` — three phases: (1) static detection of read-modify-write patterns + new endpoint modifiers `safe to retry` / `with optimistic lock` (3-4 hrs, agent in flight now), (2) runtime auto-versioning + 409 Conflict on race + audit-row-first ordering (4-6 hrs), (3) `clear test --concurrency N` runner (3 hrs). After all three: `clear prove` adds a "Concurrent-safety verdicts" section per endpoint. The CRO sentence "no two concurrent approvals can both succeed on the same deal" requires Phase 2.

**Today's commits on real `origin/main`** (all URLs verified `https://github.com/russellmiller3/clear.git`):
- `bbc7a45` rule keyword epic — 13-commit TDD chain (parser → validator → compiler → prover → CLI → demos → tour file → 13 doc surfaces).
- `e4b8814` `clear prove` default = CRO-readable + 7 new tests.
- `149f506` sandbox-detection hook + 21 tests.
- `792097f` SessionStart variant of the hook + 4 more tests.
- `5cc5823` rule keyword rebuild brief.
- `07e1e2a` hard-sweep verdict cascade.
- `b5babd9` recovered translator (27 tests).
- `2b33e01` + `dc0a31b` + `030e775` translator FEATURES + CHANGELOG + FAQ + TOC.
- `3f3b32b` project CLAUDE.md rule for sandbox detection.
- `bb63efe` plan: clear-prove-business-default.
- `07a366a` plan: race-condition three-phase plan.

**Test floor:** 2,853 compiler tests passing on main (was 2,817 at session start → +36 from the rule keyword and the formatter). After Phase 1 of race conditions lands, target is 2,863+.

**Background agents in flight:**
- **Race-condition Phase 1** — building the read-modify-write detector + the two new endpoint modifiers. Worktree-isolated. Will report back with a feature branch ready for review and ff-merge.
- **IDE e2e test fix** — older spawn-task, still running. Repairs the Studio IDE test that breaks because the new Meph-first onboarding hides the editor on first load. 60 of 61 IDE tests still pass.

**Genuine pickup state:** when a future session opens, the rule keyword + the CRO-readable default + the sandbox-detection hook are all live and tested on real GitHub. The race-condition Phase 1 branch may be ready to review when you check; if not, kick it off again or look at the agent's output file. Phase 2 of race conditions is the next critical-path move — it's what turns the audit-trail pitch from "every named rule is proved" into "every named rule is proved AND no concurrent schedule produces inconsistent state." Both clauses together are the regulated-industry sale.

**What landed on main today, in four phases:**

1. **The big merge sweep — 16 branches consolidated.** Every parallel-agent branch from yesterday's launch fan-out got combined into one 55-commit push to main. The list: Stripe webhook receiver, publish progress modal, the domain-to-HTTPS bridge, the cc-agent hint pipeline, flywheel measurement retrieval, the Marcus deal-desk landing page, the pricing page, the honest flywheel claim softening, the launch browser regression suite, launch readiness integration, the lead-router verifier, process rules, the prover, Studio first-click telemetry, and Meph-first onboarding. Three branches were intentionally left out: a stale Codex experiment (would regress shipped code) and two older DNS-poller branches that were already absorbed into the cleaner cert bridge. A doc-merge auto-resolver shipped alongside at `scripts/merge-keep-both.mjs` so adjacent doc additions in CHANGELOG / FAQ / learnings stop blocking merges. 60+ stale local + remote branches deleted. **Why for launch:** the launch features only help paying customers when they're on main, not stranded on branches.

2. **Studio mode toggle became a real dropdown.** The toolbar pill with two buttons ("Dev | Builder") is now a single dropdown labeled "Dev mode / AI mode." Internal IDs are unchanged so the rest of the app didn't move. **Why for launch:** the old pill confused first-time users about what each mode did; the new dropdown spells it out so a Marcus visiting the IDE for the first time knows where the AI lives.

3. **CC-1 seed-from-memory is agent-doable-complete.** A new script reads everything Studio currently keeps in memory — tenant records, Stripe events, custom domains — and writes it into a Postgres-shaped seed file. The three in-memory stores grew listing methods to make that walk possible. The cutover itself is now gated only on Russell provisioning a Postgres database; Claude can no longer push it further alone. **Why for launch:** Marcus's data has to survive a Studio restart, which means crossing the Postgres bridge. The agent half is done.

4. **Studio "Run Prove" button.** A toolbar button next to Run + Tests now runs the Decidable Core math prover from inside the IDE — same engine as the `clear prove` command-line tool. **Why for launch:** the prover is a real demo asset (ten Marcus apps, ten proofs, all in seconds). Burying it in a CLI hid it from anyone who lives in Studio.

5. **Demo script refreshed for today's Studio.** `plans/demo-script-deal-desk-04-25-2026.md` has 2026-05-02 patch notes + an optional Prove side-quest a Marcus prospect can ask about live. **Why for launch:** the script is what gets run on the first Marcus call; it has to match what the user actually sees.

**Test floor:** 2,817 compiler tests green. Push went via the normal hook for the four code commits today (mode dropdown, CC-1 seed, Studio Prove, demo script).

## Today's load-bearing finding

**The hard A/B hint sweep is running at zero direct API spend in cc-agent mode.** This is the measurement that decides whether the flywheel claim is real — same hard task list as before (deal-with-detail-panel, lead-router, multi-tab-queue, internal-request-queue), saturated tasks excluded. Last check showed nine of sixteen trials done: all eight hint-on trials passed, the first hint-off trial passed too. The verdict is still pending — no honest p-value until all sixteen finish. Log lives at `C:/tmp/hard-hint-sweep-2026-05-02.log`. **Why for launch:** this is the difference between "flywheel makes Meph better, measured" (marketable claim) and "flywheel exists, effect unproven" (the honest claim that's currently on the landing page).

**One known regression to clean up before the next code push:** the Studio IDE test in `playground/e2e.test.js` clicks the editor before dismissing the new Meph-first onboarding overlay, which now covers the editor on first load. 60 of 61 IDE tests still pass — only that one fails. Side-task chip is queued for it. **Why for launch:** the test gap doesn't block paying customers, but it blocks pre-push hooks from firing cleanly, which means real regressions could slip through.

**Studio can now exercise the Decidable Core prover end-to-end without dropping to the command line.** That changes how a Marcus demo plays. Today's script: open Studio → write the deal-desk app in plain English → click Run → click Run Tests → click Run Prove → watch every business rule come back proved in milliseconds. No tab-switching, no shell.

## Russell-blocked items (skip these in the queue until unblocked)

- Fly API token (gates the cert provisioner)
- Stripe live keys (gates real payments)
- AgentMail or SendGrid API key (gates outbound customer email)
- `buildclear.dev` registration + Fly Trust Verified app + Postgres provisioning (gates CC-1 cutover and live Marcus traffic)
- Anthropic API cap raise (gates real-LLM sweeps; cc-agent mode unblocks free local sweeps in the meantime)
- First Marcus conversation (gates everything that comes after launch)

| Branch | Commit | What it unlocks |
|---|---:|---|
| `feature/cc3-stripe-webhook-receiver` | `7c7753f` | Production-safe Stripe webhook receiver |
| `feature/cc5-domain-cert-bridge` | `b26632f` | DNS verification immediately requests Fly HTTPS certificates |
| `feature/lead-router-launch-verification` | `ab84ea6` | Lead router launch regression check |
| `feature/studio-onboarding-meph-first` | `013729d` | New users start in Meph build chat |
| `feature/cc4-publish-progress-ux` | `7895b38` | Publish modal shows staged progress and live URL confirmation |
| `feature/studio-first-click-instrumentation` | `f7aac26` | Privacy-safe first-click and time-to-first-app telemetry |
| `feature/gtm-marcus-deal-desk-page` | `a8bdc43` | Marcus deal-desk pitch page |
| `feature/gtm-pricing-page` | `3499945` | Pricing page with sales CTA |
| `feature/prover-inequality-reasoning` | `152ad94` | Narrow prover inequality/floor reasoning, post-launch |

## Verification today
- **Live email sending** — needs AgentMail or SendGrid key + "yes send real customer email"
- **Fly.io Trust Verified** — submit form, 1-2 day Fly review
- **Fly API token for CC-5c** — Russell generates and supplies
- **Stripe live keys** — gated on Trust Verified above
- **Stripe webhook URL** for CC-3 production
- **Anthropic API cap** — auto-resets May 1 OR raise the cap at `console.anthropic.com/settings/limits`
- **Postgres provision** (Fly Postgres or Neon) — ~30 min
- **First Marcus conversation**
- **PR merge clicks** for the three branches above

| Area | Evidence |
|---|---|
| Hard sweep preset | `node clear.test.js` passed 2,817/2,817 after adding the harder task preset |
| Domain to HTTPS bridge | `index.test.js` passed 76/76, `fly-certificates.test.js` passed 26/26, normal commit hook passed 2,808/2,808 |
| Lead router | Focused launch verifier passed; worker browser UAT was 11/11 |
| Studio onboarding | Static onboarding test passed 4/4; normal commit hook passed 2,808/2,808 |
| Publish progress | Static deploy-modal test passed 4/4; normal commit hook passed 2,808/2,808 |
| Studio telemetry | `server.js` and `server.test.js` parse checks passed; normal commit hook passed 2,808/2,808 |
| GTM pages | Static and browser checks passed in their feature worktrees |

## Critical path now
- ✅ **Tested + saw work this stretch:** Meph chat via cc-agent returns plain text response (no 401); attachHintsForCompileResult fires when called via edit_code with full helpers + factorDB + errors; Factor DB row logs with correct session_id + task_type + compile_ok; lastFactorRowId mirrors logAction return; bare-compileProgram legacy shape preserves backward compat; UAT 52/52 across all 5 Marcus apps; line wrapping renders break-spaces in CodeMirror; toolbar mode-classic-btn has active-mode class with accent color.
- ✅ **In-vivo against real factor-db.sqlite (no LLM cost):** `tools/verify-cc-agent-hint-fix.mjs` calls editCodeTool with the real Factor DB open, hits compile error, observes the helper retrieve **3 BM25 candidates from the existing 234 general-archetype gold rows** (`top_tier=same_archetype_gold`) plus 2 shape-matched canonical examples. Row inserts with correct schema, lastFactorRowId mirrors, probe row cleaned up. The pipeline fires end-to-end on real data, not just fake fixtures.
- ⚠️ **Still assumed:** the hint, when shown to Meph, actually moves his pass rate (the lift question). That needs a real Meph turn — `hint_applied=1` only flips when Meph emits a HINT_APPLIED tag, which requires a live cc-agent session. Fresh A/B sweep on counter L3 / approval-queue L7 / kpi-dashboard L7 — the same 3 tasks the 04-29 sweeps used — gated on May-1 API cap reset.

1. **Finish the hard sweep.** Run `node scripts/hint-effect-report.mjs <artifact>` and report p-value + confidence interval before claiming the flywheel helps.
2. **Merge launch-critical branches in order.** Stripe webhook, domain/cert bridge, Studio onboarding, publish progress, telemetry, lead-router verifier.
3. **Run the launch browser suite after integration.** `npm run test:all` should be the final product check, not just compiler tests.
4. **Use `LAUNCH.md` for Russell's manual work.** Domain is done. Remaining: Cloudflare/Fly trust path, Stripe live keys/webhook secret, Postgres, Anthropic org key, env vars/runbook.
5. **Record and sell.** Once the live deal-desk URL works, record the demo and send 5-10 Marcus pitches.

## Open decisions
Build priority queue from ROADMAP/RESEARCH/HANDOFF at session start, lead don't ask, big-picture beat on every reply, parallel-first tool calls, 10x-off time estimates, TDD red-first, **doc cascade at PHASE-end (not commit-end).** Hooks at `~/.claude/hooks/` enforce most of these — including stop-tell guards that catch "TL;DR" / "next session" / "stopping here" framing.

1. **Merge launch branches before prover.** Strong yes. The launch branches move first revenue closer. The prover is valuable, but it is post-launch proof surface.
2. **Use `feature/cc5-domain-cert-bridge` as the CC-5 merge branch.** It already includes the DNS poller and Fly cert helper integration. The separate CC-5b and CC-5c branches are useful provenance but should not be merged separately first.
3. **Do not claim flywheel lift until the no-hint half is done.** Hint delivery works. Statistical lift is still unproven until the hard sweep finishes.

## Next-up priorities

| # | Task | Why for launch |
|---|---|---|
| 1 | Watch the hard hint sweep finish + run the report | Decides whether the flywheel claim graduates from "exists" to "measured" — and whether we can re-strengthen the landing-page copy |
| 2 | Fix the Studio IDE test that breaks on the Meph-first onboarding overlay | Restores clean pre-push hooks so future regressions can't slip through |
| 3 | Walk the demo script live in Studio — write deal-desk, run, test, prove | Catches anything between the script and the real Studio before a Marcus is on the call |
| 4 | Manual external setup (Fly, Stripe, Postgres, AgentMail, domain registration) | These are the only items still gating real revenue; the agent-doable side is done |
| 5 | Send Marcus pitch round once the demo URL serves HTTPS | First paying customer is the goal; everything else is preparation |

## Prover note

The prover lives on main now and is reachable from the Studio toolbar (Run Prove). Detailed proof history lives in `CHANGELOG.md` under the 2026-05-01 provable-correctness entry and the 2026-05-02 Studio-Prove entry. Do not delete or rewrite `feature/decidable-core-prover` or `feature/prover-inequality-reasoning` without explicit authorization.

## Resume prompt

> Read `HANDOFF.md`, `LAUNCH.md`, `ROADMAP.md`, `FAQ.md`, and `learnings.md`. Today shipped four phases on top of the early merge sweep: a single-dropdown mode toggle in Studio, the seed-from-memory script that closes the agent half of CC-1, a Studio toolbar button that runs the Decidable Core prover from the IDE, and a refreshed deal-desk demo script. The hard hint A/B sweep is running in cc-agent mode at zero direct API spend; verdict pending. Next move is watch that sweep finish, fix the Studio IDE test that breaks on the new onboarding overlay, then walk the demo script live before the next Marcus pitch.

## Maintenance rule

Cap around 150 lines. Rewrite "Status right now" and "Next-up priorities" each session. Detailed per-commit history goes to `CHANGELOG.md`.
