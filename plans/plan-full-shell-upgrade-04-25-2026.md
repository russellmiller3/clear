# Plan — Full Shell Upgrade (compiled apps look like the 2026 mock)

**Date:** 2026-04-25
**Companion files:**
- `landing/marcus-app-target.html` — the visual target (the mock)
- `plans/flywheel-overview-04-25-2026.md` — the 3-streams + 2-loops picture
- `plans/plan-flywheel-hardening-04-25-2026.md` — the pre-work that landed first
- `RESEARCH.md` — the deeper architecture

**Pre-work landed:**
- `0a10f63` — 4 compiler bug fixes + design tokens (Inter font, slate palette, hairline classes, status pill helpers, wider page wrapper)
- `cea511c` — flywheel hardening jobs A + C (runtime beacons → ledger; compiler-edit auto-log via post-commit hook)

---

## What this plan does in plain English

Today's commits gave every Clear app the right COLORS and the right FONT. Apps look perceptibly cleaner — D-grade became a B-minus. But the SHAPE of compiled apps is still wrong. They're still a single column on a page. The mock is a 3-column app shell with a top bar, a left navigation rail, a main panel with stat cards and a real table, and a right detail panel that slides in when you select a row.

This plan is the work to teach the compiler how to PRODUCE that shape. It needs new ways to write apps in Clear (for the navigation, the stat cards, the right panel), new logic in the compiler to emit them as polished HTML, and a port of all 6 Marcus apps to use them. It is multi-session work — 5 to 7 focused chunks.

The payoff: every Clear app — Marcus's 6, Meph-built apps, future customer apps — gets the same chrome on recompile. One bar, raised once.

---

## Why this is hard

Today's tokens upgrade was easy because it was all CSS — change three constants, every app inherits. The full upgrade is hard because:

1. **New SHAPE primitives don't exist in Clear yet.** No `top nav`, no `left rail with sections`, no `stat strip`, no `right detail panel`. The author can't ask for them because the language has no words for them.
2. **Each new primitive is a 6-touchpoint change.** New keyword in `synonyms.js` → new node type in `parser.js` → new validation in `validator.js` → new HTML emit in `compiler.js` → new doc rows in 11 surfaces → new examples in core templates. Cut corners on any of these and Meph hallucinates wrong syntax in future builds.
3. **The presets that exist (`app_layout` / `app_sidebar` / `app_main` / `app_header`) are basic flex containers** — they render but they don't LOOK like the mock.
4. **The mock has interactivity** — selecting a row opens the right rail, sortable columns, hover-revealed action buttons. The compiler currently emits static tables.
5. **Each Marcus app's source has to be edited** to use the new primitives.
6. **The grading loop is slow.** Each round = recompile, restart server, screenshot, compare side-by-side, fix one section, repeat.

---

## Flywheel touchpoints — what EVERY phase ships

