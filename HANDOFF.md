# Handoff — 2026-04-18 (Session 39 — Live App Editing A + B + compiler integration + landing page)

## Current State
- **Branch:** `feature/widget-in-compiled-apps` → already on main as of commit `4e115ec`
- **Tests:** 2079 passing in `clear.test.js` (2 pre-existing failures unrelated to this branch)
- **Real-Meph eval:** 11/11 widget-mode + 15/16 Studio-mode (one context-dependent, not a regression)

## What Shipped This Session

Three big things.

### 1. Landing page — `landing/live-editing.html`
Story-driven 5-section rewrite in Marcus's voice. Opens on "Tuesday, 2:47pm. Your CRO walks over." Running-app mock with owner-only Edit badge. Small Meph chat panel showing the one-sentence request → additive diff → Ship. "Four seconds. Done." Three-rule explanation (Only you can edit / Nothing is ever gone / Undo always works). Three real competitor quotes. CTA.

Zero engineer jargon: no classifier taxonomy, no expand-contract, no "rollback", no `.clear` source snippets, no fours-of-fears grid. All seven landing pages now ship pre-built `tailwind.css` (27KB) instead of the CDN script — fixes the flash-of-unstyled-content.

### 2. Live App Editing — Phase A + Phase B (logic + Studio integration)
- **Phase A (cycles 1–10):** owner-gated Meph widget, 3 additive tools (field/endpoint/page), AST-diff classifier, ship flow with rollback on failure, Studio endpoints live. 67 tests + 10/10 real-LLM eval.
- **Phase B (reversible + state preservation + snapshot):** `, hidden` and `, renamed to X` field syntax; `db.findAll`/`findOne` strip hidden by default; snapshot + rollback primitives; ship auto-snapshots; 5-tool Meph prompt; widget Undo button; sessionStorage form preservation. 44 more tests + 11/11 real-LLM eval.

Semantic lock-in: **"remove" = hide, not delete.** Propagated through plan, ROADMAP LAE-3, landing page, docs.

### 3. Compiler integration — widget ships with every auth-enabled app
The big finish. Before today, Live App Editing only worked inside Studio. Now:
- Compiler emits `<script src="/__meph__/widget.js" defer>` in HTML whenever source has `allow signup and login`.
- Compiler emits `GET /__meph__/widget.js` serving the widget file from `clear-runtime/`.
- Compiler emits `ALL /__meph__/api/:action` proxy forwarding to `process.env.STUDIO_PORT`.
- Proxy returns a clean 503 in production (no `STUDIO_PORT` set).
- Studio copies `runtime/meph-widget.js` into `clear-runtime/` on every `/api/run` and passes `STUDIO_PORT` in the child's env.

7 new unit tests in `lib/widget-injection.test.js`. All 8 Core templates still compile clean.

## Rule Added Mid-Session — CLAUDE.md

`## Real-LLM Eval Before Declaring AI Feature Done (MANDATORY)`

After I declared Phase A "done" on unit tests alone and Russell called it out ("SMH"), I wrote the eval harness, caught two prompt bugs, fixed them, re-ran. For Phase B the eval caught zero slippage on the first run — rule paid for itself immediately. Memory also saved at `~/.claude/.../memory/feedback_real_llm_eval_before_done.md`.

## What's Next (priority order)

### 1. Playwright e2e in a real browser
The plumbing is done; the logic is tested; the widget injects into compiled apps. What's left is a browser test that actually clicks the badge, types a request, clicks Ship, and verifies the effect. One Playwright test file covering todo/crm/blog templates. Plus a refusal test ("remove notes field" → hide-not-delete flow end-to-end).

### 2. Security hardening before any multi-user demo
`liveEditAuth` in `playground/server.js` parses JWTs without verifying the HMAC signature. Fine for the single-owner spike; replace with `runtime/auth.js`'s `verifyToken` before any real user touches this.

### 3. Phase C — destructive path
LAE-5 schema migration planner for type changes ("12 rows don't parse — coerce / default / reject?"). Plus the explicit "permanently delete" command with type-DELETE confirmation.

### 4. Phase D — audit + concurrency + dry-run
LAE-8 change log, LAE-9 concurrent-edit guard, LAE-10 real dry-run staging URLs.

### 5. Phase 85a infrastructure (still blocked from Session 37)
Fly Trust Verified, Stripe, Anthropic org key, `buildclear.dev` domain. Russell account pass needed before Phase 85 one-click deploy actually deploys anywhere.

### 6. Competitive watch — Retool + AI
Monthly Retool changelog grep. If they bolt Clark onto Release Manager, the Live App Editing window closes fast.

## Commits on main from this session

```
4e115ec  feat(live-editing): compile widget into every auth-enabled app + drop engineer jargon
71dd851  (merge from origin/main with Session 37 Supervisor work)
1200a15  copy(landing): bare-bones live-editing page
c02f484  copy(landing): rewrite live-editing in Marcus's voice
d82d648  fix(landing): ship static Tailwind CSS, drop CDN
16f753d  docs: document Phase A + Phase B across all doc surfaces
d30549a  docs(claude-md): Real-LLM Eval rule
675679d  docs(handoff): session 39 mid-point
(13 earlier feature commits — Phase A foundations, Phase B primitives, eval harness)
```

## Resume Prompt

"On main. Live App Editing Phase A + Phase B + compiler integration all landed — 2079 tests passing, widget auto-injects into any compiled Clear app with `allow signup and login`, Studio runs the /__meph__ endpoints with a clean 503 fallback in production. Landing page is story-driven in Marcus's voice, no jargon. Next up: Playwright browser e2e of the full flow on todo/crm/blog templates, then JWT HMAC verify on Studio's middleware before multi-user demo. Phase C (destructive path) is the next logical build."
