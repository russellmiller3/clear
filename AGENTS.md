# Clear Repository Guidance

## Session Startup

- Read `HANDOFF.md`, `PHILOSOPHY.md`, and `CLAUDE.md` before making code changes in this repository.
- Treat `CLAUDE.md` as project-level compatibility guidance from Claude sessions. Follow it unless it conflicts with higher-priority Codex/developer instructions or newer user direction.
- For language/compiler work, consult `intent.md`, `learnings.md`, `AI-INSTRUCTIONS.md`, and `SYNTAX.md` before editing parser, compiler, validator, runtime, or Meph-facing behavior.

## Project Expectations

- Keep generated artifacts out of Git. Build outputs, sweep sessions, scratch apps, temp files, caches, and root-level generated app files should stay ignored and untracked.
- `playground/factor-db.sqlite` is source/training data for the flywheel, not a disposable artifact.
- Run `node clear.test.js` after JavaScript/runtime/compiler changes. Use the bundled Node runtime if `node` is not available on PATH.

## Branch Discipline

- Always do work on a branch. Never edit, stage, or commit feature/fix/doc work directly on `main`.
- Before starting work from `main`, create a focused branch such as `feature/<name>`, `fix/<name>`, or `docs/<name>`.
- Merge back to `main` only after the branch is tested, committed, and ready to ship.

## Worker Management

- Do not let workers sit idle when independent work exists. The manager should keep assigning useful parallel tasks while doing the critical-path work locally.
- Default to the N-1 pattern for multi-part work: assign independent sidecar tasks to workers, keep the most integration-sensitive task in the main conversation, and verify worker output before shipping.
- At each phase boundary, explicitly check whether any worker is idle and either assign the next safe task or close it if no useful task remains.

## Stay Focused

- Keep the active finish target explicit. Do not start a new front unless it directly helps finish the current one.
- When work sprawls, pause for one sentence: what is in flight, what is blocked, and what ships next.
- Prefer closing one tested, committed lane over opening another interesting lane.

## Plain English Depth

- Respond in plain English first. Conceptual depth is good; jargon is not.
- Make every non-trivial update ADHD-friendly: short bullets, bold load-bearing words, and no walls of text.
- Explain the why beneath the work without making Russell parse code names or internal mechanics.
