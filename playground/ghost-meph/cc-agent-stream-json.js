/*
 * cc-agent stream-json parser.
 *
 * Claude Code's `--output-format stream-json` emits newline-delimited JSON.
 * Each line is one event. This module translates those events into the
 * Anthropic-shaped SSE sequence that /api/chat's tool-use loop already
 * consumes (see playground/server.js around line 3000).
 *
 * Why this exists:
 *   The text-only MVP in cc-agent.js ran `claude --print` and captured
 *   stdout as one blob of text. That let Meph answer but not CALL TOOLS.
 *   To unlock curriculum sweeps and Meph evals on the $200/mo subscription,
 *   Claude Code needs to drive Meph's full tool surface — edit_code, compile,
 *   run_tests, etc. Claude Code handles the tool execution internally via
 *   the MCP server (playground/ghost-meph/mcp-server/). This parser's job
 *   is to stream the internal tool-use events back to /api/chat so the
 *   Studio UI renders tool bubbles, code updates, and compile results.
 *
 * Event translation table (Claude Code → Anthropic SSE):
 *   {type:"system",subtype:"init",...}      →  message_start (assistant turn begins)
 *   {type:"assistant",message:{content:[
 *     {type:"text",text:"..."}              →  content_block_start(text) + content_block_delta(text_delta) + content_block_stop
 *     {type:"tool_use",id,name,input}       →  content_block_start(tool_use) + content_block_delta(input_json_delta) + content_block_stop
 *   ]}}
 *   {type:"user",message:{content:[
 *     {type:"tool_result",tool_use_id,...}  →  SKIPPED (tool already ran in MCP child; /api/chat's loop would try to re-run)
 *   ]}}
 *   {type:"result",...}                     →  message_delta(stop_reason="end_turn") + message_stop
 *
 * Critical: stop_reason is always `end_turn`, never `tool_use`. /api/chat's
 * tool-use loop at server.js:3066 terminates on end_turn. If we emitted
 * tool_use, the loop would execute the tools AGAIN — Claude Code already
 * ran them via MCP.
 *
 * The parser is a PURE FUNCTION. Subprocess + stdin/stdout plumbing lives
 * in cc-agent.js. Tests feed synthesized event objects and assert SSE shape.
 */

/**
 * Convert one stream-json event object (a single parsed line from
 * claude's stdout) into zero or more Anthropic SSE frames.
 *
 * Maintains block-index state so content_block_start events get sequential
 * indices within a turn, matching Anthropic's protocol.
 *
 * @param {object} event - parsed stream-json event
 * @param {object} state - accumulator: { nextBlockIndex, messageStarted }
 * @returns {string[]} SSE frames (each already `event: X\ndata: {...}\n\n` shaped)
 */
export function translateStreamJsonEvent(event, state) {
  if (!event || typeof event !== 'object') return [];
  const frames = [];

  switch (event.type) {
    case 'system':
      // init marker — emit message_start once so /api/chat's stream parser
      // knows the assistant turn is beginning. subtype="init" carries the
      // session_id + tool list; we don't need either for SSE shape.
      if (event.subtype === 'init' && !state.messageStarted) {
        state.messageStarted = true;
        frames.push(sse('message_start', {
          message: {
            id: 'cc_agent_msg_' + Date.now().toString(36),
            type: 'message',
            role: 'assistant',
            model: 'claude-code-via-mcp',
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 },
          },
        }));
      }
      return frames;

    case 'assistant': {
      // Claude Code wraps its assistant output as Anthropic-style message
      // objects already — .message.content is an array of content blocks.
      // Each block becomes content_block_start/(delta)/stop in the SSE stream.
      const blocks = event.message?.content;
      if (!Array.isArray(blocks)) return frames;
      for (const block of blocks) {
        if (block?.type === 'text') {
          const idx = state.nextBlockIndex++;
          frames.push(sse('content_block_start', {
            index: idx,
            content_block: { type: 'text', text: '' },
          }));
          frames.push(sse('content_block_delta', {
            index: idx,
            delta: { type: 'text_delta', text: String(block.text || '') },
          }));
          frames.push(sse('content_block_stop', { index: idx }));
        } else if (block?.type === 'tool_use') {
          const idx = state.nextBlockIndex++;
          // content_block_start carries the tool name + id but an EMPTY input
          // (matches Anthropic's stream shape — the input arrives via deltas).
          frames.push(sse('content_block_start', {
            index: idx,
            content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} },
          }));
          // Emit the full input as one input_json_delta so /api/chat's loop
          // accumulates it correctly (see server.js:3035). Real Anthropic
          // streams this across many deltas; one delta is valid per spec.
          frames.push(sse('content_block_delta', {
            index: idx,
            delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input ?? {}) },
          }));
          frames.push(sse('content_block_stop', { index: idx }));
        }
        // Other block types (thinking, server_tool_use, etc.) don't appear
        // in Claude Code's --print output per the current protocol. If they
        // do later, add cases here.
      }
      return frames;
    }

    case 'user':
      // tool_result blocks fire BACK to claude after it called an MCP tool.
      // Skip these entirely — /api/chat's loop would treat them as new user
      // messages and re-execute nothing, but including them bloats the SSE
      // stream. The tool ran; the assistant text/tool_use blocks reflect
      // what claude did with the result.
      return frames;

    case 'result':
      // Final event — emit message_delta with end_turn so /api/chat's loop
      // terminates without trying to run the tools again (they already ran
      // inside claude via MCP).
      frames.push(sse('message_delta', {
        delta: {
          stop_reason: 'end_turn',
          stop_sequence: null,
        },
        usage: {
          input_tokens: event.usage?.input_tokens || 0,
          output_tokens: event.usage?.output_tokens || 0,
        },
      }));
      frames.push(sse('message_stop', {}));
      return frames;

    default:
      // Unknown event type — silently skip. Claude Code may add new event
      // types over time; we don't want to break when that happens.
      return frames;
  }
}

