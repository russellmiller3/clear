# Handoff — 2026-04-07

## Current State
- **Branch:** main
- **Tests:** 1149 passing (60 stress tests added this session)
- **Working tree:** Clean

## What Was Done This Session

### New Language Features
- `with delete` / `with edit` on display tables — explicit opt-in CRUD buttons
- `chart 'Title' as line/bar/pie/area showing data` — ECharts integration
- `when X changes:` / `when X changes after 250ms:` — reactive input handlers with debounce
- `'Photo' is a file input saved as photo` — file upload input type
- `database is supabase` — Supabase adapter (JS + Python)
- `as one operation:` — database transactions (BEGIN/COMMIT/ROLLBACK)
- `one per field1 and field2` — compound unique constraints
- `get all Items page 1, 25 per page` — pagination
- `retry 3 times:` — exponential backoff retry
- `with timeout 5 seconds:` — operation timeout
- `first to finish:` — race concurrent tasks

### Compiler Quality
- 18 OWASP-aligned security validators (injection, CSRF, IDOR, brute force, path traversal, etc.)
- Bug-prevention validators (endpoint response, URL typos, did-you-mean)
- CSS states (hover_, focus_, transitions, responsive, animations)
- DaisyUI toasts (icons, slide-in, progress bar)
- Loading spinner + client validation + error display
- 1 crash fixed (sanitizeName(undefined))
- 1 false-positive fixed (author_id IDOR warning)

### Infrastructure
- Agent-friendly CLI — 12 commands, all with `--json`: build, check, info, fix, lint, serve, test, run, dev, init, package, help
- AI proxy (Vercel serverless, 3 calls/IP)
- Multi-file `use everything from` fix
- Python parity: Supabase, rate limiting
- Renamed AI-STYLE-GUIDE.md → AI-INSTRUCTIONS.md

## What's NOT Done

1. **Deploy playground to Vercel** — AI proxy ready, just needs `vercel deploy`
2. **Template apps** (CRM, invoice, booking) — Phase 43
3. **Clear Cloud MVP** — Phase 42, hosted compile + deploy
4. **Streaming iterators** — `for each line in stream file` — Phase 44 item 55
5. **Desktop via Tauri** — Phase 45

## Key Decisions
1. Clear Cloud = the Vercel model (compile+deploy, databases pluggable)
2. CLI is a tool for agents, not an agent itself
3. `one per X and Y` beats `unique together` (phone test)
4. `as one operation:` beats `transaction:` (14-year-old test)
5. Security validators are compile-time, not runtime
6. `author_id` is NOT an ownership field — only `user_id`/`owner_id` trigger IDOR warnings

## Known Issues
- Browser server doesn't inline module endpoints from `use everything from`
- `data from` synonym collision with variable name `data`
- Inline button body syntax `button 'X': action` doesn't parse the action

## Files to Read First
| File | Why |
|------|-----|
| `CLAUDE.md` | Startup reading order, all rules |
| `AI-INSTRUCTIONS.md` | How to write Clear code and use the CLI |
| `intent.md` | Authoritative spec for all node types |
| `learnings.md` | Scan TOC — Session 7 has 13 gotchas |
| `ROADMAP.md` | Phases 30-38+44 complete, 40-45 planned |

## Resume Prompt
> Read HANDOFF.md, CLAUDE.md, AI-INSTRUCTIONS.md, ROADMAP.md. 1149 tests passing. Phases 30-38 and 44 complete. Agent-friendly CLI with 12 commands (all support --json). Next: deploy playground to Vercel, build template apps (CRM, invoice, booking), then Clear Cloud MVP. Use `node cli/clear.js info <file> --json` to introspect .clear files. Run `node clear.test.js` to verify.
