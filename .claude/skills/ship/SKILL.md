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

**Single source of truth: invoke the `docs` skill.** The docs skill (`.claude/skills/docs/SKILL.md`) owns the full doc cascade — `intent.md`, `SYNTAX.md`, `AI-INSTRUCTIONS.md`, `USER-GUIDE.md`, `ROADMAP.md`, `FAQ.md`, `RESEARCH.md`, `FEATURES.md`, `CHANGELOG.md`, and `playground/system-prompt.md` (Meph's live prompt). Run the docs skill first. Ship blocks until the docs skill reports clean.

**Why this used to be duplicated and isn't anymore:** before 2026-05-03 evening, ship and docs each had their own embedded 9-surface list. The lists drifted, and in practice neither was strictly enforced — the syntax-rename ship that day landed without a USER-GUIDE worked example because both lists were technically "soft." Now there's one list (in the docs skill) and one enforcer (this ship gate). When the list changes, change it in `.claude/skills/docs/SKILL.md` only — never duplicate it here.

**Ship-only additions** (not in docs scope — handle here AFTER the docs skill reports clean):
- **`HANDOFF.md`** — rewrite: what was done, what's next, key decisions, resume prompt for the next session
- **`CLAUDE.md`** (project-level) — add new rules if any emerged from the branch's work
- **`PROGRESS.md`** — if the branch was multi-session, update phase status + HITL fix table
- **`design-system.md`** — theme changes, new presets, component patterns (if UI work)
- **`learnings.md`** entries describing tricky bugs / patterns from this specific ship

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

### Step 2b: Meph tool eval (GATE when Meph touched)

If this branch changed any of:
- `playground/server.js` (especially the TOOLS array, executeTool switch, validateToolInput, /api/chat handler)
- `playground/system-prompt.md`
- Any tool definition or schema

…run the Meph eval BEFORE committing:
```
node playground/eval-meph.js
```

Cost: ~$0.10–0.30 per run. Time: ~90 seconds. Catches what compiler tests can't see — schema mismatches, hallucinated tools, malformed JSON outputs, broken tool dispatch. The pre-push hook also runs this (when `ANTHROPIC_API_KEY` is set), but running it during ship lets you fix issues before pushing rather than after the hook fails.

If 1–2 scenarios fail because Meph chose a different valid tool path, that's grader noise — confirm by re-reading the run output. If a scenario fails with "Unknown tool" or schema-error log lines, that's a real bug — stop and fix.

See `.claude/skills/eval-meph/SKILL.md` for the full guide.

### Step 2b-real-LLM: HARD GATE on AI-feature changes (added Session 38)

**Rule:** Any change that affects what Meph sees, reads, or responds to MUST be verified against a real LLM before shipping. Unit tests with mocked LLMs miss prompt bugs every time.

**Triggers (any one triggers the gate):**
- System prompt changed (`playground/system-prompt.md`)
- TOOLS array changed (tool defs, schemas, descriptions in server.js)
- Tool result payload shape changed (what gets serialized back to Meph)
- Retrieval/hint/reranker format changed (what Meph sees when he hits an error)
- New model integration (MEPH_MODEL swap, SDK version bump)
- System prompt caching added (cache breakpoints can invalidate mid-turn)

**How to verify:**
```
ANTHROPIC_API_KEY=sk-ant-... node playground/eval-meph.js
```
Minimum: 1 scenario that exercises the changed surface. If you changed hint formatting, hit a Factor-DB-matching error intentionally and verify Meph reads `hints.text` and references the pattern in his response. If you changed tool schemas, verify Meph calls the tool with valid args. If you changed the system prompt, verify he follows the new instruction.

**Exceptions:** doc-only changes (`.md` files that Meph doesn't read as a tool source), pure internal refactors that don't touch the wire format, backend-only supervisor/sweep changes that don't touch `/api/chat`.

**When API is rate-limited:** explicitly document "gate deferred — ran unit tests only" in the ship commit message, AND create a TODO at the top of HANDOFF.md saying "MUST real-LLM-eval before next ship." Russell lost a half-day of work on Session 38 because a "shipped" feature wasn't actually verified. This gate exists to prevent that recurrence.

### Step 2c: Data-at-risk gate (GATE — must pass to continue)

**Why this step exists:** on Session 38 we lost 343 training rows (149/57 → 492/182) because we treated `playground/factor-db.sqlite` as runtime state instead of committable data. The clean-worktrees hook saw a "clean" working tree (SQLite WAL mode hides pending writes) and deleted the worktree. Data vanished.

**Run WAL checkpoints on any SQLite DBs so git sees the true state:**
```
sqlite3 playground/factor-db.sqlite "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null
[ -f playground/sessions.db ] && sqlite3 playground/sessions.db "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null
```

**Verify the data files are either committed OR explicitly declined:**
1. Check if any of these have uncommitted changes:
   - `playground/factor-db.sqlite` — Factor DB (training data)
   - `playground/supervisor/reranker.json` / `reranker.pkl` — trained model bundle
   - `playground/supervisor/training-archive/*.jsonl` — training data archives
   - `playground/sessions/*.json` — Meph session records (typically transient)
2. For each with changes, either commit it in Step 3, or explicitly decline with a 1-line rationale in the commit message (e.g. "sessions/ intentionally skipped — runtime transient").
3. NEVER let the ship workflow succeed while `factor-db.sqlite` has unstaged row additions. The rows must either be committed (preferred) or explicitly archived to `/tmp/clear-backups/` or `playground/supervisor/training-archive/`.

**Hook recommendation:** `~/.claude/hooks/clean-worktrees.sh` was updated Session 38 to WAL-checkpoint + backup-before-delete. Don't rely only on the hook — commit the data during ship as a first-class concern.

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
3. Lists what's next (Next Steps Rule — suggest next tasks with priority order)
