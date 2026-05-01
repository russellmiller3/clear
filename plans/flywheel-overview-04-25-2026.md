# The Clear Flywheel — One-Page Overview (2026-04-25)

Reference diagram + plain-English notes. Companion to `RESEARCH.md`'s deeper architecture sections. Read this if you want to know **what's wired, what's not, and why it matters** in 2 minutes.

---

## The picture

```
                  ┌──────────────────────────────────────┐
                  │       THE CLEAR FLYWHEEL             │
                  │   3 streams → 1 ledger → 2 loops     │
                  └──────────────────────────────────────┘

   ── 3 STREAMS THAT WRITE TO THE LEDGER ──

   A) Meph (or Russell) builds a Clear app
      ─► every compile attempt = 1 row    (✅ wired)

   B) Compiled apps running in the real world
      ─► every page-load latency / error = 1 beacon
                                           (✅ since today, but lands in a
                                            flat log file, NOT the ledger)

   C) Russell + Claude fix the compiler
      ─► every error-message rewrite      (✗ NOT wired — fix lands in code,
                                            no row says "we changed X to Y")


            ┌─────────────────────────────────────────┐
            │           THE FACTOR DB                 │
            │     ( = "the ledger" — one big table )  │
            │     149 rows total, 46 passing today    │
            └────────────┬────────────┬───────────────┘
                         │            │
              INNER LOOP │            │  OUTER LOOP
            (real-time:  │            │ (permanent:
             this Meph   │            │  every future
             session)    │            │  Meph session)
                         │            │
                         ▼            ▼

   ┌────────────────────────┐    ┌─────────────────────────┐
   │ Ranker picks 3 past    │    │ Friction script ranks   │
   │ working examples       │    │ compile errors by cost  │
   │ similar to the error   │    │ (which one steals the   │
   │ Meph just hit. Hands   │    │  most Meph time?)       │
   │ them to him in the     │    │                         │
   │ same chat turn so he   │    │ Russell + Claude rewrite│
   │ pattern-matches and    │    │ the worst error in the  │
   │ retries.               │    │ compiler.               │
   │                        │    │                         │
   │ ✅ wired               │    │ ✅ script exists,       │
   │ (offline ranker scores │    │   rule says use it,     │
   │  great; live effect    │    │   we follow it manually │
   │  unproven)             │    │                         │
   └────────────────────────┘    └────────────┬────────────┘
                                              │
                                              ▼
                              compiler accumulates quality
                            EVERY future Meph session benefits
```

---

## What it means in plain English

**Three things produce data we can learn from:**
- **Stream A — Meph (or any author) building Clear apps.** Every compile attempt — pass or fail — drops a row in the ledger. This has been live since Session 37.
- **Stream B — compiled Clear apps running in the wild.** Every page-load timing, every endpoint error sends a tiny "beacon" home. Wired today (2026-04-25), but the beacons land in a flat log file instead of the main ledger — orphaned data.
- **Stream C — Russell + Claude (or other compiler maintainers) fixing the compiler.** Every time we rewrite a confusing error message or fix a parser bug, that change benefits every future user. But there's no row saying "we changed X to Y on date Z." The link from "compiler change" back into the data is missing.

**The ledger** (technically the `factor-db.sqlite` file in the playground folder) is the single big table everything lands in. Today: 149 rows, 46 of them are end-to-end passing.

**Two improvement loops feed off the ledger:**

- **Inner loop (real-time, helps THIS Meph session):** When Meph hits a compile error, a ranker model reads the ledger and picks 3 past examples where someone hit a similar error and recovered. Meph sees those examples in the same chat turn and pattern-matches off them. Live. The ranker scores well in offline tests but its effect on Meph's live pass rate is unmeasured.
- **Outer loop (permanent, helps EVERY future Meph session):** A friction script reads the ledger and ranks compile errors by how much time they cost users. Russell + Claude pick the worst one and rewrite it in the compiler. Every future user benefits forever — and at $0 inference cost, since it's a deterministic compile-time win, not a model improvement. The script exists; the rule that we use it (instead of guessing which errors to rewrite) is in CLAUDE.md.

**Why the shell upgrade compounds this:**
The shell upgrade is 5-7 sessions of new syntax (nav rails, stat cards, right detail panels, etc). That work generates thousands of new compile attempts and hundreds of new error-message rewrites. If we ship blind, all that data is invisible to the flywheel. If we close the missing wires first, EVERY phase of the shell upgrade lands in the ledger and the compiler quality keeps compounding instead of plateauing.

---

## Pre-shell-upgrade hardening — 1 session, 3 jobs

1. **Pipe stream B (runtime beacons) into the main ledger.** Today they sit in `playground/flywheel-beacons.jsonl`. Migrate into a `code_actions_runtime` table in the Factor DB so the same trainer can read both compile-time and runtime data. Plan stub already exists at `plans/plan-compiler-flywheel-tier1-04-19-2026.md`.

2. **Wire stream C (compiler-edit auto-capture).** Add a small script + Git hook that detects when an error message changed in `compiler.js` or `validator.js` and drops a row tagged `compiler_error_change` with before/after text. Without this, the impact of our compiler work is invisible to the ledger.

3. **Run a baseline curriculum sweep.** ~30 minutes, ~$5. Captures the BEFORE state of compile-error friction. After the shell upgrade ships, re-run and diff. Without this, we ship a major upgrade with no measurable signal that it helped.

---

## Files + scripts referenced

- `playground/factor-db.sqlite` — the ledger
- `playground/factor-db.js` — read/write helpers
- `playground/supervisor/curriculum-sweep.js` — the harness that runs Meph through tasks
- `playground/supervisor/ebm-scorer.js` — the ranker that picks past examples
- `scripts/top-friction-errors.mjs` — the script that ranks worst error messages
- `playground/flywheel-beacons.jsonl` — orphaned runtime data (will move into ledger as part of pre-work)
- `plans/plan-compiler-flywheel-tier1-04-19-2026.md` — the existing tier-1 stub
- `RESEARCH.md` — the long-form architecture doc (deeper than this summary)

---

## When in doubt

If you're touching the compiler and wondering "should I be capturing data here?" — the answer is almost always yes. Every error message we change, every compile path we fix, every emit we improve = a permanent quality gain that should land in the ledger so it can be measured and credited.
