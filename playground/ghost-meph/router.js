/*
 * Ghost Meph router — env-gated chat backend dispatch.
 *
 * When the env var MEPH_BRAIN is set, /api/chat routes its Anthropic call to
 * a local backend instead. This file is the dispatcher; the actual backends
 * (cc-agent, openrouter:qwen, ollama, etc.) ship in GM-2 / GM-3 / GM-4.
 *
 * GM-1 (this file) ships the routing layer + a working stub that emits
 * Anthropic-shaped SSE events. The stub returns a one-shot text reply that
 * announces which MEPH_BRAIN value was set; it does NOT actually invoke any
 * model. That keeps the env-gate verifiable without paying for or installing
 * any of the real backends.
 *
 * The contract the rest of the server depends on:
 *   - isGhostMephActive() returns boolean (true iff MEPH_BRAIN is set + non-empty)
 *   - fetchViaBackend(payload, headers) returns a Response-like object:
 *       { ok: boolean, status: number, body: ReadableStream<Uint8Array>, text(): Promise<string> }
 *     The body streams Anthropic-shaped SSE bytes — same line format /api/chat
 *     parses for the real Anthropic API. This means /api/chat doesn't need to
 *     know whether the response came from Claude or a local stub.
 *
 * GM-2/3/4 plug in by extending the dispatch table in fetchViaBackend.
 */

export function isGhostMephActive() {
  const v = process.env.MEPH_BRAIN;
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Get the resolved backend identifier (lowercased, trimmed).
 * Returns null when ghost mode is off.
 */
export function getBackendId() {
  if (!isGhostMephActive()) return null;
  return process.env.MEPH_BRAIN.trim().toLowerCase();
}

/**
 * Route a chat request to whichever backend MEPH_BRAIN selects.
 * payload: the body that would be sent to Anthropic (model, messages, tools, system, max_tokens, ...).
 * headers: the headers (we generally ignore these in stubs but pass through for backend compat).
 *
 * Returns a Response-like object with a streaming SSE body that the existing
 * /api/chat reader loop can consume unchanged.
 */
export async function fetchViaBackend(payload, headers) {
  const brain = getBackendId();
  // Dynamic imports keep slightly heavier modules out of the hot path when
  // their backend isn't selected, and avoid a circular import — cc-agent /
  // ollama / openrouter all depend on buildSSEEvents from this file.
  if (brain === 'cc-agent') {
    const { chatViaClaudeCode } = await import('./cc-agent.js');
    return chatViaClaudeCode(payload);
  }
  if (brain && brain.startsWith('ollama:')) {
    const { chatViaOllama } = await import('./ollama.js');
    return chatViaOllama(payload);
  }
  switch (brain) {
    case 'openrouter:qwen':
    case 'haiku-dev':
      // GM-3 / haiku-dev land in follow-up commits. Stub for now — same
      // contract, stop_reason=end_turn, server doesn't hang.
      return stubResponse(brain, payload);
    default:
      // Unknown backend — still return a stub so the server doesn't crash,
      // but mark the message so a developer knows their MEPH_BRAIN value is unrecognized.
      return stubResponse(`unknown:${brain}`, payload);
  }
}

/**
 * Build a Response-like wrapper around a synchronous SSE event sequence.
 * Anthropic's SSE format is: alternating `event: <name>\n` + `data: <json>\n\n` lines.
 * The /api/chat reader only looks at the `data:` lines (line 3795 of server.js
 * filters with `if (!line.startsWith('data: ')) continue`), so the `event:`
 * preface is optional. Including it anyway for protocol fidelity.
 */
function stubResponse(brain, payload) {
  const message = `[Ghost Meph stub: MEPH_BRAIN=${brain}. Routing layer works; this backend ships in GM-2 / GM-3 / GM-4. Drop MEPH_BRAIN to fall back to real Anthropic.]`;
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

/**
 * Emit a minimal but well-formed Anthropic SSE sequence:
 *   message_start
 *   content_block_start (text block, index 0)
 *   content_block_delta (text_delta — the message)
 *   content_block_stop
 *   message_delta (stop_reason: end_turn — this is what /api/chat checks
 *                  at line 3856 to decide whether to terminate the loop)
 *   message_stop
 *
 * The stop_reason='end_turn' is critical — without it the tool-use loop
 * keeps iterating, and since the stub never calls a tool the loop spins
 * until the iteration cap.
 *
 * Exported for tests so they can assert event shape without going through
 * a Response stream.
 */
export function buildSSEEvents(text) {
  const sse = (type, data) =>
    `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  return [
    sse('message_start', {
      message: {
        id: 'ghost_msg_' + Date.now().toString(36),
        type: 'message',
        role: 'assistant',
        model: 'ghost-meph-stub',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    }),
    sse('content_block_start', {
      index: 0,
      content_block: { type: 'text', text: '' },
    }),
    sse('content_block_delta', {
      index: 0,
      delta: { type: 'text_delta', text },
    }),
    sse('content_block_stop', { index: 0 }),
    sse('message_delta', {
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { input_tokens: 0, output_tokens: text.length },
    }),
    sse('message_stop', {}),
  ];
}
