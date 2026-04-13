# Handoff — 2026-04-12 (Standard Chat)

## Current State
- **Branch:** `feature/standard-chat` (stashed — hacked approach thrown away)
- **Main is clean:** last merge `17e7b05` has working chat bubbles + markdown
- **Compiler tests:** 1776 passing, 0 failures
- **Store-ops demo:** compiles, runs, chat works via curl. Frontend has bugs.

## CRITICAL: Previous Approach Was Wrong

The previous attempt at Standard Chat HACKED IT. Inline JS strings pushed into
compiler output. No tests. No verification. Broken send button. This approach
violates every principle in PHILOSOPHY.md:
- **Fixes don't compound** — each app would need the same hacks
- **Not deterministic** — inline JS varies per context
- **Not tested** — no compiler tests for the chat component
- **Not 1:1** — the compiled output doesn't trace back to one Clear line

## The Right Approach

`display as chat` is a **compilation target**, like `display as table`. It needs
the same rigor:

### 1. Utility Functions (compiler.js UTILITY_FUNCTIONS)

The chat component's JS should be **utility functions** — tree-shaken, tested,
included only when the app uses `display as chat`:

| Utility | What it does |
|---------|-------------|
| `_chatMd(text)` | Full markdown → HTML renderer (port from Studio's `markdownToHtml`) |
| `_chatRender(el, messages, roleField, contentField)` | Renders messages into a container with proper bubbles |
| `_chatSend(url, field, msg, onDone)` | POST message, show optimistic user bubble + typing dots, call onDone when complete |
| `_chatClear(url, el)` | DELETE messages endpoint + clear container |

These are like `_clear_sum`, `_clear_avg`, `_askAI` — pure functions that the
compiler emits when needed. NOT inline string concatenation.

### 2. HTML Template (compiler.js HTML scaffold)

When `display as chat` is encountered in the HTML scaffold, emit a fixed HTML
structure. Same way `display as table` emits `<table>` with `<thead>/<tbody>`.

```html
<div class="clear-chat-wrap">
  <div class="clear-chat-head">
    <span>Chat</span>
    <button onclick="_chatClear(...)">New</button>
  </div>
  <div class="clear-chat-msgs" id="ID_chat"></div>
  <div class="clear-chat-typing" id="ID_typing">...</div>
  <button class="clear-scroll-btn" id="ID_scroll">↓</button>
  <div class="clear-chat-input">
    <textarea id="ID_input"></textarea>
    <button id="ID_send">Send</button>
  </div>
</div>
```

### 3. CSS (compiler.js CSS block)

One `<style>` block emitted when any chat display exists. Port from Studio's
`.msg`, `.msg.user`, `.msg.assistant` styles, adapted for DaisyUI theming.

### 4. Reactive Wiring (compiler.js reactive JS)

The reactive `_recompute()` calls `_chatRender()` to update the messages container.
The send button calls `_chatSend()`. Same pattern as table/cards rendering.

### 5. SSE Streaming (Phase 2 — COMPILER FEATURE)

NOT a frontend hack. The COMPILER detects:
- POST endpoint that calls an agent
- Agent response feeds a `display as chat` via state

And emits:
- SSE endpoint (Content-Type: text/event-stream) that streams tokens
- Frontend EventSource consumer that appends tokens to the assistant bubble

This is the same pattern as the existing STREAM node compilation. The compiler
already knows how to emit SSE endpoints — it just doesn't auto-detect the
chat→agent connection yet.

### 6. Tests First (TDD)

For EACH piece, write compiler tests FIRST:
- Test: `display X as chat` emits `<div class="clear-chat-wrap">` in HTML
- Test: `display X as chat` includes `_chatMd` utility in JS
- Test: `display X as chat` includes `_chatRender` utility in JS
- Test: `display X as chat` includes `_chatSend` wired to Send button
- Test: chat component has Enter-to-send on textarea
- Test: chat component has New button
- Test: chat component has scroll-to-bottom button
- Integration: store-ops compiles with 0 errors
- Integration: `node --check` passes on compiled output
- Integration: `clear test` passes on store-ops

### 7. Verify in Browser (GAN Frontend Directly)

After tests pass, compile store-ops, run it, navigate to it in Chrome:
- Screenshot the chat page
- Type a message, click Send
- Screenshot: user bubble appears immediately + typing dots
- Wait for response
- Screenshot: assistant bubble with markdown rendering
- Click New — messages clear
- Click Orders/Dashboard — navigation works

If ANY of these fail, the compiler has a bug. Fix the compiler, not the app.

## Design Decisions

- **No stream cursor `▌`** — Russell doesn't like it. Use only typing dots while waiting.
- **Scroll-to-bottom: circle with down arrow** — not text "↓ Latest"
- **Web search, memory, personality, API key** — optional flags, not standard. Will be `display as chat with web search, memory` syntax later.
- **"Make X standard"** — put it in the compiler so every app gets it for free.

## Files to Read

| File | Why |
|------|-----|
| `CLAUDE.md` | All rules including "Never Test By Hand" and "GAN Frontend Directly" |
| `PHILOSOPHY.md` | WHY the right approach matters — fixes compound, 1:1 mapping |
| `playground/ide.html` lines 195-216 | Studio chat CSS to port |
| `playground/ide.html` lines 1868-2009 | Studio `markdownToHtml()` to port |
| `playground/ide.html` lines 432-461 | Studio chat HTML structure |
| `compiler.js` lines 131-430 | UTILITY_FUNCTIONS pattern — add chat utils here |
| `compiler.js` lines 7274+ | Current `display as chat` HTML scaffold — replace |
| `compiler.js` lines 6130+ | Current chat reactive JS — replace |
| `apps/store-ops/main.clear` | The demo app — uses `display as chat` |
| `plans/plan-standard-chat-04-12-2026.md` | The plan (needs rewriting to match this approach) |

## Resume Prompt

```
Read HANDOFF.md then PHILOSOPHY.md then CLAUDE.md.

The task: make `display as chat` a proper compilation target.

The PREVIOUS approach was WRONG — inline JS string hacks. The RIGHT approach:
utility functions in UTILITY_FUNCTIONS (tree-shaken), fixed HTML template in
scaffold, CSS block, reactive wiring via _recompute. Same architecture as
display-as-table. Tests first. Verify in browser after.

Branch: feature/standard-chat (stash has the old hacked code — drop it)

Start with: git stash drop && rewrite plans/plan-standard-chat-04-12-2026.md
to match the approach in HANDOFF.md, then /pres it.

Gate: node clear.test.js (1776 passing), node --check on compiled output,
node cli/clear.js test apps/store-ops/main.clear (should pass).
```
