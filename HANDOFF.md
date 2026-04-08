# Handoff — 2026-04-08 (Session 11)

## Current State
- **Branch:** main
- **Tests:** 1482 passing
- **Apps:** 43+ template apps (4 agent GAN apps, 1 workflow GAN app)
- **Node types:** 99
- **Working tree:** Clean

## What Was Done This Session

### 1. Tier 8: Agent Workflows — Phases 85-90 (LangGraph Parity)
All 6 workflow phases implemented in both JS and Python:
- **Phase 85:** Workflow state (`state has:` with typed fields + defaults)
- **Phase 86:** Conditional routing (`if state's X is Y:` + `otherwise:`)
- **Phase 87:** Retry loops (`repeat until condition, max N times:`)
- **Phase 88:** Durable execution (`save progress to Table` + `runs on temporal`)
- **Phase 89:** Parallel branches (`at the same time:` + `saves to state's field`)
- **Phase 90:** Observability (`track workflow progress` → `_history` array)

### 2. Python Streaming AI
- `_ask_ai()` and `_ask_ai_stream()` utility functions in Python backend
- Python text agents stream by default via async generator
- `import httpx` for async HTTP, `import asyncio` for parallel

### 3. Canonical Syntax Changes
- `agent 'Name' receives var:` (was `receiving` — both still work)
- `returning JSON text:` for structured output (was `returning:` — both work)

### 4. First-Class Errors
- **validateCallTargets:** errors on undefined agent/pipeline/workflow calls
- **validateMemberAccessTypes:** warns on field access on number/boolean
- **Orphan endpoints** promoted from warning → compile error
- **Runtime:** `Number("")` coerces to `null` not `0`

### 5. Enact Guard Policies (30+ runtime safety guards)
New `POLICY` node type with `policy:` block syntax:
```clear
policy:
  block schema changes
  block deletes without filter
  protect tables: AuditLog
  block prompt injection
  require role 'admin'
  no mass emails
```
Covers: database safety, prompt injection, access control, code freeze,
email/Slack, filesystem, git safety, CRM, cloud storage.

### 6. Roadmap Reprioritized
Rewrote Tier 8 from open-source tooling (formal grammar, LSP) to hosted
platform architecture (CodeMirror editor, compile API, one-click deploy).

## Key Decisions
- `receives` reads as a complete English sentence (better than gerund `receiving`)
- `returning JSON text:` signals structured data to smart non-dev readers
- Enact policies compile to runtime middleware wrapping db operations
- CSRF on POST stays as warning (too many legit unauthenticated POST endpoints)
- Orphan endpoints promoted to error (frontend fetching non-existent backend = always a bug)

## Known Issues
- Python workflow compilation doesn't support Temporal target (JS only for `runs on temporal`)
- `no_repeat_emails` and `require_human_approval_for_delete` are registered but need cloud DB backend
- Playground bundle needs Vercel deploy for public demo

## Resume Prompt

> Read HANDOFF.md, CLAUDE.md. 1482 tests. Session 11: Tier 8 Workflows (Phases 85-90) + Python streaming + canonical syntax (receives, returning JSON text) + first-class errors + 30+ Enact guard policies. Agent roadmap 100% complete. Roadmap reprioritized for hosted platform. Next: CodeMirror Clear mode for hosted editor, hosted compile API, one-click deploy, type system (inferred).
