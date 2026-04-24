# Handoff — 2026-04-24 (Sessions 45 + 46 — ASH-1 complete AND Decidable Core landed)

## 🎯 Pickup: Two major chunks shipped today and just merged together

**Session 45 (main):** 8 feature/fix commits + ASH-1 A/B sweep completed.
**Session 46 (`feature/decidable-core`):** Total-by-default termination bounds + cross-target smoke + Python parity.
**Both now on `main` as of this merge.**

---

## 🔬 Session 45 — Browser Use's Bitter Lesson falsified on our stack

**50 trials, 116 min wall-clock, $0. Hypothesis rejected.**

| Task | tools_on | tools_off | Lift |
|------|----------|-----------|------|
| counter (L3) | **0/5 (0%)** | 4/5 (80%) | **−80 pp** |
| todo-crud (L4) | **0/5 (0%)** | 5/5 (100%) | **−100 pp** |
| auth-todo (L5) | 0/5 (0%) | 0/5 (0%) | 0 pp |
| contact-book (L6) | 5/5 (100%) | 5/5 (100%) | 0 pp |
| validated-forms (L7) | 5/5 (100%) | 5/5 (100%) | 0 pp |

**Counter + todo-crud regressed from majority-passing to 0%** when Bash/Read/Edit/Write were re-enabled. Built-ins added distraction, not capability on simple tasks. Full writeup in `RESEARCH.md` → "ASH-1 — Browser Use's Bitter Lesson, Falsified on Our Stack." Raw artifact: `playground/sessions/ab-ash1-sweep-2026-04-24T16-25-04.json`.

**ROADMAP consequence:**
- **ASH-2 (`meph_propose_tool` flywheel)** is the right shape — add MCP tools as gaps surface rather than replacing them with built-ins.
- **ASH-3 (prune wrappers once Bash wins)** DOWNGRADED. ASH-1 showed the wrappers earn their 28 tools.

Session 45 feature landings (all on main before the merge):
- Cookies (plain + signed) + `for N days/hours/minutes` maxAge shorthand
- Reactive `on scroll [every Nms]:` with leading-edge throttle
- Transaction synonyms: `atomically:` / `transaction:` / `begin transaction:`
- `upsert X to Y by <field>` — T2 #47
- `pick a, b from X` field projection — T2 #44
- Python `belongs to` JOIN emission — T2 #9
- Scheduled-task cancellation on SIGTERM/SIGINT — T2 #13
- Multipart/file upload middleware auto-wiring — T2 #15
- `table X:` shorthand (bare lead without `create a`)
- Auth-capability gate on mutation security check
- INTENT_HINTS for type keywords (`text`, `number`, `boolean`, `timestamp`)

---

## 🛡️ Session 46 — Decidable Core (Total by default)

Every construct that could previously hang silently now has a bound, and the bound applies on every compile target (Node / Cloudflare Workers / browser / Python) per the new PHILOSOPHY Rule 17.

**Runtime bounds**
- `while cond:` auto-caps at 100 iterations (tight — fail-fast on hallucinated hangs). Override with `while cond, max N times:`.
- Self-recursive functions auto-wrap in a depth counter (default 1000). Override with `, max depth N`.
- `send email` gets a 30-second default timeout. Override with `with timeout N seconds/minutes`.
- `ask claude` / `call api` runtime helpers retry on 429/5xx/network transient errors with 1s/2s/4s/8s exponential backoff across all 10 emission sites.

**Validator warnings W-T1/W-T2/W-T3** fire on naked forms, silence on explicit overrides.

**Cross-target infrastructure**
- `scripts/cross-target-smoke.mjs` — compiles 8 templates × 4 targets, syntax-checks every emission in ~10s. Surfaced 3 pre-existing Python-target bugs, all fixed in-branch.
- PHILOSOPHY Rules 17 + 18 codify the principles.

---

## Verification state (as of this merge)

- Merge landed with conflicts only in CHANGELOG.md and HANDOFF.md — both doc files, resolved by keeping both entry sets.
- Code auto-merged cleanly (parser.js, compiler.js, clear.test.js — different areas touched on each side).
- `node clear.test.js` — **2502 / 2502 green** after post-merge fixes (validator self-recursion check fixed + 9 tests with invalid syntax repaired).
- `node scripts/cross-target-smoke.mjs` — 32/32 emissions parse clean.
- Core templates — 8/8 compile clean.
- `playground/clear-compiler.min.js` — rebuilt post-merge.

---

## 📊 Phase 7 measurement — deterministic replay complete ($0)

