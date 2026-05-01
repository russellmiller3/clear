---
name: write-plan
description: Use when creating an implementation plan for any feature, fix, or change in this codebase. Trigger when user says "write a plan", "make a plan", "plan this out", "create a plan for", or before starting any non-trivial implementation work.
---

# Write a Plan

**Announce:** "I'm using the write-plan skill."

## Rule 0: WRITE THE PLAN FILE IN SMALL INCREMENTS — ALWAYS

**Never produce the entire plan file with one `Write` call.** Plans are long (300–1000 lines) and a single silent write with no intermediate progress is unusable for the person watching — they sit through minutes of no output and then get a wall of text they can't react to mid-flight.

**Required pattern:**
1. Create the file with a minimal skeleton (header + problem statement + "the fix" diagram) using `Write`. Target ≤100 lines for the first write.
2. Append each subsequent section with a separate `Edit` call. Keep each Edit to ~30–80 lines. One section per Edit.
3. **Narrate before each Edit** — one short sentence (≤15 words) saying what's about to land next. "Phase 3 now — D1 runtime adapter." Nothing more.
4. The user should see forward motion every 30–60 seconds, not a 5-minute silent pause ending in a wall of text.

**Why this matters:** the person watching is the decision-maker. They need to correct course mid-draft ("actually skip Phase 7, we don't need it") and they can't do that if everything lands at once. Incremental visible writes = steerable writing.

**Do not:**
- Write the whole plan in one `Write` call because "it's faster."
- Narrate with paragraphs ("I'm now going to think carefully about the next section…") — one short sentence only.
- Skip narration "because the file already exists" — narrate before every section.
- Batch multiple sections into one Edit to "save tool calls" — the cost is the user's ability to steer, not tool-call count.

This rule is **Rule 0** because violating it makes every subsequent step useless — the user can't red-team a plan they haven't seen land piece by piece.

---

## Step 0.5: Phase Order block at the top of every plan (LOAD-BEARING)

**Every plan must open with a `## Phase Order (load-bearing)` block immediately after the title and one-line summary.** This is the structured anchor that downstream tooling (the `require-plan-read` hook, the `write-plan` reviewer, future executors) reads to know which work comes first and what gates the rest. Buried "Path A first" sentences in plan prose are too easy to miss — the metadata block makes the order load-bearing in plain sight.

**Required shape:**

```markdown
## Phase Order (load-bearing)

**Default track:** Path A — phases 1-7 (the cheap minimalist fix).
**Escalation:** Path B — only if Path A's measurement (Phase 7) shows it wasn't enough.
**Why:** ship the cheapest fix that demonstrably helps before paying migration cost speculatively.

| Phase | Path | Depends on | Status |
|-------|------|------------|--------|
| 1 | A | — | required |
| 2 | A | Phase 1 | required |
| ... | ... | ... | ... |
| B-1 | B | Phase 7 measurement showing Path A insufficient | gated |
```

**Rules for the block:**

- **State the default track explicitly.** "Path A" / "Path B" naming is fine; the point is one named track is the default and the rest are gated.
- **Every gated phase names its gate.** "Gated on Phase 7 measurement" or "Gated on Russell's go on the spend" or "Requires Path A complete."
- **One sentence on why this ordering.** No long rationale — that lives later in the plan. The header just orients the reader.
- **Use a table when there are >3 phases.** Otherwise a bulleted list is fine.
- **Mark held-out / research-tier phases distinctly.** "Off the critical path" or "research-tier" if they're explicitly not on the launch path.

**Why this matters:** plans are written once and read many times — by Claude when spawning workers, by humans when reviewing, by future tooling when building agent harnesses. A buried "do this first" sentence is a foot-gun every read pays. A structured block at the top gets read by anything that opens the file.

**Retrofit policy for existing plans:** when you touch an existing plan that lacks this block, add it. Don't bulk-retrofit every plan in `plans/` at once — do it as plans get edited.

---

## Step 1: Assess scope (skip if user already said)

If the user hasn't indicated size, ask:

> "Is this a large feature (new components, multiple files, architecture decisions) or a small fix (bug, single concern, 1-3 cycles)?"

If still unclear, default to **large** (better to over-plan).

