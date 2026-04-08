# Handoff — 2026-04-08 (Session 10)

## Current State
- **Branch:** main
- **Tests:** 1422 passing
- **Apps:** 39 template apps (3 agent GAN apps + 6 new from other sessions)
- **Working tree:** Clean

## What Was Done This Session

### Tier 7: First-Class AI Agents — Complete
11 phases + skills. Every agent feature from the roadmap is implemented and tested.

| Feature | Syntax | Streams? |
|---------|--------|----------|
| Tool Use | `can use: fn1, fn2` | No (tool loop) |
| Skills | `skill 'Name':` + `uses skills:` | No (tool loop) |
| Guardrails | `must not:` (compile-time + runtime) | N/A |
| Conversation | `remember conversation context` | Composable |
| Memory | `remember user's preferences` | Composable |
| RAG | `knows about: Tables` | Composable |
| Observability | `track agent decisions` | Composable |
| Model Selection | `using 'claude-opus-4-6'` | Composable |
| Pipelines | `pipeline 'Name' with var:` | Per step |
| Parallel | `do these at the same time:` | Per agent |
| HITL | `ask user to confirm 'msg'` | N/A |
| Testing | `mock claude responding:` | N/A |
| Streaming | Default for text, `do not stream` opt-out | Default |

### Streaming by Default
- Text agents (no `returning:`, no tools) stream via `_askAIStream` async generator
- Structured output auto-disables streaming (JSON must be complete)
- Tool-use/skill agents auto-disable (tool loop needs full response)
- `do not stream` — explicit opt-out for pipeline steps

### Composable Agent Pipeline
All features compose on a single agent: tools + conversation + RAG + tracking + model + streaming. Refactored from early-return blocks to sequential bodyCode/preamble modification.

### CLI Commands
- `clear agent <file>` — introspect agents, skills, pipelines
- `clear eval <file>` — schema evals (deterministic, mocked AI)
- `clear eval <file> --graded` — LLM-graded scorecard harness
- `clear test` rewritten for agent apps (browserServer, async, mocks)

### GAN Apps (Discriminator Tests)
- `apps/support-agent/` — 1 agent, skills, RAG, guardrails (2 tests)
- `apps/hiring-agent/` — 4 agents, pipeline, parallel (3 tests)
- `apps/helpdesk-agent/` — 5 agents, 3 skills, pipeline, parallel, RAG (6 tests)

### Compiler Bugs Found by GAN
- `define function` with CRUD compiled non-async (SyntaxError)
- `mock claude responding:` only overrode `_askAI`, not `_askAIWithTools`
- Browser server missing `_astBody` for tool schema lookup
- Single-line `must not:` had colon token in first policy
- Streaming replaced ALL returns, not just AI result returns
- Model injection didn't handle `_askAIStream` calls

## Resume Prompt

> Read HANDOFF.md, CLAUDE.md. 1422 tests. 39 apps. Session 10: Tier 7 AI agents complete. Streaming by default for text agents. All features compose. CLI: agent, eval, eval --graded. 3 GAN apps (11 tests). No backward compat rule. Next: deploy playground to Vercel, production tier (Phases 47-50), more GAN apps.
