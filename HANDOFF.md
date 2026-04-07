# Handoff — 2026-04-07 (Session 8, Final)

## Current State
- **Branch:** main
- **Tests:** 1281 passing (132 new tests this session)
- **Apps:** 33 template apps, all compile and deploy
- **Working tree:** Clean

## What Was Done This Session

### External API Calls (Phase 45) — NEW
- `call api 'url':` — generic HTTP with headers, body, method, timeout
- `charge via stripe:` — Stripe Charges API (form-encoded)
- `send email via sendgrid:` — SendGrid v3 Mail API (JSON)
- `send sms via twilio:` — Twilio Messages API (Basic auth)
- `ask claude 'prompt' with data using 'model'` — canonical AI form (ANTHROPIC_API_KEY)
- `when stripe notifies '/path':` — natural webhook syntax
- `needs login` — alias for `requires auth` (14-year-old test)

### Template Apps Built (5 new, Phase 43)
- **CRM** — contacts + deals, midnight theme
- **Booking** — services + bookings, ivory theme
- **Invoice** — clients + invoices + line items, full CRUD
- **CRM Pro** — 5 tables, pipeline chart, compound unique, debounced search
- **CRM SPA** — multi-file (4 files), components, tabs, modal, slide panel, SSE, chart

### Compiler Bugs Fixed (8 bugs from E2E testing)
1. `save X as new Y` → `db.update('as')` — parser now handles `as` connector
2. PUT endpoints missing `req.params.id` — auto-injected for `:id` routes
3. `Activity → activitys` — `pluralizeName()` handles y→ies
4. Schema name mismatch — plural lookup tries all forms
5. Multi-page routing broken — pages now wrapped in `<div id="page_X">`
6. Sidebar layout crushed by `max-w-2xl` — flex-direction: row detected
7. `use everything from` didn't reach HTML scaffold — nodes spliced into AST
8. App presets tuned — sidebar/content/header spacing

### E2E Testing
- Deployed 6 apps, hit every endpoint, race condition tests (concurrent POSTs/PUTs/DELETEs)
- All pass — Node single-threaded event loop serializes correctly

## What's NOT Done

1. **Deploy playground to Vercel** — AI proxy ready, just needs `vercel deploy`
2. **Clear Cloud MVP** — Phase 42, hosted compile + deploy
3. **Client portal + admin dashboard templates** — Phase 43 items 50-51
4. **Streaming iterators** — `for each line in stream file` — Phase 44 item 55
5. **More AI provider presets** — `ask openai`, `ask mistral` via `call api`

## Key Decisions
1. `call api` is the generic escape hatch — any REST API works
2. Service presets are sugar over `call api` with pre-filled config
3. `ask claude` is canonical; `ask ai` is alias (ANTHROPIC_API_KEY with CLEAR_AI_KEY fallback)
4. `when X notifies` replaces `webhook` jargon
5. `needs login` replaces `requires auth` — 14-year-old test
6. HTTP_REQUEST node type (distinct from frontend API_CALL)
7. Each service uses its correct content type (form-encoded vs JSON)

## Known Issues
- Browser server doesn't inline module endpoints from `use everything from`
- `data from` synonym collision with variable name `data`
- `charge = charge via stripe:` collides (same word as synonym + variable)
- `GET /api/teams/:id` returns all records (doesn't filter by id param)

## Files to Read First
| File | Why |
|------|-----|
| `CLAUDE.md` | Startup reading order, all rules |
| `AI-INSTRUCTIONS.md` | How to write Clear code and use the CLI |
| `intent.md` | Authoritative spec for all node types |
| `learnings.md` | Scan TOC — Sessions 7-8 have 28 gotchas |
| `ROADMAP.md` | Phases 30-45 complete |

## Resume Prompt
> Read HANDOFF.md, CLAUDE.md, AI-INSTRUCTIONS.md, ROADMAP.md. 1281 tests passing. 33 template apps. Phases 30-45 complete. External APIs work (call api, Stripe, SendGrid, Twilio, ask claude). Next: deploy playground to Vercel, Clear Cloud MVP, client portal + admin dashboard templates. Run `node clear.test.js` to verify.
