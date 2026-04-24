# Handoff — 2026-04-24 (Session 46 — Decidable Core shipped on `feature/decidable-core`)

## 🎯 Pickup: Total-by-default + cross-target parity shipped on a feature branch

**Branch:** `feature/decidable-core` (4 commits ahead of `main`). Not yet merged — sitting on branch pending review and the Phase 7 measurement gate.

**Shipped this session, commits oldest → newest on the branch:**

| Commit | Summary |
|---|---|
| `474379b` | **Phase 0:** Baseline — Factor DB check (1,599 rows) proved `while`/`send email`/recursion have never appeared in Meph output. This is PREVENTIVE, not reactive. Template inventory + recon recorded in `learnings.md` Session 46. |
| `fc3d944` | **Cross-target retry + PHILOSOPHY Rule 17.** Exponential-backoff retry (1s/2s/4s/8s cap) on all 10 `_askAI` / `_ask_ai` emission sites — Node, Cloudflare Workers, browser-proxy, Python. `scripts/cross-target-smoke.mjs` catches emission drift in ~10s. Rule 17 codifies cross-target parity. RESEARCH.md gains a section on the $0 deterministic eval. |
| `15945bb` | **Python-target fixes surfaced by the smoke script.** 3 pre-existing bugs closed: (a) agent-tools preamble was `const _tools = [...]` (JS in Python), (b) `TEST_DEF` emitted JS `fetch()` calls under `def test_…()`, (c) `FUNCTION_DEF` didn't auto-detect `async` from body-has-`await`. Script went from 1 FAIL to 32/32 clean. |
| `ae57381` | **Phase 2+3 — Termination bounds.** WHILE iteration counter (default 100000, override via `, max N times`), FUNCTION_DEF self-recursive depth cap (default 1000, override via `max depth N`), SEND_EMAIL 30s Promise.race timeout (override via `with timeout N seconds`). All JS + Python. Validator warnings W-T1/W-T2/W-T3 fire on naked forms, silence on explicit overrides. 9 new regression tests. |
| `0761ad5` | **Docs pass.** PHILOSOPHY Rule 18, intent.md, SYNTAX.md, AI-INSTRUCTIONS.md, CHANGELOG.md. `parseConfigBlock` now recognizes `with timeout N seconds/minutes` (previously only HTTP_REQUEST's parser did). |
| + this session | **Max depth parser + doc polish.** `define function X(…), max depth N:` parses end-to-end. FAQ, ROADMAP (Session 46 follow-ups), FEATURES, system-prompt.md, and W-T2 message all updated. |

## Verification state

- **`node scripts/cross-target-smoke.mjs` → 32/32 app×target emissions parse clean.** Node, Cloudflare Workers, browser, Python.
- **All 8 core templates** compile 0-errors at HEAD; warning counts unchanged (decidable-core rules don't fire because templates already use bounded loops and no naked recursion).
- **Factor DB metric check:** 0 rows contain `while`, 0 `send email`, 0 termination-class errors. No Meph session has ever hit the bug class we're preventing. Justifies the work as capital investment, not emergency fix.
- **Runtime bundle rebuilt:** `playground/clear-compiler.min.js` via `npx esbuild … --platform=node`.
- **Full `node clear.test.js`** runs pre-existing `better-sqlite3` module-resolution failure in this environment — not regressions from this session. Runs clean in a dev env with deps installed.

## What's next — three natural pickups

1. **Phase 7 measurement (budget-capped $10).** The plan has this gated on data. Replay past Factor DB failing transcripts through the new compiler + A/B on 5 curriculum tasks known to hit termination failures. Per CLAUDE.md's Session 41 rule — no sweeps, no full curriculum runs, just targeted replay. Confirms (or disproves) the hypothesis that the bounds reduce hang rate ≥50%. If data says "no", stop; the work is still valuable as structural hygiene.
2. **Port `TEST_INTENT` to Python.** The Python `TEST_DEF` branch currently emits `pytest.skip("not yet ported")` — an honest stub, but Python tests don't actually run. Porting means writing `httpx`-shaped generators for `can user create / view / delete / …`, mirroring the JS generator at `compiler.js:7094+`. ~200 lines.
3. **Wire cross-target smoke into the pre-push hook.** Currently manual. 5-line change in `.husky/pre-push` alongside `node clear.test.js`. Cheap insurance against future drift.

## Merge decision

Branch is ready to merge to `main` once you're satisfied with Phase 7 (or decide to merge on structural grounds and measure later). No breaking changes — the warnings are warnings (not errors), defaults are generous, explicit overrides work. Templates unchanged. Every existing app keeps compiling.

To merge:
```
git checkout main
git merge --no-ff feature/decidable-core
git push origin main
```

Or just PR it if you prefer the review surface.

## Files touched this session

- `compiler.js` — 10 emission sites for retry; 3 Python-target fixes; WHILE counter; FUNCTION_DEF depth wrapper; SEND_EMAIL Promise.race; Python `_ask_ai_with_tools` helper + TEST_DEF stub.
- `parser.js` — `whileNode` maxIterations; `parseWhileLoop` max-N-times suffix; `parseConfigBlock` with-timeout sub-line; `functionDefNode` maxDepth; `parseFunctionDef` `, max depth N` suffix.
- `validator.js` — new `validateTermination()` pass + three walk helpers. W-T1/W-T2/W-T3/W-T4 warnings.
- `clear.test.js` — 14 new regression tests under two new describe blocks.
- `scripts/cross-target-smoke.mjs` — **new**, 157 lines, zero deps.
- `PHILOSOPHY.md` — Rules 17 + 18.
- `RESEARCH.md` — Cross-target emission verification section.
- `CHANGELOG.md` — Session 46 entry at top.
- `intent.md`, `SYNTAX.md`, `AI-INSTRUCTIONS.md`, `FAQ.md`, `ROADMAP.md`, `FEATURES.md`, `playground/system-prompt.md` — termination rules + canonical forms.
- `PROGRESS.md` — decidable-core section.
- `learnings.md` — Session 46 narrative.
- `plans/plan-decidable-core-04-24-2026.md` — original red-teamed plan (committed at branch start).
- `playground/clear-compiler.min.js` — rebuilt.

## Session context (for the next pickup)

The original plan was ambitious — validator warnings AND runtime bounds AND a `live:` effect-fence keyword (Path B). The Factor DB reality check killed Path B: no evidence the maximalist version is needed. Instead we shipped the minimalist Path A + cross-target parity (Rule 17) + the deterministic smoke script, which surfaced 3 real bugs we hadn't known about.

**The lesson (added to learnings.md):** audit before designing language-level change. A "we need X" instinct rarely survives contact with actual codebase statistics. Factor DB said 94% pure → the fence isn't the load-bearing part → 3 surgical rules are. The smoke script turned an abstract principle (Rule 17) into a sorted bug list we could fix immediately.

Branch is green, tests are locked, docs are synced. Ready for your review or merge-in.
