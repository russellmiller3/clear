# Clear Repository Guidance

## Session Startup

- Read `HANDOFF.md`, `PHILOSOPHY.md`, and `CLAUDE.md` before making code changes in this repository.
- Treat `CLAUDE.md` as project-level compatibility guidance from Claude sessions. Follow it unless it conflicts with higher-priority Codex/developer instructions or newer user direction.
- For language/compiler work, consult `intent.md`, `learnings.md`, `AI-INSTRUCTIONS.md`, and `SYNTAX.md` before editing parser, compiler, validator, runtime, or Meph-facing behavior.

## Project Expectations

- Keep generated artifacts out of Git. Build outputs, sweep sessions, scratch apps, temp files, caches, and root-level generated app files should stay ignored and untracked.
- `playground/factor-db.sqlite` is source/training data for the flywheel, not a disposable artifact.
- Run `node clear.test.js` after JavaScript/runtime/compiler changes. Use the bundled Node runtime if `node` is not available on PATH.
