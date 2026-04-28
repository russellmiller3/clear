# Snap Layer — auto-fix Meph's broken Clear before user sees it

**One-line goal:** when Meph's chat turn ends with the source still failing `clear check`, automatically inject a "fix these errors first" follow-up turn (hidden from the user) and let Meph re-roll up to N times before the response surfaces. The user only ever sees clean Clear come out of the chat.

**Branch:** `feature/overnight-04-27-snap-layer`. Off `main`.

**Source of authority:** Russell's chat 2026-04-27 — the cheaper alternative to a full grammar-constrained model. CFG-equivalent UX (Meph appears never to ship broken Clear) at 5% of the implementation cost.

---

## Why this matters

Today's loop: Meph writes Clear, calls `compile`, sees errors with hint reranker fixes, often fixes them, sometimes calls it good with errors still on screen. The user sees the broken state. They hit Run, get a compile error, paste it back to Meph, and the round-trip burns a turn.

After this layer: Meph's last response is silently checked. If errors remain, an auto follow-up fires with the exact lines and a "fix these before stopping" instruction. Up to 3 retries. The user only sees the response after Meph has converged or hit the cap.

**Critical-path tie-in:** every Marcus session that hits a stale compile error costs trust. This layer is the cheapest way to prevent it. Lands before triggered-email primitive because it raises baseline quality across every session — including ones that exercise the email primitive.

---

## Mandatory Compiler Improvements

Per project CLAUDE.md "Improve The Compiler As You Go" — every snap-retry that fires is a gap in Meph's training signal. The cycles below also harvest these into the Factor DB:

| Gap exposed | Required compiler/system improvement | Test home |
|-------------|-----|-----------|
| Snap-retry fires on the same kind of error 3+ times in one session | Hint reranker should weight that error class higher next session | Cycle 4 (deferred — log only this round) |
| Snap-retry hits cap and ships errors to user | Compile-error message could be sharpened — log to friction analyzer | Cycle 4 |
| Meph emits valid syntax but wrong canonical form (e.g. `find` instead of `look up`) | Validator already warns; snap retry catches it | Cycle 1-2 |

---

## Verified Line Anchors

Verified 2026-04-27 against `playground/server.js`:

- `playground/server.js:3094` — outer iteration loop start (`for (let iter = 0; iter < MEPH_MAX_ITER; iter++)`)
- `playground/server.js:3301` — end-of-turn exit point (`if (toolUseBlocks.length === 0 || stopReason === 'end_turn')`)
- `playground/server.js:3304` — current `send({ type: 'done', ... })` and `res.end()` — wedge the snap retry just BEFORE this
- `playground/server.test.js` — existing `/api/chat` integration tests (search for `describe.*chat` for slot)

---

## Execution Rules

- **Plan quality bar:** the stupidest LLM that can follow instructions must execute this completely. Every cycle has exact test code, exact expected red, exact GREEN steps.
- **Branch rule:** `feature/overnight-04-27-snap-layer` from `main`. NOT a fresh branch per cycle — one branch carries all 4 cycles.
- **Each TDD cycle:** RED test first (run, see fail for the right reason) → GREEN implementation → ONE commit per cycle.
- **Compiler test gate:** `node clear.test.js` runs green at every commit.
- **Pre-push hook on merge to main:** runs Meph eval — DO NOT skip.

---

## TDD Cycles

### Cycle 1 — RED: snap layer detects errors at end_turn and injects synthetic retry message

**Test command:**
```
node playground/server.test.js --grep "Snap layer"
```

**Test home:** `playground/server.test.js` — append a new `describe('Snap layer', () => { ... })` block at the end.

