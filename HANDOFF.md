# Handoff — 2026-04-08 (Session 10)

## Current State
- **Branch:** main
- **Tests:** 1407 passing
- **Apps:** 34 template apps, all compile
- **Working tree:** Clean

## What Was Done This Session

### Tier 7: First-Class AI Agents (11 Phases)
Complete implementation of AI agent features — Clear is now the best way to build AI agents in plain English.

| Phase | Feature | Syntax |
|-------|---------|--------|
| 80 | Parallel Agents | `do these at the same time:` |
| 77 | Pipelines | `pipeline 'Name' with var:` + `call pipeline` |
| 82 | Observability | `track agent decisions` |
| 75 | Tool Use | `can use: fn1, fn2` + `_askAIWithTools` agentic loop |
| 75b | Skills | `skill 'Name':` + `uses skills:` |
| 83 | Guardrails | `must not:` block (compile-time + runtime policies) |
| 76 | Conversation | `remember conversation context` |
| 79 | Memory | `remember user's preferences` |
| 81 | Human-in-the-Loop | `ask user to confirm 'message'` |
| 84 | Agent Testing | `mock claude responding:` |
| 78 | RAG | `knows about: Documents, Products` |

### Additional Features
- **Variable prompts:** `ask claude variable_name with data` (text blocks work as agent prompts)
- **Agent directive scanner:** All directives parsed BEFORE parseBlock to avoid synonym collisions
- **Composable features:** Skills + tools + tracking + RAG all compose on a single agent

### GAN Agent App
`apps/support-agent/main.clear` — 80 lines of Clear → 300 lines of JS. Exercises skills, tool use, observability, RAG, guardrails, long prompts, text blocks, and mock testing.

## Key Decisions Made

1. **`do` is synonym for `then`** — changed parallel syntax from `run these at the same time:` to `do these at the same time:` (registered as multi-word synonym `do_parallel`)
2. **`log` is synonym for `show`** — changed observability syntax from `log agent decisions` to `track agent decisions`
3. **`run` is synonym for `raw_run`** — changed pipeline invocation from `run pipeline` to `call pipeline`
4. **Directives before parseBlock** — all agent directives (`can use:`, `must not:`, `remember`, `track`, `knows about:`, `uses skills:`) parsed inside `parseAgent()` before `parseBlock()` to avoid synonym collisions
5. **Skills are compile-time only** — tools merge, instructions concatenate, no runtime overhead
6. **RAG v1 is keyword search** — no embedding API needed, upgradeable to vectors later
7. **Composable agent pipeline** — refactored `compileAgent()` from early-return blocks to composable: skills → tools → tracking, all features stack

## Known Issues / Bugs

- **Web target doesn't compose agent features** — `build for web and javascript backend` compiles agent functions through a different code path (browser server) that doesn't include the composable preamble. Backend-only works. Tracked for fix.
- Browser server doesn't inline module endpoints from `use everything from`
- `data from` synonym collision with variable name `data`
- Single `_editing_id` shared across tables (edit mode collision in multi-table UIs)
- Regex-based code wrapping (`bodyCode.replace(/_askAI/g, ...)`) is fragile for multi-line calls

## Next Steps (Priority Order)

1. **Fix web target agent composition** — make composable pipeline work in `compileToBrowserServer()`
2. **Multi-agent GAN app** — build a 3-agent pipeline app exercising all features as discriminator test
3. **Deploy playground to Vercel** — AI proxy ready, just needs `vercel deploy`
4. **Client portal + admin dashboard templates** — complete Phase 43
5. **Clear Cloud MVP** — hosted compile + deploy

## Files to Read First

| File | Why |
|------|-----|
| `HANDOFF.md` | This file — session context |
| `CLAUDE.md` | Startup reading order, all rules, 1407 tests |
| `learnings.md` | Scan TOC — Session 10 has agent synonym traps + directive parsing |
| `ROADMAP.md` | Phases 30-46b, 75-84 complete, 1407 tests |
| `SYNTAX.md` | New AI Agents section at bottom |
| `plans/plan-agent-tier7-04-08-2026.md` | Full implementation plan (red-teamed) |

## Resume Prompt

> Read HANDOFF.md, CLAUDE.md. 1407 tests passing. 34 apps. Phases 30-46b, 75-84 complete. Session 10: Tier 7 AI agents — 11 phases: tool use (can use + _askAIWithTools), skills (reusable tool bundles), guardrails (must not: compile-time + runtime), conversation (remember conversation context), memory (remember user's preferences), pipelines, parallel execution, observability, HITL, agent testing, RAG. Composable: all features stack on one agent. GAN app: apps/support-agent/main.clear. Next: fix web target agent composition, multi-agent GAN app, deploy playground.
