---
name: red-team-plan
description: Use when stress-testing any implementation plan before coding begins. Trigger when user says "red team this", "bulletproof this plan", "review this plan", "is this plan solid?", or before handing any plan to Code mode. Also trigger proactively after write-plan skill produces a plan with 4+ TDD cycles, async operations, or UI components — these are the plans that break most.
---

# Red Team Plan

**Announce:** "I'm using the red-team-plan skill to bulletproof `[plan-name]`."

## Core Philosophy

Red Team doesn't just find holes — it **fills them with explicit code, tests, and specs** that the implementer can copy-paste. The goal: a plan so detailed that a sleep-deprived junior dev at 3am could implement it correctly.

**The golden rule: if Red Team says "add a test" without writing the actual test code, Red Team failed.**

## Mode Restrictions

- Red Team can ONLY edit `.md` files
- Red Team does NOT implement code — it rewrites plans
- If an architectural issue is found that's beyond plan-level fixes, stop and tell the user it needs Architect mode

---

## Step 0: Scope Check

Read the plan. Before doing anything, assess:

| Plan Type | Action |
|-----------|--------|
| 1-2 TDD cycles, no async, no UI | Offer lightweight review (edge cases + line numbers only) |
| 3+ cycles OR has async/state/UI | Full red team review |
| Already a RED-TEAM doc | Tell user, don't re-review |
| No TDD cycles at all | Flag as architectural gap — needs `write-plan` skill first |

If the user wants full review regardless, do it.

---

## Step 1: Read Everything

1. Read the plan file completely
2. Read `intent.md` — **authoritative** source for shapes, actions, auth rules, env vars, and data contracts. This is the single source of truth.
3. Read `plans/CODEBASE-REFERENCE.md` if it exists — **advisory** for architecture context (file structure, patterns, line counts). May be stale; verify against actual files.
4. Read EVERY source file referenced in the plan's "Files to Modify" section
5. Note current line numbers of code blocks the plan references

---

## Step 2: Priority Checks (run in order)

### PRIORITY 1: Diff Safety (Code Deletion Prevention)

**This is the #1 implementation failure mode.** Code edits match too broadly, nuke adjacent functions, lose imports.

For every code modification in the plan, verify:

| Check | What to Verify |
|-------|----------------|
| Edit scope | Only matches target code, not adjacent functions |
| Line count | Replacing more than 10 lines? Flag for manual verification |
| Imports preserved | No imports accidentally deleted |
| Helper functions | No utilities removed "because they looked unused" |
| Comments | Code context preserved |
| Context markers | Function name, class wrapper clearly identified |

**Every code edit MUST include:**
1. Exact start location (verified against current file)
2. Context comment showing what function/block you're in
3. Explicit "NOT CHANGING" note for adjacent code

**If the plan has vague edit locations: BLOCKED until fixed.**

---

### PRIORITY 2: Line Number Verification

**Plans with stale line numbers mean wrong sections get edited.**

For EACH code block with line numbers:
1. Use Read tool to get current file state
2. Verify line number still matches the code shown in the plan
3. If drifted: UPDATE the plan with correct numbers + add `<!-- Line verified YYYY-MM-DD -->`
4. If file doesn't exist yet (new file): note "unverifiable — new file" and skip

Record all drift found for the attack report.

**If line numbers are wrong: plan is BLOCKED until fixed.**

---

### PRIORITY 3: Import/Export Audit

**New functions get added but exports/imports get forgotten. Every time.**

For every new function, component, or store method in the plan:

| Check | What to Look For |
|-------|-----------------|
| Function exported? | `export function newThing()` not just `function newThing()` |
| Import added where used? | If ComponentA uses it, does ComponentA have the import? |
| Circular deps? | Does A import B and B import A? BLOCKED |
| Named vs default? | Matches existing pattern in that file |
| Type imports? | JSDoc types imported if referenced |

**Auto-fail if:** new function with no export statement OR usage site without import.

---

### PRIORITY 4: Dead Code Detection

Flag code that will never run:

- **Unreachable branches** — conditions that can never be true given earlier conditions
- **Unused parameters** — function args that are never read
- **Duplicate constants** — same value defined in multiple files (should import from one)
- **Variables assigned but never read** — expensive computation whose result is thrown away

Mark each with `// DELETE THIS — never used` in the plan.

---

### PRIORITY 5: Intent Spec Cross-Reference

**`intent.md` is the single source of truth.** Plans that contradict it will produce code that breaks existing features or violates auth boundaries.

