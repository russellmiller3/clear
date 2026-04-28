# Handoff — 2026-04-28 morning (overnight loop: snap layer + UAT contract + CSV export shipped)

> **Read this section first. The earlier handoffs below preserve queue primitive context.**

## Where you are when you wake up

**You're on `main`, with three more shipped landings on top of the queue primitive.** All overnight branches merged in cleanly and pushed to `origin/main` with hooks. Test count: **2671 → 2684 (queue) → 2690 (csv)** + 18 snap-layer unit tests + 21 UAT-contract unit tests in their own files. All 8 core templates still compile clean.

### What shipped overnight (3 ships, plain English)

**1. The "snap layer" — the AI assistant can no longer end a turn with broken Clear on screen.** When Meph indicates he's done but the source still has compile errors, the system automatically asks him "you have N errors, fix these before stopping" and he re-rolls. Up to 3 retries. The user only sees the converged output. Same UX as full grammar-constrained generation, 5% of the implementation cost, no model swap. Disable with `SNAP_LAYER_OFF=1`. Pure-function decision + message-format helpers in `playground/snap-layer.js` (18 unit tests). Wired into the chat URL at the end-of-turn detection.

**2. The UAT contract — every compiled app now describes itself.** `compileProgram(source).uatContract` returns a structured JSON description of every page, route, button, form, and API call in the program. This is the discriminator that future test generators walk to know what to assert. Cherry-picked from the Codex stash (the JSON-contract layer only — Codex's full browser-test generator + Playwright runner is still in the stash for a follow-up session). Lives in `lib/uat-contract.js` (340 lines, 21 unit tests). All 8 core templates produce populated contracts.

**3. CSV export comes free with every queue.** Every `queue for X:` block now auto-emits `GET /api/<entity>/export.csv` — a plain CSV download of every row, with proper RFC 4180 escaping (commas, quotes, newlines wrapped + doubled correctly) and sensitive fields (password / token / api_key / secret / hash) automatically omitted. Marcus's GTM list explicitly called this out as MVP. Suppress with `no export` clause inside the queue body when an entity should never expose data via CSV.

**Plus a new project rule: "Build Python Alongside JS — No Drift Tax" (MANDATORY).** Any change to JS backend output requires the Python equivalent in the same commit, plus a cross-target smoke run before merge. Documented in `CLAUDE.md`.

### What was deferred (and why)

**Triggered email primitive** (the second of the three primitive plans). I started the overnight loop with the intent to ship this AFTER snap layer and Codex cherry-pick — but on reading the plan (`plans/plan-triggered-email-primitive-04-27-2026.md`), it's 13 TDD cycles with non-trivial parser disambiguation work between `when user sends X to Y` (existing endpoint syntax) and `when X's status changes to Y` (new). I judged that worth your eyes during a focused session rather than a half-shipped overnight. The plan is intact and ready for the next /pres or execute-plan run.

**Codex's browser-test generator and the deeper E2E generator** (rest of the UAT cherry-pick). The JSON contract layer is in. The Playwright runner + screenshot-diffing bits stayed in the stash — ~1000 more lines that need careful adaptation since Codex wrote them before the queue primitive landed. Worth a focused session.

**Phase 4 of queue primitive (auto-render UI buttons + history table block)**, **Cycle 2.3 (collision detection between user-defined audit tables and the auto-generated one)**, **Tier 2 of queue (multi-stage)**. Same status as the prior handoff — gated on customer evidence.

### Recent commits on `main` (newest first)

```
<csv merge>      Merge branch 'feature/overnight-04-27-csv-export'
e612ef1          feat(csv-export): every queue auto-emits /export.csv with RFC 4180 + sensitive-field filtering
<uat merge>      Merge branch 'feature/overnight-04-27-codex-uat'
9c9d5b6          feat(uat-contract): cherry-pick Codex's JSON contract walker
<snap merge>     Merge branch 'feature/overnight-04-27-snap-layer'
3875191          feat(snap-layer): wire auto-retry into /api/chat at end_turn
d30c348          feat(snap-layer): pure functions for auto-retry decision
edd7bc4          chore(rule): build Python alongside JS to prevent drift
2516e14          docs(queue-primitive): cascade across all 11 doc surfaces
```

### What I'd do first when you sit down

**Skim the snap layer in action.** Open Studio, ask Meph to "build me a contacts CRUD," watch what happens. The first time he stops with errors still on screen, you should see the loop self-correct. If you don't see it, set `SNAP_LAYER_OFF=1` to confirm the difference. Quick proof.

**Eyeball one queue's CSV download.** Run Deal Desk in Studio (`apps/deal-desk/main.clear`), navigate to `/api/deals/export.csv` — should download a CSV with the seed deals, no password fields, properly escaped commas. About 2 minutes of clicks for the proof point.

**Then pick from the in-flight list:**
1. Triggered email primitive (the deferred one — plan ready, ~3-5 hours of careful TDD)
2. Codex's browser-test generator (the other deferred chunk — would marry beautifully with the UAT contract that just shipped)
3. External setup (Fly Trust Verified, Stripe live keys, Anthropic org key, Postgres provision)
4. First Marcus conversation (the actual launch event)

### Critical-path standing (unchanged from prior handoff)

The product is meaningfully ready. Items 3 and 4 above are still the launch gate — couple hours of your time + a real conversation. Everything overnight raised quality but didn't directly unblock the first paying customer.

---

## Where you are when you sit down

**You're on `main`, with the queue primitive fully shipped.** The `feature/queue-primitive-tier1` branch was merged in (no-ff) and the doc cascade landed across all 11 surfaces. `main` (now matching `origin/main`) carries:

1. `79b2bcb` — research docs + plans + Cycle 1.1 (parser)
2. `b011b1f` — Cycles 1.2 + 1.3 (notify clauses + error paths)
3. `71b3573` — Phase 2 (auto-emit decisions + notifications tables)
4. `c3dcdec` — Phase 3 (auto-emit URL handlers)
5. `ea5c63b` — Auth-gate the per-action URLs
6. `64ccd0d` — Deal Desk migrated to use `queue for deal:`
7. `76bce79` — 3 more Marcus apps migrated (Approval Queue, Onboarding Tracker, Internal Request Queue)
8. `2516e14` — Doc cascade across 11 surfaces (intent, SYNTAX, AI-INSTRUCTIONS, FEATURES, CHANGELOG, USER-GUIDE, FAQ, ROADMAP, playground/system-prompt, landing/marcus.html, FAQ TOC links)
9. Merge commit closing the epic

Test count: **2671 baseline → 2684** (+13 from queue primitive cycles). All 8 core templates compile clean (0 errors; pre-existing warnings only). Deal Desk's own 16 in-app tests pass green, including "can user approve a deal" which exercises the auto-generated PUT URL. Pre-push hook on `main` ran the full test suite + Meph eval and passed.

The `feature/queue-primitive-tier1` branch still exists locally + remote — fully merged, safe to delete (`git push origin --delete feature/queue-primitive-tier1` + `git branch -d feature/queue-primitive-tier1`).

## What shipped tonight (in plain English)

You can now write this in any Marcus app:
```
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject, counter, awaiting customer
  notify customer on counter, awaiting customer
  notify rep on approve, reject
```

…and the language gives you, for free:
- A `deal_decisions` audit table (who acted, what, when, with what note, what status it moved to)
- A `deal_notifications` outbound queue table (who to notify, role, email, type, status)
- `GET /api/deals/queue` — filtered by pending status
- `GET /api/deal-decisions` — full audit history view
- `GET /api/deal-notifications` — notification log view
- `PUT /api/deals/:id/approve`, `/reject`, `/counter`, `/awaiting` — each one:
  - Requires login (auth gate)
  - Updates the deal's status to the right terminal value
  - Inserts an audit row with reviewer + timestamp
  - Inserts notification rows for the listed roles, resolving recipient_email by convention (`customer` role → `customer_email` field)
  - Returns the updated record

That's roughly **150 lines of JavaScript hand-rolling per app, replaced by 5 lines of declaration**, with auth + audit + notifications it didn't have before. 4 of your 5 Marcus apps now use it.

**Lead Router was deliberately NOT migrated** — it's automated routing, not human approval. Different shape. Probably needs its own primitive (`routing rules for X:`) someday.

## Codex (GPT) stash review — what's in `git stash list` stash@{0}

**You wrote that the stashed WIP was Codex's work, not yours.** I evaluated all 5,403 lines of insertions across 25 files. Verdict:

### KEEP (cherry-pick into a follow-up session)

**The UAT contract + browser-driven test system in compiler.js (~700 lines).** This is the standout find. Codex built:
- `generateUATContract(body)` — walks the AST and extracts every control (button, action, link), every route, and what each one is supposed to DO. Output is a JSON contract.
- `generateBrowserUAT(contract)` — generates browser-driven tests that hit every route + click every control + screenshot. Written for the Playwright pattern.
- Helpers: `normalizeUATRoute`, `isInternalUATRoute`, `stableUatId`, `collectUATVisibleText`, `routeUrl`, `pageByRoute`, `screenshotName`, plus a deeper `generateE2ETests` that takes the UAT contract.
- Plus CLI side: `writeGeneratedUATArtifacts`, `staticTestServerCode`, `formatIssue` in `cli/clear.js`.

**This is exactly what the queue primitive plan's Phase 2 calls for under "compiler improvements" — the auto-extracted UAT contract that catches dead buttons, missing routes, fake passes, and console errors.** Codex built the right thing. Cherry-pick it.

**Cloudflare packaging test fixes in `lib/packaging-cloudflare-*.test.js` (~48 lines).** Independent of the queue primitive. Worth keeping.

**Small validator improvements (`validator.js` +17 lines).** Field-name validation tightening. Low-risk keep.

### REPLACE WITH MY WORK (queue primitive supersedes)

**Deal Desk hand-rolled pipeline** (`apps/deal-desk/main.clear` +637, `server.js` +625, `test.js` +987, `index.html` +1028, `style.css` +92).
- Codex hand-rolled `DealDecisions` + `ApprovalNotifications` tables, action URLs, status transitions, audit inserts, notification queues.
- My queue primitive does ALL of this generically, in 5 lines of declaration.
- The migrated Deal Desk app on this branch is cleaner: 377 lines vs Codex's ~1000 lines of additions.
- **Keep the queue primitive version. Discard Codex's hand-rolled.**
- HOWEVER — the HTML/CSS visual work might have polish worth grafting in. Worth a 15-min visual eyeball before discarding.

### REGENERATE (auto-output, no human content)

`apps/deal-desk/server.js`, `apps/deal-desk/test.js`, `apps/deal-desk/index.html` — all auto-generated by the compiler from `main.clear`. No need to keep stashed copies; they regenerate on next compile.

### DISCARD

- Old doc updates in `CHANGELOG.md`, `FAQ.md`, `FEATURES.md`, `ROADMAP.md` that documented Codex's hand-rolled approach.
- Old `HANDOFF.md` content (Codex tidying, not feature work).
- Skill file tweaks in `.claude/skills/{execute-plan,red-team-plan,write-plan}/SKILL.md` — small tweaks Codex made, worth a glance but not load-bearing.

### Recovery commands

```
# Bring the UAT compiler infrastructure back, file by file:
git checkout stash@{0} -- compiler.js cli/clear.js
# Then carefully strip out the Deal Desk-specific bits (which queue primitive supersedes)
# and keep just the UAT contract + browser-test generation.

# OR — if you want all Codex's work back to evaluate side-by-side:
git stash apply stash@{0}
# Then resolve conflicts. The biggest conflict will be compiler.js since
# I added compileQueueDef in the same file.
```

The stash is at `stash@{0}` with message "WIP-pre-queue-primitive-2026-04-27". It survives a session restart, but NOT `git stash drop` or `git reset --hard`.

## Critical path to first paying customer (unchanged from previous handoff)

The product is meaningfully ready. The gating items are mostly setup work you own.

1. ✅ Push branch — done previously
2. ✅ Register `buildclear.dev` domain — done
3. **Fly.io Trust Verified app** — submit form, ~1-2 day review
4. **Stripe live keys** — ~30 min once #2 + #3 done
5. **Anthropic org key for paid Meph sessions** — ~15 min in console
6. **Postgres provision** (Fly Postgres or Neon) — ~30 min
7. **First Marcus conversation** — conversation move
8. **Watch them build, fix what bites** — pair with Claude

## What I'd do next when you're back — RANKED for the next session

Ordered the way I'd actually pick them. Skim the P0 list, pick what fits your energy, ignore the rest.

### P0 — Finish the in-flight epic (the queue primitive is 90% done; close it before opening anything else)

**1. Eyeball the queue primitive on Deal Desk** (~10 min). Start a Studio preview of `apps/deal-desk/main.clear`. Click around. Confirm the queue page loads, the per-action URLs respond, the audit history URL returns rows. This is the proof a real Marcus would see. If it breaks, fix before doing anything else below.

**2. Doc cascade for the queue primitive** (~30-45 min). Touch the 11 surfaces project CLAUDE.md requires. Highest-impact subset: `intent.md` (node-type row), `SYNTAX.md` (canonical example), `AI-INSTRUCTIONS.md` (when-to-use), `FEATURES.md` (capability row), `CHANGELOG.md` (session entry), `playground/system-prompt.md` (so Meph knows). The remaining 5 surfaces are nice-to-have. Doc cascade is gating the merge to main.

**3. Optional sharpening before merge:**
   - `/red-team-plan` against `plans/plan-queue-primitive-tier1-04-27-2026.md` (~15 min) — looks for gaps in cycles I deferred (Phase 4 UI auto-render, Cycle 2.3 collision detection, Phase 5 validator). May surface things worth fixing before merge.

**4. Merge the queue primitive to main with `/ship`** (~5 min). Closes the epic. 8 commits + ~370 lines of compiler code + 4 of 5 Marcus apps now use it.

### P1 — Real-money decisions you have to make

**5. Decide on Codex's UAT compiler stash.** Two paths:
   - **Cherry-pick now** (1-2 hour session). Bring back the UAT contract + browser-test generation. This is the highest-value piece in Codex's stash and exactly what queue primitive Phase 4 calls for. If you cherry-pick, do it BEFORE the triggered-email primitive so the new primitive can use the contract for its visual contract section.
   - **Defer until after Marcus #1.** Queue primitive covers what Marcus needs today. UAT contract is quality-of-life for customers #2-5. Defer-able.
   - **My lean: cherry-pick now.** Codex did real work, it's exactly what your plan called for, and waiting risks the stash getting stale or accidentally dropped.

### P2 — Next primitives (after queue primitive ships)

**6. Triggered email primitive.** Plan at `plans/plan-triggered-email-primitive-04-27-2026.md`. 7 phases, 13 cycles. ~2-3 iterations. Big unlock: every Marcus app gets notification emails for free.

**7. CSV export primitive.** Plan at `plans/plan-csv-export-primitive-04-27-2026.md`. 5 phases, 7 cycles. Smallest of the three. ~1 iteration. Big unlock: every queue page gets a Download CSV button automatically — explicit MVP item from your GTM doc.

### P3 — Outside-of-code things only you can do

**8. External dependencies (Fly Trust Verified, Stripe live keys, Anthropic org key, Postgres provision).** ~$30-50 + 2-3 hours. Unblocks the first paying customer directly. Per the existing critical-path list. These can run in parallel with everything else.

**9. First Marcus conversation.** Conversation, not code. The product is meaningfully ready for the demo path. The 4 migrated Marcus apps now actually do something when buttons get clicked.

### P4 — Deferred items (don't do until evidence demands)

- **Queue primitive Phase 4 (UI auto-render in tables).** Invasive. Most apps will hand-add buttons that call the auto-generated URLs. Defer until a customer actually complains.
- **Queue primitive Cycle 2.3 (collision detection between user-defined `<Entity>Decisions` table + queue-generated one).** Validator-level safety. Add when first customer trips it.
- **Multi-stage workflow (Tier 2 of queue primitive).** Defer until a second workflow app exists (expense tracker is the natural next).
- **Lead Router migration.** Doesn't fit queue primitive shape. Probably needs its own `routing rules for X:` primitive someday — design when you have a second routing app to validate against.
- **Connector platform integration code (Composio / Nango).** Defaults are decided in the research doc. Don't build until the first AI assistant or admin panel needs to call out.
- **Settings page primitive, Trello board view, full event sourcing.** All deferred per research evidence — Marcus's flow doesn't need them.

### Rules of thumb for the next session

- Finish #1-#4 first (close the queue epic) before starting anything in P2.
- Don't open more than 2 epics at once. Currently in-flight: queue primitive (90% done) + Codex stash decision. That's the limit.
- Doc cascade BEFORE merge — project CLAUDE.md is strict about this.
- Russell's P3 work runs in parallel with all of the above (different surface).

## Loose ends

- The queue primitive's UI auto-render (Phase 4 of its plan) is DEFERRED. The primitive emits backend correctly; UI buttons + history table block in the page are not auto-emitted. App authors hand-add UI that calls the auto-generated URLs. Acceptable for Tier 1 / Marcus MVP. Worth coming back to with Codex's UAT contract work.
- Cycle 2.3 (collision detection — user-defined `<Entity>Decisions` table colliding with auto-generated) is DEFERRED. Not blocking but should land before customers start writing.
- Two new global rules in `~/.claude/CLAUDE.md` are uncommitted: "Research Like a Journalist for Product Questions" + "Kill Stalled Research Workers Fast". These survive a session restart but NOT a destructive git op.

## Files to read for fuller context

| File | Why |
|------|-----|
| `snapshots/marcus-market-evidence-04-27-2026.md` | Full research evidence — wedge thesis upgraded to STRONG after cross-platform research; connector decision split into 3 lanes (Composio for AI tool calls, Nango for direct integration, direct webhook for Slack/Discord/Teams) |
| `snapshots/marcus-primitives-decomposition-04-27-2026.md` | Top 5 apps + 3 primitives + which lane to pick for each connector need |
| `plans/plan-queue-primitive-tier1-04-27-2026.md` | The plan I just executed — Phases 1, 2, 3, 7 done; Phases 4, 5, 6, 8-other-apps deferred |
| `plans/plan-triggered-email-primitive-04-27-2026.md` | Next primitive — REVIEW FREEZE pending your go |
| `plans/plan-csv-export-primitive-04-27-2026.md` | Third primitive |

---

# Older handoff (preserved for context)

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

Current repo state (now stale — see top of file for current state):
- Branch: `main`.
