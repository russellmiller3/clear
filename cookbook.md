# Cookbook — A Portable Playbook for AI-First Repos

> Renamed from `meta-learnings.md` Session 46 (2026-04-25). The old name described the genesis (lessons from 40+ sessions); the new name describes what the file is FOR — a copy-paste cookbook for the next AI-first repo. Same content, sharper label.

**Last auto-refresh:** see `<!-- AUTO-INVENTORY -->` section below.

## TL;DR — what this is

A portable playbook distilled from running Clear as an AI-written, AI-maintained codebase for 40+ sessions. If you're starting a new repo where Claude (or any AI contributor) will be doing most of the writing, **copy the starter kit below**. Six files + a handful of hooks + a couple of disciplines gives you a compounding dev loop: every mistake becomes a rule, every rule becomes a hook, every hook becomes a flywheel that makes the AI smarter at *this specific repo* without fine-tuning.

The meta-claim: the same closed-loop self-improvement pattern Clear built for **Meph** (AI writing Clear code) also works for **Claude-on-this-repo** (AI editing Clear's source). Same flywheel architecture, different agent, two layers deep. Any codebase can have this — Clear just happens to make it visible because we built it for Meph first and realized it applied to ourselves.

## The Philosophy (three beats)

**1. Every mistake becomes a rule.** When an AI contributor wastes >30 minutes on a bug, that's a loud data point. Capture the root cause in a NEGATIVE assertion ("never do X"), write it in `CLAUDE.md`, and the next session reads it at startup. Compounding starts the moment the second session can't repeat the first's mistake.

**2. Every rule becomes a hook.** Rules alone are advisory — you can violate them at 2am under pressure. A hook is executed by the harness, not by the AI's discipline. When "use the script before rewriting X" is a CLAUDE.md rule, it might hold 80% of the time. When it's a PostToolUse hook that auto-injects the script's output, it holds 100%. The harness does the remembering.

**3. Every hook becomes a flywheel.** Once the harness is mechanically enforcing rules, you can USE the accumulated signal to improve the rules themselves. The Factor DB ranks the worst error messages; the friction script rewrites them in priority order; a periodic hook mines learnings for NEW hookable patterns; the next session inherits a sharper setup than the one before. No fine-tuning, no RLHF, no humans in the loop.

**4. The AI contributor builds its own tools proactively.** Running the same 5-line bash pipeline three times in a session means a script should exist. Grepping the same subsystem for the same concept across sessions means a helper should exist. Investigating the same class of failure repeatedly means a diagnostic tool should exist. The AI shouldn't wait to be told "make a script for this" — it should notice the repeated pattern and build the tool, add it to `scripts/`, and note the addition. A periodic hook (see `propose-new-tools.mjs`) nudges the question weekly so nothing falls through.

**5. Don't wrap what the LLM already knows.** Every helper you write is an abstraction the model has to fight. Coding agents know Bash, git, Node, Python, SQL, grep, curl — they've been trained on millions of tokens of each. When you wrap those primitives in "friendly" tool calls, you trade model capability for instrumentation convenience. The right default is: expose the lowest stable layer directly, write the minimum helpers needed, and let the agent edit those helpers when they're missing. Browser Use's "Bitter Lesson of Agent Harnesses" demonstrates this with raw CDP access beating thousands of lines of DOM extractors; the same shape applies to any tool surface. If a tool is doing what the LLM would do anyway (read a file, run a command, grep for a pattern), delete the tool — the base harness already has that capability. Keep wrappers only for genuine domain logic the LLM can't reconstruct (for Clear, that's Factor DB logging + hint injection + archetype classification — things the agent genuinely doesn't know). Every extra wrapper is a future bug the agent can't route around.

## The Starter Kit — copy these to any new AI-first repo (2 hours)

### 1. `CLAUDE.md` at repo root

The AI contributor reads this at session start. Structure:
- **On Startup** section: mandatory read-order of other docs (HANDOFF, PHILOSOPHY, etc.)
- **Hard Rules** grouped by concern (Engineering, Git, Testing, Output Format, etc.)
- Each rule is a short section with a heading, one imperative sentence, a **Why** line, and a **How to apply** line
- Prefer negative assertions ("never do X") over positive ones — easier to fire on

**Seed content for any repo:**
- Testing discipline (what's the oracle, who runs it, when)
- Branching rules (never commit to main, name conventions)
- Documentation surfaces (which files cover what, which can't drift)
- Communication style (how to talk to the human — short, bullets, no jargon, opinionated)
- Budget rules (if the AI is spending API money, cost-cap discipline)

### 2. `HANDOFF.md` at repo root

Single file the AI writes at end of session and reads at start of next. Must contain:
- **Current state** — what's on main, what's on feature branches, what tests are green
- **Pick-up queue** — prioritized list of what to do next, ordered by leverage
- **Active gotchas** — "if you touch X, remember Y"

Rewritten end of every meaningful session. Not a changelog (that's a separate file). Pure forward-looking.

### 3. `learnings.md` at repo root

Append-only narrative log of "we hit X, root cause Y, fix Z, gotcha to remember W." Organized by session or subsystem. Not a rule list (rules live in CLAUDE.md); this is the STORY version — long-form so future sessions can trace WHY a rule exists.

The `learnings-miner` hook (below) makes this file's accumulated pain visible on-demand — so nobody has to read 2,000 lines "just in case."

### 4. `.claude/settings.json` with hooks

Committed to git (team-wide discipline, not personal preference). Wire at minimum:
- A **PostToolUse** hook that runs on Edit/Write and injects relevant learnings for the file being edited (see `learnings-miner.mjs`)
- A **SessionStart** hook that surfaces stale-handoff warnings, outstanding TODOs, or new hook proposals from learnings

### 5. Friction-ranking for whatever signal your domain has

Clear has the Factor DB (compile/test outcomes per code action). Your repo probably has SOMETHING — test failures, lint warnings, build errors, deploy rollbacks. Build a `scripts/top-friction-<thing>.mjs` that ranks by "cost" (time, count, unrecovered rate) and use it to pick what to fix first. Without ranking, fixes are hunch-driven; with ranking, fixes are data-driven and compounding.

### 6. The three-doc split: `ROADMAP.md` vs `CHANGELOG.md` vs `FEATURES.md`

- **ROADMAP.md** — what's NEXT, priority-ordered, speculative
- **CHANGELOG.md** — what SHIPPED, session-dated, historical
- **FEATURES.md** — what EXISTS today, capability reference, timeless

Splitting these kills drift. Without the split, one file tries to be all three and silently rots.

### Named, provable business rules — every CRO-facing policy is a one-liner with a math-grade verdict next to it

Clear's `rule <name>:` keyword (2026-05-02) is the regulated-tier pattern. Every business policy that matters to a CRO, auditor, or compliance reviewer gets a name. The prover walks every `rule_def` in the file and produces a per-rule verdict — `proved`, `disproved`, or `unverifiable` — attributed by name in `clear prove` output:

```
Business rules in this file:
  [PROVED]       discount-cap-thirty (line 18)
  [DISPROVED]    impossible-rule (line 22) — guard rejects every input
  [UNVERIFIABLE] reads-the-database (line 27) — body calls the database
  1 of 3 rules proved. 1 unverifiable. 1 disproved.
```

That output IS the audit trail. Auditors trust verdicts attributed by name; they don't trust "line 42 PROVED" because reading source isn't their job. **The principle is portable.** Any AI-first repo that ships behavior to regulated buyers should consider naming its policies and producing per-policy verdicts. Without names, the prover output is a developer log; with names, it's an audit artifact a non-engineer can show their auditor. See `intent.md` (RULE_DEF row) and `lib/prover/index.js` (proveRule) for the implementation.

## The Advanced Kit — add these once you have ~20 sessions of usage data

### 7. Domain-specific Factor DB

A SQLite table that records every AI action with the outcome. Columns: session_id, timestamp, action, success, error_signature, source_before, patch_summary. Every session fills it; rankings + retrieval run off it. If you're doing AI-assisted code generation, this IS the training corpus — free data, always growing.

### 8. Periodic hook-miner

Scans learnings.md weekly for "gotcha-as-rule" / "bit us again" / "cost us" language, cross-references installed hooks, proposes new ones. The repo IMPROVES ITSELF over time. Clear's version: `.claude/hooks/propose-new-hooks.mjs`.

### 9. Retrieval-augmented hints during AI work

If your AI contributor hits errors, retrieve 3 past-fix examples from the Factor DB, rerank by a tiny ML model (EBM, logistic regression — no LLM needed), inject into the AI's context. Clear's version lifts CRUD pass rate by 30pp on controlled A/B. Not every domain has this pattern, but code-gen domains definitely do.

### 10. Handoff skill that auto-generates

A slash-command skill that takes "what happened this session" and writes HANDOFF.md in a consistent shape. Reduces the end-of-session cognitive load to "run /handoff, review, ship." Clear's version: `.claude/skills/handoff/SKILL.md`.

## Portability — how to copy this to a new repo

For each file/hook/skill in the starter kit:
1. Copy the file verbatim (e.g., `cp old-repo/.claude/hooks/learnings-miner.mjs new-repo/.claude/hooks/`)
2. Check paths assumed inside — some hooks reference `scripts/foo.mjs` that you'd also need
3. Create empty learnings.md and HANDOFF.md if they don't exist yet (the hooks tolerate missing files)
4. Commit, push, start a fresh session — the SessionStart hook fires and orients you

The hooks in the inventory below are all dependency-minimal by design: pure Node, zero npm packages, silent exit on missing inputs. Clone, commit, go.

---

## Hooks: Complete Inventory (hand-curated)

Eight hooks in this repo as of 2026-05-03. Each fires automatically on a specific event. Together they enforce rules the AI contributor would otherwise forget mid-session. The auto-inventory below lists names; this section explains WHY each exists, WHEN it fires, and HOW it earns its keep. Copy whichever resonate to a new repo.

| Hook | Event | What it does | Why it exists |
|------|-------|--------------|---------------|
| `starting-protocol.mjs` | SessionStart | Tells Claude to (1) read HANDOFF.md, (2) scan learnings.md for past gotchas relevant to the top next move, (3) summarize in 3-5 plain-English bullets (top move + flagged gotchas), then STOP and wait for the user to type "g" (one-letter green light) or another instruction. No auto-pilot opening. | The auto-pilot session opener (build queue → start working immediately) sometimes started on the wrong thing because the user hadn't confirmed priorities, and re-discovered bugs that learnings.md already documented. Starting-protocol bakes in confirm-before-start AND a relevant-gotcha pass so past pain doesn't repeat. Costs one round-trip; saves wrong-direction sessions and rediscovered bugs. Added 2026-05-03 after the user asked for "all i should have to type is g" plus a learnings.md gotcha review. |
| `parallel-thinking.mjs` | UserPromptSubmit | On every prompt, injects three top-level reminders: (1) **plain English in every word you write to the user — not just summaries**; (2) **think parallel FIRST** (decision tree: identify subtasks, launch (N-1) as background agents in ONE message, work on the Nth in-conversation); (3) **narrate everything** (status line after every tool batch). | Three rules existed in CLAUDE.md and ALL THREE kept slipping mid-session. The plain-English rule was the worst — Claude wrote prose answers laced with code jargon despite the user repeatedly asking for plain English. Hook makes all three structural — fires at the moment of planning, before the response is composed. Added Session 46 (2026-04-25); plain-English beat lifted from sub-bullet to top-level same session after the user asked "how do I force this to stick?" The same pattern (rule → hook) applies to ANY discipline that's advisory and getting violated. |
| `doc-cascade.mjs` | PostToolUse (Edit/Write) | When Claude touches `parser.js`, `synonyms.js`, `compiler.js`, `index.js`, or `runtime/*`, injects the 11-doc cascade list (intent.md, SYNTAX.md, AI-INSTRUCTIONS.md, USER-GUIDE.md, ROADMAP.md, landing/*, system-prompt.md, FAQ.md, RESEARCH.md, FEATURES.md, CHANGELOG.md). | The Documentation Rule says new features must update 11 surfaces. Without the hook, Claude shipped a feature without doc updates and Russell had to nudge. The hook puts the cascade in front of him at edit time, when fixing is one Edit, not a separate session. Added Session 46. |
| `validator-friction.mjs` | PostToolUse (Edit/Write to validator.js) | Runs `scripts/top-friction-errors.mjs` and injects the top-5 highest-friction compile errors (ranked by Meph-minutes-burned in the Factor DB). | Compile-error rewrites must be data-driven, not hunch-driven. Without this hook, Claude rewrote error messages based on "this feels confusing" and missed the actual top-friction items. Hook makes the ranked Factor DB data the FIRST thing Claude sees on validator edits. |
| `learnings-miner.mjs` | PostToolUse (Edit/Write) | Mines `learnings.md` for sections relevant to the file just edited (matched by file/subsystem keywords) and injects the matching gotchas. | `learnings.md` is the append-only narrative log of every bug + root cause + fix. It's >50KB and growing. Without targeted mining, Claude can't surface relevant past gotchas at the moment they apply — too much to scan. Hook does the matching automatically. |
| `cookbook-updater.mjs` | SessionStart (7-day gate) | Refreshes the AUTO-INVENTORY section of `cookbook.md` once per week — scans `.claude/hooks/`, `.claude/skills/`, `scripts/`, and CLAUDE.md headers, rewrites the inventory if drift is detected. | The hand-curated narrative in cookbook.md is stable; the inventory of what's actually installed today drifts every time someone adds a hook/rule/skill. Auto-maintained inventory = cookbook stays accurate without human effort = readers always see what's actually in the repo. (Renamed from `meta-learnings-updater.mjs` Session 46.) |
| `propose-new-hooks.mjs` | SessionStart (7-day gate) | Once a week, scans `learnings.md` for repeated bug patterns and asks: "should this be a hook?" Surfaces candidates with the rule text, the proposed event, and a file matcher. | Every rule that fires often enough is a hook candidate. Without periodic mining, Claude knows the rules but forgets to PROPOSE turning them into hooks. The 7-day cadence keeps the question fresh without nagging every session. |
| `propose-new-tools.mjs` | SessionStart (7-day gate) | Once a week, surfaces the question: "did you run any 5-line bash pipeline 3+ times this week? Build a tool." Lists existing scripts/ to avoid duplication. | The AI contributor should build its own tools proactively — running the same diagnostic three times means a script should exist. Hook nudges weekly so candidates surface before they're forgotten. |

**The pattern:** every hook in this repo earns its keep by automating a discipline that would otherwise be advisory. Rule alone = ~80% adherence. Hook = 100%, because the harness does the remembering, not the AI's mid-session attention. Three of the hooks above (parallel-thinking, doc-cascade, validator-friction, learnings-miner) inject context AT THE MOMENT OF ACTION; three (cookbook-updater, propose-new-hooks, propose-new-tools) run periodically to keep the inventory + the rule-set + the tool-set fresh. Both shapes have a place; the at-the-moment ones are where most leverage lives.

**Cost:** all 7 hooks combined run in <2 seconds total on session-start, and PostToolUse hooks are 50-200ms each. Asymmetric trade in favor of the reminders.

---

## User-Level Hooks (Generic, Reusable Across Projects)

The project-level hooks above fire ONLY when Claude is working in this repo. A second tier of hooks lives at `~/.claude/hooks/` and fires on EVERY Claude Code session regardless of project. Russell's rule (2026-05-14): **all user-level hooks must be generic and reusable. Anything project-specific belongs in the project's own `.claude/hooks/` or `.claude/<config>.json`.**

These hooks were audited 2026-05-14 to remove Clear-specific hardcoded paths. Six hooks had project-specific values refactored into optional per-project config files: `hardest-first.mjs` (keywords + paths), `main-thread-pulse.mjs` (generic test/build patterns instead of `clear.test`/`npm run bundle`), `pulse-on-agent-activity.mjs` (auto-detects active sibling repo + HEAD instead of hardcoding `feature/lenat-in-clear`), `parallel-when-possible.mjs` (auto-discovers all sibling project queues), `never-stop-asking.mjs` (`launch|ship|production` instead of `marcus|first paying`), and `clean-worktrees.sh` (globs all `*.sqlite` files instead of `playground/factor-db.sqlite`). The result is a portable hook stack any AI-first repo can adopt by copying `~/.claude/hooks/` and `~/.claude/settings.json`.

| Hook | Event | What it does | Why it exists | Project-specific config? |
|------|-------|--------------|---------------|---|
| `dry-check.mjs` | PreToolUse (Edit/Write) | Detects duplicate work in two ways: (1) named-primitive collisions — additions of functions, classes, top-level consts, or project-specific patterns (themes, NodeTypes, etc.) whose names already exist in the same file or in docs; (2) domain-noun matches in plan/spec markdown edits — capitalized phrases already documented in project docs. Soft-warns with line numbers. | Russell shipped a duplicate `nixie` theme block to compiler.js 2026-05-14 — the existing one (with glow + scanline effects) was already there ~120 lines down, silently shadowed by the new one because JS object literals tolerate duplicate keys. Without this hook, the duplicate would have stuck and the next session would have read both. | Yes — `<project>/.claude/dry-check.json` (optional): `docs[]`, `namePatterns[]`, `planFiles[]` |
| `worktree-on-agent-spawn.mjs` | PreToolUse (Agent) | Blocks any subagent spawn that omits `isolation: "worktree"` unless the prompt opts out with `NO_WORKTREE`. When NO_WORKTREE is used, additionally blocks if the agent's brief targets a repo accessible from the parent's cwd (the agent's `git checkout -b` would switch the parent's working tree). | 2026-05-13 — three parallel agents shared the same working tree without worktrees. Phase 3's compiler.js edits got eaten; Phase 6's parser.js edits clobbered; Phase 5 was forced into survival mode. The hook prevents that class entirely. | No — generic |
| `pulse-on-agent-activity.mjs` | PreToolUse (Agent) + Stop | Gates Agent spawn on a pulse-contract reference in the brief; emits a baseline "Goal" pulse the moment the agent fires. On Stop, surfaces the 5-min heartbeat box for the parent conversation. | The agent dashboard at localhost:9999 reads from `~/Desktop/programming/.claude/state/agent-pulse.log`. Without forced pulses, the dashboard sits empty even when work is shipping. | No — generic (assumes the dashboard is at the standard pulse-log location) |
| `pulse-enforcer-subagent.mjs` | Stop | Refuses subagent stops without at least one narrative pulse emitted during the run. | Without enforcement, agents would do silent work and the dashboard would show nothing. | No — generic |
| `main-thread-pulse.mjs` | PostToolUse (Edit/Write/Bash) | Emits a dashboard pulse for every meaningful main-thread action — commit, test run, edit, build. Throttled to one pulse per 15 seconds per task. Task name auto-derived from the git branch of the touched file. | The dashboard was useless when the main conversation was the one doing the work — no pulses fired. This hook fixes that by capturing main-thread activity automatically. | No — generic; uses file's git branch + falls back to "Main thread" |
| `parallel-when-possible.mjs` | Stop | Detects when a single agent is in flight while 2+ parallel-safe queue items sit unstarted; nudges the orchestrator to spawn the rest in one message. Plan-file discovery walks every immediate child of `~/Desktop/programming/` that has a `plans/` directory — no project hardcoding. | "Work in parallel by default" was a CLAUDE.md rule that kept being violated. This hook makes it structural. | No — generic; plan discovery is dynamic |
| `read-before-write.mjs` | PreToolUse (Edit/Write) | Blocks Edit/Write on files >200 lines that haven't been Read in this session. | Editing a 2000-line file blind = silently breaking unrelated parts. Force a Read first. | No — generic |
| `forbidden-patterns.mjs` | PreToolUse (Edit/Write) | Blocks structural anti-patterns: untyped record rows, positional access, string type-discriminators, AI-added TODO/FIXME. | These are the "drunk junior dev at 3am" failure modes the architecture rules prevent. | No — generic |
| `concurrency-guard.mjs` | PreToolUse (Edit/Write) | Blocks background tasks that mutate shared state instead of sending messages. | "Concurrency — Messages Only" rule, structurally enforced. | No — generic |
| `no-emoji-landing.mjs` | PreToolUse (Edit/Write) | Blocks emoji in `.html` files; suggests Lucide icon swaps. | Landing pages must look professional. Emoji renders inconsistently across OS/browser. | No — generic |
| `no-feature-branch-push.mjs` | PreToolUse (Bash) | Blocks `git push origin <feature-branch>`; allows push to main, tags, branch delete. Override via `PUSH_BRANCH_OVERRIDE=1`. | "Don't push branches until work is done" rule. Pre-push hooks are expensive; pushing every feature branch repays the cost N times for no value. | No — generic |
| `file-size-guard.mjs` | PostToolUse (Write) | Warns when a written file exceeds a size threshold. | "No god objects" — large files signal poor decomposition. | No — generic |
| `never-idle.mjs` | Stop | Blocks Stop while background agents/tasks are still running. | "Never idle while agents run" — start the next chunk of work in parallel. | No — generic |
| `no-shortcuts.mjs` | Stop | Detects structural shortest-path shortcuts in the last message (string-stringly-typed data, flag fields on root struct, etc.) | "Resist Shortest Path" rule, structurally enforced. | No — generic |
| `never-stop-asking.mjs` | Stop | Blocks turns that asked permission ("want me to", "should I"), described a next move without producing it, or worked without a priority queue. | The Ross Perot Rule + Critical-Path Navigator + priority-queue workflow, all enforced at Stop. | No — generic |
| `hardest-first.mjs` | Stop | Blocks Stop where the most recent commits are style/docs/test only while launch-blocking items remain open in the priority queue. | "Hardest thing goes first" — prevents the polish-instead-of-load-bearing-work pattern. | Yes — `<project>/.claude/hardest-first.json` (optional): `keywords[]` (load-bearing keywords) + `paths[]` (high-impact path regexes). Clear uses it to mark `concurrency phase 2`, `tenant isolation`, `lib/prover/`, etc. |
| `decay-footer.mjs` | Stop | Blocks code-changing turns missing the Files touched / Invariants / Smells / Follow-up footer. | "Decay Footer — Surface Debt" — every code change names its risks. | No — generic |
| `time-estimates.mjs` | Stop | Catches human-hour time estimates without the AI-time correction (divide by ~60 for agent work). | Russell asked for AI-time estimates; the calibration table is built from measured agent throughput. | No — generic; calibration data is in the hook itself |
| `recommend-when-listing.mjs` | Stop | Blocks alternative listings without a recommendation verb ("going with X because Y"). | "Strong Opinion + Minimize Cognitive Load" — never make the user pick blindly. | No — generic |
| `build-priority-queue.mjs` | SessionStart | Injects a kickoff reminder when the priority queue is missing or stale (>24h). | First task every session: build the queue. | No — generic |
| `clean-worktrees.sh` | SessionEnd | Cleans stale git worktrees, with WAL-checkpoint protection for SQLite-bearing repos. | Long-running sessions accumulate worktrees that block disk + create stale-state confusion. | No — generic |

**The pattern (user-tier):** every hook here works in any AI-first repo by default. Where a project wants custom behavior, it ships a config file in its own `.claude/` directory. This is the difference between a portable hook stack (copy-paste to a new repo and it works) and a project-coupled one (must rewrite for each repo).

**Cost (user-tier):** roughly identical to the project tier — all PreToolUse hooks together add 50-200ms per Edit/Write, Stop hooks 100-300ms per turn end, SessionStart <500ms. The dashboard pulse hook is the cheapest in the stack (single appendFileSync).

---

<!-- BEGIN AUTO-INVENTORY - Do not edit by hand. .claude/hooks/cookbook-updater.mjs refreshes this section every 7 days on SessionStart. -->

_Last refresh: 2026-05-10_

### CLAUDE.md rules (project-level, this repo)

- **On Startup -- Session Bootstrap (MANDATORY)** — Every new session starts the same way, in this order:
- **On Startup -- Load These Tools First** — Run ToolSearch for these before doing anything else:
- **FAQ.md — Search This First** — Before grepping, check **`FAQ.md`** at repo root. It has:
- **On Startup -- Read These First** — 1. **`intent.md`** -- the authoritative spec. All 119+ node types, build targets, compiler passes, synonym collisions, validation rules. …
- **Testing** — Run all tests: `node clear.test.js`
- **App-Level Testing Rule (MANDATORY)** — When building or modifying a .clear app:
- **Never Test By Hand (MANDATORY)** — If you're tempted to open Chrome and click something, that means the compiler is missing a generated test. Fix the compiler to emit the t…
- **Plain-English Comments in .clear Files (MANDATORY)** — Comments in `.clear` files must read like plain English — written for a curious 14-year-old, not a JavaScript engineer. No CS or compiler…
- **Key Files** — `index.js` -- public API, `compileProgram(source)` is the entry point
- **CLI (for AI agents)** — The CLI is designed for machines first. Every command supports `--json`.
- **Core Design Principles (from PHILOSOPHY.md)** — Compiled JS/Python is build output. Never edit output.
- **13 Canonical Apps (HARD RULE — Studio dropdown shows EXACTLY these 13)** — Two nets of apps that exercise the language end-to-end. Studio's app-picker
- **No Self-Assignment Rule** — Never write `x is x` in Clear code. When building records from function arguments, the argument names must differ from the field names: `…
- **No Backward Compatibility** — There are no users yet. Do not preserve backward compatibility. Always do things the right way.
- **File TOC Rule (MANDATORY)** — Both `parser.js` and `compiler.js` have a TABLE OF CONTENTS at the top.
- **Compiler Architecture** — tokenize -> parse -> validate -> compile
- **Synonym Collision Risks** — `count by` vs `increase count by 1` -- token sequence detection
- **UI/Design System** — HTML + vanilla JS + Tailwind CSS v4 (CDN) + DaisyUI v5
- **Documentation Rule (MANDATORY)** — Every new feature MUST be documented in ALL of these before shipping:
- **Before Adding New Features or Syntax (MANDATORY)** — 1. Use `/write-plan` to create an implementation plan

### `.claude/hooks/` — event-driven enforcement

- **before-rebuild-check.mjs** — .claude/hooks/before-rebuild-check.mjs
- **clear-cheatsheet-on-write.mjs** — .claude/hooks/clear-cheatsheet-on-write.mjs
- **cookbook-updater.mjs** — .claude/hooks/cookbook-updater.mjs
- **doc-cascade.mjs** — .claude/hooks/doc-cascade.mjs
- **landing-design-on-write.mjs** — .claude/hooks/landing-design-on-write.mjs
- **learnings-miner.mjs** — .claude/hooks/learnings-miner.mjs
- **no-stub-nav.mjs** — Compute the post-edit content
- **parallel-thinking.mjs** — .claude/hooks/parallel-thinking.mjs
- **periodic-introspect.mjs** — UserPromptSubmit hook — nudges Claude to invoke /introspect every 20 user
- **propose-new-hooks.mjs** — .claude/hooks/propose-new-hooks.mjs
- **propose-new-tools.mjs** — .claude/hooks/propose-new-tools.mjs
- **python-first-class.mjs** — .claude/hooks/python-first-class.mjs
- **require-branch-work.mjs** — Block file-changing work on main.
- **require-branch-work.test.mjs** — (no top-comment description in require-branch-work.test.mjs)
- **require-plan-read.mjs** — .claude/hooks/require-plan-read.mjs
- **screenshot-ui-work.mjs** — Match UI surfaces.
- **ship-docs-cascade-gate.mjs** — File patterns that count as substantive code changes — if any of
- **starting-protocol.mjs** — .claude/hooks/starting-protocol.mjs
- **validator-friction.mjs** — .claude/hooks/validator-friction.mjs
- **verify-real-remote.mjs** — Block any git push or git commit when origin points at a sandbox-local
- **verify-real-remote.test.mjs** — Tests for verify-real-remote hook.

### `.claude/skills/` — user-invocable slash commands

- **/bigpicture** — Narrate what was built in this session and why it matters. Step back from the diff, explain significance in plain English, connect to whe…
- **/debug** — >
- **/docs** — Update all documentation files to match current compiler state. Narrates what was built and why it matters, then ensures intent.md, SYNTA…
- **/enq** — Enqueue a new item to the in-session work queue at .claude/state/priority-queue.md. Use when the user types "/enq [text]" — appends the i…
- **/eval-meph** — Run the Meph tool eval as a regression net. Trigger when changes touch playground/server.js (especially TOOLS array, executeTool, validat…
- **/execute-plan** — Use when executing a multi-phase implementation plan. Trigger when user says "execute this plan", "implement this plan", "start building"…
- **/handoff** — Create or update HANDOFF.md to pass context between sessions. Use when ending a session, switching tasks, or when the user says "handoff"…
- **/introspect** — Step back, re-read the load-bearing docs, and decide if current work is still on the critical path. Trigger when Russell says "/introspec…
- **/pres** — (no description)
- **/red-team-code** — Use when stress-testing code AFTER it has been written and compiles. Trigger when user says "/rt", "/red-team-code", "red team this code"…
- **/red-team-plan** — Use when stress-testing any implementation plan before coding begins. Trigger when user says "red team this", "bulletproof this plan", "r…
- **/rule** — Add a rule to the project-level CLAUDE.md. Use when the user says "/rule [text]" or "add a project rule" or "make this a rule". Appends a…
- **/ship** — Ship a Clear feature: update all docs, commit, merge to main, push. Updates learnings, roadmap, philosophy, syntax, handoff, and readme.
- **/update-learnings** — Update learnings.md with lessons from completed work. Trigger when: user says "update learnings", "add to learnings", "document what we l…
- **/user-rule** — Add a rule to the user-level CLAUDE.md (applies across all projects). Use when the user says "/user-rule [text]" or "add a personal rule"…
- **/write-clear** — Write programs in the Clear language. Use when the user asks to write, build, or create something in Clear, or asks "how do I write X in …
- **/write-plan** — Use when creating an implementation plan for any feature, fix, or change in this codebase. Trigger when user says "write a plan", "make a…

### `scripts/` — helper utilities (safe to run on demand)

- **audit-bundle.mjs** — scripts/audit-bundle.mjs
- **build-codemirror-bundle.mjs** — Build script for the playground's CodeMirror bundle.
- **build-playground-bundle.mjs** — Build script for the in-browser playground compiler bundle.
- **check-doc-drift.cjs** — Files we care about — the canonical docs that must agree with each other.
- **codemirror-entry.mjs** — Entry file for the playground's CodeMirror bundle.
- **cross-target-smoke.mjs** — scripts/cross-target-smoke.mjs
- **decidable-core-replay.mjs** — scripts/decidable-core-replay.mjs
- **doc-drift.mjs** — scripts/doc-drift.mjs
- **doc-drift.test.mjs** — scripts/doc-drift.test.mjs
- **factor-db-summary-helpers.mjs** — (no top-comment description in factor-db-summary-helpers.mjs)
- **factor-db-summary.mjs** — Quick read-only summary of the Factor DB.
- **factor-db-summary.test.mjs** — (no top-comment description in factor-db-summary.test.mjs)
- **factor-db-trace-summary.mjs** — Pretty-print the meph_turns trace for one session, or aggregate stats.
- **hint-effect-report-helpers.mjs** — (no top-comment description in hint-effect-report-helpers.mjs)
- **hint-effect-report.mjs** — Read-only A/B artifact analyzer for the Meph hint flywheel.
- **hint-effect-report.test.mjs** — (no top-comment description in hint-effect-report.test.mjs)
- **interaction-doc-hygiene.mjs** — Fails when Meph-facing docs teach interactive controls without visible effects.
- **interaction-doc-hygiene.test.mjs** — Unit tests for scripts/interaction-doc-hygiene.mjs.
- **landing-pricing.test.mjs** — (no top-comment description in landing-pricing.test.mjs)
- **lead-router-launch-verification.mjs** — (no top-comment description in lead-router-launch-verification.mjs)
- **log-compiler-edits.mjs** — Post-commit hook: scan the last commit's diff for error-message-shaped
- **log-compiler-edits.test.mjs** — Unit tests for the compiler-edit diff parser.
- **marcus-landing.test.mjs** — (no top-comment description in marcus-landing.test.mjs)
- **match-shape.mjs** — Shape-search retrieval over canonical-examples.md.
- **match-shape.test.mjs** — Tests for shape-search retrieval (Lean Lesson 2).
- **meph-pattern-live-probe.mjs** — (no top-comment description in meph-pattern-live-probe.mjs)
- **meph-pattern-live-probe.test.mjs** — manager vp 50000 approval
- **meph-pattern-sweep-runner.mjs** — (no top-comment description in meph-pattern-sweep-runner.mjs)
- **meph-pattern-sweep-runner.test.mjs** — (no top-comment description in meph-pattern-sweep-runner.test.mjs)
- **meph-requirements-live-smoke.mjs** — (no top-comment description in meph-requirements-live-smoke.mjs)
- **meph-requirements-live-smoke.test.mjs** — (no top-comment description in meph-requirements-live-smoke.test.mjs)
- **merge-keep-both.mjs** — Resolves merge conflicts in doc files by keeping BOTH sides.
- **mojibake-hygiene.mjs** — Catches real mojibake and provides ASCII-safe log tails for Windows shells.
- **mojibake-hygiene.test.mjs** — (no top-comment description in mojibake-hygiene.test.mjs)
- **primitive-audit-helpers.mjs** — (no top-comment description in primitive-audit-helpers.mjs)
- **primitive-audit.mjs** — (no top-comment description in primitive-audit.mjs)
- **primitive-audit.test.mjs** — (no top-comment description in primitive-audit.test.mjs)
- **python-parity-audit.mjs** — scripts/python-parity-audit.mjs
- **reconcile-wfp.js** — Weekly reconcile job.
- **rename-guard-to-enforce.cjs** — One-shot script to rename `guard` keyword → `enforce that` in test files
- **reorder-user-guide.mjs** — Reorders USER-GUIDE.md so the chapter sequence in the body matches
- **rewrite-enforce-that-msg.mjs** — One-shot rewrite: `enforce that X or 'msg'` → `enforce that X, or fail with error message: 'msg'`
- **run-marcus-uat.mjs** — The 5 Marcus apps per the canonical list
- **score-winning-runs.mjs** — score-winning-runs — rank every test_pass=1 row in the Factor DB by an
- **score-winning-runs.test.mjs** — Tests for scripts/score-winning-runs.mjs — the winner-harvest scorer.
- **smoke-cf-target.mjs** — Spot-check the --target cloudflare emission end-to-end for a representative
- **top-friction-errors.mjs** — top-friction-errors — mine Factor DB for compile errors that cost the most

### Doc files at repo root (the discipline pattern)

- **CLAUDE.md** — AI contributor rules — read at every session start
- **HANDOFF.md** — session-to-session state + prioritized next-moves
- **learnings.md** — append-only narrative log of bugs + root causes + fixes
- **cookbook.md** — portable cookbook (this file) for seeding new repos
- **ROADMAP.md** — forward-looking — what's planned, priority-ordered
- **CHANGELOG.md** — historical — what shipped, session-dated, newest first
- **FEATURES.md** — capability reference — what exists today (split from roadmap)
- **FAQ.md** — where-does-X-live search-first navigation
- **RESEARCH.md** — research thesis + experiment results + flywheel notes
- **PHILOSOPHY.md** — design principles for this repo — WHY the architecture looks like this
- **requests.md** — bug/feature-request tracker (tiered by severity)

<!-- END AUTO-INVENTORY -->

---

## Known limits of this cookbook

- **Small-team or solo-dev assumed.** Multi-team repos need more structure (RFCs, design docs, etc.) than this kit describes.
- **AI-writes-most assumed.** If humans are doing 80%+ of the code, the compounding math weakens — the friction signal gets dominated by human idiosyncrasy rather than AI-repeatable patterns.
- **One oracle assumed.** These patterns rely on SOMETHING grading outcomes automatically — tests, compiler, lints, deploy success. If your domain has no cheap oracle, the flywheel doesn't close; you're back to human-in-the-loop grading.
- **The tools evolve.** The hook API, settings schema, and skill structure shown here are Claude Code's circa 2026-04. The patterns survive API changes; the specific commands may not.

## If you use this and it works, please

Write back with what compounded in YOUR repo that didn't here. The cookbook gets better the more domains it's tested against. Clear's version is Clear-specific in spots (`.clear` files, Meph as the app-building agent, Factor DB as the outcome log) — every piece has an analog in other domains, and the analogs will surface when practitioners port.