/**
 * Translate a full NDJSON buffer into the complete SSE sequence. Used by
 * cc-agent.js after the subprocess exits — simpler than stream-as-you-go
 * and matches the existing wrapAsResponse contract.
 *
 * @param {string} ndjsonBuffer - accumulated stdout from claude subprocess
 * @returns {string[]} complete SSE event sequence
 */
export function translateStreamJsonBuffer(ndjsonBuffer) {
  const state = { nextBlockIndex: 0, messageStarted: false };
  const frames = [];
  for (const line of ndjsonBuffer.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let event;
    try { event = JSON.parse(trimmed); }
    catch { continue; }  // skip malformed lines (defensive)
    frames.push(...translateStreamJsonEvent(event, state));
  }

  // If we never saw a result event, the subprocess crashed mid-stream. Emit
  // a synthetic end_turn so /api/chat doesn't hang waiting for message_delta.
  const sawMessageStop = frames.some(f => f.includes('"type":"message_stop"'));
  if (!sawMessageStop) {
    frames.push(sse('message_delta', {
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { input_tokens: 0, output_tokens: 0 },
    }));
    frames.push(sse('message_stop', {}));
  }
  // If we never saw a system/init event, prepend a synthetic message_start
  // so the SSE sequence is well-formed for /api/chat's parser.
  const sawMessageStart = frames.some(f => f.includes('"type":"message_start"'));
  if (!sawMessageStart) {
    frames.unshift(sse('message_start', {
      message: {
        id: 'cc_agent_msg_' + Date.now().toString(36),
        type: 'message',
        role: 'assistant',
        model: 'claude-code-via-mcp',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    }));
  }
  return frames;
}

function sse(type, data) {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
}

/**
 * Extract the final Clear source from a claude stream-json buffer. Scans
 * the event log for `meph_edit_code` tool_use calls with action="write",
 * returns the LAST one's `code` field (or null if Meph made no edits).
 *
 * This is how Studio's /api/chat learns the final source after an
 * autonomous cc-agent turn — Claude Code's MCP child owns the mid-turn
 * source state, but the edits are visible in the stream-json event log
 * so we don't need an IPC back-channel. cc-agent.js calls this at the
 * end of the turn and mirrors the result into /api/chat's closure
 * (via a sidecar on the Response object — see cc-agent.js).
 *
 * @param {string} ndjsonBuffer - accumulated stdout from claude
 * @returns {string|null} final source after the last meph_edit_code write
 */
export function extractFinalSourceFromStreamJson(ndjsonBuffer) {
  let lastWrite = null;
  for (const line of ndjsonBuffer.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let event;
    try { event = JSON.parse(trimmed); } catch { continue; }
    if (event?.type !== 'assistant') continue;
    const blocks = event.message?.content;
    if (!Array.isArray(blocks)) continue;
    for (const block of blocks) {
      if (block?.type !== 'tool_use') continue;
      // MCP tool names get prefixed with mcp__<server>__ by Claude Code.
      // We exposed the tool as `meph_edit_code` in our tools.js registry,
      // so the final name is `mcp__meph__meph_edit_code`. Match both the
      // bare Meph name and the prefixed version for forward-compat.
      const isEdit = block.name === 'meph_edit_code'
                  || block.name === 'mcp__meph__meph_edit_code';
      if (!isEdit) continue;
      const input = block.input || {};
      if (input.action === 'write' && typeof input.code === 'string') {
        lastWrite = input.code;
      }
    }
  }
  return lastWrite;
}
