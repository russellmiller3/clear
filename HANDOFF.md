# Handoff -- 2026-04-11

## Current State
- **Branch:** `fix/agent-bugs`
- **Last commit:** `66a0542` + uncommitted changes (docs update)
- **Tests:** 1675 compiler (all passing), 0 failures

## What Was Done This Session

### T2 Bug Fixes (35+ bugs resolved across two sessions)
1. **Agent system fixed end-to-end** (session 1) -- agents defaulted to streaming generators, `await` returned `{}`. Flipped to non-streaming default. Server-only nodes (AGENT, WORKFLOW, SKILL, PIPELINE, PARALLEL_AGENTS, POLICY) added to BACKEND_ONLY_NODES. `post to` in button handlers, `fetch from` URL concatenation, Python httpx import.
2. **New node types** -- HIDE_ELEMENT, CLIPBOARD_COPY, DOWNLOAD_FILE, LOADING_ACTION, UPLOAD_TO, LOGIN_ACTION. All with parser + compiler + tests.
3. **Display format overhaul** -- `toLocaleString` replaces `toFixed(2)` for currency. Added percent, date, json formats. `as json` synonym collision fixed in 3 parser locations.
4. **Video/audio media** -- `show video`/`show audio` with parser `parseMedia()` and compiler content types.
5. **Gallery/map/calendar/QR** -- display tag mapping in parser, reactive `_recompute` and `buildHTML` support.
6. **CRUD fixes** -- auto-inject `:id` for PUT/DELETE endpoints, multer require at module scope.
7. **Python fixes** -- workflow state dict quoted keys, `_ask_ai` recursive detection, httpx module-scope import, cron lifespan context manager, proper None/True/False coercion.
8. **Cron/background** -- try/catch wrapping for fault tolerance.

### Extended Thinking for Meph (Studio IDE)
- Anthropic API calls now include `thinking` with `budget_tokens: 8000`
- SSE parser handles thinking events with collapsible `<details>` blocks in chat UI
- Thinking signature stored and replayed for multi-turn conversations
- 5-retry exponential backoff with 60s timeout for network resilience

### SVG Click-to-Expand
- SVG diagrams in chat get a clickable overlay that opens a full-screen modal
- Uses `cloneNode(true)` instead of `innerHTML` to preserve SVG namespace

### ROADMAP.md Rewrite
- Complete rewrite with current priorities, Surface Area Rule, RL as speculative

### Documentation Update
- learnings.md, SYNTAX.md, CLAUDE.md, USER-GUIDE.md, AI-INSTRUCTIONS.md, HANDOFF.md all updated

## Key Decisions
- **Surface Area Rule** -- prioritize features that increase the range of apps Clear can build, not depth of existing features.
- **RL is speculative** -- curriculum and patch API are built but RL training is a research bet, not a shipping priority. Don't invest more until validated.
- **DOM cloning for SVG** -- `innerHTML` destroys SVG namespace. Always use `cloneNode(true)` for SVG manipulation.
- **Display format via `toLocaleString`** -- proper i18n-ready formatting instead of string concatenation hacks.

## Known Issues
- `server.test.js` has 2 pre-existing failures: template count assertion (expects old count), chat validation (message format check)
- `as json` synonym collision is fixed but fragile -- any new synonym touching `as` or `json` needs careful testing
- Python workflow endpoint auto-generation is new and lightly tested

## Files Changed
| File | What |
|------|------|
| `compiler.js` | Video/audio, display formats, CRUD `:id` injection, Python workflow/cron fixes, new node compilation (hide/clipboard/download/loading), multer scope, gallery/map/calendar/QR |
| `parser.js` | 6 new NodeTypes, `parseMedia()`, display format fixes, loading/hide parsing, `isReactiveApp` triggers |
| `synonyms.js` | Video/audio synonyms, version bump to 0.15.0 |
| `playground/ide.html` | Extended thinking UI, SVG expand overlay |
| `playground/server.js` | Retry logic, extended thinking API, thinking SSE, signature tracking |
| `clear.test.js` | ~35 new tests for all new features |
| `ROADMAP.md` | Complete rewrite |
| `learnings.md` | Session 23 added |
| `SYNTAX.md` | 7 new feature sections |
| `CLAUDE.md` | Test count updated to 1675 |
| `USER-GUIDE.md` | Display formats section added |
| `HANDOFF.md` | This file |

## Resume Prompt
> Read HANDOFF.md and requests.md. The `fix/agent-bugs` branch has 35+ bug fixes and new features ready to merge. Run `node clear.test.js` (expect 1675 passing). Check `server.test.js` for the 2 known failures. Next priorities: remaining T1 bugs in requests.md (workflow output, Python agent cluster), then merge to main.
