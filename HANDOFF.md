# Handoff — 2026-04-07

## Current State
- **Branch:** main (after merge of claude/review-handoff-bT9dt)
- **Tests:** 1089 passing
- **Working tree:** Clean

## What Was Done This Session

### New Language Features (10 new node types / syntax forms)
- `with delete` / `with edit` on display tables — explicit opt-in CRUD buttons
- `chart 'Title' as line/bar/pie/area showing data` — ECharts integration
- `when X changes:` / `when X changes after 250ms:` — reactive input handlers
- `'Photo' is a file input saved as photo` — file upload input type
- `database is supabase` — Supabase adapter (JS + Python)
- `as one operation:` — database transactions (BEGIN/COMMIT/ROLLBACK)
- `one per field1 and field2` — compound unique constraints
- `get all Items page 1, 25 per page` — pagination

### Compiler Quality (18 security checks)
- OWASP Top 10 validators: SQL injection, CSRF, path traversal, IDOR, brute force
- Bug-prevention: endpoint without response, fetch URL typos, did-you-mean for variables
- CSS states: hover_, focus_, transitions, responsive breakpoints, animations
- DaisyUI toasts with icons, slide-in animation, progress bar
- Loading spinner on async buttons, client-side validation before fetch
- Multi-file `use everything from` fix (inlines ALL node types)

### Infrastructure
- AI proxy (Vercel serverless, 3 calls/IP)
- Stripe-style landing page presets
- Full syntax guide in playground (30+ sections)
- Python parity: Supabase, rate limiting, proper comments
- **Agent-friendly CLI** — 12 commands, all with `--json` output: build, check, info, fix, lint, serve, test, run, dev, init, package, help
- **Renamed AI-STYLE-GUIDE.md → AI-INSTRUCTIONS.md** — it's an instruction manual for AI, not a style guide

## What's NOT Done

1. **Phase 39: Desktop apps via Tauri** — `build for desktop` target. Big project, separate effort.
2. **Async patterns** — `race:`, `wait for:`, cancellation. Medium difficulty.
3. **Streaming/iterators** — Process large files lazily. Medium difficulty.
4. **Error recovery** — `retry 3 times:`, `with timeout 5 seconds:`, `fallback:`. Medium.
5. **Namespaced component calls in web target** — `ui's Card()` crashes buildHTML.

## Key Decisions
1. Clear Cloud = the Vercel model (compile+deploy, database pluggable)
2. Supabase compiles directly to SDK, no db.* shim
3. `with delete/edit` is explicit opt-in, not auto-inferred
4. `one per X and Y` beats `unique together` (phone test)
5. `as one operation:` beats `transaction:` (14-year-old test)
6. Security validators are compile-time, not runtime

## Known Issues
- Browser server doesn't inline module endpoints from `use everything from`
- `data from` synonym collision with variable name `data`
- Auth in browser server hard-coded `{ id: 1, role: "admin" }`

## Files to Read First
| File | Why |
|------|-----|
| `CLAUDE.md` | Startup reading order, all rules |
| `intent.md` | Authoritative spec for all node types |
| `learnings.md` | Scan TOC — Session 7 section has 13 new gotchas |
| `AI-INSTRUCTIONS.md` | How to write Clear code and use the CLI (renamed from AI-STYLE-GUIDE.md) |
| `ROADMAP.md` | Phases 30-38 complete, Phases 40-45 planned |

## Resume Prompt
> Read HANDOFF.md, CLAUDE.md, AI-INSTRUCTIONS.md, ROADMAP.md. 1089 tests passing. Phases 30-38 all complete. Agent-friendly CLI with 12 commands (all support --json). Next priorities: deploy playground to Vercel, build template apps (CRM, invoice, booking), then Phase 41 (clear deploy), Phase 44 (retry/timeout/race). The compiler catches 18 categories of security vulnerabilities at compile time. Run `node clear.test.js` to verify. Use `node cli/clear.js info <file> --json` to introspect any .clear file.
