# Clear Repository Guidance

## Session Startup

- Read `HANDOFF.md`, `PHILOSOPHY.md`, and `CLAUDE.md` before making code changes in this repository.
- Treat `CLAUDE.md` as project-level compatibility guidance from Claude sessions. Follow it unless it conflicts with higher-priority Codex/developer instructions or newer user direction.
- For language/compiler work, consult `intent.md`, `learnings.md`, `AI-INSTRUCTIONS.md`, and `SYNTAX.md` before editing parser, compiler, validator, runtime, or Meph-facing behavior.

## Project Expectations

- Keep generated artifacts out of Git. Build outputs, sweep sessions, scratch apps, temp files, caches, and root-level generated app files should stay ignored and untracked.
- `playground/factor-db.sqlite` is source/training data for the flywheel, not a disposable artifact.
- Run `node clear.test.js` after JavaScript/runtime/compiler changes. Use the bundled Node runtime if `node` is not available on PATH.

## Worker Management

- Do not let workers sit idle when independent work exists. The manager should keep assigning useful parallel tasks while doing the critical-path work locally.
- Default to the N-1 pattern for multi-part work: assign independent sidecar tasks to workers, keep the most integration-sensitive task in the main conversation, and verify worker output before shipping.
- At each phase boundary, explicitly check whether any worker is idle and either assign the next safe task or close it if no useful task remains.
