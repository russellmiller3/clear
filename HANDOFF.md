# Handoff — 2026-04-08 (Session 11)

## Current State
- **Branch:** main
- **Tests:** 1567 (1482 compiler + 85 playground)
- **Node types:** 99
- **Apps:** 43+ templates
- **Working tree:** Clean

## What Was Done This Session

### 1. Tier 8: Agent Workflows (Phases 85-90)
Stateful multi-step AI workflows with retry loops, conditional routing, parallel branches, DB checkpoints, Temporal.io, and observability. Both JS and Python.

### 2. Python Streaming + Python Workflows (Phase 91)
`_ask_ai_stream()` async generator in Python backend. Workflows compile to Python with asyncio.gather for parallel.

### 3. Canonical Syntax (Phase 92)
`agent 'Name' receives var:` and `returning JSON text:` — both old forms still work.

### 4. First-Class Errors (Phase 92)
validateCallTargets (undefined agent/pipeline/workflow), validateMemberAccessTypes (field on number), orphan endpoints promoted to error, Number("") → null.

### 5. Enact Guard Policies (Phase 93)
30+ runtime safety guards: `policy:` block with database safety, prompt injection, access control, code freeze, email/Slack, filesystem, git safety, CRM, cloud storage.

### 6. Local Playground IDE
`node playground/server.js` → `http://localhost:3456`
- CodeMirror 6 editor with Clear syntax highlighting (bundled, zero deps)
- 43 template apps in dropdown
- Auto-compile on keystroke (debounced)
- Live preview (iframe with browserServer)
- Terminal with server logs
- Run: starts compiled Express app as child process
- Save: writes main.clear + build/ to Desktop
- Claude agent chat with 6 tools (edit_code, run_command, compile, run_app, stop_app, http_request)
- Light/dark theme toggle
- Compile shimmer animation, button effects, toast notifications
- 85 automated tests (security, lifecycle, errors, CLI)

### 7. Roadmap Reprioritized
Hosted platform architecture: CodeMirror → compile API → deploy → types.
Formal grammar + LSP deprioritized (closed-source, hosted editor model).

## Known Issues
- Playground CodeMirror syntax highlighting doesn't rebuild on theme toggle (colors use CSS vars but HighlightStyle is static)
- `no_repeat_emails` and `require_human_approval_for_delete` policies registered but need cloud DB
- Python Temporal workflow not supported
- Save test artifacts need gitignore (done)

## Resume Prompt

> Read HANDOFF.md, CLAUDE.md. 1567 tests (1482 compiler + 85 playground). Session 11: Workflows (85-90), Python streaming (91), canonical syntax + errors (92), Enact policies (93), local playground IDE with Claude agent. Run: `node playground/server.js`. Next: one-click deploy, type system, JS module import, playground visual polish.
