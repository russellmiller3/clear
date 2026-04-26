# Handoff — 2026-04-25 (session 47, end-of-day, AUTONOMOUS-MODE OVERNIGHT RUN)

## 🌙 NEXT SESSION: AUTONOMOUS RUN — Russell is asleep (~8 hours)

**Read this whole file first. Russell is asleep and wants the next session to spawn parallel background agents to work the priority list below for 8+ hours, then write a fresh handoff before he wakes up.**

The right pattern: spawn 4-6 background agents in **isolated worktrees** (one per workstream), each with a self-contained briefing, each committing in its own worktree. When agents complete, the parent session merges their branches and writes a FINAL handoff.

---

## Today's wins (commits already on main)

- **`0a10f63`** — visual track 1: 4 compiler bug fixes + design tokens upgrade
  - `{varname}` template interpolation in heading/text content (7 apps benefited)
  - Auto-injected signup/login form on `/login` pages
  - `clear build` writes deps + runs `npm install` (built apps spawn standalone)
  - LAE widget bundle copies into `clear-runtime/` + `onerror=this.remove()` on the script tag
  - Body font: DM Sans → Inter (cv11/ss01/ss03 features)
  - Slate chrome tokens, hairline classes, status pill helpers
  - Default page wrapper widened from `max-w-2xl` → `max-w-5xl`

- **`3e19826`** — flywheel docs: `flywheel-overview-04-25-2026.md` + `plan-flywheel-hardening-04-25-2026.md`

- **`cea511c`** — flywheel hardening jobs A + C
  - **Job A:** runtime beacons land in Factor DB (`code_actions_runtime` table) — receiver dual-writes JSONL + DB
  - **Job C:** every compile-error rewrite drops a row in `compiler_edits` table via post-commit hook
  - 5 new tests in `factor-db.test.js`, 9 new tests in `scripts/log-compiler-edits.test.mjs`

