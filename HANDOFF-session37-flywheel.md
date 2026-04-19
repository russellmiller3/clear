# Handoff — Session 37 (Supervisor + Flywheel + Marcus Apps)

**Track:** Supervisor multi-session architecture + Factor DB flywheel + Marcus business apps.
**Status at end of session:** all merged to main. Nothing pending.

> Note: `HANDOFF.md` at root is about a parallel track (Session 39 — Live App Editing). This file is the handoff for the flywheel/supervisor work. Both are on main and don't conflict.

## Current State

- **Branch:** `main` (feature/supervisor-multi-session fully merged throughout the session)
- **Tests:** 1954 compiler tests green; 13 templates compile clean
- **Factor DB:** 149 rows / 57 passing across 8 archetypes

## What Shipped

Full picture in `ROADMAP.md` "Session 37" table. TL;DR:

1. **Flywheel end-to-end.** Every Meph compile writes a Factor DB row. Every compile error retrieves 3 tier-ranked past examples and injects them as hints before Meph's next turn. Claude doesn't change — the retriever does.
2. **5 Marcus apps** (approval-queue, lead-router, onboarding-tracker, support-triage, internal-request-queue) + matching curriculum tasks.
3. **2 Studio tabs:** Flywheel (live dashboard) + Supervisor (sweep control + session browser + trajectory drill-down).
4. **14 HITL compiler/docs fixes** — each failure pattern in the DB became a system-level fix. Measurable: sweep 6 had 75% more task completions than sweep 4 on the same curriculum.
5. **Diversified the curriculum** — fixed Marcus skeletons to include auth + page + 5 new archetype tasks (webhook/ETL/batch/dashboard/data-sync).
6. **`landing/how-meph-learns.html`** — plain-English explainer with SVG flywheel diagram.

## NEXT PICK-UP POINT — Step-Decomposition Synthetic Data

Russell's idea at end of session. Highest-leverage synthetic-data move available. Details:

**The problem:** Current sweeps make Meph build whole apps from scratch (14+ steps). If he fails at step 4, steps 5-14 are noise — computed on broken prefix. The HARD late steps (pagination, complex filters) get almost no clean training data because Meph rarely reaches them successfully.

**The fix:** Decompose each template into ~10-14 intermediate states. For each state, run Meph starting FROM that state and ask him to do the NEXT step only. Parallelize across steps. Every trajectory small, focused, clean.

**Why it beats error injection** (my earlier idea):
- Matches Meph's natural workflow — "add the next thing" is what real users ask
- Retriever keys on error signatures, not on task prefixes, so step-focused data generalizes
- No need to design artificial bug patterns — use real template diffs as ground truth

**Not cheating:** we're not pre-stubbing solutions, we're giving Meph the same shape of task a real user would — "add an endpoint to this existing app." The scaffolding IS the task.

**Files to create:**
- `playground/supervisor/step-decomposer.js` — takes a `.clear` file, returns array of `{partial_source, next_step_description, expected_next_source}` tuples.
- `playground/supervisor/step-sweep.js` — orchestrator that runs each step through Meph and logs trajectories.

**Implementation plan:**
1. Decomposer takes `apps/approval-queue/main.clear` and produces N partials by removing the last K structural chunks (last endpoint, last two endpoints, validate block, auth line, etc.).
2. For each partial, prompt Meph: "here's the current source, add the next thing: `<task description>`."
3. Log trajectory to Factor DB (hook already logs automatically via `/api/chat` compile integration).
4. Score: compare compiled output to the known-good next state.
5. Scale: 5 Marcus apps × ~10 sub-steps × 3 parallel workers = ~150 focused trajectories per run.

**Setup cost:** ~2 hours for decomposer + prompt templates + scoring. Amortizes across every template forever.

## Other Queued Work (lower priority)

1. **Classifier fuzzy-match fix** (30 min) — `dashboard` archetype should trigger on 1+ chart (currently 2+); webhook should match `/hook/*` + `/callback/*` paths. File: `playground/supervisor/archetype.js`.
2. **Sharpen task descriptions** for webhook/ETL/data-sync/dashboard curriculum JSON files — more explicit about the signals that trigger archetype detection.
3. **Error injection harness** (2 hours) — still valuable as a complement to step-decomposition. Programmatically break working templates, ask Meph to fix. Good for bug-pattern coverage.

## Key Decisions (this track)

- **HITL rule codified in CLAUDE.md.** Meph failures = bug reports on the whole pipeline. Claude (assistant) fixes at compiler/docs/system-prompt layer, merge-as-you-go.
- **Documentation Rule expanded from 7 to 9 surfaces.** FAQ.md + RESEARCH.md now load-bearing; added to ship + write-plan skills.
- **Fluid/crystal mental model.** Claude = fluid intelligence (unchanging, effortful). Retriever = crystallized intelligence (our ML model, cheap, compounds). Together = one intelligence.

## Files to Read First (Next Session on This Track)

| File | Why |
|------|-----|
| This file | Orientation |
| `PROGRESS.md` | Full phase status + 14-entry HITL fix table |
| `RESEARCH.md` | "Read This First" plain-English section |
| `ROADMAP.md` Session 37 table | 25-entry list of everything shipped |
| `playground/supervisor/curriculum-sweep.js` | Reference for building step-sweep.js |
| `playground/supervisor/factor-db.js` | Factor DB API (logAction + querySuggestions) |
| `apps/approval-queue/main.clear` | First step-decomposer target — simplest Marcus app |

## Resume Prompt

> Read `HANDOFF-session37-flywheel.md`. We ended with the flywheel live (149 rows / 57 passing) and a plan for step-decomposition. Build `playground/supervisor/step-decomposer.js` + `step-sweep.js` per the sketch. Start with approval-queue — generate ~10 partial states, run Meph on each, confirm trajectories land with correct archetype. Not cheating — we're giving Meph "add to existing code" tasks, not pre-stubbing solutions. Ross Perot Rule. Don't stop to ask.
