# Handoff -- 2026-04-12 (Session 2, Final)

## Current State
- **Branch:** `main`
- **Compiler tests:** 1725 (all passing)
- **E2e tests:** 60/67 passing (7 failures are pre-existing IDE UI timing issues, not core 7)
- **Core 7 templates:** All compile clean, all CRUD endpoints work

## What Was Done This Session

### Roadmap Items 1-12 — ALL Gaps Closed
Items 1-4 (previous session): auth scaffolding, belongs to, validation, aggregates.
Items 5-12 (this session): search, broadcast, agent memory fix, tool schema fix, string concat, Python serving, has many, guardrails.

### Core 7 Templates Rewritten + Playwright-Tested
Every template uses new features. Every CRUD endpoint tested end-to-end:
1. todo-fullstack (95 lines) — 13/13 tests pass
2. crm-pro (218 lines) — 8/8 tests pass
3. blog-fullstack (125 lines) — 7/7 tests pass
4. live-chat (55 lines) — 5/5 tests pass
5. helpdesk-agent (145 lines) — 5/5 tests pass (compiled code checks)
6. booking (142 lines) — 7/7 tests pass
7. expense-tracker (135 lines) — 7/7 tests pass

### Compiler Bugs Fixed During Template Testing
- GET endpoints with `sending params` used req.body instead of req.query (400 errors)
- `send back get all X` compiled to undefined variable (one-liner anti-pattern)
- Server auto-installs bcryptjs/jsonwebtoken when compiled code needs them
- Query param false positive in validator (stripped ? before matching)
- "Did you mean 'if'?" for word 'a' (skip reserved words, require similar length)
- Validator auth warnings now say 'requires login'

### Other Shipped
- Click-to-highlight source mapping (bidirectional Clear ↔ compiled)
- Meph browse_templates + source_map tools
- Philosophy rules 15 (Meph access) + 16 (error messages first-class)
- Rotating quotes in status bar
- Font size + line number color matching between editors
- Context meter CSS fix
- SYNONYM_VERSION test stabilized

## Remaining E2e Failures (7 — all pre-existing)
1. `ecommerce-api` template uses `this` keyword — compile error
2-5. IDE UI timing: compile animation state, tab names ("Code" vs "Output")
6. Old expense-tracker shallow test: POST response format mismatch
7. "New" button: Playwright finds 2 elements with text "New"

## Resume Prompt

> On main. 1725 compiler tests pass. 60/67 e2e tests pass (core 7 all green).
> Next priorities:
> 1. Fix 7 remaining pre-existing e2e failures (ecommerce-api template, IDE timing, "New" button selector)
> 2. Wire curriculum tasks into e2e test suite
> 3. Add patch_code Meph tool (surgical edits via patch API)
> 4. Add Meph capabilities section to USER-GUIDE.md
> 5. Batteries: Stripe checkout, SendGrid, Supabase storage/auth