Cross-reference the plan against `intent.md` for:

| Check | What to Verify Against intent.md |
|-------|----------------------------------|
| **Shapes** | Does the plan use the correct field names, types, and defaults for SharedModel / UserModel / ParsedModel / EvalResult? Flag any field the plan invents that doesn't exist in the spec. |
| **Auth rules** | Does the plan respect which endpoints require auth and which don't? e.g. `/api/share` is anonymous, `/api/models` requires Bearer token. If the plan adds a new endpoint, what auth level does it need? |
| **Guards** | Does the plan match the guard pattern? `isUser` = authenticated Supabase session. If the plan skips auth on an endpoint that needs it, BLOCKED. |
| **API contracts** | Do request/response shapes match the Input/Output specs? e.g. `createShare` input is `{ title, code, showCode, embed }` — if the plan sends different fields, flag it. |
| **Security blocklist** | Does any code in the plan use patterns the evaluator blocks? (`constructor`, `import()`, `eval`, `fetch`, `__proto__`, etc.) If the plan introduces user-facing expressions, verify they pass the security check. |
| **Env vars** | Does the plan reference env vars correctly? All must use `$env/static/private` or `process.env`. If the plan adds a new env var, it must be added to the intent.md Env table too. |
| **Monetization boundary** | Does the plan respect free vs Pro feature gates? e.g. anonymous shares expire 7 days, cloud saves are Pro-only. If the plan gives free users a Pro feature, flag it. |
| **RLS policies** | If the plan touches Supabase queries, does it respect RLS? `user_models` = owner-only. `shared_models` = public read, anon insert, owner update/delete. |

**If the plan contradicts `intent.md`:**
- Minor mismatch (wrong field name, missing default): fix it in the plan
- Major contradiction (wrong auth level, missing security check): BLOCKED — flag for user

**If the plan adds new shapes, actions, env vars, or API endpoints:** add an `intent.md` update strategy section INTO the plan itself. This section must specify:
- **When** to update (at phase boundaries, not every TDD cycle — shapes may be in flux mid-phase)
- **What** to add per phase (new shapes, new endpoints with Input/Output, new env vars, new auth rules)
- **Rule:** the commit at the END of each phase includes the `intent.md` update

Also note in the attack report which phases will need `intent.md` changes.

---

### PRIORITY 6: Tech Debt Scan

While reading files referenced in the plan, actively look for tech debt in the surrounding code — not just the lines the plan touches.

**Minor tech debt** (add as cleanup tasks in the plan):
- Dead code paths (unreachable handlers, unused variables, stale comments)
- Naming inconsistencies (same concept with different names in different files)
- Duplicated logic that could be a shared helper
- Outdated comments that describe behavior that changed
- Missing error handling at system boundaries

**Major tech debt** (flag to user, do NOT silently add to plan):
- Architectural issues (two systems that should be one, wrong abstraction level)
- Systemic patterns that affect multiple files (e.g. dispatch table design)
- Design decisions that will cause compounding pain as features are added
- Performance patterns that won't scale

For major debt, write: "TECH DEBT FLAG: [description]. Estimated scope: [small/medium/large]. Recommend addressing [now/before next feature/when time allows]. Reason: [why it matters]."

---

## Step 3: Attack Checklists

Run these against every relevant part of the plan.

### Edge Cases — THE BIG TABLE

For EVERY user input in the plan, fill this out:

| Input Type | Edge Case | Expected Behavior | Needs Test? |
|------------|-----------|-------------------|-------------|
| Text field | Empty string `""` | Show validation error | Yes |
| Text field | Only whitespace `"   "` | Trim then treat as empty | Yes |
| Text field | 10,000 characters | Truncate or reject with limit | Yes |
| Text field | XSS attempt `<script>` | Escape, don't execute | Yes |
| Text field | Unicode emoji | Works correctly | Manual |
| Number | Negative when should be positive | Clamp to 0 or reject | Yes |
| Number | NaN from bad parse | Default value or error | Yes |
| Number | Infinity | Reject | Yes |
| File | 0 bytes | Specific error message | Yes |
| File | 100MB | Reject before upload starts | Yes |
| File | Wrong MIME type | Clear error message | Yes |
| Array | Empty `[]` | Handle gracefully (not crash) | Yes |
| Array | 1000+ items | Paginate or virtualize | Manual |
| Object | Missing required field | Validation error, not crash | Yes |
| Object | Extra unexpected fields | Ignore them | Manual |
| Null | Where object expected | Null check, not `?.` spam | Yes |
| Undefined | Missing from response | Explicit default | Yes |

