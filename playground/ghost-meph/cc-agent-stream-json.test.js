// =============================================================================
// cc-agent STREAM-JSON PARSER — unit tests
// =============================================================================
// Verifies the Claude Code stream-json → Anthropic SSE translation pipeline.
// Pure function tests with synthesized events — no subprocess, no claude CLI,
// no MCP bridge. If Claude Code's stream-json shape evolves, update these
// fixtures first, then fix the parser until the tests pass.
//
// Run: node playground/ghost-meph/cc-agent-stream-json.test.js
// =============================================================================

import { translateStreamJsonEvent, translateStreamJsonBuffer } from './cc-agent-stream-json.js';

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

/** Parse an SSE frame string back into its {event, data} shape for assertion. */
function parseSse(frame) {
  const eventMatch = frame.match(/^event: (\w+)/);
  const dataMatch = frame.match(/\ndata: (.+)\n\n$/);
  return {
    event: eventMatch?.[1],
    data: dataMatch ? JSON.parse(dataMatch[1]) : null,
  };
}

console.log('\n📡 translateStreamJsonEvent — event-by-event translation\n');

// ── system/init → message_start ───────────────────────────────────────
{
  const state = { nextBlockIndex: 0, messageStarted: false };
  const frames = translateStreamJsonEvent(
    { type: 'system', subtype: 'init', session_id: 's1', tools: ['meph_compile'] },
    state
  );
  assert(frames.length === 1, `system/init emits exactly 1 frame (got ${frames.length})`);
  const parsed = parseSse(frames[0]);
  assert(parsed.event === 'message_start',
    `system/init emits message_start (got ${parsed.event})`);
  assert(parsed.data.message.role === 'assistant',
    'message_start carries an assistant-role message skeleton');
  assert(state.messageStarted === true,
    'state.messageStarted flips to true after the first message_start');
}

// ── Duplicate system/init: no second message_start ────────────────────
{
  const state = { nextBlockIndex: 0, messageStarted: true };
  const frames = translateStreamJsonEvent(
    { type: 'system', subtype: 'init' },
    state
  );
  assert(frames.length === 0,
    'subsequent system/init events (same turn) emit NO frames — avoids double message_start');
}

// ── assistant text block → text_delta content blocks ─────────────────
{
  const state = { nextBlockIndex: 0, messageStarted: true };
  const frames = translateStreamJsonEvent(
    {
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Hello world' }] },
    },
    state
  );
  assert(frames.length === 3,
    `assistant text emits 3 frames (start + delta + stop) — got ${frames.length}`);
  const [start, delta, stop] = frames.map(parseSse);
  assert(start.event === 'content_block_start' && start.data.content_block.type === 'text',
    'content_block_start carries type=text');
  assert(start.data.index === 0, 'first text block is index 0');
  assert(delta.event === 'content_block_delta' && delta.data.delta.type === 'text_delta',
    'content_block_delta carries type=text_delta');
  assert(delta.data.delta.text === 'Hello world',
    'text_delta contains the assistant text');
  assert(stop.event === 'content_block_stop' && stop.data.index === 0,
    'content_block_stop matches the start index');
  assert(state.nextBlockIndex === 1,
    'nextBlockIndex advances after a text block');
}

// ── assistant tool_use block → tool_use content blocks ───────────────
{
  const state = { nextBlockIndex: 0, messageStarted: true };
  const frames = translateStreamJsonEvent(
    {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{
          type: 'tool_use',
          id: 'toolu_abc',
          name: 'meph_compile',
          input: { include_compiled: true },
        }],
      },
    },
    state
  );
  assert(frames.length === 3,
    `tool_use emits 3 frames (start + delta + stop) — got ${frames.length}`);
  const [start, delta, stop] = frames.map(parseSse);
  assert(start.data.content_block.type === 'tool_use',
    'content_block_start carries type=tool_use');
  assert(start.data.content_block.id === 'toolu_abc',
    'tool_use content_block carries the id');
  assert(start.data.content_block.name === 'meph_compile',
    'tool_use content_block carries the name');
  // Input starts empty; the full input comes through the delta.
  assert(JSON.stringify(start.data.content_block.input) === '{}',
    'content_block_start tool_use input is empty ({}) — matches Anthropic stream shape');
  assert(delta.data.delta.type === 'input_json_delta',
    'delta is input_json_delta');
  assert(JSON.parse(delta.data.delta.partial_json).include_compiled === true,
    'input_json_delta.partial_json round-trips the tool input');
  assert(stop.data.index === start.data.index,
    'content_block_stop matches content_block_start index');
}

