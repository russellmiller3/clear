---
name: update-learnings
description: Update learnings.md with lessons from completed work. Trigger when: user says "update learnings", "add to learnings", "document what we learned", after completing a plan phase, or when finishing a feature branch. Also trigger proactively after each phase completes during execute-plan.
---

# Update Learnings

**Announce:** "Updating learnings.md with lessons from this work."

## When to Run

- After each phase of a large plan completes
- After finishing a small plan or fix
- When explicitly asked by the user
- Before closing a feature branch (as part of finishing-a-development-branch)

## Step 1: Gather context

Read the following to understand what was just built:

```
Read learnings.md  (current lessons — avoid duplicating)
Read PROGRESS.md   (if it exists — phase summaries)
Run: git log --oneline -10  (recent commits on this branch)
Run: git diff main...HEAD --stat  (files changed)
```

If the user mentioned a specific phase or feature, focus on that.

## Step 2: Extract lessons

Look for patterns in what was built. Good learnings are:

| ✅ Good | ❌ Not useful |
|---------|--------------|
| "X causes Y — fix by doing Z" | "We built the feature" |
| "Pattern: always do A when B" | "The tests pass" |
| "Gotcha: library X does Y unexpectedly" | "Used TypeScript" |
| "Testing trick: mock X by doing Y" | "Read the docs" |

**Categories to consider:**
- **Testing** — patterns, gotchas, test setup tricks
- **Architecture** — patterns that worked/didn't work
- **API/Integration** — surprises in external APIs or internal contracts
- **Tooling** — build, deploy, git, CI surprises
- **Performance** — what was slow and how it was fixed
- **Svelte/Framework** — reactivity gotchas, lifecycle, runes
- **Git/Pre-commit** — hook behaviors, workflow lessons

## Step 3: Write the entries

**Format for new entries:**

```markdown
## [Feature/Task Name] (YYYY-MM-DD)

### [Category]

- **Short title.** Detailed explanation. Why it matters. How to avoid the problem.
- **Another lesson.** Context. Fix or pattern.
```

Rules:
- One bullet = one concrete, actionable lesson
- Bold the key takeaway at the start of each bullet
- Include the "why" and the "fix" — not just "we did X"
- Skip anything already in learnings.md (check first)
- 3-8 bullets per phase is the right size — not a novel

## Step 4: Append to learnings.md

Add new entries at the END of the file (chronological order, newest last).

If `learnings.md` doesn't exist, create it with this header:

```markdown
# Engineering Learnings

Lessons learned during development. Updated after each phase or significant task.

---
```

## Step 5: Commit

```bash
git add learnings.md
git commit -m "docs: update learnings after [phase/feature name]"
```

---

## Quick Mode (post-phase)

When running automatically after a plan phase, skip Steps 1-2 and go straight to extracting lessons from the phase that just completed. Keep it brief (3-5 bullets). The goal is to capture the lesson while it's fresh, not write a novel.