**Mock built:** `landing/marcus-app-target.html` (562 lines, slate palette aligned to Clear's ivory theme, 340px right rail, table overflow safety net) — the visual target every shell-upgrade phase grades against.

**Tests:** 2586/0 in `clear.test.js`. Factor DB integration tests green.

---

## CRITICAL BUG TO FIX FIRST (Job D blocker)

**Sweep failed with:** `UNIQUE constraint failed: sessions.id`

**Where:** `playground/supervisor/registry.js:4` (the `sessions` table — `TEXT PRIMARY KEY` on `id`).

**Root cause hypothesis:** Stale rows from a previous abnormal exit. The `sessions` table has `TEXT PRIMARY KEY id`, no auto-cleanup, so a previously-spawned worker's row remains and the new sweep tries to insert with the same id and trips the UNIQUE constraint.

**Fix options:**
1. Clean up stale `sessions` rows at sweep start (delete rows older than N minutes OR with state ≠ 'running')
2. Use `INSERT OR REPLACE` in `registry.js:create()`
3. Append a timestamp suffix to session ids so they're guaranteed unique

**Recommended:** option 1 — add a `cleanupStale()` helper to `SessionRegistry`, call it from the sweep harness before workers start. Delete rows whose `state` is `idle` or `done` regardless of age, plus anything older than 1 hour. Preserves any genuinely-running sessions.

**After the fix:** run `node playground/supervisor/curriculum-sweep.js --workers=3` (no args = gm = $0). When it finishes, run `node scripts/top-friction-errors.mjs --top=20 > snapshots/friction-baseline-04-25-2026.txt` and save the sweep summary to `snapshots/sweep-baseline-04-25-2026.json`. Commit both.

---

## Priority-ordered work catalog for the autonomous run

Each unit below has a self-contained briefing the parent session can copy into an `Agent` tool call with `isolation: "worktree"` + `run_in_background: true`. **Read each briefing carefully before spawning — they're written for an agent with no shared context.**

### P0 — Sweep fix + baseline (1 worktree, ~30-45 min)

**Briefing:**
> Fix the UNIQUE-constraint bug in `playground/supervisor/registry.js` and run the baseline curriculum sweep so we have BEFORE-numbers for the shell upgrade.
>
> Context: yesterday a sweep failed with `UNIQUE constraint failed: sessions.id`. Root cause: stale rows in the sessions table. Add a `cleanupStale()` helper to `SessionRegistry` that deletes rows where `state` is `idle` or `done`, plus rows whose `updated_at` is older than 1 hour. Call it from the sweep harness (`playground/supervisor/curriculum-sweep.js`) before workers spawn. Add a unit test in `playground/supervisor/registry.test.js`.
>
> Then run `node playground/supervisor/curriculum-sweep.js --workers=3` (defaults to gm = `$0`, no API spend). When it completes, run `node scripts/top-friction-errors.mjs --top=20 > snapshots/friction-baseline-04-25-2026.txt`. Save sweep summary as `snapshots/sweep-baseline-04-25-2026.json` (parse the curriculum-sweep stdout for pass-rate-per-archetype). Commit all four files. Verify `clear.test.js` still 2586/0.
>
> Constraints: NO API spend (gm only). NO push to remote. Commit in your worktree, report worktree path + branch when done.

### P1 — Shell Upgrade Phase 1: app_* preset polish (1 worktree, ~60-90 min)

**Briefing:**
> Read `plans/plan-full-shell-upgrade-04-25-2026.md` Phase 1 in full. Read `landing/marcus-app-target.html` end-to-end — that's the visual target.
>
> Find the existing emit for `app_layout` / `app_sidebar` / `app_main` / `app_header` in `compiler.js` (grep `app_layout` and trace the section preset emitters). Upgrade each emit to match the mock chrome:
> - `app_layout` → `<div class="flex min-h-screen">` with proper sizing
> - `app_sidebar` → 240px rail using the new `--clear-bg-rail`, `--clear-line` tokens, hairline-r border, scroll-y, room for section labels + nav items
> - `app_main` → `<main class="flex-1 min-w-0 flex flex-col">`
> - `app_header` → 56px sticky header with brand-slot + breadcrumb-slot + action-slot
>
> TDD: add 5-8 tests to `clear.test.js` BEFORE editing the emit. Run them red. Then make them green. Run all of `clear.test.js` — must stay 2586/0 except for your new passes.
>
> Land the 4 flywheel deliverables (per the plan):
> 1. Compiler delta (above) + tests
> 2. Doc cascade — update `intent.md`, `SYNTAX.md`, `AI-INSTRUCTIONS.md`, `USER-GUIDE.md`, `FEATURES.md`, `CHANGELOG.md` (skip the others if you're tight on time, list which surfaces you skipped in the commit message)
> 3. Meph delta — update `playground/system-prompt.md` with the new emit shape
> 4. Curriculum delta — add a task `app-shell-basics` to `playground/supervisor/curriculum-tasks/` (or wherever curriculum lives — find it) requiring all 4 presets
> 5. Eval delta — add a chrome-check in the eval harness that asserts `<aside ... 240px>` AND `<header ... 56px>`
>
> Acceptance: a hand-written test app using all 4 presets compiles to a page within 70% of the mock. Commit, report worktree path + branch.

### P1 — Decidable Core next phase (1 worktree, ~60-90 min)

**Briefing:**
> Read `plans/plan-decidable-core-04-24-2026.md` end-to-end. Identify which phase is next — phase 0 was foundational; check git log for "decidable" commits and `RESEARCH.md` for what landed.
>
> Execute ONE well-scoped chunk of the next open phase. Probably either:
> - The validator rule that REJECTS `ask claude` / `call API` / `subscribe to` / `every N seconds` outside `live:` blocks (Phase 1 keyword)
> - The `live:` keyword itself (parser + node type + emit no-op wrapper)
>
> TDD-driven. Tests stay green (2586+/0 with new tests added). Don't skip the doc cascade for new syntax — the rule still applies.
>
> Constraints: NO push to remote. Commit in your worktree.

### P1 — Shell Upgrade Phase 5: data tables (1 worktree, ~90-120 min)

**Briefing:**
> Read `plans/plan-full-shell-upgrade-04-25-2026.md` Phase 5. Read `landing/marcus-app-target.html` table section in full. Read the existing `display X as table` emit in `compiler.js` (grep `display.*table` and trace).
>
> Upgrade emit:
> - Auto-detect column types: `status` field → render with `.clear-pill-{pending|approved|rejected}`; name/email/customer → avatar circle; numeric money → tabular nums right-aligned
> - New row-action syntax: `with actions: approve, reject, review` — render hover-revealed icon buttons in the rightmost column
> - Sortable headers: `<th>` with click-to-sort
> - Selectable rows: clicking adds `is-selected` class to the row (Phase 6 will wire this up to the right rail later — for now just the toggle)
>
> TDD: 12+ new tests covering pills / avatars / actions / sort / selection. Land all 5 flywheel deliverables (compiler + doc cascade + Meph delta + curriculum delta + eval delta).
>
> Important: Phase 5 is independent of Phases 2/3/4 (they touch sidebar/header/stat cards, not tables). It can run in parallel with the Phase 1 worktree without conflict.
>
> Constraints: NO push. Commit in your worktree.

### P2 — GTM-2: Marcus landing polish (1 worktree, ~30-45 min)

**Briefing:**
> Open `landing/marcus.html`. Tighten the headline to "ship the first one this Friday" or similar (per ROADMAP.md GTM-2). Add an embed of the deal-desk demo screenshot (mock or real).
>
> Constraints: don't break existing landing tests (`landing/*.test.*` if any). NO push.

### P2 — Builder Mode default flip (1 worktree, ~20-30 min, optional)

**Briefing:**
> Per ROADMAP.md "Builder Mode polish — Default flip" item: Builder Mode becomes the default for new users. `cmd+.` reveals the 3-panel view. Find the toggle code in `playground/server.js` or `playground/ide.html`. Flip the default. Add a test asserting new users land in builder mode.

### P3 — Winner-harvesting loop, Phase 1 + 5 (1 worktree, ~half day, RESEARCH — only if P0/P1 are done)

**Why this exists:** Russell pulled in `plans/plan-winner-harvest-04-26-2026.md` from a side branch. It closes the symmetry gap in Clear's training-signal architecture: today, ERROR data compounds permanently (the friction script + compiler-edit auto-log) but WIN data is ephemeral (the ranker only sees it for one call). The plan promotes the cleanest passing apps into a canonical-examples library that Meph reads every session — durable, cumulative.

**Critical-path note:** EXPLICITLY off the path to first paying Marcus customer. ONLY pick this up if P0 + P1 have all completed cleanly. Russell flagged this as research-tier — runs after launch, or in an evening when Marcus blockers are clear.

**Briefing (Phase 1 + Phase 5 only — Phases 2-4 require human curation):**
> Read `plans/plan-winner-harvest-04-26-2026.md` end-to-end. Execute Phase 1 (score winning rows) and Phase 5 (carve off held-out test set). They are independent and parallel-safe with each other.
>
> **Phase 1 deliverable:** a CLI tool at `scripts/score-winning-runs.mjs` that reads every `test_pass=1` row from the Factor DB and ranks by an "exemplariness" score combining (a) lines of Clear divided by milestones reached (compactness), (b) attempts-to-green (first-try cleanness), (c) bonus for archetype × feature combos no existing example covers (uniqueness). Output a ranked list to `snapshots/winner-rankings-04-26-2026.txt`. Add a unit test exercising the scoring math on synthetic rows.
>
> **Phase 5 deliverable:** pick 5 of the existing 35 curriculum tasks and tag them `held-out: true` in the curriculum index. Document which 5 in the commit message. They never seed the retriever or the canonical-examples library (when Phases 2-4 land later). Update `playground/supervisor/curriculum-sweep.js` to skip held-out tasks from the seeding step but still run them for grading.
>
> Do NOT execute Phase 2 (hand-curating the canonical examples file), Phase 3 (the $10 A/B sweep), or Phase 4 (auto-promotion). Those need human judgment + Russell's go on the spend.
>
> Constraints: NO API spend (gm only). NO push to remote. Commit in your worktree. Final commit message states which 5 tasks were tagged held-out so the next session can verify.

---

## How to spawn agents safely

In the parent session, spawn each unit above with one tool call (you can batch up to 4-6 in a single message for max parallelism):

```
Agent({
  description: "P1 — Shell Phase 1: app_* preset polish",
  isolation: "worktree",
  run_in_background: true,
  prompt: "<the full briefing from above, copy-pasted verbatim>",
  subagent_type: "general-purpose",
})
```

**Key rules:**
- **`isolation: "worktree"`** — each agent gets a fresh copy of the repo at HEAD. No conflicts between agents.
- **`run_in_background: true`** — the agent works while you do other things. You'll be notified when it completes; the result returns the worktree path + branch.
- **NO push to remote** — every briefing says this. Each agent commits in its worktree only. The parent session reviews + merges later.
- **gm only** — if any agent runs sweeps, they default to gm ($0). Don't pass `--real`.
- **Each agent owns its full epic.** Don't try to chain agents in mid-flight; if Phase 1 needs to land before Phase 2, spawn Phase 1 alone first.

After all agents complete, the parent session:
1. Inspects each worktree's branch via `git log --oneline branch-name`
2. Merges branches one at a time into `main` (in priority order, P0 first, then P1, then P2)
3. Resolves any conflicts (most won't conflict because they touch different files)
4. Runs `clear.test.js` after each merge to verify
5. Writes a fresh `HANDOFF.md` describing what landed
6. Commits the handoff
7. Optionally pushes when Russell wakes up

---

## Constraints for the autonomous run

- **NO API spend.** All sweeps via gm (cc-agent). Anthropic API stays at $0. If an agent's briefing requires `--real`, escalate by writing a note in the worktree branch's commit message and let Russell decide on wakeup.
- **NO push to remote.** Russell can push manually after reviewing the merged work. Avoids force-push or mistake exposure overnight.
- **NO destructive ops.** No `git reset --hard`, no `git push --force`, no deleting branches without checking first. If a worktree has commits, preserve them.
- **NO new dependencies** unless the work explicitly needs one and the package is well-known (express, ws, etc).
- **Tests must stay green.** Every agent must end with `clear.test.js` 2586+/0 (more is fine if they added passes; fewer is a fail).
- **Doc cascade discipline.** The 11 surfaces are listed in `CLAUDE.md`. Skipping is OK if time-boxed; commit message must list which surfaces were skipped so the next sweep catches up.

---

## End-of-shift template (the FINAL handoff the autonomous session writes before Russell wakes)

The parent session ends by overwriting this `HANDOFF.md` with a fresh one that has:

1. **What landed** — bulleted list of merged commits, sorted by impact
2. **Test status** — `clear.test.js` count, factor-db.test.js count, any new test files
3. **Open agent worktrees** — any branches that didn't merge cleanly, what's blocking
4. **Priority list for the next session** — what's the very next move when Russell sits down
5. **Any cost actually incurred** (should be $0 — gm only — but verify)

If an agent failed mid-task, document the failure cleanly: what it tried, what error it hit, where it stopped.

---

## Files to read first (next session)

| File | Why |
|------|-----|
| `HANDOFF.md` (this) | The orchestration playbook |
| `plans/plan-full-shell-upgrade-04-25-2026.md` | The 7-phase shell upgrade with flywheel touchpoints |
| `plans/plan-flywheel-hardening-04-25-2026.md` | The 3 hardening jobs (A + C done, D blocked on sweep fix) |
| `plans/flywheel-overview-04-25-2026.md` | The 3-streams + 2-loops diagram |
| `plans/plan-decidable-core-04-24-2026.md` | The decidable-core multi-phase plan |
| `landing/marcus-app-target.html` | The visual target every shell-upgrade phase grades against |
| `RESEARCH.md` | The flywheel architecture doc |

---

## Resume prompt for the parent session that spawns the autonomous run

> It's overnight. Russell is asleep. Read this HANDOFF.md end-to-end. Read `plans/plan-full-shell-upgrade-04-25-2026.md` and `plans/plan-decidable-core-04-24-2026.md`. Then spawn 4-6 background agents in worktrees per the briefings above, in priority order (P0 first, then P1s in parallel, then P2s if there's budget). Wait for them to complete (you'll get notifications). Merge their branches into main one at a time, P0 first. Run `clear.test.js` after each merge. Rewrite HANDOFF.md with the final state. Do NOT push to remote. Russell reviews + pushes after waking.
