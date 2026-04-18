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

### 1. Finish Phase A — compiler tag + CORS/proxy + e2e (cycles 11–12)
**Cycle 10 is LANDED.** Studio mounts `/__meph__/widget.js`, `/__meph__/api/propose`, `/__meph__/api/ship`. Propose calls Anthropic with an owner-gated JWT. Ship compiles the new source and POSTs compiled outputs to Studio's `/api/run` for respawn. Smoke-tested with curl — auth gates work, compile-failure errors surface in 30ms.

What's left for full Phase A:
1. **Compiler change**: when the source declares an owner (a user with `role: 'owner'`) and has `allow signup and login`, emit `<script src="/__meph__/widget.js">` in the compiled HTML. Grep compiler.js for `AUTH_SCAFFOLD` emission as the insertion point.
2. **Solve the CORS problem**: the widget is served from Studio's port but runs inside the child app's origin. Three options in the plan — recommended: compiler emits a tiny `/__meph__/*` proxy in the generated server.js that forwards to `process.env.STUDIO_PORT`.
3. **Template updates**: flag one seed user as `role: 'owner'` in `todo-fullstack`, `crm-pro`, `blog-fullstack`.
4. **Playwright e2e** on all three templates: owner → widget → propose → ship → verify effect on reload. Plus non-owner gets no widget. Plus refusal test ("remove notes field" → "Phase B only" error).
5. **Security hardening before Phase B**: `liveEditAuth` in playground/server.js currently parses JWTs without verifying the HMAC signature. Must use `runtime/auth.js`'s `verifyToken` before any multi-user deploy. Flagged in plan.

Estimated effort: 1 session (maybe 1.5 with Playwright flake). The logic is all tested in isolation; integration is wiring.

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

"We just landed Phase A cycles 1–10 of Live App Editing on branch feature/live-editing-phase-a: 67 new tests (2037 total in clear.test.js, 2 pre-existing failures unrelated). Studio now serves /__meph__/widget.js, /__meph__/api/propose (owner-gated, hits Anthropic), and /__meph__/api/ship (owner-gated, compiles + POSTs to /api/run for respawn). Smoke-tested live. Remaining for full Phase A: (1) compiler change to emit the widget script tag in HTML when the source has an owner-role user, (2) solve the widget↔Studio CORS issue via a compiler-emitted proxy in the child server's /__meph__/* routes, (3) flag a seed user as role:'owner' in todo/crm/blog templates, (4) Playwright e2e. Security TODO: playground/server.js's liveEditAuth currently parses JWTs without HMAC verify — use runtime/auth.js verifyToken before Phase B. Pick up with the compiler change."
