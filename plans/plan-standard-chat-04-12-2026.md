# Plan: Standard Chat — Proper Compilation Target

**Date:** 2026-04-12
**Branch:** `feature/standard-chat`
**Status:** Red-teamed and patched (2 P0s, 6 P1s resolved)

## Problem

`display X as chat` currently inlines ~30 lines of JS string concatenation directly into `_recompute()` with a minimal markdown renderer (bold, italic, inline code, newlines). No utility functions, no tests, no proper HTML structure. Every app that uses chat gets a different copy of the same hacky inline code. Fixes don't compound. Violations: no 1:1 mapping, not tree-shaken, not tested, not deterministic.

## Solution

Make `display as chat` a proper compilation target — same architecture as `display as table`. Four pieces:

1. **Utility functions** in `UTILITY_FUNCTIONS` (tree-shaken, tested, emitted only when needed)
2. **Fixed HTML template** in the scaffold (like table emits `<table>`)
3. **CSS block** emitted once when any chat display exists
4. **Reactive wiring** via `_recompute()` calling the utility functions

## Architecture Reference

`display as table` (the pattern we're following):
- **HTML scaffold** (line 7250): emits `<div><table><thead><tbody>` structure
- **Reactive JS** (line 6027): `_recompute()` populates table via DOM manipulation
- **No utility functions** (table inlines everything — we'll do better for chat)

`UTILITY_FUNCTIONS` (line 131): array of `{ name, code, deps }` objects. The compiler tree-shakes at line 468: scans `compiledCode.includes(util.name + '(')` against `bodyLines.join('\n')`. **Critical: utility calls MUST be in reactive JS (bodyLines), NOT inline onclick in HTML scaffold.** The tree-shaker only scans bodyLines.

## Design Decisions (from previous session + red-team)

- **No stream cursor `|`** — Russell doesn't like it. Use typing dots only.
- **Scroll-to-bottom: circle with down arrow** — not text "Latest"
- **Markdown: port from Studio's `markdownToHtml()`** — handles code blocks, tables, lists, headings, inline formatting. Skip SVG rendering entirely (don't surgically remove — just port renderInline + renderText + fenced code block extraction only).
- **Enter to send** — textarea submits on Enter, Shift+Enter for newline
- **New button** — clears messages (DELETEs via API if endpoint exists, or just clears DOM)
- **CSS variables: DaisyUI v5 names** — `--color-primary`, `--color-primary-content`, `--color-base-100`, `--color-base-200`, `--color-base-content`. NOT the v4 shorthands (`--p`, `--pc`, `--b1`, etc.).
- **All utility calls in reactive JS** — no inline `onclick` calling utilities. HTML has plain handlers that delegate to locally-emitted wrappers in bodyLines.
- **Fallback values** — `_chatRender` uses `msg[roleField] || 'user'` and `msg[contentField] || ''` for missing fields.

## Red-Team Fixes Applied

| Issue | Severity | Fix |
|-------|----------|-----|
| CSS variable names are DaisyUI v4, not v5 | P0 | Changed all to `--color-*` format |
| Tree-shaking misses utilities in inline onclick | P0 | All utility calls go in bodyLines, not HTML |
| `_chatMd` too large for single-line code string | P1 | Use backtick template literal, split into sub-functions |
| Phase 6 fold detection is undefined | P1 | Defined: peek ahead in same body array at same nesting level |
| `_chatSend` POST field name mapping unclear | P1 | Field name from SEND_TO_API node's variable name |
| No empty state test | P1 | Added T12b |
| `_chatSend` reimplements fetch | P1 | Chat Send executes same compiled button handler code |
| Scroll button `position: absolute` without relative parent | P1 | Added `position: relative` to `.clear-chat-wrap` |

## Phases

### Phase 1: Utility Functions (TDD)
**Files:** `compiler.js` (UTILITY_FUNCTIONS section), `clear.test.js`

Add utility functions to `UTILITY_FUNCTIONS`. Use backtick template literals for multi-line code (precedent: `_toast` at line 157).

First, check if `_esc` exists as a utility. If not, add it — the chat utilities depend on it.

#### `_chatMdInline(s)`
Inline markdown renderer. Handles: **bold**, *italic*, `code`. Returns HTML-escaped text with inline formatting.
```js
function _chatMdInline(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}
```
Deps: `[]`

#### `_chatMdBlock(s)`
Block-level markdown renderer. Handles headings, lists (ul + ol), tables, paragraphs, blank lines. Calls `_chatMdInline` for inline content within blocks.
Deps: `['_chatMdInline']`

#### `_chatMd(text)`
Full markdown-to-HTML renderer. Extracts fenced code blocks first (```lang ... ```), then runs `_chatMdBlock` on text parts, renders code blocks with escaped pre blocks.
Deps: `['_chatMdInline', '_chatMdBlock']`

#### `_chatRender(el, messages, roleField, contentField)`
Renders an array of message objects into a container element with proper chat bubbles.
- Each message: `role = msg[roleField] || 'user'`, `content = msg[contentField] || ''`
- User messages: `_chatMdInline(content)` (no block formatting)
- Assistant messages: `_chatMd(content)` (full markdown)
- Role-based CSS classes: `.clear-chat-msg.user` / `.clear-chat-msg.assistant`
- Labels: "You" / "Assistant"
- Auto-scrolls to bottom after render
- Empty state: shows "No messages yet" placeholder when array is empty or falsy

Deps: `['_chatMd', '_chatMdInline']`

#### `_chatSend(inputId, msgsId, typingId, url, field, onDone)`
Handles the send flow. Note: takes `typingId` as explicit parameter (not derived from convention).
- Reads value from textarea by inputId
- Returns early if empty (trimmed)
- Clears the textarea immediately
- Appends optimistic user bubble to msgs container (using `_chatMdInline`)
- Shows typing indicator by setting `display:flex` on typingId element
- POSTs `{ [field]: message }` to the URL via fetch
- On response: hides typing indicator, calls `onDone()` (triggers _recompute)
- On error: hides typing indicator, shows error toast if `_toast` available
- Scrolls to bottom throughout

Deps: `['_chatMdInline']`

#### `_chatClear(url, msgsId)`
Clears chat:
- If URL provided: sends DELETE request, then clears container
- If no URL: just clears the container
- Shows "No messages yet" placeholder

Deps: `[]`

**Tests to write FIRST:**
```
T1: _chatMdInline renders **bold** as <strong>
T2: _chatMdInline renders *italic* as <em>
T3: _chatMdInline renders `code` as <code>
T4: _chatMdInline escapes HTML
T5: _chatMd renders fenced code blocks with escaped content
T6: _chatMdBlock renders headings
T7: _chatMdBlock renders unordered lists
T8: _chatMdBlock renders ordered lists
T9: _chatMdBlock renders tables
T10: _chatRender utility is included when app uses display-as-chat
T11: _chatSend utility is included when app uses display-as-chat
T12: _chatMd utility is included when app uses display-as-chat
T12b: _chatRender shows empty placeholder when messages array is empty
```

**Gate:** `node clear.test.js` — all existing tests pass + new tests pass

### Phase 2: HTML Template
**Files:** `compiler.js` (buildHTML / scaffold section)

Replace the current chat scaffold (lines 7274-7284) with a proper component structure. **No inline onclick calling utility functions** — HTML uses simple inline handlers for non-utility-dependent actions (scroll), and the reactive JS section wires the rest.

```html
<div class="clear-chat-wrap" id="ID">
  <div class="clear-chat-head">
    <span class="clear-chat-title">LABEL</span>
    <button class="clear-chat-new" id="ID_new">New</button>
  </div>
  <div class="clear-chat-msgs" id="ID_msgs"></div>
  <div class="clear-chat-typing" id="ID_typing" style="display:none">
    <div class="clear-typing-dot"></div>
    <div class="clear-typing-dot"></div>
    <div class="clear-typing-dot"></div>
  </div>
  <button class="clear-chat-scroll" id="ID_scroll" style="display:none">&#8595;</button>
  <div class="clear-chat-input">
    <textarea id="ID_input" placeholder="Type a message..." rows="1"></textarea>
    <button id="ID_send" class="clear-chat-send-btn">Send</button>
  </div>
</div>
```

All buttons get IDs. Event listeners are wired in Phase 4 (reactive JS section), where tree-shaking can find utility function references.

**Tests:**
```
T13: display X as chat emits clear-chat-wrap container
T14: display X as chat emits textarea with ID_input
T15: display X as chat emits Send button with ID_send
T16: display X as chat emits messages container with ID_msgs
T17: display X as chat emits typing indicator with ID_typing
T18: display X as chat emits New button with ID_new
T19: display X as chat emits scroll-to-bottom button with ID_scroll
```

**Gate:** `node clear.test.js` passes

### Phase 3: CSS Block
**Files:** `compiler.js` (CSS emission section in buildHTML)

Emit a single `<style>` block when any page has a `display as chat` node. **Uses DaisyUI v5 variable names** (`--color-*` format, not v4 shorthands).

```css
.clear-chat-wrap { display: flex; flex-direction: column; height: 100%; min-height: 400px; position: relative; border: 1px solid oklch(var(--color-base-content) / 0.15); border-radius: 1rem; overflow: hidden; background: oklch(var(--color-base-100)); }
.clear-chat-head { padding: 12px 16px; border-bottom: 1px solid oklch(var(--color-base-content) / 0.1); display: flex; align-items: center; justify-content: space-between; }
.clear-chat-title { font-size: 13px; font-weight: 600; color: oklch(var(--color-base-content) / 0.6); }
.clear-chat-new { font-size: 11px; padding: 2px 10px; border-radius: 6px; border: 1px solid oklch(var(--color-base-content) / 0.15); background: transparent; color: oklch(var(--color-base-content) / 0.5); cursor: pointer; }
.clear-chat-new:hover { background: oklch(var(--color-base-content) / 0.05); }
.clear-chat-msgs { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.clear-chat-msg { padding: 10px 14px; border-radius: 12px; font-size: 14.5px; line-height: 1.6; max-width: 50ch; white-space: pre-wrap; word-wrap: break-word; animation: _clearMsgIn 0.2s ease; }
@keyframes _clearMsgIn { from { opacity: 0; transform: translateY(6px); } }
.clear-chat-msg.user { background: oklch(var(--color-primary)); color: oklch(var(--color-primary-content)); align-self: flex-end; border-bottom-right-radius: 4px; }
.clear-chat-msg.assistant { background: oklch(var(--color-base-200)); color: oklch(var(--color-base-content)); align-self: flex-start; border: 1px solid oklch(var(--color-base-content) / 0.1); border-bottom-left-radius: 4px; }
.clear-chat-msg-label { font-size: 11px; opacity: 0.5; margin-bottom: 2px; }
.clear-chat-msg pre { background: oklch(var(--color-base-100)); padding: 10px 12px; border-radius: 6px; margin: 8px 0; font-size: 12px; line-height: 1.5; overflow-x: auto; border: 1px solid oklch(var(--color-base-content) / 0.1); white-space: pre-wrap; }
.clear-chat-msg code { background: oklch(var(--color-base-100)); padding: 1px 5px; border-radius: 3px; font-size: 12px; }
.clear-chat-msg pre code { background: none; padding: 0; border: none; }
.clear-chat-msg table { border-collapse: collapse; margin: 8px 0; font-size: 12px; width: 100%; }
.clear-chat-msg th, .clear-chat-msg td { border: 1px solid oklch(var(--color-base-content) / 0.15); padding: 5px 10px; text-align: left; }
.clear-chat-msg th { background: oklch(var(--color-base-200)); font-weight: 600; }
.clear-chat-typing { display: none; gap: 4px; padding: 0 20px 8px; align-self: flex-start; }
.clear-typing-dot { width: 8px; height: 8px; border-radius: 50%; background: oklch(var(--color-base-content) / 0.3); animation: _clearDot 1.4s infinite ease-in-out; }
.clear-typing-dot:nth-child(2) { animation-delay: 0.2s; }
.clear-typing-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes _clearDot { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; } 40% { transform: scale(1); opacity: 1; } }
.clear-chat-scroll { position: absolute; bottom: 70px; right: 20px; width: 36px; height: 36px; border-radius: 50%; border: 1px solid oklch(var(--color-base-content) / 0.15); background: oklch(var(--color-base-100)); color: oklch(var(--color-base-content) / 0.6); cursor: pointer; font-size: 16px; display: none; align-items: center; justify-content: center; box-shadow: 0 2px 8px oklch(0 0 0 / 0.1); z-index: 10; }
.clear-chat-input { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid oklch(var(--color-base-content) / 0.1); background: oklch(var(--color-base-200)); }
.clear-chat-input textarea { flex: 1; resize: none; border: 1px solid oklch(var(--color-base-content) / 0.15); border-radius: 8px; padding: 8px 12px; font-size: 14px; background: oklch(var(--color-base-100)); color: oklch(var(--color-base-content)); outline: none; }
.clear-chat-input textarea:focus { border-color: oklch(var(--color-primary) / 0.5); }
.clear-chat-send-btn { padding: 8px 16px; border-radius: 8px; border: none; background: oklch(var(--color-primary)); color: oklch(var(--color-primary-content)); font-weight: 600; font-size: 14px; cursor: pointer; }
.clear-chat-send-btn:hover { opacity: 0.9; }
```

Note: `.clear-chat-wrap` has `position: relative` so the absolute-positioned scroll button anchors correctly.

**Tests:**
```
T20: display-as-chat emits <style> block with clear-chat classes
T21: chat CSS references --color-primary (DaisyUI v5 variable names)
T22: chat CSS includes typing dot animation keyframes
```

**Gate:** `node clear.test.js` passes

### Phase 4: Reactive Wiring
**Files:** `compiler.js` (reactive JS section, around line 6130)

Replace the current inline chat rendering (lines 6130-6161) with calls to utility functions. **All utility calls go in bodyLines** so tree-shaking detects them.

In `_recompute()`:
```js
_chatRender(
  document.getElementById('ID_msgs'),
  STATE_VAR,
  'role',
  'content'
);
```

After `_recompute()` definition, emit event listeners in bodyLines:
```js
// New button
document.getElementById('ID_new').addEventListener('click', function() {
  _chatClear('DELETE_URL_OR_NULL', 'ID_msgs');
});

// Send button — executes same actions as the compiled button handler
document.getElementById('ID_send').addEventListener('click', function() {
  _chatSend('ID_input', 'ID_msgs', 'ID_typing', '/api/chat', 'user_message', function() {
    // Re-fetch data + _recompute — same as compiled button handler
  });
});

// Enter to send
document.getElementById('ID_input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('ID_send').click();
  }
});

// Scroll-to-bottom visibility
(function() {
  var _msgsEl = document.getElementById('ID_msgs');
  var _scrollBtn = document.getElementById('ID_scroll');
  if (_msgsEl && _scrollBtn) {
    _msgsEl.addEventListener('scroll', function() {
      var atBottom = _msgsEl.scrollTop + _msgsEl.clientHeight >= _msgsEl.scrollHeight - 100;
      _scrollBtn.style.display = atBottom ? 'none' : 'flex';
    });
    _scrollBtn.addEventListener('click', function() {
      _msgsEl.scrollTo({ top: _msgsEl.scrollHeight, behavior: 'smooth' });
    });
  }
})();
```

**Key insight (P1-5 fix):** The chat component's Send button should execute the SAME compiled code as the Clear-level `button 'Send':` block. In Phase 4, we wire it to `_chatSend` which handles the optimistic UI + fetch. The `onDone` callback is the same re-fetch + `_recompute` logic the compiled button handler would do. This avoids reimplementing fetch — the `_chatSend` utility does one specific thing (optimistic send UI) and delegates the data refresh to the callback.

**POST field name (P1-3 fix):** The field name comes from the `SEND_TO_API` node's variable name (e.g., `send user_message to '/api/chat'` → field is `'user_message'`). The compiler reads this from the button's body AST.

**Tests:**
```
T23: _recompute calls _chatRender (not inline HTML generation)
T24: compiled output includes _chatMd, _chatRender, _chatSend utility functions
T25: chat textarea has Enter-to-send keydown listener
T26: chat New button has click listener calling _chatClear
T27: chat scroll button has visibility toggle on scroll event
```

**Gate:** `node clear.test.js` passes

### Phase 5: Integration & Browser Verification
**Files:** `apps/store-ops/main.clear`

1. Compile store-ops: `node cli/clear.js build apps/store-ops/main.clear`
2. Syntax-check: `node --check` on compiled server.js
3. Run app tests: `node cli/clear.js test apps/store-ops/main.clear`
4. Start server, navigate to chat page in browser
5. Screenshot: chat component renders with proper structure
6. Type message, click Send: user bubble appears + typing dots
7. Screenshot: assistant response with markdown rendering
8. Click New: messages clear
9. Navigate to Orders/Dashboard: other pages still work

**Gate:** All screenshots show working UI. No console errors. All tests pass.

### Phase 6: Fold Input+Button into Chat Component
**Files:** `compiler.js` (scaffold + reactive JS)

**Detection (P1-2 fix):** During reactive JS compilation, when processing a DISPLAY node with `format === 'chat'`, peek ahead in the SAME body array (same nesting level) for the next 2 sibling nodes. If they match the pattern:
1. Next sibling is ASK_FOR (text input)
2. Sibling after that is BUTTON with body containing SEND_TO_API

...then mark those nodes as "absorbed by chat" (set a flag like `node._chatAbsorbed = true`). The scaffold and reactive JS skip absorbed nodes. The chat component's Send button executes the absorbed button's compiled action code.

**Limitation:** The input and button MUST be at the same nesting level as the display, immediately following it. Nodes nested deeper in sections won't be detected.

**Tests:**
```
T28: display-as-chat followed by input+button suppresses standalone input HTML
T29: display-as-chat followed by input+button suppresses standalone button HTML
T30: chat component's Send executes the absorbed button's action code
T31: store-ops compiles with single chat UI (no duplicate input/button)
T32: non-chat displays still emit standalone input+button normally
```

**Gate:** `node clear.test.js` passes. Browser shows single unified chat component.

## File Change Summary

| File | Changes |
|------|---------|
| `compiler.js` | Add 6 utility functions to UTILITY_FUNCTIONS (_chatMdInline, _chatMdBlock, _chatMd, _chatRender, _chatSend, _chatClear). Replace chat HTML scaffold. Add chat CSS emission. Replace inline chat reactive JS with utility calls. Add event listener wiring. Add input+button folding logic. |
| `clear.test.js` | Add ~32 new tests (T1-T32) |
| `apps/store-ops/main.clear` | No changes needed — the compiler handles it |

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Utility function size (_chatMd is ~80 lines as backtick string) | Low | Tree-shaken — only apps using chat include it. Precedent: _toast is ~20 lines. |
| DaisyUI v5 oklch() syntax | Resolved | Using confirmed v5 variable names from compiler's own theme definitions |
| Input+button folding detects wrong pattern | Low | Conservative: only same-level adjacent siblings. Document limitation. |
| Scroll-to-bottom button positioning | Resolved | `.clear-chat-wrap` has `position: relative` |
| _esc utility dependency | Low | Check first — may already exist. If not, add as simple HTML escaper. |
| _chatSend error handling | Low | Shows toast on error if _toast available, fails silently otherwise |
