# Handoff — 2026-04-29 evening (post Studio polish + cc-agent hint pipeline closed)

## Where you are

- **Local branch:** `feature/cc-agent-hint-pipeline`. Three logical stretches bundled on this PR (8 commits ahead of main):
  1. Desktop launcher + crystal icon (`start-clear.bat`, `clear-icon.ico`, desktop shortcut)
  2. Studio polish (toolbar Dev | Builder switcher, line wrap in editor)
  3. Meph routing through Claude Code CLI (launcher sets `MEPH_BRAIN=cc-agent` + `GHOST_MEPH_CC_TOOLS=1`)
  4. cc-agent hint pipeline closed (cycles 1+2+4: helper extracted from compileTool, edit_code calls it + logs the Factor DB row first)
  5. Doc cascade — CHANGELOG, learnings.md, ROADMAP, plan + snapshot artifacts
- **Two other branches sit on origin awaiting your merge click** from earlier in the day:
  - `feature/desktop-launcher` (the launcher cherry-pick — superseded by the bigger PR above; can drop)
  - `feature/honest-flywheel-claim` (softens `landing/how-meph-learns.html` + `RESEARCH.md` to research-grade with current state callouts; independent change, worth keeping as its own PR)
- **The pre-existing `feature/cc-5b-dns-poller` branch** has 24 unmerged commits including the actual CC-5b TDD work (F1.1-F1.4 + doc cascade) and a bunch of general improvements from prior sessions. CC-5b is functionally done on that branch but never merged to main. Worth a clean merge before starting CC-5c.
- **Tests at end of stretch:** 2773 compiler + 289 meph-tools (was 277) — all green. UAT 52/52 across all 5 Marcus apps. 12 new tool tests cover the cc-agent hint pipeline.
- **Studio is currently running on PID 2168 (port 3456)** with `MEPH_BRAIN=cc-agent` + `GHOST_MEPH_CC_TOOLS=1` set. Meph chat works via Claude Code CLI without an Anthropic API key. Tool mode is mandatory on Windows (text mode loses a stdin race per a known cc-agent.js comment).

## Today's load-bearing finding

**The flywheel claim has been measured against an unreachable code path.** Diagnostic in `snapshots/flywheel-cc-agent-hint-gap-2026-04-29.md`: 386 cc-agent rows had `hint_applied=NULL` because edit_code's auto-compile bypassed `compileTool` (where the retrieval lived). All three honest 2026-04-29 sweeps (counter L3, approval-queue L7, kpi-dashboard L7) showed 0% / -20% / 0% lift because both conditions had zero hints. Cycles 1+2+4 of the hint pipeline plan close this — `attachHintsForCompileResult` is now called from BOTH compileTool and editCodeTool, and edit_code logs a Factor DB row first so post-turn HINT_APPLIED tracking points at the right row.

**Live verification deferred until May 1** — fresh A/B sweep on the same 3 tasks once the Anthropic cap clears. If hint_on > hint_off, the marketing copy I just softened on the honest-flywheel-claim PR can be re-strengthened with measured evidence.

## Next priorities

1. **Merge the three open PRs to main** (~15 min total). `feature/cc-agent-hint-pipeline` is the big one (8 commits, three logical stretches). `feature/honest-flywheel-claim` is independent and small (2 files, 13 lines). `feature/desktop-launcher` is superseded — close without merging. **Why for launch:** Studio's polish + cc-agent fix only benefit users when on main; right now they're branch-only.

2. **Merge `feature/cc-5b-dns-poller`** (the older 24-commit branch). CC-5b is done on it but never merged. Includes general improvements from prior sessions too. Safer to merge as-is since all 24 commits are real shipped work. **Why for launch:** CC-5b is what flips "Verifying DNS" to "Verified" — the attach UX needs it.

3. **CC-5c Fly cert provisioner** (~30 lines, BLOCKED on Russell providing a Fly API token). When a domain flips `verified`, call Fly's `/v1/apps/:app/certificates` API. **Why for launch:** customers' domains need to serve HTTPS, not just resolve.

4. **CC-3 Stripe webhook receiver** (~1 hr code, BLOCKED on Russell providing Stripe live keys). Wire production webhook URL; test in Stripe test mode until live keys land. **Why for launch:** customers can't pay until this AND live keys land.

5. **Fresh A/B hint sweep** (post May-1 API-cap reset, ~$5-7). Same 3 tasks the 2026-04-29 sweeps used. Measures whether cycles 2+4 actually deliver positive lift on Meph's pass rate. **Why for launch:** if positive, the flywheel claim can be re-strengthened with evidence; if negative, investigate hint quality / ranker (separate epic).

## Blocked on Russell (skip these, grab the next item)

- **Live email sending** — needs AgentMail or SendGrid key + "yes send real customer email"
- **Fly.io Trust Verified** — submit form, 1-2 day Fly review
- **Fly API token for CC-5c** — Russell generates and supplies
- **Stripe live keys** — gated on Trust Verified above
- **Stripe webhook URL** for CC-3 production
- **Anthropic API cap** — auto-resets May 1 OR raise the cap at `console.anthropic.com/settings/limits`
- **Postgres provision** (Fly Postgres or Neon) — ~30 min
- **First Marcus conversation**
- **PR merge clicks** for the three branches above

## Tested vs. assumed

- ✅ **Tested + saw work this stretch:** Meph chat via cc-agent returns plain text response (no 401); attachHintsForCompileResult fires when called via edit_code with full helpers + factorDB + errors; Factor DB row logs with correct session_id + task_type + compile_ok; lastFactorRowId mirrors logAction return; bare-compileProgram legacy shape preserves backward compat; UAT 52/52 across all 5 Marcus apps; line wrapping renders break-spaces in CodeMirror; toolbar mode-classic-btn has active-mode class with accent color.
- ⚠️ **Assumed worked (verification deferred):** cc-agent edit_code with hint_applied=1 actually firing on a real compile error in production (smoke-tested via unit tests with fake factorDB; needs a real Meph turn that hits a compile error AND has matching hint candidates in the corpus); fresh A/B sweep showing measured lift on the cycles 2+4 fix (gated on May-1 API cap).

## Session rules

Build priority queue from ROADMAP/RESEARCH/HANDOFF at session start, lead don't ask, big-picture beat on every reply, parallel-first tool calls, 10x-off time estimates, TDD red-first, **doc cascade at PHASE-end (not commit-end).** Hooks at `~/.claude/hooks/` enforce most of these — including stop-tell guards that catch "TL;DR" / "next session" / "stopping here" framing.

## Resume prompt (paste into fresh session)

> Read HANDOFF.md and start on item 1 — merge the three open PRs to main (the cc-agent-hint-pipeline branch is the big one). Apply the session rules in `~/.claude/CLAUDE.md`. Current main commit: `bb0abae`. Studio is running on port 3456 with MEPH_BRAIN=cc-agent — keep it running or restart via the desktop crystal icon.