| Signals → Small | Signals → Large |
|-----------------|-----------------|
| Bug fix or single concern | New UI component or store |
| 1-2 files change | 3+ files change |
| No new architecture | New data flow or integration |
| 3 or fewer TDD cycles | 4+ TDD cycles |

---

## Step 2: Codebase reconnaissance (MANDATORY — do not skip)

**Before writing a single word of the plan, prove the feature doesn't already exist.** Clear has 126+ node types, a full CLI (`cli/clear.js`), a Studio server (`playground/server.js`), and years of accumulated capability. We've nearly rebuilt things that already existed (SERVICE_CALL, `clear package`, etc.). Every plan that duplicates existing code is a plan that wastes a session.

### 2a. Extract keywords from the plan title

Pull the 3-5 most specific nouns and verbs from what the user asked for. Example: "Fly.io deploy pipeline" → `deploy`, `fly`, `dockerfile`, `package`, `bundle`.

### 2b. Grep the entire codebase for those keywords

Run these greps in parallel. If a keyword shows up in any of these files, **read the surrounding code before writing the plan** — you may be about to rebuild it.

| Grep target | Why |
|-------------|-----|
| `cli/clear.js` | Existing CLI commands. Every command is a potential overlap. |
| `playground/server.js` | Existing Studio endpoints. Every `app.post('/api/...')` could be the thing you're about to add. |
| `playground/ide.html` | Existing UI controls. Toolbar buttons, modals, state. |
| `compiler.js` + `parser.js` | Read the TOC at the top of each file. Existing node types, compile paths. |
| `synonyms.js` | Keyword collisions before proposing new syntax. |
| `runtime/` | Existing db adapters, auth, rate limit — don't rebuild. |
| `plans/` | Past plans on the same topic. Learn from what was tried. |

If a grep hit looks like partial overlap, **stop and tell the user** before continuing. Ask: "I found `X` at `path:line` that seems to overlap with this plan. Is the new feature an extension, replacement, or separate?" Do NOT assume.

### 2c. Read Clear's canonical files

```
Read intent.md          # 126+ node types — authoritative syntax spec
Read CLAUDE.md          # project rules, docs gate, testing conventions
Read AI-INSTRUCTIONS.md # Clear-writing conventions (diagrams, comment style, etc.)
Read SYNTAX.md          # syntax reference with examples
Read learnings.md       # scan TOC — every entry is a bug someone already hit
Read ROADMAP.md         # what's already built (phases 1-84 complete) vs what's planned
```

`intent.md` is **authoritative but may lag the parser** — always cross-check against `parser.js` TOC when in doubt.

### 2d. Report before writing

Before drafting the plan, tell the user in chat:
- **What already exists** that overlaps (with `path:line` cites)
- **What's genuinely new** (the delta)
- **What surfaces will change** (CLI, compiler, playground, docs)

If ≥80% of what the plan proposes already exists, **recommend a reuse-and-extend plan instead of a net-new plan**.

---

## Step 3: Explore relevant files

Read the specific files that will be touched. Don't plan blind.

**Important:** When writing the plan's "Existing Code" section, organize reads BY PHASE, not as one giant upfront list. The executing agent should only read files it needs for the current phase — don't burn context window on files that won't be touched until 10 cycles later.

Structure it like:
```markdown
### Always read first (every phase):
| intent.md | Authoritative spec |

### Phase 1 — read these:
| file.js | Why |

### Phase 2 — read these:
| other-file.js | Why |
```

This ensures:
- Fresh line numbers right before editing (not stale from 5 cycles ago)
- Context window isn't burned on irrelevant files
- Files modified in earlier phases get re-read with current state

---

## Step 4: Fill the template

### For SMALL plans → `plans/SMALL-PLAN-TEMPLATE.md`