// ── multi-block assistant message: indices increment ─────────────────
{
  const state = { nextBlockIndex: 0, messageStarted: true };
  const frames = translateStreamJsonEvent(
    {
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Let me check.' },
          { type: 'tool_use', id: 'toolu_1', name: 'meph_read_file', input: { filename: 'SYNTAX.md' } },
        ],
      },
    },
    state
  );
  const parsed = frames.map(parseSse);
  // Expect 6 frames: 3 for text (idx 0) + 3 for tool_use (idx 1)
  assert(frames.length === 6,
    `multi-block emits 6 frames (3 text + 3 tool_use) — got ${frames.length}`);
  assert(parsed[0].data.index === 0 && parsed[2].data.index === 0,
    'text block frames use index 0');
  assert(parsed[3].data.index === 1 && parsed[5].data.index === 1,
    'tool_use block frames use index 1');
  assert(state.nextBlockIndex === 2,
    'nextBlockIndex advances past both blocks');
}

// ── user/tool_result → SKIPPED (tools already ran in MCP child) ──────
{
  const state = { nextBlockIndex: 3, messageStarted: true };
  const frames = translateStreamJsonEvent(
    {
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'file content' }],
      },
    },
    state
  );
  assert(frames.length === 0,
    `user/tool_result emits 0 frames — tool already ran in MCP child, skipping avoids re-execution`);
  assert(state.nextBlockIndex === 3,
    'nextBlockIndex does NOT advance on skipped events');
}

// ── result → message_delta(end_turn) + message_stop ──────────────────
{
  const state = { nextBlockIndex: 2, messageStarted: true };
  const frames = translateStreamJsonEvent(
    {
      type: 'result',
      subtype: 'success',
      total_cost_usd: 0.05,
      usage: { input_tokens: 1500, output_tokens: 300 },
    },
    state
  );
  assert(frames.length === 2,
    `result emits 2 frames (message_delta + message_stop) — got ${frames.length}`);
  const [mdelta, mstop] = frames.map(parseSse);
  assert(mdelta.event === 'message_delta', 'first frame is message_delta');
  assert(mdelta.data.delta.stop_reason === 'end_turn',
    `message_delta.delta.stop_reason === "end_turn" — critical: tells /api/chat's loop to SKIP tool execution (tools ran in MCP child already). got ${mdelta.data.delta.stop_reason}`);
  assert(mstop.event === 'message_stop', 'second frame is message_stop');
  assert(mdelta.data.usage.input_tokens === 1500,
    'message_delta.usage carries through the input_tokens');
}

// ── unknown event type → silently ignored ─────────────────────────────
{
  const state = { nextBlockIndex: 0, messageStarted: true };
  const frames = translateStreamJsonEvent(
    { type: 'some_future_claude_code_event', data: 'whatever' },
    state
  );
  assert(frames.length === 0,
    'unknown event types silently ignored — forward-compat for new claude versions');
}

// ── non-object event → silently ignored ───────────────────────────────
{
  const state = { nextBlockIndex: 0, messageStarted: true };
  assert(translateStreamJsonEvent(null, state).length === 0,
    'null event returns empty frames');
  assert(translateStreamJsonEvent('string', state).length === 0,
    'string event returns empty frames');
}

console.log('\n📝 translateStreamJsonBuffer — full NDJSON buffer translation\n');

