# Handoff - 2026-05-01 (launch fan-out + hard flywheel measurement)

## Status right now

**Main worktree branch:** `feature/flywheel-measurement-retrieval`.

**Active run:** hard hint A/B sweep started 2026-05-01 12:16 PT. It uses hard tasks only: `deal-with-detail-panel`, `lead-router`, `multi-tab-queue`, and `internal-request-queue`. Saturated tasks are excluded. Hint-on finished **11/12**. Hint-off is still running. Log: `playground/sessions/hard-hint-sweep-20260501-121600.log`.

**Launch branch fan-out is complete.** Each item is one branch and one small feature commit:

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

1. **Finish the hard sweep.** Run `node scripts/hint-effect-report.mjs <artifact>` and report p-value + confidence interval before claiming the flywheel helps.
2. **Merge launch-critical branches in order.** Stripe webhook, domain/cert bridge, Studio onboarding, publish progress, telemetry, lead-router verifier.
3. **Run the launch browser suite after integration.** `npm run test:all` should be the final product check, not just compiler tests.
4. **Use `LAUNCH.md` for Russell's manual work.** Domain is done. Remaining: Cloudflare/Fly trust path, Stripe live keys/webhook secret, Postgres, Anthropic org key, env vars/runbook.
5. **Record and sell.** Once the live deal-desk URL works, record the demo and send 5-10 Marcus pitches.

## Open decisions

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
