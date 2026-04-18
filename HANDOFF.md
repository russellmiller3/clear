# Handoff — 2026-04-18 (Session 39 — Live App Editing Phase A foundation + landing page)

## Current State
- **Branch:** `feature/live-editing-phase-a` (pushed; not yet merged to main)
- **Previous branch:** `claude/elegant-wescoff-4c3a50` was renamed to the above and deleted on the remote
- **Main:** has the new `landing/live-editing.html` from earlier in the session (commit 70f318d)
- **Working tree:** clean

## What Was Done This Session

### 1. Landing page — `landing/live-editing.html`
Framed around Marcus's terror moment: CEO walks over, asks for a new field on the running deal-desk app with 18 active users. Page answers each fear mechanically: change classifier with chip taxonomy, patch-not-rewrite, in-flight state preservation, dry-run URL. Expand-and-contract safety section. Competitor table pulls quotes from the ROADMAP research — Lovable/Bolt/v0 can't live-edit, Retool gates it behind a developer, Clear wins on owner-only plain-English in-browser edits. Matches `landing/marcus.html` style (Inter/JetBrains Mono, Tailwind CDN, Lucide SVG only — no emoji). Merged to main mid-session.

### 2. Design decision — "hide, not delete"
Locked in semantic behavior for remove/rename/destructive commands:
- **Default "remove" = hide**, not delete. Field stays in the database, UI stops showing it, one-click un-hide. Classified as `reversible`.
- **Default "rename" = expand + copy + hide.** Add new field, copy data, hide old. Classified as `reversible`.
- **Explicit "permanently delete"** is a separate, gated command requiring second-tier confirmation + snapshot + audit. Classified as `destructive`.

Propagated to: `plans/plan-live-editing-phase-a-04-18-2026.md` (new "What 'remove' means in Clear" section), `ROADMAP.md` (LAE-3 reworded), and `landing/live-editing.html` (Fear 1 chips).

### 3. Phase A implementation — cycles 1–9 via TDD
**67 new tests, all green.** Runs as part of `node clear.test.js` (total: 2037 pass, 2 pre-existing failures unrelated to this branch).

| File | Cycle | Purpose |
|---|---|---|
| `lib/change-classifier.js` | 1–2 | AST-diff classifier: additive / reversible / destructive. Returns worst severity across all changes. |
| `lib/live-edit-auth.js` | 3 | `requireOwner` Express middleware. Phase A is strictly owner-only. |
| `lib/edit-tools.js` | 4–6 | Three `propose_*` tools (add_field, add_endpoint, add_page). Each inserts text, parses, runs classifier, rejects anything non-additive. |
| `lib/proposal.js` | 7 | Dispatcher + Anthropic tool schema. Asserted: no tool exposes delete/rewrite/remove/drop/edit_code. |
| `lib/ship.js` | 8 | `applyShip` with write → compile → spawn, rolls back the file on compile or spawn failure. |
| `lib/edit-api.js` | 9 | `createEditApi(app, deps)` registers POST `/propose`, POST `/ship`, GET `/widget.js`. Full DI for testability. |
| `lib/meph-adapter.js` | — | Anthropic SDK adapter: `buildMephRequest` + `parseMephResponse` + `callMeph`. |
| `runtime/meph-widget.js` | 9 | Browser-side widget (floating badge + dark chat panel). Self-gates on `role === 'owner'` in JWT. Syntax-checked. |

**Two layers of safety lock in:** (a) the tool palette can't produce non-additive diffs because the three tools literally only add; (b) the classifier runs as a second check and rejects anything marked reversible or destructive. Even if Meph calls a tool with bad args, it can't remove data.

## What's Next (priority order)

### 1. Finish Phase A — Studio integration + compiler tag + e2e (cycles 10–12)
The plumbing is all tested. What's left is integration:
1. **Mount `/__meph__/*` on Studio's express app** (`playground/server.js`). Wire `deps.readSource` to the currently-loaded source in the IDE, `deps.callMeph` to `callMeph()` using Studio's stored API key, and `deps.applyShip` to Studio's existing compile + spawn flow.
2. **Compiler change**: when the source declares an owner (a user with `role: 'owner'`) and has `allow signup and login`, emit `<script src="/__meph__/widget.js">` in the compiled HTML.
3. **Template updates**: flag one seed user as `role: 'owner'` in `todo-fullstack`, `crm-pro`, `blog-fullstack`.
4. **Playwright e2e** on all three templates: owner → widget → propose → ship → verify effect on reload. Plus non-owner gets no widget. Plus refusal test ("remove notes field" → "Phase B only" error).

Estimated effort: 1 session (maybe 1.5 with Playwright flake). All the hard logic is already done.

### 2. Phase 85a infrastructure (still blocked from Session 37)
One-click deploy code shipped but Fly Trust Verified, Stripe, Anthropic org key, and `buildclear.dev` domain haven't been provisioned. Russell needs to do the account pass.

### 3. Fix the 2 pre-existing compiler test failures
`send back all Users compiles to lookup + respond` and `longhand still works (backward compat)` have been failing on main for a while. Not caused by this branch, but someone should fix them.

### 4. Competitive watch — Retool + AI agent
Monthly grep on Retool changelog + LinkedIn. If they bolt Clark (their AI product) onto Release Manager, the Live App Editing positioning window closes fast.

## Key Decisions Made

- **runtime/ stays CommonJS, lib/ stays ESM.** Live-editing logic lives in lib/ because it's Studio-time / compile-time code. The browser widget is the only piece in runtime/ and it's plain browser JS with no node semantics.
- **Ship flow restarts the process**, doesn't hot-swap. Hot-swap is Phase B's problem. Phase A's known limitation: in-flight form state is lost on reload. Documented in plan + Fear 3 of the landing page answers this for Phase B onward.
- **Reuse `role: 'owner'`, don't invent a new `owner` keyword.** Every second spent on parser work is a second not spent proving the loop. Can upgrade to dedicated syntax later if UX demands it.
- **No new compiler syntax for `hidden: true` fields in Phase A.** The classifier handles hidden-flag transitions even though Phase A never produces them — Phase B's edit tool will just flip the flag.

## Resume Prompt

"We just landed Phase A cycles 1–9 of Live App Editing on branch feature/live-editing-phase-a: 67 new tests, all green (2037 total in clear.test.js). Everything is tested via DI. What's left for full Phase A is the Studio integration plus a tiny compiler change to inject the widget script tag plus Playwright e2e on the three core templates. The plan in plans/plan-live-editing-phase-a-04-18-2026.md has the exact integration points. Pick up with cycle 10 — mount /__meph__/* on playground/server.js and wire callMeph to use Studio's stored API key."
