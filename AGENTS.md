# Clear Repository Guidance

## Session Startup

- Read `HANDOFF.md`, `PHILOSOPHY.md`, and `CLAUDE.md` before making code changes in this repository.
- Read `FAQ.md` and `learnings.md` before making repo changes. `FAQ.md` is the navigation map; `learnings.md` is the list of mistakes already paid for.
- Treat `CLAUDE.md` as project-level compatibility guidance from Claude sessions. Follow it unless it conflicts with higher-priority Codex/developer instructions or newer user direction.
- For language/compiler work, consult `intent.md`, `learnings.md`, `AI-INSTRUCTIONS.md`, and `SYNTAX.md` before editing parser, compiler, validator, runtime, or Meph-facing behavior.

## Project Expectations

- Keep generated artifacts out of Git. Build outputs, sweep sessions, scratch apps, temp files, caches, and root-level generated app files should stay ignored and untracked.
- `playground/factor-db.sqlite` is source/training data for the flywheel, not a disposable artifact.
- When inspecting `.env`, credentials, or provider config, print key names and masked metadata only. Never echo API key, token, or secret values into tool output.
- Run `node clear.test.js` after JavaScript/runtime/compiler changes. Use the bundled Node runtime if `node` is not available on PATH.
- Launch-facing features need browser regression coverage. If a customer can click it, the automated browser suite must cover it before the feature is called done.
- A task is not done while the worktree is dirty. Before calling work complete, every change must be intentionally committed, stashed with a clear name, or removed after confirming it is disposable. No loose modified, deleted, or untracked files.
- When a review finds a repeatable miss, do not stop at advice. Add the smallest failing check or hook that would catch it next time, then fix the current instance until that check passes.
- Update `learnings.md` as work proceeds. After each meaningful fix, phase, or mistake, append the concrete lesson before moving to the next lane.
- Run the docs sweep after each completed phase before continuing. Update the relevant docs while the phase context is fresh, then move to the next phase.

## Windows Command Hygiene

- Use PowerShell-native commands on Windows. Do not reach for Unix habits unless already verified in this session.
- Do not use `rg` in this repo on this machine unless a same-session smoke check proves it works. Use `Get-ChildItem` plus `Select-String`.
- Before reading a list of paths, prove each path exists or pipe from `Get-ChildItem`. Missing paths should not create avoidable Windows errors.
- Never print `.env` lines directly. Use a masked scanner that shows key names and set/length metadata only.
- Use the bundled Node executable or `process.execPath`; do not rely on bare `node`, Windows shims, or PATH.
- If process command-line inspection needs permissions, escalate the narrow inspection command once. Do not thrash through blocked variants.
- If Git cannot create `.git/index.lock`, immediately rerun the exact Git action with the required sandbox permission.
- Do not anchor patches on non-ASCII punctuation copied from terminal output. PowerShell encoding can mangle dashes and quotes.
- After a Windows command fails, switch to the known fallback or escalate once. Do not retry the same broken shape.
- J Paul Getty rule: make any mistake once, but never the same mistake twice. If a command shape fails twice, stop hand-rolling it and add a tested helper, script, or rule before continuing.
- Do not launch long Windows background jobs with inline PowerShell `Start-Process -Command` blocks. Use a checked-in Node runner that writes pid/out/err/exit files and has tests.
- Do not inspect UTF-8-heavy logs with PowerShell `Get-Content` when output shows mojibake. Use `node scripts/mojibake-hygiene.mjs --tail=<path>` so logs render as ASCII and the diagnosis stays real.

## Branch Discipline

- Always do work on a branch. Never edit, stage, or commit feature/fix/doc work directly on `main`.
- Before starting work from `main`, create a focused branch such as `feature/<name>`, `fix/<name>`, or `docs/<name>`.
- Use one branch per feature. Do not group multiple features onto one branch, and do not create branch-per-phase clutter inside the same feature.
- Use one small feature, fix, or docs unit per commit. Never batch unrelated features into one giant commit.
- Workers on the same epic should share the epic branch or work in temporary worktrees that are merged back and deleted promptly.
- Merge back to `main` only after the branch is tested, committed, and ready to ship.

## Worker Management

- Do not let workers sit idle when independent work exists. The manager should keep assigning useful parallel tasks while doing the critical-path work locally.
- Default to the N-1 pattern for multi-part work: assign independent sidecar tasks to workers, keep the most integration-sensitive task in the main conversation, and verify worker output before shipping.
- At each phase boundary, explicitly check whether any worker is idle and either assign the next safe task or close it if no useful task remains.

## Stay Focused

- Keep the active finish target explicit. Do not start a new front unless it directly helps finish the current one.
- When work sprawls, pause for one sentence: what is in flight, what is blocked, and what ships next.
- Prefer closing one tested, committed lane over opening another interesting lane.

## Obvious Next Step Gate

- Do not end a substantive turn after naming a safe next step. Execute it first.
- Before any final response, check for an obvious safe command, edit, test, retry, commit, or doc update.
- If the next step is already approved and directly advances the user's goal, keep working in the same turn.
- Stop only for a real blocker: destructive action, irreversible cleanup, missing credential, explicit spend threshold, or a user command to stop.
- When blocked, state the exact blocker and unlock. Do not end with "want me to", "should I", "let me know", or "I can next".

## Plain English Depth

- Respond in plain English first. Conceptual depth is good; jargon is not.
- Make every non-trivial update ADHD-friendly: short bullets, bold load-bearing words, and no walls of text.
- Explain the why beneath the work without making Russell parse code names or internal mechanics.

## Executive Narration Gate

- Every work update must start with the human meaning: where we are, why it matters, and the next move.
- Do not lead with tool names, package names, shell mechanics, file trivia, or failed-command details.
- If a status mentions machinery, first translate it into the product goal it protects.
- After any failed command, pause and re-brief in plain English before trying the next command.
- If Russell says the narration is gibberish, stop tool work, apologize, restate the goal, and update the rule before continuing.
