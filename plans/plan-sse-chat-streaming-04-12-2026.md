# Plan: SSE Streaming for Chat

**Date:** 2026-04-12
**Branch:** `feature/sse-chat-streaming`
**Depends on:** Standard Chat (shipped)
**Status:** Red-teamed and patched (2 P0s, 2 P1s resolved)

## Problem

When a chat app calls a streaming agent, two things break:

1. **Backend:** The POST endpoint compiles `let result = await agent_fn(msg)` — but the agent is an `async function*` (generator). `await` on a generator returns the generator object, not the text. The endpoint needs to iterate the generator and write SSE events.

2. **Frontend:** `_chatSend` does `fetch().then(r.json())` — it can't consume a streaming response. The chat component needs a streaming variant that reads the response body as a stream and appends tokens to the assistant bubble in real-time.

## What Already Works

The compiler already has all the pieces — they just aren't connected:

| Piece | Status | Where |
|-------|--------|-------|
| `_askAIStream` utility | Working | compiler.js:396-426, yields text chunks |
| Agent streaming detection | Working | compiler.js:2379-2404, `shouldStream` logic |
| Agent → generator conversion | Working | compiler.js:2427-2443, replaces `_askAI` → `_askAIStream`, converts `return` → `for await...yield` |
| `async function*` emission | Working | compiler.js:2713, emits `*` for streaming agents |
| SSE headers pattern | Working | compiler.js:4508-4516, STREAM_AI node type |
| Chat component HTML | Working | Just shipped — scaffold, CSS, utility functions |

## What's Missing

| Gap | Fix |
|-----|-----|
| Endpoint `await`s generator instead of iterating it | Detect streaming agent in endpoint compilation, emit SSE iteration |
| No `_chatSendStream` utility | Add streaming fetch variant that reads response body |
| Chat wiring always uses `_chatSend` | Detect streaming and use `_chatSendStream` instead |
| No way for frontend to know if endpoint streams | Compiler tracks this and emits the right utility call |

## Solution Architecture

```
BACKEND:                              FRONTEND:
                                      
POST /api/chat                        _chatSendStream()
  │                                     │
  ├─ Save user message to DB            ├─ POST /api/chat (with body)
  │                                     │
  ├─ Set SSE headers                    ├─ Read response.body stream
  │                                     │
  ├─ for await (chunk of agent*(msg))   ├─ Parse SSE events: data: {"text":"..."}
  │   └─ res.write(SSE event)           │   └─ Append text to assistant bubble
  │                                     │
  ├─ Save full response to DB           ├─ On stream end:
  │                                     │   └─ Call onDone() → re-fetch + _recompute
  └─ res.end()                          └─ Done
```

## Phases

### Phase 1: Fix Backend — Streaming Endpoint Detection (TDD)
**Files:** `compiler.js` (endpoint compilation, compileProgram)

#### Red-Team Fixes Applied

