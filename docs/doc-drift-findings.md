# Doc-Drift Findings (2026-04-21)

Output of `node scripts/check-doc-drift.cjs` after the easy fixes were
applied in the same commit. The items below need a design decision or a
deeper audit before they can be normalized — flagging them here so they
don't disappear into chat scrollback.

---

## 1. Core 7 vs Core 8 templates — design decision needed

**Symptom:** "Core 7" appears in 5 places, "Core 8" appears in 9 places.

**Where:**
- `CLAUDE.md:146` — `## Core 7 Templates` (header) — table lists 7 apps
- `ROADMAP.md:822` — "E2E tests | 80 (core 7 templates, CRUD, curriculum)"
- `learnings.md:41,891` — section header "Session 25b: Core 7 Templates + E2E Testing"
- `CLAUDE.md:306` — "ALWAYS compile all 8 core templates"
- `FAQ.md:498,546` — "all 8 core templates classify ...", "template smoke test (8 core templates, 0 errors)"
- `FEATURES.md:210` — "8 core templates have `requires login`"
- `AI-INSTRUCTIONS.md:2224` — "8 core templates resolves to a realistic probe"
- `CHANGELOG.md:97` — "**Agent+auth template evals all pass** ... 29/29 specs pass"

**Likely cause:** ecom-agent was added as the 8th core template (CHANGELOG entry at
line 96 lists it alongside helpdesk-agent in the agent+auth eval suite). Other
docs got updated to "8 core" but the original `CLAUDE.md` table header and the
historical learning-section heading were not.

**Decision needed:**
- (a) Promote `CLAUDE.md` "Core 7 Templates" to "Core 8" + add ecom-agent row to
  the table. Update ROADMAP.md:822 to "core 8 templates". Leave learnings.md
  section headers alone (they're historical).
- (b) Demote everything to "Core 7" — would mean ecom-agent is not "core."
  Doesn't match the agent+auth eval coverage CHANGELOG entry.

**Recommended:** (a). Ecom-agent is referenced as a core template across recent
docs; the holdouts are stale. The smoke-test command at the top of `CLAUDE.md`
already iterates 8 templates.

**One-line fix once decision lands:**
```
sed -i 's/Core 7 Templates/Core 8 Templates/g' CLAUDE.md
sed -i 's/core 7 templates/core 8 templates/g' ROADMAP.md
```
Then add the ecom-agent row to the `CLAUDE.md` Core Templates table.

---

## 2. Curriculum task count — multiple metrics conflated

**Symptom:** 20, 25, 28, and 30 all appear as "curriculum" counts. Real disk
count is **38** (`ls curriculum/tasks/ | wc -l`).

**Where each came from:**
- `20 benchmark tasks` — original RL set, used in `CLAUDE.md:116`,
  `FAQ.md:420`, `RESEARCH.md:799,994`. May still mean "the original 20."
- `25 curriculum tasks/skeletons` — phase-37 sweep harness count.
  `FAQ.md:452,453`, `CHANGELOG.md:111,125`.
- `28 curriculum tasks` — RL-4 spec ("seed steps on the other 28 curriculum
  tasks" — implies 30 total minus 2 already seeded). `ROADMAP.md:434`,
  `RESEARCH.md:667`.
- `30/30 curriculum tasks have step labels` — `RESEARCH.md:161` (Session 38
  state, claims 30 tasks have step labels).
- `38 curriculum skeletons` — what `playground/e2e.test.js` actually compiles
  today.

**Why this is hard:** "20 benchmark tasks" might be the curated subset used for
specific evals, not the same metric as "all curriculum tasks." Without
reading every reference in context, it's not safe to globally replace 20 → 38.

**Recommended action:**
1. Russell or a subagent enumerates `curriculum/tasks/` and decides whether
   the docs distinguish "benchmark set" from "all tasks."
2. If they don't, normalize all to **38** and remove the language that
   suggests subsets exist.
3. If they do, rename references explicitly: "20 benchmark tasks (subset of
   38 total curriculum tasks)" or similar.

**Lower-bound fix that's safe right now:** update the `30/30` claim in
`RESEARCH.md:161` to `38/38` if step labeling has been completed for all of
them, OR to `30/38` if the original 30 are still the only labeled subset.
This requires running the supervisor's stepStats query to know.

---

## 3. Node-type count: 119+ vs 126 vs ~156 in parser

**Symptom:** `CLAUDE.md` says "119+ node types" (line 27, line 212),
`FEATURES.md:5` says "126 node types", and `parser.js` has ~156 NodeType
definitions matching the pattern `/^\s*[A-Z_]+:\s*'[a-z_]+',/`.

**Why this is hard:** "Node type count" is ambiguous. Possible meanings:
- Number of `NodeType.X` enum entries in `parser.js` (≈156)
- Number of node types the compiler actually emits code for (subset)
- Number of node types documented in `intent.md` (probably less than 156 — the
  spec lags implementation, per CLAUDE.md "always check the parser too")

**Recommended action:**
1. Decide on the canonical metric ("documented node types" vs
   "implemented node types").
2. Get a real count by running `grep -cE "^\s*[A-Z_]+:\s*'[a-z_]+'," parser.js`
   for impl, or counting rows in the intent.md spec table for documented.
3. Update both `CLAUDE.md` references and `FEATURES.md` to the chosen metric.

**Stop-gap:** if no decision is made this session, soften `FEATURES.md:5`'s
"126 node types" to "150+ node types" — at least the lower bound is honest.

---

## 4. Compiler-test count drift fixed in this commit

For the record: `1089` (intent.md) → `1850` (FEATURES.md) → `1954` (FAQ.md)
were all updated to **2108** (current count from `node clear.test.js` on
2026-04-21). New drift here in future means someone updated tests but only
in one doc — the `check-doc-drift.cjs` script will catch it again.

---

## 5. Doc-rule surface count fixed in this commit

`FAQ.md`'s "all 9 surfaces" was updated to "all 11 surfaces" to match the
canonical list in `CLAUDE.md`'s Documentation Rule (which enumerates 11 docs
that need updating per feature ship).

`CHANGELOG.md:127` was left at "9 surfaces" because that entry is the
historical record of the session that upped the count from 7 to 9.
Re-writing history would lose context.

---

## How to keep this list short

Run `node scripts/check-doc-drift.cjs` before any session that touches docs
broadly (refactoring, big spec updates, doc cleanup passes). Fix the easy
drift in the same commit; add new hard cases here for design discussion.

The script's regex patterns are intentionally narrow — see the `METRICS`
array at the top of `scripts/check-doc-drift.cjs`. False positives waste
reader attention more than missed metrics, so prefer "tight pattern that
misses some" over "loose pattern that flags noise."