**Test code** (Cycle 1):
```javascript
describe('Snap layer', () => {
  it('injects retry message when source has errors at end_turn', async () => {
    // Mock the Anthropic stream so the first turn ends with end_turn AND
    // the source has compile errors. Expect the handler to push a synthetic
    // user message into the messages array and start another iteration.
    const fakeAnthropic = mockAnthropicStream([
      { stop_reason: 'end_turn', text: "I think we're done." },
      { stop_reason: 'end_turn', text: 'Fixed.', toolUse: [{ name: 'edit_code', input: { action: 'write', code: 'when user requests data from /api/x:\n  send back []' } }] },
    ]);
    const broken = "create a Users tabel:\n  name"; // typo: 'tabel' → compile error
    const res = await postChat({
      messages: [{ role: 'user', content: 'build me an app' }],
      editorContent: broken,
      apiKey: 'test',
    }, fakeAnthropic);
    // We should see the retry message in the assistant trace
    expect(fakeAnthropic.callCount).toBeGreaterThan(1);
    expect(fakeAnthropic.calls[1].messages.some(m =>
      m.role === 'user' && /still has \d+ compile error/i.test(JSON.stringify(m.content))
    )).toBe(true);
  });
});
```

**Expected red:** the snap layer doesn't exist yet, so the second Anthropic call never happens — `callCount === 1`, test fails.

**GREEN implementation:**
1. In `/api/chat` handler scope, declare `let snapRetryCount = 0;` above the for loop.
2. Define `const SNAP_MAX_RETRIES = Number(process.env.SNAP_MAX_RETRIES) || 3;`.
3. Right before `_captureHintUsage('end_turn')` at line 3302:
   ```javascript
   if (currentErrors.length > 0 && snapRetryCount < SNAP_MAX_RETRIES && !process.env.SNAP_LAYER_OFF) {
     snapRetryCount++;
     messages.push({ role: 'assistant', content: assistantContent });
     const errorList = currentErrors.slice(0, 5).map(e => `  - line ${e.line || '?'}: ${e.message || e}`).join('\n');
     messages.push({
       role: 'user',
       content: `Wait — the source still has ${currentErrors.length} compile error${currentErrors.length === 1 ? '' : 's'}:\n${errorList}\n\nFix these before stopping. (snap-retry ${snapRetryCount}/${SNAP_MAX_RETRIES})`,
     });
     continue;
   }
   ```

**REFACTOR:** extract `formatSnapErrors(errors)` helper if the inline code is too dense.

**Commit:** `TDD cycle 1: snap layer auto-retries on end_turn with errors`

### Cycle 2 — RED: snap layer caps at 3 retries

**Test code:**
```javascript
it('stops retrying after SNAP_MAX_RETRIES and reports errors to user', async () => {
  // Anthropic mock keeps responding end_turn with NO fix every time.
  const fakeAnthropic = mockAnthropicStream(
    Array.from({ length: 5 }, () => ({ stop_reason: 'end_turn', text: 'still broken.' }))
  );
  const broken = "create a Users tabel:\n  name";
  const res = await postChat({
    messages: [{ role: 'user', content: 'build' }],
    editorContent: broken,
    apiKey: 'test',
  }, fakeAnthropic);
  // After 3 retries (4 total attempts: 1 initial + 3 retries), should stop
  expect(fakeAnthropic.callCount).toBeLessThanOrEqual(4);
  // The 'done' event was sent (response ended)
  expect(res.events.some(e => e.type === 'done')).toBe(true);
});
```

**Expected red:** without the cap check, this would loop forever (or hit the outer MEPH_MAX_ITER cap, but we want a tighter ceiling on snap-retries specifically).

**GREEN:** the `snapRetryCount < SNAP_MAX_RETRIES` check from Cycle 1 already covers this. Verify the test passes.

**Commit:** `TDD cycle 2: snap layer caps at 3 retries`

### Cycle 3 — RED: SNAP_LAYER_OFF env var disables the layer

