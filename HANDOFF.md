# Handoff — 2026-04-18 (Session 39 — Live App Editing Phase A + Phase B, plus landing page)

## Current State
- **Branch:** `feature/live-editing-phase-a` (pushed; not merged to main)
- **Main:** has `landing/live-editing.html` from earlier in the session
- **Tests:** 2072 passing in `clear.test.js` (+111 new this session), 2 pre-existing failures unrelated to this branch
- **Real-Meph eval:** 11/11 scenarios pass against live Claude on first run

## What Was Done This Session — Three Big Things

### 1. Landing page — `landing/live-editing.html`
Built around Marcus's terror moment (CEO asks for a region field, 18 users active). Four fears each get a mechanical answer. Expand-and-contract safety section. Competitor table (Lovable/Bolt/v0/Retool/Airtable) pulled from ROADMAP research. Matches `landing/marcus.html` style, Lucide SVG only, no emoji. Merged to main mid-session.

### 2. Phase A — cycles 1–10 landed end-to-end
**67 new tests, all green.** Studio mounts `/__meph__/widget.js`, `/__meph__/api/propose`, `/__meph__/api/ship`. Propose hits Anthropic; ship compiles + POSTs to Studio's `/api/run` for respawn. Smoke-tested live with curl.

Files: `lib/change-classifier.js`, `lib/live-edit-auth.js`, `lib/edit-tools.js`, `lib/proposal.js`, `lib/ship.js`, `lib/edit-api.js`, `lib/meph-adapter.js`, `runtime/meph-widget.js`, `playground/server.js` integration.

**Key semantic decision locked in:** "remove" = hide, not delete. Data stays in DB. One-click un-hide. Permanent delete is a separate, gated command for Phase C+. Propagated through plan, ROADMAP LAE-3, and the landing page.

### 3. Phase B — cycles for LAE-3 (reversible), LAE-4, LAE-6 landed
**44 new Phase B tests + 11/11 real-Meph eval pass.**

| Piece | File |
|---|---|
| Parser: `, hidden` + `, renamed to X` syntax | `parser.js` |
| Hide + rename tools | `lib/edit-tools-phase-b.js` |
| db hide filter (strip by default, includeHidden opt-in) | `runtime/db.js` |
| Compiler schema emits `hidden: true` | `compiler.js` |
| Snapshot + rollback primitives | `lib/snapshot.js` |
| Ship auto-snapshots before write | `lib/ship.js` |
| /rollback + /snapshots endpoints | `lib/edit-api.js` |
| Meph toolset → 5 tools, updated prompt | `lib/proposal.js`, `lib/meph-adapter.js` |
| Widget Undo button | `runtime/meph-widget.js` |
| Live-reload state preservation (LAE-4) | `runtime/meph-widget.js` |
| Studio rollback wiring | `playground/server.js` |

## Rule added mid-session — CLAUDE.md

`## Real-LLM Eval Before Declaring AI Feature Done (MANDATORY)`

After I tried to declare Phase A done without running Meph against the real model, Russell called it out. Landed 8/10 scenarios on first run, then two prompt fixes got it to 10/10. For Phase B the eval caught zero slippage on the first run — the rule paid for itself immediately. Memory saved to `~/.claude/projects/.../memory/feedback_real_llm_eval_before_done.md`.

## What's Next (priority order)

### 1. Full browser e2e for Live App Editing
Spin up a Clear app in Studio with an owner-flagged user. Mint an owner JWT, load the app in Playwright. Verify:
- Widget mounts only for owner
- "add a description field to todos" → widget → ship → field appears on reload
- "remove notes field" → widget → ship → field disappears from UI but DB still has it (check `includeHidden: true`)
- Undo button → field reappears
- Non-owner session sees no widget, `/__meph__/*` 403s

Needs one Playwright test file. All the plumbing is in; this is coverage.

### 2. Compiler change: emit widget script tag in compiled HTML
When source has a `role: 'owner'` user (and `allow signup and login`), compiler emits `<script src="/__meph__/widget.js">` in HTML. Then Russell can load a deployed Clear app in a browser and the widget just appears.

Separately: emit a tiny `/__meph__/*` proxy in the generated server.js that forwards to `STUDIO_PORT`, so the widget (same-origin with the app) can call /__meph__ without cross-origin pain.

### 3. Security hardening
`liveEditAuth` in `playground/server.js` parses the JWT without HMAC verify. Fine for a one-user spike; must use `runtime/auth.js`'s `verifyToken` before any multi-user demo. Flagged in the plan.

### 4. Phase 85a infrastructure (still blocked)
From session 37 — one-click deploy code shipped but Fly Trust Verified, Stripe, Anthropic org key, `buildclear.dev` domain not provisioned yet. Russell account pass.

### 5. Competitive watch — Retool + AI
Monthly grep on Retool changelog + LinkedIn. If they bolt Clark onto Release Manager, the Live App Editing positioning window closes fast.

## Key Decisions This Session

- **"Remove" = hide, not delete.** Data never leaves the DB by default. Permanent deletion is an explicit, second-tier command with confirmation + snapshot + audit.
- **Runtime hide by schema flag.** `db.findAll` / `findOne` strip hidden columns from responses. Opt-in `{ includeHidden: true }` for admin code.
- **Snapshot every ship.** `applyShip` calls `takeSnapshot` before writing. Rollback restores source + SQLite binary together.
- **State preservation runs for everyone.** Widget's `beforeunload` handler caches form state to sessionStorage regardless of owner role. Jenna's half-filled form survives ship just as much as Marcus's.
- **Real-LLM eval is the bar**, not unit tests. New CLAUDE.md rule.

## Commits on this branch (in order)

```
70f318d  feat(landing): Live App Editing page
d30549a  docs(claude-md): Real-LLM Eval rule
67d6a88  feat(live-editing): Phase A foundation (cycles 1–6)
7df4d6a  feat(live-editing): Phase A cycles 7–9
b81131c  feat(live-editing): Phase A Anthropic adapter + docs
ee18767  feat(live-editing): Phase A cycle 10a Studio integration
c10574e  feat(live-editing): Phase A cycle 10b real ship flow
8d4e999  feat(live-editing): real-Meph eval — 10/10 after prompt fixes
f04e32e  feat(live-editing): Phase B foundation (parser + hide/rename tools)
acd2b22  feat(live-editing): Phase B runtime hide filter
03ab0c9  feat(live-editing): Phase B snapshot + rollback (LAE-6)
ab570e3  feat(live-editing): Phase B Meph toolset → 5 tools, 11/11 real eval
039eeca  feat(live-editing): Phase B ship-snapshot hook + /rollback endpoint
935bfce  feat(live-editing): Phase B widget Undo + state preservation (LAE-4)
```

## Resume Prompt

"On branch feature/live-editing-phase-a, Phase A and most of Phase B are landed: 111 new tests (2072 total), 11/11 real-Meph eval passes, Studio endpoints live (/widget.js, /propose, /ship, /rollback, /snapshots). Widget has Undo button and form-state preservation baked in. What's left: (1) browser e2e covering owner→widget→ship/hide/undo flow, (2) compiler change to emit the widget `<script>` tag + a `/__meph__/*` proxy in generated server.js so widget is same-origin with the app, (3) JWT HMAC verify on Studio's liveEditAuth middleware before any real multi-user demo. The plan in plans/plan-live-editing-phase-a-04-18-2026.md has the latest status and remaining work."
