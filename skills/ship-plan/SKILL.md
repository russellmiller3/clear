---
name: ship-plan
description: Runs the full plan → red-team → execute pipeline in one shot. Use when the user says "ship this", "plan and build", "full plan", "write and execute", "just build it", "plan it and do it", "end to end", or any time they clearly want to go from idea to running code without stopping. Also trigger when the user describes a feature and says "go" or "do it all" — they want the whole pipeline, not just a plan. Don't trigger when the user only wants a plan written (no execution yet) or only wants to red-team an existing plan.
---

# Ship Plan

**Announce:** "I'm using the ship-plan skill — writing the plan, red-teaming it, then executing. Full pipeline."

This skill runs three skills back-to-back without stopping to ask permission between steps:

1. **write-plan** — create the implementation plan
2. **red-team-plan** — stress-test and patch it
3. **execute-plan** — implement it phase by phase

The whole point is to skip the "want me to execute now?" prompt and just go.

---

## Step 0: Create a branch

Before anything else, create a feature branch:

```bash
git checkout -b feature/[kebab-case-name-of-what-youre-building]
```

Name it from the feature, not the plan (e.g. `feature/sqlite-persistence`, not `feature/phase-47`).
If already on a feature branch, skip this step.

---

## Step 1: Write the Plan

Follow the **write-plan** skill instructions exactly, with one change:

> **Skip Step 7** (the "offer execution" prompt at the end of write-plan). Do not ask if the user wants to execute — proceed directly to Step 2 below.

Everything else in write-plan applies: assess scope, read intent.md, explore files, fill the template, add learnings hooks, run the review checklist.

---

## Step 2: Red-Team the Plan

Follow the **red-team-plan** skill instructions exactly, with one change:

> **Skip Step 8** (the handoff prompt). Do not say "ready for Code mode" — proceed directly to Step 3 below.

Everything else in red-team-plan applies: all priority checks, attack checklists, TDD audit, drunk-junior-dev gate, fix everything found, write the attack report in chat.

---

## Step 3: Execute the Plan

Follow the **execute-plan** skill instructions exactly, starting from Step 1 (read the plan).

The plan file already exists from Steps 1–2. Read it, identify phases, execute phase by phase.

---

## Checkpoints

After red-team (before execute), print a one-line status:

```
Branch: feature/[name]  |  Plan: ✓ written  |  Red-team: ✓ patched (N issues fixed)  |  Executing now...
```

If red-team finds a BLOCKED issue (architectural, not patchable), stop and report to the user before proceeding. Don't execute a plan with unresolved blockers.

---

## When to Stop and Ask

Only pause at these moments:
- **Scope ambiguity** — if you can't tell if this is a small fix or a large feature, ask once
- **BLOCKED from red-team** — architectural issue that can't be fixed at the plan level
- **Phase failure after 2+ debug attempts** — per execute-plan's repeated failure rule

Everything else: make a judgment call and keep moving.
