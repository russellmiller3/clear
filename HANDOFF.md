# Handoff — 2026-04-07

## Current State
- **Branch:** main
- **Last commit:** c4bcb50 Replace fix_scope with suggested_fix
- **Working tree:** Clean
- **Tests:** 1281 passing
- **Apps:** 33 template apps, all compile

## What Was Done This Session

- Built 5 template apps (CRM, Booking, Invoice, CRM Pro, CRM SPA multi-file) and E2E tested all of them with real HTTP requests + race condition tests
- Fixed 8 compiler bugs found during E2E (seed inserts, PUT ID injection, pluralization, multi-page routing, sidebar layout, multi-file module resolution)
- Added Phase 45: external API calls (`call api`, Stripe, SendGrid, Twilio, `ask claude`, `when X notifies`, `needs login`)
- Improved compiled output quality: source line comments (`// clear:LINE`), error classification (400 vs 500), seed endpoint guards, reactive model comments
- Added auto-generated ASCII architecture diagrams to all compiled output (tables, endpoints, pages, dataflow — regenerates on every build)
- Designed Phase 46 error translator plan with 27 acceptance tests, red-teamed, and iterated on `suggested_fix` (minimal diff) replacing `fix_scope` (preserve list)

## What's In Progress

**Phase 46: Runtime Error Translator** — plan is complete at `plans/plan-error-translator-04-07-2026.md`, ready to implement.
- 7 phases, 16 TDD cycles, 27 acceptance tests
- Key systems: `_clearTry` (context-aware error wrapping), `_clearMap` (embedded source map), `suggested_fix` (compiler-generated minimal diffs)
- All utilities inlined (no external files, zero new dependencies)
- Python is first-class (not deferred)
- Branch: `feature/error-translator`

## Key Decisions Made

1. **`suggested_fix` over `fix_scope`** — instead of listing what NOT to touch (which is just "everything else"), give the AI the exact minimal diff. The compiler knows enough for schema errors (missing field, wrong type, missing auth, typos). For logic bugs / CSS — no suggested fix, just hint + line. Honest about what it knows.
2. **Auto-diagrams replace per-app intent files** — every compiled file has an architecture diagram that regenerates on build. Impossible to be stale. The diagram IS the intent file.
3. **`ask claude` is canonical, `ask ai` is alias** — ANTHROPIC_API_KEY takes precedence over CLEAR_AI_KEY. Model selection via `using 'model-id'`.
4. **`when X notifies` replaces `webhook`** — matches existing `when user calls` pattern. 14-year-old test.
5. **Service presets use correct content types** — Stripe/Twilio use form-encoded (URLSearchParams), SendGrid uses JSON. Can't assume JSON for all.
6. **CLEAR_DEBUG controls three levels** — off (production default), true (hint + line), verbose (+ sanitized input/schema). PII auto-redacted.

## Known Issues / Bugs

- Browser server doesn't inline module endpoints from `use everything from`
- `data from` synonym collision with variable name `data`
- `charge = charge via stripe:` collides (same word as synonym + variable)
- Single `_editing_id` shared across tables (edit mode collision in multi-table UIs)
- `GET /api/teams/:id` returns all records (doesn't filter by id param)

## Next Steps (Priority Order)

1. **Implement error translator** (Phase 46) — `plans/plan-error-translator-04-07-2026.md`. Branch: `feature/error-translator`. This is the highest-leverage work.
2. **Deploy playground to Vercel** — AI proxy ready, just needs `vercel deploy`
3. **Client portal + admin dashboard templates** — complete Phase 43
4. **Clear Cloud MVP** — hosted compile + deploy
5. **Streaming iterators** — `for each line in stream file`

## Files to Read First

| File | Why |
|------|-----|
| `HANDOFF.md` | This file — session context |
| `CLAUDE.md` | Startup reading order, all rules, 1281 tests |
| `plans/plan-error-translator-04-07-2026.md` | Next task — 7 phases, 27 acceptance tests |
| `AI-INSTRUCTIONS.md` | How to write Clear code |
| `intent.md` | Authoritative spec for all node types |
| `learnings.md` | Sessions 7-8: 34 gotchas (scan TOC) |
| `ROADMAP.md` | Phases 30-45b complete, 46 planned |

## Resume Prompt

> Read HANDOFF.md, CLAUDE.md, plans/plan-error-translator-04-07-2026.md. 1281 tests passing. 33 apps. Phases 30-45b complete. Next: implement error translator (Phase 46) — 7 phases, 16 TDD cycles, 27 acceptance tests. Key: `_clearTry` wraps CRUD/auth with source context, `_clearMap` embeds source map conditionally, `suggested_fix` gives AI the minimal diff. All utilities inlined. Python first-class. Branch: `feature/error-translator`. Run `node clear.test.js` to verify.
