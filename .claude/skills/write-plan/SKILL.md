---
name: write-plan
description: Use when creating an implementation plan for any feature, fix, or change in this codebase. Trigger when user says "write a plan", "make a plan", "plan this out", "create a plan for", or before starting any non-trivial implementation work.
---

# Write a Plan

**Announce:** "I'm using the write-plan skill."

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

## Step 2: Read intent.md + CODEBASE-REFERENCE.md

**Mandatory before writing any plan:**

```
Read intent.md
Read plans/CODEBASE-REFERENCE.md (if it exists)
```

`intent.md` is the **authoritative** source for shapes, actions, auth rules, env vars, and monetization boundaries. If the feature adds or changes any of these, update `intent.md` as part of the plan.

`CODEBASE-REFERENCE.md` is **advisory** — architecture, file layout, testing patterns. May be stale; verify against actual files.

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

## Step 5.5: Five-Surface Checklist (for new functions)

**When adding new functions to Cast, there are 5 surfaces that must be updated.** Missing any one causes a real user-facing bug (AI won't suggest it, help panel won't show it, editor won't highlight it).

| # | Surface | File | What it does | What breaks if missed |
|---|---------|------|--------------|----------------------|
| 1 | `CAST_FUNCTIONS` | `src/lib/castSyntaxReference.js` (~line 294) | AI function whitelist — the AI ONLY suggests functions listed here | AI refuses to suggest the new function or hallucinates wrong syntax |
| 2 | `CAST_SYNTAX` | `src/lib/castSyntaxReference.js` (~line 20) | Quick-reference cheatsheet snippets for help panel + AI prompt | Help panel missing examples, AI prompt incomplete |
| 3 | `HELP_FUNCTIONS` | `src/lib/castSyntaxReference.js` (~line 1945) | Detailed help cards (params, returns, examples, related) | User can't find documentation for the function |
| 4 | `castLanguage.js` | `src/lib/editor/castLanguage.js` | Syntax highlighting keywords for the editor | Function name shows as plain text, not highlighted |
| 5 | `evaluator.js` | `src/lib/evaluator.js` (CUSTOM_FUNCTIONS) | Runtime registration — function actually works | Function throws "undefined" at runtime |

**The AI system prompt auto-generates** from `CAST_FUNCTIONS` + `CAST_SYNTAX` via `generateAIPrompt()`, so updating surfaces 1 and 2 automatically fixes the AI.

**For every new function in the plan, verify all 5 surfaces are covered.** Add a checklist step at the end of each phase:

```markdown
- [ ] `CAST_FUNCTIONS` updated (AI whitelist)
- [ ] `CAST_SYNTAX` updated (cheatsheet examples)
- [ ] `HELP_FUNCTIONS` updated (detailed help card)
- [ ] `castLanguage.js` updated (syntax highlighting)
- [ ] `evaluator.js` CUSTOM_FUNCTIONS updated (runtime)
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
