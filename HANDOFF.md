# Handoff — 2026-04-12 (Agent Harness)

## Current State
- **Branch:** `feature/agent-harness`
- **Last commit:** `1b01b0e feat: compiler emits frontend element tests + clear test CLI fix`
- **Compiler tests:** 1762 (0 failures)
- **Working tree:** Dirty — template .clear files, SYNTAX.md, skill files uncommitted

## What Was Done This Session

- **Agent harness**: classify intent (already existed — undocumented), extended RAG (URLs/PDFs/DOCX), send email to X, scheduled agents at cron times, find all/today/multi-context ask ai. Store-ops 230-line demo compiles and runs with real AI.
- **Documentation audit**: found 5 undocumented node types. Rewrote ROADMAP.md from scratch. Added mandatory doc enforcement rules to ship skill, write-plan skill, CLAUDE.md.
- **Compiler bug fixes**: parentheses in skill instructions (regex → paren-counting), test block server crash (typeof guard), async test callbacks, link href, model ID.
- **Testing infrastructure**: compiler emits frontend element tests. `clear test` CLI extracts user-written test blocks. 3 real bugs found by generated tests.

## What's In Progress

**3 failing `clear test` tests** for store-ops:
1. `response is not defined` — mock AI doesn't mock `_classifyIntent` (runs before `_askAIWithTools`)
2. Same for second agent test
3. `length is not defined` — `expect length of result` compiles to `expect(length)` not `expect(result.length)`

## Key Decisions

1. **No batteries system** — SERVICE_CALL already does Stripe/SendGrid/Twilio via fetch()
2. **14-year-old = readability bar, not capability bar** — Clear needs full language features (throw, finally, first-class functions, decorators) because LLMs need them
3. **Never Test By Hand** — if you'd click a button in Chrome, the compiler is missing a test
4. **`/* */` for diagrams** — `#` comments pollute Studio TOC
5. **No self-assignment** — `subject is subject` banned, use different arg names

## Next Steps

1. Fix 3 failing `clear test` bugs (mock classify, length-of, link href paths)
2. Make `clear test` also run auto-generated e2e tests from `result.tests`
3. **Studio Test button** — add "Test" button to IDE toolbar that runs `clear test` on current app, shows pass/fail + errors in Terminal tab. Meph sees results via tool too. (ROADMAP P6)
4. Language completeness: `send error`, `finally`, first-class functions, decorators
5. Convert template diagrams from `#` to `/* */`
6. GAN the store-ops frontend (dashboard OUTPUT placeholders, chat card grid → thread)

## Resume Prompt

```
Read HANDOFF.md and continue from where we left off.

Branch: feature/agent-harness. 1762 compiler tests passing.

Fix the 3 failing clear test bugs for apps/store-ops/main.clear:
1. Mock _classifyIntent in agent test blocks (compiler.js ~line 4186)
2. Fix length-of in EXPECT context (compiles to expect(length) instead of expect(X.length))
3. Fix link href # prefix in all 4 rendering paths (compiler.js lines 7415-7421)

Run: node cli/clear.js test apps/store-ops/main.clear
Gate: node clear.test.js (1762 passing, 0 failures)

After tests pass: language completeness per ROADMAP.md P1-P4.
```
