---
allowed-tools: Bash(git *), Bash(node *), Read, Glob, Grep, Edit, Write, Agent
description: Ship a Clear feature: update all docs, commit, merge to main, push. Updates learnings, roadmap, philosophy, syntax, handoff, and readme.
---

## Context

- Current branch: !`git branch --show-current`
- Git status: !`git status`
- Recent commits on this branch: !`git log --oneline main..HEAD`
- Changed files: !`git diff --name-only main..HEAD`

## Your task

Ship the current feature branch. This is a comprehensive ship process for the Clear language project — not just a git merge, but a full documentation update.

### Step 0: Update documentation files

Review every changed file and update these docs as needed:

- **`learnings.md`** — Add lessons learned: tricky bugs, compiler gotchas, design decisions, things that didn't work
- **`ROADMAP.md`** — Mark completed items, update line counts, add new phases if needed
- **`PHILOSOPHY.md`** — Add new design principles if any emerged
- **`SYNTAX.md`** — Document any new or changed syntax with examples
- **`design-system-v2.md`** — Reflect theme color changes, new presets, updated component patterns
- **`AI-INSTRUCTIONS.md`** — Add new coding conventions, update examples
- **`HANDOFF.md`** — Rewrite: what was done, what's next, key decisions, known issues, resume prompt
- **`CLAUDE.md`** — Verify new rules are present, update test count if tests were added
- **`.claude/skills/write-clear/SKILL.md`** — Update the write-clear skill if new syntax was added, canonical forms changed, or new features need examples

### Step 1: Rebuild playground bundle

If compiler.js or any compiler file changed:
```
npx esbuild index.js --bundle --format=esm --minify --outfile=playground/clear-compiler.min.js
```

### Step 2: Run tests (GATE — must pass to continue)

**Skip this step if the branch only changed documentation files** (`.md` files, no `.js` changes). Doc-only ships don't need a test run.

Otherwise:
```
node clear.test.js
```

If tests fail, stop and fix them. Do not ship broken code.

### Step 3: Commit all changes

Stage all modified files (prefer specific names over `git add -A`):
```
git add [changed files]
```

Create a commit:
```
git commit -m "$(cat <<'EOF'
[description of what was shipped]

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Step 4: Merge to main

```
git checkout main
git merge <feature-branch> --no-ff -m "Merge <feature-branch>"
```

### Step 5: Delete the feature branch

```
git branch -d <feature-branch>
```

### Step 6: Push to origin

```
git push origin main
```

If push fails due to divergence, pull with `--no-rebase --no-edit` first, then push again.

### Step 7: Report

Tell the user:
- What was shipped (summary of changes)
- How many commits on the branch
- Test count (should be 1005+)
- Which docs were updated
- Branch deleted confirmation

### Step 8: Big Picture

End with a "What We Accomplished" section that:
1. Summarizes today's work in plain language (not technical jargon)
2. Explains how it connects to the bigger picture — where Clear is going, what this unlocks
3. Lists what's next (Open Claw Rule — suggest next tasks with priority order)
