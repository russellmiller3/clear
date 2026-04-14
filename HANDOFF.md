# Handoff — 2026-04-13 (Shipped: Tests + Deploy + GTM)

## Current State
- **Branch:** main (everything merged)
- **Tests:** 1850 compiler tests, 0 failures. 164 app tests across 8 templates.
- **Working tree:** clean after this commit

## What Was Done This Session (40+ commits)

### Product Infrastructure
- **Studio Test Runner** — Tests tab with "Run Tests" button. Auto-runs on Run click. Switches to Tests tab on failure. Status bar shows pass/fail count.
- **Postgres adapter** — `runtime/db-postgres.js`. Same API as SQLite. Lazy table creation. SQL injection hardened (table/column name sanitization).
- **Railway deploy** — `clear deploy <file>`. Packages, detects db backend, deploys.
- **Meph layout** — Chat on left. Todo tool. All "Claude" → "Meph" rebranding.

### Test Generation (the big one)
- **English test names** — "Creating a new todo succeeds" not "POST /api/todos returns 201"
- **CRUD flow tests** — "User can create a todo and see it in the list"
- **Agent tests** — smoke test, auth test, guardrail test for every agent
- **Nameless test blocks** — `test:` with body as name (zero redundancy)
- **Intent syntax** — `can user create/view/delete/search`, `X should require login`, `should fail with error 'msg'`
- **Colon field separator** — `with title: 'Buy groceries'`
- **`should` canonical** — not `does`. Mid-sentence position works.
- **`user` shorthand** — `user's id` = `req.user.id` in endpoints
- **`search` intent** — `can user search todos`
- **Test runner rewrite** — starts real server, installs deps, shares JWT secret
- **Auto-test on Run** — tests run automatically, switch to Tests tab on failure

### Security
- **5 P0s fixed** from red-team: SQL injection in Postgres adapter, TLS bypass, process.exit at module load
- **27 compiler guarantees** documented in ROADMAP.md

### Business
- **Two landing pages** — business apps + agents
- **GTM.md** — $4k/mo RPA replacement, 90-day plan
- **competition.md** — Retool, Managed Agents, LangChain positioning
- **PHILOSOPHY.md** — Rule 15 (compiler tests everything) + Rule 16 (smart compiler, forgetful AI)

### Haiku Validation
- Ran 3 rounds of Haiku writing Clear apps against AI-INSTRUCTIONS.md
- Each round: found mistakes → updated instructions → Haiku got better
- Instructions now battle-tested against the dumbest viable LLM

## Next Steps

1. **Deploy todo-fullstack to Railway** — prove the pipeline end-to-end
2. **Record 60-second Loom demo** — for cold outreach emails
3. **Find 3 pilot companies** — Axial network, FinServ/insurance
4. **Fix P1 bugs** — hardcoded delete ID in tests, `can`/`does` synonym fragility
5. **Add `as user` context switching** for multi-user tests

## Resume Prompt

```
Read HANDOFF.md then PHILOSOPHY.md then CLAUDE.md.

Massive session shipped. 40+ commits. Test generation engine with
English names, intent syntax, agent tests, nameless blocks. Postgres
adapter + Railway deploy. GTM plan for $4k/mo contracts. Haiku
validated Rule 16. 1850 compiler tests, 164 app tests, all green.

Next: deploy todo-fullstack to Railway, record Loom, find pilots.
```