Only include rows relevant to the plan. Add feature-specific edge cases.

---

### Race Conditions (for any async operation)

| User Action | Concurrent State | Expected Result | How to Prevent |
|-------------|-----------------|-----------------|----------------|
| Double-click submit | Two requests in flight | Only one request | Disable button on click |
| Type while loading | New input + pending request | Cancel old, start new | AbortController |
| Close modal mid-request | Request completes, modal gone | Ignore result | `if (!mounted) return` |
| Navigate away | Background operation | Cancel cleanly | `onDestroy` cleanup |

Only include if the plan has async operations.

---

### CSS Footgun Checklist (for any UI component)

Every UI element needs both states specified:

| Check | What to Specify |
|-------|----------------|
| Dark mode | Both color values, not just light |
| Mobile | Breakpoint + what changes |
| Focus states | Outline color + offset |
| Hover states | Transition timing |
| Text overflow | `truncate` vs `wrap` vs `clamp` |
| Z-index | Exact value + why |
| Position | What it's relative to |
| Scrolling | `overflow-y-auto` + max-height |

Write out a CSS state table for key components:

| Element | Light Mode | Dark Mode | Hover | Focus | Disabled |
|---------|-----------|-----------|-------|-------|----------|
| (fill per element) | hex | hex | hex | ring spec | hex |

Only include if the plan has UI components.

---

### Svelte 5 Reactivity Footguns

Every `$effect` in the plan must be checked:

| Pattern | Problem | Fix |
|---------|---------|-----|
| `$effect(() => store.update())` | Infinite loop | Wrap update in `untrack()` |
| Mutating array directly | Reactivity breaks | `data = [...data, item]` not `data.push(item)` |
| Missing `$props()` destructure | Props don't work | `let { prop } = $props()` |
| Reading derived in conditional | Dep tracking issues | Use `untrack()` for gates |

Only include if the plan has Svelte components with reactive state.

---

### State Management Transitions

For each async operation, define the full state machine:

```
IDLE → LOADING → SUCCESS
              ↘ ERROR → IDLE (retry)
                     ↘ RETRY_LOADING → ...
```

For each state specify:
- What's visible (spinner? disabled buttons?)
- What's NOT visible (hide old data? show skeleton?)
- What user CAN do (cancel? retry?)
- What user CAN'T do (submit again? navigate?)

Only include if the plan has loading/async states.

---

### Data Contracts

Every API response needs its exact shape documented. Use either JSDoc or example objects:

```javascript
// Example: DriveSearchResponse shape
{
  files: [
    {
      id: 'abc123',            // string, required
      name: 'Q4 Strategy.doc', // string, required
      mimeType: 'application/vnd.google-apps.document',
      modifiedTime: '2026-01-15T10:30:00Z',
      size: '15234',           // string, only for non-Google files
    }
  ],
  nextPageToken: 'token123',   // string | null
  resultSizeEstimate: 42       // number
}
```

Only include if the plan has API integrations.

---

### Error Message Strings

Not "show error" — the exact copy:

```javascript
const ERRORS = {
  NO_AUTH: "Connect your account in Settings to use this feature.",
  TOKEN_EXPIRED: "Your session expired. Please reconnect.",
  RATE_LIMITED: "Too many requests. Please wait a minute.",
  // ... etc
};
```

If the plan says "show error message" without the string: write the string.

---

## Step 4: TDD Cycle Audit

For each TDD cycle in the plan, verify:

1. **The exact test code** is written (copy-paste ready) — not just described
2. **The test command** is specified: `npm test -- src/lib/path/to/test.js`
3. **What "green" looks like**: "Test passes, no console errors"
4. **The implementation code** is included (for simple cycles)
5. **The refactor step is NOT "None"** — every cycle should clean something up

If any cycle says just "add a test for X" without the test code, **write the test yourself**.

If any cycle has `🔄 None` for refactor, add a specific refactor action (extract helper, rename variable, add JSDoc, remove duplication, etc.).

---

## Step 5: Devil's Advocate Questions

For EVERY feature in the plan, ask:

1. **"What if the user double-clicks?"** → Disable button, debounce, or AbortController?
2. **"What if the response is 5 seconds late?"** → User navigated away? Show stale data?
3. **"What if the data is in a different shape?"** → Object validation? Default values?
4. **"What if this runs on mobile?"** → Touch targets 44px+? No hover-only interactions?
5. **"What will the implementer assume that's wrong?"** → Be explicit about defaults, orders, edge cases
6. **"What happens on first run vs. subsequent runs?"** → Empty state handling? Migration?
7. **"What if localStorage/network is unavailable?"** → Graceful degradation?

