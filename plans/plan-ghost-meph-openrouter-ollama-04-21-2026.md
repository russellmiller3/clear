# Plan — Ghost Meph backends: OpenRouter Qwen + Ollama (GM-3, GM-4)

**Status:** planning. Routing layer + cc-agent text-only MVP shipped
2026-04-21. These two backends are the next plug-in cards on the dispatch
table in `playground/ghost-meph/router.js`.

**Why both at once:** the architecture is identical (HTTP POST to a
chat-completions API, translate response to Anthropic SSE) and the work
to handle Anthropic-shape ↔ OpenAI-shape conversion is reusable across
both. Ship them as one plan, two commits.

---

## Shared work — message format translation

Both OpenRouter and Ollama speak OpenAI-flavored chat-completions
(`{messages: [{role, content}], model, ...}`). Anthropic's payload has
slightly different message shapes: assistant messages can contain mixed
content (text + tool_use blocks), tool results come as user messages with
`tool_result` blocks, system prompt is a separate top-level field.

A shared helper:
```
playground/ghost-meph/format-bridge.js
  - anthropicToOpenAI(payload) → {model, messages, tools?, max_tokens, ...}
    Flattens Anthropic content arrays to plain text where possible.
    Maps tool_use blocks → OpenAI tool_calls (well-defined).
    Maps tool_result blocks → OpenAI tool message role.
  - openAIToAnthropicSSE(response, sseEmit)
    Reads either an OpenAI SSE stream (chunks with delta.content) OR a
    single JSON response, translates to Anthropic SSE events, calls
    sseEmit() per event. Same translation as cc-agent's stream-json
    bridge (see plan-ghost-meph-cc-agent-tool-use-04-21-2026.md step 4).
```

Both backends import this module. ~150 lines total.

---

## GM-3 — OpenRouter Qwen backend

### File: `playground/ghost-meph/openrouter.js`

```
import { anthropicToOpenAI, openAIToAnthropicSSE } from './format-bridge.js';

export async function chatViaOpenRouter(payload) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return errorResponse('Set OPENROUTER_API_KEY');
  const model = process.env.OPENROUTER_MODEL || 'qwen/qwen3.6-plus-preview:free';
  const openAIPayload = anthropicToOpenAI({ ...payload, model });
  // OpenRouter is OpenAI-compatible; same /v1/chat/completions shape.
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://buildclear.dev',  // OpenRouter requests an attribution header
    },
    body: JSON.stringify({ ...openAIPayload, stream: true }),
  });
  if (!r.ok) return errorResponse(`OpenRouter HTTP ${r.status}`);
  return wrapAsAnthropicSSE(r.body);  // shared helper
}
```

### Quirks to handle

- **Preview-tier model availability.** `qwen/qwen3.6-plus-preview:free`
  may disappear without notice. Fall back to a paid Qwen tier if 404.
- **Rate limits.** OpenRouter's free tier has aggressive RPM caps. Add
  exponential backoff with jitter; retry on 429 up to 3 times.
- **Tool-use support.** Qwen on OpenRouter supports OpenAI's tool_calls
  format. The format-bridge handles the translation, but Qwen's
  reliability with tools is lower than Claude's — flag in commit message.
- **Streaming format.** OpenAI sends `data: {...}\n\n` chunks; the last
  one is `data: [DONE]\n\n`. format-bridge collapses chunks into
  Anthropic SSE.

### Tests

Mock `fetch` to return canned OpenRouter responses. Assert the wrapped
SSE matches Anthropic's shape exactly (same as Phase 2 tests in
`ghost-meph.test.js`). Add an integration test that runs the full
/api/chat tool loop against the mocked backend.

### Effort: ~1 day.

---

## GM-4 — Ollama backend

### File: `playground/ghost-meph/ollama.js`

```
import { anthropicToOpenAI, openAIToAnthropicSSE } from './format-bridge.js';

export async function chatViaOllama(payload) {
  const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL || 'qwen3:8b';
  const openAIPayload = anthropicToOpenAI({ ...payload, model });
  // Ollama exposes an OpenAI-compatible endpoint at /v1/chat/completions.
  const r = await fetch(`${host}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...openAIPayload, stream: true }),
  });
  if (!r.ok) return errorResponse(`Ollama HTTP ${r.status} — is the daemon running?`);
  return wrapAsAnthropicSSE(r.body);
}
```

### Quirks to handle

- **No daemon = clean error.** If `ollama` isn't running on
  `localhost:11434`, the fetch throws ECONNREFUSED. Catch and surface a
  Marcus-readable "Is the Ollama daemon running? Run `ollama serve`."
- **Model must be pulled.** First request to a new model triggers a
  download; that can take minutes. Add a 30s warmup grace period before
  the standard timeout; surface progress info via SSE delta if possible.
- **Tool-use depends on model.** Qwen 3 supports tool calls; Llama 3
  variants don't. Document supported model list.
- **No API key needed.** Skip the auth check entirely.

### FAQ.md update

Document the install path:
```
1. brew install ollama  (or download from ollama.ai)
2. ollama serve  (in a separate terminal)
3. ollama pull qwen3:8b  (one-time, ~5GB download)
4. MEPH_BRAIN=ollama:qwen3 node playground/server.js
```

### Tests

Same shape as GM-3 tests. Mock fetch, assert SSE shape.

### Effort: ~0.5 day.

---

## Shared follow-ups

### Calibration harness (GM-5)

After both backends land:
- Run N curriculum tasks against `MEPH_BRAIN=cc-agent`.
- Run same N against `MEPH_BRAIN=openrouter:qwen`.
- Run same N against real Anthropic (bounded dev key).
- Compare Factor DB row distributions: pass rate, error categories,
  patch types, iteration counts.
- Emit drift report.

This is a separate piece of work (~1 day) that depends on all three
backends working.

### Default switch (GM-6)

Once cc-agent + curriculum sweeps prove out at calibration, flip
`playground/supervisor/curriculum-sweep.js` to default
`MEPH_BRAIN=cc-agent`. Keep an `--real` flag for explicit Anthropic.
~1 hour change.

---

## Order of operations recommendation

1. Ship the format-bridge module (shared, blocking both GM-3 and GM-4).
2. Ship GM-4 (Ollama) FIRST — simpler (no auth, no rate limits, fully
   local). Lets us verify the bridge with deterministic local responses.
3. Ship GM-3 (OpenRouter) using the now-tested bridge.
4. Ship GM-5 calibration harness.
5. Ship GM-6 default switch.

After step 6, Russell's $200/mo Claude Code subscription powers
everything; the production Anthropic key only fires on explicit `--real`
runs. The Session 41 cost-burn pattern can't repeat.
