# Handoff — 2026-04-25 (session 47, end-of-day)

## 🎯 Next Session: Compiler-level visual overhaul so Marcus apps look 2026 (READ THIS FIRST)

**The agent-side of Clear Cloud is shipped. What's broken is the look.** Today
shipped Publish, one-click updates, LAE safety, the ops checklist — all
mechanically working. Then I screenshotted the 5 Marcus apps and they look
like 2018 single-column-form startup landing pages. Russell graded them
D quality vs the 2026 Retool / Linear bar. He's right.

**The fix is at the compiler level — NOT individual app polish.** Per the
project's "compiler accumulates quality" rule, we redesign the compiler's
HTML emitters once and every app — including future apps Marcus or the AI
build — gets the new look on recompile. That's the leverage.

**One single-session goal.** No multi-day work. Three tracks below run in
parallel where possible.

### Track 1 — Quick bug fixes in the compiler (~30 min)
1. `{total}` template variable in headings doesn't interpolate. See Lead
   Router heading: `"{total} new leads awaiting follow-up"`. Should be the
   actual count.
2. Auth-gated home page redirects to `/login`, but the `/login` page has
   only "Use the form above" text with no actual signup/login form. The
   compiler should auto-inject the auth form on `/login` when
   `allow signup and login` is in source.
