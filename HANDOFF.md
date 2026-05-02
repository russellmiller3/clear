# Handoff — 2026-05-02 (full state: merge sweep + mode dropdown + CC-1 seed + Studio Prove)

## Status right now

**Branch:** `docs/handoff-2026-05-02-full-state` (this update). Main has been the single sink for everything that landed today.

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
