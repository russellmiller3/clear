# Handoff - 2026-05-01 (launch fan-out + hard flywheel measurement)
# Handoff — 2026-04-29 evening (post Studio polish + cc-agent hint pipeline closed)

## Status right now

**Main worktree branch:** `feature/flywheel-measurement-retrieval`.
- **Local branch:** `feature/cc-agent-hint-pipeline`. Three logical stretches bundled on this PR (8 commits ahead of main):
  1. Desktop launcher + crystal icon (`start-clear.bat`, `clear-icon.ico`, desktop shortcut)
  2. Studio polish (toolbar Dev | Builder switcher, line wrap in editor)
  3. Meph routing through Claude Code CLI (launcher sets `MEPH_BRAIN=cc-agent` + `GHOST_MEPH_CC_TOOLS=1`)
  4. cc-agent hint pipeline closed (cycles 1+2+4: helper extracted from compileTool, edit_code calls it + logs the Factor DB row first)
  5. Doc cascade — CHANGELOG, learnings.md, ROADMAP, plan + snapshot artifacts
- **Two other branches sit on origin awaiting your merge click** from earlier in the day:
  - `feature/desktop-launcher` (the launcher cherry-pick — superseded by the bigger PR above; can drop)
  - `feature/honest-flywheel-claim` (softens `landing/how-meph-learns.html` + `RESEARCH.md` to research-grade with current state callouts; independent change, worth keeping as its own PR)
- **The pre-existing `feature/cc-5b-dns-poller` branch** has 24 unmerged commits including the actual CC-5b TDD work (F1.1-F1.4 + doc cascade) and a bunch of general improvements from prior sessions. CC-5b is functionally done on that branch but never merged to main. Worth a clean merge before starting CC-5c.
- **Tests at end of stretch:** 2773 compiler + 289 meph-tools (was 277) — all green. UAT 52/52 across all 5 Marcus apps. 12 new tool tests cover the cc-agent hint pipeline.
- **Studio is currently running on PID 2168 (port 3456)** with `MEPH_BRAIN=cc-agent` + `GHOST_MEPH_CC_TOOLS=1` set. Meph chat works via Claude Code CLI without an Anthropic API key. Tool mode is mandatory on Windows (text mode loses a stdin race per a known cc-agent.js comment).

## Today's load-bearing finding

**The flywheel claim has been measured against an unreachable code path.** Diagnostic in `snapshots/flywheel-cc-agent-hint-gap-2026-04-29.md`: 386 cc-agent rows had `hint_applied=NULL` because edit_code's auto-compile bypassed `compileTool` (where the retrieval lived). All three honest 2026-04-29 sweeps (counter L3, approval-queue L7, kpi-dashboard L7) showed 0% / -20% / 0% lift because both conditions had zero hints. Cycles 1+2+4 of the hint pipeline plan close this — `attachHintsForCompileResult` is now called from BOTH compileTool and editCodeTool, and edit_code logs a Factor DB row first so post-turn HINT_APPLIED tracking points at the right row.

**Live verification deferred until May 1** — fresh A/B sweep on the same 3 tasks once the Anthropic cap clears. If hint_on > hint_off, the marketing copy I just softened on the honest-flywheel-claim PR can be re-strengthened with measured evidence.

**Active run:** hard hint A/B sweep started 2026-05-01 12:16 PT. It uses hard tasks only: `deal-with-detail-panel`, `lead-router`, `multi-tab-queue`, and `internal-request-queue`. Saturated tasks are excluded. Hint-on finished **11/12**. Hint-off is still running. Log: `playground/sessions/hard-hint-sweep-20260501-121600.log`.

**Launch branch fan-out is complete.** Each item is one branch and one small feature commit:
1. **Merge the three open PRs to main** (~15 min total). `feature/cc-agent-hint-pipeline` is the big one (8 commits, three logical stretches). `feature/honest-flywheel-claim` is independent and small (2 files, 13 lines). `feature/desktop-launcher` is superseded — close without merging. **Why for launch:** Studio's polish + cc-agent fix only benefit users when on main; right now they're branch-only.

2. **Merge `feature/cc-5b-dns-poller`** (the older 24-commit branch). CC-5b is done on it but never merged. Includes general improvements from prior sessions too. Safer to merge as-is since all 24 commits are real shipped work. **Why for launch:** CC-5b is what flips "Verifying DNS" to "Verified" — the attach UX needs it.

3. **CC-5c Fly cert provisioner** (~30 lines, BLOCKED on Russell providing a Fly API token). When a domain flips `verified`, call Fly's `/v1/apps/:app/certificates` API. **Why for launch:** customers' domains need to serve HTTPS, not just resolve.

4. **CC-3 Stripe webhook receiver** (~1 hr code, BLOCKED on Russell providing Stripe live keys). Wire production webhook URL; test in Stripe test mode until live keys land. **Why for launch:** customers can't pay until this AND live keys land.

5. **Fresh A/B hint sweep** (post May-1 API-cap reset, ~$5-7). Same 3 tasks the 2026-04-29 sweeps used. Measures whether cycles 2+4 actually deliver positive lift on Meph's pass rate. **Why for launch:** if positive, the flywheel claim can be re-strengthened with evidence; if negative, investigate hint quality / ranker (separate epic).

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

| # | Task | Why |
|---|---|---|
| 1 | Finish/analyze the hard sweep | This decides whether hints are real lift or just a nice story |
| 2 | Integration branch for launch-critical work | Branches exist, but launch needs them together |
| 3 | Full browser launch regression | Russell asked for every feature browser-tested and caught in suite |
| 4 | Manual launch checklist | External setup is now the biggest blocker |
| 5 | Prover follow-up | Keep it alive after revenue path is safe |

## Prover note

The prover branch remains valuable and should be merged after launch-critical branches. Detailed proof history lives in `CHANGELOG.md` under the 2026-05-01 provable-correctness entry. Do not delete or rewrite `feature/decidable-core-prover` or `feature/prover-inequality-reasoning` without explicit authorization.

## Resume prompt

> Read `HANDOFF.md`, `LAUNCH.md`, `ROADMAP.md`, `FAQ.md`, and `learnings.md`. The current launch state is: hard flywheel sweep running, hint-on 11/12, hint-off pending; launch feature branches cut and committed; domain registered; manual external setup remains in `LAUNCH.md`. Next move is finish the sweep, analyze significance, then integrate launch-critical branches before returning to prover work.

## Maintenance rule

Cap around 150 lines. Rewrite "Status right now" and "Next-up priorities" each session. Detailed per-commit history goes to `CHANGELOG.md`.
> Read HANDOFF.md and start on item 1 — merge the three open PRs to main (the cc-agent-hint-pipeline branch is the big one). Apply the session rules in `~/.claude/CLAUDE.md`. Current main commit: `bb0abae`. Studio is running on port 3456 with MEPH_BRAIN=cc-agent — keep it running or restart via the desktop crystal icon.
