---
name: pres
description: "PRES = Plan → Red-team → Execute → Ship. Full build cycle with no manual handoffs. Use when the user says '/pres [feature]', 'pres this', 'pres this plan', or wants to go from idea (or existing plan) to shipped."
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, Skill
---

## What this skill does

**P**lan → **R**ed-team → **E**xecute → **S**hip. Four phases, no handoffs:

1. **Plan** — Assess scope, read intent.md and relevant files, produce a phased TDD plan saved to `plans/`.
2. **Red-team** — Stress-test the plan for missing edge cases, ordering bugs, wrong assumptions, tech debt. Patch issues before touching code.
3. **Execute** — Spawn one agent per phase, run tests between phases, gate on green.
4. **Ship** — Update docs, run full test suite, commit, merge to main, push.

## Your task

The user gave you a feature/task to build, OR pointed at an existing plan. Run all four phases in order.

### Phase 1 — Plan

If the user pointed at an existing plan file (e.g. "pres this plan", "pres plans/plan-foo.md"):
- **Skip this phase** — the plan already exists. Read it, then go to Phase 2.

Otherwise:
- Invoke the `write-plan` skill with the user's request as the argument.
- Wait for the plan to be saved to `plans/plan-[name]-MM-DD-YYYY.md` before continuing.

### Phase 2 — Red-team

Invoke the `red-team-plan` skill on the plan file.

Fix any issues the red-team identifies by editing the plan file directly. Do not proceed with a plan that has unresolved P0/P1 risks.

### Phase 3 — Execute

Invoke the `execute-plan` skill pointing at the patched plan file.

All phase gates must pass (tests green) before moving to the next phase. If a phase fails, stop and report the failure to the user — do not auto-skip.

### Phase 4 — Ship

Invoke the `ship` skill once all plan phases are complete and tests are green.

## On failure

If any phase fails (red-team finds a blocker, test gate fails, ship fails), stop immediately and report:
- Which phase failed
- What the specific failure was
- What the user needs to decide before you can continue

Do not silently skip failures or auto-fix things that require design decisions.

## Arguments

Pass the user's task description or plan file path directly through. Everything after `/pres` is the task or plan reference.
