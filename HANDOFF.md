# Handoff — 2026-04-28 evening (chunk #10 router + email primitive end-to-end + deal-desk demo live)

> **Read this top section first. The earlier handoffs below preserve queue + email primitive context.**

## Where you are when you sit down

**Branch:** `main`. Local branch is 30 commits ahead of `origin/main` and not pushed yet — push when ready (or hold per the existing "don't push without explicit ask" default).

**The empty-tables-after-route-swap bug Russell flagged this morning is fully solved.** Deal-desk's local SQLite turned out to live at `./clear-data.db` at the repo ROOT (not under `apps/deal-desk/` like every previous session assumed). Once that file got nuked + the holding processes killed, the fresh seed populated 5 pending / 1 approved / 1 rejected / 7 total deals + 4 reps + 4 accounts + 3 rules + 3 integrations. Walked all 9 sidebar routes — every page hydrates with real rows, sidebar persists, title swaps. End-to-end proven via the preview tools' accessibility-tree snapshot (the screenshot tool kept timing out but the snapshot data is unambiguous).

**The triggered email primitive is functionally complete.** Phase 1 (parser) + 3 (compiler table emit) + 4.1 (queue auto-PUT injection) + 4.1-extension + 4.2 (user-defined endpoint injection) + 4.3 (recipient-email field warning) + 5.1 (never-fires warning) + 5.2 (body interpolation warning) + 5.3 (provider name allow-list) all shipped. Plus F3 inside queue blocks (`email <role> when <action>` is canonical, `notify on` kept as legacy alias). Plus deal-desk's demo wiring — the CRO clicks Counter, the deal flips to awaiting, and a row lands in the shared `workflow_email_queue` table with subject "We countered your offer", body, provider 'agentmail', reply tracking 'deal activity'. No real email leaves the box — that stays gated behind the deferred `enable live email delivery via X` directive (Phase B-1).

Test count: **2727 passing, 0 failing.** All 8 core templates + 6 Marcus apps compile clean.

## What's on main that wasn't there this morning

```
86e95e2 Merge: email-primitive doc cascade tail (FAQ + landing example)
1af50fc docs(email-primitive): finish doc cascade — FAQ subsystem map + landing/marcus uses canonical email-when
c31ef22 Merge: doc-cascade tail-up for email primitive completion
7008221 docs(email-primitive): commit Russell's CHANGELOG + intent updates for 4.1-ext / 4.2 / 4.3 / 5.2
9e5e4bc Merge: triggered email Phases 4.2 + 4.3 + 5.2 + deal-desk demo wiring
b4835b3 feat(email-trigger): warn on {ident} body interpolation refs (Cycle 5.2)
2cfb6a4 feat(email-trigger): warn when entity has no recipient_email field (Cycle 4.3)
193f829 feat(email-trigger): user-defined endpoints also queue emails (4.1-ext + 4.2)
1b02e55 demo(deal-desk): use email customer when deal's status changes to 'awaiting'
f3e5e24 Merge: triggered email primitive (F3 + Phase 1 + Phase 3 + Phase 4.1 + docs + Phase 5.1 + 5.3)
46455bd feat(parser): triggered email Phase 5.3 — provider name hard-error
a2a175c feat(validator): triggered email Phase 5.1 — never-fires warning
3a49847 docs(email-primitive): cascade across 7 surfaces
fe80249 feat(compiler): triggered email Phase 4.1 — queue auto-PUT injection
8a6b8a6 feat(compiler): triggered email Phase 3 — workflow_email_queue table emit
dfc9da7 feat(parser): triggered email Phase 1 — top-level email <role> when block
494fa1f feat(parser): F3 — email <role> when <action> canonical queue clause
cceb48b Merge: queue F1 + compiler component bug + Codex chunk #10 (shell router) + chunk #7 (chart polish)
5370264 feat(compiler): shell-page router (chunk #10) + chart polish (chunk #7)
```

## What shipped, in plain English

