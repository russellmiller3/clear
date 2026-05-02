# Flywheel Measurement + Retrieval Fix - 2026-05-01

One-line summary: make the flywheel report statistical significance on hard tasks only, and stop retrieval from padding exact fixes with generic examples.

## Phase Order (load-bearing)

**Default track:** Path A - local measurement/reporting plus deterministic retrieval cleanup.
**Escalation:** Path B - paid/live A/B sweeps only after Path A reports the current evidence cleanly.
**Why:** do not spend API money or make claims until the existing evidence is measured honestly.

| Phase | Path | Depends on | Status |
|-------|------|------------|--------|
| 1 | A | current branch | required |
| 2 | A | Phase 1 red tests | required |
| 3 | A | Phase 2 green tests | required |
| B-1 | B | hard-task report says sample is underpowered | gated |

## The Problem

The flywheel has two different failures mixed together.

1. Measurement is reporting raw pass-rate lift across tasks that are too easy.
2. Retrieval is returning exact fixes, then padding the prompt with generic same-archetype examples.

That creates a false product signal. Saturated tasks cannot tell us whether hints help, and generic hints make Meph reject the retrieval output.

## Existing Code

| File | Why it matters |
|------|----------------|
| `playground/supervisor/ab-hint-sweep.js` | Produces hint-on versus hint-off artifacts. |
| `playground/sessions/ab-hint-sweep-*.json` | Existing evidence to analyze without spending money. |
| `playground/supervisor/factor-db.js` | Live hint retrieval path. |
| `playground/supervisor/factor-db.test.js` | Existing retrieval regression tests. |
| `scripts/factor-db-summary.mjs` | Existing DB summary pattern for read-only reports. |
| `clear.test.js` | Broad suite import surface for helper tests. |
| `learnings.md` | Must record the measurement lesson. |

## What Changes

### Measurement

Add a read-only hint-effect report.

It must:
- parse existing A/B sweep artifacts,
- reject empty or suspicious-fast runs,
- exclude saturated tasks from the headline,
- compute hard-task hint lift,
- compute statistical significance,
- return `underpowered` when the hard-task sample is too small,
- show saturated tasks in an appendix only.

Default saturated-task rule:

```
both arms have at least 3 trials
AND hint_on pass rate >= 90%
AND hint_off pass rate >= 90%
```

Default hard-task evidence rule:

```
at least one non-saturated task
AND at least 10 trials per arm across included tasks
```

Statistical gate:

```
two-sided Fisher exact p-value < 0.05
AND 95% confidence interval excludes 0
```

### Retrieval

Tighten hint retrieval.

It must:
- prefer same-archetype exact-error fixes over cross-archetype exact-error fixes,
- return exact-error fixes without generic padding,
- use same-archetype gold examples only when there is no exact-error fix,
- keep generic fallback capped and source-backed.

## TDD Cycles

### Cycle 1 - measurement statsig report

Red:
- add tests for saturated-task exclusion,
- add tests for Fisher exact p-value / confidence interval output,
- add tests that suspicious-fast artifacts are excluded.
- add tests for the `underpowered` verdict.

Green:
- create `scripts/hint-effect-report-helpers.mjs`,
- create `scripts/hint-effect-report.mjs`,
- import helper tests from `clear.test.js`.

Refactor:
- keep math pure and dependency-free.

### Cycle 2 - retrieval precision

Red:
- add tests proving exact fixes do not get padded with generic examples,
- add tests proving same-archetype exact fixes outrank newer cross-archetype fixes.

Green:
- update `querySuggestions()` in `playground/supervisor/factor-db.js`.

Refactor:
- extract local helper functions inside `querySuggestions()` only if it improves readability.

### Cycle 3 - docs and learning

Red:
- no code red test; this is documentation.

Green:
- append the lesson to `learnings.md`,
- add a short FAQ entry for the hint-effect report if the script ships.

Refactor:
- keep docs plain English and short.

## Test Commands

Run in this order:

```sh
node scripts/hint-effect-report.test.mjs
node playground/supervisor/factor-db.test.js
node scripts/hint-effect-report.mjs
node clear.test.js
```

## Success Criteria

- Headline report excludes saturated tasks.
- Headline includes p-value, confidence interval, and conclusion.
- Current data can honestly say whether the evidence is significant or underpowered.
- Retrieval returns precise fixes first and stops adding generic noise when exact fixes exist.
- No paid API run happens in Path A.
- Learnings updated before completion.