Ran `node scripts/decidable-core-replay.mjs` against 1,390 Meph-written Clear sources in the Factor DB. Headline findings:

| Metric | Value | Reading |
|---|---|---|
| Factor DB rows analyzed | 1,390 | Every Meph output, ever |
| Rows with `while` loops | **0** | Bound is preventive — no historical use |
| Rows with `send email` | **0** | Same — zero historical use |
| Rows with self-recursive functions | **0** | Same — zero historical use |
| W-T1 / W-T2 / W-T3 warnings fired | **0 / 0 / 0** | Nothing in history would have triggered them |
| Rows with `ask claude` | **102 (7.3%)** | Every one now carries auto-retry on 429/5xx/network |
| Recompile-clean rate | 1005 / 1390 (72.3%) | 289 fail; top buckets are pre-existing syntax drift (save-literal check, unclosed `{`, time format `'02:00 AM'`), NOT decidable-core bounds |

**Verdict:** The paid A/B is a no-op. The deterministic replay already answers the hypothesis ("do the bounds reduce hang rate ≥50%?") with a useful null: the bounds cannot reduce a rate that was zero to begin with. **Paid budget ($10) preserved.** The one measurable signal-positive: 102 past Meph runs now carry retry logic; every future session's AI call is auto-recoverable.

See `RESEARCH.md` → "Phase 7 — decidable-core replay (1,390 rows)" for the full writeup.

---

## Immediate follow-ups (do now, in order)

1. **Rebuild the playground compiler bundle** — `npx esbuild index.js --bundle --format=esm --minify --outfile=playground/clear-compiler.min.js --platform=node`. Required after any compiler/parser change.
2. **Run `node clear.test.js`** — confirm the merge didn't silently break anything.
3. **Smoke-test all 8 core templates** — `node -e "import { compileProgram } from './index.js'; …"` (see CLAUDE.md "Template Smoke Test on New Syntax" for the one-liner).

## Three natural pickups after that

1. **Phase 7 measurement (budget-capped $10).** Replay past Factor DB failing transcripts through the new compiler + A/B on 5 curriculum tasks known to hit termination failures. Per the Session 41 rule — targeted replay, no full curriculum runs. Confirms or disproves the hypothesis that the bounds reduce hang rate ≥50%.
2. **Port `TEST_INTENT` to Python.** The Python `TEST_DEF` branch currently emits `pytest.skip("not yet ported")`. Port means writing `httpx`-shaped generators for `can user create / view / delete / …` mirroring the JS generator at `compiler.js:7094+`. ~200 lines.
3. **Wire cross-target smoke into the pre-push hook.** 5-line change in `.husky/pre-push` alongside `node clear.test.js`. Cheap insurance against future Python/Workers drift.

## Key files touched across both sessions

- `compiler.js` — cookies, scroll throttle, transactions, upsert, pick, Python JOINs, scheduled cancellation, multer wiring, retry backoff, termination bounds, Python-target fixes.
- `parser.js` — `table X:` shorthand, `on scroll every Nms`, transaction synonyms, upsert, pick, `for N days` maxAge, signed cookies, max-iterations / max-depth / with-timeout suffixes.
- `validator.js` — auth-capability gate, type-keyword INTENT_HINTS, validateTermination() + W-T1/W-T2/W-T3/W-T4.
- `clear.test.js` — new regression blocks for cookies, scroll, transactions, upsert, pick, multer, termination bounds, retry.
- `scripts/cross-target-smoke.mjs` — **new**, 157 lines, zero deps.
- `PHILOSOPHY.md`, `intent.md`, `SYNTAX.md`, `AI-INSTRUCTIONS.md`, `FAQ.md`, `ROADMAP.md`, `FEATURES.md`, `CHANGELOG.md`, `USER-GUIDE.md`, `playground/system-prompt.md` — synced.

## Session context (for the next pickup)

The original decidable-core plan was maximalist — validator warnings AND runtime bounds AND a `live:` effect-fence keyword (Path B). Factor DB reality check (1,599 Meph rows) showed `while`/`send email`/recursion have NEVER appeared in Meph output. That killed Path B and pivoted to Path A: 3 surgical rules + deterministic smoke script, which surfaced 3 real Python bugs we didn't know existed.

**Lesson locked into learnings.md:** audit before designing language-level change. "We need X" instinct rarely survives contact with actual codebase statistics.

Meanwhile Session 45's ASH-1 sweep falsified the "built-in tools beat custom wrappers" thesis in our setup. Wrappers earned their keep. The flywheel direction (ASH-2) is to GROW the MCP surface from observed gaps, not replace it.

Tree is green post-merge. Docs are synced.
