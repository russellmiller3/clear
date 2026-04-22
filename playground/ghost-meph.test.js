// =============================================================================
// GHOST MEPH ROUTER — UNIT TESTS
// =============================================================================
// Verifies GM-1: env-gated routing works, the stub returns Anthropic-shaped
// SSE events, and the stub never makes HTTP calls (so it's safe to run
// without an API key and without spending budget).
//
// Run: node playground/ghost-meph.test.js
// =============================================================================

import {
  isGhostMephActive,
  getBackendId,
  fetchViaBackend,
  buildSSEEvents,
} from './ghost-meph/router.js';

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

async function streamToString(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

function parseSSE(text) {
  const events = [];
  for (const block of text.split('\n\n')) {
    const lines = block.split('\n').filter(Boolean);
    let event = null, data = null;
    for (const line of lines) {
      if (line.startsWith('event: ')) event = line.slice(7);
      else if (line.startsWith('data: ')) data = JSON.parse(line.slice(6));
    }
    if (data) events.push({ event, data });
  }
  return events;
}

(async () => {
  console.log('\n📦 Ghost Meph router\n');

  // =========================================================================
  // PHASE 1 — env-gate
  // =========================================================================
  console.log('🚪 Phase 1 — env gate');

  delete process.env.MEPH_BRAIN;
  assert(isGhostMephActive() === false, 'isGhostMephActive() false when MEPH_BRAIN unset');
  assert(getBackendId() === null, 'getBackendId() null when MEPH_BRAIN unset');

  process.env.MEPH_BRAIN = '';
  assert(isGhostMephActive() === false, 'isGhostMephActive() false when MEPH_BRAIN is empty string');

  process.env.MEPH_BRAIN = '   ';
  assert(isGhostMephActive() === false, 'isGhostMephActive() false when MEPH_BRAIN is whitespace');

  process.env.MEPH_BRAIN = 'cc-agent';
  assert(isGhostMephActive() === true, 'isGhostMephActive() true when MEPH_BRAIN=cc-agent');
  assert(getBackendId() === 'cc-agent', 'getBackendId() returns "cc-agent"');

  process.env.MEPH_BRAIN = '  CC-Agent  ';
  assert(getBackendId() === 'cc-agent', 'getBackendId() trims and lowercases');

  // =========================================================================
  // PHASE 2 — SSE event shape
  // =========================================================================
  console.log('\n📡 Phase 2 — SSE event shape (Anthropic protocol fidelity)');

  const events = parseSSE(buildSSEEvents('hello world').join(''));
  assert(events.length === 6, `6 SSE events emitted (got ${events.length})`);
  assert(events[0].data.type === 'message_start', 'first event is message_start');
  assert(events[0].data.message.role === 'assistant', 'message_start has role=assistant');
  assert(events[0].data.message.model === 'ghost-meph-stub', 'message_start declares model=ghost-meph-stub');
  assert(events[1].data.type === 'content_block_start', 'second event is content_block_start');
  assert(events[1].data.content_block.type === 'text', 'content block is type=text');
  assert(events[2].data.type === 'content_block_delta', 'third event is content_block_delta');
  assert(events[2].data.delta.type === 'text_delta', 'delta type is text_delta');
  assert(events[2].data.delta.text === 'hello world', 'delta text matches input');
  assert(events[3].data.type === 'content_block_stop', 'fourth event is content_block_stop');
  assert(events[4].data.type === 'message_delta', 'fifth event is message_delta');
  assert(events[4].data.delta.stop_reason === 'end_turn',
    'message_delta has stop_reason=end_turn (critical — without this, /api/chat tool loop spins until iteration cap)');
  assert(events[5].data.type === 'message_stop', 'sixth event is message_stop');

  // =========================================================================
  // PHASE 3 — fetchViaBackend returns Anthropic-shaped Response
  // =========================================================================
  console.log('\n🔌 Phase 3 — fetchViaBackend response envelope');

  // Use 'haiku-dev' here — it's a registered backend in the dispatch table
  // but doesn't have its own implementation yet (GM-3/4-style backends),
  // so it falls through to the stub. cc-agent now hits the real
  // chatViaClaudeCode (tested in Phase 6), so it's no longer a stub asserter.
  process.env.MEPH_BRAIN = 'haiku-dev';
  const r = await fetchViaBackend({ model: 'haiku', max_tokens: 100, messages: [{ role: 'user', content: 'hi' }] }, {});
  assert(r.ok === true, 'response.ok is true');
  assert(r.status === 200, 'response.status is 200');
  assert(typeof r.body !== 'undefined' && r.body !== null, 'response has a body');
  assert(typeof r.body.getReader === 'function', 'response.body is a ReadableStream (has getReader)');

  const body = await streamToString(r.body);
  const parsed = parseSSE(body);
  assert(parsed.length === 6, `streamed body parses to 6 SSE events (got ${parsed.length})`);
  const stopEvent = parsed.find(e => e.data.type === 'message_delta');
  assert(!!stopEvent, 'stream contains message_delta event');
  assert(stopEvent.data.delta.stop_reason === 'end_turn', 'streamed message_delta has stop_reason=end_turn');

  const textEvent = parsed.find(e => e.data.type === 'content_block_delta');
  assert(textEvent.data.delta.text.includes('Ghost Meph stub'), 'stub text identifies itself');
  assert(textEvent.data.delta.text.includes('haiku-dev'), 'stub text echoes selected MEPH_BRAIN value');

  // =========================================================================
  // PHASE 4 — unknown backends still respond (don't crash server)
  // =========================================================================
  console.log('\n⚠️  Phase 4 — unknown backend handling');

  process.env.MEPH_BRAIN = 'fake-backend-xyz';
  const r2 = await fetchViaBackend({ model: 'x', max_tokens: 1, messages: [] }, {});
  assert(r2.ok === true, 'unknown backend still returns ok=true (no crash)');
  const parsed2 = parseSSE(await streamToString(r2.body));
  const text2 = parsed2.find(e => e.data.type === 'content_block_delta')?.data.delta.text || '';
  assert(text2.includes('unknown:fake-backend-xyz'),
    'unknown-backend stub message names the unknown brain so debugging is obvious');
  assert(parsed2.find(e => e.data.type === 'message_delta')?.data.delta.stop_reason === 'end_turn',
    'unknown backend still emits stop_reason=end_turn (no infinite loop in /api/chat)');

  // =========================================================================
  // PHASE 5 — text() helper returns same content as streamed body
  // =========================================================================
  console.log('\n📜 Phase 5 — text() helper');

  process.env.MEPH_BRAIN = 'cc-agent';
  const r3 = await fetchViaBackend({}, {});
  const t = await r3.text();
  const tParsed = parseSSE(t);
  assert(tParsed.length === 6, `r.text() yields 6 events (got ${tParsed.length})`);
  assert(tParsed[4].data.delta.stop_reason === 'end_turn',
    'r.text() stop_reason matches streamed body');

  // =========================================================================
  // PHASE 6 — cc-agent backend wiring (GM-2 MVP)
  // We test only the deterministic paths that don't require the `claude`
  // CLI to be installed: empty payload -> graceful stub message, and
  // missing-binary -> graceful Anthropic-shaped error stream.
  // =========================================================================
  console.log('\n🤖 Phase 6 — cc-agent backend (GM-2 MVP)');

  process.env.MEPH_BRAIN = 'cc-agent';
  // Empty payload: no user message → returns a clear "no user message" stub
  // wrapped as a normal Anthropic SSE response (same envelope, no exception).
  const r4 = await fetchViaBackend({ messages: [] }, {});
  assert(r4.ok === true, 'cc-agent with empty payload still returns ok=true');
  const body4 = await streamToString(r4.body);
  const parsed4 = parseSSE(body4);
  const text4 = parsed4.find(e => e.data.type === 'content_block_delta')?.data.delta.text || '';
  assert(text4.includes('no user message'), 'cc-agent surfaces the empty-payload case in plain English');
  assert(parsed4.find(e => e.data.type === 'message_delta')?.data.delta.stop_reason === 'end_turn',
    'cc-agent empty-payload response carries stop_reason=end_turn');

  // Missing-binary path: temporarily break PATH so spawn('claude') fails,
  // then verify we get an Anthropic-shaped error stream (not a thrown exception).
  // Skip this test if `claude` is on PATH for real — we can't guarantee the
  // spawn fails. Only assert behavior when we've actively broken PATH.
  const origPath = process.env.PATH;
  process.env.PATH = '/nonexistent-bin-dir-for-cc-agent-test';
  const r5 = await fetchViaBackend(
    { messages: [{ role: 'user', content: 'hello' }] },
    {},
  );
  process.env.PATH = origPath;
  assert(r5.ok === true, 'cc-agent with missing `claude` binary still returns ok=true (no thrown exception)');
  const text5 = parseSSE(await streamToString(r5.body)).find(e => e.data.type === 'content_block_delta')?.data.delta.text || '';
  assert(text5.includes('cc-agent error'), 'cc-agent error message is named and surfaced to caller');
  assert(text5.includes('claude') || text5.includes('CLI'),
    'cc-agent error message mentions the missing CLI');

  // =========================================================================
  // PHASE 7 — format-bridge (Anthropic ↔ OpenAI translation, GM-4 prereq)
  // =========================================================================
  console.log('\n🌉 Phase 7 — format-bridge (Anthropic ↔ OpenAI)');

  const { anthropicToOpenAI, accumulateOpenAIText, wrapOpenAIJsonAsAnthropicSSE } =
    await import('./ghost-meph/format-bridge.js');

  // anthropicToOpenAI: string content
  const oai1 = anthropicToOpenAI({
    model: 'haiku',
    max_tokens: 100,
    messages: [{ role: 'user', content: 'hello' }],
  });
  assert(oai1.model === 'haiku', 'anthropicToOpenAI preserves model');
  assert(oai1.max_tokens === 100, 'anthropicToOpenAI preserves max_tokens');
  assert(oai1.messages.length === 1 && oai1.messages[0].content === 'hello',
    'anthropicToOpenAI passes string content unchanged');

  // anthropicToOpenAI: system as string AND content array
  const oai2 = anthropicToOpenAI({
    model: 'm', system: 'be concise',
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'hi' }, { type: 'text', text: 'there' }] },
    ],
  });
  assert(oai2.messages[0].role === 'system' && oai2.messages[0].content === 'be concise',
    'anthropicToOpenAI prepends system message when system is a string');
  assert(oai2.messages[1].content === 'hi\nthere',
    'anthropicToOpenAI flattens content array of text blocks');

  // anthropicToOpenAI: system as array of blocks
  const oai3 = anthropicToOpenAI({
    model: 'm',
    system: [{ type: 'text', text: 'block1' }, { type: 'text', text: 'block2' }],
    messages: [{ role: 'user', content: 'x' }],
  });
  assert(oai3.messages[0].content === 'block1\n\nblock2',
    'anthropicToOpenAI flattens system array form (cache_control style) to joined text');

  // anthropicToOpenAI: drops tool_use blocks (text-only MVP)
  const oai4 = anthropicToOpenAI({
    model: 'm',
    messages: [{
      role: 'assistant',
      content: [
        { type: 'text', text: 'thinking' },
        { type: 'tool_use', id: 't1', name: 'edit_code', input: {} },
      ],
    }],
  });
  assert(oai4.messages[0].content === 'thinking',
    'anthropicToOpenAI drops tool_use blocks for text-only MVP (tool support is GM-2 follow-up)');

  // accumulateOpenAIText: drains a real ReadableStream of OpenAI SSE chunks
  const enc = new TextEncoder();
  const oaiStream = new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode('data: ' + JSON.stringify({ choices: [{ delta: { content: 'Hel' } }] }) + '\n\n'));
      controller.enqueue(enc.encode('data: ' + JSON.stringify({ choices: [{ delta: { content: 'lo!' } }] }) + '\n\n'));
      controller.enqueue(enc.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  const accumulated = await accumulateOpenAIText(oaiStream);
  assert(accumulated === 'Hello!', `accumulateOpenAIText concatenates delta chunks (got "${accumulated}")`);

  // wrapOpenAIJsonAsAnthropicSSE: non-streaming response
  const wrapped = wrapOpenAIJsonAsAnthropicSSE({
    choices: [{ message: { content: 'final response' } }],
  });
  const wrappedText = parseSSE(await wrapped.text())
    .find(e => e.data.type === 'content_block_delta')?.data.delta.text;
  assert(wrappedText === 'final response',
    'wrapOpenAIJsonAsAnthropicSSE extracts non-streaming choices[0].message.content');

  // =========================================================================
  // PHASE 8 — ollama backend (GM-4)
  // We can't depend on a real ollama daemon being installed in test
  // environments, so we test the deterministic paths: model resolution,
  // ECONNREFUSED handling, and the brain-string-to-model parsing.
  // =========================================================================
  console.log('\n🦙 Phase 8 — ollama backend (GM-4)');

  // Brain string parsing test — uses the router dispatch path end-to-end.
  // OLLAMA_HOST set to a port nothing listens on → ECONNREFUSED → graceful error.
  const origHost = process.env.OLLAMA_HOST;
  process.env.OLLAMA_HOST = 'http://127.0.0.1:1';  // port 1 reserved, will refuse
  process.env.MEPH_BRAIN = 'ollama:qwen3';
  const r6 = await fetchViaBackend({ messages: [{ role: 'user', content: 'hi' }] }, {});
  assert(r6.ok === true, 'ollama with refused connection still returns ok=true (no thrown exception)');
  const text6 = parseSSE(await streamToString(r6.body)).find(e => e.data.type === 'content_block_delta')?.data.delta.text || '';
  assert(text6.includes('ollama'), 'ollama error message names the backend');
  // Either "not running" (ECONNREFUSED) or "error:" (some other network failure)
  assert(text6.includes('not running') || text6.includes('error') || text6.includes('HTTP'),
    `ollama error message surfaces failure mode (got: ${text6.slice(0, 150)})`);
  assert(parseSSE(await wrapped.text()).find(e => e.data.type === 'message_delta')?.data.delta.stop_reason === 'end_turn',
    'wrapped helper carries stop_reason=end_turn');

  // Brain-string variant: 'ollama:llama3:8b' should still route (colon in model name)
  process.env.MEPH_BRAIN = 'ollama:llama3:8b';
  const r7 = await fetchViaBackend({ messages: [{ role: 'user', content: 'hi' }] }, {});
  assert(r7.ok === true, 'ollama with colon-bearing model name still routes (no parse error)');

  // Restore env
  if (origHost === undefined) delete process.env.OLLAMA_HOST;
  else process.env.OLLAMA_HOST = origHost;

  // Cleanup
  delete process.env.MEPH_BRAIN;

  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
