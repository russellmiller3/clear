# Handoff — 2026-04-09 (Session 13)

## Current State
- **Branch:** main
- **Compiler tests:** 1482 (all passing)
- **Playground tests:** ~271 across 4 test files (agent.test.js grew from 50 → ~70 assertions with Phase 8+9)
- **Node types:** 99
- **Template apps:** 43+

## What Was Done This Session

### Bugs Fixed
1. **Blank Claude response** — Model ID was stale (`claude-sonnet-4-20250514` → `claude-sonnet-4-6`). Also added `r.ok` check before reading SSE stream so server errors surface instead of silently producing blank bubbles.
2. **"Compile first" on ecommerce-api** — `build for javascript backend` (no HTML) puts code in `result.javascript`, not `result.serverJS`. The run button only checked `serverJS`. Fixed by computing `backendCode = serverJS || (!html && javascript)`.
3. **Gray box typing indicator** — When Claude starts with tool calls (no text yet), the empty assistant bubble showed as a blank gray box. Fixed: render animated dots when `streaming && !content && !toolSteps.length`.

### Features Added
4. **Docs viewer** — "Syntax" and "Guide" toolbar buttons open a full-height right drawer with rendered markdown. Client-side markdown parser, section-based search, keyboard close (Escape), tab switching. Server routes `GET /api/docs/syntax` and `GET /api/docs/user-guide` serve the files with a strict allowlist.
5. **Compile stats in status bar** — After every successful compile, shows `N → M lines · Xms` (non-blank Clear lines → non-blank compiled lines, wall-clock time).
6. **Compiler-requests.md protocol** — System prompt now instructs the agent: when hitting a genuine language gap, try to work around it first, then log a structured request to `compiler-requests.md` (App / What I needed / Proposed syntax / Workaround / Error hit / Impact). Never edit the compiler.
7. **Agent test coverage Phase 8+9** — Added to `agent.test.js`:
   - Phase 8: docs API endpoints, overlay open/close, search, Guide tab, compile stats, toolbar buttons
   - Phase 9: `highlight_code` tool, `read_terminal` tool

## Key Files Changed
- `playground/ide.html` — typing indicator fix, docs overlay HTML+CSS+JS, compile stats, `_editorView` exposed, `r.ok` check, backendCode run fix
- `playground/server.js` — model ID `claude-sonnet-4-6`, `/api/docs/:name` endpoint
- `playground/system-prompt.md` — compiler-requests.md format + instructions
- `playground/agent.test.js` — Phase 8 (docs + UI) and Phase 9 (highlight + terminal) tests
- `learnings.md` — Session 13 section added
- `ROADMAP.md` — Phase 3c marked done

## Known Issues / Open Threads
- **Screenshot pipeline untested end-to-end** — The html2canvas → base64 → server → Claude vision path is built but hasn't been exercised in a real conversation. Test by asking playground Claude to build a UI and call `screenshot_output`.
- **Templates not audited for current syntax** — Templates may use older syntax patterns. Should do a pass with `node cli/clear.js check apps/*/main.clear --json` to find any that produce warnings/errors.
- **Backend-only `run_app` tool in server.js** also has the `serverJS` vs `javascript` bug — the agent's in-server compile result uses the same check. Only the client-side run button was fixed this session.
- **`compiler-requests.md` doesn't exist yet** — It gets created the first time the agent hits a language gap and uses `write_file`. That's fine — it's created on demand.

## Resume Prompt
"We've been building the Clear playground IDE. Last session we fixed blank Claude responses (wrong model ID), the 'Compile first' bug for backend-only apps, the empty typing indicator, added a Syntax/Guide docs viewer, compile stats in the status bar, a compiler-requests.md agent protocol, and agent test phases 8+9. The run_app tool in server.js still has the same serverJS/javascript bug the client-side run button had — fix that first. Then test the screenshot pipeline end-to-end by asking playground Claude to build a UI. After that, audit templates for syntax currency."
