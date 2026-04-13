# Handoff — 2026-04-12 (SSE Streaming Shipped)

## What Was Done (This Session — Two Features)

### Feature 1: Standard Chat (display as chat)
Made `display as chat` a proper compilation target with utility functions (`_chatRender`, `_chatMd`, `_chatSend`, `_chatClear`), HTML scaffold, CSS component, reactive wiring, and input+button absorption. 46 new tests.

### Feature 2: SSE Streaming for Chat
Auto-detects when a POST endpoint calls a streaming agent and transforms both sides:
- **Backend:** POST endpoint becomes SSE — iterates the agent generator, writes `data: {"text":"..."}` events, ends with `[DONE]`
- **Frontend:** `_chatSendStream` reads the response body stream, appends tokens to the assistant bubble in real-time, renders full markdown on completion

The detection is automatic: if the agent has `stream response` (and no tools/schedule), the compiler wires streaming. Tool-using agents fall back to `_chatSend`. 19 new tests.

## Current State

- **Branch:** main (both features merged)
- **Tests:** 1827 passing, 0 failures
- **Store-ops:** compiles cleanly, uses `_chatSend` (tool-using agent, non-streaming)

## Key Design Decisions

- **Pre-scan at compileProgram() level** — streaming agent detection runs BEFORE any compilation, solving the ordering dependency between agent and endpoint compilation
- **Plain text during streaming, markdown on completion** — avoids flicker from partial markdown rendering mid-stream
- **SSE error handling** — streaming endpoints write errors as SSE events (`data: {"error":"..."}`) instead of HTTP status codes (headers already sent)
- **Same function signature** — `_chatSendStream` has identical params to `_chatSend`, making the choice a simple conditional

## What's Next

1. **GAN Frontend Verification** — both features need visual browser testing. Compile store-ops, open Chrome, screenshot chat, test Send, test streaming if possible.

2. **Core 7 Template: live-chat** — update template #4 to showcase `display as chat` with `stream response` agent.

3. **Tool-using agent streaming** — currently blocked by tool loop needing full responses. Future: stream only the FINAL text response after all tool calls complete.

## Resume Prompt

```
Read HANDOFF.md then PHILOSOPHY.md then CLAUDE.md.

Two features shipped today: standard chat + SSE streaming. Next: GAN
verify the chat UI in Chrome. Compile store-ops, run it, navigate to
the chat page, screenshot, test Send. Then update the live-chat template
to use display-as-chat with a streaming agent.
```
