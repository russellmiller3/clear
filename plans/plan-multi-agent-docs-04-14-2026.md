# Plan: Multi-Agent Orchestration — Doc Audit & Gap Fill

**Date:** 2026-04-14
**Scope:** Small — docs-first with one new test. Multi-agent infrastructure ALREADY EXISTS in the compiler. This plan audits what's there, documents gaps, adds one missing test.

## The Problem

User requested "multi-agent support with orchestration and loops." Audit revealed the compiler already implements:

- `AGENT` — `agent 'Name' receives X:`
- `RUN_AGENT` — `call 'Name' with X` (works inside endpoints AND inside other agents)
- `PARALLEL_AGENTS` — `do these at the same time:`
- `PIPELINE` — `pipeline 'Name' with var:` + `step 'X' with 'Agent'`
- `SKILL` — `skill 'Name':` with `uses skills:` directive
- Scheduled agents — `agent 'X' runs every 1 day:`
- Directives — `can use:`, `knows about:`, `remember conversation context`, `track agent decisions`, `must not:`, `block arguments matching`
- Streaming default for text agents

Per `CLAUDE.md` Documentation Rule: "If a feature exists in the compiler but not in the docs, it doesn't exist." So the actual work is documentation.

## Gaps Found

| # | Gap | Severity | Location |
|---|-----|----------|----------|
| 1 | `for each X in list: result = call 'Agent' with X; add result to results` — pattern has no test | MED | `clear.test.js` |
| 2 | Agent-to-agent calls (coordinator pattern) — works but not shown in SYNTAX.md | HIGH | `SYNTAX.md` |
| 3 | Pipeline body syntax (`step 'X' with 'Agent'`) — not shown in SYNTAX.md | MED | `SYNTAX.md` |
| 4 | Skill vs. `can use:` — no guidance on when to use which | MED | `AI-INSTRUCTIONS.md` |
| 5 | USER-GUIDE has no multi-agent tutorial section | MED | `USER-GUIDE.md` |
| 6 | Meph system prompt doesn't teach multi-agent patterns | HIGH | `playground/system-prompt.md` |
| 7 | `intent.md` multi-agent node rows need orchestration examples refreshed | LOW | `intent.md` |
| 8 | ROADMAP multi-agent phase status not consolidated | LOW | `ROADMAP.md` |

## Phased Execution

### Phase 1 — Verify the loop pattern works (add test first, TDD)

Write a test in `clear.test.js` for the dynamic fan-out pattern:

```clear
agent 'Scorer' receives item:
  score = ask claude 'Score 1-10' with item
  send back score

agent 'Batch Processor' receives items:
  results is an empty list
  for each item in items:
    s = call 'Scorer' with item
    add s to results
  send back results
```

Assertions:
- Compiles with 0 errors
- Emits `async function agent_scorer(...)` and `async function agent_batch_processor(...)`
- Inside `agent_batch_processor`, emits a `for (const item of items)` loop containing `await agent_scorer(item)` and a `.push(...)` call

If the test fails, fix compiler. If it passes (likely — each primitive works independently), the test documents the contract.

Gate: `node clear.test.js` — must be green before proceeding.

### Phase 2 — Update SYNTAX.md

Add under `## AI Agents`:
- **Agent-to-Agent Calls** subsection (coordinator pattern example)
- **Pipeline body syntax** — show `step 'X' with 'Agent'` explicitly
- **Dynamic fan-out with loops** — `for each` + `call 'Agent'` pattern (this is new content tying existing primitives together)

### Phase 3 — Update AI-INSTRUCTIONS.md

Add to the AI Agents section:
- Skill vs. `can use:` decision table (when to bundle as a skill vs. inline)
- Coordinator-vs-specialist guidance (when to use nested calls vs. pipeline vs. parallel)

### Phase 4 — Update USER-GUIDE.md

Add a "Multi-Agent Apps" tutorial section with a worked example (triage agent that delegates to scorer + classifier) — building on the existing helpdesk-agent template.

### Phase 5 — Update intent.md + ROADMAP.md

- `intent.md`: ensure RUN_AGENT, PARALLEL_AGENTS, PIPELINE, SKILL rows reflect current syntax with a multi-agent orchestration example block
- `ROADMAP.md`: consolidate multi-agent status into one "Multi-Agent Orchestration" entry with completion note

### Phase 6 — Update Meph's system prompt

`playground/system-prompt.md` — add a "Multi-Agent Patterns" subsection listing the 4 orchestration patterns: sequential chain, parallel fan-out, dynamic loop fan-out, pipeline. Show a short example for each so Meph can pattern-match.

### Phase 7 — Test gate + ship

- `node clear.test.js` — all tests pass (new loop test included)
- Compile all core templates — 0 errors
- Rebuild compiler bundle: `npx esbuild index.js --bundle --format=esm --minify --outfile=playground/clear-compiler.min.js`
- `git commit` + push to main (no branch — doc changes, low risk)

## Success Criteria

- [ ] New test in `clear.test.js` passes — dynamic fan-out pattern verified
- [ ] SYNTAX.md shows all 4 orchestration patterns with worked examples
- [ ] AI-INSTRUCTIONS.md has skill-vs-can-use decision table
- [ ] USER-GUIDE.md has multi-agent tutorial section
- [ ] intent.md and ROADMAP.md reflect current state
- [ ] Meph's system prompt references multi-agent patterns
- [ ] `node clear.test.js` — 1852+ passing
- [ ] Compiler bundle rebuilt
- [ ] All changes committed + pushed

## Files Touched

| File | Change |
|------|--------|
| `clear.test.js` | +1 test for dynamic fan-out |
| `SYNTAX.md` | Expand AI Agents section |
| `AI-INSTRUCTIONS.md` | Add agent decision tables |
| `USER-GUIDE.md` | Add multi-agent tutorial |
| `intent.md` | Update orchestration node rows |
| `ROADMAP.md` | Consolidate multi-agent phase status |
| `playground/system-prompt.md` | Add multi-agent patterns |
| `playground/clear-compiler.min.js` | Rebuild (mechanical) |

## Resume Prompt

```
Read HANDOFF.md, PHILOSOPHY.md, then CLAUDE.md.

Executing plan-multi-agent-docs-04-14-2026.md — documenting existing
multi-agent infrastructure (AGENT, RUN_AGENT, PARALLEL_AGENTS, PIPELINE,
SKILL already compile). Adding one missing test for for-each + call 'Agent'
dynamic fan-out. Updating SYNTAX, AI-INSTRUCTIONS, USER-GUIDE, intent,
ROADMAP, Meph system prompt.

Gate: node clear.test.js green before ship.
```
