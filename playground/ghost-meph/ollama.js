/*
 * Ghost Meph backend — Ollama (local model server).
 *
 * `MEPH_BRAIN=ollama:qwen3` (or just `ollama:<model>`) routes /api/chat
 * through a locally-running Ollama daemon at OLLAMA_HOST (default
 * http://localhost:11434). Uses Ollama's OpenAI-compatible endpoint so we
 * share the format-bridge with future GM-3 (OpenRouter).
 *
 * Text-only — tool support arrives with the GM-2 tool-use upgrade.
 *
 * Install path documented in plans/plan-ghost-meph-openrouter-ollama-...:
 *   1. brew install ollama  (or download from ollama.ai)
 *   2. ollama serve  (in a separate terminal)
 *   3. ollama pull qwen3:8b  (one-time, ~5GB download)
 *   4. MEPH_BRAIN=ollama:qwen3 node playground/server.js
 */

import {
  anthropicToOpenAI,
  wrapOpenAIStreamAsAnthropicSSE,
} from './format-bridge.js';
import { buildSSEEvents } from './router.js';

const DEFAULT_HOST = 'http://localhost:11434';
const REQUEST_TIMEOUT_MS = 120_000;  // 2 min — local inference can be slow on first call (model load)

/**
 * Public entry — called from router.js when MEPH_BRAIN starts with 'ollama:'.
 */
export async function chatViaOllama(payload) {
  const host = (process.env.OLLAMA_HOST || DEFAULT_HOST).replace(/\/$/, '');
  // Brain string format: 'ollama:<model>' — extract model after the colon.
  // OLLAMA_MODEL env var overrides if set (matches GM-3 OPENROUTER_MODEL pattern).
  const model = resolveModel();
  const openAIPayload = anthropicToOpenAI({ ...payload, model });

  let r;
  try {
    r = await fetch(`${host}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...openAIPayload, stream: true }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    return errorResponse(formatNetworkError(err, host));
  }

  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    return errorResponse(
      `[ollama HTTP ${r.status}: ${detail.slice(0, 200) || 'no body'}. Is the model "${model}" pulled? Try \`ollama pull ${model}\`.]`
    );
  }
  return wrapOpenAIStreamAsAnthropicSSE(r.body, model);
}

function resolveModel() {
  if (process.env.OLLAMA_MODEL) return process.env.OLLAMA_MODEL;
  const brain = (process.env.MEPH_BRAIN || '').trim().toLowerCase();
  // 'ollama:qwen3' → 'qwen3'; 'ollama:qwen3:8b' → 'qwen3:8b'
  if (brain.startsWith('ollama:')) return brain.slice('ollama:'.length) || 'qwen3:8b';
  return 'qwen3:8b';
}

function formatNetworkError(err, host) {
  const code = err && err.cause && err.cause.code;
  if (code === 'ECONNREFUSED') {
    return `[ollama not running at ${host} — start it with \`ollama serve\` (or set OLLAMA_HOST). Drop MEPH_BRAIN to fall back to the real Anthropic API.]`;
  }
  if (err && err.name === 'TimeoutError') {
    return `[ollama timed out after ${REQUEST_TIMEOUT_MS / 1000}s. First request loads the model into memory — subsequent calls are faster. Try again, or pull a smaller model.]`;
  }
  return `[ollama error: ${err && err.message ? err.message : String(err)}]`;
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
