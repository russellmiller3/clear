/*
 * Ghost Meph — Anthropic ↔ OpenAI format bridge.
 *
 * OpenRouter, Ollama, and most local-model gateways speak OpenAI's chat-
 * completions shape. /api/chat speaks Anthropic's tool-use shape. This module
 * translates between them so backend implementations don't repeat the work.
 *
 * Scope today (text-only):
 *   - anthropicToOpenAI(payload): flatten Anthropic content arrays to plain
 *     text, map system field, pass tools through (untranslated for now).
 *   - openAIChunkToAnthropicSSE(): yield one Anthropic SSE event per OpenAI
 *     stream chunk. Text deltas only — tool_calls translation is a follow-up
 *     when GM-2 tool-use lands (see plan-ghost-meph-cc-agent-tool-use-...).
 *   - wrapOpenAIStreamAsAnthropicSSE(): reads an OpenAI SSE stream and emits
 *     an Anthropic SSE stream the existing /api/chat reader can consume
 *     unchanged.
 *
 * Tool translation (TODO when tool-use lands):
 *   - Anthropic tool_use blocks → OpenAI tool_calls
 *   - Anthropic tool_result blocks → OpenAI role:'tool' messages
 *   - OpenAI tool_calls → Anthropic content_block_start (tool_use) +
 *     input_json_delta + content_block_stop
 */

import { buildSSEEvents } from './router.js';

/**
 * Translate an Anthropic /v1/messages payload to an OpenAI /v1/chat/completions
 * payload. Text-only flattening of content arrays. System prompt becomes the
 * leading system message.
 */
export function anthropicToOpenAI(payload) {
  const { model, messages = [], system, max_tokens, temperature } = payload;
  const out = {
    model,
    messages: [],
  };
  if (typeof max_tokens === 'number') out.max_tokens = max_tokens;
  if (typeof temperature === 'number') out.temperature = temperature;

  // System: Anthropic accepts string OR array-of-blocks (with cache_control).
  // OpenAI wants a single system message. Flatten array form to text.
  const sysText = flattenSystem(system);
  if (sysText) out.messages.push({ role: 'system', content: sysText });

  for (const m of messages) {
    if (!m || !m.role) continue;
    out.messages.push({
      role: m.role,
      content: flattenContent(m.content),
    });
  }
  return out;
}

function flattenSystem(system) {
  if (!system) return '';
  if (typeof system === 'string') return system;
  if (Array.isArray(system)) {
    return system
      .map(b => (typeof b === 'string' ? b : (b && b.text) || ''))
      .filter(Boolean)
      .join('\n\n');
  }
  return '';
}

function flattenContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    // For text-only MVP, drop tool_use/tool_result blocks. Tool support
    // arrives with the GM-2 tool-use upgrade.
    return content
      .filter(b => b && (b.type === 'text' || typeof b.text === 'string'))
      .map(b => b.text)
      .join('\n');
  }
  return String(content || '');
}

/**
 * Read an OpenAI streaming response body and return an Anthropic-shaped
 * Response-like object whose body streams Anthropic SSE. /api/chat's reader
 * loop consumes that unchanged.
 *
 * `openaiBody` must be a ReadableStream<Uint8Array> from the OpenAI fetch.
 * `model` is the original Anthropic model name (echoed in message_start).
 */
export async function wrapOpenAIStreamAsAnthropicSSE(openaiBody, modelLabel) {
  const text = await accumulateOpenAIText(openaiBody);
  const events = buildSSEEvents(text);
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

/**
 * Drain an OpenAI SSE stream and concatenate the text deltas. Used by
 * the wrapOpenAIStreamAsAnthropicSSE helper above. Exposed for tests.
 *
 * OpenAI streams `data: {choices:[{delta:{content:"..."}}]}\n\n` chunks
 * terminated by `data: [DONE]\n\n`. Some servers omit the [DONE] sentinel
 * — we treat end-of-stream as completion either way.
 */
export async function accumulateOpenAIText(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let acc = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === '[DONE]') continue;
      let chunk;
      try { chunk = JSON.parse(raw); } catch { continue; }
      // OpenAI: choices[0].delta.content for streaming text.
      // Ollama and most adapters mirror this.
      const delta = chunk?.choices?.[0]?.delta?.content;
      if (typeof delta === 'string') acc += delta;
      // Some adapters use message.content on the final chunk
      const finalContent = chunk?.choices?.[0]?.message?.content;
      if (typeof finalContent === 'string' && !acc) acc = finalContent;
    }
  }
  return acc;
}

/**
 * Wrap a single (non-streamed) OpenAI JSON response body as an Anthropic SSE.
 * Used when a backend doesn't support streaming or when stream=false.
 */
export function wrapOpenAIJsonAsAnthropicSSE(json) {
  const text =
    json?.choices?.[0]?.message?.content ||
    json?.choices?.[0]?.text ||
    '';
  const events = buildSSEEvents(text);
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