---

## Step 6: Drunk-Junior-Dev / Haiku-Proof Gate

**This gate MUST pass before moving to Step 7. Red Team is NOT done until every cycle passes.**

The standard: could a sleep-deprived junior dev at 3am (or Claude Haiku) implement each TDD cycle successfully with zero questions? Walk through every cycle and check:

| Check | Fail Condition | Fix Required |
|-------|---------------|-------------|
| **Code is provided** | Cycle says "create component X" without full code | Write the full component code, or reference a sub-file (`plans/discover-components/Foo.svelte`) that contains it |
| **No ambiguous verbs** | "wire up", "integrate", "hook into", "connect" without showing exact code changes | Replace with exact `import` statement + exact template insertion point (line number + surrounding context) |
| **Test is copy-pasteable** | Test described in prose ("test that X works") | Write the actual test function with assertions |
| **File paths are explicit** | "add to the store" without saying which file | Full path: `src/lib/stores/discoveryStore.js` |
| **Edit locations are anchored** | "insert after the imports" | "Insert after line 42 (`import ResultsPane...`)" with 2-3 lines of surrounding context |
| **No assumed knowledge** | Cycle references a pattern "like we did in Cycle 5" | Repeat the relevant code — don't make them flip back |
| **Commands are exact** | "run the tests" | `node src/lib/solver/solver.test.js` |
| **New directories noted** | Code goes in a dir that doesn't exist yet | Add `mkdir -p src/lib/solver` step |

**For UI components specifically:**
- If the component is more than ~15 lines, it MUST be a sub-file in `plans/discover-components/` (or equivalent) with a copy instruction in the plan
- The plan step should read: "Copy `plans/discover-components/Foo.svelte` to `src/lib/components/ResultsPane/Foo.svelte`"
- No inline component code blocks over 15 lines in the plan itself

**If any cycle fails this gate:** fix it now. Do not move on. Do not mark as "noted for later." Fix it or extract it to a sub-file.

---

## Step 7: FIX FIRST, THEN REPORT

**Red Team ALWAYS fixes what it finds. Never ask "want me to fix this?" — just fix it.**

This is non-negotiable. If Red Team finds a bug in the plan, the plan gets fixed in the same step. No asking permission, no "recommended amendments", no deferred fixes. Fix it or flag it as BLOCKED (architectural issues only).

### Output 1: Updated Plan File (saved to disk)

The plan file itself gets:
- **Restructured to follow template order** (context first, then code in implementation order)
- **All Red Team fixes applied directly** — code blocks fixed, edge cases added, tests written, missing steps inserted
- **ZERO Red Team commentary** — no attack summaries, no "I found this bug", no meta-discussion
- **Every finding from Steps 2-6 is resolved** — either fixed in the plan or marked BLOCKED with reason

The plan should read like a recipe, not a post-mortem. The implementer doesn't need to know what was wrong — they need clean, correct instructions.

Save the updated plan to the same path, overwriting the original.

### Output 2: Attack Report (delivered in chat to user)

Tell the USER in the conversation (NOT in the plan file) what was found AND what was fixed:

```
## 🎯 Attack Summary

### Critical (blocks implementation)
- [What was found -> what was fixed in the plan]

### Moderate (would cause bugs)
- [What was found -> what was fixed in the plan]

### Low (tech debt)
- [What was found -> what was fixed in the plan]

## What Was Fixed
- [Specific changes made to the plan file — every item must be DONE, not "recommended"]

## Remaining Risks
- [Anything that's still risky even after fixes]
- [Things to watch during implementation]
```

### What Goes Where

| Content | In Plan File? | In Chat Report? |
|---------|--------------|-----------------|
| Implementation code | Yes | No |
| Test code | Yes | No |
| Line number references | Yes | No |
| CSS specs table | Yes | No |
| Error strings | Yes | No |
| "I found this bug" | No | Yes |
| Attack summary | No | Yes |
| Red Team reasoning | No | Yes |
| Fixes applied | No | Yes |

---

## Step 8: Handoff

End with:

> "Plan updated and saved to `[path]`. Attack report above. Ready for Code mode — use `superpowers:executing-plans` to implement."

If architectural issues were found that need redesign, say:

> "BLOCKED: [issue] needs Architect mode before this plan can proceed."
