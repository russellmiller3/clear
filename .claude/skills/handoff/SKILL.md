---
name: handoff
description: Create or update HANDOFF.md to pass context between sessions. Use when ending a session, switching tasks, or when the user says "handoff", "save context", "write a resume prompt", or "I'm done for now".
---

# Handoff — Session Context Transfer

**Purpose:** Write a `HANDOFF.md` file that gives the next session everything it needs to continue work without re-reading the entire codebase.

## When to trigger
- User says "handoff", "save context", "write resume prompt", "I'm done for now"
- End of a long session with uncommitted design decisions or in-progress work
- Switching between features mid-stream

## What to write

Create or overwrite `HANDOFF.md` in the project root with this structure:

```markdown
# Handoff — [Date]

## Current State
- **Branch:** [current branch name]
- **Last commit:** [hash + message]
- **Working tree:** [clean / dirty — list uncommitted files if dirty]

## What Was Done This Session
[2-4 bullet points summarizing completed work]

## What's In Progress
[Anything started but not finished — be specific about what's left]

## Key Decisions Made
[Design decisions, architecture choices, or user preferences that aren't in code yet]
[Include WHY, not just WHAT — the next session needs the reasoning]

## Known Issues / Bugs
[Anything broken, flaky, or needing investigation]

## Next Steps (Priority Order)
1. [Most important next task]
2. [Second priority]
3. [Third priority]

## Files to Read First
| File | Why |
|------|-----|
| [path] | [what context it provides] |

## Resume Prompt
> [Copy-paste-ready prompt for the next session to start with]
```

## Rules

1. **Be specific, not vague.** "Fix the bug" is useless. "Fix confusion matrix grid — `$derived.by` issue in ConfusionMatrix.svelte line 17" is useful.
2. **Include file paths.** The next session shouldn't have to search for things.
3. **Include the branch name.** Always.
4. **Capture user preferences.** If the user expressed opinions about design, naming, or approach during this session, note them.
5. **Note any env/config changes.** New env vars, new dependencies, new migrations that haven't been applied.
6. **The resume prompt should be self-contained.** Someone should be able to paste it into a fresh Claude session and get productive in under 30 seconds.

## After writing

Tell the user: "Handoff saved to `HANDOFF.md`. Start next session with: `Read HANDOFF.md and continue from where we left off.`"
