# Handoff — 2026-04-12 (Standard Chat Shipped)

## What Was Done

`display as chat` is now a proper compilation target — same architecture as `display as table`. The previous approach (inline JS string hacks, no tests, no utility functions) was thrown away entirely.

### What Was Built

1. **6 utility functions** in UTILITY_FUNCTIONS (tree-shaken, only included when app uses chat):
   - `_chatMdInline` — inline markdown (bold, italic, code)
   - `_chatMdBlock` — block markdown (headings, lists, tables)
   - `_chatMd` — full markdown with fenced code blocks
   - `_chatRender` — renders message array as chat bubbles
   - `_chatSend` — optimistic send with typing indicator
   - `_chatClear` — clear messages + optional DELETE

2. **HTML scaffold** — full chat component: header, messages container, typing dots, scroll-to-bottom, textarea, Send button

3. **CSS component** — DaisyUI v5 themed (`--color-*` variables), added to CSS_COMPONENTS for tree-shaking

4. **Reactive wiring** — `_recompute()` calls `_chatRender()` instead of inline rendering. Event listeners for New, Enter-to-send, scroll-to-bottom.

5. **Input absorption** — compiler detects `display as chat` + input + Send button pattern and folds them into the chat component's built-in controls. No duplicate UI elements.

## Key Design Decisions

- **No stream cursor `|`** — typing dots only
- **Markdown: ported from Studio** — code blocks, tables, lists, headings. No SVG rendering.
- **CSS uses DaisyUI v5 names** — `--color-primary`, not `--p`
- **All utility calls in reactive JS bodyLines** — so tree-shaker finds them (P0 from red-team)
- **Input absorption is conservative** — only detects same-level adjacent siblings

## Current State

- **Branch:** merged to main
- **Tests:** 1808 passing (46 new tests for chat)
- **Store-ops:** compiles, passes syntax check, passes app tests, single unified chat UI

## What's Next (Priority Order)

1. **SSE Streaming for chat** — compiler detects POST→agent→display-as-chat flow and emits SSE endpoint. Tokens stream into the assistant bubble in real-time instead of showing typing dots then full response.

2. **GAN Frontend Verification** — the chat component hasn't been visually verified in a real browser yet. Need to open Chrome, screenshot, verify layout, test Send, test New, test markdown rendering, test scroll button.

3. **Core 7 Templates** — add `live-chat` template that showcases `display as chat` with a real agent. This becomes template #4 in the core 7.

4. **Chat personality/memory/web-search options** — future syntax: `display as chat with web search, memory`. These are flags that enable extra capabilities.

## Resume Prompt

```
Read HANDOFF.md then PHILOSOPHY.md then CLAUDE.md.

Standard chat is shipped. Next priority: GAN verify the chat UI in a real
browser (Chrome). Compile store-ops, run it, navigate to port 4030,
screenshot the chat page, type a message, click Send, verify it all works
visually. Then start on SSE streaming for real-time token display.
```
