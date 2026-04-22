/*
 * Ghost Meph backend — OpenRouter (multi-provider model gateway).
 *
 * `MEPH_BRAIN=openrouter:qwen` (or just `openrouter`) routes /api/chat
 * through OpenRouter's OpenAI-compatible /v1/chat/completions endpoint.
 * Default model: qwen/qwen3.6-plus-preview:free. Override with
 * `OPENROUTER_MODEL`. API key required: `OPENROUTER_API_KEY`.
 *
 * Text-only — tool support arrives with the GM-2 tool-use upgrade.
 *
 * Reuses format-bridge.js, so this file is mostly Ollama with auth +
 * referer header + better rate-limit hints.
 *
 * Setup:
 *   1. Create account at openrouter.ai
 *   2. export OPENROUTER_API_KEY=sk-or-v1-...
 *   3. (optional) export OPENROUTER_MODEL=qwen/qwen3.6-plus-preview:free
 *   4. MEPH_BRAIN=openrouter:qwen node playground/server.js
 *
 * Quirks (per plans/plan-ghost-meph-openrouter-ollama-...):
 *   - Preview-tier models can disappear without notice. We surface the
 *     400/404 cleanly so a developer can pick another model.
 *   - Free-tier rate limits are aggressive (RPM caps). Single-shot retries
 *     would just make rate-limit problems worse — better to fail fast and
 *     let the caller decide to back off.
 *   - OpenRouter requests an HTTP-Referer header for attribution.
 */

import {
  anthropicToOpenAI,
  wrapOpenAIStreamAsAnthropicSSE,
} from './format-bridge.js';
import { buildSSEEvents } from './router.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const REFERER = 'https://buildclear.dev';
const REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_MODEL = 'qwen/qwen3.6-plus-preview:free';

/** Public entry — called from router.js when MEPH_BRAIN starts with 'openrouter'. */
export async function chatViaOpenRouter(payload) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return errorResponse(
      '[openrouter: OPENROUTER_API_KEY not set. Get one at openrouter.ai/keys, then `export OPENROUTER_API_KEY=sk-or-v1-...`. Drop MEPH_BRAIN to fall back to the real Anthropic API.]'
    );
  }
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const openAIPayload = anthropicToOpenAI({ ...payload, model });

  let r;
  try {
    r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': REFERER,
        'X-Title': 'Clear Studio (Ghost Meph)',
      },
      body: JSON.stringify({ ...openAIPayload, stream: true }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    return errorResponse(formatNetworkError(err));
  }

  if (!r.ok) {
    const detail = (await r.text().catch(() => '')).slice(0, 240);
    if (r.status === 429) {
      return errorResponse(
        `[openrouter rate-limited (HTTP 429). The free tier has aggressive RPM caps — wait a minute, switch to a paid model via OPENROUTER_MODEL, or drop MEPH_BRAIN. ${detail}]`
      );
    }
    if (r.status === 404 || r.status === 400) {
      return errorResponse(
        `[openrouter HTTP ${r.status} on model "${model}". Preview-tier models can disappear; try a stable one (export OPENROUTER_MODEL=...). ${detail}]`
      );
    }
    return errorResponse(`[openrouter HTTP ${r.status}: ${detail || 'no body'}]`);
  }
  return wrapOpenAIStreamAsAnthropicSSE(r.body, model);
}

function formatNetworkError(err) {
  if (err && err.name === 'TimeoutError') {
    return `[openrouter timed out after ${REQUEST_TIMEOUT_MS / 1000}s. The model may be cold-loading on a free tier — retry, or pick a stable model.]`;
  }
  return `[openrouter network error: ${err && err.message ? err.message : String(err)}]`;
}

function errorResponse(message) {
  const events = buildSSEEvents(message);
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      for (const ev of events) controller.enqueue(enc.encode(ev));
      controller.close();
    },
  });
  return {
    ok: true,
    status: 200,
    body: stream,
    text: async () => events.join(''),
  };
}
