# Handoff — 2026-04-07

## Current State
- **Branch:** `claude/review-handoff-bT9dt`
- **Tests:** 1067 passing, 0 failing
- **Working tree:** Clean

## What Was Done This Session

### New Language Features
- **`with delete` / `with edit`** on display tables — explicit opt-in, auto-wired to endpoints, validator warns on missing endpoints
- **`chart 'Title' as line/bar/pie/area showing data`** — ECharts integration, CDN only included when charts used
- **`when X changes:` / `when X changes after 250ms:`** — reactive input handlers with optional debounce
- **`'Photo' is a file input saved as photo`** — file upload input type, uses `change` event + `files[0]`
- **`database is supabase`** — Supabase adapter for both JS (supabase-js) and Python (supabase-py), CRUD compiles to SDK calls

### Compiler Quality
- **Bug-prevention validators:** endpoint must have response, fetch URL must match declared endpoint, did-you-mean for variable typos
- **CSS states:** `hover_*` properties → `:hover` rules, `focus_*` → `:focus-within`, auto-transition, responsive breakpoints
- **DaisyUI toasts:** slide-in animation, SVG icons, progress bar timer, error/success/info variants
- **Loading spinner:** DaisyUI `loading-spinner` replaces button text during async, try/catch with toast on error
- **Client validation:** auto-validates required fields before POST, shows toast on empty
- **Bug fixes:** pie chart array bounds, line chart y-axis fallback, file input .value skip

### Infrastructure
- **Supabase adapter** — both JS + Python, Supabase client init, CRUD → SDK calls, data shapes as comments
- **AI proxy** — Vercel serverless function, 3 calls/IP rate limit, counter in sidebar
- **Multi-file fix** — `use everything from` now inlines ALL node types (was limited to functions/assigns)
- **Tailwind grid** — column layouts use `grid-cols-N` instead of inline CSS

### Playground & Docs
- **Full syntax guide** in playground (30+ sections with all features)
- **Marketing copy** — "What Makes Clear Different" bullets, "How It Works" 3-step
- **Landing page** — Stripe-style: text-6xl hero, dark feature cards, stats row
- **Example apps** — Sales Dashboard with charts, Contact Manager with delete+edit, Todo with delete

## What's NOT Done (Priority Order)

1. **Phase 34: Pagination** — `get all Users page 2, 25 per page` → LIMIT/OFFSET. Needs parser syntax + CRUD compilation change.
2. **Phase 34: Compound unique constraints** — `unique together Student and Course`. Needs parser + SQL generation.
3. **Phase 34: Database transactions** — `BEGIN`/`COMMIT`/`ROLLBACK` wrapping for multi-step endpoints.
4. **Phase 37: FK inference opt-out** — `Type is text` shouldn't be treated as foreign key to Types table. Needs parser guard.
5. **Phase 35: Background jobs runtime** — Already compiles to `setInterval`, needs production-grade cron/scheduler.
6. **Phase 39: Desktop apps via Tauri** — `build for desktop` target.
7. **Namespaced component calls in web target** — `ui's Card()` crashes in buildHTML.

## Key Decisions Made

1. **`with delete/edit` is explicit opt-in, not auto-inferred from endpoints.** User explicitly asks for buttons; compiler handles wiring. Auto-inference was too magical.
2. **Supabase compiles directly to SDK, no db.* shim.** The SDK is already clean. Wrapping adds complexity.
3. **Clear Cloud = the Vercel model.** Clear owns compile+deploy, database is pluggable (Supabase, Turso, PlanetScale).
4. **Python is backend-only.** Frontend nodes (ASK_FOR, DISPLAY, BUTTON, CHART) are web-only by design. Python backend is first-class for all server features.
5. **`hover_*` prefix in style blocks** is acceptable jargon for the style property context.
6. **Charts auto-detect x/y fields** — first string field is x-axis, number fields are y-axis series.

## Known Issues
- Browser server doesn't inline module endpoints from `use everything from` (only serverJS does)
- `data from` synonym collision: `get data from '/url'` tokenizes `data from` as a single keyword. Use different variable names.
- Playground preview screenshots timeout with Tailwind CDN (works in real browser)
- `page_cta` preset has `text-primary-content` which may not work on all themes
- Auth in browser server is hard-coded `{ id: 1, role: "admin" }` for dev mode

## Files to Read First
| File | Why |
|------|-----|
| `CLAUDE.md` | Startup reading order, all rules, GAN method, plan/red-team mandate |
| `intent.md` | Authoritative spec — all 97+ node types, build targets, env vars |
| `learnings.md` | Scan TOC — engineering gotchas, synonym traps, parser ordering |
| `ROADMAP.md` | What's built (Phases 1-33, 37), what's planned (34-39) |
| `compiler.js` TOC | Table of contents at top of file maps all sections |
| `parser.js` TOC | Table of contents at top of file maps all sections |
| `plans/plan-supabase-adapter-04-06-2026.md` | Supabase implementation plan (executed) |
| `plans/plan-crud-table-actions-04-06-2026.md` | with delete/edit implementation plan (executed) |

## Resume Prompt
> Read HANDOFF.md, CLAUDE.md, and ROADMAP.md. Branch is `claude/review-handoff-bT9dt`, 1067 tests passing. Phases 30-33 and 37 (items 21-24) are complete. Next priorities: Phase 34 (pagination, compound unique, transactions), Phase 37 item 25 (FK inference opt-out), then Phase 35 (background jobs runtime). The user wants the compiler to prevent as many categories of bugs as possible — add validators that catch mistakes at compile time. Use `/write-plan` and `/red-team-plan` before any new syntax. Run `node clear.test.js` to verify.
