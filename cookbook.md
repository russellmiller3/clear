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

Seven hooks in this repo as of 2026-04-25. Each fires automatically on a specific event. Together they enforce rules the AI contributor would otherwise forget mid-session. The auto-inventory below lists names; this section explains WHY each exists, WHEN it fires, and HOW it earns its keep. Copy whichever resonate to a new repo.

| Hook | Event | What it does | Why it exists |
|------|-------|--------------|---------------|
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

<!-- BEGIN AUTO-INVENTORY - Do not edit by hand. .claude/hooks/cookbook-updater.mjs refreshes this section every 7 days on SessionStart. -->

_Last refresh: 2026-04-26_

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
- **Core 8 Templates** — These are the showcase apps — each archetype exercises a different feature slice.
- **No Self-Assignment Rule** — Never write `x is x` in Clear code. When building records from function arguments, the argument names must differ from the field names: `…
- **No Backward Compatibility** — There are no users yet. Do not preserve backward compatibility. Always do things the right way.
- **File TOC Rule (MANDATORY)** — Both `parser.js` and `compiler.js` have a TABLE OF CONTENTS at the top.
- **Compiler Architecture** — tokenize -> parse -> validate -> compile
- **Synonym Collision Risks** — `count by` vs `increase count by 1` -- token sequence detection
- **UI/Design System** — HTML + vanilla JS + Tailwind CSS v4 (CDN) + DaisyUI v5
- **Documentation Rule (MANDATORY)** — Every new feature MUST be documented in ALL of these before shipping:
- **Before Adding New Features or Syntax (MANDATORY)** — 1. Use `/write-plan` to create an implementation plan

### `.claude/hooks/` — event-driven enforcement

- **cookbook-updater.mjs** — .claude/hooks/cookbook-updater.mjs
- **doc-cascade.mjs** — .claude/hooks/doc-cascade.mjs
- **learnings-miner.mjs** — .claude/hooks/learnings-miner.mjs
- **parallel-thinking.mjs** — .claude/hooks/parallel-thinking.mjs
- **propose-new-hooks.mjs** — .claude/hooks/propose-new-hooks.mjs
- **propose-new-tools.mjs** — .claude/hooks/propose-new-tools.mjs
- **validator-friction.mjs** — .claude/hooks/validator-friction.mjs

### `.claude/skills/` — user-invocable slash commands

- **/bigpicture** — Narrate what was built in this session and why it matters. Step back from the diff, explain significance in plain English, connect to whe…
- **/debug** — >
- **/docs** — Update all documentation files to match current compiler state. Narrates what was built and why it matters, then ensures intent.md, SYNTA…
- **/eval-meph** — Run the Meph tool eval as a regression net. Trigger when changes touch playground/server.js (especially TOOLS array, executeTool, validat…
- **/execute-plan** — Use when executing a multi-phase implementation plan. Trigger when user says "execute this plan", "implement this plan", "start building"…
- **/handoff** — Create or update HANDOFF.md to pass context between sessions. Use when ending a session, switching tasks, or when the user says "handoff"…
- **/pres** — "PRES = Plan → Red-team → Execute → Ship. Full build cycle with no manual handoffs. Use when the user says '/pres [feature]', 'pres this'…
- **/red-team-code** — Use when stress-testing code AFTER it has been written and compiles. Trigger when user says "/rt", "/red-team-code", "red team this code"…
- **/red-team-plan** — Use when stress-testing any implementation plan before coding begins. Trigger when user says "red team this", "bulletproof this plan", "r…
- **/rule** — Add a rule to the project-level CLAUDE.md. Use when the user says "/rule [text]" or "add a project rule" or "make this a rule". Appends a…
- **/ship** — Ship a Clear feature: update all docs, commit, merge to main, push. Updates learnings, roadmap, philosophy, syntax, handoff, and readme.
- **/update-learnings** — Update learnings.md with lessons from completed work. Trigger when: user says "update learnings", "add to learnings", "document what we l…
- **/user-rule** — Add a rule to the user-level CLAUDE.md (applies across all projects). Use when the user says "/user-rule [text]" or "add a personal rule"…
- **/write-clear** — Write programs in the Clear language. Use when the user asks to write, build, or create something in Clear, or asks "how do I write X in …
- **/write-plan** — Use when creating an implementation plan for any feature, fix, or change in this codebase. Trigger when user says "write a plan", "make a…

### `scripts/` — helper utilities (safe to run on demand)

- **check-doc-drift.cjs** — Files we care about — the canonical docs that must agree with each other.
- **cross-target-smoke.mjs** — scripts/cross-target-smoke.mjs
- **decidable-core-replay.mjs** — scripts/decidable-core-replay.mjs
- **doc-drift.mjs** — scripts/doc-drift.mjs
- **doc-drift.test.mjs** — scripts/doc-drift.test.mjs
- **factor-db-summary.mjs** — Quick read-only summary of the Factor DB.
- **log-compiler-edits.mjs** — Post-commit hook: scan the last commit's diff for error-message-shaped
- **log-compiler-edits.test.mjs** — Unit tests for the compiler-edit diff parser.
- **reconcile-wfp.js** — Weekly reconcile job.
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
