# Handoff — 2026-04-07 (Session 8)

## Current State
- **Branch:** main (merged from claude/build-deploy-template-apps-8ozox)
- **Tests:** 1265 passing (30 new stress tests this session)
- **Apps:** 33 template apps, all compile and deploy
- **Working tree:** Clean

## What Was Done This Session

### Template Apps Built (5 new apps)
- **CRM** (`apps/crm/`) — Contacts + deals CRUD, midnight theme, seed data
- **Booking** (`apps/booking/`) — Services + bookings, ivory theme, seed data
- **Invoice** (`apps/invoice/`) — Clients + invoices + line items, full CRUD with edit/delete
- **CRM Pro** (`apps/crm-pro/`) — 5 tables, pipeline chart, compound unique, debounced search, activity log
- **CRM SPA** (`apps/crm-spa/`) — Multi-file (4 files), reusable components, tabs, modal, slide panel, SSE streaming, ECharts, 2-page hash routing

### Compiler Bugs Fixed (8 bugs)
1. `save X as new Y` compiled to `db.update('as', X)` — parser now handles `as` connector
2. PUT endpoints missing `req.params.id` injection — now auto-injected for `:id` routes
3. `Activity → activitys` — `pluralizeName()` handles y→ies, ch→ches, x→xes
4. `ActivitySchema` not found — schema lookup now tries plural forms
5. Multi-page routing broken — pages now wrapped in `<div id="page_X">`
6. Sidebar layout crushed by `max-w-2xl` — `flex-direction: row` added to full-layout detection
7. `use everything from` didn't reach HTML scaffold — nodes now spliced into `ast.body`
8. App presets too wide — tuned sidebar/content/header/card spacing

### E2E Testing
- Deployed 6 apps, hit every endpoint with real HTTP requests
- Race condition tests: 10 concurrent POSTs, 5 concurrent PUTs, DELETE+GET races
- All pass — Node single-threaded event loop serializes correctly

### Stress Tests (30 new)
- Seed block insert vs update, PUT ID injection, multi-page routing
- Table pluralization (Activity, Category, Address)
- Multi-file imports (3-level deep, no double-compilation)
- Complex SPA (tabs + modal + chart + debounce + multi-page)

## What's NOT Done

1. **Deploy playground to Vercel** — AI proxy ready, just needs `vercel deploy`
2. **Clear Cloud MVP** — Phase 42, hosted compile + deploy
3. **Client portal template** — Phase 43 item 50
4. **Admin dashboard template** — Phase 43 item 51
5. **Streaming iterators** — `for each line in stream file` — Phase 44 item 55
6. **Desktop via Tauri** — Phase 45

## Key Decisions
1. `use everything from` splices nodes into parent AST (not stored on USE node)
2. `pluralizeName()` centralizes all table name pluralization
3. `isInsert` flag distinguishes `save X as Y` (insert) from `save X to Y` (update)
4. PUT endpoints auto-inject `req.params.id` when path has `:id`
5. Multi-page routing wraps pages in hidden divs, first page visible
6. GAN method (static mock → compiler output comparison) validates UI quality
7. E2E testing catches bugs unit tests miss — always deploy before shipping

## Known Issues
- Browser server doesn't inline module endpoints from `use everything from`
- `data from` synonym collision with variable name `data`
- Inline button body syntax `button 'X': action` doesn't parse the action
- `GET /api/teams/:id` returns all records (doesn't filter by id param)

## Files to Read First
| File | Why |
|------|-----|
| `CLAUDE.md` | Startup reading order, all rules |
| `AI-INSTRUCTIONS.md` | How to write Clear code and use the CLI |
| `intent.md` | Authoritative spec for all node types |
| `learnings.md` | Scan TOC — Sessions 7-8 have 22 gotchas |
| `ROADMAP.md` | Phases 30-44 complete, 42-45 planned |

## Resume Prompt
> Read HANDOFF.md, CLAUDE.md, AI-INSTRUCTIONS.md, ROADMAP.md. 1265 tests passing. 33 template apps built and tested. Phase 43 (templates) complete. 8 compiler bugs fixed via E2E testing. Multi-file SPA with components, streaming, and reactive UI works end-to-end. Next: deploy playground to Vercel, build client portal + admin dashboard templates, then Clear Cloud MVP. Run `node clear.test.js` to verify.
