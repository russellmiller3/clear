# Plan: Marcus UAT before deploy push

**Date:** 2026-05-02
**Status:** Ready
**Scope:** Verify the 5 Marcus-shaped apps actually work end-to-end before any cloud deploy. Broken apps make demo recording and customer pitch worthless — UAT is the gate.

## The 5 apps under test

Already pinned in Studio's Builder Mode tile gallery:

| App | What it does | Why a Marcus would buy it |
|---|---|---|
| **deal-desk** | Discount approvals routed to CRO with AI-drafted summary on every request over 20% | Sales-ops daily pain — replaces an inbox + spreadsheet workflow |
| **approval-queue** | Generic submit → review → approve/reject. Expenses, PTO, vendor purchases, anything | The most reusable shape; Marcus can re-skin it three times |
| **lead-router** | Score inbound leads, enrich, auto-assign by territory and segment | Replaces Zapier + custom rules in Salesforce |
| **onboarding-tracker** | Customer onboarding steps, who is stuck, how long, which CSM owns it | CS team's daily standup tool |
| **internal-request-queue** | IT, HR, and Facilities tickets — submit, classify, assign, resolve | Replaces a shared inbox + spreadsheet for ops teams |

## Baseline (compiled 2026-05-02 evening)

All 5 compile clean (0 errors). At baseline, 3 had one CSRF warning each:
- `approval-queue` line 58 — POST /api/requests missing `requires login`
- `lead-router` line 78 — POST /api/leads missing `requires login`
- `internal-request-queue` line 63 — POST /api/requests missing `requires login`

**Phase 1 status: DONE.** All 4 fixes landed (added `support-triage` line 70 fix as a bonus since it's in the codebase even though not in the canonical Marcus 5). All 5 canonical Marcus apps now compile 0 errors, 0 warnings.

## Test plan (5 phases, ~90 min total)

### Phase 1: Fix the CSRF warnings (15 min)

Add `requires login` inside the warned endpoints in the 3 apps. Re-run compile-check; expect 0 warnings on all 5.

```
node cli/clear.js check apps/deal-desk/main.clear
node cli/clear.js check apps/approval-queue/main.clear
node cli/clear.js check apps/lead-router/main.clear
node cli/clear.js check apps/onboarding-tracker/main.clear
node cli/clear.js check apps/internal-request-queue/main.clear
```

Pass criteria: 0 errors, 0 warnings on all 5.

### Phase 2: Generated tests pass (15 min)

The compiler emits a test file per app from the embedded `test:` blocks plus an auto-generated UAT contract (every button, link, input, endpoint, page).

For each app:
1. Compile + start the server: `node cli/clear.js serve apps/X/main.clear`
2. In another shell: `node cli/clear.js test apps/X/main.clear`
3. Stop the server.

Pass criteria: 0 failures per app. Skips are fine if they're documented TBD pages.

### Phase 3: Prove the rule-bearing apps (5 min)

Two of the apps have named business rules (the `rule <name>:` keyword):
- `deal-desk` — discount cap, manager approval threshold, etc.
- `lead-router` — territory routing, lead score floor, etc.

```
node cli/clear.js prove apps/deal-desk/main.clear
node cli/clear.js prove apps/lead-router/main.clear
```

Pass criteria: every named rule reads PROVED. Anything UNVERIFIABLE or DISPROVED is a red flag — either a real bug or a missing simplifier feature. Note them; don't silently ship.

### Phase 4: Manual click-through (45 min, ~9 min per app)

The compiler tests prove plumbing; this phase proves the app *feels* right. For each app:

1. **Compile + serve:** `node cli/clear.js serve apps/X/main.clear` → open the URL.
2. **Walk the nav.** Click every nav item in the sidebar. None should 404. Every page should render real content (no "TBD" stubs leaking, no `undefined`, no empty cards).
3. **Submit each form with valid data.** Capture the resulting state — does the new record appear? Did the page navigate sensibly?
4. **Submit each form with invalid data.** Empty fields, wrong types, edge cases (negative discount, future date in the past, etc.). Errors should be human-readable, not stack traces.
5. **For approval flows:** approve and reject one of each. Verify the record's status visibly updates. Verify the audit row exists if that's part of the design.
6. **For AI features:** ask the agent something. Verify the response renders cleanly (no `[object Object]`, no empty bubble).
7. **Logout / login:** if the app has auth, log out and log back in. State should persist sensibly.
8. **Open the browser console.** Zero JS errors after the full walk-through.

For each app, write a short note: "PASS / FAIL: <one-line description of any bug>".

### Phase 5: Trim the dropdown (15 min)

The Builder Mode tile gallery already pins these 5 at the top with "see more" for the rest. Two options:

**Option A (recommended):** Leave it as-is. Customers see the 5 by default; power users still find the others.

**Option B:** Hide the "see more" expander entirely until a customer asks. Edit the tile gallery render to drop the second grid.

Pick A unless a customer demos a non-Marcus template by accident. Move on.

## What "done" looks like

- All 5 apps compile clean (0 warnings)
- Generated tests green for all 5
- Both rule-bearing apps prove every named rule
- Manual click-through finds zero broken nav, zero `undefined`, zero stack traces in the console, zero dead buttons
- Each app's UAT note reads PASS

## What this unlocks

Once UAT is green, the 5 apps are demo-quality. The deploy work (Cloudflare config, dispatch namespace, API token wiring) is then ~1 hour of mechanical work, not a multi-day debug session against production.

## Order of execution

1. Phase 1 (CSRF fixes) — agent does this in-conversation, ~15 min
2. Phase 2 (generated tests) — agent runs, ~15 min
3. Phase 3 (prove) — agent runs, ~5 min
4. Phase 4 (manual UAT) — Russell drives, agent watches console, ~45 min
5. Phase 5 (dropdown decision) — 1 min discussion, no action needed if A

Total: ~80 min, mostly agent work. Russell's hands needed only for Phase 4 click-through.