**Test code:**
```javascript
it('SNAP_LAYER_OFF=1 disables snap layer entirely', async () => {
  const prevEnv = process.env.SNAP_LAYER_OFF;
  process.env.SNAP_LAYER_OFF = '1';
  try {
    const fakeAnthropic = mockAnthropicStream([
      { stop_reason: 'end_turn', text: 'done' },
    ]);
    const broken = "create a Users tabel:\n  name";
    await postChat({ messages: [{ role: 'user', content: 'build' }], editorContent: broken, apiKey: 'test' }, fakeAnthropic);
    expect(fakeAnthropic.callCount).toBe(1); // no retry
  } finally {
    if (prevEnv === undefined) delete process.env.SNAP_LAYER_OFF;
    else process.env.SNAP_LAYER_OFF = prevEnv;
  }
});
```

**Expected red:** if Cycle 1's guard doesn't include `!process.env.SNAP_LAYER_OFF`, this fails.

**GREEN:** the guard from Cycle 1 already includes the env check.

**Commit:** `TDD cycle 3: snap layer respects SNAP_LAYER_OFF env var`

### Cycle 4 — Telemetry: log snap-retries to Factor DB (DEFERRED)

> **Status:** deferred to a follow-up session. The wedge in /api/chat already
> calls `_factorDB.logEvent?.(...)` with optional chaining — when the method
> lands, telemetry starts flowing automatically. `console.log` lines give
> operational visibility in the meantime. The full Factor DB `factor_events`
> table + `logEvent` / `listEvents` methods are 30-60 minutes of focused work
> when needed for the friction analyzer.

**Test code (for the future):**
```javascript
it('records each snap retry as a Factor DB event', async () => {
  const broken = "create a Users tabel:\n  name";
  const fakeAnthropic = mockAnthropicStream([
    { stop_reason: 'end_turn', text: 'done' },
    { stop_reason: 'end_turn', text: 'fixed.', toolUse: [{ name: 'edit_code', input: { action: 'write', code: 'create a Users table:\n  name' } }] },
  ]);
  await postChat({ messages: [{ role: 'user', content: 'build' }], editorContent: broken, apiKey: 'test' }, fakeAnthropic);
  // Inspect the Factor DB for a snap_retry event
  const events = listFactorEvents({ kind: 'snap_retry' });
  expect(events.length).toBe(1);
  expect(events[0].error_count_at_retry).toBeGreaterThan(0);
});
```

**Expected red:** no snap_retry events recorded yet.

**GREEN:** add a `_factorDB?.logEvent({ kind: 'snap_retry', session_id: sessionId, error_count_at_retry: currentErrors.length, retry_index: snapRetryCount })` call inside the snap-retry branch. If `logEvent` doesn't exist on Factor DB, add the simplest possible append-only events table (`snap_events` with `kind, session_id, payload_json, ts`).

**Commit:** `TDD cycle 4: snap retries logged to Factor DB for friction analysis`

---

## Stop conditions (overall)

- All 4 TDD cycle tests green
- `node clear.test.js` green (no regressions)
- `node playground/server.test.js` green
- All 8 core templates compile clean
- Manual smoke: open Studio, ask Meph to "build a contacts CRUD," see no compile errors in the final state

---

## What this plan deliberately does NOT cover

- **Full grammar-constrained generation.** Deferred — needs a model swap to an open model that supports CFG-constrained sampling. Save for a research week post-Marcus-#1.
- **Auto-snap on tool-call output (e.g. `edit_code` returning broken code).** Today's plan only fires at end_turn. If a session ends with errors mid-loop, that's already caught by the existing compile-error hint flow.
- **Semantic correctness check.** Snap layer only handles syntax / compile errors. Semantic mistakes (wrong variable name, wrong canonical form when both forms parse) remain Meph's job to self-catch.

---

## Iteration handoff

- This plan was written autonomously during Russell's overnight /loop directive (2026-04-27 night).
- After Cycle 4 ships, next /loop iteration moves to **Codex stash cherry-pick** (UAT contract + browser-driven test generator from `git stash list` `stash@{0}`).
- After that: triggered email primitive (existing plan at `plans/plan-triggered-email-primitive-04-27-2026.md`).
- After that: CSV export primitive (existing plan at `plans/plan-csv-export-primitive-04-27-2026.md`).