| Issue | Severity | Fix |
|-------|----------|-----|
| Compilation order not guaranteed (agents may compile after endpoints) | P0 | Pre-scan AST for streaming agents BEFORE any compilation |
| Frontend can't access backend's `streamingAgents` set | P0 | Pre-scan at `compileProgram()` level, pass to both compilers via shared context |
| SSE + try/catch error handling (can't send JSON after SSE headers) | P1 | Replace catch block with SSE error format for streaming endpoints |
| Blind `result` variable replacement | P1 | Track the specific variable name from the ASSIGN node's LHS |

#### Implementation

**Step 1: Pre-scan for streaming agents in `compileProgram()`**

Before calling `compileToJSBackend()` or `compileToReactiveJS()`, scan the AST body for AGENT nodes and determine which ones will stream. The logic mirrors `shouldStream` in `compileAgent()`:
- `streamResponse === true` OR (`streamResponse === null` AND no schedule AND no tools AND no skills with tools)
- Body contains ASK_AI calls
- Not structured output

Build a Set of streaming agent names: `streamingAgentNames`. Pass this to both compilers via the compilation context or return value.

This pre-scan is independent of compilation order — it reads the AST directly.

**Step 2: Post-process streaming endpoints**

After generating the endpoint body code via `compileEndpoint()`, detect if it calls a streaming agent:
- Scan compiled body for `await agent_xxx(` where `agent_xxx` is in `streamingAgentNames`
- Track the specific variable name from the regex match (e.g., `result` from `let result = await agent_xxx(...)`)

If found, post-process the compiled body string:
1. Inject SSE headers before the agent call
2. Replace `let VAR = await agent_xxx(ARGS)` with generator iteration:
   ```js
   let _fullResponse = '';
   for await (const _chunk of agent_xxx(ARGS)) {
     _fullResponse += _chunk;
     res.write('data: ' + JSON.stringify({ text: _chunk }) + '\n\n');
   }
   ```
3. Replace all subsequent references to `VAR` with `_fullResponse` (only the specific variable, not generic `result`)
4. Replace `return res.json(...)` with `res.write('data: [DONE]\n\n'); res.end();`
5. Replace the `catch` block's `res.status(N).json(...)` with:
   ```js
   res.write('data: ' + JSON.stringify({ error: err.message }) + '\n\n');
   res.end();
   ```

**Step 3: Wrap endpoint in SSE headers**

The endpoint handler function needs SSE headers before the try block:
```js
app.post('/api/chat', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  try {
    ... // body with iteration
  } catch (err) {
    res.write('data: ' + JSON.stringify({ error: err.message }) + '\n\n');
    res.end();
  }
});
```

Non-streaming agents continue to work normally — the `await agent_fn(msg)` + `res.json()` pattern stays.

**Tests:**
```
T1: streaming agent + POST endpoint emits SSE headers (Content-Type: text/event-stream)
T2: streaming agent + POST endpoint iterates generator (for await)
T3: streaming agent + POST endpoint accumulates _fullResponse
T4: streaming agent + POST endpoint ends with res.end()
T5: non-streaming agent + POST endpoint still uses await + res.json (no regression)
T6: streaming agent diagram shows [streaming] tag
```

**Gate:** `node clear.test.js` passes

### Phase 2: Add `_chatSendStream` Utility (TDD)
**Files:** `compiler.js` (UTILITY_FUNCTIONS)

New utility function that sends a message and streams the response:

```js
function _chatSendStream(inputId, msgsId, typingId, url, field, onDone) {
  var input = document.getElementById(inputId);
  if (!input) return;
  var msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  // Optimistic user bubble
  var msgsEl = document.getElementById(msgsId);
  if (msgsEl) {
    var bubble = document.createElement('div');
    bubble.className = 'clear-chat-msg user';
    bubble.innerHTML = '<div class="clear-chat-msg-label">You</div>' + _chatMdInline(msg);
    msgsEl.appendChild(bubble);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }
  // Create assistant bubble for streaming
  var assistBubble = document.createElement('div');
  assistBubble.className = 'clear-chat-msg assistant';
  assistBubble.innerHTML = '<div class="clear-chat-msg-label">Assistant</div>';
  var contentSpan = document.createElement('span');
  assistBubble.appendChild(contentSpan);
  if (msgsEl) {
    msgsEl.appendChild(assistBubble);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }
  // POST with streaming response
  var body = {};
  body[field] = msg;
  var fullText = '';
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(function(r) {
      var reader = r.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';
      function read() {
        reader.read().then(function(result) {
          if (result.done) {
            // Stream complete — render final markdown
            contentSpan.innerHTML = _chatMd(fullText);
            if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;
            if (onDone) onDone();
            return;
          }
          buffer += decoder.decode(result.value, { stream: true });
          var lines = buffer.split('\n');
          buffer = lines.pop();
          for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line.startsWith('data: ')) {
              var data = line.slice(6);
              if (data === '[DONE]') continue;
              try {
                var evt = JSON.parse(data);
                if (evt.text) {
                  fullText += evt.text;
                  contentSpan.textContent = fullText;
                  if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;
                }
              } catch(e) {}
            }
          }
          read();
        });
      }
      read();
    })
    .catch(function(err) {
      contentSpan.textContent = 'Error: ' + err.message;
      if (typeof _toast === 'function') _toast('Send failed: ' + err.message, 'error');
      if (onDone) onDone();
    });
}
```

Key design decisions:
- **Optimistic user bubble** — same as `_chatSend`
- **No typing dots** — text appears immediately as it streams (the content IS the indicator)
- **Plain text during streaming** — `contentSpan.textContent = fullText` (no markdown rendering mid-stream, avoids flicker from partial markdown)
- **Full markdown on completion** — `contentSpan.innerHTML = _chatMd(fullText)` (renders code blocks, tables, etc. once the full response is in)
- **Same signature as `_chatSend`** — drop-in replacement
- Deps: `['_chatMdInline', '_chatMd']`

**Tests:**
```
T7: UTILITY_FUNCTIONS includes _chatSendStream
T8: _chatSendStream reads response body stream (contains getReader)
T9: _chatSendStream parses SSE format (data: prefix)
T10: _chatSendStream renders final markdown on completion (_chatMd)
T11: _chatSendStream has same signature as _chatSend
```

**Gate:** `node clear.test.js` passes

### Phase 3: Wire Chat Component to Streaming (TDD)
**Files:** `compiler.js` (reactive JS chat wiring)

In the chat event listener section (where `_chatSend` or `_chatSendStream` is emitted for the Send button), the compiler needs to choose between them.

**P0 fix:** The `streamingAgentNames` set is computed at the `compileProgram()` level (Phase 1, Step 1) and passed to `compileToReactiveJS()` via context. The reactive compiler can check it directly — no dependency on backend compilation order.

The detection chain:
```
absorbed button → SEND_TO_API(url='/api/chat') → find endpoint in AST for '/api/chat' 
→ endpoint body has RUN_AGENT('Bot') → 'Bot' in streamingAgentNames?
→ YES → use _chatSendStream
→ NO → use _chatSend
```

**Implementation:** In the chat event listener wiring section (the `_chatDisplays` loop), after determining the `postUrl`:
1. Find the POST endpoint node in `ctx._astBody` matching that URL
2. Walk its body for RUN_AGENT nodes
3. If the agent name is in `streamingAgentNames` (from context) → emit `_chatSendStream`
4. Otherwise → emit `_chatSend`

**Tests:**
```
T12: chat with streaming agent uses _chatSendStream (not _chatSend)
T13: chat with non-streaming agent uses _chatSend (not _chatSendStream)
T14: streaming chat compiled output includes _chatSendStream utility function
T15: streaming chat compiled output includes _chatMd utility function (for final render)
```

**Gate:** `node clear.test.js` passes

### Phase 4: Integration Test
**Files:** test programs

1. Create a test Clear program: streaming agent + chat display
2. Compile it, verify:
   - Backend: POST endpoint has SSE headers, iterates generator
   - Frontend: `_chatSendStream` is used, not `_chatSend`
   - HTML: chat component renders normally
3. `node --check` on compiled server.js
4. Verify store-ops (which has tools → NON-streaming) still compiles correctly with `_chatSend`

**Tests:**
```
T16: full streaming chat app compiles with 0 errors
T17: full streaming chat app backend has SSE headers
T18: full streaming chat app frontend has _chatSendStream
T19: store-ops (tool-using agent) still uses _chatSend (no regression)
```

**Gate:** `node clear.test.js` passes, `node --check` passes

## File Change Summary

| File | Changes |
|------|---------|
| `compiler.js` | Add `streamingAgents` tracking in compileAgent. Add SSE endpoint detection in endpoint compilation. Add `_chatSendStream` utility. Wire chat to detect streaming. |
| `clear.test.js` | ~19 new tests (T1-T19) |

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| `streamingAgents` set not populated before endpoint compilation | Medium | Agents compile before endpoints in the output order — verify this ordering |
| ReadableStream API not available in older browsers | Low | Modern browsers all support it; graceful fallback to `_chatSend` if `r.body.getReader` fails |
| Partial markdown rendering causes flicker | Low | Use plain `textContent` during streaming, full `_chatMd` on completion |
| SSE headers conflict with Express error handling | Medium | Move try/catch to wrap only the iteration, not the header write |
| `_fullResponse` variable name collision | Low | Use `_fullResponse` prefix to avoid collision with user variables |
| Store-ops regression (tools → should not stream) | Medium | Explicit test T19 verifies store-ops stays non-streaming |