Every phase below ends with the SAME 4 deliverables, not just the compiler delta. This is the flywheel-baked-in version (per Russell's call 2026-04-25):

1. **Compiler delta** — parser + validator + emit + tests
2. **Doc cascade across 11 surfaces** — `intent.md`, `SYNTAX.md`, `AI-INSTRUCTIONS.md`, `USER-GUIDE.md`, `ROADMAP.md`, `landing/*.html`, `playground/system-prompt.md`, `FAQ.md`, `RESEARCH.md`, `FEATURES.md`, `CHANGELOG.md`
3. **Meph delta — `playground/system-prompt.md`** explicitly updated so Meph knows about the new primitive the moment it ships (this is item 7 in the doc cascade list — calling it out separately because skipping it makes the new primitive invisible to Meph until next prompt regen)
4. **Curriculum delta — 1-2 tasks in `playground/supervisor/curriculum-tasks/`** that exercise the new primitive, so it lands in the next training sweep automatically
5. **Eval delta — a chrome check** added to the existing eval harness that grades "did the compiled output use the new primitive when expected?" — gives the friction script a measurable signal that the upgrade actually moved Meph's behavior

**Why all five:** without these, the compiler delta lands, but the flywheel doesn't know. Next sweep doesn't exercise it. Meph doesn't try it. The shell upgrade ships visually but the data doesn't compound. Each phase explicitly owns its training-side delta, not just the compiler-side.

---

## Phases

7 phases. Each ends with a green test gate AND a screenshot comparison against the mock AND the 4 flywheel deliverables.

### Phase 1 — Polish the existing app_* presets (1 session)
**Scope:** Upgrade the HTML emit for `app_layout`, `app_sidebar`, `app_main`, `app_header` so they look like the mock without any new syntax.
**Why first:** Lowest-risk wedge. The keywords exist. Templates that opt in get the upgrade for free. No backward-compatibility concern beyond visual.
**Compiler delta:**
- `app_layout` → `<div class="flex min-h-screen">` with proper sizing
- `app_sidebar` → 240px rail with the new chrome tokens, hairline-r, scroll-y, room for section labels + nav-item rows
- `app_main` → `<main class="flex-1 min-w-0 flex flex-col">`
- `app_header` → 56px sticky header with brand-slot + breadcrumb-slot + action-slot
**Tests:** 5-8 emit tests covering classes + structure for each preset.
**Doc cascade:** all 11 surfaces.
**Meph delta:** update `playground/system-prompt.md` with the new emit shape so Meph knows what `app_layout` produces.
**Curriculum delta:** 1 new task `app-shell-basics` that requires using all 4 presets.
**Eval delta:** chrome-check assertion — output contains `<aside ... 240px>` AND `<header ... 56px>`.
**Acceptance:** a hand-written .clear file using all 4 presets compiles to a page within 70% of the mock chrome.

### Phase 2 — Sidebar nav items + counts + active state (1 session)
**Scope:** New syntax: `nav item 'Pending' to '/cro' with count pending_count` and `nav section 'Approvals'`.
**Why second:** The sidebar is the chrome users notice most. Without nav items it's empty.
**Syntax additions:**
- `nav section 'TITLE':` — section label grouping items
- `nav item 'TITLE' to '/path':` — link with optional `with count VAR` and `with icon NAME`
**Compiler delta:**
- New node types `NAV_SECTION` + `NAV_ITEM`
- Active-state detection at runtime: read `location.pathname`, toggle `is-active` on the matching item
**Tests:** 6+ covering parse, validate, emit, runtime active-state.
**Doc cascade:** all 11 surfaces.
**Meph delta:** system-prompt entry for nav syntax with example.
**Curriculum delta:** 1 task `dashboard-with-nav` that has 3 sections + 6 items + counts.
**Eval delta:** chrome-check — output contains `[data-nav-item]` elements with counts AND one has `is-active`.
**Acceptance:** an app with 3 nav sections + 9 items renders with right active stripe per route.

### Phase 3 — Page header + tab strip (1 session)
**Scope:** `page header 'Title':` block with title + subtitle + actions slot. Plus `tab strip:` for filter chips.
**Syntax:**
- `page header 'Title':` with `subtitle 'TEXT'` + `actions:` slot
- `tab strip:` with `tab 'Pending' to '/route'` items + optional `active tab is X`
**Compiler delta:** HTML emit produces 26px h1 + muted subtitle + right-aligned button row. Tab strip uses underline-style active tab.
**Tests:** 5+ for parse + emit.
**Doc cascade:** all 11 surfaces.
**Meph delta:** system-prompt entry.
**Curriculum delta:** 1 task that has a multi-tab queue page.
**Eval delta:** chrome-check — output has h1.text-2xl + a `[data-tab-strip]` element with active tab marked.
**Acceptance:** Deal Desk's CRO page header (title + "5 deals waiting" + Refresh/Export/+New buttons) emits correctly.

### Phase 4 — Stat cards + sparkline (1 session)
**Scope:** `stat card 'Pending count': value pending_count, delta '+1.8 pts vs last week'`.
**Syntax:**
- `stat strip:` wraps a row of stat cards
- `stat card 'LABEL':` with `value EXPR`, optional `delta 'TEXT'`, `sparkline DATA_LIST`, `icon NAME`
**Compiler delta:**
- New node types `STAT_STRIP` + `STAT_CARD`
- HTML emit: polished card with big tabular num value, uppercase label, +/- arrow on delta with green/red color
- Sparkline: tiny inline SVG path drawn from a list of numbers
**Tests:** 8+ covering all optional slots.
**Doc cascade:** all 11 surfaces.
**Meph delta:** system-prompt entry with stat card example.
**Curriculum delta:** 1 task `kpi-dashboard` requiring a stat strip with 4 cards + sparkline.
**Eval delta:** chrome-check — output has `[data-stat-card]` × 4, tabular nums, deltas with arrows.
**Acceptance:** Deal Desk's metric strip (Pending Count / Avg Discount / Value At Stake / 7-day Approvals) emits matching the mock.

### Phase 5 — Real data tables (1-2 sessions)
**Scope:** Upgrade `display X as table` to produce mock-quality tables.
**Compiler delta:**
- Auto-detect column types: `status` field → colored pill; name/email/customer → avatar circle; numeric money → tabular nums right-aligned
- New row-action syntax: `with actions: approve, reject, review` → hover-revealed icon buttons that POST to right endpoints
- Selectable rows: when a `right detail` panel is declared (Phase 6), clicking a row toggles `is-selected` + populates panel
- Sortable headers: `<th>` with click-to-sort using existing sort state machine
**Tests:** 12+ covering pills / avatars / actions / sort / selection.
**Doc cascade:** all 11 surfaces.
**Meph delta:** system-prompt entry covering pills/avatars/actions/sort syntax.
**Curriculum delta:** 1 task `pending-queue-table` with status pills + actions + sort + selection.
**Eval delta:** chrome-check — table rows have `[data-row-actions]`, status field renders as `.clear-pill`, headers are sortable.
**Acceptance:** Deal Desk's pending queue table renders with colored Pending/Approved pills, avatars, hover-revealed Approve/Reject, sortable columns, row selection.

### Phase 6 — Right detail panel (1 session)
**Scope:** `detail panel:` block that renders a 340px right rail when a table row is selected.
**Syntax:**
- `detail panel for SELECTED_ROW:` with indented content
- Inside: any Clear primitives, sticky `actions:` bar at the bottom
**Compiler delta:**
- New node type `DETAIL_PANEL`
- HTML emit: 340px aside with internal scroll body + flex-shrink-0 sticky-bottom action bar
- Wires up to row-selection state from Phase 5
**Tests:** 6+ for panel emit + row-selection wiring.
**Doc cascade:** all 11 surfaces.
**Meph delta:** system-prompt entry.
**Curriculum delta:** 1 task `deal-with-detail-panel` that requires the panel pattern.
**Eval delta:** chrome-check — `<aside ... 340px>` AND row-selected state populates panel content.
**Acceptance:** Deal Desk's right rail renders AI summary + risk score bar + deal facts + Reject/Counter/Approve action bar, populated from selected row.

### Phase 7 — Marcus app port + visual GAN to 95% parity (1 session)
**Scope:** Edit each Marcus app's `.clear` source to use the new primitives. Recompile, screenshot, grade Deal Desk against the mock. Iterate one section at a time until 95% parity. Re-grade the other 5 + Studio in builder mode.
**Apps to port:**
- `apps/deal-desk/main.clear` — full mock parity (primary target)
- `apps/approval-queue/main.clear`
- `apps/lead-router/main.clear`
- `apps/onboarding-tracker/main.clear` (defer progress-bar primitive — out of scope)
- `apps/internal-request-queue/main.clear`
- `apps/support-triage/main.clear`
- 8 core templates — quick smoke test, no full parity required
**Acceptance:** Deal Desk hits 95% parity. Other 5 Marcus apps hit ≥80%. All 8 core templates compile clean and look at least as good as before.
**Studio builder mode:** screenshot at `/?studio-mode=builder` and confirm chrome reaches Studio.
**Doc cascade:** update `landing/marcus.html` examples + screenshots.
**Meph delta:** none (no new primitives — port is consumption).
**Curriculum delta:** none.
**Eval delta:** the existing chrome checks accumulate from phases 1-6 — re-run sweep and report friction-count delta vs the baseline snapshot.
**THE big-picture moment:** after Phase 7, every Clear app gets the new chrome on recompile.

---

## Risks

1. **Reactive plumbing for row selection.** Phase 5 has a dedicated session because row-selection + right-rail population is non-trivial.
2. **Backward compatibility on `app_*` presets.** Existing apps might break visually. Mitigation: snapshot the 8 templates BEFORE Phase 1.
3. **Sidebar nav-active edge cases.** `/cro/` vs `/cro` vs `/cro?next=...`. Mitigation: runtime helper does `pathname.replace(/\/$/, '').split('?')[0]` normalization.
4. **Mock drift.** As phases land, the mock and compiler output may diverge. Mitigation: Phase 7's GAN loop is the canonical alignment pass.
5. **Doc cascade burden.** 11 surfaces × 7 phases = 77 doc updates if done naively. Mitigation: the `.claude/hooks/doc-cascade.mjs` hook reminds + the pre-push detector catches misses.

---

## Open questions

1. **Should `top nav` be a primitive, or is `app_header` enough?** Probably the latter + child primitives (brand block, breadcrumb item, search input). Confirm in Phase 1 with usage sketch.
2. **Does the breadcrumb need its own syntax?** Probably `breadcrumb:` block with `breadcrumb item 'X' to '/route'` children. Could land with Phase 1.
3. **Theme switching (ivory / midnight / nova).** Out of scope here. Defer to a later epic.
4. **Mobile responsive layout.** The mock is desktop-only. The 3-column shell collapses on mobile? Out of scope. Defer.
5. **Should the right rail be opt-in or auto-derived?** Probably explicit — auto-deriving violates Clear's "explicit over implicit" rule.

---

## Sizing (agent-time, not human-time)

Per the project rule "agent estimates are 10× off human estimates":
- **Phase 1:** small — 1 long session
- **Phase 2:** medium — 1 long session
- **Phase 3:** small — 1 long session (or share with Phase 1)
- **Phase 4:** medium — 1 long session
- **Phase 5:** large — 1-2 long sessions
- **Phase 6:** medium — 1 long session (or share with Phase 5)
- **Phase 7:** medium — 1 long session

**Total: 5-7 long sessions of agent work.** In human-hour terms this is a 4-6 week project; in agent-time it's roughly a working week.

---

## Pre-flight checklist before starting Phase 1

- [ ] Red-team this plan with the `red-team-plan` skill before writing any code (per the project rule)
- [ ] Take BEFORE screenshots of the 8 core templates + 6 Marcus apps so regressions are catchable
- [ ] Confirm the existing tests for `app_layout` / `app_sidebar` etc still pass
- [ ] Note where the existing emit for these presets lives in `compiler.js`
- [ ] Skim `landing/marcus-app-target.html` end-to-end one more time before opening the compiler
- [ ] Confirm hardening jobs A + C are committed and the post-commit hook fires (so Phase 1's edits land in the compiler-edit ledger)
- [ ] Run the baseline sweep snapshot if Job D didn't land yet (gm = $0, no budget gate)

---

## Resume prompt for any phase

> Read `HANDOFF.md`, then this plan, then `plans/flywheel-overview-04-25-2026.md`.
> Red-team the plan with the `red-team-plan` skill before opening any code.
> Pick the next unstarted phase. Land all 5 deliverables (compiler delta + doc cascade + Meph delta + curriculum delta + eval delta) before declaring the phase done. End at the green test gate + screenshot vs mock.