3. `apps/<name>/package.json` after `clear build` is just
   `{"type":"commonjs"}` — no dependencies. So the built app can't `node
   server.js` standalone. Fix: `clear build` should write the deps + run
   `npm install` (the test runner already does this — port that logic to
   build).
4. LAE widget script returns 404 when the app runs standalone because the
   widget is served by Studio. Either inline the widget or make standalone
   apps gracefully skip the script tag.

Track 1 unblocks visual polish — broken bugs make the screenshots harder
to grade.

### Track 2 — Build the visual target mock (~45 min)
Single static HTML file at `landing/marcus-app-target.html`. Pure HTML +
Tailwind + DaisyUI, no compiler involvement. ~250 lines. This is the
discriminator the compiler-output is graded against.

What it must show:
- Top nav: brand left, app name center, user menu right, ~56px tall
- Left sidebar: ~240px wide, sections like "Pending", "Approved", "All
  deals", with counts in muted badges
- Main panel: header row with breadcrumb + primary action button on the
  right; metrics row (4 colored stat cards, density like Stripe dashboard);
  then a sortable data table with status badges + inline action buttons
  per row; right-side panel for detail/actions
- Footer: small status line ("18 deals · synced 2 min ago")
- Empty state when no data: useful illustration + "create your first" CTA,
  not white nothing

Reference points: Linear (sidebar + density), Retool (right-rail panel),
Stripe Dashboard (stat cards + table density), Notion 2024 redesign (calm
typography), Mercury (forms that don't look like forms).

### Track 3 — GAN the compiler against the mock (~2 hours, the big one)
Iterate one section of the page-scaffold at a time. Each round:
1. Edit one of the compiler's HTML emit sites in `compiler.js` (the page
   scaffold, the section block, the form-card, the table renderer, the
   heading)
2. Recompile `apps/deal-desk/main.clear`
3. Spawn it on a port + screenshot
4. Compare side-by-side to the mock
5. Repeat until 95% visual parity

When deal-desk hits the bar, **all 6 Marcus apps get the new look for free
on recompile**. Then re-screenshot all 6 + Studio in builder mode, grade
each.

---

## Session rules in effect (summarized from ~/.claude/CLAUDE.md)

The next session MUST apply these:

- **Big-picture framing on every narration.** Every chunk says what + why-for-session-goal + what-it-unlocks. Under 25 words.
- **Phase-boundary big picture.** End of every phase fire `/bigpicture` or emit a 60-second narrative.
- **Work in parallel by default.** Batch independent tool calls in one message.
- **Time calibration: 10x off.** Above tracks are sized for one long session, not "a week."
- **Budget-first on API spend.** $0 work this whole session — keep it that way.
- **TDD red-first.** Doesn't apply to visual GAN — it's screenshot-driven instead. But fix-the-bugs work IS TDD.
- **Plain English to Russell. No code jargon. Self-check every message.**

---

## Current State
- **Branch:** `main` (synced to remote `github.com/russellmiller3/clear`)
- **Last commit:** `baf8741` — `docs+build: demo-readiness audit (GAPS.md + HANDOFF refresh) + build the 3 unbuilt Marcus apps`
- **Working tree:** dirty — `.claude/launch.json` (added 7 entries for Marcus apps + Studio builder mode), `.claude/settings.local.json`, `playground/supervisor/curriculum-sweep.js` (untouched-since-session-start). Untracked: GAPS.md, LAUNCH.md (committed but the Untracked list shows untracked artifacts like .meph-build/, temp-*.clear, etc. — none are mine).

## What Was Done This Session

- **CC-4 epic complete** (7/7 cycles): Studio Publish window ships any Clear
  app to a Cloudflare URL in 3-5 seconds. Multi-tenant routing, custom
  domain, slug uniqueness, runbook.
- **One-click updates plan complete** (Phases 1-7): edit a deployed app, hit
  Publish, ships in 2 seconds with version history + rollback + database
  schema-change safety gate.
- **LAE Phase C cycles 4+5**: destructive edits via the live widget require
  typed confirmation + reason + audit-first ordering.
- **CC-1 cycle 5**: version history of every Publish lands in Postgres
  (paused after this — off critical path until first paying customer).
- **LAUNCH.md**: 5-item Phase 85a checklist for Russell.
- **GAPS.md (initial pass)**: documented test verification — needs revision
  per the visual miss (see Section 11 below).
- **18+ commits today, all pushed.**

## What's In Progress

- **Visual GAN of the compiler (NEW — discovered this session, not started).**
  Tracks 1-3 above. This is the entire next session's work.
- **LAE Phase C cycles 6+7** (cloud destructive ship + rename detection)
  — NOT blocking demo, parked.
- **CC-1 cycles 6-9** (durable Postgres for tenants) — paused per plan,
  needed only after first paying customer.

## Key Decisions Made

- **Studio is Clear-Cloud-only.** Russell killed the Fly/Cloud picker today
  — every Publish ships to Cloudflare. Don't re-introduce a target picker.
- **No more "demo ready" claims without screenshots.** Tests are not enough
  evidence. Russell called this out.
- **Visual fix is compiler-level, not per-app.** Per the project's
  "compiler accumulates quality" philosophy. Don't redesign the 6 apps
  individually.
- **Database directive syntax change** (`local memory` → `sqlite`) — Russell
  picked IMPLICIT (target picks the driver). Multi-hour work. Defer until
  after launch.
- **Phase 7 docs** now match reality (cascade across 11 surfaces shipped
  today).

## Known Issues / Bugs

- `{total}` template variable not interpolated in compiled headings. Lead
  Router shows literal `{total} new leads awaiting follow-up`.
- `/login` page generates "Use the form above" text with no form above.
  Compiler bug — `allow signup and login` doesn't auto-inject the form.
- `clear build` writes a `package.json` without dependencies, so built apps
  can't spawn standalone. The test runner has the fix at lines ~474-498 of
  `cli/clear.js` — port to build.
- LAE widget script 404s when apps run standalone (expected by source but
  served only by Studio).
- 2 pre-existing compiler-generated DELETE-without-auth tests fail in
  `playground/server.test.js`. Not from today.
- Studio IDE Playwright suite has rotted (renamed tabs, changed template
  count). Cleanup chip waiting in Russell's queue.

## Files to Read First

| File | Why |
|------|-----|
| `HANDOFF.md` (this) | Where things stand |
| `GAPS.md` | Test-side audit (note: visual section was understated) |
| `LAUNCH.md` | Russell's 5-item paperwork checklist |
| `landing/marcus.html` | Reference for what the marketing CLAIMS the apps look like — currently a gap vs reality |
| `apps/deal-desk/main.clear` | The hero demo source — read first when tracking bugs |
| `playground/cc-4-runbook.md` | Click-by-click for the first real Publish |
| `compiler.js` | Where Track 1 + Track 3 work happens |
| `plans/plan-one-click-updates-04-23-2026.md` | The plan that shipped today |

---

## 7. Tested-vs-Assumed (NEW MANDATORY SECTION)

| Tested (saw work, with evidence) | Assumed (claimed but didn't verify) |
|---|---|
| All 5 Marcus apps `clear test`: **66 / 0** | "App looks polished" — D-grade, not B |
| `playground/deploy.test.js`: **48 / 0** | Builder mode looks Marcus-friendly — never opened it |
| `playground/server.test.js`: **212 / 2** (2 pre-existing) | The compiled apps spawn standalone — they don't (npm install gap) |
| `playground/deploy-cloudflare.test.js`: full green | The /login page has a working form — it's a heading + lying paragraph |
| `lib/edit-api.test.js`: full green | Demo recording would look professional — false |
| `runtime/meph-widget.test.mjs`: full green | The LAE widget renders on a standalone running app — 404s the script |
| `node clear.test.js`: **2586 / 0** | Templates like `{total}` interpolate at runtime — at least one doesn't |
| 18+ commits push to remote: success | All apps in dropdown work end-to-end visually — never opened most |
| Deal Desk + Approval Queue + Lead Router screenshots show actual rendering | Studio loads at `/?studio-mode=builder` correctly — never tested |

**Right column is where the next session looks for surprise bugs.**

## 8. Visual state — apps + Studio (NEW MANDATORY SECTION)

Screenshotted today (port 4101+):

| Surface | Looked at | Polish grade | What looks broken |
|---|---|---|---|
| Deal Desk home | ✅ via preview_screenshot | **D** | Single 600px column, no nav, no sidebar, miles of whitespace below, looks 2018 |
| Deal Desk /login | ✅ | **F** | Heading + paragraph saying "Use the form above" — no form exists |
| Approval Queue home | ✅ | **D** | Form rendered tiny in upper-left, ~20% of viewport, rest white |
| Lead Router home | ✅ via snapshot | **D** | Has real data (Priya/Marcus/Jenna table), but `{total}` not interpolated, single-column shape |
| Onboarding Tracker | ❌ skipped (same pattern) | — | — |
| Internal Request Queue | ❌ skipped | — | — |
| Support Triage | ❌ skipped | — | — |
| Studio in builder mode | ❌ NEVER OPENED | unknown | needs eyeballs |

**No "demo ready" claim is valid until every D/F here is at B or A.** The
visual target mock + GAN of the compiler is the cure.

## 9. Gotchas found too late (NEW MANDATORY SECTION)

Each one I should have caught earlier in the session:

- **Built apps can't spawn standalone.** `clear build` writes shield
  `package.json`, not deps. Found when first `preview_start` of deal-desk
  threw `Cannot find module 'jsonwebtoken'`. Should have tested
  `node apps/deal-desk/server.js` BEFORE writing the GAPS.md "demo ready"
  claim.
- **Auth-gated home redirects to /login but /login has no form.** Found at
  the very first screenshot. The Marcus app would 404-feel for any visitor
  who isn't already logged in. Should have screenshotted from a fresh
  browser session as part of Phase 1 of any audit.
- **Template `{total}` not interpolated.** Found in Lead Router heading.
  Compiler bug, missed by every test because tests check status codes /
  presence-of-elements, not text-content of headings.
- **Tests don't catch ugly.** 66 test passes ≠ demo-ready. Pages can render
  without errors and still look like 2014. Need a "screenshot every page"
  step in any future audit.
- **The standalone widget script 404s.** Apps reference `/__meph__/widget.js`
  which only Studio serves. Either inline the widget code at compile time
  (deploys still get the live editing chat from a hosted Meph) or make the
  script tag conditional.

**Meta-pattern**: I trusted compiler+test green as proof of "ready." It's
proof of "passes the test contract" only. Visual evidence is an
independent axis.

## 10. User mood + decision tone (NEW MANDATORY SECTION)

- **Direct, calling-out tone late in session.** Caught the visual miss
  fairly: "shitty right?" / "lots of bugs hm?" / "whats the plan stan."
  Tired but sharp.
- **Pushed for higher visual bar today.** Compared Clear to Retool, said
  "should look 2026, not bootstrap 2012." Take this as the new floor for
  any future "ready" claim.
- **Appreciated being challenged on the picker.** Killed it decisively. No
  re-litigating.
- **Doesn't want me to defer or ask "should I."** Lead more, ask less. Make
  the call, narrate it, go. He'll redirect if wrong.
- **Was tired enough to typo "/shipand," type single-word answers, drop
  punctuation.** Match shorter responses. Don't dump walls of text.

**Calibration for next session**: lead with concrete next move, screenshots
of progress, and short sentences. Don't promise; show.

## 11. What I'd do differently (NEW MANDATORY SECTION)

**One sentence**: Should have spawned + screenshotted at least one Marcus
app in the FIRST round of the audit, before writing GAPS.md and pushing
"demo ready except paperwork."

The visual miss cost ~30 minutes of correction + Russell's confidence.
Cheap fix going forward: any audit that touches user-facing surfaces
opens at least one screenshot before claiming readiness.

---

## Resume Prompt

> Read `HANDOFF.md` and continue from where we left off. The single goal
> for this session is the compiler-level visual overhaul so Marcus apps
> look 2026, not 2018. Three tracks (Track 1: 4 quick compiler bug fixes;
> Track 2: build the static HTML mock at `landing/marcus-app-target.html`;
> Track 3: GAN the compiler emitters against the mock until deal-desk hits
> 95% visual parity, then re-screenshot all 6 Marcus apps + Studio in
> builder mode). All in one long session. Apply the rules: big-picture
> framing every narration, parallel tool calls by default, plain English
> always, screenshot before claiming "ready," lead more / ask less. Main
> is at commit `baf8741` and pushed to remote.

---

## Maintenance rule

Cap ~250 lines (raised from 150 — the new mandatory sections need room).
Rewrite "Status right now" + "What was done" + "Visual state" + "Gotchas"
each session. Detailed per-cycle history goes to `CHANGELOG.md`.