// ── Full happy-path flow: init → text → tool_use → text → result ─────
{
  const ndjson = [
    JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess1', tools: ['meph_read_file'] }),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: "I'll read the docs." }] } }),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tu_1', name: 'meph_read_file', input: { filename: 'SYNTAX.md' } }] } }),
    JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: '# Syntax docs' }] } }),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Found it.' }] } }),
    JSON.stringify({ type: 'result', subtype: 'success', total_cost_usd: 0.02, usage: { input_tokens: 500, output_tokens: 50 } }),
  ].join('\n');
  const frames = translateStreamJsonBuffer(ndjson);
  // Expected frames:
  //   1 message_start
  //   3 text (I'll read the docs.)
  //   3 tool_use
  //   [SKIPPED — user/tool_result]
  //   3 text (Found it.)
  //   2 result (message_delta + message_stop)
  // Total: 12
  assert(frames.length === 12,
    `happy-path produces 12 SSE frames (got ${frames.length})`);
  const types = frames.map(f => parseSse(f).event);
  assert(types[0] === 'message_start', 'first frame is message_start');
  assert(types[types.length - 1] === 'message_stop', 'last frame is message_stop');
  const last2 = frames.slice(-2).map(parseSse);
  assert(last2[0].data.delta.stop_reason === 'end_turn',
    'final message_delta carries stop_reason=end_turn — /api/chat loop terminates without re-executing tools');
  // Confirm block indices advance correctly
  const contentStarts = frames.filter(f => parseSse(f).event === 'content_block_start').map(parseSse);
  assert(contentStarts[0].data.index === 0 && contentStarts[1].data.index === 1 && contentStarts[2].data.index === 2,
    `block indices advance 0→1→2 across text+tool+text (got ${contentStarts.map(c => c.data.index).join(',')})`);
}

// ── Missing system/init: buffer synthesizes message_start at the top ──
{
  const ndjson = [
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hi' }] } }),
    JSON.stringify({ type: 'result', subtype: 'success' }),
  ].join('\n');
  const frames = translateStreamJsonBuffer(ndjson);
  const first = parseSse(frames[0]);
  assert(first.event === 'message_start',
    'buffer synthesizes message_start when no system/init event present (keeps SSE well-formed)');
}

// ── Missing result: buffer synthesizes end_turn at the end ────────────
{
  const ndjson = [
    JSON.stringify({ type: 'system', subtype: 'init' }),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Crash mid-stream' }] } }),
    // No result event — simulate claude process killed
  ].join('\n');
  const frames = translateStreamJsonBuffer(ndjson);
  const last2 = frames.slice(-2).map(parseSse);
  assert(last2[1].event === 'message_stop',
    'buffer synthesizes message_stop when result event missing (no hang on truncated stream)');
  assert(last2[0].data.delta.stop_reason === 'end_turn',
    'synthesized message_delta carries end_turn stop_reason');
}

// ── Malformed line: skipped, doesn't break the pipeline ───────────────
{
  const ndjson = [
    JSON.stringify({ type: 'system', subtype: 'init' }),
    'THIS IS NOT JSON',  // malformed line
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Still works' }] } }),
    JSON.stringify({ type: 'result', subtype: 'success' }),
  ].join('\n');
  const frames = translateStreamJsonBuffer(ndjson);
  const textDeltas = frames.filter(f => f.includes('"type":"text_delta"'));
  assert(textDeltas.length === 1, 'malformed line is skipped; valid events still produce SSE');
  assert(textDeltas[0].includes('Still works'),
    'text content survives the malformed-line skip');
}

// ── Empty buffer: still produces message_start + message_delta + message_stop ──
{
  const frames = translateStreamJsonBuffer('');
  const types = frames.map(f => parseSse(f).event);
  assert(types.includes('message_start') && types.includes('message_stop'),
    'empty buffer still produces a minimal valid SSE sequence');
  assert(types.includes('message_delta'),
    'empty buffer includes a message_delta for stop_reason');
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
