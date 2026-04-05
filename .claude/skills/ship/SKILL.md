---
allowed-tools: Bash(git *), Read, Glob, Grep
description: Commit, push, merge to main, and delete the feature branch. Solo dev ship-it workflow.
---

## Context

- Current branch: !`git branch --show-current`
- Git status: !`git status`
- Recent commits on this branch: !`git log --oneline main..HEAD`

## Your task

Ship the current feature branch: commit any remaining changes, merge to main, delete the branch, deploy.

**NOTE:** This project pushes to `origin` (GitHub). Vercel auto-deploys from GitHub on push to main — no manual `vercel --prod` needed.

### Step 0: Pre-ship checks

1. Run the `update-learnings` skill to capture any lessons from this work
2. Check if `intent.md` needs updates (new shapes, actions, env vars, auth rules)
3. If changes were made to learnings or intent, stage and commit them

### Step 1: Commit any uncommitted changes

If there are staged or unstaged changes:
1. Stage relevant files (prefer specific names over `git add -A`)
2. Create a commit with an appropriate message
3. Include `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`

If working tree is clean, skip to Step 2.

### Step 2: Merge to main

```
git checkout main
git merge <feature-branch> --no-ff -m "Merge <feature-branch>"
```

Use `--no-ff` to preserve the branch history in the merge commit.

### Step 3: Delete the feature branch

```
git branch -d <feature-branch>
```

### Step 4: Push to origin

```
git push origin main
```

If push fails due to divergence, pull with `--no-rebase --no-edit` first, then push again.
Retry up to 4 times with exponential backoff on network errors.

### Step 5: Backup (if backup remote exists)

If a `backup` remote is configured:
```
git push backup main
```

### Step 6: Report

Tell the user what was merged, how many commits, confirm branch deleted, and that Vercel will auto-deploy.
