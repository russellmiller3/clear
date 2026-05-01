# Launch Browser Regression Plan - 2026-05-01

## Goal

Make the launch-facing Marcus apps part of the automated regression suite.

Russell's bar: if a customer can click it, the browser path must be tested in
browser automation before we call launch feature-complete.

## Scope

- One branch: `feature/launch-browser-regression`
- One feature: launch browser regression wiring
- One commit: test-suite wiring plus the smallest runner fix needed to make it
  reliable from the bundled Node runtime

## Existing Surface

- `scripts/run-marcus-uat.mjs` already drives the five Marcus apps.
- The runner builds each app, starts its server, runs its generated browser UAT,
  and fails when the browser walker reports failures.
- The gap is wiring: package scripts and pre-push do not currently run it.

## Red Team Notes

- A static script entry is not enough. The push gate must invoke the browser UAT
  by default.
- The runner must not spawn bare `node`; on this Windows sandbox that can hit
  the blocked Node shim instead of the runtime already executing the parent.
- The gate can have an emergency skip flag, but default behavior must be to run.

## TDD Plan

1. Add a failing test that proves browser UAT is missing from package scripts.
2. Add a failing test that proves pre-push does not run launch browser UAT.
3. Add a failing test that proves the runner still spawns bare `node`.
4. Wire `test:browser` and include it in `test:all`.
5. Add launch browser UAT to pre-push, guarded only by `SKIP_BROWSER_UAT=1`.
6. Change the runner to use `process.execPath` for child Node processes.
7. Run compiler tests and the browser UAT runner.

## Docs Cascade

- Update `learnings.md` with the branch lesson if the browser runner exposes a
  repeatable launch-regression gap.
