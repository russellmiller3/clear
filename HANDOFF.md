# Handoff — 2026-04-11

## Current State
- **Branch:** `main`
- **Tests:** 1640 passing / 0 failing (compiler) + 9 sandbox integration tests
- **Synonym version:** 0.14.0
- **Model:** claude-sonnet-4-6 (1M context) for Meph in Studio

## What Was Done This Session

### Compiler Features (P5-P14 complete)
- **P5** HTTP test assertions — `call POST /path`, `expect response status/body`
- **P6** Curriculum task library — 20 benchmark tasks across 10 difficulty levels
- **P7** Patch API — 11 structured edit operations for RL action space
- **P10** Cron scheduling — `every 5 minutes:`, `every day at 9am:`
- **P13** AI streaming in endpoints — bare `ask claude 'prompt'` streams via SSE
- **P14** Output capture — `result = run command 'cmd'` captures stdout

### Compiler Bug Fixes (all requests.md items fixed)
- `refresh page` → `location.reload()` (was `console.log(refresh)`)
- `post to` with form data → sends only input fields, not entire `_state`
- `post to` in button handler → parser crash fixed by dispatch unification
- `ask agent 'Helper'` from endpoint → parser skips optional `agent` keyword
- Runtime errors → `_clearError` always returns `{ error, hint, clear_line }`

### Structural Safety
- Optional chaining `?.` for null-safe possessive access
- Chain depth + expression complexity warnings
- Keyword guard for better unrecognized syntax errors
- `_pick` auto-serializes nested JSON for SQLite, `_revive` auto-parses

### Architecture: Unified Dispatch
- Eliminated RAW_DISPATCH / CANONICAL_DISPATCH split
- Every keyword now has a self-synonym (e.g. `database → database`)
- One dispatch map, one lookup line: `DISPATCH.get(token.canonical || token.value)`
- Validation guard catches dead entries at module load time
- Removed `toggle → checkbox` synonym (different concepts)

### Studio (IDE) Improvements
- Renamed from "Playground" to "Clear Studio"
- Agent renamed to **Mephistopheles (Meph)**
- Chat state, editor content, terminal log persist to localStorage
- Personality prompt moved to top of system prompt with CRITICAL framing
- Ctrl+K toggles chat panel open/closed
- Compile stats badge in toolbar with pop animation
- Code tab: JS/Python syntax highlighting via CodeMirror + sub-tabs
- Terminal: JSON pretty-printing with syntax highlighting
- `read_file` tool: Meph can read SYNTAX.md, AI-INSTRUCTIONS.md, PHILOSOPHY.md, USER-GUIDE.md, requests.md (TOC + line-range for large files)
- `write_file` guarded against undefined params
- Compile tool returns compiled output even on errors
- API key injection: `.env` ANTHROPIC_API_KEY passed to child processes
- Context meter: shows token usage estimate after each response
- Model: claude-sonnet-4-6 with 1M context, 50-message history

### Skills & Process
- `/pres` skill (Plan → Red-team → Execute → Ship)
- Tech debt rules added to write-plan and red-team-plan skills
- `.gitattributes` for consistent LF line endings

## What's Next

Priority order for next session:

1. **SVG rendering in chat** — Meph's SVG diagrams show as raw markup instead of rendered visuals
2. **Compiler animation** — line-by-line visual mapping from Clear source → compiled output using `// clear:N` markers
3. **New requests from Meph** — check requests.md for bugs filed during this session's testing
4. **Full directory rename** — `playground/` → `studio/` (80+ references, mechanical but big diff)

Plan exists: `plans/plan-studio-visual-features-04-11-2026.md`

## Resume Prompt

"Continue Clear language development. Run tests first (`node clear.test.js` — expect 1640). Check requests.md for new bugs Meph filed. The plan at `plans/plan-studio-visual-features-04-11-2026.md` covers SVG chat rendering, compiler animation, and remaining visual features. Also do the full playground→studio directory rename. Narrate as you go (Science Documentary Rule)."

## Known Issues / Caveats

- Sandbox symlink requires Windows junction type on some setups
- `_clearLineMap` off-by-one: if injection point changes, update the offset
- Source map granularity: markers only at indent ≤ 2 in backend mode
- Curriculum tasks with `{{token}}` placeholders need auth flow in test runner
- `patch.js` table detection uses lowercase string matching
- Meph's `write_file` was silently failing (now guarded with error messages)
