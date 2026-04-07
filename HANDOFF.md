# Handoff — 2026-04-07 (Session 8, Final Ship)

## Current State
- **Branch:** main
- **Tests:** 1281 passing
- **Apps:** 33 template apps, all compile and deploy
- **Working tree:** Clean

## What Was Done This Session (Massive)

### Phase 43: Template Apps (5 new apps)
- **CRM** — contacts + deals, midnight theme
- **Booking** — services + bookings, ivory theme
- **Invoice** — clients + invoices + line items, full CRUD
- **CRM Pro** — 5 tables, pipeline chart, compound unique, debounced search
- **CRM SPA** — multi-file (4 files), components, tabs, modal, slide panel, SSE, chart

### Phase 43b: Compiler Fixes from E2E Testing (8 bugs)
1. `save X as new Y` → `db.update('as')` — parser handles `as` connector
2. PUT endpoints missing `req.params.id` — auto-injected
3. `Activity → activitys` — `pluralizeName()` handles y→ies
4. Schema name mismatch — plural lookup tries all forms
5. Multi-page routing broken — pages wrapped in `<div id="page_X">`
6. Sidebar layout crushed by `max-w-2xl` — flex-direction: row detected
7. `use everything from` didn't reach HTML scaffold — nodes spliced into AST
8. App presets tuned — sidebar/content/header spacing

### Phase 45: External API Calls + Service Integrations
- `call api 'url':` — generic HTTP with headers, body, timeout
- `charge via stripe:` — Stripe Charges API (form-encoded)
- `send email via sendgrid:` — SendGrid v3 Mail API
- `send sms via twilio:` — Twilio Messages API (Basic auth)
- `ask claude 'prompt' with data using 'model'` — canonical AI form
- `when stripe notifies '/path':` — natural webhook syntax
- `needs login` — alias for `requires auth`

### Phase 45b: Compiled Output Quality
- Source line comments (`// clear:LINE`) on every endpoint + CRUD
- Error classification (400 safe, 500 hidden)
- Seed endpoint `NODE_ENV=production` guard
- Frontend fetch error context
- Reactive model architecture comments

### Phase 46 Plan: Runtime Error Translator (READY TO IMPLEMENT)
Full plan at `plans/plan-error-translator-04-07-2026.md`:
- `_clearTry` wraps CRUD/auth/validation with source context
- `_clearMap` embeds conditional source map
- Three-level output: safe / hint+line / verbose+schema
- `fix_scope` prevents AI from accidentally deleting working code
- 27 acceptance tests (DB, auth, async, API, multi-file, CSS, XSS, null, semantic, autonomous loop)
- Python first-class

## What's NOT Done

1. **Implement error translator** — Phase 46, plan ready, 7 phases, 16 TDD cycles
2. **Deploy playground to Vercel** — AI proxy ready
3. **Clear Cloud MVP** — Phase 42
4. **Client portal + admin dashboard templates** — Phase 43 items 50-51
5. **Streaming iterators** — Phase 44 item 55
6. **More AI provider presets** — `ask openai`, `ask mistral`

## Key Decisions
1. `call api` is the generic escape hatch — any REST API works
2. Service presets are sugar over `call api` with pre-filled config
3. `ask claude` is canonical; `ask ai` is alias
4. `when X notifies` replaces `webhook` jargon
5. Error translator uses inlined utilities (no external files, zero deps)
6. `fix_scope` in error responses prevents accidental code deletion
7. Python is first-class in all features (not deferred)
8. CLEAR_DEBUG controls verbosity (off/true/verbose)

## Known Issues
- Browser server doesn't inline module endpoints from `use everything from`
- `data from` synonym collision with variable name `data`
- `charge = charge via stripe:` collides (same word as synonym + variable)
- Single `_editing_id` shared across tables (edit mode collision)

## Files to Read First
| File | Why |
|------|-----|
| `CLAUDE.md` | Startup reading order, all rules |
| `AI-INSTRUCTIONS.md` | How to write Clear code and use the CLI |
| `intent.md` | Authoritative spec for all node types |
| `learnings.md` | Sessions 7-8: 34 gotchas |
| `ROADMAP.md` | Phases 30-45b complete, 46 planned |
| `plans/plan-error-translator-04-07-2026.md` | Next task: implement error translator |

## Resume Prompt
> Read HANDOFF.md, CLAUDE.md, AI-INSTRUCTIONS.md, ROADMAP.md. 1281 tests passing. 33 template apps. Phases 30-45b complete. Next task: implement error translator (Phase 46) from `plans/plan-error-translator-04-07-2026.md` — 7 phases, 16 TDD cycles, 27 acceptance tests. Branch: `feature/error-translator`. Python is first-class. Run `node clear.test.js` to verify.
