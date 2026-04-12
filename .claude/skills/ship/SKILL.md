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

### Step 0: Documentation Gate (MANDATORY — blocks ship if incomplete)

**THE RULE: If a feature exists in the compiler but not in the docs, it doesn't exist for anyone but us. Every feature ships with documentation or it doesn't ship.**

For EVERY new or changed feature on this branch, verify it appears in ALL FIVE documentation surfaces:

| # | File | What to check | If missing |
|---|------|--------------|------------|
| 1 | **`intent.md`** | Node type in spec table, syntax, compilation target | Add row to the appropriate table. Update the node count in the header. |
| 2 | **`SYNTAX.md`** | Complete syntax reference with example code block | Add a section with canonical syntax + at least one example |
| 3 | **`AI-INSTRUCTIONS.md`** | Coding conventions, when to use this feature, gotchas | Add to the appropriate section with a "do this / don't do this" example |
| 4 | **`USER-GUIDE.md`** | Tutorial coverage with a worked example | Add to an existing chapter or create a new section. Must be teachable. |
| 5 | **`.claude/skills/write-clear/SKILL.md`** | Meph knows how to use this feature | Add syntax pattern and example if it's something Meph would write |

**How to audit:** For each `.js` file changed on this branch:
1. `git diff main -- parser.js | grep "+.*NodeType\."` — find new node types
2. `git diff main -- parser.js | grep "+.*canonical =\|+.*CANONICAL_DISPATCH"` — find new dispatch entries
3. `git diff main -- compiler.js | grep "+.*case NodeType\."` — find new compiler cases
4. `git diff main -- synonyms.js | grep "+.*Object.freeze"` — find new synonyms
5. For EACH finding, grep all 5 doc files. If missing from any, add it.

| 6 | **`ROADMAP.md`** | Completed phases marked, line counts updated, new phases added | ALWAYS update — this is the SOURCE OF TRUTH for what Clear can do. If it's not in the roadmap, future sessions won't know it exists. Mark what was built, what phase it falls under, update test/line counts. |

**Also update these as needed:**
- **`learnings.md`** — Tricky bugs, compiler gotchas, design decisions
- **`PHILOSOPHY.md`** — New design principles if any emerged
- **`design-system.md`** — Theme changes, new presets, component patterns
- **`HANDOFF.md`** — Rewrite: what was done, what's next, key decisions, resume prompt
- **`CLAUDE.md`** — New rules, update test count if tests were added

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