Save to: `plans/fix-[name]-MM-DD-YYYY.md` or `plans/plan-[name]-MM-DD-YYYY.md` (always suffix with today's date)

Fill each section:

**🎯 THE PROBLEM** — 1-2 sentences. Root cause. Previous attempts (if any).

**🔧 THE FIX** — The "aha" insight first. ASCII diagram of the flow. Why this works.

**📁 FILES INVOLVED** — Tables: new files and modified files with exact paths.

**🚨 EDGE CASES** — Table: scenario → how we handle it.

**🎯 ERROR UX** — What user sees on success/failure. Log tag (`[TAGNAME]`).

**🔄 INTEGRATION NOTES** — How this touches existing systems. Any breaking changes.

**📋 IMPLEMENTATION STEPS** — 2-4 TDD cycles max:
- Each cycle: 🔴 test → 🟢 minimal code → 🔄 refactor
- Keep cycles small (one testable unit each)

**🧪 TESTING STRATEGY** — Test command. Browser scenarios. Success criteria checklist.

**📎 COPY-PASTE TO CONTINUE** — Fill in the resume prompt at the bottom.

---

### For LARGE plans → `plans/PLAN-TEMPLATE.md`

Save to: `plans/plan-[name]-MM-DD-YYYY.md` (always suffix with today's date)

Fill each section in order:

**Section 0 (Before Starting)** — Branch name (`feature/[name]`), PROGRESS.md skeleton, logger tag for this feature.

**Section 1 (Existing Code)** — Phased reading strategy: `intent.md` at the start of every phase, then only the files needed for that phase. NOT a single upfront dump.

**Section 2 (What We're Building)** — User-facing description. ASCII before/after diagrams. Key decisions with rationale.

**Section 3 (Data Flow)** — ASCII state flow. Which stores/components are involved. How UI reacts to state changes.

**Section 4 (Integration Points)** — Producer → consumer table with data formats.

**Section 5 (Edge Cases)** — Use the universal patterns checklist (state drift, destructive actions, lifecycle, error recovery). Add feature-specific cases.

**Section 6 (ENV VARS)** — Required/optional vars, or "None required."

**Section 7 (Files to Create)** — Full code examples with comments. Include test file with proper import pattern (check existing tests for `vi` import and render pattern).

**Section 8 (Files to Modify)** — Use drift-safe line markers: `Line ~XX (after \`exact snippet\`)`.

**Section 9 (Pre-Flight Checklist)** — Fill the Local vs Vercel test matrix for this feature's key scenarios.

**Section 10 (TDD Cycles)** — One cycle per smallest testable unit. Include test command and commit message per cycle. Mark which cycles need UI check.

> **Anti-pattern to avoid — "state transition tests" that don't cover data shape:**
> If a feature has a data pipeline (API response → store → component), tests that only check state changes (idle→running→complete) tell you the state machine works — not that the data is correct. Always include at least one test per pipeline stage that asserts the *shape* of the output object, not just that state transitioned. For example:
> - ❌ `assert.equal(store.status, 'complete')` — tells you it finished, not what it produced
> - ✅ `assert.ok(Array.isArray(store.bestResult.predicted) && store.bestResult.predicted.length > 0)` — tells you the chart will have data to render
>
> **Rule:** For every mock in a test, ask "does this mock include all the fields the consumer actually reads?" If the mock is missing fields the component needs, the test will pass and the UI will silently break.

**Sections 11-17** — Fill logging tags, test run order, browser checklist, and success criteria. Leave the Vercel section template as-is (it's a checklist for implementation time).

---

## Step 5: Add learnings hooks to the plan

For **large plans**, add a "Update learnings.md" step at the end of each phase section in the TDD Cycles. It should be the last bullet in each phase block, before the commit:

```markdown
| 📚 | Run update-learnings skill: capture lessons from this phase into `learnings.md`. | N/A |
```

For **small plans**, add a single step at the very end (after the final commit):

```markdown
**Final step:** Run `update-learnings` skill to capture any lessons from this fix.
```

Also add to the **Pre-Flight Checklist** (Section 9 for large plans):
- [ ] `learnings.md` exists at project root (create from template if missing)

---

## Step 5.5: Clear Documentation Surfaces (MANDATORY for new features)

Clear's `CLAUDE.md` Documentation Rule lists 9 surfaces that MUST be updated when any new syntax, node type, CLI command, or Studio capability ships. Missing any one causes a user-facing gap (AI writes stale syntax, Meph doesn't know the feature, landing page shows wrong example).

Pick the surfaces that match the feature type and add them as the FINAL phase of the plan. No new feature ships without these updates.

| Surface | File | When to update |
|---------|------|----------------|
| Spec | `intent.md` | New node type, new syntax, new build target |
| Reference | `SYNTAX.md` | Any new user-facing syntax — include a runnable example |
| AI conventions | `AI-INSTRUCTIONS.md` | Any rule for how AI should write Clear code using the feature |
| Tutorial | `USER-GUIDE.md` | User-facing feature — add worked example |
| Status | `ROADMAP.md` | Mark the phase complete, update counts under "What's Next" |
| Marketing | `landing/*.html` | Feature appears in demos, hero examples, or agent pitch pages |
| Studio AI | `playground/system-prompt.md` | Feature Meph should know to use when building apps |
| FAQ | `FAQ.md` | New subsystem → add "Where does X live?" / "How do I Y?" / "Why did we Z?" entries. Touched existing subsystem → update relevant entry. |
| Research | `RESEARCH.md` | Anything affecting training signal: Factor DB schema, archetype classifier, hint retrieval, curriculum, eval pipeline. Keep the plain-English "Read This First" section current. |

If the feature adds a CLI command, also update the `## CLI (for AI agents)` block in `CLAUDE.md` itself.

If the feature adds a Studio endpoint, also update `playground/server.test.js` with coverage.

**Checklist to paste into the plan's final phase:**

```markdown
- [ ] `intent.md` updated (spec row)
- [ ] `SYNTAX.md` updated (reference + example)
- [ ] `AI-INSTRUCTIONS.md` updated (convention / gotcha)
- [ ] `USER-GUIDE.md` updated (tutorial coverage)
- [ ] `ROADMAP.md` updated (phase complete + next moves)
- [ ] `landing/*.html` synced (if feature is user-facing)
- [ ] `playground/system-prompt.md` updated (if Meph should use it)
- [ ] `FAQ.md` updated (new subsystem entries or changed answers)
- [ ] `RESEARCH.md` updated (if training signal / flywheel affected)
- [ ] `playground/clear-compiler.min.js` rebuilt (if compiler changed)
```

---

## Step 6: Review before handing off

Before calling the plan done, verify:
- [ ] No `[TODO]` or `[placeholder]` markers remain
- [ ] All file paths are exact (not approximate)
- [ ] TDD cycles are truly minimal (not batched)
- [ ] Edge cases have matching tests or explicit "no test" justification
- [ ] For any data pipeline (API → store → component): at least one test checks the *shape* of the output object, not just that state changed. Mocks include ALL fields the consumer reads.
- [ ] Branch name follows `feature/` or `fix/` convention
- [ ] **Documentation gate (MANDATORY):** If the plan adds ANY new syntax, node types, keywords, or features, the plan MUST include a documentation step in its FINAL phase that updates ALL of: `intent.md` (spec table), `SYNTAX.md` (reference + example), `AI-INSTRUCTIONS.md` (conventions), `USER-GUIDE.md` (tutorial), `ROADMAP.md` (completion status). If it's not in the docs, it doesn't exist.
- [ ] If new shapes/actions/env vars added: `intent.md` update is included in the plan
- [ ] Learnings hooks added to each phase (large plan) or at end (small plan)
- [ ] **Five-surface checklist** included for any phase that adds new functions

Then **immediately run the red-team-plan skill** on the plan you just wrote. Do NOT offer execution until red-teaming is complete and any issues found are patched.

---

## Step 7: Red-team the plan

**Mandatory.** After writing the plan, invoke the `red-team-plan` skill on it. This stress-tests the plan for:
- Missing edge cases
- Incorrect assumptions
- Ordering bugs (dependencies between phases)
- Security holes
- Untested paths
- Tech debt (see below)

## Tech Debt Rule

While exploring code for any plan, actively watch for tech debt:

- **Minor refactors** (dead code, naming inconsistencies, duplicated logic, stale comments): add them as a "Cleanup" phase at the end of the plan. These get done as part of the work.
- **Major refactors** (architectural issues, systemic patterns that need rethinking, design flaws): flag them explicitly to the user with a description of the problem and estimated scope. Do NOT silently add them to the plan — the user decides whether to tackle them now or later.

Fix any issues the red-team identifies before presenting the plan to the user.

After red-teaming and patching, offer execution:

> "Plan saved to `plans/[filename].md`. Red-teamed and patched. Want me to start implementing now (subagent-driven), or will you start a fresh session with it?"
