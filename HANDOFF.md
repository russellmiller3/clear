# Handoff — 2026-04-08 (Session 11)

## Current State
- **Branch:** main
- **Tests:** 1446 passing
- **Apps:** 43+ template apps (4 agent GAN apps, 1 workflow GAN app)
- **Working tree:** Clean

## What Was Done This Session

### Tier 8: Agent Workflows — Complete (6 phases, LangGraph parity)
All 6 workflow phases implemented, tested, and shipping:

- **Phase 85: Workflow State** — `workflow 'Name' with state:` + `state has:` block with typed fields (number, boolean, timestamp) and defaults. Compiles to `async function workflow_name(state)` with `Object.assign` initialization.
- **Phase 86: Conditional Routing** — `if state's field is value:` + `otherwise:` inside workflow body. Compiles to if/else chains between step calls.
- **Phase 87: Cycles & Retry Loops** — `repeat until condition, max N times:` with nested conditionals. Compiles to `for` loop with break condition and max iteration guard.
- **Phase 88: Durable Execution** — Two tiers: `save progress to Workflows table` (DB checkpoint at each step) and `runs on temporal` (compiles to Temporal.io workflow + activity proxies).
- **Phase 89: Parallel Branches** — `at the same time:` + `step 'X' with 'Agent' saves to state's field`. Compiles to `Promise.all` with targeted state field assignment.
- **Phase 90: Workflow Observability** — `track workflow progress` logs state snapshots after each step into `_history` array.

### New Node Types
- `WORKFLOW` — workflow definition with state, directives, and step body
- `RUN_WORKFLOW` — workflow invocation: `result = run workflow 'Name' with data`

### GAN App
`apps/content-pipeline/main.clear` — 90 lines exercising all 6 phases: research → write → quality-gated retry loop → parallel sentiment+SEO analysis → publish, with DB checkpoints and observability.

## Key Decisions
- Workflow steps thread a `_state` object (pass-by-reference, not pipeline-style). Each agent receives and returns full state.
- `at the same time` in workflows is structurally different from `do these at the same time` (Phase 80). Workflow parallel uses `step` declarations with `saves to`; Phase 80 uses assignment expressions.
- State var references in conditions are rewritten from `state.X` to `_state.X` via regex in the compiler.
- `saves to` is a multi-word synonym (canonical `saves_to`) — parser checks canonical, not raw value.

## Known Issues
- Workflow compilation is JS-only (no Python target yet — would need `asyncio.gather` for parallel, `async def` for functions)
- Temporal import is generated inline (would need a separate worker file in real deployments)
- No workflow-specific test syntax yet (`run workflow 'X' with ...` in test blocks uses standard `run workflow` assignment)

## Resume Prompt

> Read HANDOFF.md, CLAUDE.md. 1446 tests. Session 11: Tier 8 Agent Workflows complete (Phases 85-90) — workflow state, conditional routing, retry cycles, durable execution (DB + Temporal), parallel branches with join, observability. LangGraph parity achieved. GAN app: content-pipeline. Next: update USER-GUIDE workflow chapter, Python workflow target, Tier 1 production (real DB + deploy), playground Vercel deploy.