- **Chunk #10 (shell-page router) + chunk #7 (chart polish)** — multi-page apps with `app_layout` keep their sidebar across route swaps. Charts re-size after they become visible. Tables hydrate after route swap because the router calls `_recompute()` after every nav click. This was Codex's stash work — cherry-picked cleanly, no Codex's hand-rolled deal-desk left behind.
- **Queue F3 — `email <role> when <action>` canonical inside queue blocks.** Verb names HOW (vs vague "notify"). Future siblings (`slack`, `text`, `webhook`) will follow the same atom shape. `notify on` keeps working as a legacy alias.
- **Triggered email primitive — full epic.** Top-level `email <role> when <entity>'s status changes to <value>:` block with subject/body/provider/track-replies-as. Compiler emits the shared `workflow_email_queue` table once per app + injects queue rows from BOTH queue auto-PUT handlers AND user-defined endpoints that assign the trigger value. Three validator silent-bug guards (never-fires, missing recipient field, undefined body interpolation). One parser hard-error (provider name allow-list with did-you-mean).
- **Deal-desk demo wired and verified.** When the CRO counters a deal, the compiled handler queues a customer email row with all the right fields. Marcus can see the would-be email rows in the `workflow_email_queue` table — visible proof of what would have been sent without any actual outbound.

## Verification on pickup

Before doing more work, prove deal-desk still works:

1. `git switch main` then `git status` — should be clean (or only `.claude/settings.local.json` + `playground/factor-db.sqlite` modified, both ignored).
2. **CRITICAL — kill any leftover deal-desk node child process before doing anything**: `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*deal-desk*' -or $_.CommandLine -like '*clear-serve*' }` — if any are running and you want to nuke + reseed the DB, kill them first. The DB lives at `./clear-data.db` at the REPO ROOT, not under `apps/deal-desk/`. Previous sessions kept missing it because `clear serve` defaults to `process.cwd()` for the DB path.
3. Start the live deal-desk: `preview_start name="deal-desk-live"` (config exists in `.claude/launch.json` — `node cli/clear.js serve apps/deal-desk/main.clear --port 4567`).
4. POST `/api/seed` with empty body — should respond `{"message": "already seeded"}` since the previous run seeded.
5. Walk the routes: home (5 pending), `/approved` (1), `/rejected` (1), `/all` (7), `/reps` (4), `/accounts` (4), `/rules` (3), `/integrations` (3). Every table should show real rows. The sidebar should persist with single-instance.
6. `node clear.test.js` — expect 2727 of 2727 passing.

## QUEUED WORK — in priority order

### 1. Push 30 commits to `origin/main`

Local main is 30 commits ahead. Default rule says don't push without explicit ask. When ready: `git push origin main`. Pre-push hook will run compiler tests + meph eval (~3 min).

### 2. Phase B-1 of triggered email — live delivery worker (deferred behind your explicit go)

The only triggered-email work that hasn't shipped. Plan: `plans/plan-triggered-email-primitive-04-27-2026.md` Phase B-1 section. When you're ready:

- Add `enable live email delivery via agentmail` directive (parser + validator)
- Background worker that polls `workflow_email_queue` for pending rows + sends real emails via the declared provider
- Provider adapter modules for AgentMail (default), SendGrid, Resend, Postmark, Mailgun
- Idempotency on provider event IDs
- Reply webhook handler that flips queue rows to `replied` + updates parent entity state
- Signed callback verification before any reply event mutates parent state
- Retry logic with exponential backoff
- Failed-send observability (queue rows with status=failed, last_error populated, attempts incremented)

Hard gate: NO API keys in source / tests / screenshots / logs. Default builds STILL emit no real-API code paths (regression test from Phase 3 must keep holding).

### 3. F2-F7 of the queue primitive follow-up plan (still pending from this morning's plan)

Plan: `plans/plan-queue-primitive-followup-04-28-2026.md`. F1 + F3 already shipped today. Remaining:

- **F2: pluralize on the way in.** `queue for deals` should resolve to `deal` (currently `queue for deals` produces `/api/dealss/queue` — double-S URL).
- **F4: `options:` and `buttons:` synonyms for `actions:`; `waiting on customer` canonical for what's currently `awaiting customer`.**
- **F5: Python parity for the queue primitive.** Currently the Python branch returns a TBD stub. Violates the new MANDATORY "Build Python Alongside JS" rule.
- **F6: docs cascade re-run** for the new canonical forms (probably partly covered by today's email epic doc cascade — verify).
- **F7: 8-template smoke gate** — all green.

### 4. /introspect skill + periodic hook (from this morning's queue)

Russell's earlier ask: a skill that asks Claude to step back, scope out, think about broader project goals, review the CLAUDE files, decide what we can learn from a situation and record to learnings, and decide if we're on the right track. Plus a hook that fires periodically in a session to trigger this proactively.

Lives at `.claude/skills/introspect/SKILL.md` when written. Hook would be a periodic timer-based UserPromptSubmit (fires every N user messages or N minutes).

### 5. Hard product review of Deal Desk (from this morning's queue)

Russell's earlier ask: "decide what we actually need to work. (integrations? slack? probably!) and then either build or kill." Read the full deal-desk source, the Codex catalog of features it could have, and write a "what does this app actually need to demo to Marcus + what's nice-to-have we should kill" doc with build-or-kill calls per feature. ~30 min judgment work, no coding.

### 6. Russell's external work (still gating first paying customer)

Unchanged from prior handoffs:

- **Fly.io Trust Verified app** — submit form, ~1-2 day review.
- **Stripe live keys** — ~30 min once the domain + Trust Verified land.
- **Anthropic org key for paid Meph sessions** — ~15 min in console.
- **Postgres provision** (Fly Postgres or Neon) — ~30 min.
- **First Marcus conversation** — the actual launch event.

These are Russell-only and run async to the code work above.

## What I learned this session that's worth remembering

- **`clear serve`'s DB path defaults to `process.cwd()`** — for deal-desk launched via `node cli/clear.js serve apps/deal-desk/main.clear --port 4567` from the repo root, the DB lives at `./clear-data.db` at the repo root, not under `apps/deal-desk/`. Three sessions of the deal-desk DB-reset task missed this because every diagnostic tool said the file was "in deal-desk."
- **Windows file locks on SQLite are sticky.** Killing the immediate child process isn't always enough — sometimes a sibling node process or even Windows Defender real-time scan keeps the file open. The reliable nuke pattern: `preview_stop` the dev server, `Get-CimInstance Win32_Process` to find every node process whose CommandLine mentions deal-desk OR clear-serve, `Stop-Process -Force` each one, sleep 2, then `rm -f`.
- **`cli/clear.js serve` builds to `apps/<name>/.clear-serve/`** — not directly into `apps/<name>/`. The compiled `server.js`, `index.html`, and `node_modules` all live in `.clear-serve/`. Deleting the source-level `apps/<name>/server.js` does nothing; the live server reads from `.clear-serve/server.js`. To force a fresh compile, `rm -rf apps/<name>/.clear-serve apps/<name>/.clear-test-build` then `preview_start`.
- **Russell parallel-shipped 4 commits while I was hunting the file lock.** Phase 4.2 (user-written endpoint injection), Phase 4.3 (recipient-email warning), Phase 5.2 (body interpolation warning), and the deal-desk demo wiring all landed via his hand. Took me a beat to realize there were extra commits on the branch I didn't make. The lesson: when working on a branch, `git log --oneline -5` is a useful "did anything change under me" check before committing.

## Hooks active this session

Same set as the morning HANDOFF — see the older entry below. The only relevant new context is the `clear-cheatsheet-on-write` hook keeps firing on every Edit to teaching docs (SYNTAX, AI-INSTRUCTIONS, system-prompt, intent.md). It's intentional and useful; it injects the high-friction canonical forms cheat sheet so I cross-check before saving.

---

# Older handoff (preserved for context)

# Handoff — 2026-04-28 (queue follow-up + Codex partial cherry-pick + compiler bug fix)

> **Read this top section first. Below is the prior overnight handoff for context.**

## Where you are when you sit down

**Branch:** `chore/queue-redteam-and-syntax-followup` (off `main`). 12 commits, NOT pushed yet (decided to leave for next session to push or merge after picking through the work).

**`main` is unchanged from where the prior overnight session left it.** Today's work lives on the branch.

To get back into context fast: read this file top-to-bottom, then `git log --oneline main..` to see the commits in order.

## What shipped on this branch (12 commits)

Newest first:

1. **`fix(compiler): components now compile UI primitives in body — proper fix`** — the load-bearing win of today. The Clear compiler used to silently drop nav-section / nav-item / page-header / stat-strip / stat-card / tab-strip / detail-panel children when they appeared inside a `define component:` block. Compiled component returned only its heading. Caught visually via the preview tools (preview_snapshot showed a sidebar with just "Deal Desk" and no nav). Fix: when a component child is an HTML-only node that compileNode returns null for, route that single-node fragment through the existing buildHTML walker to capture static HTML, embed as a string literal in the compiled function. Reuses the same path pages use, no walker duplication. 3 new TDD tests in clear.test.js cover nav-children-in-component, page-header-in-component, and SHOW interpolation inside components still working. requests.md entry marked DONE.

2. **`docs(requests): log compiler bug — components silently drop nav children`** — bug report logged to requests.md (then marked DONE in the next commit when fixed).

3. **`fix(deal-desk): inline sidebar in each page (component approach didn't work)`** — superseded by the compiler fix. Was the bridge while the proper fix was in flight.

4. **`feat(deal-desk): add charts to /all and /reports pages (Codex Phase 2b)`** — pie + bar charts for status mix, segment pressure, deal types.

5. **`feat(deal-desk): cherry-pick 10 sidebar pages + 4 backing tables (Codex Phase 2a)`** — fixes the broken nav. Adds Reps / Accounts / ApprovalRules / Integrations tables + 8 filter URLs + 10 page declarations + seed data.

6. **`feat(queue-parser): F1 — hard-fail on unknown body lines with did-you-mean`** — silent-skip in the queue parser was the 14-year-old test failure; now every unknown clause inside `queue for X:` errors with a Levenshtein-based did-you-mean hint.

7. **`feat(studio): builder-mode layout overhaul + sticky resizers + tab wrap`** — Meph on the left rail, source as a right pane, 8px draggable resizers persisted to localStorage, Show Source button on the far right, Hide Chat button on the far left, tabs wrap on overflow.

8. **`chore(hook): no-stub-nav — block .clear writes whose nav points to dead routes`** — every nav item must reach a real page or be marked TBD.

9. **`docs(plan): queue primitive follow-up — Russell's 2026-04-28 red-team`** — the F1-F7 follow-up plan.

10. **`chore(hook): screenshot-on-UI-edit reminder`** — fires after every `.html` / `.clear` / `.css` / compiler.js edit, tells the next turn to use the preview tools and screenshot.

11. **`fix(deal-desk): sidebar persists across all 10 sub-pages via shared component`** — first pass of the sidebar fix (using a `define component`). It compiled clean but visually only the heading rendered — the very bug the next commits diagnosed and fixed in the compiler.

12. **(commit before that)** — the F1 test bed and hooks scaffolding.

## What's verified working

Verified via the preview tools (preview_eval across all 11 routes of a live deal-desk server on port 4567):
- Every sidebar nav link routes to its page
- Every page renders the shared sidebar component (11 nav links + 3 section labels)
- "Deal Desk" heading present on every page
- /all + /reports show charts (2 + 3 respectively)
- Studio layout changes (Meph left rail, source right pane, sticky sliders, button positions, tab wrap) — visible in the running Studio, but the FINAL hand-off check ("does this look right to you?") is on Russell.

## Known issue surfaced today (NOT yet fixed)

**Data tables show 0 rows after route change.** When you navigate from `/` to `/approved` (etc.), the `on page load: get approved_deals from /api/deals/approved` block does NOT re-fire. Only the data loaded during the FIRST page load (which is /'s `pending` and `all_deals`) ends up populated. So:
- /all and /reports show their charts and tables (because all_deals loads on /)
- /approved, /rejected, /awaiting, /reps, /accounts, /rules, /integrations show their headings + sidebar but EMPTY tables.

This is a runtime / router gap, not a compile error. The compiler emits the on-page-load fetch correctly; the client-side router just doesn't trigger it on route swap.

**The right-way fix:** cherry-pick Codex's shell-page router (chunk #10 in the queue below). It mounts each page's content into an outlet on route change, so the page mount lifecycle re-runs naturally and on-page-load blocks fire again. Per CLAUDE.md "Always do things the right way" + PHILOSOPHY.md "fix the compiler / runtime — every future app benefits." This is the same kind of bug as the components-drop-children one fixed today — a compiler / runtime layer issue that should be fixed at the right layer, not papered over per-app.

Do NOT consider a per-app workaround (manually writing client-side fetch on route change in deal-desk's main.clear). That's the shortcut path. The compiler / runtime is the right layer. Cherry-pick chunk #10 first when the next session starts the cherry-pick — it's the load-bearing fix that unblocks everything else customer-visible.

## Verification on pickup

Before doing more work, prove deal-desk still works:

1. Start a live deal-desk server: edit `.claude/launch.json` to ensure the `deal-desk-live` entry exists (it does — `node cli/clear.js serve apps/deal-desk/main.clear --port 4567`), then `preview_start` the `deal-desk-live` config.
2. `curl -s -X POST http://localhost:4567/api/seed -H "Content-Type: application/json" -d "{}"` to seed.
3. `preview_snapshot` of the home page — confirm sidebar renders with APPROVALS / PIPELINE / WORKSPACE sections + 11 nav links.
4. `preview_eval` to navigate each route — confirm the right page becomes visible and the sidebar persists.
5. `node clear.test.js` — expect 2696 of 2696 passing (one pre-existing flake on the CLI-teardown stderr-capture race; 2 of 3 runs pass clean — unrelated).
6. `node -e "..."` smoke test on the 12 Marcus apps + crm-spa — expect 0 errors per app.

## QUEUED WORK — in priority order

### 1. Finish the Codex stash cherry-pick (Russell's explicit ask: "scour for value")

The audit catalog from earlier this session is the authoritative list. **Russell explicitly said drop `stash@{0}` ONLY after every value chunk has been extracted.** Do not drop it early.

Stash patch dump for reference: `/tmp/codex-stash.patch` (if it's still there — re-dump with `git stash show -p stash@{0} > /tmp/codex-stash.patch` if the temp file got cleaned up).

Chunks to land, smallest/safest first:

| # | Chunk | Stash patch lines | Lines | Customer value | Notes |
|---|-------|-------------------|-------|----------------|-------|
| 1 | **Validator fixes** | validator.js section | ~33 | low-medium | (a) `assignedFields` tracking — reduces false-positive missing-field warnings; (b) skip the condition-complexity check on DB lookups (reduces noise on filter expressions). Self-contained. |
| 2 | **Cloudflare packaging sandbox tolerance** | lib/packaging-cloudflare-*.test.js × 3 | ~46 | low | `isNodeSpawnBlocked` + `skipBlockedNodeCheck` helpers across 3 test files. Detects sandbox EPERM on `node --check` and skips gracefully. No production impact, just stabilizes tests in restricted runtimes. |
| 3 | **Page marker attributes on every page div** | compiler.js around stash line 12200-12250 | ~50 | medium | Adds `data-clear-page-id`, `data-clear-page-route`, `data-clear-page-title` to every `<div id="page_X">`. Feeds the UAT contract + browser-test generator. Non-breaking. |
| 4 | **Button UAT identifier** | compiler.js around stash line 9860-9880 | ~20 | medium | Adds `data-clear-uat-id` + `data-clear-control-kind="button"` to button markup. Feeds UAT browser tests. Non-breaking. |
| 5 | **Sortable + filterable tables compiler emit** | compiler.js around stash line 10814-10950 + runtime helpers `_clear_table_rows_for_view`, `_clear_apply_table_view`, `_clear_render_table`, `_clear_table_header`, `_clear_cell` (stash lines 1680-1825) | ~130 + ~150 helpers | high | Adds `data-clear-table-sort` + `.clear-table-filter` to table rows; injects sort/filter JS at the page footer. Context-aware (skips in sidebar, smaller fonts in detail panels). **Codex did real UX polish here — bring it.** |
| 6 | **Approval-rules dedicated render path** | compiler.js around stash line 11200-11300 | ~100 | medium | When `display 'rules' as table` is encountered, emits a styled table with status badge / threshold / owner columns. Generic enough to reuse beyond the deal-desk app. |
| 7 | **Reports / charts compact dashboard rendering** | compiler.js around stash line 11600-12000 | ~400 | high | Adds `clear-chart-card` + `clear-chart-canvas` CSS classes; renders charts in compact dashboard panels (360px height); ECharts config polish (legend, tooltips, formatters for pie / bar / line). The deal-desk /reports + /all pages currently use basic charts; this lands the polished version. |
| 8 | **Browser-driven UAT test generator** | compiler.js around stash line 6986-7350 — `generateBrowserUAT(contract)` + 10 helpers (`assert`, `test`, `routeUrl`, `pageByRoute`, `screenshotName`, `captureRouteScreenshot`, `assertVisiblePage`, `assertNoPageOverflow`, `assertPersistentShell`); plus the deeper `generateE2ETests(body, uatContract)` at stash line 7188 | ~200 + ~250 | very high | The Playwright runner that consumes the JSON UAT contract (already shipped) — emits browser tests that navigate every route, click every control, screenshot, and assert content. **Russell wants this; it's what makes the UAT contract actually useful.** |
| 9 | **CLI plumbing for UAT artifacts** | cli/clear.js — `formatIssue` (stash 6075), `writeGeneratedUATArtifacts` (6101), `staticTestServerCode` (6112), `send` helper (6122), `waitForHttpServer` (6150), `skipWhenNodeSpawnIsBlocked` (5155) | ~250 | medium | Writes `uat-contract.json` + `uat.browser.mjs` to disk on `clear build`. Spins up a test HTTP server. Polls port until app is live. Plumbing for #8. |
| 10 | **Shell-page router with detail-panel outlet** | compiler.js around stash lines 12130-12190 + 7868-7889 (Workers target duplicates) — `_clearTemplateHost`, `_clearParkMountedRoutes`, `_clearRenderRouteIntoShell` | ~60 | high (would also fix the data-hydration gap above) | One shell page (the page with `app_layout` + `app_sidebar`) holds the sidebar; other pages' content gets parked / unparked in an outlet on route change. Fixes the "fetch doesn't refire on route change" issue because the page mount lifecycle re-runs naturally. |
| 11 | **Plan-lint enforcement + skill machine-gates** | `.claude/skills/{execute-plan,red-team-plan,write-plan}/SKILL.md` (~70 lines), `package.json` plan-lint script (~2 lines), `.claude/settings.json` hook entry (~6 lines) | ~80 | low (process polish) | Plans must pass `node scripts/plan-lint.mjs` before execution / red-team. **NOTE:** the script `scripts/plan-lint.mjs` itself doesn't ship — Codex referenced it but didn't write it. Either skip this chunk or write the plan-lint script first. |

**After ALL of those land:** `git stash drop stash@{0}` per Russell's explicit direction.

Some chunks have inter-dependencies (#5 needs the runtime helpers from stash 1680-1825; #8 needs #3 and #4 to have shipped; #9 needs the contract from already-shipped UAT layer). Land in roughly numerical order; #1, #2, #3, #4, #6 are independent.

### 2. Triggered email primitive

Plan: `plans/plan-triggered-email-primitive-04-27-2026.md`. 13 TDD cycles. **REVIEW FREEZE in the plan said it needs Russell's explicit approval before execution** — assume that approval is granted via Russell's "email primitive next" direction this session.

The plan adds `when X's status changes to Y: send email to ...:` syntax. Auto-emits a `WorkflowEmailQueue` table when a when-trigger exists. Auto-injects queue-insert into URL handlers that update the entity's status to the trigger value. **NO real sends in default builds** — durable queue only. Live email delivery is gated behind `enable live email delivery via X` directive (deferred until Russell explicitly enables).

The parser disambiguation between `when user sends X to Y` (existing endpoint syntax) and `when X's status changes to Y` (new) is the load-bearing tricky bit. The plan covers it.

**Per Russell's design feedback this session, before locking syntax:**
- Use `email <role> when <action>` as canonical (NOT `notify <role> on <action>` — "notify" is too vague).
- Hard-fail on unknown body lines (same pattern as the queue F1 fix).
- Run the "would a manager type this?" pass before locking.

### 3. F2-F7 of the queue primitive follow-up plan

Plan: `plans/plan-queue-primitive-followup-04-28-2026.md`. F1 already shipped. Remaining:

- **F2: pluralize on the way in.** `queue for deals` should resolve to `deal` (currently produces a double-S URL like `/api/dealss/queue`).
- **F3: `email <role> when <action>` canonical, demote `notify <role> on <action>` to legacy alias.** Per Russell's design feedback.
- **F4: `options:` and `buttons:` synonyms for `actions:`; `waiting on customer` canonical for what's currently `awaiting customer`.**
- **F5: Python parity for the queue primitive.** Currently the Python branch returns a TBD stub. **This violates the new MANDATORY "Build Python Alongside JS" rule shipped earlier in this session** — needs to land.
- **F6: docs cascade re-run** for the new canonical forms.
- **F7: 8-template smoke gate** — all green.

### 4. /introspect skill + periodic hook

Russell's ask earlier today: a skill that asks me to step back, scope out, think about broader project goals, review the CLAUDE files, decide what we can learn from a situation and record to learnings, and decide if we're on the right track. Plus a hook that fires periodically in a session to trigger this proactively.

Not yet started. Lives at `.claude/skills/introspect/SKILL.md` when written. Hook would be a periodic timer-based UserPromptSubmit (fires every N user messages or N minutes).

### 5. Hard product review of Deal Desk

Russell's ask earlier today: "decide what we actually need to work. (integrations? slack? probably!) and then either build or kill." Read the full deal-desk source, the Codex catalog of features it could have, and write a "what does this app actually need to demo to Marcus + what's nice-to-have we should kill" doc with build-or-kill calls per feature. ~30 min judgment work, no coding.

### 6. Russell's external work (still gating first paying customer)

Unchanged from the earlier overnight handoff:

- **Fly.io Trust Verified app** — submit form, ~1-2 day review.
- **Stripe live keys** — ~30 min once the domain + Trust Verified land.
- **Anthropic org key for paid Meph sessions** — ~15 min in console.
- **Postgres provision** (Fly Postgres or Neon) — ~30 min.
- **First Marcus conversation** — the actual launch event.

These are Russell-only and run async to the code work above.

## What's open in stash list

`git stash list` should show:
- `stash@{0}` — the Codex stash. **DO NOT DROP** until every value chunk above has been extracted. Russell's explicit instruction.
- Other older stashes — separate concern, not related to today.

## Hooks active this session (and their triggers)

| Hook | When it fires | What it does |
|------|---------------|--------------|
| `~/.claude/hooks/no-shortcuts.mjs` | Stop hook (end-of-turn) | Scans the last assistant message for shortcut phrases ("I'll just", "instead of fix", "time-box the fix", "hard-error fallback", "for now" + "workaround", etc.). Blocks stop with a re-read of CLAUDE.md line 165 + line 362 + PHILOSOPHY.md compiler-accumulates-quality + the operational pattern Russell hates ("the proper fix is N hours / risky → I'll do an incremental partial / fall back to inline"). |
| `~/.claude/hooks/never-idle.mjs` | Stop hook | Blocks stop if background tasks are still running. |
| `~/.claude/hooks/no-emoji-landing.mjs` | PreToolUse on Write/Edit of HTML | Denies emoji in landing pages; suggests Lucide swaps. |
| `.claude/hooks/no-stub-nav.mjs` | PreToolUse on Write/Edit of `.clear` | Denies the write if any nav item points to a route with no page declaration. Suggests both build-the-page and TBD-stub forms. |
| `.claude/hooks/screenshot-ui-work.mjs` | PostToolUse on Write/Edit of `.html` / `.clear` / `.css` / compiler.js | Mandatory tool sequence: ToolSearch preview → preview_start → preview_screenshot → preview_click → preview_snapshot → preview_inspect → tell Russell. Says "screenshot pending — please verify visually" is LAST RESORT. |
| `.claude/hooks/parallel-thinking.mjs` | UserPromptSubmit | Reminds parallel-first decision tree. |
| `.claude/hooks/clear-cheatsheet-on-write.mjs` | PreToolUse on Write/Edit of teaching files | Injects canonical-form cheat sheet so I cross-check before saving. |
| `.claude/hooks/landing-design-on-write.mjs` | PreToolUse on Write/Edit of landing files | Injects landing-page design constraints. |
| `.claude/hooks/learnings-miner.mjs` | PostToolUse on Edit/Write | Pulls relevant learnings.md sections. |
| `.claude/hooks/doc-cascade.mjs` | PostToolUse on Edit/Write | Reminds about the 11-doc cascade. |
| `.claude/hooks/validator-friction.mjs` | PostToolUse on Edit/Write to validator.js | Runs friction script to rank top errors. |
| `.claude/hooks/require-branch-work.mjs` | PreToolUse on Write/Edit | Blocks edits on main. |
| `.claude/hooks/require-plan-read.mjs` | PreToolUse on Agent | Blocks agent spawns that reference unread plans. |

## How to start the next session

1. `git switch chore/queue-redteam-and-syntax-followup` (verify with `git branch --show-current`).
2. Read this file + the queue-primitive-followup plan + the triggered-email plan + the snapshots.
3. Verify deal-desk works (per the section above).
4. Pick the first cherry-pick chunk (validator fixes — smallest, safest start) and TDD it.
5. Run the full suite + smoke 12 apps after each chunk.
6. After ALL chunks land: `git stash drop stash@{0}` per Russell's direction.
7. Move to the triggered email primitive.

## Files to read for fuller context

| File | Why |
|------|-----|
| `plans/plan-queue-primitive-followup-04-28-2026.md` | The F1-F7 follow-up plan from Russell's red-team review. F1 done. F2-F7 queued. |
| `plans/plan-triggered-email-primitive-04-27-2026.md` | The triggered email plan — 13 TDD cycles, REVIEW FREEZE assumed lifted. |
| `plans/plan-csv-export-primitive-04-27-2026.md` | Already shipped to main; reference only. |
| `plans/plan-queue-primitive-tier1-04-27-2026.md` | The original queue plan. Historical record. |
| `requests.md` | Today's components-drop-children bug logged + marked DONE. |
| `snapshots/marcus-market-evidence-04-27-2026.md` | The wedge research evidence — STRONG. |
| `snapshots/marcus-primitives-decomposition-04-27-2026.md` | Top 5 apps + 3 primitives. Also references which connector lane to use. |

---

# Older handoff (preserved for context)

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
